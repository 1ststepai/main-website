import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeCommandCenterSource } from "../lib/admin/commandCenter.js";

const UUID_JSON = /^[a-f0-9-]{36}\.json$/i;
const DISPOSITION_STATUS = {
  PASS: "pass",
  PASS_WITH_FOLLOW_UP: "open",
  FAIL: "fail",
  AUDIT_PROVIDER_UNAVAILABLE: "blocked",
};
const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function reportFiles(stateDir) {
  const directory = path.join(stateDir, "audits");
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
