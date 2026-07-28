import {
  normalizePaymentPlan,
  paymentScheduleForQuote,
  safeStripePaymentUrl,
} from "./paymentPlans.js";
import {
  AGREEMENT_CATEGORIES,
  DEFAULT_CONTRACT_TEMPLATES,
  MAX_AGREEMENT_SECTIONS,
  normalizeAgreementDepth,
} from "./agreementLibrary.js";

export { DEFAULT_CONTRACT_TEMPLATES } from "./agreementLibrary.js";

const MAX_CLIENTS = 250;
const MAX_QUOTES = 500;
const MAX_TEMPLATES = 25;
const MAX_PRICING_STRUCTURES = 40;
const MAX_LINE_ITEMS = 40;
const MAX_SECTIONS = MAX_AGREEMENT_SECTIONS;
const MAX_PAYMENT_LINKS = 4;

const CURRENT_PAYMENT_TERMS = "The payment schedule shown in the accepted quote controls the amounts and due dates. Card payments are processed securely by Stripe. Work may pause when a scheduled payment is overdue, and final delivery requires payment in full.";
const LEGACY_PAYMENT_TERMS = new Set([
  "A 50% deposit reserves the project. The remaining balance is due before launch or final file transfer unless the quote states otherwise.",
  "A 50% deposit reserves the build. Remaining milestone payments are due as listed in the quote and before production release or source transfer.",
]);

function validationError(message) {
  const error = new Error(message);
  error.code = "invalid_workspace";
  error.statusCode = 400;
  return error;
}

function text(value, maximum, fallback = "") {
  const normalized = String(value ?? fallback).trim();
  if (normalized.length > maximum) throw validationError(`Text exceeds ${maximum} characters`);
  return normalized;
}

function identifier(value) {
  const normalized = text(value, 80);
  if (!/^[a-zA-Z0-9_-]+$/.test(normalized)) throw validationError("Invalid record identifier");
  return normalized;
}

function boundedNumber(value, minimum, maximum, fallback = 0) {
  const normalized = Number(value ?? fallback);
  if (!Number.isFinite(normalized) || normalized < minimum || normalized > maximum) {
    throw validationError(`Number must be between ${minimum} and ${maximum}`);
  }
  return Math.round(normalized * 100) / 100;
}

function dateValue(value) {
  const normalized = text(value, 32);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw validationError("Invalid date");
  return normalized;
}

function agreementServiceType(value, templateId = "") {
  if (["website", "app", "retainer"].includes(value)) return value;
  if (/ios|app/i.test(templateId)) return "app";
  if (/care|retainer|partner/i.test(templateId)) return "retainer";
  return "website";
}

function sectionCategory(section) {
  if (Object.hasOwn(AGREEMENT_CATEGORIES, section.category)) return section.category;
  if (["payment", "cancellation", "termination"].includes(section.id)) return "commercial";
  if (["ownership", "studio-tools"].includes(section.id)) return "rights";
  if (["timeline", "revisions", "accounts", "store-review"].includes(section.id)) return "delivery";
  if (["outcomes", "confidentiality"].includes(section.id)) return "protection";
  return "scope";
}

