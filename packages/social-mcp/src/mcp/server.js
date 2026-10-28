import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createEngine } from "../engine.js";
import { formatToolError, formatToolResult, mcpError } from "../errors.js";
import { paths, PLATFORMS } from "../home.js";
import { loadOAuthEnvFile } from "../envFile.js";
import { POSTPATH_INSTRUCTIONS } from "./instructions.js";
import { registerSeoTools } from "../seo/tools.js";
import { registerHookTools } from "../hook/tools.js";
import { DRAFT_ONLY_SCOPES } from "./clients.js";
import { isDraftOnly } from "../pilot/config.js";
import { assertOwnerPin, ownerPinConfigured } from "../pilot/ownerAuth.js";
import { getBrandContext, saveBrandContext } from "../brand/context.js";

const outputSchema = z
  .object({
    ok: z.boolean().describe("True when the tool finished."),
    message: z.string().optional().describe("Short explanation when one is useful."),
    post: z.object({ id: z.string(), status: z.string().optional(), platform: z.string().optional() }).passthrough().optional(),
    posts: z.array(z.object({ id: z.string() }).passthrough()).optional(),
    bundle: z.object({ id: z.string(), status: z.string().optional(), title: z.string().optional() }).passthrough().optional(),
    queue: z.array(z.object({ id: z.string() }).passthrough()).optional(),
  })
  .passthrough();

const platformOverride = z
  .object({
    title: z.string().max(100).optional().describe("Network-specific title. YouTube uses this when the draft title is omitted."),
    description: z.string().max(5000).optional().describe("Network-specific description."),
    caption: z.string().max(2200).optional().describe("Network-specific caption."),
    tags: z.array(z.string().max(40)).max(30).optional().describe("Network-specific tags or hashtags."),
    privacy_status: z.enum(["private", "unlisted", "public"]).optional().describe("Network privacy. YouTube defaults to private."),
    placement: z.string().max(40).optional().describe("Network preset id, such as youtube_long or instagram_story."),
    generate: z
      .object({
        prompt: z.string().min(1).max(2000).describe("Prompt used only for this network."),
        type: z.enum(["image", "video"]).optional().describe("image or video. Video is stored silent."),
        style: z.string().max(200).optional().describe("Optional style note."),
        duration: z.number().min(1).max(3600).optional().describe("Video length in seconds."),
        provider: z.enum(["mock", "openai", "google", "xai", "replicate", "fal", "claude"]).optional().describe("Provider for this network. claude designs a text card. It does not generate a photo or a video."),
        placement: z.string().max(40).optional().describe("Network preset id."),
      })
      .optional()
      .describe("Optional generation for this network only."),
  })
  .optional();

