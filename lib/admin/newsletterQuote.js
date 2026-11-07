import { sectionFromLibrary } from "./agreementLibrary.js";

// Proposed draft pricing only; leaves the owner's price book unchanged.
export const NEWSLETTER_PILOT_PRICE = 600;

export function newsletterQuoteTemplate() {
  return { id: "newsletter-pilot", name: "Newsletter pilot agreement", service_type: "retainer", document_depth: "essential", description: "One-time four-week newsletter pilot; client approves and sends.", sections: newsletterQuoteOverrides("item_template").contract_sections };
}

export function newsletterQuoteClient(clients, prospect) {
  if (!prospect) return null;
  if (prospect.suppressed || ["declined", "no_contact"].includes(prospect.stage)) throw new Error("This contact is suppressed. Do not create an outreach quote.");
  const email = String(prospect.email || "").trim();
  if (!prospect.business?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Save a business name and valid email before creating a quote.");
  return clients.find((client) => client.email?.trim().toLowerCase() === email.toLowerCase()) || { company: prospect.business.trim(), email };
}

export function newsletterQuoteOverrides(itemId) {
  const sections = ["scope", "client-responsibilities", "timeline", "acceptance", "change-orders", "payment", "ownership", "termination", "third-party-costs", "outcomes"].map(sectionFromLibrary).filter(Boolean);
  sections.find((section) => section.id === "acceptance").body = "The client provides one consolidated revision request per issue. Each newsletter requires explicit written approval before the client sends it. Silence is not permission to send.";
  return {
    project_title: "Four-week newsletter pilot",
    summary: "Four newsletters, tailored to your business and brand, delivered over four weeks. Each issue has one clear offer and call to action. We agree the topics and schedule together before work begins.",
    line_items: [{ id: itemId, name: "Four branded newsletters", quantity: 1, rate: NEWSLETTER_PILOT_PRICE, description: "4 issues · tailored copy · brand-matched layout using supplied assets · subject + preview text · CTA and link checks · 1 consolidated revision per issue · editable copy and email HTML" }],
    deposit_percent: 100,
    payment_plan: "full",
    card_payments_enabled: false,
    payment_links: [],
    contract_template_id: "newsletter-pilot",
    document_depth: "essential",
    contract_sections: sections,
    notes: "One-time four-week pilot; no automatic renewal. Payment in full before work begins. Schedule starts after payment and receipt of brand assets, accurate offer details and an authorized approver. Client imports, tests and sends through their own email platform to their permitted audience; platform fees, platform integration, list building, photography and additional revisions are excluded. Sending services require a separate agreed scope. No guaranteed sales, opens or inbox placement. Quote valid for 30 days. Any ongoing monthly service is quoted separately.",
  };
}
