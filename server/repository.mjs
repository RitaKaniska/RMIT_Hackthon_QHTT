import { DatabaseSync } from "node:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ApiError } from "./errors.mjs";

const SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS drafts (
  assignment_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  realm TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  owner_iss TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  writer_key TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state_version INTEGER NOT NULL CHECK (state_version >= 1),
  write_policy TEXT,
  read_policy TEXT,
  write_request TEXT,
  read_request TEXT,
  submitted INTEGER NOT NULL DEFAULT 0 CHECK (submitted IN (0, 1)),
  UNIQUE (realm, report_id, revision)
);

CREATE INDEX IF NOT EXISTS drafts_owner_idx ON drafts (realm, owner_iss, owner_sub);
CREATE INDEX IF NOT EXISTS drafts_created_idx ON drafts (realm, created_at);

CREATE TABLE IF NOT EXISTS reports (
  assignment_id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  realm TEXT NOT NULL,
  vendor_id TEXT NOT NULL,
  owner_iss TEXT NOT NULL,
  owner_sub TEXT NOT NULL,
  writer_key TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'triaged', 'fixed')),
  state_version INTEGER NOT NULL CHECK (state_version >= 1),
  ciphertext TEXT NOT NULL,
  read_policy TEXT NOT NULL,
  UNIQUE (realm, report_id, revision)
);

CREATE INDEX IF NOT EXISTS reports_vendor_idx ON reports (realm, vendor_id);
CREATE INDEX IF NOT EXISTS reports_owner_idx ON reports (realm, owner_iss, owner_sub);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  realm TEXT NOT NULL,
  actor_iss TEXT NOT NULL,
  actor_sub TEXT NOT NULL,
  assignment_id TEXT,
  action TEXT NOT NULL,
  detail TEXT
);

