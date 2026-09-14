import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCommandCenterSource } from "../lib/admin/commandCenter.js";

const UUID_JSON = /^[a-f0-9-]{36}\.json$/i;
const DISPOSITION_STATUS = {
  PASS: "pass",
  PASS_WITH_FOLLOW_UP: "open",
  FAIL: "fail",
  INCONCLUSIVE: "blocked",
  ESCALATE: "blocked",
  AUDIT_PROVIDER_UNAVAILABLE: "blocked",
};
const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function auditCapacitySnapshot(stateDir, now) {
  const directory = path.join(stateDir, "jobs");
  if (!fs.existsSync(directory)) return null;
  const jobs = fs.readdirSync(directory).filter((name) => UUID_JSON.test(name)).map((name) => {
    const job = JSON.parse(fs.readFileSync(path.join(directory, name), "utf8"));
    if (`${job.jobId}.json` !== name || job.schemaVersion !== 1) throw new Error("Invalid durable AuditJob metadata");
    const eventsDir = path.join(stateDir, "job-events", job.jobId);
    const events = fs.existsSync(eventsDir) ? fs.readdirSync(eventsDir).filter((event) => /^\d+-[a-f0-9-]{36}\.json$/i.test(event)).sort().map((event) => JSON.parse(fs.readFileSync(path.join(eventsDir, event), "utf8"))) : [];
    return { job, events, status: events.at(-1)?.status || job.status };
  });
  const latest = (provider) => jobs.flatMap((item) => item.events).filter((event) => event.provider === provider && /_(?:UNAVAILABLE|COMPLETE)$/.test(event.status)).sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const state = (provider) => {
    const event = latest(provider);
    if (!event) return "UNKNOWN";
    if (now.getTime() - Date.parse(event.at) > 5 * 60_000) return "UNKNOWN";
    if (event.status.endsWith("_COMPLETE")) return "AVAILABLE";
    if (event.code === "QUOTA") return "USAGE_EXHAUSTED";
    if (event.code === "AUTH") return "AUTH_UNAVAILABLE";
    return "UNKNOWN";
  };
  const freeStatus = state("openrouter-free-primary");
  return {
    observedAt: now.toISOString(), truthState: "SYSTEM_DERIVED",
    providers: [
      { id: "deterministic", label: "Deterministic Engine", status: "AVAILABLE" },
      { id: "openrouter-free-primary", label: "OpenRouter Free Pool", model: latest("openrouter-free-primary")?.status.endsWith("_COMPLETE") ? latest("openrouter-free-primary")?.model || null : null, status: freeStatus },
      { id: "claude-escalation", label: "Claude", model: latest("claude-escalation")?.status.endsWith("_COMPLETE") ? latest("claude-escalation")?.model || null : null, status: state("claude-escalation") },
      { id: "deepseek-paid", label: "DeepSeek", status: "DISABLED_BUDGET_0" },
    ],
    auditQueue: jobs.filter((item) => ["QUEUED", "RUNNING", "AWAITING_CLAUDE", "INCONCLUSIVE"].includes(item.status)).length,
    autoRoutable: freeStatus === "AVAILABLE" ? jobs.filter((item) => item.status === "QUEUED" && item.job.externalAiAllowed && item.job.dataClassification === "PUBLIC").length : null,
    claudeEscalation: jobs.filter((item) => item.status === "AWAITING_CLAUDE").length,
  };
}

function reportFiles(stateDir) {
  const directory = path.join(stateDir, "audits");
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => UUID_JSON.test(name)).map((name) => path.join(directory, name));
}

function verifiedReport(file) {
  const report = JSON.parse(fs.readFileSync(file, "utf8"));
  if (`${report.auditId}.json` !== path.basename(file)
    || !Object.hasOwn(DISPOSITION_STATUS, report.disposition)
    || !Array.isArray(report.findings)
    || !Number.isFinite(Date.parse(report.timestamp))) {
    throw new Error(`Invalid auditor report: ${path.basename(file)}`);
  }
  return report;
}