export const DEFAULT_PRICING_STRUCTURES = [
  {
    id: "website-rescue",
    name: "Website Rescue Sprint",
    category: "website",
    billing_type: "project",
    starting_price: 750,
    typical_high: 1500,
    estimated_hours: 8,
    summary: "A focused repair sprint for an existing WordPress, Wix, Squarespace, Shopify, Webflow, GoDaddy, Framer, or custom website.",
    ideal_for: "Owners who need visible improvements without committing to a full rebuild.",
    inclusions: "Technical and conversion review\nPriority design or usability fixes\nMobile cleanup\nOne focused integration or form repair\nLaunch support",
  },
  {
    id: "single-page-launch",
    name: "Single-Page Launch",
    category: "website",
    billing_type: "project",
    starting_price: 1250,
    typical_high: 2000,
    estimated_hours: 14,
    summary: "A polished one-page website or campaign landing page with a clear offer, responsive design, and lead capture.",
    ideal_for: "New businesses, focused campaigns, or clients replacing a weak DIY page.",
    inclusions: "Page strategy\nCustom responsive design\nConversion-focused build\nContact or booking flow\nAnalytics-ready launch",
  },
  {
    id: "growth-website",
    name: "Custom Growth Website",
    category: "website",
    billing_type: "project",
    starting_price: 3250,
    typical_high: 5500,
    estimated_hours: 36,
    summary: "A complete custom business website designed to look credible, explain the offer clearly, and generate qualified inquiries.",
    ideal_for: "Established small businesses that have outgrown a template or an outdated website.",
    inclusions: "Strategy and sitemap\nUp to 6 core pages\nCustom responsive UI\nCMS or platform integration\nLead capture and analytics\nQA and launch",
  },
  {
    id: "premium-motion-website",
    name: "Premium Motion Website",
    category: "website",
    billing_type: "project",
    starting_price: 6500,
    typical_high: 12000,
    estimated_hours: 68,
    summary: "A high-end website experience with original art direction, premium animation, and custom interaction design.",
    ideal_for: "Brands where presentation, product storytelling, and a distinctive digital experience directly affect trust.",
    inclusions: "Creative direction\nCustom multi-page UI/UX\nSignature motion system\nAdvanced interactions\nCMS and integrations\nPerformance QA and launch",
  },
  {
    id: "ios-prototype",
    name: "iOS Product Prototype",
    category: "app",
    billing_type: "project",
    starting_price: 3500,
    typical_high: 6000,
    estimated_hours: 36,
    summary: "A testable product direction with key iOS screens, flows, and a working prototype before a larger build commitment.",
    ideal_for: "Founders validating an app concept, workflow, or investor-ready product direction.",
    inclusions: "Product workshop\nCore user flow\nHigh-fidelity iOS UI\nInteractive prototype\nBuild roadmap and estimate",
  },
  {
    id: "ios-mvp",
    name: "iOS MVP Build",
    category: "app",
    billing_type: "project",
    starting_price: 10500,
    typical_high: 20000,
    estimated_hours: 116,
    summary: "A focused first version of an iOS app built around the smallest valuable, launchable feature set.",
    ideal_for: "Founders and businesses ready to move from validated concept to a working application.",
    inclusions: "Product architecture\nNative iOS design and development\nCore backend integration\nTesting and release preparation\nApp Store submission support",
  },
  {
    id: "website-care",
    name: "Website Care",
    category: "recurring",
    billing_type: "monthly",
    starting_price: 149,
    typical_high: 299,
    estimated_hours: 1.5,
    summary: "Ongoing updates, monitoring, and small improvements that keep a business website current and reliable.",
    ideal_for: "Clients who want one dependable person to maintain the website after launch.",
    inclusions: "Routine content updates\nPlatform and plugin checks\nMonthly performance review\nPriority support\nSmall design fixes",
  },
  {
    id: "digital-product-partner",
    name: "Digital Product Partner",
    category: "recurring",
    billing_type: "monthly",
    starting_price: 600,
    typical_high: 1250,
    estimated_hours: 6,
    summary: "Reserved monthly capacity for website, app, automation, and digital product improvements.",
    ideal_for: "Businesses that need ongoing senior product help without hiring a full-time technical team.",
    inclusions: "Monthly planning call\nReserved improvement capacity\nWebsite and app enhancements\nIntegration support\nPriority response",
  },
];

export const DEFAULT_PRICING_SETTINGS = {
  target_hourly_rate: 75,
  contingency_percent: 10,
  max_discount_percent: 5,
  default_deposit_percent: 40,
};

export function createEmptyWorkspace() {
  return {
    revision: 0,
    updated_at: null,
    clients: [],
    quotes: [],
    templates: structuredClone(DEFAULT_CONTRACT_TEMPLATES),
    pricing_structures: structuredClone(DEFAULT_PRICING_STRUCTURES),
    pricing_settings: { ...DEFAULT_PRICING_SETTINGS },
  };
}

