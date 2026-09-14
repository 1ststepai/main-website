import { timingSafeEqual } from "node:crypto";
import { fetchWithTimeout } from "../http/fetchWithTimeout.js";
import { decryptProtectedJson, encryptProtectedJson, isProtectedEnvelope } from "../security/dataProtection.js";

const SOURCES = ["public-ecosystem", "app-family"];
const PREFIX = "firststep_admin:command_center:v1:";
const MAX_AGE_MS = 5 * 60 * 1000;
const AGENT_STATES = ["registered", "online", "working", "auditing", "waiting", "blocked", "idle", "stale", "offline", "rotating", "unknown"];
const SESSION_HEALTH = ["healthy", "degraded", "stale", "unreachable", "watch", "rotate_soon", "rotate_now", "rotation_prepared", "rotating", "retired", "rotation_failed", "runtime_support_required", "unknown"];
const ROTATION_STATES = ["NOT_REQUESTED", "CHECKPOINTING", "ROTATION_REQUIRES_RUNTIME_SUPPORT", "CREATING", "BOOTSTRAPPING", "VERIFYING", "AWAITING_ACKNOWLEDGEMENT", "SWITCHING_BINDING", "RETIRING_OLD_SESSION", "COMPLETED", "FAILED", "RECOVERY_REQUIRED", "UNKNOWN"];
const TRUTH_STATES = ["OBSERVED", "AGENT_REPORTED", "AUDITOR_VERIFIED", "SYSTEM_DERIVED", "UNKNOWN"];
const AUDIT_PROVIDER_STATES = ["AVAILABLE", "UNAVAILABLE", "USAGE_EXHAUSTED", "AUTH_UNAVAILABLE", "DISABLED_BUDGET_0", "UNKNOWN"];

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

