export const ADS_FLAG = "POSTPATH_SEO_ADS";
export const TRENDS_FLAG = "POSTPATH_SEO_TRENDS";

function enabled(env, name) {
  return String(env?.[name] || "").trim() === "1";
}

export function keywordPlannerStub(env = process.env) {
  const flag = enabled(env, ADS_FLAG);
  return {
    enabled: flag,
    available: false,
    called_network: false,
    provider: "google_ads_keyword_planner",
    needs: ["A Google Ads account", "A Google Ads developer token"],
    returns: "Search volume ranges, not exact volumes.",
    reason: flag
      ? "The flag is on. This version still does not call Keyword Planner."
      : "Keyword Planner is off. Set POSTPATH_SEO_ADS=1 only after an Ads account and developer token exist. This version still will not call the API.",
    interface: {
      tool: "seo_keyword_planner",
      input: { profile_id: "string", terms: ["string"] },
      output: {
        enabled: "boolean",
        ranges: [{ term: "string", low: "number", high: "number" }],
      },
    },
  };
}

export function trendsStub(env = process.env) {
  const flag = enabled(env, TRENDS_FLAG);
  return {
    enabled: flag,
    available: false,
    called_network: false,
    provider: "google_trends",
    needs: ["A supported official Trends API. The public alpha is limited and is not a general keyword API."],
    returns: "Interest over time, not search volume.",
    reason: flag
      ? "The flag is on. This version still does not call Google Trends."
      : "Google Trends is off. Set POSTPATH_SEO_TRENDS=1 to expose the interface. This version still will not call the API.",
    interface: {
      tool: "seo_trends",
      input: { profile_id: "string", terms: ["string"], geo: "string" },
      output: {
        enabled: "boolean",
        points: [{ term: "string", date: "string", interest: "number" }],
      },
    },
  };
}
