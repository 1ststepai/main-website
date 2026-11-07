import { isDeepStrictEqual } from "node:util";
import { normalizeWorkspace } from "./workspaceModel.js";
import { newsletterQuoteTemplate } from "./newsletterQuote.js";
import { ugcQuoteTemplate } from "./ugcQuote.js";

const isNewsletter = quote => ["newsletter-pilot", "ugc-pilot"].includes(quote.contract_template_id);
export function desktopWorkspaceView(workspace) {
  return { ...workspace, quotes: workspace.quotes.filter(isNewsletter), next_quote_sequence: 1 + Math.max(0, ...workspace.quotes.map(q => Number(/^FS-(\d+)$/.exec(q.quote_number)?.[1]) || 0)) };
}
export function mergeDesktopWorkspace(current, input) {
  const next = normalizeWorkspace(input);
  if (next.quotes.some(q => !isNewsletter(q))) throw Object.assign(new Error("Desktop quotes must use a newsletter or UGC pilot agreement."), { statusCode: 403, code: "desktop_scope_denied" });
  return normalizeWorkspace({ ...next, quotes: [...current.quotes.filter(q => !isNewsletter(q)), ...next.quotes] });
}

export function assertDesktopWorkspaceUpdate(current, next) {
  const denied = () => { throw Object.assign(new Error("Desktop access can save clients and draft quotes only. Use the website for other changes."), { statusCode: 403, code: "desktop_scope_denied" }); };
  for (const key of ["pricing_structures", "pricing_settings"]) if (!isDeepStrictEqual(current[key], next[key])) denied();
  const allowedTemplates = [newsletterQuoteTemplate(), ugcQuoteTemplate()];
  const addedTemplates = next.templates.filter(t => !current.templates.some(old => old.id === t.id));
  const templates = normalizeWorkspace({ ...current, templates: [...current.templates, ...allowedTemplates.filter(t => addedTemplates.some(added => added.id === t.id))] }).templates;
  if (!isDeepStrictEqual(templates, next.templates)) denied();
  const protectedFields = ["payment_links", "sent_at", "last_contacted_at", "delivery_id", "follow_up_due", "follow_up_count"];
  const empty = { payment_links: [], sent_at: null, last_contacted_at: null, delivery_id: null, follow_up_due: "", follow_up_count: 0 };
  const before = new Map(current.quotes.map(q => [q.id, q]));
  const after = new Map(next.quotes.map(q => [q.id, q]));
  for (const quote of current.quotes) {
    const updated = after.get(quote.id);
    // Existing issued/payment-linked quotes are immutable to desktop credentials, including deletion.
    if ((!isNewsletter(quote) || quote.status !== "draft" || quote.payment_links.length || quote.sent_at || quote.delivery_id) && !isDeepStrictEqual(quote, updated)) denied();
  }
  for (const quote of next.quotes) {
    const original = before.get(quote.id);
    if (original && isDeepStrictEqual(original, quote)) continue;
    if (original && original.contract_template_id !== quote.contract_template_id) denied();
    if (!isNewsletter(quote) || quote.status !== "draft") denied();
    for (const key of protectedFields) if (!isDeepStrictEqual(quote[key], (original || empty)[key])) denied();
  }
}
