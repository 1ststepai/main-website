import { normalizeReply, normalizeOutbox, changeProspectReply } from "./pipelineReplies.js";
export const STAGES = {
  researched: "Researched", proposal_ready: "Proposal ready", awaiting_reply: "Awaiting reply",
  reply_received: "Reply to review", follow_up_scheduled: "Follow-up scheduled",
  paid: "Paid engagement", declined: "Declined", no_contact: "Do not contact",
};
export const MAX_PROSPECTS = 5000;
export const MAX_PIPELINE_BYTES = 2 * 1024 * 1024;
export const PIPELINE_SERVICES = ["newsletter", "ugc"];
export const UGC_FIELDS = { product: "Product / offer", goal: "Ad goal and audience", platform: "Target platform", concept: "Hook / ad concept", deliverables: "Deliverables", usage_rights: "Creator consent / usage rights" };
export function invalid(message, statusCode = 400, code = "invalid_pipeline") {
  return Object.assign(new Error(message), { statusCode, code });
}
function text(value, max = 300) {
  if (value != null && typeof value !== "string") throw invalid("Text fields must be strings.");
  const result = (value || "").trim();
  if (result.length > max) throw invalid(`Text exceeds ${max} characters.`);
  return result;
}
function url(value) {
  const result = text(value, 1000);
  if (!result) return "";
  let parsed;
  try { parsed = new URL(result); } catch { throw invalid("Use a complete HTTPS URL."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw invalid("Use a complete HTTPS URL without credentials.");
  return result;
}
function date(value, timestamp = false) {
  const result = text(value, 40);
  if (!result) return "";
  const pattern = timestamp ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/ : /^\d{4}-\d{2}-\d{2}$/;
  if (!pattern.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result.slice(0, 10)) throw invalid("Use a valid date.");
  return result;
}
export function normalizeProspect(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalid("Invalid prospect.");
  const id = text(input.id, 80);
  const service_type = input.service_type || "newsletter";
  if (!PIPELINE_SERVICES.includes(service_type)) throw invalid("Choose newsletter or UGC.");
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw invalid("Invalid prospect ID.");
  const business = text(input.business, 160);
  if (!business) throw invalid("Business name is required.");
  const email = text(input.email, 254).toLowerCase();
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) throw invalid("Use a valid business email.");
  if (!Object.hasOwn(STAGES, input.stage)) throw invalid("Choose a valid stage.");
  const suppressed = input.suppressed === true || ["declined", "no_contact"].includes(input.stage);
  const message_id = text(input.message_id, 80);
  const thread_id = text(input.thread_id, 80);
  if ([message_id, thread_id].some((value) => value && !/^[a-f0-9]{10,80}$/i.test(value))) throw invalid("Use a valid Gmail message or thread ID.");
  if (input.sent_verified === true && (!message_id || !thread_id)) throw invalid("Verified sends require Gmail message and thread IDs.");
  const record = {
    id, service_type, business, email, sector: text(input.sector, 100), stage: suppressed ? (input.stage === "declined" ? "declined" : "no_contact") : input.stage,
    suppressed, suppression_reason: text(input.suppression_reason, 500),
    proposal_url: url(input.proposal_url), contact_source: url(input.contact_source),
    next_action: suppressed ? "No further outreach" : text(input.next_action, 300), next_date: suppressed ? "" : date(input.next_date),
    notes: text(input.notes, 2000), message_id, thread_id,
    sent_verified: input.sent_verified === true, sent_at: date(input.sent_at, true),
    reply_at: date(input.reply_at, true), evidence_at: date(input.evidence_at, true),
    reply: normalizeReply(input.reply), outbox: normalizeOutbox(input.outbox),
  };
  if (service_type === "ugc") {
    if (input.ugc_brief != null && (typeof input.ugc_brief !== "object" || Array.isArray(input.ugc_brief))) throw invalid("Invalid UGC brief.");
    record.ugc_brief = Object.fromEntries(Object.keys(UGC_FIELDS).map(key => [key, text(input.ugc_brief?.[key], 1000)]));
  }
  if (suppressed && !record.suppression_reason) throw invalid("Record why this business must not be contacted.");
  return record;
}
export function emptyPipeline(service_type = "newsletter") {
  return { service_type, revision: 0, updated_at: null, imported_at: null, source_checked_at: "", sender_health: null, prospects: [] };
}
export function normalizePipeline(input) {
  if (!input || !Array.isArray(input.prospects) || input.prospects.length > MAX_PROSPECTS) throw invalid(`Pipeline supports up to ${MAX_PROSPECTS} prospects. Export and archive before adding more.`);
  const prospects = input.prospects.map(normalizeProspect);
  const service_type = input.service_type || "newsletter";
  if (!PIPELINE_SERVICES.includes(service_type) || prospects.some(p => p.service_type !== service_type)) throw invalid("Import records must match this pipeline's service.");
  const ids = new Set(), emails = new Set();
  for (const p of prospects) {
    if (ids.has(p.id) || (p.email && emails.has(p.email))) throw invalid("Duplicate prospect ID or contact email.");
    ids.add(p.id); if (p.email) emails.add(p.email);
  }
  let sender_health = null;
  if (input.sender_health) {
    const h = input.sender_health;
    if (![h.spf, h.dkim, h.dmarc].every((v) => ["pass", "fail", "unknown"].includes(v))) throw invalid("Invalid authentication evidence.");
    if (h.account_sent_24h != null && (!Number.isInteger(h.account_sent_24h) || h.account_sent_24h < 0 || h.account_sent_24h > 10000)) throw invalid("Invalid account send count.");
    sender_health = { spf: h.spf, dkim: h.dkim, dmarc: h.dmarc, checked_at: date(h.checked_at, true), note: text(h.note, 1000), account_sent_24h: h.account_sent_24h ?? null };
    if (!sender_health.checked_at || !sender_health.note) throw invalid("Authentication checks require a dated evidence note.");
  }
  const result = { service_type, revision: Number.isSafeInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    updated_at: input.updated_at ? date(input.updated_at, true) : null,
    imported_at: input.imported_at ? date(input.imported_at, true) : null,
    source_checked_at: date(input.source_checked_at, true), sender_health, prospects };
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_PIPELINE_BYTES) throw invalid("Pipeline reached its 2 MiB capacity. Export and archive before adding more.", 413);
  return result;
}
export function applyPipelineChange(current, change) {
  if (["prepare_reply", "approve_reply", "cancel_reply", "claim_reply", "complete_reply", "block_reply"].includes(change?.operation)) {
    const prospect = current.prospects.find(p => p.id === change.prospect_id);
    if (!prospect) throw invalid("Prospect no longer exists.");
    const updated = changeProspectReply(prospect, change);
    return normalizePipeline({ ...current, prospects: current.prospects.map(p => p.id === prospect.id ? updated : p) });
  }
  if (!change || !["upsert", "import"].includes(change.operation)) throw invalid("Choose an edit or import operation.");
  const incoming = change.operation === "upsert" ? [normalizeProspect(change.prospect)] : normalizePipeline(change.pipeline).prospects;
  if (incoming.some(p => p.service_type !== (current.service_type || "newsletter")) || (change.operation === "import" && (change.pipeline.service_type || "newsletter") !== (current.service_type || "newsletter"))) throw invalid("Use the matching service pipeline for this record or import.");
  const map = new Map(current.prospects.map((p) => [p.id, p]));
  for (const p of incoming) {
    const existing = map.get(p.id);
    if ((p.reply && JSON.stringify(p.reply) !== JSON.stringify(existing?.reply)) || (p.outbox && JSON.stringify(p.outbox) !== JSON.stringify(existing?.outbox))) throw invalid("Use reply operations; imports and edits cannot approve or alter a reply send.");
    p.reply = existing?.reply || null; p.outbox = existing?.outbox || null;
    if (existing?.suppressed && !p.suppressed) throw invalid("A suppressed business cannot be reactivated by an edit or import.");
    if (existing && change.operation === "import") {
      // Preserve owner edits; imports add send evidence and apply new suppression/replies.
      const newerReply = p.reply_at && p.reply_at > existing.reply_at;
      map.set(p.id, { ...existing,
        ...(p.sent_verified ? { message_id: p.message_id, thread_id: p.thread_id, sent_verified: true, sent_at: p.sent_at || existing.sent_at, evidence_at: p.evidence_at } : {}),
        ...(newerReply ? { stage: p.stage, reply_at: p.reply_at, next_action: p.next_action } : {}),
        ...(p.suppressed ? { suppressed: true, suppression_reason: p.suppression_reason, stage: p.stage, next_action: "No further outreach", next_date: "" } : {}),
      });
    } else {
      if (existing?.sent_verified && (!p.sent_verified || p.message_id !== existing.message_id || p.thread_id !== existing.thread_id)) throw invalid("Existing verified send evidence cannot be replaced by an edit.");
      map.set(p.id, p);
    }
  }
  return normalizePipeline({ ...current, prospects: [...map.values()],
    ...(change.operation === "import" ? { imported_at: new Date().toISOString(), source_checked_at: change.pipeline.source_checked_at || current.source_checked_at,
      sender_health: change.pipeline.sender_health && (!current.sender_health || change.pipeline.sender_health.checked_at >= current.sender_health.checked_at) ? change.pipeline.sender_health : current.sender_health } : {}) });
}
export function localDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function attentionReason(p, today = localDay()) {
  if (p.suppressed) return "";
  if (p.outbox && ["queued", "sending", "blocked", "uncertain"].includes(p.outbox.state)) return `Reply ${p.outbox.state}`;
  if (p.reply?.suggested_body && p.outbox?.reply_message_id !== p.reply.message_id && !(p.stage === "follow_up_scheduled" && p.next_date > today)) return "Reply needs review";
  if (p.stage === "paid") return "";
  if (p.stage === "reply_received") return "Reply needs review";
  if (p.next_date && p.next_date < today) return "Overdue review";
  if (p.next_date === today) return "Due today";
  if (!p.next_action || !p.next_date) return "Set next action and date";
  if (!p.contact_source) return "Verify contact source";
  if (!p.proposal_url) return "Prepare proposal";
  return "";
}
