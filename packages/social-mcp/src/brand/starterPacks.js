/**
 * Starter packs: a filled-in first draft of a brand's context. Every field stays editable.
 * Wording is neutral on purpose. "blank" fills nothing.
 */
const PACKS = {
  insurance_agent: {
    label: "Insurance agent",
    audience: "People in your area comparing coverage options",
    voice: {
      tone: "Plain, patient, explains one idea at a time",
      avoid: [
        "rates",
        "savings",
        "subsidies",
        "lowest price",
        "cheapest",
        "guaranteed approval",
        "free coverage",
        "dollar amounts",
        "you qualify",
      ],
      on_camera_style: "Talking head at a desk, one tip per clip",
      energy: "calm",
      appears_on_camera: true,
    },
    hashtags: ["#insurance", "#coverage", "#askanagent"],
    caption_footer: "Educational only, not advice for your situation. Ask a licensed agent about your options.",
    search_terms: {
      primary: ["how insurance works", "coverage basics", "open enrollment explained"],
      secondary: ["insurance terms", "deductible meaning", "policy questions"],
      negative: ["cheap insurance", "free insurance", "guaranteed savings"],
    },
    default_platforms: ["facebook", "instagram", "youtube"],
  },
  coach: {
    label: "Coach",
    audience: "People working toward a specific goal who want structure",
    voice: {
      tone: "Encouraging and direct",
      avoid: ["guaranteed results", "overnight", "income claims", "before and after promises"],
      on_camera_style: "Talking head or whiteboard, one lesson per clip",
      energy: "upbeat",
      appears_on_camera: true,
    },
    hashtags: ["#coaching", "#goals", "#habits"],
    caption_footer: "Save this for later. Questions are welcome in the comments.",
    search_terms: {
      primary: ["coaching tips", "goal setting", "habit building"],
      secondary: ["accountability", "weekly planning", "mindset"],
      negative: ["get rich quick", "guaranteed results"],
    },
    default_platforms: ["instagram", "linkedin", "youtube"],
  },
  realtor: {
    label: "Realtor",
    audience: "Home buyers and sellers in your market",
    voice: {
      tone: "Informative and welcoming to everyone",
      avoid: [
        "family-friendly",
        "perfect for families",
        "safe neighborhood",
        "exclusive neighborhood",
        "ideal for singles",
        "perfect for young professionals",
        "no kids",
        "adults only",
        "near churches",
        "integrated",
        "handicapped",
        "master bedroom",
      ],
      on_camera_style: "Walkthrough video, describe the property not the people",
      energy: "warm",
      appears_on_camera: true,
    },
    hashtags: ["#realestate", "#homebuying", "#justlisted"],
    caption_footer: "Equal Housing Opportunity. Message me for details on this listing.",
    search_terms: {
      primary: ["home buying process", "selling a home", "open house"],
      secondary: ["closing costs explained", "home inspection", "listing walkthrough"],
      negative: ["guaranteed sale", "below market steal"],
    },
    default_platforms: ["facebook", "instagram", "youtube"],
  },
  ecommerce: {
    label: "E-commerce",
    audience: "Shoppers who want to see the product in use",
    voice: {
      tone: "Clear and friendly, product first",
      avoid: ["fake scarcity", "medical claims", "unverified reviews", "best in the world"],
      on_camera_style: "Close-up product demos and unboxings",
      energy: "lively",
      appears_on_camera: false,
    },
    hashtags: ["#shopsmall", "#newarrivals", "#howto"],
    caption_footer: "Link in bio to see the full product details.",
    search_terms: {
      primary: ["product demo", "how to use", "unboxing"],
      secondary: ["gift ideas", "behind the scenes", "customer questions"],
      negative: ["knockoff", "free giveaway scam"],
    },
    default_platforms: ["instagram", "tiktok", "pinterest"],
  },
  local_business: {
    label: "Local business",
    audience: "Neighbors and visitors near your location",
    voice: {
      tone: "Friendly and neighborly",
      avoid: ["best in town", "guaranteed", "competitor names"],
      on_camera_style: "Short clips of the space, the team and the work",
      energy: "warm",
      appears_on_camera: true,
    },
    hashtags: ["#shoplocal", "#smallbusiness", "#community"],
    caption_footer: "Visit us or message us with any questions.",
    search_terms: {
      primary: ["local business", "behind the scenes", "meet the team"],
      secondary: ["community events", "seasonal hours", "how we work"],
      negative: ["franchise", "online only"],
    },
    default_platforms: ["facebook", "instagram", "google_business"],
  },
  personal_brand: {
    label: "Personal brand",
    audience: "People who follow your work and want your perspective",
    voice: {
      tone: "Personal, honest, first person",
      avoid: ["clickbait", "income claims", "guaranteed results"],
      on_camera_style: "Talking head, one idea per clip",
      energy: "conversational",
      appears_on_camera: true,
    },
    hashtags: ["#creator", "#lessonslearned", "#buildinpublic"],
    caption_footer: "Follow along for more.",
    search_terms: {
      primary: ["lessons learned", "how I work", "behind the scenes"],
      secondary: ["career tips", "tools I use", "weekly update"],
      negative: ["get rich quick", "giveaway"],
    },
    default_platforms: ["linkedin", "x", "youtube"],
  },
};

export const STARTER_PACK_IDS = Object.keys(PACKS);

export function listStarterPacks() {
  return STARTER_PACK_IDS.map((id) => ({ id, label: PACKS[id].label }));
}

export function starterPack(id) {
  const pack = PACKS[id];
  return pack ? structuredClone({ id, ...pack }) : null;
}

/** save_brand_context input for a pack. "blank" returns only the identity, so every field stays blank. */
export function starterPackInput(id, { profile_id, name }) {
  if (id === "blank") return { profile_id, name };
  const pack = starterPack(id);
  if (!pack) return null;
  return {
    profile_id,
    name,
    audience: pack.audience,
    voice: pack.voice,
    hashtags: pack.hashtags,
    caption_footer: pack.caption_footer,
    search_terms: pack.search_terms,
    default_platforms: pack.default_platforms,
  };
}
