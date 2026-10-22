import { useEffect, useMemo, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import { VENDORS } from "../shared/contracts.mjs";
import {
  ErrorPanel,
  RoleChips,
  Spinner,
} from "./components/ui.jsx";
import Landing from "./views/Landing.jsx";
import { navigate, useApi, useRoute } from "./lib/hooks.js";
import { claimRoles, formatDurationSeconds } from "./lib/util.js";
import Overview from "./views/Overview.jsx";
import SetupView from "./views/SetupView.jsx";
import Researcher from "./views/Researcher.jsx";
import MyReports from "./views/MyReports.jsx";
import VendorInbox from "./views/VendorInbox.jsx";
import Admin from "./views/Admin.jsx";
import Operator from "./views/Operator.jsx";
import Probe from "./views/Probe.jsx";

const KNOWN_APP_ROLES = new Set([
  "researcher",
  "operator",
  "tide-realm-admin",
  "_tide_encryptor",
  "_tide_decryptor",
  ...VENDORS.map((vendor) => vendor.role),
]);

const PAGES = {
  "/": {
    title: "Overview",
    eyebrow: "EMBARGO WORKSPACE",
    component: Overview,
    allowed: () => true,
  },
  "/setup": {
    title: "Setup & checks",
    eyebrow: "CONFIGURATION",
    component: SetupView,
    allowed: () => true,
    props: ["onRefreshSetup", "refreshingSetup", "refreshSetupError"],
  },
  "/research": {
    title: "Researcher workspace",
    eyebrow: "DRAFT & SUBMIT",
    component: Researcher,
    allowed: (identity) => identity.researcher,
    required: "researcher",
  },
  "/reports": {
    title: "My reports",
    eyebrow: "SUBMISSION STATUS",
    component: MyReports,
    allowed: (identity) => identity.researcher,
    required: "researcher",
  },
  "/inbox": {
    title: "Vendor inbox",
    eyebrow: "DECRYPT & TRIAGE",
    component: VendorInbox,
    allowed: (identity) => identity.vendors.length > 0,
    required: "a vendor-* realm role",
  },
  "/admin": {
    title: "Policy signing",
    eyebrow: "GOVERNANCE",
    component: Admin,
    allowed: (identity) => identity.admin,
    required: "tide-realm-admin",
  },
  "/operator": {
    title: "Stored ciphertext",
    eyebrow: "OPERATOR VIEW",
    component: Operator,
    allowed: (identity) => identity.operator,
    required: "operator",
  },
  "/probe": {
    title: "Direct probe",
    eyebrow: "SDK EVIDENCE",
    component: Probe,
    allowed: (identity) => identity.operator || identity.admin,
    required: "operator or tide-realm-admin",
  },
};

function safeRoleCheck(check, role, fallback = false) {
  try {
    return check(role);
  } catch {
    return fallback;
  }
}

function buildIdentity(sdk) {
  const get = (key) => {
    try {
      return sdk.getValueFromToken(key);
    } catch {
      return null;
    }
  };
  const username = typeof get("preferred_username") === "string" ? get("preferred_username") : null;
  const name =
    (typeof get("name") === "string" && get("name")) ||
    username ||
    "Signed-in TideCloak account";
  const iss = typeof get("iss") === "string" ? get("iss") : null;
  const sub = typeof get("sub") === "string" ? get("sub") : null;
  const tideuserkey = typeof get("tideuserkey") === "string" ? get("tideuserkey") : null;
  const realmRoles = claimRoles(get("realm_access"));
  const vendors = VENDORS.filter((vendor) => safeRoleCheck(sdk.hasRealmRole, vendor.role));
  const researcher = safeRoleCheck(sdk.hasRealmRole, "researcher");
  const operator = safeRoleCheck(sdk.hasRealmRole, "operator");
  const admin =
    safeRoleCheck(sdk.hasRealmRole, "tide-realm-admin") ||
    safeRoleCheck((role) => sdk.hasClientRole(role, "realm-management"), "tide-realm-admin");
  const decryptor = safeRoleCheck(sdk.hasRealmRole, "_tide_decryptor");
  const encryptor = safeRoleCheck(sdk.hasRealmRole, "_tide_encryptor");
  const appRoles = realmRoles.filter((role) => KNOWN_APP_ROLES.has(role));
  if (admin && !appRoles.includes("tide-realm-admin")) appRoles.push("tide-realm-admin");

  return {
    key: `${iss ?? "iss-unavailable"}|${sub ?? "sub-unavailable"}`,
    name,
    username,
    iss,
    sub,
    tideuserkey,
    realmRoles,
    appRoles,
    vendors,
    researcher,
    operator,
    admin,
    decryptor,
    encryptor,
    tokenExp: typeof sdk.tokenExp === "number" ? sdk.tokenExp : null,
  };
}

function navGroups(identity) {
  const groups = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Overview" },
        { href: "/setup", label: "Setup & checks" },
      ],
    },
  ];
  if (identity.researcher) {
    groups.push({
      label: "Researcher",
      items: [
        { href: "/research", label: "Research workspace" },
        { href: "/reports", label: "My reports" },
      ],
    });
  }
  if (identity.vendors.length > 0) {
    groups.push({
      label: "Vendor",
      items: [{ href: "/inbox", label: "Vendor inbox" }],
    });
  }
  if (identity.operator || identity.admin) {
    groups.push({
      label: "Evidence",
      items: [
        ...(identity.operator ? [{ href: "/operator", label: "Stored ciphertext" }] : []),
        { href: "/probe", label: "Direct probe" },
      ],
    });
  }
  if (identity.admin) {
    groups.push({
      label: "Governance",
      items: [{ href: "/admin", label: "Policy signing" }],
    });
  }
  return groups;
}