const draftShape = {
  profile_id: z.string().min(2).max(64).describe("Brand profile id."),
  platform: z.enum(PLATFORMS).optional().describe("One network. Omit when platforms is set."),
  platforms: z.array(z.enum(PLATFORMS)).min(1).max(8).optional().describe("Networks that share this draft. Example: youtube, facebook, instagram."),
  overrides: z
    .object({
      youtube: platformOverride,
      facebook: platformOverride,
      instagram: platformOverride,
      tiktok: platformOverride,
    })
    .optional()
    .describe("Optional per-network title, caption, tags, or privacy."),
  title: z.string().max(100).optional().describe("Draft title. If omitted, the YouTube override title is used, otherwise a shortened caption."),
  description: z.string().max(5000).optional().describe("Shared description."),
  caption: z.string().max(2200).optional().describe("Shared caption."),
  tags: z.array(z.string().max(40)).max(30).optional().describe("Shared tags or hashtags."),
  privacy_status: z.enum(["private", "unlisted", "public"]).optional().describe("Default privacy. YouTube uses private when this is omitted."),
  media_path: z.string().optional().describe("File name or path inside the PostPath media folder."),
  media_url: z.string().url().optional().describe("Public https URL for networks that can fetch media."),
  media_content_type: z.string().optional().describe("MIME type, usually video/mp4."),
  instagram_public_confirmed: z.boolean().optional().describe("Set true only after the user agrees Instagram will be public."),
  facebook_public: z.boolean().optional().describe("Set true to make a Facebook Reel public. Otherwise it stays a Page draft."),
  media: z
    .object({
      generate: z
        .object({
          prompt: z.string().min(1).max(2000).describe("What the image or video should show."),
          type: z.enum(["image", "video"]).describe("image or video. Generated video is silent: no music and no voice."),
          style: z.string().max(200).optional().describe("Optional style note."),
          duration: z.number().min(1).max(3600).optional().describe("Video length in seconds. Network presets can reject a length that does not fit."),
          provider: z.enum(["mock", "openai", "google", "xai", "replicate", "fal", "claude"]).describe("Bring-your-own-key provider. mock writes a local demo file and does not call a paid API. claude designs an SVG or HTML card and PostPath renders the PNG. Claude does not generate photos or video."),
          placement: z.string().max(40).optional().describe("Preset id such as youtube_short, youtube_long, instagram_reel, or instagram_story."),
        })
        .optional()
        .describe("Generate the asset. Omit this and pass media_path to use a file you already have."),
    })
    .optional()
    .describe("Optional generated asset. A draft is still not published."),
  wait: z.boolean().optional().describe("Wait until generation finishes. Omit to return while generation continues."),
  caption_provider: z.enum(["none", "mock", "claude"]).optional().describe("Who drafts per-network titles, captions, and tags. none keeps the caption you sent. claude uses the Anthropic key on this computer."),
  review: z.boolean().optional().describe("When true, Claude adds advisory checklist notes after the asset is ready. Notes never approve the draft."),
  review_provider: z.enum(["mock", "claude"]).optional().describe("Review writer. mock is a local checklist and does not call Claude."),
};

function safeMediaName(name) {
  const base = String(name || "upload.bin").split(/[/\\]/).pop();
  const clean = base.replace(/[^A-Za-z0-9._-]/g, "").slice(0, 80);
  if (!clean || clean.startsWith(".")) throw mcpError("invalid_media", "Media file name is invalid.");
  return clean;
}