function opaque(value, max = 100) {
  const result = text(value, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw failure("invalid_telemetry");
  return result;
}

function optionalOpaque(value, max = 100) {
  return value == null || value === "" ? null : opaque(value, max);
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

function truthState(value) {
  return TRUTH_STATES.includes(value) ? value : "UNKNOWN";
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

function sessionProjection(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw failure("invalid_telemetry");
  const history = records(value.history ?? [], 12, (item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw failure("invalid_telemetry");
    const startedAt = timestamp(item.startedAt);
    const endedAt = optionalTimestamp(item.endedAt);
    if (endedAt && endedAt < startedAt) throw failure("invalid_session_history");
    return { sessionId: opaque(item.sessionId), runtime: opaque(item.runtime, 80), startedAt, endedAt, state: status(item.state, ["active", "retired", "failed", "unknown"]) };
  });
  const checkpoint = value.lastCheckpoint == null ? null : {
    id: opaque(value.lastCheckpoint.id),
    createdAt: timestamp(value.lastCheckpoint.createdAt),
  };
  const rotation = value.rotation == null ? null : {
    id: opaque(value.rotation.id),
    state: status(value.rotation.state, ROTATION_STATES),
    updatedAt: timestamp(value.rotation.updatedAt),
  };
  return {
    health: status(value.health, SESSION_HEALTH),
    runtime: optionalOpaque(value.runtime, 80),
    sessionId: optionalOpaque(value.sessionId),
    lastCheckpoint: checkpoint,
    rotation,
    history,
  };
}

function auditCapacityProjection(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw failure("invalid_telemetry");
  const count = (number) => Number.isSafeInteger(number) && number >= 0 ? number : null;
  const jobs = records(value.jobs ?? [], 20, (item) => ({ id: opaque(item.id), project: optionalOpaque(item.project, 100), findingId: optionalOpaque(item.findingId, 100),
    status: status(item.status, ["QUEUED", "RUNNING", "DETERMINISTIC_COMPLETE", "BLOCKED_DETERMINISTIC", "AWAITING_CLAUDE", "INCONCLUSIVE", "ESCALATE", "REVIEW_CONFLICT", "PASS", "FAIL", ...[1, 2, 3].flatMap((tier) => [`TIER_${tier}_RUNNING`, `TIER_${tier}_COMPLETE`, `TIER_${tier}_UNAVAILABLE`])]),
    provider: optionalOpaque(item.provider, 100), model: optionalOpaque(item.model, 120), verdict: item.verdict == null ? null : status(item.verdict, ["PASS", "FAIL", "INCONCLUSIVE", "ESCALATE"]),
    costUsd: item.costUsd === 0 ? 0 : null, createdAt: timestamp(item.createdAt), updatedAt: timestamp(item.updatedAt) }));
  return {
    observedAt: timestamp(value.observedAt),
    providers: records(value.providers, 12, (item) => ({ id: opaque(item.id), label: text(item.label, 80), model: optionalOpaque(item.model, 120), status: status(item.status, AUDIT_PROVIDER_STATES).toUpperCase() })),
    auditQueue: count(value.auditQueue), activeJobs: count(value.activeJobs), autoRoutable: count(value.autoRoutable), claudeEscalation: count(value.claudeEscalation), jobs,
    truthState: truthState(value.truthState),
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
    role: optionalOpaque(item.role, 80),
    scope: optionalOpaque(item.scope, 100),
    cycle: optionalOpaque(item.cycle, 80),
    repository: optionalOpaque(item.repository, 100),
    branch: optionalText(item.branch, 120),
    worktreeRef: optionalOpaque(item.worktreeRef, 100),
    commit: optionalOpaque(item.commit, 64),
    findingIds: records(item.findingIds ?? [], 30, (id) => opaque(id)),
    lastHeartbeatAt: optionalTimestamp(item.lastHeartbeatAt),
    lastActivityAt: optionalTimestamp(item.lastActivityAt),
    waitingOn: optionalOpaque(item.waitingOn),
    blockingReason: optionalText(item.blockingReason, 160),
    truthState: truthState(item.truthState),
    session: sessionProjection(item.session),
  }));
  if (new Set(agents.map((item) => item.id)).size !== agents.length) throw failure("duplicate_agent");
  if (agents.some((agent) => Date.parse(agent.updatedAt) > now + 60_000)) throw failure("future_telemetry");
  return {
    schemaVersion: 1,
    contentFree: true,
    source,
    observedAt,
    registryComplete: input.registryComplete === true,
    auditCapacity: source === "public-ecosystem" ? auditCapacityProjection(input.auditCapacity) : null,
    agents,
    projects: records(input.projects, 100, (item) => ({ ...common(item), name: text(item.name, 100), owner: optionalText(item.owner, 100), status: optionalText(item.status, 60) })),
    events: records(input.events, 150, (item) => ({ id: opaque(item.id), at: timestamp(item.at), kind: opaque(item.kind, 60), summary: text(item.summary, 220), project: optionalText(item.project, 100), organizationId: optionalOpaque(item.organizationId), portfolioId: optionalOpaque(item.portfolioId), projectId: optionalOpaque(item.projectId), agentId: optionalOpaque(item.agentId), agentRole: optionalOpaque(item.agentRole, 80), runtimeId: optionalOpaque(item.runtimeId), sessionId: optionalOpaque(item.sessionId), entityType: optionalOpaque(item.entityType, 80), entityId: optionalOpaque(item.entityId), correlationId: optionalOpaque(item.correlationId), causationId: optionalOpaque(item.causationId), findingId: optionalOpaque(item.findingId), cycle: optionalOpaque(item.cycle, 80), severity: status(item.severity, ["critical", "high", "medium", "low", "unknown"]), evidenceRefs: records(item.evidenceRefs ?? [], 10, (ref) => opaque(ref, 120)), truthState: truthState(item.truthState) })),
    audits: records(input.audits, 100, (item) => ({ ...common(item), title: optionalText(item.title, 180), status: status(item.status, ["open", "remediating", "awaiting_reaudit", "pass", "fail", "blocked", "unknown"]), severity: status(item.severity, ["critical", "high", "medium", "low", "unknown"]), findings: Number.isSafeInteger(item.findings) && item.findings >= 0 ? item.findings : null, owner: optionalText(item.owner, 100), remediationOwner: optionalText(item.remediationOwner, 100), reAuditStatus: status(item.reAuditStatus, ["not_requested", "pending", "pass", "fail", "unknown"]), evidenceRef: optionalText(item.evidenceRef, 120) })),
    findings: records(input.findings ?? [], 100, (item) => {
      const state = status(item.status, ["open", "assigned", "in_progress", "ready_for_reaudit", "re_auditing", "pass", "failed_reaudit", "blocked", "accepted_risk", "unknown"]);
      const auditorId = optionalOpaque(item.auditorId);
      const evidenceRef = optionalOpaque(item.evidenceRef, 120);
      const truth = truthState(item.truthState);
      if (state === "pass" && (truth !== "AUDITOR_VERIFIED" || !auditorId || !evidenceRef)) throw failure("invalid_finding_verdict");
      return { ...common(item), title: optionalText(item.title, 180), auditId: optionalOpaque(item.auditId), status: state, severity: status(item.severity, ["critical", "high", "medium", "low", "unknown"]), owner: optionalOpaque(item.owner), auditorId, evidenceRef, truthState: truth };
    }),
    handoffs: records(input.handoffs, 100, (item) => {
      const deliveredAt = optionalTimestamp(item.deliveredAt);
      const acknowledgedAt = optionalTimestamp(item.acknowledgedAt);
      const state = status(item.status, ["pending", "created", "queued", "sent", "delivered", "acknowledged", "in_progress", "returned_for_verification", "closed", "recipient_offline", "no_route", "blocked", "failed_delivery", "unknown"]);
      const sentAt = optionalTimestamp(item.sentAt);
      if ((state === "sent" && !sentAt) || (["delivered", "acknowledged", "in_progress", "returned_for_verification", "closed"].includes(state) && !deliveredAt) || (["acknowledged", "in_progress", "returned_for_verification", "closed"].includes(state) && !acknowledgedAt) || (sentAt && deliveredAt && deliveredAt < sentAt) || (deliveredAt && acknowledgedAt && acknowledgedAt < deliveredAt)) throw failure("invalid_handoff_state");
      const osDelivery = status(item.osDelivery || "UNKNOWN", ["CREATED", "QUEUED", "AVAILABLE_TO_RECIPIENT", "UNKNOWN"]).toUpperCase();
      const runtimeConsumption = status(item.runtimeConsumption || "UNKNOWN", ["UNREAD", "INGESTED", "ACKNOWLEDGED", "IN_PROGRESS", "UNKNOWN"]).toUpperCase();
      const runtimeDelivery = status(item.runtimeDelivery || "UNKNOWN", ["DELIVERED_TO_OS", "WAITING_FOR_RUNTIME", "RUNTIME_INCOMPATIBLE", "RECIPIENT_OFFLINE", "ACKNOWLEDGED", "STALE_UNACKNOWLEDGED", "UNKNOWN"]).toUpperCase();
      const retained = item.retained === true;
      if (osDelivery === "AVAILABLE_TO_RECIPIENT" && (!deliveredAt || !retained)) throw failure("invalid_os_delivery");
      if (["ACKNOWLEDGED", "IN_PROGRESS"].includes(runtimeConsumption) && !acknowledgedAt) throw failure("invalid_runtime_consumption");
      return { ...common(item), from: text(item.from, 100), to: text(item.to, 100), status: state, sentAt, deliveredAt, acknowledgedAt, recipientRole: optionalOpaque(item.recipientRole, 80), recipientAgentId: optionalOpaque(item.recipientAgentId), runtimeId: optionalOpaque(item.runtimeId), taskId: optionalOpaque(item.taskId), findingId: optionalOpaque(item.findingId), findingIds: records(item.findingIds ?? [], 50, (id) => opaque(id, 100)), cycle: item.cycle == null ? null : Number.isSafeInteger(item.cycle) && item.cycle >= 0 ? item.cycle : (() => { throw failure("invalid_handoff_cycle"); })(), osDelivery, runtimeConsumption, runtimeDelivery, runtimeReason: optionalOpaque(item.runtimeReason, 120), retained, correlationId: optionalOpaque(item.correlationId), owner: optionalOpaque(item.owner), evidenceRefs: records(item.evidenceRefs ?? [], 10, (ref) => opaque(ref, 120)), truthState: truthState(item.truthState) };
    }),
    decisions: records(input.decisions, 100, (item) => ({ ...common(item), title: text(item.title, 180), status: status(item.status, ["needs_owner", "resolved", "blocked", "unknown"]) })),
    releases: records(input.releases, 100, (item) => ({ ...common(item), status: status(item.status, ["local", "locally_verified", "independently_audited", "integrated", "preview", "hosted_verified", "release_ready", "production_verified", "blocked", "in_review", "ready", "deployed", "unknown"]), blockers: records(item.blockers, 20, (blocker) => text(blocker, 160)) })),
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
    status: now - Date.parse(agent.updatedAt) <= MAX_AGE_MS ? agent.status : ["working", "auditing", "waiting", "online", "rotating"].includes(agent.status) ? "stale" : "unknown",
    session: agent.session && now - Date.parse(agent.updatedAt) > MAX_AGE_MS ? { ...agent.session, health: "unknown" } : agent.session,
  }));
  const complete = live.length === SOURCES.length && live.every((item) => item.registryComplete);
  const count = (state) => complete ? agents.filter((agent) => agent.status === state).length : null;
  const collect = (key) => live.flatMap((item) => item.data[key].map((record) => ({ ...record, source: item.source })));
  return {
    generatedAt: new Date(now).toISOString(),
    coverage: states.map(({ source, state, observedAt, registryComplete }) => ({ source, state, observedAt, registryComplete })),
    counts: { registered: complete ? agents.length : null, working: count("working"), auditing: count("auditing"), waiting: count("waiting"), blocked: count("blocked"), idle: count("idle"), offline: count("offline"), stale: count("stale"), unknown: count("unknown") },
    agents,
    projects: collect("projects"),
    events: collect("events").sort((a, b) => b.at.localeCompare(a.at)),
    audits: collect("audits"),
    findings: collect("findings"),
    handoffs: collect("handoffs"),
    decisions: collect("decisions"),
    releases: collect("releases"),
    builds: collect("builds"),
    auditCapacity: (() => {
      const capacity = live.find((item) => item.source === "public-ecosystem")?.data.auditCapacity;
      return capacity && now - Date.parse(capacity.observedAt) >= 0 && now - Date.parse(capacity.observedAt) <= MAX_AGE_MS ? capacity : null;
    })(),
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