function PublicBrand() {
  return (
    <a
      className="public-brand"
      href="/"
      onClick={(event) => {
        event.preventDefault();
        navigate("/");
      }}
    >
      <span className="brand-mark" aria-hidden="true">
        E
      </span>
      <span>
        <strong>Embargo</strong>
        <small>confidential disclosure exchange</small>
      </span>
    </a>
  );
}

function AccessDenied({ page, identity }) {
  return (
    <section className="panel" role="alert">
      <span className="eyebrow">ACCESS DENIED</span>
      <h1>This surface needs {page.required}</h1>
      <p>
        The navigation hides surfaces the verified token cannot use, but the API independently
        enforces the same rule. No role switch or impersonation is offered here.
      </p>
      <dl className="inline-meta">
        <div>
          <dt>Actual app roles</dt>
          <dd>
            <RoleChips roles={identity.appRoles} />
          </dd>
        </div>
      </dl>
      <button className="btn btn-primary" type="button" onClick={() => navigate("/")}>
        Back to overview
      </button>
    </section>
  );
}

function NotFound({ path }) {
  return (
    <section className="panel">
      <span className="eyebrow">NOT FOUND</span>
      <h1>No surface at {path}</h1>
      <p>The application only serves the defined workspace routes.</p>
      <button className="btn btn-primary" type="button" onClick={() => navigate("/")}>
        Back to overview
      </button>
    </section>
  );
}

function AppFooter() {
  return (
    <footer className="app-footer">
      <span>Embargo / Confidential disclosure</span>
      <span>Prototype for synthetic findings. Local activity is not tamper-proof.</span>
    </footer>
  );
}

