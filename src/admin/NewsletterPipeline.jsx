import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUpRight, CalendarDays, Check, Download, Mail, Plus, RefreshCw, Search, ShieldCheck, Upload, X } from "lucide-react";
import { STAGES, MAX_PIPELINE_BYTES, UGC_FIELDS, applyPipelineChange, attentionReason, emptyPipeline, localDay, normalizePipeline, normalizeProspect } from "../../lib/admin/newsletterPipeline.js";
import "./newsletter.css";
import { REPLY_FOOTER } from "../../lib/admin/pipelineReplies.js";

function stamp(value) { return value ? new Date(value).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " ET" : "Not recorded"; }
function download(pipeline) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(pipeline, null, 2)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = `${pipeline.service_type || "newsletter"}-pipeline-${localDay()}.json`; a.click(); URL.revokeObjectURL(url);
}
function newProspect(service_type) {
  return { id: `prospect_${crypto.randomUUID().replaceAll("-", "")}`, service_type, ugc_brief: {}, business: "", email: "", sector: "", stage: "researched", next_action: "Review business fit", next_date: "", proposal_url: "", contact_source: "", notes: "", suppressed: false, suppression_reason: "", message_id: "", thread_id: "", sent_verified: false, sent_at: "", reply_at: "", evidence_at: "" };
}
export default function NewsletterPipeline({ api, previewMode, visible, onCreateQuote, quoteReady, service = "newsletter" }) {
  const ugc = service === "ugc";
  const label = ugc ? "UGC ad" : "newsletter";
  const endpoint = ugc ? "/api/admin-ugc-pipeline" : "/api/admin-newsletter-pipeline";
  const [pipeline, setPipeline] = useState(() => emptyPipeline(service));
  const [loaded, setLoaded] = useState(previewMode);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [draft, setDraft] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const fileInput = useRef(null);
  const [replyEdits, setReplyEdits] = useState({});
  async function refresh() {
    if (previewMode) return;
    setLoading(true); setError("");
    try { const data = await api(endpoint); setPipeline(normalizePipeline(data.pipeline)); setLoaded(true); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { if (visible && !loaded && !loading) refresh(); }, [visible]);
  useEffect(() => {
    if (!visible || previewMode) return;
    const timer = setInterval(() => { if (!busy && !dirty && !pendingImport) refresh(); }, 60000);
    return () => clearInterval(timer);
  }, [visible, previewMode, busy, dirty, pendingImport]);
  useEffect(() => {
    if (!dirty && !pendingImport && !Object.keys(replyEdits).length) return;
    function warn(e) { e.preventDefault(); e.returnValue = ""; }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pendingImport, replyEdits]);
  async function persist(change) {
    setBusy(true); setError(""); setNotice("");
    try {
      const next = previewMode ? { ...applyPipelineChange(pipeline, change), revision: pipeline.revision + 1, updated_at: new Date().toISOString() }
        : normalizePipeline((await api(endpoint, { method: "POST", body: JSON.stringify({ ...change, expected_revision: pipeline.revision }) })).pipeline);
      setPipeline(next);
      setDraft(change.operation === "upsert" ? next.prospects.find((p) => p.id === change.prospect.id) : null);
      setDirty(false); setPendingImport(null);
      if (change.operation === "approve_reply") setReplyEdits(edits => { const next = { ...edits }; delete next[change.prospect_id]; return next; });
      setNotice(previewMode ? "Updated in this preview session only. Production storage has not changed." : "Saved to encrypted admin storage.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function chooseFile(event) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    setError("");
    try {
      if (file.size > MAX_PIPELINE_BYTES) throw new Error("Import exceeds 2 MiB. Split it into smaller batches.");
      const incoming = normalizePipeline(JSON.parse(await file.text()));
      if (incoming.service_type !== service) throw new Error("Choose an export for this service. Newsletter and UGC records are kept separate.");
      setPendingImport(incoming);
    } catch (e) { setError(e.message); }
  }
  function select(p) {
    if (dirty && !window.confirm("Discard the unsaved prospect changes?")) return;
    setDraft({ ...p }); setDirty(false); setError("");
  }
  function field(key, value) { setDraft((d) => ({ ...d, [key]: value })); setDirty(true); }
  function editReply(p, key, value) { setReplyEdits(edits => ({ ...edits, [p.id]: { ...(edits[p.id] || { reply_message_id: p.reply.message_id, subject: p.reply.subject, body: p.reply.suggested_body }), [key]: value } })); }
  const today = localDay();
  const attention = pipeline.prospects.filter((p) => attentionReason(p, today)).sort((a, b) => Number(b.stage === "reply_received") - Number(a.stage === "reply_received") || (a.next_date || "9999").localeCompare(b.next_date || "9999") || a.business.localeCompare(b.business));
  const rows = pipeline.prospects.filter((p) => {
    const match = `${p.business} ${p.email} ${p.sector}`.toLowerCase().includes(query.toLowerCase());
    return match && (filter === "all" || (filter === "attention" ? attentionReason(p, today) : p.stage === filter));
  }).sort((a, b) => Number(Boolean(attentionReason(b, today))) - Number(Boolean(attentionReason(a, today))) || (a.next_date || "9999").localeCompare(b.next_date || "9999") || a.business.localeCompare(b.business));
  const health = pipeline.sender_health;
  const sourceStale = !pipeline.source_checked_at || Date.now() - Date.parse(pipeline.source_checked_at) > 24 * 60 * 60 * 1000 || Date.parse(pipeline.source_checked_at) > Date.now();
  const freshHealth = health?.checked_at && Date.now() - Date.parse(health.checked_at) >= 0 && Date.now() - Date.parse(health.checked_at) < 24 * 60 * 60 * 1000;
  const authPass = freshHealth && [health.spf, health.dkim, health.dmarc].every((s) => s === "pass");
  const stageCounts = (stage) => pipeline.prospects.filter((p) => p.stage === stage).length;
  return <section className="page-content newsletter-page" hidden={!visible}>
    <div className="newsletter-heading">
      <div><p className="newsletter-eyebrow">BUSINESS DEVELOPMENT / {ugc ? "UGC ADS" : "NEWSLETTERS"}</p><h1>Every opportunity.<br /><span>A clear next step.</span></h1><p>Review replies, keep promises and move the right businesses forward.</p></div>
      <div className="newsletter-actions"><button className="button" onClick={() => fileInput.current.click()} disabled={busy || loading}><Upload size={16} />Import update</button><button className="button" disabled={!pipeline.prospects.length} onClick={() => download(pipeline)}><Download size={16} />Export</button><button className="button" disabled={previewMode || loading || busy} onClick={refresh}><RefreshCw size={16} />Refresh saved data</button></div>
      <input ref={fileInput} type="file" accept="application/json,.json" aria-label="Import private pipeline JSON" hidden onChange={chooseFile} />
    </div>
    <div className="newsletter-health"><ShieldCheck size={22} /><div><strong>{authPass ? "Recorded authentication passed — check again before sending" : "New outreach on hold — verify sender authentication"}</strong><p>{health?.note || "SPF, DKIM and DMARC have not been verified. Prepare proposals while sender checks are completed."}</p><small>Evidence: {stamp(health?.checked_at)}{!freshHealth && " · Missing or stale"}. Recorded checks are not a live connection.</small></div><div className="newsletter-checks">{["spf", "dkim", "dmarc"].map((key) => <span key={key}>{key.toUpperCase()}<b>{health?.[key] || "unknown"}</b></span>)}</div></div>
    <div className="newsletter-stats">{[["Prospects", pipeline.prospects.length, "Each business has its own record"], ["Need attention", attention.length, "Replies, dates and missing next steps"], ["Awaiting reply", stageCounts("awaiting_reply"), "Accepted send ≠ recipient delivery"], ["Paid engagements", stageCounts("paid"), "Only confirmed paid work"]].map(([label, count, caption]) => <div key={label}><span>{label}</span><strong>{count}</strong><small>{caption}</small></div>)}</div>
    <div className="newsletter-cadence"><CalendarDays size={17} /><span>{ugc ? "UGC outreach is manual · shares the same account sending limit" : "Daily workflow · 9 AM Eastern · target up to 50 outreach / rolling 24h"}</span><span>{health?.account_sent_24h ?? "Unknown"} account sends in last recorded 24h</span></div>
    <p className="newsletter-freshness">Last source review: {stamp(pipeline.source_checked_at)} · Last saved: {stamp(pipeline.updated_at)}. Saved records refresh every minute while this page is open. The Gmail worker checks replies separately; queued is not sent.</p>
    {pipeline.prospects.length > 0 && sourceStale && <div className="newsletter-feedback error" role="status"><AlertTriangle size={17} />Source evidence is missing or over a day old. Import the latest pipeline update before deciding on follow-ups.</div>}
    {error && <div className="newsletter-feedback error" role="alert"><AlertTriangle size={17} /><span>{error} Your unsaved draft remains here.</span></div>}
    {notice && <div className="newsletter-feedback" role="status"><Check size={17} />{notice}</div>}
    {loading && <p role="status">Loading protected pipeline…</p>}
    {!loaded && !loading && <div className="newsletter-empty"><h2>Pipeline could not be loaded</h2><p>Retry before importing or editing. Existing records have not been replaced.</p><button className="button primary" onClick={refresh}>Retry loading pipeline</button></div>}
    {pendingImport && <div className="newsletter-import"><div><h2>Review this update</h2><p>{pendingImport.prospects.length} records · source reviewed {stamp(pendingImport.source_checked_at)}. Existing owner notes and dates are preserved; new suppression and reply evidence are applied.</p><small>This import does not send emails or schedule a new automation.</small></div><button className="button primary" disabled={!loaded || busy || dirty} onClick={() => persist({ operation: "import", pipeline: pendingImport })}>{busy ? "Saving…" : "Import and save update"}</button><button className="button" disabled={busy} onClick={() => setPendingImport(null)}>Cancel import</button></div>}
    {loaded && <>
      <section className="newsletter-action-items" aria-label={`${label} action items`}>
        <div className="newsletter-list-heading"><h2>Action items</h2><span>{attention.length} need attention</span></div>
        {attention.length ? <ol>{attention.map(p => <li key={p.id}>
          <div><strong>{p.business}</strong><p>{p.next_action || attentionReason(p, today)}</p><small>{attentionReason(p, today)}{p.next_date ? ` · Review ${p.next_date}` : " · Add a review date"}</small></div>
          <div className="newsletter-actions">
            {p.thread_id && <a className="button" href={`https://mail.google.com/mail/u/?authuser=evan%401ststep.ai#all/${p.thread_id}`} target="_blank" rel="noopener noreferrer">Open conversation <ArrowUpRight size={14} /></a>}
            {p.proposal_url && <a className="button" href={p.proposal_url} target="_blank" rel="noopener noreferrer">View samples <ArrowUpRight size={14} /></a>}
            <button className="button" onClick={() => select(p)}>Edit task</button>
          </div>
          {p.reply && <div className="newsletter-reply">
            <strong>Reply received · {stamp(p.reply.received_at)}</strong><p>{p.reply.summary}</p>
            {p.outbox && <details><summary>Approved message</summary><strong>{p.outbox.subject}</strong><pre>{p.outbox.body}</pre></details>}
            {p.outbox && <div role="status"><strong>{p.outbox.state === "sent" ? "Sent — Gmail accepted the message" : `Reply ${p.outbox.state}`}</strong>{p.outbox.error && <p>{p.outbox.error}</p>}{p.outbox.state === "queued" && <p>Your exact approved message is waiting for the Gmail worker. Do not send it again.</p>}{p.outbox.sent_message_id && <a href={`https://mail.google.com/mail/u/?authuser=evan%401ststep.ai#all/${p.outbox.sent_thread_id}`} target="_blank" rel="noopener noreferrer">View sent receipt</a>}{["queued", "blocked"].includes(p.outbox.state) && <button className="button" disabled={busy || previewMode} onClick={() => persist({ operation: "cancel_reply", prospect_id: p.id, approval_id: p.outbox.id })}>Cancel queued reply</button>}</div>}
            {p.reply.suggested_body && (!p.outbox || p.outbox.reply_message_id !== p.reply.message_id || ["blocked", "cancelled"].includes(p.outbox.state)) && <form onSubmit={e => { e.preventDefault(); const edited = replyEdits[p.id] || { reply_message_id: p.reply.message_id, subject: p.reply.subject, body: p.reply.suggested_body }; persist({ operation: "approve_reply", prospect_id: p.id, approval_id: `reply_${crypto.randomUUID().replaceAll("-", "")}`, ...edited }); }}>
              <p>Suggested reply · To {p.email} · From evan@1ststep.ai</p>
              <label className="field">Reply subject<input required maxLength={250} value={replyEdits[p.id]?.subject ?? p.reply.subject} disabled={busy} onChange={e => editReply(p, "subject", e.target.value)} /></label>
              <label className="field">Reply message<textarea required rows={5} maxLength={6000} value={replyEdits[p.id]?.body ?? p.reply.suggested_body} disabled={busy} onChange={e => editReply(p, "body", e.target.value)} /></label>
              {replyEdits[p.id] && replyEdits[p.id].reply_message_id !== p.reply.message_id && <p role="alert">A newer reply arrived. <button type="button" disabled={busy} onClick={() => setReplyEdits(edits => { const next = { ...edits }; delete next[p.id]; return next; })}>Use latest suggested reply</button></p>}
              <pre>{REPLY_FOOTER}</pre>
              <button className="button primary" type="submit" disabled={busy || dirty || pendingImport || p.suppressed || (p.stage === "follow_up_scheduled" && p.next_date > today)}>{previewMode ? "Queue in preview only" : "Send reviewed reply"}</button><small>Your click approves this exact message and footer. Sending is queued through your existing Gmail connection, subject to timing and sender limits.</small>
            </form>}
          </div>}
        </li>)}</ol> : <p className="newsletter-freshness">No action items need attention. Scheduled next steps remain visible in the prospect list.</p>}
        <p className="newsletter-freshness">Tasks come from saved records. Review dates are reminders; opening a task does not send an email.</p>
      </section>
      <div className="newsletter-import"><div><h2>Turn interest into a clear offer</h2><p>{ugc ? "Define the ad concept, deliverables and licensed usage, then set your price." : "Four-week pilot · 4 branded newsletters · proposed $600, editable before sending."}</p><small>{ugc ? "Creator consent, final-ad approval and paid-ad rights must be agreed. No publishing or media spend is included by default." : "Copy, design, subject lines and one revision per issue. Client approves and sends. No automatic renewal."}</small></div><button className="button" disabled={!quoteReady} onClick={() => onCreateQuote()}>Create blank {label} quote</button></div>
      <div className="newsletter-toolbar"><div className="newsletter-tabs"><button className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All prospects</button><button className={`${filter === "attention" ? "selected" : ""} ${attention.length && !draft && !pendingImport ? "primary-queue" : ""}`} onClick={() => setFilter("attention")}>Needs attention <b>{attention.length}</b></button></div><label className="newsletter-search"><Search size={17} /><input placeholder="Search businesses or email…" aria-label={`Search ${label} prospects`} value={query} onChange={(e) => setQuery(e.target.value)} /></label><label className="field"><span className="sr-only">Filter pipeline stage</span><select aria-label="Filter pipeline stage" value={Object.hasOwn(STAGES, filter) ? filter : "all"} onChange={(e) => setFilter(e.target.value)}><option value="all">All stages</option>{Object.entries(STAGES).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label><button className="button" onClick={() => select(newProspect(service))} disabled={busy || pendingImport}><Plus size={16} />Add prospect</button></div>
      <div className={`newsletter-layout ${draft ? "with-detail" : ""}`}>
        <div className="newsletter-list"><div className="newsletter-list-heading"><h2>{filter === "attention" ? "Your attention queue" : ugc ? "UGC ad pipeline" : "Newsletter pipeline"}</h2><span>{rows.length} businesses</span></div>
          {rows.length === 0 ? <div className="newsletter-empty"><Mail size={30} /><h3>{pipeline.prospects.length ? "No matching prospects" : ugc ? "Add your first UGC prospect" : "Start with the work already done"}</h3><p>{pipeline.prospects.length ? "Change the search or stage filter to see other records." : ugc ? "Add a business, outline an ad concept and save a clear next step. You can also import a UGC pipeline export." : "Import the private pipeline export to bring in sent proposals, replies and suppression records."}</p>{!pipeline.prospects.length && <button className="button" onClick={() => fileInput.current.click()}>Choose pipeline export</button>}</div> : <div className="newsletter-rows">{rows.map((p) => <button key={p.id} className={`newsletter-row ${draft?.id === p.id ? "selected" : ""}`} onClick={() => select(p)}>
            <span className="newsletter-avatar" aria-hidden="true">{p.business.slice(0, 2).toUpperCase()}</span><span className="newsletter-business"><strong>{p.business}</strong><small>{p.sector || "Business"} · {p.email || "Contact needed"}</small>{p.reply && <small>Latest reply: {p.reply.summary}</small>}</span><span className={`newsletter-stage ${p.suppressed ? "suppressed" : ""}`}>{STAGES[p.stage]}{p.outbox ? ` · Reply ${p.outbox.state}` : ""}</span><span className="newsletter-next"><strong>{p.next_action || attentionReason(p, today) || "No next action recorded"}</strong><small>{p.suppressed ? "Suppressed · no further outreach" : [attentionReason(p, today), p.next_date ? `Review ${p.next_date}` : "Review date needed"].filter(Boolean).join(" · ")}</small></span><ArrowUpRight size={17} />
          </button>)}</div>}
        </div>
        {draft && <form className="newsletter-detail" aria-label="Prospect details" onSubmit={(e) => { e.preventDefault(); try { persist({ operation: "upsert", prospect: normalizeProspect(draft) }); } catch (err) { setError(err.message); } }}>
          <div className="newsletter-list-heading"><h2>{draft.business || "New prospect"}</h2><button type="button" className="icon-button" aria-label="Close prospect details" disabled={busy} onClick={() => { if (!dirty || window.confirm("Discard the unsaved prospect changes?")) { setDraft(null); setDirty(false); } }}><X size={18} /></button></div>
          {[["business", "Business", "text"], ["email", "Business email", "email"], ["sector", "Business type", "text"]].map(([key, label, type]) => <label className="field" key={key}>{label}<input type={type} required={key === "business"} value={draft[key]} onChange={(e) => field(key, e.target.value)} disabled={busy} maxLength={key === "business" ? 160 : key === "email" ? 254 : 100} /></label>)}
          <label className="field">Stage<select value={draft.stage} disabled={busy || draft.suppressed} onChange={(e) => field("stage", e.target.value)}>{Object.entries(STAGES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          {(draft.suppressed || ["declined", "no_contact"].includes(draft.stage)) ? <label className="field">Why no further contact?<textarea aria-label="Why no further contact?" required value={draft.suppression_reason} onChange={(e) => field("suppression_reason", e.target.value)} maxLength={500} disabled={busy} /><small>Suppression stays locked across later imports.</small></label> : <><label className="field">Next action<input value={draft.next_action} onChange={(e) => field("next_action", e.target.value)} maxLength={300} disabled={busy} /></label><label className="field">Next review date<input aria-label="Next review date" type="date" value={draft.next_date} onInput={(e) => field("next_date", e.currentTarget.value)} onChange={(e) => field("next_date", e.target.value)} disabled={busy} /><small>A review date is a reminder, not permission to send.</small></label></>}
          {[["proposal_url", "Published proposal"], ["contact_source", "Public contact source"]].map(([key, label]) => <label className="field" key={key}>{label}<input aria-label={label} type="url" value={draft[key]} onChange={(e) => field(key, e.target.value)} disabled={busy} maxLength={1000} />{draft[key]?.startsWith("https://") && <a href={draft[key]} target="_blank" rel="noopener noreferrer">Open {label.toLowerCase()} <ArrowUpRight size={13} /></a>}</label>)}
          {ugc && <fieldset><legend>UGC creative brief</legend>{Object.entries(UGC_FIELDS).map(([key, title]) => <label className="field" key={key}>{title}<textarea rows={2} value={draft.ugc_brief?.[key] || ""} maxLength={1000} disabled={busy} onChange={e => field("ugc_brief", { ...draft.ugc_brief, [key]: e.target.value })} /></label>)}<small>Document real product claims and creator permission. Samples are uncommissioned; no invented testimonials or customer endorsements.</small></fieldset>}
          <label className="field">Notes / reply summary<textarea rows={4} value={draft.notes} onChange={(e) => field("notes", e.target.value)} maxLength={2000} disabled={busy} /></label>
          <div className="newsletter-evidence"><strong>{draft.sent_verified ? "Gmail send verified" : "Send evidence not recorded"}</strong><small>{draft.sent_at ? stamp(draft.sent_at) : "Send time not recorded"}</small>{draft.thread_id && <a href={`https://mail.google.com/mail/u/?authuser=evan%401ststep.ai#all/${draft.thread_id}`} target="_blank" rel="noopener noreferrer">Open Gmail conversation <ArrowUpRight size={13} /></a>}<small>{draft.sent_verified ? "SENT label confirms account acceptance. Inbox placement is unknown." : "Import verified send IDs; changing a stage does not prove delivery."}</small></div>
          <button className="button primary full" type="submit" disabled={busy || pendingImport}>{busy ? "Saving…" : previewMode ? "Save in preview session" : "Save prospect"}</button><p className="newsletter-freshness">No email will be sent by saving this record.</p>
          <button className="button full" type="button" disabled={!quoteReady || busy || dirty || pendingImport || draft.suppressed || ["declined", "no_contact"].includes(draft.stage)} onClick={() => { try { onCreateQuote(normalizeProspect(draft)); } catch (err) { setError(err.message); } }}>Create {label} quote for this business</button><small>Save prospect edits first. Opens an editable draft; nothing is sent.</small>
        </form>}
      </div>
    </>}
  </section>;
}
