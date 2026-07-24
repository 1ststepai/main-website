const MAX_CLIENTS = 250;
const MAX_QUOTES = 500;
const MAX_TEMPLATES = 25;
const MAX_LINE_ITEMS = 40;
const MAX_SECTIONS = 20;

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

export const DEFAULT_CONTRACT_TEMPLATES = [
  {
    id: "website-build",
    name: "Website build agreement",
    sections: [
      { id: "scope", title: "Scope", body: "The studio will provide the deliverables listed in the accepted quote. Work outside that scope requires written approval and may be quoted separately.", enabled: true },
      { id: "timeline", title: "Timeline", body: "Target dates begin after the deposit, required content, and account access are received. Client delays may move the delivery schedule.", enabled: true },
      { id: "payment", title: "Payment schedule", body: "A 50% deposit reserves the project. The remaining balance is due before launch or final file transfer unless the quote states otherwise.", enabled: true },
      { id: "revisions", title: "Revisions", body: "Two reasonable revision rounds are included for each approved design stage. New direction or added scope may require a change order.", enabled: true },
      { id: "ownership", title: "Ownership", body: "After payment in full, the client receives rights to the final custom deliverables. The studio retains its pre-existing tools, reusable components, and know-how.", enabled: true },
      { id: "third-party", title: "Third-party services", body: "The client is responsible for approved domain, hosting, plugin, font, stock media, and other third-party fees unless they are included in the quote.", enabled: true },
      { id: "cancellation", title: "Cancellation", body: "Either party may end the project in writing. Completed work and committed third-party costs remain payable; the deposit is applied to work already reserved or performed.", enabled: true },
      { id: "outcomes", title: "Outcomes and acceptance", body: "The studio will perform the services with reasonable care but does not guarantee revenue, rankings, traffic, funding, platform approval, or other business results.", enabled: true },
    ],
  },
  {
    id: "ios-app-build",
    name: "iOS app build agreement",
    sections: [
      { id: "scope", title: "Scope", body: "The studio will build the features and delivery stages listed in the accepted quote. Additional platforms, integrations, or features require a written change order.", enabled: true },
      { id: "timeline", title: "Timeline", body: "Milestones begin after the deposit, product decisions, content, test accounts, and required access are received. Review and App Store timelines are estimates.", enabled: true },
      { id: "payment", title: "Payment schedule", body: "A 50% deposit reserves the build. Remaining milestone payments are due as listed in the quote and before production release or source transfer.", enabled: true },
      { id: "revisions", title: "Revisions and testing", body: "Two revision rounds are included for approved interface stages. The client will test milestone builds and report reproducible issues within the agreed review window.", enabled: true },
      { id: "ownership", title: "Code and ownership", body: "After payment in full, the client receives the final custom project code and deliverables. The studio retains pre-existing libraries, reusable components, and general know-how.", enabled: true },
      { id: "accounts", title: "Developer accounts and services", body: "The client owns and pays for Apple Developer membership, hosting, APIs, subscriptions, and third-party services unless the quote specifically includes them.", enabled: true },
      { id: "store-review", title: "Platform review", body: "The studio will prepare the agreed submission materials but cannot guarantee App Store acceptance, review timing, search position, downloads, or revenue.", enabled: true },
      { id: "cancellation", title: "Cancellation", body: "Either party may end the project in writing. Completed milestones, reserved work, and committed third-party costs remain payable.", enabled: true },
    ],
  },
];

export function createEmptyWorkspace() {
  return {
    revision: 0,
    updated_at: null,
    clients: [],
    quotes: [],
    templates: structuredClone(DEFAULT_CONTRACT_TEMPLATES),
  };
}

function normalizeSection(section) {
  return {
    id: identifier(section.id),
    title: text(section.title, 100),
    body: text(section.body, 3000),
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
    sections: template.sections.map(normalizeSection),
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

function normalizeQuote(quote) {
  if (!Array.isArray(quote.line_items) || quote.line_items.length > MAX_LINE_ITEMS) {
    throw validationError("Invalid quote line items");
  }
  if (!Array.isArray(quote.contract_sections) || quote.contract_sections.length > MAX_SECTIONS) {
    throw validationError("Invalid quote contract sections");
  }
  const status = ["draft", "sent", "approved", "declined", "archived"].includes(quote.status)
    ? quote.status
    : "draft";
  return {
    id: identifier(quote.id),
    quote_number: text(quote.quote_number, 40),
    status,
    created_at: text(quote.created_at, 40),
    updated_at: text(quote.updated_at, 40),
    sent_at: quote.sent_at ? text(quote.sent_at, 40) : null,
    delivery_id: quote.delivery_id ? text(quote.delivery_id, 160) : null,
    valid_until: dateValue(quote.valid_until),
    client_id: identifier(quote.client_id),
    project_title: text(quote.project_title, 180),
    summary: text(quote.summary, 2000),
    currency: "USD",
    line_items: quote.line_items.map(normalizeLineItem),
    deposit_percent: boundedNumber(quote.deposit_percent, 0, 100, 50),
    notes: text(quote.notes, 3000),
    contract_template_id: identifier(quote.contract_template_id),
    contract_sections: quote.contract_sections.map(normalizeSection),
  };
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

  const clients = input.clients.map(normalizeClient);
  const templates = input.templates.map(normalizeTemplate);
  const quotes = input.quotes.map(normalizeQuote);
  uniqueIds(clients, "client");
  uniqueIds(templates, "template");
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
  };
}