function Shell({
  identity,
  path,
  page,
  children,
  sdk,
  onRefreshSetup,
  refreshingSetup,
  refreshSetupError,
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const groups = navGroups(identity);

  async function signOut() {
    setSigningOut(true);
    setLogoutError(null);
    try {
      await sdk.logout();
    } catch (error) {
      setLogoutError(error);
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand-mark" aria-hidden="true">
            E
          </span>
          <span>
            <strong>Embargo</strong>
            <small>confidential disclosure</small>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace">
          {groups.map((group) => (
            <div className="nav-group" key={group.label}>
              <span className="nav-label">{group.label}</span>
              {group.items.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${path === item.href ? "active" : ""}`}
                  aria-current={path === item.href ? "page" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(item.href);
                  }}
                >
                  <span className="nav-dot" aria-hidden="true" />
                  {item.label}
                </a>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-identity">
          <span className="eyebrow light">SIGNED IN</span>
          <strong>{identity.name}</strong>
          <span className="sidebar-username">{identity.username ? `@${identity.username}` : identity.sub || "no subject"}</span>
          <div className="sidebar-roles">
            <RoleChips roles={identity.appRoles} empty="No app roles" />
          </div>
          <span className="sidebar-expiry">
            Token: {formatDurationSeconds(identity.tokenExp)}
          </span>
          <button className="btn btn-outline-light full-width" type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Log out"}
          </button>
        </div>
      </aside>

      <div className="app-column">
        <header className="topbar">
          <div className="topbar-title-block">
            <span className="eyebrow">{page?.eyebrow || "EMBARGO"}</span>
            <span className="topbar-title">{page?.title || "Not found"}</span>
          </div>
          <div className="top-actions">
            <span className="session-chip">
              <span className="status-dot" aria-hidden="true" />
              {identity.username || identity.sub || "signed in"}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onRefreshSetup}
              disabled={refreshingSetup}
            >
              {refreshingSetup ? "Re-checking…" : "Re-check config"}
            </button>
          </div>
        </header>

        <main id="main" className="page">
          {refreshSetupError ? (
            <ErrorPanel
              error={refreshSetupError}
              title="Configuration re-check failed"
              onRetry={onRefreshSetup}
            />
          ) : null}
          {logoutError ? <ErrorPanel error={logoutError} title="Logout failed" /> : null}
          {children}
        </main>
        <AppFooter />
      </div>
    </div>
  );
}

function AppBoot() {
  return (
    <div className="public-shell">
      <PublicBrand />
      <main id="main" className="public-main">
        <section className="public-card center-card" aria-busy="true">
          <span className="eyebrow">TIDECLOAK</span>
          <h1>Initializing the real session</h1>
          <p>Waiting for the provider to resolve the token state. No fallback session exists.</p>
          <Spinner label="Initializing TideCloak…" />
        </section>
      </main>
    </div>
  );
}

export default function App({
  setup,
  onRefreshSetup,
  refreshingSetup,
  refreshSetupError,
}) {
  const sdk = useTideCloak();
  const api = useApi();
  const path = useRoute();
  const identity = useMemo(
    () => (sdk.authenticated ? buildIdentity(sdk) : null),
    [sdk.authenticated, sdk.token],
  );

  useEffect(() => {
    if (sdk.isInitializing) return;
    if (window.location.pathname === "/auth/redirect") {
      window.history.replaceState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [sdk.isInitializing]);

  if (sdk.isInitializing) return <AppBoot />;
  if (sdk.authenticated && path === "/auth/redirect") return <AppBoot />;
  if (!sdk.authenticated) return <Landing setup={setup} sdk={sdk} />;

  const page = PAGES[path] ?? null;
  let content;
  if (!page) {
    content = <NotFound path={path} />;
  } else if (!page.allowed(identity)) {
    content = <AccessDenied page={page} identity={identity} />;
  } else {
    const Component = page.component;
    const extraProps = {};
    if (page.props) {
      for (const key of page.props) {
        if (key === "onRefreshSetup") extraProps.onRefreshSetup = onRefreshSetup;
        if (key === "refreshingSetup") extraProps.refreshingSetup = refreshingSetup;
        if (key === "refreshSetupError") extraProps.refreshSetupError = refreshSetupError;
      }
    }
    content = (
      <Component
        key={`${identity.key}:${path}`}
        setup={setup}
        identity={identity}
        api={api}
        navigate={navigate}
        {...extraProps}
      />
    );
  }

  return (
    <Shell
      identity={identity}
      path={path}
      page={page}
      sdk={sdk}
      onRefreshSetup={onRefreshSetup}
      refreshingSetup={refreshingSetup}
      refreshSetupError={refreshSetupError}
    >
      {content}
    </Shell>
  );
}