function blankClient(client) {
  return ["company", "contact_name", "email", "phone", "website", "billing_address"]
    .every((field) => !String(client?.[field] || "").trim());
}

export function assignClientToQuote(workspace, quoteId, client, updatedAt = new Date().toISOString()) {
  if (!workspace || !Array.isArray(workspace.clients) || !Array.isArray(workspace.quotes)) {
    throw validationError("Workspace is required");
  }
  const normalizedQuoteId = identifier(quoteId);
  const clientId = identifier(client?.id);
  if (!workspace.quotes.some((quote) => quote.id === normalizedQuoteId)) {
    throw validationError("Quote was not found");
  }
  const currentQuote = workspace.quotes.find((quote) => quote.id === normalizedQuoteId);
  const previousClientId = currentQuote.client_id;
  const clientExists = workspace.clients.some((item) => item.id === clientId);
  const clients = clientExists
    ? workspace.clients.map((item) => item.id === clientId ? { ...item, ...client, id: clientId } : item)
    : [...workspace.clients, { ...client, id: clientId }];
  const previousClient = clients.find((item) => item.id === previousClientId);
  const previousClientIsUsedElsewhere = workspace.quotes.some(
    (quote) => quote.id !== normalizedQuoteId && quote.client_id === previousClientId
  );
  const shouldPrunePrevious = previousClientId !== clientId
    && blankClient(previousClient)
    && !previousClientIsUsedElsewhere;
  return {
    ...workspace,
    clients: shouldPrunePrevious
      ? clients.filter((item) => item.id !== previousClientId)
      : clients,
    quotes: workspace.quotes.map((quote) => quote.id === normalizedQuoteId
      ? { ...quote, client_id: clientId, updated_at: updatedAt }
      : quote),
  };
}

function followUpDate(sentAt, offsetDays = 3) {
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) throw validationError("Invalid delivery date");
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

export function recordQuoteDelivery(workspace, quoteId, {
  deliveryId,
  sentAt = new Date().toISOString(),
  deliveryKind = "initial",
} = {}) {
  if (!workspace || !Array.isArray(workspace.quotes)) {
    throw validationError("Workspace is required");
  }
  const normalizedQuoteId = identifier(quoteId);
  const normalizedDeliveryId = text(deliveryId, 160);
  if (!normalizedDeliveryId) throw validationError("Delivery identifier is required");
  if (!["initial", "follow_up"].includes(deliveryKind)) {
    throw validationError("Invalid delivery kind");
  }
  if (!workspace.quotes.some((quote) => quote.id === normalizedQuoteId)) {
    throw validationError("Quote was not found");
  }
  return {
    ...workspace,
    quotes: workspace.quotes.map((quote) => quote.id === normalizedQuoteId ? {
      ...quote,
      status: "sent",
      sent_at: quote.sent_at || sentAt,
      last_contacted_at: sentAt,
      follow_up_due: followUpDate(sentAt),
      follow_up_count: Number(quote.follow_up_count || 0) + (deliveryKind === "follow_up" ? 1 : 0),
      delivery_id: normalizedDeliveryId,
      updated_at: sentAt,
    } : quote),
  };
}

function normalizeSection(section) {
  const rawBody = text(section.body, 3000);
  return {
    id: identifier(section.id),
    title: text(section.title, 100),
    body: LEGACY_PAYMENT_TERMS.has(rawBody) ? CURRENT_PAYMENT_TERMS : rawBody,
    category: sectionCategory(section),
    guidance: text(section.guidance, 800),
    enabled: section.enabled !== false,
  };
}

function normalizeTemplate(template) {
  if (!Array.isArray(template.sections) || template.sections.length > MAX_SECTIONS) {
    throw validationError("Invalid contract sections");
  }
  return {
    id: identifier(template.id),
    name: text(template.name, 120),
    document_depth: normalizeAgreementDepth(template.document_depth),
    service_type: agreementServiceType(template.service_type, template.id),
    description: text(template.description, 500),
    sections: template.sections.map(normalizeSection),
  };
}