function publishedHandoff(stateDir, role, report) {
  const agentId = role === "lead-engineering-manager" ? "ecosystem-lead-engineering-manager" : "ecosystem-loop-agent";
  const messageId = `${report.auditId}-${agentId}`;
  const pointerFile = path.join(stateDir, "mailbox", "inbox", agentId, `${messageId}.json`);
  const messageFile = path.join(stateDir, "mailbox", "messages", `${messageId}.json`);
  if (fs.existsSync(pointerFile) && fs.existsSync(messageFile)) {
    const pointer = JSON.parse(fs.readFileSync(pointerFile, "utf8"));
    const message = JSON.parse(fs.readFileSync(messageFile, "utf8"));
    if (pointer.messageId !== messageId || pointer.recipientAgentId !== agentId
      || message.auditId !== report.auditId || message.candidateSha !== report.candidateSha
      || message.disposition !== report.disposition || message.recipientAgentId !== agentId
      || !Number.isFinite(Date.parse(pointer.queuedAt))) throw new Error(`OS mailbox/report mismatch: ${messageId}`);
    const receiptDir = path.join(stateDir, "mailbox", "receipts", agentId, messageId);
    const receipts = fs.existsSync(receiptDir) ? fs.readdirSync(receiptDir).filter((name) => /\.(INGESTED|ACKNOWLEDGED|IN_PROGRESS)\.json$/.test(name)).map((name) => JSON.parse(fs.readFileSync(path.join(receiptDir, name), "utf8"))) : [];
    for (const receipt of receipts) {
      if (receipt.messageId !== messageId || receipt.agentId !== agentId || !Number.isFinite(Date.parse(receipt.at))) throw new Error(`OS receipt mismatch: ${messageId}`);
    }
    const latest = (state) => receipts.filter((item) => item.state === state).map((item) => item.at).sort().at(-1) || null;
    const acknowledgedAt = latest("ACKNOWLEDGED");
    const runtimeConsumption = latest("IN_PROGRESS") ? "IN_PROGRESS" : acknowledgedAt ? "ACKNOWLEDGED" : latest("INGESTED") ? "INGESTED" : "UNREAD";
    const failureFile = path.join(stateDir, "mailbox", "runtime-failures", `${messageId}.json`);
    const failure = fs.existsSync(failureFile) ? JSON.parse(fs.readFileSync(failureFile, "utf8")) : null;
    if (failure && (failure.messageId !== messageId || failure.agentId !== agentId)) throw new Error(`OS runtime failure mismatch: ${messageId}`);
    return {
      id: messageId, project: path.basename(String(report.repository || "1stStep.ai ecosystem")), updatedAt: latest("IN_PROGRESS") || acknowledgedAt || pointer.queuedAt,
      from: report.provider === "claude" ? "Claude Auditor" : "Independent Ecosystem Auditor", to: agentId, status: runtimeConsumption === "IN_PROGRESS" ? "in_progress" : acknowledgedAt ? "acknowledged" : "queued",
      deliveredAt: pointer.queuedAt, acknowledgedAt, recipientAgentId: agentId,
      osDelivery: "AVAILABLE_TO_RECIPIENT", runtimeConsumption,
      runtimeDelivery: acknowledgedAt ? "ACKNOWLEDGED" : runtimeConsumption === "UNREAD" && failure ? "RUNTIME_INCOMPATIBLE" : "WAITING_FOR_RUNTIME",
      runtimeReason: runtimeConsumption === "UNREAD" ? failure?.reason || null : null, retained: true, cycle: message.cycle ?? null,
      findingIds: message.findingIds || [], evidenceRefs: [report.auditId],
    };
  }
  const file = path.join(stateDir, "inbox", role, `${report.auditId}.json`);
  if (!fs.existsSync(file)) return null;
  const handoff = JSON.parse(fs.readFileSync(file, "utf8"));
  if (handoff.auditId !== report.auditId
    || handoff.candidateSha !== report.candidateSha
    || handoff.disposition !== report.disposition
    || handoff.timestamp !== report.timestamp) {
    throw new Error(`Auditor handoff/report mismatch: ${role}/${report.auditId}`);
  }
  return {
    id: `${report.auditId}-${role}`,
    project: path.basename(String(report.repository || "1stStep.ai ecosystem")),
    updatedAt: report.timestamp,
    from: "Independent Ecosystem Auditor",
    to: role === "lead-engineering-manager" ? "Lead Engineering Manager" : "Looping Agent",
    status: "delivered",
    deliveredAt: report.timestamp,
    acknowledgedAt: null,
    osDelivery: "UNKNOWN", runtimeConsumption: "UNREAD", runtimeDelivery: "UNKNOWN", retained: false,
  };
}

