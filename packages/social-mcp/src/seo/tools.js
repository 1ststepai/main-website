import { z } from "zod";
import { mcpError } from "../errors.js";

const keywordRow = z.object({
  term: z.string().max(80).optional().describe("Keyword text. Empty only when a vidIQ score is attached without a term."),
  volume: z.number().nullable().optional().describe("Search volume from the named source. Omit it when you do not have one."),
  competition: z.union([z.number(), z.string().max(40)]).nullable().optional().describe("Competition score or label from the named source."),
  overall: z.number().nullable().optional().describe("Overall score from the named source, such as a vidIQ score."),
  source: z.enum(["vidiq", "youtube_autocomplete", "google_autocomplete", "youtube_analytics", "search_console", "manual"]).optional().describe("Where this number came from."),
  checked_at: z.string().max(40).optional().describe("ISO time for this keyword. Defaults to the check time."),
});

const channelCopy = z.object({
  platform: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  caption: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  on_screen_text: z.string().optional(),
  copy_only: z.boolean().optional(),
  checklist_score: z.number().optional(),
  notes: z.array(z.string()).optional(),
}).passthrough();

function resultSchema(extra) {
  return z.object({ ok: z.boolean().describe("True when the tool finished."), ...extra }).passthrough();
}

export function registerSeoTools(server, { engine, gated, scopeAllowed = () => true }) {
  function add(name, title, description, scope, hints, inputSchema, outputSchema, handler) {
    server.registerTool(
      name,
      {
        title,
        description,
        inputSchema,
        outputSchema,
        annotations: {
          title,
          readOnlyHint: Boolean(hints.read),
          destructiveHint: Boolean(hints.destructive),
          idempotentHint: Boolean(hints.idempotent),
          openWorldHint: Boolean(hints.open),
        },
      },
      gated(scope, handler),
    );
  }

  const seo = () => {
    if (!engine.seo) throw mcpError("seo_unavailable", "SEO step is not available.", 503);
    return engine.seo;
  };

  add(
    "list_keyword_profiles",
    "List keyword profiles",
    "Read the keyword list for each brand: audience, primary keywords, secondary keywords, and keywords to avoid. Built-in brands are included. This does not publish and does not invent search volumes.",
    "posts:read",
    { read: true, idempotent: true },
    {},
    resultSchema({
      profiles: z.array(z.object({ profile_id: z.string(), name: z.string(), primary: z.array(z.string()) }).passthrough()).optional(),
    }),
    async () => seo().listKeywordProfiles(),
  );

  add(
    "save_keyword_profile",
    "Save keyword profile",
    "Save the audience and keyword lists for one brand. The brand is the same profile used for drafts. This does not publish.",
    "drafts:write",
    { idempotent: true },
    {
      profile_id: z.string().min(2).max(64).describe("Brand profile id, such as 1ststep-ai or skillsprout."),
      name: z.string().max(120).optional().describe("Display name."),
      audience: z.string().max(400).optional().describe("Who the brand is for."),
      primary: z.array(z.string().max(80)).max(40).optional().describe("Primary keywords."),
      secondary: z.array(z.string().max(80)).max(40).optional().describe("Secondary keywords."),
      negative: z.array(z.string().max(80)).max(40).optional().describe("Keywords to avoid."),
      site: z.string().max(200).optional().describe("Site used later for Search Console, such as https://1ststep.ai/."),
    },
    resultSchema({ profile: z.object({ profile_id: z.string() }).passthrough().optional(), notes: z.array(z.string()).optional() }),
    async (args) => seo().saveKeywordProfile(args, { allowProfileWrite: scopeAllowed("accounts:write") }),
  );

  add(
    "suggest_keywords",
    "Suggest keywords",
    "Return keyword ideas for one topic from YouTube suggestions, Google suggestions, saved search terms, and attached research. Failed sources are reported and skipped. Volumes stay empty unless a saved row already has one.",
    "posts:read",
    { read: true, idempotent: true, open: true },
    {
      topic: z.string().min(2).max(120).describe("Topic to look up."),
      profile_id: z.string().min(2).max(64).optional().describe("Brand whose saved terms should be included."),
    },
    resultSchema({
      topic: z.string().optional(),
      suggestions: z.array(z.object({ term: z.string(), source: z.string(), volume: z.number().nullable().optional() }).passthrough()).optional(),
      failures: z.array(z.string()).optional(),
    }),
    async (args) => seo().suggestKeywords(args),
  );

  const researchInput = {
    post_id: z.string().min(8).optional().describe("Single post id."),
    bundle_id: z.string().min(8).optional().describe("Multi-network draft id."),
    source: z.enum(["vidiq", "youtube_autocomplete", "google_autocomplete", "youtube_analytics", "search_console", "manual"]).optional().describe("Where the attached numbers came from. vidIQ is required for 1stStep.ai YouTube approval."),
    notes: z.string().max(2000).optional().describe("Notes pasted with the check."),
    checked_at: z.string().optional().describe("ISO time of the check. Defaults to now."),
    score: z.number().optional().describe("vidIQ overall score when source is vidiq and keywords are omitted."),
    keywords: z.array(keywordRow).max(40).optional().describe("Terms with optional volume, competition, and overall score. Do not invent a volume."),
  };

  const researchOutput = resultSchema({
    keyword_research: z.object({ source: z.string(), checked_at: z.string(), keywords: z.array(z.object({ term: z.string() }).passthrough()) }).passthrough().optional(),
    vidiq: z.object({ checked_at: z.string().optional(), score: z.number().nullable().optional() }).passthrough().nullable().optional(),
  });

  async function attach(args) {
    return seo().attachKeywordResearch(args);
  }

  add(
    "attach_keyword_research",
    "Attach keyword research",
    "Store keyword research on a draft, including vidIQ volume, competition, and overall score when you have them. Each number keeps the source and date you send. This does not publish. A vidIQ source is what 1stStep.ai YouTube approval requires.",
    "drafts:write",
    { idempotent: true },
    researchInput,
    researchOutput,
    attach,
  );

  add(
    "attach_seo_check",
    "Attach SEO check",
    "Store an SEO keyword check on a draft before it is approved. Accepts the same fields as attach_keyword_research, including vidIQ scores with their source and date. This does not publish and does not approve the draft.",
    "drafts:write",
    { idempotent: true },
    researchInput,
    researchOutput,
    attach,
  );

  add(
    "seo_draft",
    "Draft SEO copy",
    "Return a title, description, caption, hashtags, and on-screen text for each requested channel and brand from one topic and the saved keywords. Uses a caption provider when one is configured. Otherwise returns a structured brief and template copy for the client to fill. Does not invent search volumes, does not publish, and does not approve.",
    "posts:read",
    { read: true, idempotent: true },
    {
      topic: z.string().min(2).max(120).describe("One topic for every brand and channel."),
      profile_id: z.string().min(2).max(64).optional().describe("One brand. Omit to draft every saved brand, including the built-in four."),
      profile_ids: z.array(z.string().min(2).max(64)).max(12).optional().describe("Brand ids to draft. Omit for every brand."),
      channels: z.array(z.enum(["youtube", "facebook", "instagram", "bluesky", "tiktok", "x", "linkedin"])).max(7).optional().describe("Channels to draft. Omit for all seven. TikTok, X, and LinkedIn are copy only."),
    },
    resultSchema({
      topic: z.string().optional(),
      mode: z.enum(["template", "brief", "provider"]).optional(),
      needs_client_fill: z.boolean().optional(),
      brief: z.object({ instruction: z.string() }).passthrough().optional(),
      drafts: z.array(z.object({ profile_id: z.string(), channels: z.array(channelCopy) }).passthrough()).optional(),
    }),
    async (args) => seo().draft(args),
  );

  add(
    "seo_score",
    "Score SEO copy",
    "Score a draft before approval: keyword in the title or first line, length, hashtag count and relevance, duplicate or weak keywords, and cross-brand overlap. The result is advisory, except that 1stStep.ai YouTube still needs a vidIQ check. This never approves a draft.",
    "posts:read",
    { read: true, idempotent: true },
    {
      post_id: z.string().min(8).optional().describe("Score a saved post. Omit to score the text fields below."),
      bundle_id: z.string().min(8).optional().describe("Score a saved multi-network draft."),
      profile_id: z.string().min(2).max(64).optional().describe("Brand keyword list to score against."),
      platform: z.enum(["youtube", "facebook", "instagram", "bluesky", "tiktok", "x", "linkedin"]).optional().describe("Channel limits to use. Defaults to YouTube."),
      title: z.string().max(500).optional().describe("Title to score."),
      description: z.string().max(5000).optional().describe("Description to score."),
      caption: z.string().max(5000).optional().describe("Caption to score."),
      hashtags: z.array(z.string().max(80)).max(40).optional().describe("Hashtags to score."),
    },
    resultSchema({
      seo: z.object({
        checklist_score: z.number().optional(),
        notes: z.array(z.string()).optional(),
        advisory: z.boolean().optional(),
        blocking: z.boolean().optional(),
        auto_approve: z.boolean().optional(),
      }).passthrough().optional(),
    }),
    async (args) => {
      if (args.post_id || args.bundle_id) {
        const id = args.bundle_id || args.post_id;
        const item = engine.listQueue().queue.find((row) => row.id === id);
        if (!item) throw mcpError("not_found", "Draft not found in the approval queue.", 404);
        return { seo: item.seo, id: item.id };
      }
      return { seo: seo().score(args) };
    },
  );

  add(
    "connect_search_data",
    "Connect search data",
    "Start a separate Google sign-in for YouTube Analytics search terms and Search Console. This does not change the sign-in used for posting and does not publish.",
    "accounts:write",
    { open: true },
    { profile_id: z.string().min(2).max(64).describe("Brand that will own the search-data connection.") },
    resultSchema({
      authorize_url: z.string().optional(),
      separate_from_publish: z.boolean().optional(),
      message: z.string().optional(),
    }),
    async (args) => seo().connectSearchData(args),
  );

  add(
    "sync_search_terms",
    "Sync search terms",
    "Read YouTube Analytics search terms (views from YouTube search) and Search Console queries for a brand that has connected search data. Saves those terms for later keyword suggestions. Does nothing when search data is not connected.",
    "drafts:write",
    { idempotent: true, open: true },
    {
      profile_id: z.string().min(2).max(64).describe("Brand to sync."),
      site: z.string().max(200).optional().describe("Search Console property, such as https://1ststep.ai/."),
      days: z.number().int().min(1).max(90).optional().describe("How many days back to read. Defaults to 28."),
    },
    resultSchema({
      connected: z.boolean().optional(),
      queries: z.array(z.object({ term: z.string(), source: z.string() }).passthrough()).optional(),
      failures: z.array(z.string()).optional(),
    }),
    async (args) => seo().syncSearchTerms(args),
  );

  add(
    "seo_weekly_report",
    "Weekly SEO report",
    "Summarize the last week for each brand: drafts that were posted, keywords used, saved search terms, keyword overlaps, and terms to consider. This does not publish.",
    "posts:read",
    { read: true, idempotent: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Limit the report to one brand."),
      days: z.number().int().min(1).max(30).optional().describe("Window in days. Defaults to 7."),
    },
    resultSchema({
      window: z.object({ days: z.number(), start: z.string(), end: z.string() }).optional(),
      brands: z.array(z.object({ profile_id: z.string(), name: z.string() }).passthrough()).optional(),
    }),
    async (args) => seo().weeklyReport(args),
  );

  add(
    "seo_keyword_planner",
    "Keyword Planner status",
    "Return the Keyword Planner interface. The call does not contact Google. The feature is off unless POSTPATH_SEO_ADS=1, and this version does not request volume ranges either way. Ranges, when a later version asks for them, are ranges rather than exact volumes and need an Ads account plus a developer token.",
    "posts:read",
    { read: true, idempotent: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Brand the future request would use."),
      terms: z.array(z.string().max(80)).max(20).optional().describe("Terms a later version would send. Ignored while the feature is off."),
    },
    resultSchema({ enabled: z.boolean().optional(), available: z.boolean().optional(), called_network: z.boolean().optional() }),
    async () => seo().keywordPlanner(),
  );

  add(
    "seo_trends",
    "Google Trends status",
    "Return the Google Trends interface. The call does not contact Google. The feature is off unless POSTPATH_SEO_TRENDS=1, and this version does not request interest either way. Official Trends access is limited and is not a general keyword-volume API.",
    "posts:read",
    { read: true, idempotent: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Brand the future request would use."),
      terms: z.array(z.string().max(80)).max(5).optional().describe("Terms a later version would send. Ignored while the feature is off."),
      geo: z.string().max(8).optional().describe("Region code a later version would send."),
    },
    resultSchema({ enabled: z.boolean().optional(), available: z.boolean().optional(), called_network: z.boolean().optional() }),
    async () => seo().trends(),
  );
}