CREATE INDEX IF NOT EXISTS activity_realm_idx ON activity (realm, id);
`;

function parseContext(row) {
  const context = JSON.parse(row.context_json);
  return context;
}

function draftFromRow(row, includeRequests) {
  return {
    context: parseContext(row),
    createdAt: row.created_at,
    stateVersion: row.state_version,
    writePolicy: row.write_policy ?? null,
    readPolicy: row.read_policy ?? null,
    writeRequest: includeRequests ? (row.write_request ?? null) : null,
    readRequest: includeRequests ? (row.read_request ?? null) : null,
    submitted: row.submitted === 1,
  };
}

function reportFromRow(row) {
  return {
    context: parseContext(row),
    createdAt: row.created_at,
    status: row.status,
    stateVersion: row.state_version,
    ciphertext: row.ciphertext,
    readPolicy: row.read_policy,
  };
}

function reportMetadataFromRow(row) {
  return {
    context: parseContext(row),
    createdAt: row.created_at,
    status: row.status,
    stateVersion: row.state_version,
  };
}

function activityFromRow(row) {
  return {
    id: row.id,
    at: row.at,
    action: row.action,
    assignmentId: row.assignment_id,
    actorIss: row.actor_iss,
    actorSub: row.actor_sub,
    detail: row.detail,
    tamperproof: false,
  };
}

export class Repository {
  constructor(path, { now = () => new Date().toISOString() } = {}) {
    this.path = path;
    this.now = now;
    if (path !== ":memory:") {
      mkdirSync(dirname(resolve(path)), { recursive: true, mode: 0o700 });
    }
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.migrate();
    if (path !== ":memory:") {
      try {
        chmodSync(path, 0o600);
      } catch {
        // Best effort: the database may live on a filesystem without POSIX modes.
      }
    }
  }

  migrate() {
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    if (version > SCHEMA_VERSION) {
      throw new Error(`Database schema ${version} is newer than this application supports`);
    }
    if (version === SCHEMA_VERSION) return;
    this.transaction(() => {
      this.db.exec(DDL);
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    });
  }

  transaction(fn) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // Preserve the original failure.
      }
      throw error;
    }
  }

  recordActivity(realm, actor, assignmentId, action, detail = null) {
    this.db
      .prepare(
        "INSERT INTO activity (at, realm, actor_iss, actor_sub, assignment_id, action, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(this.now(), realm, actor.iss, actor.sub, assignmentId, action, detail);
  }

  createDraft({ context, actor }) {
    return this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO drafts
            (assignment_id, report_id, revision, realm, vendor_id, owner_iss, owner_sub, writer_key,
             context_json, created_at, state_version, write_policy, read_policy, write_request, read_request, submitted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NULL, NULL, NULL, NULL, 0)`,
        )
        .run(
          context.assignmentId,
          context.reportId,
          context.revision,
          context.realm,
          context.vendorId,
          context.ownerIss,
          context.ownerSub,
          context.writerKey,
          JSON.stringify(context),
          this.now(),
        );
      this.recordActivity(context.realm, actor, context.assignmentId, "draft.created");
      return this.getDraft(context.assignmentId);
    });
  }

  getDraft(assignmentId) {
    const row = this.db.prepare("SELECT * FROM drafts WHERE assignment_id = ?").get(assignmentId);
    return row ? draftFromRow(row, true) : null;
  }

  listDraftsForRealm(realm) {
    return this.db
      .prepare("SELECT * FROM drafts WHERE realm = ? ORDER BY created_at DESC, assignment_id DESC")
      .all(realm)
      .map((row) => draftFromRow(row, true));
  }

  listDraftsForOwner(realm, ownerIss, ownerSub) {
    return this.db
      .prepare(
        "SELECT * FROM drafts WHERE realm = ? AND owner_iss = ? AND owner_sub = ? ORDER BY created_at DESC, assignment_id DESC",
      )
      .all(realm, ownerIss, ownerSub)
      .map((row) => draftFromRow(row, false));
  }

  updateDraftPolicy({ assignmentId, realm, kind, policy, expectedVersion, actor }) {
    if (kind !== "write" && kind !== "read") throw new ApiError(400, "INVALID_KIND", "kind must be write or read");
    const column = kind === "write" ? "write_policy" : "read_policy";
    const requestColumn = kind === "write" ? "write_request" : "read_request";
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM drafts WHERE assignment_id = ? AND realm = ?")
        .get(assignmentId, realm);
      if (!row) throw new ApiError(404, "NOT_FOUND", "Draft not found");
      if (row.submitted === 1) {
        throw new ApiError(409, "DRAFT_LOCKED", "Signed grants cannot be replaced after submission");
      }
      if (row.state_version !== expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "Draft version has changed");
      }
      this.db
        .prepare(
          `UPDATE drafts SET ${column} = ?, ${requestColumn} = NULL, state_version = state_version + 1 WHERE assignment_id = ?`,
        )
        .run(policy, assignmentId);
      this.recordActivity(realm, actor, assignmentId, "policy.set", `kind=${kind}`);
      return draftFromRow(
        this.db.prepare("SELECT * FROM drafts WHERE assignment_id = ?").get(assignmentId),
        true,
      );
    });
  }

  updateDraftRequest({ assignmentId, realm, kind, request, expectedVersion, actor }) {
    if (kind !== "write" && kind !== "read") throw new ApiError(400, "INVALID_KIND", "kind must be write or read");
    const column = kind === "write" ? "write_request" : "read_request";
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM drafts WHERE assignment_id = ? AND realm = ?")
        .get(assignmentId, realm);
      if (!row) throw new ApiError(404, "NOT_FOUND", "Draft not found");
      if (row.submitted === 1) {
        throw new ApiError(409, "DRAFT_LOCKED", "Drafts are locked after submission");
      }
      if (row.state_version !== expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "Draft version has changed");
      }
      this.db
        .prepare(`UPDATE drafts SET ${column} = ?, state_version = state_version + 1 WHERE assignment_id = ?`)
        .run(request, assignmentId);
      this.recordActivity(realm, actor, assignmentId, request === null ? "request.clear" : "request.set", `kind=${kind}`);
      return draftFromRow(
        this.db.prepare("SELECT * FROM drafts WHERE assignment_id = ?").get(assignmentId),
        true,
      );
    });
  }

  submitReport({ assignmentId, realm, ownerIss, ownerSub, ciphertext, actor }) {
    return this.transaction(() => {
      const draft = this.db
        .prepare("SELECT * FROM drafts WHERE assignment_id = ? AND realm = ?")
        .get(assignmentId, realm);
      if (!draft) throw new ApiError(404, "NOT_FOUND", "Draft not found");
      if (draft.owner_iss !== ownerIss || draft.owner_sub !== ownerSub) {
        throw new ApiError(403, "FORBIDDEN", "Only the draft owner may submit this report");
      }
      if (draft.submitted === 1) {
        throw new ApiError(409, "REPORT_EXISTS", "This assignment has already been submitted");
      }
      if (!draft.write_policy || !draft.read_policy) {
        throw new ApiError(409, "POLICY_MISSING", "Both signed relationship policies are required");
      }
      if (this.db.prepare("SELECT 1 FROM reports WHERE assignment_id = ?").get(assignmentId)) {
        throw new ApiError(409, "REPORT_EXISTS", "This assignment has already been submitted");
      }
      const createdAt = this.now();
      this.db
        .prepare(
          `INSERT INTO reports
            (assignment_id, report_id, revision, realm, vendor_id, owner_iss, owner_sub, writer_key,
             context_json, created_at, status, state_version, ciphertext, read_policy)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 1, ?, ?)`,
        )
        .run(
          draft.assignment_id,
          draft.report_id,
          draft.revision,
          draft.realm,
          draft.vendor_id,
          draft.owner_iss,
          draft.owner_sub,
          draft.writer_key,
          draft.context_json,
          createdAt,
          ciphertext,
          draft.read_policy,
        );
      this.db
        .prepare("UPDATE drafts SET submitted = 1, state_version = state_version + 1 WHERE assignment_id = ?")
        .run(assignmentId);
      this.recordActivity(realm, actor, assignmentId, "report.submitted");
      return reportFromRow(this.db.prepare("SELECT * FROM reports WHERE assignment_id = ?").get(assignmentId));
    });
  }

  getReport(assignmentId, realm) {
    const row = this.db
      .prepare("SELECT * FROM reports WHERE assignment_id = ? AND realm = ?")
      .get(assignmentId, realm);
    return row ? reportFromRow(row) : null;
  }

  listReportsForVendor(realm, vendorId) {
    return this.db
      .prepare(
        "SELECT * FROM reports WHERE realm = ? AND vendor_id = ? ORDER BY created_at DESC, assignment_id DESC",
      )
      .all(realm, vendorId)
      .map(reportFromRow);
  }

  listReportMetadataForOwner(realm, ownerIss, ownerSub) {
    return this.db
      .prepare(
        "SELECT * FROM reports WHERE realm = ? AND owner_iss = ? AND owner_sub = ? ORDER BY created_at DESC, assignment_id DESC",
      )
      .all(realm, ownerIss, ownerSub)
      .map(reportMetadataFromRow);
  }

  listRawReports(realm) {
    return this.db
      .prepare("SELECT * FROM reports WHERE realm = ? ORDER BY created_at DESC, assignment_id DESC")
      .all(realm)
      .map((row) => ({
        context: parseContext(row),
        createdAt: row.created_at,
        status: row.status,
        stateVersion: row.state_version,
        ciphertext: row.ciphertext,
      }));
  }

  updateReportStatus({ assignmentId, realm, status, expectedVersion, actor }) {
    return this.transaction(() => {
      const row = this.db
        .prepare("SELECT * FROM reports WHERE assignment_id = ? AND realm = ?")
        .get(assignmentId, realm);
      if (!row) throw new ApiError(404, "NOT_FOUND", "Report not found");
      if (row.state_version !== expectedVersion) {
        throw new ApiError(409, "VERSION_CONFLICT", "Report version has changed");
      }
      const next = row.status === "received" ? "triaged" : row.status === "triaged" ? "fixed" : null;
      if (next !== status) {
        throw new ApiError(409, "INVALID_TRANSITION", "Only received -> triaged -> fixed is allowed");
      }
      this.db
        .prepare("UPDATE reports SET status = ?, state_version = state_version + 1 WHERE assignment_id = ?")
        .run(status, assignmentId);
      this.recordActivity(realm, actor, assignmentId, "report.status", `status=${status}`);
      return reportFromRow(this.db.prepare("SELECT * FROM reports WHERE assignment_id = ?").get(assignmentId));
    });
  }

  listActivity(realm, limit = 200) {
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    return this.db
      .prepare("SELECT * FROM activity WHERE realm = ? ORDER BY id DESC LIMIT ?")
      .all(realm, safeLimit)
      .map(activityFromRow);
  }

  check() {
    this.db.prepare("SELECT 1 AS ok").get();
    return true;
  }

  close() {
    this.db.close();
  }
}

export function openRepository(path, options) {
  return new Repository(path, options);
}

export function defaultDatabasePath(env = process.env) {
  return resolve(env.EMBARGO_DB_PATH || "data/embargo.sqlite");
}
