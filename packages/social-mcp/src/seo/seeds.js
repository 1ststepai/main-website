/** Built-in keyword lists for the brands PostPath already posts for. */
export const SEED_BRANDS = [
  {
    id: "1ststep-ai",
    name: "1stStep.ai",
    audience:
      "Founders and operators who already have demand and need the systems between leads, tools, people, and follow-up.",
    primary: ["systems for founders", "lead follow-up", "business systems"],
    secondary: ["workflow diagnosis", "founder operations", "automation after the bottleneck"],
    negative: ["guaranteed revenue", "generic ai consulting", "seo agency", "real rank"],
    site: "https://1ststep.ai/",
  },
  {
    id: "skillsprout",
    name: "SkillSprout",
    audience: "Teachers and parents making K–6 worksheets they can check before they print them.",
    primary: ["k-6 worksheets", "printable worksheets", "worksheet builder"],
    secondary: ["elementary practice", "teacher worksheets", "parent worksheets"],
    negative: ["guaranteed grades", "homework answers", "test answers"],
    site: "https://skillsprout.1ststep.ai/",
  },
  {
    id: "swing-trade-pros",
    name: "Swing Trade Pros",
    audience: "Swing traders who want a process for reviewing setups. No performance promise.",
    primary: ["swing trading process", "trade setup review", "trading education"],
    secondary: ["node ai", "chart review", "trading community"],
    negative: ["guaranteed profits", "get rich", "signals that always win", "financial advice"],
    site: "https://swingtradepros.com/",
  },
  {
    id: "daysetgo",
    name: "DaySetGo",
    audience: "Families who want a simple plan for the day.",
    primary: ["family day planner", "daily family plan", "day planner app"],
    secondary: ["family schedule", "kids routine", "household plan"],
    negative: ["guaranteed productivity", "medical advice"],
    site: "https://daysetgo.ai/",
  },
];

export const SEED_PRESETS = {
  platforms: ["youtube", "facebook", "instagram", "bluesky"],
  privacy_status: "private",
  hashtags: [],
  caption_footer: "",
};

export function seedById(id) {
  return SEED_BRANDS.find((seed) => seed.id === id) || null;
}