export function createSocialMcpServer({ engine, auth, env = process.env } = {}) {
  if (!engine) loadOAuthEnvFile(paths(), env);
  const eng = engine || createEngine({ env });
  const gate = auth === undefined ? (isDraftOnly(env, eng.store.homePaths) ? { scopes: [...DRAFT_ONLY_SCOPES] } : null) : auth;
  const server = new McpServer(
    { name: "postpath", version: "0.1.0" },
    {
      instructions: POSTPATH_INSTRUCTIONS,
      capabilities: { elicitation: {} },
    },
  );

  function scopeAllowed(scope) {
    if (!gate) return true;
    const scopes = gate.scopes || [];
    if (scopes.includes(scope)) return true;
    if (scope === "accounts:write" && scopes.includes("owner")) return true;
    return false;
  }

  function gated(scope, handler) {
    return async (args) => {
      try {
        if (!scopeAllowed(scope)) {
          const extra = scope === "queue:approve" ? " queue:approve is off until it is ticked." : "";
          throw mcpError(
            "insufficient_scope",
            `This call needs the ${scope} scope. Open ${gate.connectUrl || "the PostPath desk"} and approve it.${extra}`,
          );
        }
        return formatToolResult(await handler(args));
      } catch (error) {
        return formatToolError(error);
      }
    };
  }

  function add(name, title, description, scope, hints, inputSchema, handler) {
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

  /** Drafts land in the queue. Only an owner-enabled auto-post for this exact connection, brand and network publishes them. */
  async function createThenMaybeAutoPost(args) {
    const out = await eng.createDraft({ ...args, source: "mcp" });
    const connectionId = gate?.connectionId;
    if (!connectionId || !eng.autoPublishDrafts) return out;
    const posts = out.posts || (out.post ? [out.post] : []);
    const results = await eng.autoPublishDrafts({ posts, connection_id: connectionId });
    if (!results.some((row) => row.auto_post !== "off")) return out;
    const fresh = posts.map((post) => eng.store.getPost(post.id) || post);
    return { ...out, posts: out.posts ? fresh : undefined, post: fresh[0], auto_post: results };
  }

  function callerScopes() {
    return gate ? [...(gate.scopes || [])] : null;
  }

  add("status", "Desk status", "Read the local PostPath setup: home path, profiles, connected networks, and redirect URIs.", "posts:read", { read: true, idempotent: true }, {}, async () => eng.publicStatus());

  add(
    "upsert_profile",
    "Save brand profile",
    "Create or update a brand profile, including presets for default platforms, privacy, hashtags, and a caption footer.",
    "accounts:write",
    { idempotent: true },
    {
      id: z.string().min(2).max(64).describe("Stable profile id, such as acme or 1ststep-ai."),
      name: z.string().min(1).max(120).optional().describe("Display name."),
      require_vidiq: z.boolean().optional().describe("When true, YouTube cannot be approved until a vidIQ check is attached. Defaults on for 1ststep-ai."),
      presets: z
        .object({
          platforms: z.array(z.enum(PLATFORMS)).max(8).optional().describe("Default networks for new drafts."),
          privacy_status: z.enum(["private", "unlisted", "public"]).optional().describe("Default privacy. Private is the usual value."),
          hashtags: z.array(z.string().max(40)).max(30).optional().describe("Hashtags added to new drafts."),
          caption_footer: z.string().max(500).optional().describe("Text appended to new captions."),
        })
        .optional()
        .describe("Defaults applied to new multi-network drafts."),
    },
    async (args) => eng.upsertProfile(args),
  );

  add(
    "get_brand_context",
    "Get brand context",
    "Call this first. Returns each brand's identity, networks, voice, topics, rules, what this connection may do, auto-post state, and the list of missing fields. Blank fields stay blank: ask the user about missing fields once, then draft. Read-only.",
    "posts:read",
    { read: true, idempotent: true },
    { profile_id: z.string().min(2).max(64).optional().describe("One brand. Omit for every brand.") },
    async (args) => getBrandContext(eng, { profile_id: args.profile_id, scopes: callerScopes(), connectionId: gate?.connectionId || null }),
  );

  add(
    "save_brand_context",
    "Save brand context",
    "Save the user's answers in one all-or-nothing call: profile basics, default networks and privacy, hashtags, caption footer, audience, search terms (primary, secondary, negative), voice, and an optional auto-post request. The auto-post request is only recorded as pending; it never turns auto-post on. Only the owner can do that in the PostPath desk. Requires accounts:write; in pilot mode it also needs the owner PIN.",
    "accounts:write",
    { idempotent: true },
    {
      profile_id: z.string().min(2).max(64).describe("Brand id, such as acme or 1ststep-ai."),
      name: z.string().min(1).max(120).optional().describe("Display name."),
      audience: z.string().max(400).optional().describe("Who the brand talks to, in the user's words."),
      default_platforms: z.array(z.enum(PLATFORMS)).max(16).optional().describe("Default networks for new drafts."),
      privacy_status: z.enum(["private", "unlisted", "public"]).optional().describe("Default privacy. Private is the usual value."),
      hashtags: z.array(z.string().max(40)).max(30).optional(),
      caption_footer: z.string().max(500).optional(),
      require_vidiq: z.boolean().optional(),
      search_terms: z
        .object({
          primary: z.array(z.string().max(80)).max(40).optional(),
          secondary: z.array(z.string().max(80)).max(40).optional(),
          negative: z.array(z.string().max(80)).max(40).optional(),
        })
        .optional(),
      voice: z
        .object({
          tone: z.string().max(200).optional(),
          avoid: z.array(z.string().max(80)).max(20).optional(),
          on_camera_style: z.string().max(200).optional(),
          energy: z.string().max(80).optional(),
          appears_on_camera: z.boolean().optional(),
        })
        .optional(),
      auto_post: z
        .object({ networks: z.array(z.enum(PLATFORMS)).max(16).describe("Networks the user would like auto-posted. Saved as a pending request only.") })
        .optional()
        .describe("Only send when the user asked for auto-post. Skipped means off."),
      owner_pin: z.string().max(80).optional().describe("Owner PIN. Needed in pilot mode."),
    },
    async ({ owner_pin, search_terms, ...args }) => {
      const pilot = eng.pilotOn ? eng.pilotOn() : false;
      if (pilot) {
        if (!ownerPinConfigured(eng.store.homePaths)) throw mcpError("owner_auth", "Pilot mode: set an owner PIN in the desk before saving brand context.", 403);
        if (!owner_pin) throw mcpError("owner_auth", "Pilot mode: saving brand context needs the owner PIN.", 401);
        assertOwnerPin(eng.store.homePaths, owner_pin);
      }
      return saveBrandContext(eng, { ...args, search_terms }, { connectionId: gate?.connectionId || null, scopes: callerScopes(), pilot });
    },
  );

  add(
    "list_accounts",
    "List connected accounts",
    "List brand profiles and the social accounts connected on this computer.",
    "accounts:read",
    { read: true, idempotent: true },
    { profile_id: z.string().min(2).max(64).optional().describe("Limit the list to one profile.") },
    async (args) => eng.listAccounts(args.profile_id),
  );

  add(
    "connect_accounts",
    "Start account sign-in",
    "Open the browser so the user can sign in. One call chains the networks that are not connected yet: YouTube, Facebook, Instagram, TikTok, LinkedIn, X, Threads, Pinterest, Google Business, Reddit, and Snapchat. Bluesky uses connect_bluesky in the same Connect flow. This does not publish.",
    "accounts:write",
    { open: true },
    {
      profile_id: z.string().min(2).max(64).describe("Profile that will own the connection."),
      platforms: z.array(z.enum(["youtube", "meta", "tiktok", "instagram", "facebook", "linkedin", "x", "threads", "pinterest", "google_business", "reddit", "snapchat"])).optional().describe("Networks to connect. Default is each missing OAuth network."),
    },
    async (args) => eng.connectAccounts(args.profile_id, { platforms: args.platforms }),
  );

  add(
    "connect_bluesky",
    "Connect Bluesky",
    "Store a Bluesky handle and app password for a profile. Use this from the same Connect flow as connect_accounts. This does not publish.",
    "accounts:write",
    { open: true },
    {
      profile_id: z.string().min(2).max(64).describe("Profile that will own the connection."),
      handle: z.string().min(2).max(120).describe("Bluesky handle, such as you.bsky.social."),
      app_password: z.string().min(8).max(200).describe("Bluesky app password from the user's Bluesky settings."),
    },
    async (args) => eng.connectBluesky(args.profile_id, { handle: args.handle, app_password: args.app_password }),
  );

  add(
    "stage_media",
    "Save media file",
    "Save a media file into the local PostPath media folder and return media_path for create_draft.",
    "drafts:write",
    {},
    {
      filename: z.string().min(1).max(80).describe("File name, such as short.mp4."),
      bytes_base64: z.string().min(1).max(12_000_000).describe("File bytes encoded as base64. Maximum about 8 MB."),
    },
    async (args) => {
      const name = safeMediaName(args.filename);
      const bytes = Buffer.from(args.bytes_base64, "base64");
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw mcpError("invalid_media", "Media must be between 1 byte and 8 MB.");
      const dir = eng.store.homePaths.mediaDir;
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, name), bytes);
      return { media_path: name, bytes: bytes.length };
    },
  );

  add(
    "create_draft",
    "Create draft",
    "Create a draft post for one or more social networks. It lands in the approval queue and is not published.",
    "drafts:write",
    {},
    draftShape,
    async (args) => createThenMaybeAutoPost(args),
  );

  add(
    "create_post",
    "Create multi-network draft",
    "Create one draft for several networks from one media file and a shared caption, with optional per-network overrides. It is not published.",
    "drafts:write",
    {},
    draftShape,
    async (args) => createThenMaybeAutoPost(args),
  );

  add(
    "generate_media",
    "Generate media",
    "Generate an image or a silent video for an existing draft. Video is stored with no music and no voice. The result stays in the approval queue and is not published.",
    "drafts:write",
    { open: true },
    {
      bundle_id: z.string().min(8).optional().describe("Multi-network draft id."),
      post_id: z.string().min(8).optional().describe("Single post id."),
      platform: z.enum(PLATFORMS).optional().describe("Limit generation to one network in the draft."),
      prompt: z.string().min(1).max(2000).optional().describe("What to generate. Omit to reuse the draft's saved prompt."),
      type: z.enum(["image", "video"]).optional().describe("image or video. Video is silent."),
      style: z.string().max(200).optional().describe("Optional style note."),
      duration: z.number().min(1).max(3600).optional().describe("Video length in seconds."),
      provider: z.enum(["mock", "openai", "google", "xai", "replicate", "fal", "claude"]).optional().describe("Provider. mock does not call a paid API. claude designs a card, not a photo or video."),
      placement: z.string().max(40).optional().describe("Network preset id."),
      wait: z.boolean().optional().describe("Wait until the file is ready. Omit to return while status stays generating."),
    },
    async (args) => eng.generateMedia(args),
  );

  add(
    "attach_media",
    "Attach media",
    "Attach a file that is already in the PostPath media folder, including a file made by the client's own model. A generated video is stored silent. This does not publish.",
    "drafts:write",
    {},
    {
      bundle_id: z.string().min(8).optional().describe("Multi-network draft id."),
      post_id: z.string().min(8).optional().describe("Single post id."),
      platform: z.enum(PLATFORMS).optional().describe("Attach to one network. Omit to attach a derived file for each network in the draft."),
      media_path: z.string().min(1).describe("File name returned by stage_media, inside the PostPath media folder."),
      type: z.enum(["image", "video"]).optional().describe("image or video. Defaults to the draft's type, or video."),
      ai_generated: z.boolean().optional().describe("True when the file was generated. Defaults to true, which strips audio from video and sets the AI disclosure flag."),
      prompt: z.string().max(2000).optional().describe("Prompt to store with the file, when the client made it."),
    },
    async (args) => eng.attachMedia(args),
  );

  add(
    "update_draft",
    "Edit draft",
    "Change the copy or media on a draft, scheduled, or failed post that has not been sent.",
    "drafts:write",
    { idempotent: true },
    {
      post_id: z.string().min(8).describe("Post id to edit."),
      title: z.string().max(100).optional().describe("Replacement title."),
      description: z.string().max(5000).optional().describe("Replacement description."),
      caption: z.string().max(2200).optional().describe("Replacement caption."),
      tags: z.array(z.string().max(40)).max(30).optional().describe("Replacement tags."),
      privacy_status: z.enum(["private", "unlisted", "public"]).optional().describe("Replacement privacy."),
      media_path: z.string().optional().describe("Replacement media path inside the media folder."),
      media_url: z.string().url().optional().describe("Replacement https media URL."),
      media_content_type: z.string().optional().describe("Replacement MIME type."),
    },
    async (args) => eng.updateDraft(args),
  );

  add(
    "attach_vidiq_check",
    "Attach vidIQ check",
    "Record a vidIQ score and notes on a YouTube draft. Profiles that require this check cannot be approved until it is present. This does not publish.",
    "drafts:write",
    { idempotent: true },
    {
      post_id: z.string().min(8).optional().describe("Single post id."),
      bundle_id: z.string().min(8).optional().describe("Multi-network draft id."),
      score: z.number().optional().describe("vidIQ score."),
      notes: z.string().max(2000).optional().describe("Notes pasted from vidIQ."),
      checked_at: z.string().optional().describe("ISO time of the check. Defaults to now."),
    },
    async (args) => eng.attachVidiqCheck(args),
  );

  add(
    "list_queue",
    "List approval queue",
    "List drafts waiting for approval, including drafts created by an AI client.",
    "posts:read",
    { read: true, idempotent: true },
    {},
    async () => eng.listQueue(),
  );

  add(
    "list_posts",
    "List posts",
    "List drafts and posts saved on this computer, including each network's status.",
    "posts:read",
    { read: true, idempotent: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Limit to one profile."),
      status: z.enum(["draft", "scheduled", "approved", "publishing", "published", "handed_off", "failed", "needs_review"]).optional().describe("Limit to one status."),
    },
    async (args) => eng.listPosts(args),
  );

  add(
    "get_post_status",
    "Get post status",
    "Read one saved post, including its network result when it has been sent.",
    "posts:read",
    { read: true, idempotent: true },
    { post_id: z.string().min(8).describe("Post id.") },
    async (args) => eng.getPostStatus(args.post_id),
  );

  add(
    "request_approval",
    "Request approval",
    "Publish a queued draft now, or schedule it for an ISO time. Requires queue:approve. Instagram is refused until instagram_public_confirmed is true. YouTube is refused when the profile requires a vidIQ check and none is attached.",
    "queue:approve",
    { destructive: true, open: true },
    {
      bundle_id: z.string().min(8).optional().describe("Multi-network draft id."),
      post_id: z.string().min(8).optional().describe("Single post id, when there is no bundle."),
      scheduled_at: z.string().optional().describe("Future ISO time with Z or a numeric offset. Omit to publish now."),
      instagram_public_confirmed: z.boolean().optional().describe("True only after the user agrees that Instagram will be public."),
    },
    async (args) => {
      if (args.bundle_id) {
        let confirmed = args.instagram_public_confirmed === true;
        const bundle = eng.store.getBundle(args.bundle_id);
        if (bundle?.platforms?.includes("instagram") && !confirmed && !bundle.instagram_public_confirmed) {
          const caps = server.server.getClientCapabilities?.();
          if (caps?.elicitation) {
            try {
              const answer = await server.server.elicitInput({
                message: "Instagram publishes this Reel publicly. Approve that for this post?",
                requestedSchema: {
                  type: "object",
                  properties: {
                    publish_instagram_publicly: {
                      type: "boolean",
                      title: "Publish Instagram publicly",
                      description: "Instagram has no private publish.",
                    },
                  },
                  required: ["publish_instagram_publicly"],
                },
              });
              confirmed = answer?.action === "accept" && answer?.content?.publish_instagram_publicly === true;
            } catch {
              confirmed = false;
            }
          }
        }
        return eng.approveBundle({
          bundle_id: args.bundle_id,
          scheduled_at: args.scheduled_at,
          instagram_public_confirmed: confirmed,
        });
      }
      if (!args.post_id) throw mcpError("invalid_request", "Provide bundle_id or post_id.");
      if (args.scheduled_at) return eng.schedulePost({ post_id: args.post_id, scheduled_at: args.scheduled_at });
      return eng.publishPost({ post_id: args.post_id, force: true });
    },
  );

  add(
    "discard_draft",
    "Discard draft",
    "Remove a draft or scheduled post that has not been sent.",
    "queue:approve",
    { destructive: true },
    {
      bundle_id: z.string().min(8).optional().describe("Multi-network draft id."),
      post_id: z.string().min(8).optional().describe("Single post id."),
    },
    async (args) => eng.discardItem(args),
  );

  add(
    "schedule_post",
    "Schedule post",
    "Set a future ISO time on one draft. The desk sends it only while PostPath is open and the time has arrived. Requires queue:approve.",
    "queue:approve",
    { idempotent: true },
    {
      post_id: z.string().min(8).describe("Post id."),
      scheduled_at: z.string().describe("ISO-8601 time with Z or a numeric offset."),
    },
    async (args) => eng.schedulePost(args),
  );

  add(
    "cancel_scheduled_post",
    "Cancel schedule",
    "Return a scheduled post to draft and clear its time. Fails once sending has started. Requires queue:approve.",
    "queue:approve",
    { idempotent: true },
    { post_id: z.string().min(8).describe("Scheduled post id.") },
    async (args) => eng.cancelScheduledPost(args),
  );

  add(
    "publish_post",
    "Publish one post",
    "Send one post that is already a draft or due. Requires queue:approve. Instagram must be public. YouTube on a gated profile needs a vidIQ check. A needs_review post is not sent again unless acknowledge is true.",
    "queue:approve",
    { destructive: true, open: true },
    {
      post_id: z.string().min(8).describe("Post id."),
      force: z.boolean().optional().describe("Send a scheduled post before its time."),
      acknowledge: z.boolean().optional().describe("Send a needs_review post again after a person has checked the network. Default false."),
    },
    async (args) => eng.publishPost(args),
  );

  add(
    "publish_due",
    "Publish due posts",
    "Send scheduled posts whose time has arrived. Requires queue:approve. Skips posts that need review.",
    "queue:approve",
    { destructive: true, open: true },
    {
      profile_id: z.string().min(2).max(64).optional().describe("Limit to one profile."),
      limit: z.number().int().min(1).max(20).optional().describe("Maximum posts to send."),
    },
    async (args) => eng.publishDue(args),
  );

  registerSeoTools(server, { engine: eng, gated, scopeAllowed });
  registerHookTools(server, { engine: eng, gated });

  return { server, engine: eng };
}
