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

export const AGREEMENT_SECTION_LIBRARY = [
  {
    id: "scope",
    title: "Scope of services",
    body: "1stStep.ai will provide the services and final deliverables specifically listed in this quote. Anything not listed is outside the agreed scope unless both parties approve it in writing.",
    category: "scope",
    guidance: "Make the line items concrete enough that a client can tell exactly what is being purchased.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "deliverables-exclusions",
    title: "Deliverables, inclusions, and exclusions",
    body: "The quoted line items define the included deliverables. Drafts, experiments, source research, unused concepts, extra pages, extra platforms, copywriting, photography, data entry, and integrations are excluded unless this quote expressly includes them.",
    category: "scope",
    guidance: "Edit the exclusions for each project; explicit boundaries are one of the best defenses against scope creep.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "client-responsibilities",
    title: "Client responsibilities",
    body: "The client will provide accurate content, consolidated feedback, approvals, credentials, brand assets, legal notices, and one authorized decision-maker on the dates reasonably requested. The client is responsible for the legality and accuracy of materials it supplies.",
    category: "delivery",
    guidance: "Name the real approver and list any content or access that must arrive before the schedule begins.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "timeline",
    title: "Timeline and dependencies",
    body: "Work begins after the first scheduled payment and required materials are received. Dates are good-faith targets unless expressly labeled fixed; late content, access, feedback, approvals, or third-party responses may move milestones and launch dates.",
    category: "delivery",
    guidance: "Add milestone dates to the quote when timing matters and identify any immovable launch date before signing.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "acceptance",
    title: "Review and acceptance",
    body: "The client will review each submitted milestone promptly and provide one consolidated response. A deliverable is accepted when approved in writing, used in production, or not rejected with specific in-scope issues within five business days after delivery.",
    category: "acceptance",
    guidance: "Confirm the review window is realistic for the client and replace it if the project needs a different period.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "change-orders",
    title: "Changes and additional work",
    body: "A request that changes approved direction, deliverables, assumptions, integrations, quantity, schedule, or platform is additional work. 1stStep.ai will describe the effect on fees and timing, and will begin the change only after written approval.",
    category: "scope",
    guidance: "Use a separate change-order quote for material changes so price, timing, and acceptance remain easy to prove.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "payment",
    title: "Fees and payment schedule",
    body: "The payment schedule shown in this quote controls the amounts and due points. Card payments are processed securely by Stripe. Work may pause when a scheduled payment is overdue, and final launch, source transfer, or handoff requires payment in full.",
    category: "commercial",
    guidance: "The quote payment plan is the source of truth; avoid inserting a conflicting deposit percentage in this clause.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "ownership",
    title: "Final deliverables and ownership",
    body: "After full payment, the client receives the rights expressly stated in this agreement to the approved final custom deliverables. No ownership or license transfers for unpaid work, rejected concepts, preliminary work, or materials owned by third parties.",
    category: "rights",
    guidance: "Choose the intended ownership model with counsel; assignment, exclusive license, and limited license are not interchangeable.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "termination",
    title: "Cancellation and termination",
    body: "Either party may end the project by written notice. The client will pay for completed work, work in progress, reserved capacity reasonably committed to the project, and non-cancellable third-party costs through the termination date.",
    category: "commercial",
    guidance: "Discuss whether a minimum cancellation fee or notice period fits the engagement before client use.",
    minimumDepth: "essential",
    appliesTo: ["all"],
  },
  {
    id: "revisions-testing",
    title: "Revisions, testing, and corrections",
    body: "Two reasonable revision rounds are included at each approved design stage unless the quote states otherwise. The client will test milestone builds and report reproducible in-scope issues during the review window; new direction and new features are change requests.",
    category: "delivery",
    guidance: "Replace the revision count when a package includes more or fewer rounds, and define who performs acceptance testing.",
    minimumDepth: "standard",
    appliesTo: ["all"],
  },
  {
    id: "third-party-costs",
    title: "Third-party products and services",
    body: "Domains, hosting, software, plugins, fonts, stock media, APIs, payment processing, app-store accounts, and other third-party products remain subject to their own terms, pricing, availability, and changes. The client pays those costs unless this quote expressly includes them.",
    category: "commercial",
    guidance: "List known recurring vendor fees in the quote so the client can see the expected operating cost.",
    minimumDepth: "standard",
    appliesTo: ["all"],
  },
  {
    id: "studio-tools",
    title: "Pre-existing tools and reusable components",
    body: "1stStep.ai retains ownership of its pre-existing code, frameworks, design systems, processes, prompts, utilities, know-how, and reusable components. To the extent they are embedded in a paid final deliverable, the client receives a perpetual license to use them as part of that deliverable.",
    category: "rights",
    guidance: "This separates the client's final product from reusable studio infrastructure; have counsel align it with the ownership clause.",
    minimumDepth: "standard",
    appliesTo: ["all"],
  },
  {
    id: "confidentiality",
    title: "Confidential information",
    body: "Each party will use reasonable care to protect non-public business, technical, and customer information received from the other and will use it only for this project. This does not cover information already known, independently developed, public, or lawfully received from another source.",
    category: "protection",
    guidance: "Use a separate NDA when the client requires stronger secrecy, regulated data terms, or obligations before discovery.",
    minimumDepth: "standard",
    appliesTo: ["all"],
  },
  {
    id: "support",
    title: "Launch support and ongoing maintenance",
    body: "The quote includes only the launch support, correction period, training, or maintenance expressly listed. New content, platform updates, new features, monitoring, security response, and support after that period require a separate care plan or approved work order.",
    category: "delivery",
    guidance: "State the exact support period and response expectations in the line items; do not imply an unlimited service level.",
    minimumDepth: "standard",
    appliesTo: ["all"],
  },
  {
    id: "outcomes",
    title: "Professional standard and business outcomes",
    body: "1stStep.ai will perform the services with reasonable professional care. Because results depend on the offer, market, content, traffic, operations, platforms, and client decisions, no specific revenue, ranking, conversion rate, funding, download, approval, or other business result is guaranteed.",
    category: "protection",
    guidance: "Keep performance claims in the proposal factual and verified; do not promise a business result the studio cannot control.",
    minimumDepth: "standard",
    appliesTo: ["all"],
  },
  {
    id: "website-platform-hosting",
    title: "Website platform, hosting, and access",
    body: "The client will own or authorize the website platform, domain, hosting, analytics, and connected business accounts. 1stStep.ai may work within WordPress, Wix, Squarespace, Shopify, Webflow, Framer, GoDaddy, Duda, HubSpot, GHL, or custom systems, but is not responsible for outages or changes controlled by those providers.",
    category: "delivery",
    guidance: "Name the actual platform and confirm who owns every account before launch; remove the broad platform list in the final version if preferred.",
    minimumDepth: "standard",
    appliesTo: ["website"],
  },
  {
    id: "developer-accounts",
    title: "Developer accounts, APIs, and credentials",
    body: "The client owns and pays for Apple Developer membership, backend hosting, APIs, analytics, subscriptions, and production accounts unless the quote expressly says otherwise. The client will provide timely access and keep account, tax, privacy, and business information current.",
    category: "delivery",
    guidance: "Identify every account needed for TestFlight, production, analytics, notifications, payments, and backend services.",
    minimumDepth: "standard",
    appliesTo: ["app"],
  },
  {
    id: "app-store-review",
    title: "App Store submission and platform review",
    body: "1stStep.ai will prepare and submit the agreed build and materials using the client's developer account. Apple and other platforms control review, policy interpretation, timing, ranking, and approval; additional work required by a policy change or rejected third-party content may require a change order.",
    category: "delivery",
    guidance: "Clarify whether submission support, metadata, screenshots, privacy disclosures, and post-rejection work are included.",
    minimumDepth: "standard",
    appliesTo: ["app"],
  },
  {
    id: "retainer-capacity",
    title: "Reserved capacity and monthly priorities",
    body: "The monthly fee reserves the capacity stated in the quote for prioritized website, app, design, or integration work. Unused capacity does not roll over unless the quote says otherwise, and work beyond the reserved amount requires written approval.",
    category: "scope",
    guidance: "State the included hours or capacity, rollover policy, and whether urgent work consumes more capacity.",
    minimumDepth: "essential",
    appliesTo: ["retainer"],
  },
  {
    id: "retainer-response",
    title: "Requests, response time, and service levels",
    body: "Requests will be prioritized through the agreed communication channel. Response and delivery times are targets, not guaranteed service levels, unless the quote includes a written SLA with defined coverage hours, severity levels, and remedies.",
    category: "delivery",
    guidance: "If you sell an SLA, define response versus resolution time, business hours, exclusions, and the client's escalation path.",
    minimumDepth: "standard",
    appliesTo: ["retainer"],
  },
  {
    id: "late-payment",
    title: "Late payment, suspension, and collection costs",
    body: "If an undisputed payment is overdue, 1stStep.ai may pause work and adjust the schedule after written notice. Any late charge, collection cost, or interest applies only to the extent stated here and permitted by applicable law.",
    category: "commercial",
    guidance: "Ask counsel to insert a lawful late-fee structure for the governing jurisdiction before relying on this clause.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "expenses-taxes",
    title: "Expenses, taxes, and purchasing authority",
    body: "The client will reimburse pre-approved out-of-pocket expenses and is responsible for applicable sales, use, or similar taxes, excluding taxes on 1stStep.ai's income. 1stStep.ai will not commit the client to a material third-party purchase without written approval.",
    category: "commercial",
    guidance: "Confirm with an accountant which taxes apply to the specific services and client location.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "portfolio",
    title: "Credits and portfolio use",
    body: "After the work becomes public, 1stStep.ai may identify the client and display non-confidential final deliverables in its portfolio, case studies, awards, and marketing, unless the parties agree in writing to a confidentiality or launch restriction.",
    category: "rights",
    guidance: "Remove or narrow this when an NDA, white-label relationship, regulated launch, or private product requires it.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "privacy-security",
    title: "Data, privacy, and security responsibilities",
    body: "Each party is responsible for the systems and personal data it controls. The client will identify regulated or sensitive data before work begins and provide required policies, notices, consent language, retention rules, and vendors. Security audits, compliance certification, and incident response are excluded unless expressly quoted.",
    category: "protection",
    guidance: "Escalate projects involving health, financial, children's, biometric, or other regulated data to qualified privacy and security counsel.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "accessibility",
    title: "Accessibility and compliance",
    body: "1stStep.ai will follow the accessibility practices specifically stated in the quote. Legal compliance depends on content, integrations, ongoing edits, jurisdiction, and use; audits, remediation guarantees, policy drafting, and certification are separate services unless expressly included.",
    category: "protection",
    guidance: "Name the intended accessibility standard and testing scope when accessibility is a project requirement.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "warranties",
    title: "Representations and warranties",
    body: "Each party represents that it has authority to enter this agreement and provide the materials it contributes. Except for the express commitments in this agreement, services and deliverables are provided without additional warranties to the maximum extent permitted by law.",
    category: "protection",
    guidance: "Have counsel align warranty exclusions with the project, jurisdiction, and any third-party licenses.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "liability",
    title: "Limitation of liability",
    body: "To the maximum extent permitted by law, neither party is liable for indirect, incidental, special, punitive, or consequential damages arising from this project. Any direct-damages cap must be stated in the final agreement and reviewed for the engagement.",
    category: "protection",
    guidance: "Do not improvise a damages cap; ask counsel to choose an appropriate cap and exclusions for the project risk.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "indemnity",
    title: "Third-party claims and indemnification",
    body: "Each party remains responsible for third-party claims caused by materials, instructions, or conduct it supplies or controls. Any duty to defend, indemnify, or reimburse the other party must be limited to the final negotiated language and applicable law.",
    category: "protection",
    guidance: "Indemnity language can shift major risk; it must be tailored and approved by counsel rather than used as boilerplate.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "force-majeure",
    title: "Events outside reasonable control",
    body: "Neither party is responsible for delay caused by events outside its reasonable control, including widespread outages, disasters, labor disruptions, government action, or platform failures, provided it gives notice and resumes performance when reasonably possible.",
    category: "protection",
    guidance: "Consider whether long delays should create a termination right or refund calculation for the specific engagement.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "governing-law",
    title: "Disputes and governing law",
    body: "The parties will first try in good faith to resolve a dispute through direct discussion. Governing law, venue, and any mediation or arbitration requirement must be inserted in the final agreement after review for the client and project.",
    category: "protection",
    guidance: "Choose governing law, venue, and dispute process with counsel; do not send this generic version as the final negotiated clause.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "general-terms",
    title: "Entire agreement and general terms",
    body: "This quote and its enabled agreement sections form the entire agreement for the project and replace prior discussions about the same scope. Amendments must be in writing. If one provision is unenforceable, the remaining provisions continue to the extent permitted by law.",
    category: "protection",
    guidance: "Counsel may also add notices, assignment, waiver, survival, order-of-precedence, and independent-contractor terms.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
  {
    id: "electronic-signatures",
    title: "Counterparts and electronic signatures",
    body: "The parties may sign this agreement in counterparts and by electronic signature, and each signed counterpart will be treated as part of the same agreement. Each signer represents that they are authorized to bind the named party.",
    category: "acceptance",
    guidance: "The current admin creates print-ready signature lines; use a qualified e-sign provider when you need identity evidence and an audit trail.",
    minimumDepth: "comprehensive",
    appliesTo: ["all"],
  },
];

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

export const DEFAULT_CONTRACT_TEMPLATES = [
  template(
    "quick-estimate",
    "Quick estimate / approval",
    "essential",
    "website",
    "Short, practical terms for a small fixed-scope job.",
  ),
  template(
    "website-build",
    "Website build agreement",
    "standard",
    "website",
    "The balanced default for a new website or substantial redesign.",
  ),
  template(
    "website-build-detailed",
    "Detailed website agreement",
    "comprehensive",
    "website",
    "Full commercial, ownership, data, risk, and delivery terms for a larger build.",
  ),
  template(
    "website-rescue",
    "Website rescue sprint",
    "essential",
    "website",
    "A compact structure for audits, repairs, migrations, and focused improvements.",
  ),
  template(
    "website-care",
    "Website care agreement",
    "standard",
    "retainer",
    "Ongoing capacity, response expectations, third-party costs, and monthly payment terms.",
  ),
  template(
    "ios-prototype",
    "iOS prototype agreement",
    "essential",
    "app",
    "A lean product-definition and prototype engagement before a full build.",
  ),
  template(
    "ios-app-build",
    "iOS app build agreement",
    "standard",
    "app",
    "The balanced default for product design, development, testing, and submission.",
  ),
  template(
    "ios-app-build-detailed",
    "Detailed iOS app agreement",
    "comprehensive",
    "app",
    "Full delivery, account, platform, data, ownership, and risk terms for an app build.",
  ),
  template(
    "product-retainer",
    "Digital product partner retainer",
    "standard",
    "retainer",
    "Reserved monthly capacity for ongoing website, app, design, and integration work.",
  ),
  {
    id: "change-order",
    name: "Project change order",
    document_depth: "essential",
    service_type: "website",
    description: "Documents a change to price, scope, or timing without replacing the original agreement.",
    sections: sectionsFromIds([
      "scope",
      "deliverables-exclusions",
      "timeline",
      "change-orders",
      "payment",
      "ownership",
      "general-terms",
      "electronic-signatures",
    ]),
  },
];
