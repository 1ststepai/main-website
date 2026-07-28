const FEATURE_DEFINITIONS = [
  { label: "Custom animation", pattern: /\banimat(?:e|ed|ion|ions)|motion|microinteraction|scroll effect/i },
  { label: "3D / interactive storytelling", pattern: /\b3d\b|three[- ]dimensional|interactive storytelling|webgl/i },
  { label: "CMS", pattern: /\bcms\b|content management|edit(?:able|ing) content/i },
  { label: "Ecommerce", pattern: /e-?commerce|online store|shopping cart|product catalog|shopify/i },
  { label: "Booking", pattern: /book(?:ing|ings)|appointment|calendar|schedule a call/i },
  { label: "Lead capture", pattern: /lead form|contact form|inquiry form|quote form|lead capture/i },
  { label: "Analytics", pattern: /analytics|tracking|conversion event|tag manager/i },
  { label: "SEO", pattern: /\bseo\b|search engine|schema markup/i },
  { label: "Copywriting", pattern: /copywriting|write the copy|website copy|content writing/i },
  { label: "User accounts", pattern: /user account|member account|login|sign[- ]?in|authentication|membership/i },
  { label: "Payments", pattern: /stripe|payment|checkout|subscription|billing/i },
  { label: "API / backend", pattern: /\bapi\b|backend|back end|database|server|integration/i },
  { label: "Push notifications", pattern: /push notification|notifications/i },
  { label: "App Store submission", pattern: /app store|testflight|apple developer|submission/i },
  { label: "Migration", pattern: /migrat(?:e|ion)|move from|replatform/i },
  { label: "WordPress", pattern: /wordpress|woocommerce/i },
  { label: "Wix", pattern: /\bwix\b/i },
  { label: "Squarespace", pattern: /squarespace/i },
  { label: "Shopify", pattern: /shopify/i },
  { label: "Webflow", pattern: /webflow/i },
  { label: "Framer", pattern: /\bframer\b/i },
  { label: "GoDaddy", pattern: /godaddy/i },
  { label: "GHL", pattern: /\bghl\b|go high level|gohighlevel/i },
];

const PHASES = {
  "website-rescue": [
    ["Audit & priority plan", "Technical, mobile, usability, and conversion review", 20],
    ["Repairs & improvements", "Implement the agreed priority fixes and cleanup", 65],
    ["QA & handoff", "Cross-device checks, review, and release support", 15],
  ],
  "single-page-launch": [
    ["Strategy & content structure", "Offer, page flow, and conversion plan", 20],
    ["Custom UI design", "Responsive visual direction and page design", 30],
    ["Responsive build & lead capture", "Production build, forms, and integrations", 40],
    ["QA & launch", "Cross-device testing and production release", 10],
  ],
  "growth-website": [
    ["Strategy & architecture", "Discovery, sitemap, content direction, and technical plan", 15],
    ["UI/UX design", "Responsive custom interface and design system", 25],
    ["Website development", "Frontend build, CMS, and agreed functionality", 45],
    ["Integrations & analytics", "Forms, booking, measurement, and connected tools", 10],
    ["QA & launch", "Cross-device testing, handoff, and production launch", 5],
  ],
  "premium-motion-website": [
    ["Creative direction", "Experience concept, visual language, and interaction plan", 15],
    ["UI/UX design", "Premium responsive interface and design system", 25],
    ["Custom development", "Production frontend, CMS, and agreed integrations", 35],
    ["Motion & interaction system", "Signature animation, transitions, and interactive storytelling", 20],
    ["Performance QA & launch", "Optimization, cross-device testing, and release", 5],
  ],
  "ios-prototype": [
    ["Product workshop", "Goals, audience, constraints, and feature priorities", 20],
    ["UX flow", "Core journeys, information architecture, and screen plan", 25],
    ["High-fidelity iOS design", "Polished native interface for the key experience", 35],
    ["Interactive prototype & roadmap", "Testable prototype, findings, and build estimate", 20],
  ],
  "ios-mvp": [
    ["Product architecture", "MVP scope, user journeys, data model, and release plan", 15],
    ["iOS UI/UX design", "Native responsive interface and product states", 20],
    ["iOS development", "Core application features and client-side implementation", 40],
    ["Backend & integrations", "Agreed APIs, data, authentication, and connected services", 15],
    ["Testing & App Store preparation", "QA, release build, and submission support", 10],
  ],
  "website-care": [
    ["Monthly website care", "Monitoring, routine updates, small improvements, and priority support", 100],
  ],
  "digital-product-partner": [
    ["Monthly digital product capacity", "Reserved website, app, design, and integration support", 100],
  ],
};

const PROJECT_TITLES = {
  "website-rescue": "Website rescue and improvements",
  "single-page-launch": "Single-page website launch",
  "growth-website": "Custom business website",
  "premium-motion-website": "Premium animated website",
  "ios-prototype": "iOS product prototype",
  "ios-mvp": "iOS MVP build",
  "website-care": "Website care plan",
  "digital-product-partner": "Digital product partnership",
};

