import React, { useEffect, useState } from "react";
import { Activity, RefreshCw } from "lucide-react";

export const COMMAND_VIEWS = [
  ["command-center", "Overview"],
  ["agents", "Live Agents"],
  ["projects", "Projects"],
  ["activity", "Activity"],
  ["audits", "Audits"],
  ["handoffs", "Handoffs"],
  ["decisions", "Decisions"],
  ["releases", "Releases"],
];

const SOURCE_LABELS = { "public-ecosystem": "Public / ecosystem", "app-family": "App product family" };
const EXPECTED_ROLES = {
  "public-ecosystem": ["Ecosystem Lead / Loop Agent", "Ecosystem Claude Auditor", "Public-Site Lead Engineer", "1stStep OS agents", "1stStep Audit agents"],
  "app-family": ["app.1ststep.ai Engineering Orchestrator", "app.1ststep.ai Loop Agent", "App-family Independent Auditor", "App implementation agents", "resume.1ststep.ai implementation agents", "partners.1ststep.ai implementation agents"],
};
const EMPTY_COMMAND_CENTER = {
  coverage: ["public-ecosystem", "app-family"].map((source) => ({ source, state: "unconnected", observedAt: null, registryComplete: false })),
  counts: { registered: null, working: null, waiting: null, blocked: null, idle: null },
  agents: [], projects: [], events: [], audits: [], handoffs: [], decisions: [], releases: [], builds: [],
};

function when(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Unknown";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function Badge({ value }) {
  const label = String(value || "unknown").replaceAll("_", " ");
  return <span className={`cc-badge cc-${String(value || "unknown").replaceAll(/[^a-z_]/g, "")}`}>{label}</span>;
}

function Empty({ label, coverage }) {
  return <div className="cc-empty" role="status"><strong>{label}</strong><p>{coverage ? "The source has not supplied verified records for this view." : "No live telemetry source is connected. Status remains unknown."}</p></div>;
}

function Card({ children, className = "" }) {
  return <section className={`cc-card ${className}`}>{children}</section>;
}

function AgentGroup({ source, agents, coverage }) {
  const sourceCoverage = coverage?.find((item) => item.source === source);
  const connected = sourceCoverage?.state === "live";
  const registryComplete = connected && sourceCoverage?.registryComplete === true;
  const rows = agents.filter((item) => item.group === source);
  return <Card>
    <div className="cc-card-head"><div><p className="cc-eyebrow">Product authority</p><h3>{SOURCE_LABELS[source]}</h3></div><Badge value={sourceCoverage?.state || "unconnected"} /></div>
    {rows.length ? <div className="cc-list">{rows.map((agent) => <article className="cc-row" key={`${source}:${agent.id}`}>
      <span className="cc-agent-node" aria-hidden="true" /><div className="cc-row-main"><strong>{agent.name}</strong><p>{agent.task || "Task unknown"}</p><small>{agent.project || "Project unknown"} · Owner: {agent.owner || "unknown"} · Seen {when(agent.updatedAt)}</small></div><Badge value={agent.status} />
    </article>)}</div> : <div className="cc-authority-map"><p>{registryComplete ? "The complete registry reports no agents." : "Expected authority roles — registration and live state unverified:"}</p>{!registryComplete && <ul>{EXPECTED_ROLES[source].map((name) => <li key={name}>{name}</li>)}</ul>}</div>}
  </Card>;
}

function Overview({ data }) {
  const unknownSources = data.coverage.filter((item) => item.state !== "live");
  return <div className="cc-stack">
    <Card className="cc-overview-hero"><p className="cc-eyebrow">Engineering ecosystem</p><h3>One view of the work. Evidence before status.</h3><p>Live state is shown only when a source reports it within the last five minutes. Missing feeds and stale reports stay unknown.</p></Card>
    <div className="cc-overview-grid">
      <Card><p className="cc-eyebrow">Sources</p><h3>{data.coverage.filter((item) => item.state === "live").length} of {data.coverage.length} live</h3>{data.coverage.map((source) => <p className="cc-source-line" key={source.source}>{SOURCE_LABELS[source.source]} <Badge value={source.state} /></p>)}</Card>
      <Card><p className="cc-eyebrow">Needs attention</p><h3>{data.counts.blocked ?? "Unknown"}</h3><p>{data.counts.blocked == null ? "Complete authority feeds are required for ecosystem-wide agent totals." : "Agents currently reporting blocked status."}</p></Card>
      <Card><p className="cc-eyebrow">Reported open audits</p><h3>{unknownSources.length ? "Unknown" : data.audits.filter((item) => ["open", "remediating", "awaiting_reaudit", "fail", "blocked"].includes(item.status)).length}</h3><p>Only audits explicitly reported by connected sources appear here.</p></Card>
    </div>
    <Card><div className="cc-card-head"><h3>Latest verified activity</h3><span className="cc-muted">{data.events.length ? `${data.events.length} reported` : "Unknown"}</span></div>{data.events.length ? <div className="cc-list">{data.events.slice(0, 8).map((event) => <article className="cc-row" key={`${event.source}:${event.id}`}><span className="cc-agent-node" aria-hidden="true" /><div className="cc-row-main"><strong>{event.summary}</strong><small>{event.kind} · {event.project || "Project unknown"} · {when(event.at)}</small></div></article>)}</div> : <Empty label="No verified activity" coverage={!unknownSources.length} />}</Card>
  </div>;
}

