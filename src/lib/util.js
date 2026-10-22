import { VENDORS } from "../../shared/contracts.mjs";

export const STATUS_LABELS = Object.freeze({
  received: "Received",
  triaged: "Triaged",
  fixed: "Fixed",
});

export const STATUS_TONES = Object.freeze({
  received: "neutral",
  triaged: "attention",
  fixed: "positive",
});

export function cx(...values) {
  return values.filter(Boolean).join(" ");
}

export function shortId(value, head = 8, tail = 4) {
  if (typeof value !== "string" || value.length === 0) return "—";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function formatTimestamp(value) {
  if (typeof value !== "string" && typeof value !== "number") return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? "Unknown state";
}

export function statusTone(status) {
  return STATUS_TONES[status] ?? "neutral";
}

export function nextReportStatus(status) {
  if (status === "received") return "triaged";
  if (status === "triaged") return "fixed";
  return null;
}

export function nextStatusLabel(status) {
  if (status === "received") return "Acknowledge as triaged";
  if (status === "triaged") return "Mark as fixed";
  return "";
}

export function vendorName(vendorId) {
  return VENDORS.find((vendor) => vendor.id === vendorId)?.name ?? vendorId ?? "Unknown vendor";
}

export function safeUrl(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function consoleLinkFromConfig(config) {
  if (!config || typeof config !== "object") return null;
  const raw =
    config["auth-server-url"] ||
    config.authServerUrl ||
    config.url ||
    config.baseUrl ||
    null;
  const url = safeUrl(raw);
  if (!url) return null;
  return `${url.origin}/`;
}

export function claimRoles(claim) {
  if (!claim || typeof claim !== "object") return [];
  if (!Array.isArray(claim.roles)) return [];
  return claim.roles.filter((role) => typeof role === "string");
}

export function boundedText(value, limit = 600) {
  if (typeof value !== "string") return "";
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

export function formatDurationSeconds(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return "unknown";
  if (seconds <= 0) return "expired";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${Math.round(seconds / 3600)} h`;
}

export function characterCount(value, max) {
  return `${typeof value === "string" ? value.length : 0} / ${max}`;
}
