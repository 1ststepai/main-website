export const REPLY_FOOTER = "Evan Pancis\n1stStep.ai\nevan@1ststep.ai\n3000 Gates Ct., Morris Plains, NJ 07950\nPrefer no further emails? Reply ‘no thanks’.";
const fail = message => { throw Object.assign(new Error(message), { statusCode: 400, code: "invalid_reply" }); };
function text(value, max, required = false) { if (typeof value !== "string" || value.length > max || (required && !value.trim())) fail("Invalid reply text."); return value.trim(); }
function id(value) { if (!/^[a-f0-9]{10,80}$/i.test(value || "")) fail("Verified Gmail IDs are required."); return value; }
function time(value) { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value || "") || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 19) !== value.slice(0, 19)) fail("Invalid reply time."); return value; }
function subject(value) { const s = text(value, 250, true); if (/[\r\n]/.test(s)) fail("Subjects cannot contain line breaks."); return s; }
export function replyBody(body) { return text(body, 6000, true) + "\n\n" + REPLY_FOOTER; }
export function normalizeReply(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) fail("Invalid reply.");
  return { message_id: id(value.message_id), thread_id: id(value.thread_id), received_at: time(value.received_at), subject: subject(value.subject), summary: text(value.summary, 2000, true), suggested_body: text(value.suggested_body || "", 6000) };
}
export function normalizeOutbox(value) {
  if (value == null) return null;
  if (typeof value !== "object" || Array.isArray(value)) fail("Invalid reply approval.");
  if (!["queued", "sending", "sent", "blocked", "uncertain", "cancelled"].includes(value.state) || !/^[a-zA-Z0-9_-]{16,80}$/.test(value.id || "")) fail("Invalid reply approval.");
  const to = text(value.to, 254, true).toLowerCase();
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(to)) fail("Invalid reply recipient.");
  if (value.state === "sent" && (!value.sent_message_id || !value.sent_thread_id || !value.sent_at)) fail("Sent replies require verified Gmail receipts.");
  if (["sending", "uncertain", "sent"].includes(value.state) && (!/^[a-zA-Z0-9_-]{16,80}$/.test(value.claim_id || "") || !value.claimed_at)) fail("A recorded send claim is required.");
  return { id: value.id, state: value.state, to, from: "evan@1ststep.ai", subject: subject(value.subject), body: text(value.body, 6500, true), reply_message_id: id(value.reply_message_id), thread_id: id(value.thread_id), approved_at: time(value.approved_at),
    claim_id: text(value.claim_id || "", 80), claimed_at: value.claimed_at ? time(value.claimed_at) : "", sent_message_id: value.sent_message_id ? id(value.sent_message_id) : "", sent_thread_id: value.sent_thread_id ? id(value.sent_thread_id) : "", sent_at: value.sent_at ? time(value.sent_at) : "", error: text(value.error || "", 1000) };
}
export function changeProspectReply(p, change, now = new Date()) {
  const box = p.outbox, stamp = now.toISOString(), today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (change.operation === "prepare_reply") {
    const reply = normalizeReply(change.reply);
    if (p.thread_id && reply.thread_id !== p.thread_id) fail("Review the contact's actual Gmail thread first.");
    if (Date.parse(reply.received_at) > now.getTime() + 300000) fail("Reply evidence is in the future.");
    if (p.reply?.message_id === reply.message_id) return p;
    if (p.reply && reply.received_at <= p.reply.received_at) fail("Older replies cannot replace the latest reply.");
    if (["sending", "uncertain"].includes(box?.state)) fail("Reconcile the existing send before preparing another reply.");
    return { ...p, reply, reply_at: reply.received_at, outbox: box?.state === "queued" ? { ...box, state: "cancelled", error: "A newer reply arrived. Review the new draft." } : box,
      stage: p.suppressed || ["paid", "follow_up_scheduled"].includes(p.stage) ? p.stage : "reply_received", next_action: p.suppressed ? "No further outreach" : text(change.next_action || "Review the reply and suggested draft", 300),
      next_date: p.stage === "follow_up_scheduled" && p.next_date > today ? p.next_date : today };
  }
  if (change.operation === "approve_reply") {
    if (p.suppressed || ["declined", "no_contact"].includes(p.stage)) fail("This contact is suppressed. No reply can be sent.");
    if (p.stage === "follow_up_scheduled" && p.next_date > today) fail("Honor the requested follow-up date.");
    if (!p.email || !p.reply || p.reply.message_id !== change.reply_message_id) fail("Refresh and review the latest reply first.");
    if (box && !["blocked", "cancelled"].includes(box.state) && box.reply_message_id === change.reply_message_id) fail("This reply is already queued or sent.");
    if (["sending", "uncertain"].includes(box?.state)) fail("Reconcile the existing send before approving another reply.");
    if (box?.id === change.approval_id) fail("Use a new approval ID for a revised draft.");
    return { ...p, outbox: normalizeOutbox({ id: change.approval_id, state: "queued", to: p.email, subject: change.subject, body: replyBody(change.body), reply_message_id: p.reply.message_id, thread_id: p.reply.thread_id, approved_at: stamp }), next_action: "Approved reply queued — awaiting Gmail worker" };
  }
  if (!box || box.id !== change.approval_id) fail("Reply approval changed. Refresh first.");
  if (change.operation === "cancel_reply") {
    if (!["queued", "blocked"].includes(box.state)) fail("Only a queued or blocked reply can be cancelled.");
    return { ...p, outbox: { ...box, state: "cancelled" }, next_action: "Review the reply draft" };
  }
  if (change.operation === "claim_reply") {
    if (box.state !== "queued" || p.suppressed || p.reply?.message_id !== box.reply_message_id || p.reply?.thread_id !== box.thread_id || p.email !== box.to || (p.stage === "follow_up_scheduled" && p.next_date > today)) fail("Reply is no longer eligible to send.");
    if (!/^[a-zA-Z0-9_-]{16,80}$/.test(change.claim_id || "")) fail("Invalid send claim.");
    return { ...p, outbox: { ...box, state: "sending", claim_id: change.claim_id, claimed_at: stamp }, next_action: "Reply send in progress — do not retry" };
  }
  if (change.operation === "complete_reply") {
    if (!["sending", "uncertain"].includes(box.state) || box.claim_id !== change.claim_id) fail("A matching send claim is required.");
    const next = normalizeOutbox({ ...box, state: "sent", sent_message_id: change.sent_message_id, sent_thread_id: change.sent_thread_id, sent_at: stamp, error: "" });
    if (next.sent_thread_id !== box.thread_id) fail("Receipt must match the approved Gmail thread.");
    return { ...p, outbox: next, stage: p.suppressed || p.stage === "paid" ? p.stage : "awaiting_reply", next_action: p.suppressed ? "No further outreach" : "Wait for their reply; no automatic follow-up", next_date: p.suppressed ? "" : new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10) };
  }
  if (change.operation === "block_reply") {
    if (!["queued", "sending"].includes(box.state) || (box.state === "sending" && box.claim_id !== change.claim_id)) fail("Send is resolved or needs reconciliation.");
    const state = box.state === "sending" ? "uncertain" : "blocked";
    return { ...p, outbox: { ...box, state, error: text(change.error, 1000, true) }, next_action: state === "uncertain" ? "Reconcile Gmail Sent before any retry" : "Review the blocked reply" };
  }
  fail("Unknown reply operation.");
}