export function auditorSourceSnapshot(stateDir, now = new Date()) {
  const reports = reportFiles(stateDir).map(verifiedReport).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50);
  const payload = {
    schemaVersion: 1,
    contentFree: true,
    source: "public-ecosystem",
    observedAt: now.toISOString(),
    registryComplete: false,
    auditCapacity: auditCapacitySnapshot(stateDir, now),
    agents: [], projects: [], decisions: [], releases: [], builds: [],
    events: reports.map((report) => ({
      id: `audit-${report.auditId}`,
      at: report.timestamp,
      kind: "independent_audit",
      summary: `Independent audit ${report.auditId}: ${report.disposition}`,
      project: path.basename(String(report.repository || "1stStep.ai ecosystem")),
    })),
    audits: reports.map((report) => ({
      id: report.auditId,
      title: `Audit ${report.taskId}`,
      project: path.basename(String(report.repository || "1stStep.ai ecosystem")),
      updatedAt: report.timestamp,
      status: DISPOSITION_STATUS[report.disposition],
      severity: SEVERITY_ORDER.find((severity) => report.findings.some((finding) => String(finding?.severity || "").toLowerCase() === severity)) || "unknown",
      findings: report.findings.length,
      owner: "Independent Ecosystem Auditor",
      remediationOwner: null,
      reAuditStatus: "unknown",
      evidenceRef: report.auditId,
    })),
    handoffs: reports.flatMap((report) => ["lead-engineering-manager", "looping-agent"].map((role) => publishedHandoff(stateDir, role, report)).filter(Boolean)),
  };
  return normalizeCommandCenterSource(payload, now.getTime());
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const stateIndex = args.indexOf("--state-dir");
  if (stateIndex < 0 || !args[stateIndex + 1]) throw new Error("Usage: node scripts/command-center-auditor-source.mjs --state-dir <auditor-state-dir> [--publish]");
  const snapshot = auditorSourceSnapshot(path.resolve(args[stateIndex + 1]));
  if (args.includes("--publish")) {
    const url = process.env.FIRSTSTEP_COMMAND_CENTER_INGEST_URL;
    const key = process.env.FIRSTSTEP_COMMAND_CENTER_PUBLIC_INGEST_SECRET;
    if (!url || !key || key.length < 32) throw new Error("Publisher URL or secret is not configured");
    const target = new URL(url);
    if (target.protocol !== "https:" || target.pathname !== "/api/admin-command-center-ingest") throw new Error("Publisher URL must be the HTTPS Command Center ingest endpoint");
    const response = await fetch(target, { method: "POST", headers: { "Content-Type": "application/json", "x-1ststep-command-center-key": key }, body: JSON.stringify(snapshot), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`Telemetry publish failed with HTTP ${response.status}`);
    console.log(JSON.stringify({ status: "published", source: snapshot.source, audits: snapshot.audits.length, handoffs: snapshot.handoffs.length, registeredAgents: "UNKNOWN" }));
  } else {
    console.log(JSON.stringify({ status: "dry_run", source: snapshot.source, audits: snapshot.audits.length, handoffs: snapshot.handoffs.length, registeredAgents: "UNKNOWN" }));
  }
}
