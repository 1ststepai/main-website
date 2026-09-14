import { timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "../http/fetchWithTimeout.js";
import { decryptProtectedJson, encryptProtectedJson, isProtectedEnvelope } from "../security/dataProtection.js";

const SOURCES = ["public-ecosystem", "app-family"];
const PREFIX = "firststep_admin:command_center:v1:";
const MAX_AGE_MS = 5 * 60 * 1000;
const AGENT_STATES = ["working", "waiting", "blocked", "idle", "unknown"];

function failure(code, statusCode = 400) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  return error;
}

function text(value, max = 160) {
  if (typeof value !== "string" || !value.trim() || value.length > max || /[\r\n<>@]|(?:sk-|gh[pousr]_|AKIA)[A-Za-z0-9_-]{8,}/.test(value)) {
    throw failure("invalid_telemetry");
  }
  return value.trim();
}

function optionalText(value, max = 160) {
  return value == null || value === "" ? null : text(value, max);
}

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw failure("invalid_telemetry");
  }
  return new Date(value).toISOString();
}

function optionalTimestamp(value) {
  return value == null ? null : timestamp(value);
}

function status(value, allowed) {
  return allowed.includes(value) ? value : "unknown";
}

function records(value, max, mapper) {
  if (!Array.isArray(value) || value.length > max) throw failure("invalid_telemetry");
  return value.map(mapper);
}

function common(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("invalid_telemetry");
  return {
    id: text(value.id, 100),
    project: optionalText(value.project, 100),
    updatedAt: timestamp(value.updatedAt),
  };
}

export function normalizeCommandCenterSource(input, now = Date.now()) {
  if (!input || input.schemaVersion !== 1 || input.contentFree !== true || !SOURCES.includes(input.source)) {
    throw failure("invalid_telemetry");
  }
  const observedAt = timestamp(input.observedAt);
  if (Date.parse(observedAt) > now + 60_000) throw failure("future_telemetry");
  const source = input.source;
  const agents = records(input.agents, 100, (item) => ({
    ...common(item),
    name: text(item.name, 100),
    group: source,
    status: status(item.status, AGENT_STATES),
    task: optionalText(item.task, 220),
    owner: optionalText(item.owner, 100),
  }));
  if (new Set(agents.map((item) => item.id)).size !== agents.length) throw failure("duplicate_agent");
  if (agents.some((agent) => Date.parse(agent.updatedAt) > now + 60_000)) throw failure("future_telemetry");
  return {
    schemaVersion: 1,
    contentFree: true,
    source,
    observedAt,
    registryComplete: input.registryComplete === true,
    agents,
    projects: records(input.projects, 100, (item) => ({ ...common(item), name: text(item.name, 100), owner: optionalText(item.owner, 100), status: optionalText(item.status, 60) })),
    events: records(input.events, 150, (item) => ({ id: text(item.id, 100), at: timestamp(item.at), kind: text(item.kind, 60), summary: text(item.summary, 220), project: optionalText(item.project, 100) })),
    audits: records(input.audits, 100, (item) => ({ ...common(item), title: optionalText(item.title, 180), status: status(item.status, ["open", "remediating", "awaiting_reaudit", "pass", "fail", "blocked", "unknown"]), severity: status(item.severity, ["critical", "high", "medium", "low", "unknown"]), findings: Number.isSafeInteger(item.findings) && item.findings >= 0 ? item.findings : null, owner: optionalText(item.owner, 100), remediationOwner: optionalText(item.remediationOwner, 100), reAuditStatus: status(item.reAuditStatus, ["not_requested", "pending", "pass", "fail", "unknown"]), evidenceRef: optionalText(item.evidenceRef, 120) })),
    handoffs: records(input.handoffs, 100, (item) => {
      const deliveredAt = optionalTimestamp(item.deliveredAt);
      const acknowledgedAt = optionalTimestamp(item.acknowledgedAt);
      const state = status(item.status, ["pending", "delivered", "acknowledged", "blocked", "unknown"]);
      if ((state === "delivered" && !deliveredAt) || (state === "acknowledged" && (!deliveredAt || !acknowledgedAt || acknowledgedAt < deliveredAt))) throw failure("invalid_handoff_state");
      return { ...common(item), from: text(item.from, 100), to: text(item.to, 100), status: state, deliveredAt, acknowledgedAt };
    }),
    decisions: records(input.decisions, 100, (item) => ({ ...common(item), title: text(item.title, 180), status: status(item.status, ["needs_owner", "resolved", "blocked", "unknown"]) })),
    releases: records(input.releases, 100, (item) => ({ ...common(item), status: status(item.status, ["blocked", "in_review", "ready", "deployed", "unknown"]), blockers: records(item.blockers, 20, (blocker) => text(blocker, 160)) })),
    builds: records(input.builds, 100, (item) => ({ ...common(item), status: status(item.status, ["running", "passed", "failed", "blocked", "unknown"]), branch: optionalText(item.branch, 120), commit: optionalText(item.commit, 64) })),
  };
}

