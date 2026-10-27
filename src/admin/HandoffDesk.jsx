import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Download, Plus, RefreshCw } from "lucide-react";
import { normalizeHandoffBoard, PROOF_HONESTY, PROOF_LEVELS, renderHandoffMarkdown } from "../../lib/admin/agentHandoff.js";
import { previewConnections, STATUS_LABELS } from "../../lib/admin/handoffConnectionCatalog.js";
import { BRIDGE_READ_EXAMPLE, evaluateToolChoice } from "../../lib/admin/toolChoice.js";

function recordId(prefix) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function money(cents) {
  if (cents === null || cents === undefined) return "Unknown";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
}

function dollarsToCents(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function emptyTask() {
  return {
    id: recordId("task"),
    title: "Next step",
    status: "open",
    goal: "",
    current_state: "",
    decisions: "",
    blockers: "",
    next_action: "Describe the next concrete action.",
    links: [],
    source_sha: "",
    tested_sha: "",
    proof: { level: "none", evidence: [], verification_notes: "" },
    tool_decision: null,
  };
}

function emptyProject() {
  return {
    id: recordId("proj"),
    name: "New project",
    business: "",
    brand_notes: "",
    repository_url: "",
    decision_log: "",
    budget_limit_cents: null,
    budget_spent_cents: 0,
    tools: [],
    tasks: [emptyTask()],
  };
}

const PROOF_COPY = {
  none: "No proof recorded",
  claimed: "Claimed",
  tested: "Tested",
  deployed: "Deployed",
  production_verified: "Production-verified",
};

function bridgeCopy(bridge) {
  if (!bridge || bridge.state === "not_configured") return "The bridge is not configured. No tasks were assumed.";
  if (bridge.state === "disconnected") return bridge.message || "The bridge is disconnected. No tasks were assumed.";
  if (bridge.state === "health_only") return bridge.message || "Only a health check succeeded. The queue was not read.";
  if (bridge.state === "connected") return "The bridge answered a read-only call during this request.";
  return "Bridge status was not checked.";
}

export default function HandoffDesk({ previewMode, request }) {
  const [board, setBoard] = useState({ revision: 0, updated_at: null, projects: [] });
  const [bridge, setBridge] = useState(previewMode
    ? { state: "not_configured", message: "Not checked in local preview.", tasks: [], checkpoints: [], proof_note: "" }
    : null);
  const [connections, setConnections] = useState(previewMode ? previewConnections() : []);
  const [storageMessage, setStorageMessage] = useState("");
  const [projectId, setProjectId] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!previewMode);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const project = board.projects.find((item) => item.id === projectId) || null;
  const task = project?.tasks.find((item) => item.id === taskId) || null;
  const evaluation = useMemo(() => {
    if (!project || !task?.tool_decision) return null;
    return evaluateToolChoice({
      need: task.tool_decision.need,
      inventory: project.tools,
      candidates: task.tool_decision.candidates,
      budgetLimitCents: project.budget_limit_cents,
      budgetSpentCents: project.budget_spent_cents,
      ownerApproved: task.tool_decision.owner_approved === true,
      ownerApprovedOverBudget: task.tool_decision.owner_approved_over_budget === true,
    });
  }, [project, task]);

  async function load() {
    if (previewMode) return;
    setLoading(true);
    setError("");
    try {
      const data = await request("/api/admin-handoffs");
      if (data.board) {
        setBoard(data.board);
        const first = data.board.projects[0];
        setProjectId(first?.id || null);
        setTaskId(first?.tasks[0]?.id || null);
      } else {
        setBoard({ revision: 0, updated_at: null, projects: [] });
      }
      setBridge(data.bridge);
      setConnections(data.connections || []);
      setStorageMessage(data.storage?.state === "ready" ? "" : data.storage?.message || "");
      setDirty(false);
    } catch (requestError) {
      setError(requestError.message || "Handoffs could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [previewMode]);

  function updateProject(projectIdToUpdate, updater) {
    setDirty(true);
    setBoard((current) => ({
      ...current,
      projects: current.projects.map((item) => item.id === projectIdToUpdate ? updater(item) : item),
    }));
  }

  function updateTask(updater) {
    if (!project || !task) return;
    updateProject(project.id, (item) => ({
      ...item,
      tasks: item.tasks.map((entry) => entry.id === task.id ? updater(entry) : entry),
    }));
  }

  function addProject() {
    const created = emptyProject();
    setDirty(true);
    setBoard((current) => ({ ...current, projects: [...current.projects, created] }));
    setProjectId(created.id);
    setTaskId(created.tasks[0].id);
  }

  function loadExample() {
    const created = {
      ...emptyProject(),
      name: "Bridge read",
      business: "",
      brand_notes: "",
      decision_log: "Reuse the existing bridge MCP. A hosted tracker was not priced, and a second task database would duplicate the bridge.",
      budget_limit_cents: 0,
      budget_spent_cents: 0,
      tools: [{ id: recordId("tool"), name: "Existing bridge MCP", kind: "owned" }],
      tasks: [{
        ...emptyTask(),
        title: "Read the bridge from Studio",
        goal: "Show this project's tasks, handoffs, blockers, and next action without a previous chat.",
        current_state: "The bridge is a local MCP service. Studio does not assume it is running.",
        next_action: "Verify the Studio read connection, then copy the handoff for the next agent.",
        tool_decision: {
          need: BRIDGE_READ_EXAMPLE.need,
          candidates: BRIDGE_READ_EXAMPLE.candidates,
          owner_approved: false,
          owner_approved_over_budget: false,
        },
      }],
    };
    setDirty(true);
    setBoard((current) => ({ ...current, projects: [...current.projects, created] }));
    setProjectId(created.id);
    setTaskId(created.tasks[0].id);
    setMessage("Example loaded in this project. It is not a live customer record.");
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      if (previewMode) {
        const normalized = normalizeHandoffBoard(board, evaluateToolChoice);
        setBoard({ ...normalized, revision: board.revision + 1, updated_at: new Date().toISOString() });
        setDirty(false);
        setMessage("Kept in this preview session. Nothing was uploaded.");
        return;
      }
      const data = await request("/api/admin-handoffs", {
        method: "PUT",
        body: JSON.stringify({ expected_revision: board.revision, board }),
      });
      setBoard(data.board);
      setDirty(false);
      setMessage("Handoff saved.");
    } catch (requestError) {
      setError(requestError.message || "The handoff could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function verify(platform) {
    if (previewMode) return;
    setError("");
    try {
      const data = await request("/api/admin-handoff-connections", {
        method: "POST",
        body: JSON.stringify({ platform }),
      });
      setConnections((current) => current.map((item) => item.id === platform ? data.connection : item));
    } catch (requestError) {
      setError(requestError.message || "The connection check failed.");
    }
  }

  async function copyHandoff() {
    if (!project || !task) return;
    const markdown = renderHandoffMarkdown(project, { ...task, tool_decision: task.tool_decision ? { ...task.tool_decision, evaluation } : null });
    try {
      await navigator.clipboard.writeText(markdown);
      setMessage("Handoff copied.");
    } catch {
      setMessage("Clipboard is unavailable in this browser.");
    }
  }

  function downloadHandoff() {
    if (!project || !task) return;
    const markdown = renderHandoffMarkdown(project, { ...task, tool_decision: task.tool_decision ? { ...task.tool_decision, evaluation } : null });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${project.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "handoff"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="page-content"><p className="handoff-note">Loading handoffs…</p></div>;
  }

  return (
    <div className="page-content handoff-page">
      <div className="section-heading page-heading">
        <div>
          <h2>Handoffs</h2>
          <p>Each project keeps its own goal, brand, tools, decisions, and proof. Agents can copy a handoff without the previous chat.</p>
        </div>
        <div className="handoff-actions">
          <button className="button" type="button" onClick={loadExample}>Load bridge example</button>
          <button className="button primary" type="button" onClick={addProject}><Plus size={16} />New project</button>
        </div>
      </div>

      {(error || storageMessage) && (
        <section className="operations-unavailable" role="status">
          <AlertTriangle size={20} />
          <div>
            <strong>{error ? "Handoff action needs attention" : "Storage"}</strong>
            <p>{error || storageMessage}</p>
          </div>
        </section>
      )}

      <section className="handoff-status-grid" aria-label="Bridge and connections">
        <article className="operations-panel">
          <div className="operations-panel-title">
            <div>
              <h3>Bridge</h3>
              <p>{bridgeCopy(bridge)}</p>
            </div>
            <button className="button compact" type="button" onClick={load} disabled={previewMode || loading}>
              <RefreshCw size={14} />Refresh
            </button>
          </div>
          {bridge?.state === "connected" ? (
            <div className="operations-list">
              {bridge.tasks.length === 0 && <article><div><strong>No bridge tasks</strong><small>The read succeeded and the queue is empty.</small></div></article>}
              {bridge.tasks.map((item) => (
                <article key={item.id}>
                  <div><strong>{item.title}</strong><small>{item.status} · {item.assigned_to}</small></div>
                </article>
              ))}
              {bridge.checkpoints.filter((item) => item.next_action).map((item) => (
                <article key={`${item.role}-${item.id || item.created_at}`}>
                  <div><strong>{item.role}</strong><small>{item.blockers ? `Blocked: ${item.blockers}` : "No blocker recorded"} · Next: {item.next_action}</small></div>
                </article>
              ))}
            </div>
          ) : (
            <p className="handoff-note">{bridge?.proof_note || "Disconnected and empty states stay visible. Nothing is marked healthy by default."}</p>
          )}
          {bridge?.proof_note && <p className="operations-evidence">{bridge.proof_note}</p>}
        </article>

        <article className="operations-panel">
          <div className="operations-panel-title"><div><h3>Connections</h3><p>Verified means this check succeeded. A stored credential is not enough.</p></div></div>
          <div className="operations-list">
            {connections.map((connection) => (
              <article key={connection.id}>
                <div>
                  <strong>{connection.label}</strong>
                  <small>{connection.message}</small>
                  <small>Next: {connection.next_step}</small>
                </div>
                <div className="handoff-connection-meta">
                  <span className={`operations-chip ${connection.status === "connected_verified" ? "healthy" : connection.status === "blocked" ? "attention" : "unknown"}`}>
                    {STATUS_LABELS[connection.status] || connection.status}
                  </span>
                  <button className="button compact" type="button" disabled={previewMode} onClick={() => verify(connection.id)}>Verify</button>
                </div>
              </article>
            ))}
          </div>
        </article>
      </section>

      {board.projects.length === 0 ? (
        <div className="empty-state">
          <h2>No projects yet</h2>
          <p>Add a project for one business. Its notes, budget, and proof stay separate from every other project.</p>
          <button className="button primary" type="button" onClick={addProject}><Plus size={16} />New project</button>
        </div>
      ) : (
        <div className="split-page handoff-split">
          <aside className="list-panel">
            {board.projects.map((item) => (
              <button
                key={item.id}
                className={item.id === projectId ? "handoff-project active" : "handoff-project"}
                type="button"
                onClick={() => { setProjectId(item.id); setTaskId(item.tasks[0]?.id || null); }}
              >
                <strong>{item.name}</strong>
                <span>{item.business || "Business not set"} · {item.tasks.length} tasks</span>
              </button>
            ))}
          </aside>

          {project && (
            <section className="editor-panel">
              <div className="form-grid two">
                <label className="field">Project
                  <input aria-label="Project name" value={project.name} onChange={(event) => updateProject(project.id, (item) => ({ ...item, name: event.target.value }))} />
                </label>
                <label className="field">Business
                  <input aria-label="Business" value={project.business} onChange={(event) => updateProject(project.id, (item) => ({ ...item, business: event.target.value }))} />
                </label>
                <label className="field">Repository
                  <input aria-label="Repository URL" value={project.repository_url} placeholder="https://" onChange={(event) => updateProject(project.id, (item) => ({ ...item, repository_url: event.target.value }))} />
                </label>
                <label className="field">Owned tool
                  <input
                    aria-label="Owned tool"
                    value={project.tools[0]?.name || ""}
                    placeholder="Tool this project already has"
                    onChange={(event) => updateProject(project.id, (item) => ({
                      ...item,
                      tools: event.target.value ? [{ id: item.tools[0]?.id || recordId("tool"), name: event.target.value, kind: "owned" }] : [],
                    }))}
                  />
                </label>
                <label className="field">Monthly budget (USD)
                  <input
                    aria-label="Monthly budget"
                    inputMode="decimal"
                    value={project.budget_limit_cents === null ? "" : (project.budget_limit_cents / 100).toString()}
                    placeholder="No budget set"
                    onChange={(event) => updateProject(project.id, (item) => ({ ...item, budget_limit_cents: dollarsToCents(event.target.value) }))}
                  />
                  <small>{project.budget_limit_cents === null ? "No budget set. A new charge still needs approval." : `Budget ${money(project.budget_limit_cents)}`}</small>
                </label>
                <label className="field">Recorded spend (USD)
                  <input
                    aria-label="Recorded spend"
                    inputMode="decimal"
                    value={(project.budget_spent_cents / 100).toString()}
                    onChange={(event) => updateProject(project.id, (item) => ({ ...item, budget_spent_cents: dollarsToCents(event.target.value) || 0 }))}
                  />
                  <small>Entered for this project. No usage meter is connected.</small>
                </label>
              </div>
              <label className="field handoff-wide">Brand notes
                <textarea aria-label="Brand notes" rows={2} value={project.brand_notes} onChange={(event) => updateProject(project.id, (item) => ({ ...item, brand_notes: event.target.value }))} />
                <small>Kept on this project only.</small>
              </label>
              <label className="field handoff-wide">Project decisions
                <textarea aria-label="Project decisions" rows={2} value={project.decision_log} onChange={(event) => updateProject(project.id, (item) => ({ ...item, decision_log: event.target.value }))} />
              </label>

              <div className="handoff-task-bar">
                {project.tasks.map((item) => (
                  <button key={item.id} className={item.id === taskId ? "button compact primary" : "button compact"} type="button" onClick={() => setTaskId(item.id)}>
                    {item.title || "Task"}
                  </button>
                ))}
                <button
                  className="button compact"
                  type="button"
                  onClick={() => {
                    const created = emptyTask();
                    updateProject(project.id, (item) => ({ ...item, tasks: [...item.tasks, created] }));
                    setTaskId(created.id);
                  }}
                ><Plus size={14} />Task</button>
              </div>

              {task && (
                <div className="form-grid">
                  <div className="form-grid two">
                    <label className="field">Task
                      <input aria-label="Task title" value={task.title} onChange={(event) => updateTask((item) => ({ ...item, title: event.target.value }))} />
                    </label>
                    <label className="field">Task status
                      <select aria-label="Task status" value={task.status} onChange={(event) => updateTask((item) => ({ ...item, status: event.target.value }))}>
                        <option value="open">Open</option>
                        <option value="blocked">Blocked</option>
                        <option value="done">Done</option>
                      </select>
                    </label>
                  </div>
                  <label className="field">Goal
                    <textarea aria-label="Goal" rows={2} value={task.goal} onChange={(event) => updateTask((item) => ({ ...item, goal: event.target.value }))} />
                  </label>
                  <label className="field">Current state
                    <textarea aria-label="Current state" rows={3} value={task.current_state} onChange={(event) => updateTask((item) => ({ ...item, current_state: event.target.value }))} />
                  </label>
                  <label className="field">Decisions
                    <textarea aria-label="Decisions" rows={2} value={task.decisions} onChange={(event) => updateTask((item) => ({ ...item, decisions: event.target.value }))} />
                  </label>
                  <label className="field">Blockers
                    <textarea aria-label="Blockers" rows={2} value={task.blockers} onChange={(event) => updateTask((item) => ({ ...item, blockers: event.target.value }))} />
                  </label>
                  <label className="field">Next action
                    <input aria-label="Next action" value={task.next_action} onChange={(event) => updateTask((item) => ({ ...item, next_action: event.target.value }))} />
                  </label>
                  <div className="form-grid two">
                    <label className="field">Source SHA
                      <input aria-label="Source SHA" value={task.source_sha} onChange={(event) => updateTask((item) => ({ ...item, source_sha: event.target.value.trim() }))} />
                    </label>
                    <label className="field">Tested SHA
                      <input aria-label="Tested SHA" value={task.tested_sha} onChange={(event) => updateTask((item) => ({ ...item, tested_sha: event.target.value.trim() }))} />
                    </label>
                  </div>
                  <label className="field">Proof
                    <select aria-label="Proof level" value={task.proof.level} onChange={(event) => updateTask((item) => ({ ...item, proof: { ...item.proof, level: event.target.value } }))}>
                      {PROOF_LEVELS.map((level) => <option key={level} value={level}>{PROOF_COPY[level]}</option>)}
                    </select>
                    <small>{PROOF_HONESTY}</small>
                  </label>
                  <label className="field">Evidence URL
                    <input
                      aria-label="Evidence URL"
                      value={task.proof.evidence[0]?.url || ""}
                      placeholder="https://"
                      onChange={(event) => updateTask((item) => ({
                        ...item,
                        proof: { ...item.proof, evidence: event.target.value ? [{ label: "Evidence", url: event.target.value }] : [] },
                      }))}
                    />
                  </label>
                  <label className="field">Verification notes
                    <textarea aria-label="Verification notes" rows={2} value={task.proof.verification_notes} onChange={(event) => updateTask((item) => ({ ...item, proof: { ...item.proof, verification_notes: event.target.value } }))} />
                  </label>
                  <label className="field">Link
                    <input
                      aria-label="Reference link"
                      value={task.links[0]?.url || ""}
                      placeholder="https://"
                      onChange={(event) => updateTask((item) => ({
                        ...item,
                        links: event.target.value ? [{ label: "Reference", url: event.target.value }] : [],
                      }))}
                    />
                  </label>

                  <div className="handoff-choice">
                    <div>
                      <strong>Tool choice</strong>
                      <p>{evaluation ? evaluation.reason : "Add a need when the task is missing a capability. The choice stays inside this project's budget."}</p>
                    </div>
                    {!task.tool_decision && (
                      <button
                        className="button compact"
                        type="button"
                        onClick={() => updateTask((item) => ({
                          ...item,
                          tool_decision: {
                            need: BRIDGE_READ_EXAMPLE.need,
                            candidates: BRIDGE_READ_EXAMPLE.candidates,
                            owner_approved: false,
                            owner_approved_over_budget: false,
                          },
                        }))}
                      >Use the bridge-read comparison</button>
                    )}
                    {evaluation && (
                      <dl className="handoff-choice-list">
                        <div><dt>Choice</dt><dd>{evaluation.option_name} · {evaluation.choice}</dd></div>
                        <div><dt>Approval</dt><dd>{evaluation.approval === "required" ? "Approval required" : evaluation.approval === "approved" ? "Approved" : "No new charge"}</dd></div>
                        <div><dt>Estimated cost</dt><dd>{evaluation.estimated_cost_label === "unknown" ? "Unknown" : evaluation.estimated_cost_label === "included" ? "Included" : evaluation.estimated_cost_label === "none" ? money(0) : `${money(evaluation.estimated_cost_cents)} estimate`}</dd></div>
                        <div><dt>Savings</dt><dd>{evaluation.savings_label === "estimate" ? `${money(evaluation.savings_cents)} estimate` : evaluation.savings_label === "unknown" ? "Unknown" : "Not applicable"}</dd></div>
                        <div><dt>Actual usage</dt><dd>{evaluation.actual_usage.note}</dd></div>
                        <div><dt>Tradeoff</dt><dd>{evaluation.tradeoff}</dd></div>
                      </dl>
                    )}
                    {evaluation?.approval === "required" && (
                      <button
                        className="button"
                        type="button"
                        onClick={() => updateTask((item) => ({
                          ...item,
                          tool_decision: {
                            ...item.tool_decision,
                            owner_approved: evaluation.within_budget !== false,
                            owner_approved_over_budget: evaluation.within_budget === false,
                          },
                        }))}
                      >Approve this choice</button>
                    )}
                  </div>

                  <div className="handoff-actions">
                    <button className="button" type="button" onClick={save} disabled={saving || (!dirty && !previewMode)}>{saving ? "Saving…" : dirty ? "Save handoff" : "Saved"}</button>
                    <button className="button" type="button" onClick={copyHandoff}><Copy size={15} />Copy handoff</button>
                    <button className="button ghost" type="button" onClick={downloadHandoff}><Download size={15} />Download</button>
                    {message && <span className="save-message" role="status">{message}</span>}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