function selectStructureId(brief) {
  const recurring = /monthly|ongoing|retainer|maintenance|care plan|regular updates|support plan/i.test(brief);
  const app = /\bios\b|iphone|ipad|mobile app|app store|testflight|swiftui|\bapp\b/i.test(brief);

  if (recurring) {
    return /maintenance|plugin update|uptime|content change|website care|website support/i.test(brief)
      ? "website-care"
      : "digital-product-partner";
  }
  if (app) {
    return /prototype|clickable mockup|validate|proof of concept|\bpoc\b|test the idea/i.test(brief)
      ? "ios-prototype"
      : "ios-mvp";
  }
  if (
    /existing|current|broken|fix|repair|cleanup|clean up|small improvement/i.test(brief)
    && !/full redesign|complete redesign|rebuild|brand new|new website/i.test(brief)
  ) return "website-rescue";
  if (/landing page|single[- ]page|one[- ]page|campaign page|microsite/i.test(brief)) return "single-page-launch";
  if (/premium|high[- ]end|animation|motion|microinteraction|\b3d\b|webgl|immersive|interactive storytelling/i.test(brief)) {
    return "premium-motion-website";
  }
  return "growth-website";
}

function findStructure(structureId, pricingStructures) {
  const exact = pricingStructures.find((structure) => structure.id === structureId);
  if (exact) return exact;
  const category = structureId.startsWith("ios-")
    ? "app"
    : structureId.includes("care") || structureId.includes("partner")
      ? "recurring"
      : "website";
  const fallback = pricingStructures.find((structure) => structure.category === category)
    || pricingStructures[0];
  if (!fallback) throw new Error("Add at least one service to the price book before building a quote.");
  return fallback;
}

function splitPrice(structureId, amount) {
  const phases = PHASES[structureId] || [[
    "Project services",
    "Services and deliverables described in the project brief",
    100,
  ]];
  const totalCents = Math.round((Number(amount) || 0) * 100);
  let allocatedCents = 0;
  return phases.map(([name, description, percent], index) => {
    const cents = index === phases.length - 1
      ? totalCents - allocatedCents
      : Math.round(totalCents * (percent / 100));
    allocatedCents += cents;
    return { name, description, quantity: 1, rate: cents / 100 };
  });
}

function depthFor(structureId, detectedFeatures) {
  if (["premium-motion-website", "ios-mvp"].includes(structureId)) return "comprehensive";
  const highRisk = detectedFeatures.some((feature) => (
    ["Ecommerce", "User accounts", "Payments", "API / backend"].includes(feature)
  ));
  if (highRisk && structureId === "growth-website") return "comprehensive";
  if (["website-rescue", "single-page-launch", "ios-prototype"].includes(structureId)) return "essential";
  return "standard";
}

function serviceTypeFor(structureId) {
  if (structureId.startsWith("ios-")) return "app";
  if (["website-care", "digital-product-partner"].includes(structureId)) return "retainer";
  return "website";
}

function templateFor(structureId, depth) {
  if (structureId === "website-rescue") return "website-rescue";
  if (structureId === "website-care") return "website-care";
  if (structureId === "digital-product-partner") return "product-retainer";
  if (structureId === "ios-prototype") return "ios-prototype";
  if (structureId === "ios-mvp") {
    return depth === "comprehensive" ? "ios-app-build-detailed" : "ios-app-build";
  }
  if (depth === "essential") return "quick-estimate";
  if (depth === "comprehensive") return "website-build-detailed";
  return "website-build";
}

export function draftQuoteFromBrief(rawBrief, pricingStructures = []) {
  const brief = String(rawBrief || "").replace(/\s+/g, " ").trim();
  if (!brief) throw new Error("Describe the project or paste the client's request first.");
  if (brief.length > 8000) throw new Error("Keep the project brief under 8,000 characters.");
  if (!Array.isArray(pricingStructures) || pricingStructures.length === 0) {
    throw new Error("Add at least one service to the price book before building a quote.");
  }

  const structureId = selectStructureId(brief);
  const structure = findStructure(structureId, pricingStructures);
  const detectedFeatures = FEATURE_DEFINITIONS
    .filter((feature) => feature.pattern.test(brief))
    .map((feature) => feature.label);
  const documentDepth = depthFor(structureId, detectedFeatures);
  const serviceType = serviceTypeFor(structureId);
  const recurring = serviceType === "retainer";

  return {
    structure_id: structure.id,
    structure_name: structure.name,
    service_type: serviceType,
    document_depth: documentDepth,
    template_id: templateFor(structureId, documentDepth),
    project_title: detectedFeatures.includes("Ecommerce") && structureId === "growth-website"
      ? "Ecommerce website"
      : PROJECT_TITLES[structureId] || structure.name,
    summary: brief.slice(0, 2000),
    line_items: splitPrice(structureId, structure.starting_price),
    payment_plan: recurring ? "full" : "three_payments",
    deposit_percent: recurring ? 100 : 40,
    detected_features: detectedFeatures,
    pricing_source: `${structure.name} starting price from your saved price book`,
    recommendation: documentDepth === "comprehensive"
      ? "Detailed agreement recommended because the build has broader technical or commercial risk."
      : documentDepth === "essential"
        ? "Basic agreement recommended for a focused, well-defined scope."
        : "Professional agreement recommended for a typical custom engagement.",
  };
}