export function summarizeCommandCenter(sources, now = Date.now()) {
  const states = SOURCES.map((source) => {
    const data = sources.find((item) => item?.source === source) || null;
    const age = data ? now - Date.parse(data.observedAt) : Infinity;
    return { source, state: data && age >= 0 && age <= MAX_AGE_MS ? "live" : data ? "stale" : "unconnected", observedAt: data?.observedAt || null, registryComplete: data?.registryComplete === true, data };
  });
  const live = states.filter((item) => item.state === "live");
  const agents = live.flatMap((item) => item.data.agents).map((agent) => ({
    ...agent,
    status: now - Date.parse(agent.updatedAt) <= MAX_AGE_MS ? agent.status : "unknown",
  }));
  const complete = live.length === SOURCES.length && live.every((item) => item.registryComplete);
  const count = (state) => complete ? agents.filter((agent) => agent.status === state).length : null;
  const collect = (key) => live.flatMap((item) => item.data[key].map((record) => ({ ...record, source: item.source })));
  return {
    generatedAt: new Date(now).toISOString(),
    coverage: states.map(({ source, state, observedAt, registryComplete }) => ({ source, state, observedAt, registryComplete })),
    counts: { registered: complete ? agents.length : null, working: count("working"), waiting: count("waiting"), blocked: count("blocked"), idle: count("idle"), unknown: count("unknown") },
    agents,
    projects: collect("projects"),
    events: collect("events").sort((a, b) => b.at.localeCompare(a.at)),
    audits: collect("audits"),
    handoffs: collect("handoffs"),
    decisions: collect("decisions"),
    releases: collect("releases"),
    builds: collect("builds"),
  };
}

export function authorizeCommandCenterPublisher(req, source) {
  const envName = source === "public-ecosystem"
    ? "FIRSTSTEP_COMMAND_CENTER_PUBLIC_INGEST_SECRET"
    : source === "app-family" ? "FIRSTSTEP_COMMAND_CENTER_APP_INGEST_SECRET" : null;
  if (!envName) return false;
  const expected = String(process.env[envName] || "");
  const supplied = String(req.headers?.["x-1ststep-command-center-key"] || "");
  if (expected.length < 32 || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

async function kv(parts) {
  const url = String(process.env.KV_REST_API_URL || "");
  const token = String(process.env.KV_REST_API_TOKEN || "");
  if (!url || !token) throw failure("telemetry_store_unavailable", 503);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw failure("telemetry_store_unavailable", 503);
  }
  const response = await fetchWithTimeout(parsed.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(parts),
  }, 5000);
  if (!response.ok) throw failure("telemetry_store_unavailable", 503);
  return response.json();
}

export async function loadCommandCenter(now = Date.now()) {
  const stored = await Promise.all(SOURCES.map(async (source) => {
    const response = await kv(["GET", `${PREFIX}${source}`]);
    if (response.result == null) return null;
    try {
      if (!isProtectedEnvelope(String(response.result))) throw failure("telemetry_store_invalid", 503);
      return normalizeCommandCenterSource(decryptProtectedJson(String(response.result), `admin-command-center:${source}`), now);
    }
    catch { throw failure("telemetry_store_invalid", 503); }
  }));
  return summarizeCommandCenter(stored, now);
}

export async function saveCommandCenterSource(source) {
  await kv(["SET", `${PREFIX}${source.source}`, encryptProtectedJson(source, `admin-command-center:${source.source}`)]);
}