function Records({ items, type, coverage }) {
  if (!items.length) return <Empty label={`No verified ${type.toLowerCase()}`} coverage={coverage} />;
  const primary = (item) => type === "Handoffs" ? item.id : item.title || item.name || item.summary || item.project || item.id;
  const secondary = (item) => {
    if (type === "Handoffs") return `${item.from} → ${item.to} · Delivered ${when(item.deliveredAt)} · Acknowledged ${when(item.acknowledgedAt)}`;
    if (type === "Audits") return `${item.project || "Project unknown"} · Severity: ${item.severity} · ${item.findings == null ? "Findings unknown" : `${item.findings} findings`} · Audit owner: ${item.owner || "unknown"} · Remediation: ${item.remediationOwner || "unknown"} · Re-audit: ${item.reAuditStatus} · Evidence: ${item.evidenceRef || "unknown"}`;
    if (type === "Releases") return `${item.project || "Project unknown"} · ${item.blockers.length ? item.blockers.join("; ") : "No blockers reported"}`;
    if (type === "Activity") return `${item.kind} · ${item.project || "Project unknown"} · ${when(item.at)}`;
    if (type === "Builds") return `${item.project || "Project unknown"} · ${item.branch || "Branch unknown"} · ${item.commit || "Commit unknown"} · ${when(item.updatedAt)}`;
    return `${item.project || "Project unknown"} · ${when(item.updatedAt || item.at)}`;
  };
  return <div className="cc-list">{items.map((item) => <article className="cc-row" key={`${item.source}:${item.id}`}><span className="cc-agent-node" aria-hidden="true" /><div className="cc-row-main"><strong>{primary(item)}</strong><small>{secondary(item)}</small></div>{item.status && <Badge value={item.status} />}</article>)}</div>;
}

export function CommandCenter({ api, previewMode, view, onViewChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const snapshot = data || (error ? { ...EMPTY_COMMAND_CENTER, coverage: EMPTY_COMMAND_CENTER.coverage.map((source) => ({ ...source, state: "unavailable" })) } : EMPTY_COMMAND_CENTER);
  const coverageKnown = snapshot.coverage.every((item) => item.state === "live");

  async function refresh() {
    if (previewMode) return;
    setLoading(true);
    try {
      const response = await api("/api/admin-command-center");
      setData(response.commandCenter);
      setError("");
    } catch (requestError) {
      setData(null);
      setError(requestError.message || "Telemetry is unavailable.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (previewMode) return undefined;
    refresh();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [previewMode]);

  const title = COMMAND_VIEWS.find(([id]) => id === view)?.[1] || "Live Agents";
  const records = view === "activity" ? snapshot.events : snapshot[view];
  return <main className="page-content cc-page">
    <div className="section-heading page-heading cc-heading"><div><p className="cc-eyebrow">Command Center / read-only</p><h2>{title}</h2><p>Operational signals from the public ecosystem and app product family.</p></div><button className="button" type="button" onClick={refresh} disabled={loading || previewMode}><RefreshCw size={15} />{loading ? "Refreshing…" : "Refresh"}</button></div>
    <nav className="cc-tabs" aria-label="Command Center views">{COMMAND_VIEWS.map(([id, label]) => <button type="button" key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => onViewChange(id)}>{label}</button>)}</nav>
    {previewMode && <div className="cc-notice" role="status">Local preview. Live telemetry requires the protected admin API.</div>}
    {error && <div className="cc-notice" role="alert">{error} All operational states are unknown until the feed recovers.</div>}
    <div className="cc-source-strip" aria-label="Telemetry coverage">{snapshot.coverage.map((source) => <span key={source.source}>{SOURCE_LABELS[source.source]} <Badge value={source.state} /> <small>{source.observedAt ? `Last report ${when(source.observedAt)}` : "No report"}{source.state === "live" && !source.registryComplete ? " · Agent registry partial" : ""}</small></span>)}</div>
    {view === "agents" && <><div className="cc-metrics" aria-label="Live agent counts">{[["Registered", "registered"], ["Working", "working"], ["Waiting", "waiting"], ["Blocked", "blocked"], ["Idle", "idle"]].map(([label, key]) => <div key={key}><strong>{snapshot.counts[key] ?? "UNKNOWN"}</strong><span>{label}</span></div>)}</div><p className="cc-freshness">Ecosystem totals appear only when both authority feeds and agent registries are complete. Agent state older than five minutes becomes unknown.</p><div className="cc-stack"><AgentGroup source="public-ecosystem" agents={snapshot.agents} coverage={snapshot.coverage} /><AgentGroup source="app-family" agents={snapshot.agents} coverage={snapshot.coverage} /></div></>}
    {view === "command-center" && <Overview data={snapshot} />}
    {!["agents", "command-center"].includes(view) && <div className="cc-stack"><Card><div className="cc-card-head"><div><p className="cc-eyebrow">Reported records</p><h3>{title}</h3></div><span className="cc-muted">{coverageKnown ? `${records.length} reported` : "Coverage incomplete"}</span></div><Records items={records} type={title} coverage={coverageKnown} /></Card>{view === "projects" && <Card><div className="cc-card-head"><h3>Builds</h3><span className="cc-muted">{coverageKnown ? `${snapshot.builds.length} reported` : "Coverage incomplete"}</span></div><Records items={snapshot.builds} type="Builds" coverage={coverageKnown} /></Card>}</div>}
    <p className="cc-footnote"><Activity size={13} /> Read-only view. Reporting a state does not acknowledge a handoff, close an audit, clear a release gate, or authorize an agent action.</p>
  </main>;
}