function normalizePricingStructure(structure) {
  const category = ["website", "app", "recurring"].includes(structure.category)
    ? structure.category
    : "website";
  const billingType = structure.billing_type === "monthly" ? "monthly" : "project";
  const startingPrice = boundedNumber(structure.starting_price, 0, 10000000, 0);
  const typicalHigh = boundedNumber(structure.typical_high, startingPrice, 10000000, startingPrice);
  return {
    id: identifier(structure.id),
    name: text(structure.name, 160),
    category,
    billing_type: billingType,
    starting_price: startingPrice,
    typical_high: typicalHigh,
    estimated_hours: boundedNumber(structure.estimated_hours, 0.25, 10000, 1),
    summary: text(structure.summary, 1200),
    ideal_for: text(structure.ideal_for, 1200),
    inclusions: text(structure.inclusions, 3000),
  };
}

function normalizePricingSettings(settings = {}) {
  return {
    target_hourly_rate: boundedNumber(settings.target_hourly_rate, 25, 1000, DEFAULT_PRICING_SETTINGS.target_hourly_rate),
    contingency_percent: boundedNumber(settings.contingency_percent, 0, 100, DEFAULT_PRICING_SETTINGS.contingency_percent),
    max_discount_percent: boundedNumber(settings.max_discount_percent, 0, 50, DEFAULT_PRICING_SETTINGS.max_discount_percent),
    default_deposit_percent: boundedNumber(settings.default_deposit_percent, 0, 100, DEFAULT_PRICING_SETTINGS.default_deposit_percent),
  };
}

function normalizeClient(client) {
  return {
    id: identifier(client.id),
    company: text(client.company, 160),
    contact_name: text(client.contact_name, 160),
    email: text(client.email, 254).toLowerCase(),
    phone: text(client.phone, 60),
    website: text(client.website, 500),
    billing_address: text(client.billing_address, 1000),
  };
}

function normalizeLineItem(item) {
  return {
    id: identifier(item.id),
    name: text(item.name, 160),
    description: text(item.description, 500),
    quantity: boundedNumber(item.quantity, 0, 100000, 1),
    rate: boundedNumber(item.rate, 0, 10000000, 0),
  };
}

function normalizePaymentLink(link) {
  const url = safeStripePaymentUrl(link.url);
  if (!url) throw validationError("Invalid Stripe payment link");
  const installmentNumber = Number(link.installment_number);
  if (!Number.isInteger(installmentNumber) || installmentNumber < 1 || installmentNumber > 4) {
    throw validationError("Invalid payment installment");
  }
  return {
    installment_number: installmentNumber,
    label: text(link.label, 120),
    amount: boundedNumber(link.amount, 0.5, 10000000, 0.5),
    url,
    stripe_payment_link_id: identifier(link.stripe_payment_link_id),
    created_at: text(link.created_at, 40),
  };
}

