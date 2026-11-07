import { newsletterQuoteOverrides } from "./newsletterQuote.js";

export function ugcQuoteOverrides(itemId, prospect = null) {
  const draft = newsletterQuoteOverrides(itemId);
  const brief = prospect?.ugc_brief || {};
  const deliverables = brief.deliverables || "Confirm video count, duration, hooks, formats and revision allowance with the client.";
  draft.contract_sections.find(s => s.id === "acceptance").body = "Agree scripts, deliverables and revisions in writing. Client gives explicit written approval of every final ad before publication. Silence is not approval. Creator/model releases, licensed music and permitted paid-ad usage must be documented. AI or dramatized content must not imply a real customer endorsement.";
  return { ...draft, project_title: "UGC ad pilot — scope and price to confirm", summary: [brief.product, brief.goal, brief.platform, brief.concept].filter(Boolean).join(" · ").slice(0, 2000) || "Create a tailored UGC ad pilot. Agree the product, audience, concept, creator, deliverables, schedule and price before work begins.",
    line_items: [{ id: itemId, name: "UGC ad production — price to confirm", quantity: 1, rate: 0, description: deliverables.slice(0, 500) }],
    contract_template_id: "ugc-pilot", notes: "DRAFT ONLY: price is not set; $0 is a placeholder, not a free offer. " + (brief.usage_rights ? `Rights brief: ${brief.usage_rights}. ` : "Creator consent, licensing, usage term, channels and paid-ad rights remain to be agreed. ") + "Client approves each final ad. Media spend, ad account access, publishing and ongoing management require a separate scope. No guaranteed conversions or sales. Final price and schedule require written agreement.",
  };
}
export function ugcQuoteTemplate() {
  return { id: "ugc-pilot", name: "UGC ad pilot agreement", service_type: "project", document_depth: "essential", description: "UGC ad pilot; price and licensed usage require agreement.", sections: ugcQuoteOverrides("item_template").contract_sections };
}
