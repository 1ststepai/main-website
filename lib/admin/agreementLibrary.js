import agreementSource from "./agreementLibrary.data.json" with { type: "json" };

const DEPTH_RANK = {
  essential: 0,
  standard: 1,
  comprehensive: 2,
};

export const MAX_AGREEMENT_SECTIONS = 32;

export const AGREEMENT_DEPTHS = [
  {
    id: "essential",
    label: "Basic",
    description: "A short estimate and approval structure for small, well-defined work.",
  },
  {
    id: "standard",
    label: "Professional",
    description: "A balanced proposal and agreement for most website and app projects.",
  },
  {
    id: "comprehensive",
    label: "Detailed",
    description: "A full scope-and-terms structure for larger, higher-risk engagements.",
  },
];

export const AGREEMENT_CATEGORIES = {
  scope: "Scope",
  delivery: "Delivery",
  commercial: "Commercial",
  rights: "Rights",
  protection: "Protection",
  acceptance: "Acceptance",
};

export const AGREEMENT_SECTION_LIBRARY = agreementSource.sections;

const cloneSection = (section) => ({
  id: section.id,
  title: section.title,
  body: section.body,
  category: section.category,
  guidance: section.guidance,
  enabled: true,
});

export function normalizeAgreementDepth(value) {
  return Object.hasOwn(DEPTH_RANK, value) ? value : "standard";
}

export function sectionsForDepth(depth = "standard", serviceType = "website") {
  const normalizedDepth = normalizeAgreementDepth(depth);
  const rank = DEPTH_RANK[normalizedDepth];
  return AGREEMENT_SECTION_LIBRARY
    .filter((section) => DEPTH_RANK[section.minimumDepth] <= rank)
    .filter((section) => section.appliesTo.includes("all") || section.appliesTo.includes(serviceType))
    .map(cloneSection);
}

export function sectionFromLibrary(sectionId) {
  const section = AGREEMENT_SECTION_LIBRARY.find((item) => item.id === sectionId);
  return section ? cloneSection(section) : null;
}

const COVERAGE_RULES = [
  { id: "scope", label: "Scope and boundaries", sectionIds: ["scope", "deliverables-exclusions"] },
  { id: "responsibilities", label: "Client responsibilities", sectionIds: ["client-responsibilities"] },
  { id: "timeline", label: "Schedule and dependencies", sectionIds: ["timeline"] },
  { id: "changes", label: "Revisions and changes", sectionIds: ["change-orders", "revisions-testing"] },
  { id: "payment", label: "Fees and payment", sectionIds: ["payment"] },
  { id: "rights", label: "Ownership and reusable tools", sectionIds: ["ownership", "studio-tools"] },
  { id: "acceptance", label: "Review and acceptance", sectionIds: ["acceptance"] },
  { id: "termination", label: "Cancellation and exit", sectionIds: ["termination"] },
];

export function agreementCoverage(sections = []) {
  const enabledIds = new Set(sections.filter((section) => section.enabled !== false).map((section) => section.id));
  const items = COVERAGE_RULES.map((rule) => ({
    ...rule,
    covered: rule.sectionIds.some((id) => enabledIds.has(id)),
  }));
  return {
    completed: items.filter((item) => item.covered).length,
    total: items.length,
    missing: items.filter((item) => !item.covered),
    items,
  };
}

function template(id, name, documentDepth, serviceType, description) {
  return {
    id,
    name,
    document_depth: documentDepth,
    service_type: serviceType,
    description,
    sections: sectionsForDepth(documentDepth, serviceType),
  };
}

function sectionsFromIds(ids) {
  return ids.map(sectionFromLibrary).filter(Boolean);
}

function contractTemplate(spec) {
  const base = {
    id: spec.id,
    name: spec.name,
    document_depth: spec.document_depth,
    service_type: spec.service_type,
    description: spec.description,
  };
  if (spec.section_ids) return { ...base, sections: sectionsFromIds(spec.section_ids) };
  return template(spec.id, spec.name, spec.document_depth, spec.service_type, spec.description);
}

export const DEFAULT_CONTRACT_TEMPLATES = agreementSource.templates.map(contractTemplate);