function normalizeQuote(quote) {
  if (!Array.isArray(quote.line_items) || quote.line_items.length > MAX_LINE_ITEMS) {
    throw validationError("Invalid quote line items");
  }
  if (!Array.isArray(quote.contract_sections) || quote.contract_sections.length > MAX_SECTIONS) {
    throw validationError("Invalid quote contract sections");
  }
  const paymentLinks = quote.payment_links ?? [];
  if (!Array.isArray(paymentLinks) || paymentLinks.length > MAX_PAYMENT_LINKS) {
    throw validationError("Invalid quote payment links");
  }
  const normalizedPaymentLinks = paymentLinks.map(normalizePaymentLink);
  if (new Set(normalizedPaymentLinks.map((link) => link.installment_number)).size !== normalizedPaymentLinks.length) {
    throw validationError("Duplicate payment installment");
  }
  const status = ["draft", "sent", "approved", "declined", "archived"].includes(quote.status)
    ? quote.status
    : "draft";
  const normalizedQuote = {
    id: identifier(quote.id),
    quote_number: text(quote.quote_number, 40),
    status,
    created_at: text(quote.created_at, 40),
    updated_at: text(quote.updated_at, 40),
    sent_at: quote.sent_at ? text(quote.sent_at, 40) : null,
    last_contacted_at: quote.last_contacted_at ? text(quote.last_contacted_at, 40) : null,
    follow_up_due: quote.follow_up_due ? dateValue(quote.follow_up_due) : "",
    follow_up_count: boundedNumber(quote.follow_up_count, 0, 100, 0),
    delivery_id: quote.delivery_id ? text(quote.delivery_id, 160) : null,
    valid_until: dateValue(quote.valid_until),
    client_id: identifier(quote.client_id),
    project_title: text(quote.project_title, 180),
    summary: text(quote.summary, 2000),
    currency: "USD",
    line_items: quote.line_items.map(normalizeLineItem),
    deposit_percent: boundedNumber(quote.deposit_percent, 0, 100, 40),
    payment_plan: normalizePaymentPlan(quote.payment_plan),
    card_payments_enabled: quote.card_payments_enabled !== false,
    payment_links: normalizedPaymentLinks,
    notes: text(quote.notes, 3000),
    contract_template_id: identifier(quote.contract_template_id),
    document_depth: normalizeAgreementDepth(quote.document_depth),
    contract_sections: quote.contract_sections.map(normalizeSection),
  };
  const schedule = paymentScheduleForQuote(normalizedQuote);
  for (const link of normalizedPaymentLinks) {
    const installment = schedule.find(
      (item) => item.installment_number === link.installment_number
    );
    if (!installment || Math.round(installment.amount * 100) !== Math.round(link.amount * 100)) {
      throw validationError("Quote contains an outdated payment link");
    }
  }
  return normalizedQuote;
}

function uniqueIds(records, label) {
  const ids = new Set();
  for (const record of records) {
    if (ids.has(record.id)) throw validationError(`Duplicate ${label} identifier`);
    ids.add(record.id);
  }
}

export function normalizeWorkspace(input) {
  if (!input || typeof input !== "object") throw validationError("Workspace is required");
  if (!Array.isArray(input.clients) || input.clients.length > MAX_CLIENTS) {
    throw validationError("Invalid clients collection");
  }
  if (!Array.isArray(input.quotes) || input.quotes.length > MAX_QUOTES) {
    throw validationError("Invalid quotes collection");
  }
  if (!Array.isArray(input.templates) || input.templates.length > MAX_TEMPLATES) {
    throw validationError("Invalid templates collection");
  }
  const pricingInput = input.pricing_structures ?? DEFAULT_PRICING_STRUCTURES;
  if (!Array.isArray(pricingInput) || pricingInput.length > MAX_PRICING_STRUCTURES) {
    throw validationError("Invalid pricing structures collection");
  }

  const clients = input.clients.map(normalizeClient);
  const templates = input.templates.map(normalizeTemplate);
  const pricingStructures = pricingInput.map(normalizePricingStructure);
  const quotes = input.quotes.map(normalizeQuote);
  uniqueIds(clients, "client");
  uniqueIds(templates, "template");
  uniqueIds(pricingStructures, "pricing structure");
  uniqueIds(quotes, "quote");

  const clientIds = new Set(clients.map((client) => client.id));
  const templateIds = new Set(templates.map((template) => template.id));
  for (const quote of quotes) {
    if (!clientIds.has(quote.client_id)) throw validationError("Quote references an unknown client");
    if (!templateIds.has(quote.contract_template_id)) throw validationError("Quote references an unknown contract template");
  }

  return {
    revision: Number.isInteger(input.revision) && input.revision >= 0 ? input.revision : 0,
    updated_at: input.updated_at ? text(input.updated_at, 40) : null,
    clients,
    quotes,
    templates,
    pricing_structures: pricingStructures,
    pricing_settings: normalizePricingSettings(input.pricing_settings),
  };
}
