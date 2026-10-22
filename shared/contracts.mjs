import { assertExactKeys, isPlainObject, validateContext } from "./validation.mjs";

export const DOMAIN = "embargo.report.v1";

export const VENDORS = Object.freeze([
  Object.freeze({ id: "kettle", name: "Kettle Health", role: "vendor-kettle" }),
  Object.freeze({ id: "acme", name: "Acme Bank", role: "vendor-acme" }),
]);

export const SEVERITIES = Object.freeze(["low", "medium", "high", "critical"]);
export const STATUSES = Object.freeze(["received", "triaged", "fixed"]);

const CONTEXT_KEYS = Object.freeze([
  "domain",
  "realm",
  "reportId",
  "revision",
  "assignmentId",
  "vendorId",
  "ownerIss",
  "ownerSub",
  "writerKey",
]);

const REPORT_KEYS = Object.freeze([...CONTEXT_KEYS, "title", "severity", "details", "poc"]);

function validateReportFields(fields) {
  assertExactKeys(fields, ["title", "severity", "details", "poc"], "report fields");
  if (typeof fields.title !== "string" || fields.title.length < 1 || fields.title.length > 160) {
    throw new Error("title must be 1..160 characters");
  }
  if (!SEVERITIES.includes(fields.severity)) throw new Error("severity is not recognised");
  if (typeof fields.details !== "string" || fields.details.length < 1 || fields.details.length > 65536) {
    throw new Error("details must be 1..65536 characters");
  }
  if (typeof fields.poc !== "string" || fields.poc.length > 65536) {
    throw new Error("poc must be 0..65536 characters");
  }
}

export function buildPlaintextReport(context, fields) {
  validateContext(context);
  if (!isPlainObject(fields)) throw new Error("report fields must be a plain object");
  validateReportFields(fields);
  return JSON.stringify({
    ...context,
    title: fields.title,
    severity: fields.severity,
    details: fields.details,
    poc: fields.poc,
  });
}

export function parseDecryptedReport(text, expectedContext) {
  validateContext(expectedContext);
  if (typeof text !== "string") throw new Error("decrypted report must be text");
  if (text.length === 0 || text.length > 262144) throw new Error("decrypted report size is invalid");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("decrypted report is not valid JSON");
  }
  if (!isPlainObject(parsed)) throw new Error("decrypted report must be an object");
  assertExactKeys(parsed, REPORT_KEYS, "decrypted report");
  validateReportFields({
    title: parsed.title,
    severity: parsed.severity,
    details: parsed.details,
    poc: parsed.poc,
  });
  for (const key of CONTEXT_KEYS) {
    if (parsed[key] !== expectedContext[key]) {
      throw new Error(`decrypted report context mismatch: ${key}`);
    }
  }
  return parsed;
}
