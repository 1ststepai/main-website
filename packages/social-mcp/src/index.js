import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createEngine } from "./engine.js";
import { formatToolError, formatToolResult } from "./errors.js";
import { paths, PLATFORMS } from "./home.js";
import { loadOAuthEnvFile } from "./envFile.js";
import { createDeskServer } from "./desk/server.js";
import { PRODUCT_NAME } from "./brand.js";

function tool(handler) {
  return async (args) => {
    try {
      return formatToolResult(await handler(args));
    } catch (error) {
      return formatToolError(error);
    }
  };
}

export function createSocialMcpServer({ engine } = {}) {
  if (!engine) loadOAuthEnvFile(paths(), process.env);
  const eng = engine || createEngine();
  const server = new McpServer({
    name: "postpath",
    version: "0.1.0",
  });

  server.tool(
    "status",
    `Show local ${PRODUCT_NAME} home path, profiles, connections, platforms, and the OAuth redirect URI to register with provider consoles.`,
    {},
    tool(async () => eng.publicStatus()),
  );

  server.tool(
    "upsert_profile",
    "Create or update a brand/user profile. Any AI can use multiple profiles on one machine.",
    {
      id: z.string().min(2).max(64).describe("Stable profile id, e.g. swingtradepros or acme"),
      name: z.string().min(1).max(120).optional().describe("Display name"),
    },
    tool(async (args) => eng.upsertProfile(args)),
  );

  server.tool(
    "list_accounts",
    "List profiles and connected social accounts. Optionally filter by profile_id.",
    {
      profile_id: z.string().min(2).max(64).optional(),
    },
    tool(async (args) => eng.listAccounts(args.profile_id)),
  );

  server.tool(
    "connect_accounts",
    "One-click style connect chain. Opens the browser for configured OAuth providers (YouTube, Meta, TikTok, LinkedIn, X, Threads, Pinterest, Google Business, Reddit, Snapchat) and continues automatically after each consent. Bluesky uses connect_bluesky (app password).",
    {
      profile_id: z.string().min(2).max(64),
      platforms: z
        .array(
          z.enum([
            "youtube",
            "meta",
            "tiktok",
            "instagram",
            "facebook",
            "linkedin",
            "x",
            "threads",
            "pinterest",
            "google_business",
            "reddit",
            "snapchat",
          ]),
        )
        .optional()
        .describe("Optional subset. Default is every missing OAuth network."),
    },
    tool(async (args) => eng.connectAccounts(args.profile_id, { platforms: args.platforms })),
  );

  server.tool(
    "connect_bluesky",
    "Connect Bluesky with a handle and app password (not browser OAuth). Create an app password in Bluesky settings.",
    {
      profile_id: z.string().min(2).max(64),
      handle: z.string().min(2).max(120).describe("Bluesky handle, e.g. you.bsky.social"),
      app_password: z.string().min(8).max(200).describe("Bluesky app password"),
    },
    tool(async (args) =>
      eng.connectBluesky(args.profile_id, { handle: args.handle, app_password: args.app_password }),
    ),
  );

  server.tool(
    "create_draft",
    "Create a local draft post for a profile and platform. Attach media_path (local file) and/or media_url (required for Instagram/Facebook publish).",
    {
      profile_id: z.string().min(2).max(64),
      platform: z.enum(PLATFORMS),
      title: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
      caption: z.string().max(2200).optional(),
      tags: z.array(z.string().max(40)).max(30).optional(),
      privacy_status: z.enum(["private", "unlisted", "public"]).optional(),
      media_path: z.string().optional(),
      media_url: z.string().url().optional(),
      media_content_type: z.string().optional(),
    },
    tool(async (args) => eng.createDraft(args)),
  );

  server.tool(
    "update_draft",
    "Update copy or media on a draft/scheduled/failed post.",
    {
      post_id: z.string().min(8),
      title: z.string().max(100).optional(),
      description: z.string().max(5000).optional(),
      caption: z.string().max(2200).optional(),
      tags: z.array(z.string().max(40)).max(30).optional(),
      privacy_status: z.enum(["private", "unlisted", "public"]).optional(),
      media_path: z.string().optional(),
      media_url: z.string().url().optional(),
      media_content_type: z.string().optional(),
    },
    tool(async (args) => eng.updateDraft(args)),
  );

  server.tool(
    "schedule_post",
    "Schedule a local draft for a future ISO time. scheduled_at must include a timezone offset (Z or ±hh:mm) and is stored as UTC. While the PostPath desk/app is running, publish_due runs on an interval; or call publish_due / publish_post(force) yourself.",
    {
      post_id: z.string().min(8),
      scheduled_at: z.string().describe("ISO-8601 timestamp with Z or ±hh:mm offset"),
    },
    tool(async (args) => eng.schedulePost(args)),
  );

  server.tool(
    "cancel_scheduled_post",
    "Cancel a scheduled post: sets status back to draft and clears scheduled_at. Fails with dispatch_started once dispatch has started or the row is needs_review. PostPath cannot undo a platform post.",
    {
      post_id: z.string().min(8),
    },
    tool(async (args) => eng.cancelScheduledPost(args)),
  );

  server.tool(
    "publish_post",
    "Publish now after local preflight validation (hard errors block; length overages are warnings). YouTube/TikTok use media_path. Instagram/Facebook/Pinterest need media_url. Text platforms use caption/title. Reddit uses tags[0] as subreddit. Snapchat/WhatsApp return honest API-restricted errors. Scheduled posts require force=true before their time. needs_review posts are not retried unless acknowledge=true.",
    {
      post_id: z.string().min(8),
      force: z.boolean().optional(),
      acknowledge: z.boolean().optional().describe("Required to send a needs_review post again. Default false."),
    },
    tool(async (args) => eng.publishPost(args)),
  );

  server.tool(
    "publish_due",
    "Publish scheduled posts whose scheduled_at is due. Skips needs_review and does not resend posts left in publishing from an earlier run (those move to needs_review). The desk/app also calls this periodically while running.",
    {
      profile_id: z.string().min(2).max(64).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    tool(async (args) => eng.publishDue(args)),
  );

  server.tool(
    "get_draft_constraints",
    "Read one local draft with the per-network checks and any suggestions already saved. Does not call vidIQ, TubeBuddy, or any other service.",
    { post_id: z.string().min(8) },
    tool(async (args) => eng.getDraftConstraints(args)),
  );

  server.tool(
    "propose_suggestions",
    "Save opinions on a draft without changing it. Tag each one with source assistant, vidiq, tubebuddy, or another short name. Include score only when that source reported a score, using the source's own name for it. The person accepts or rejects each one in the PostPath desk.",
    {
      post_id: z.string().min(8),
      suggestions: z
        .array(
          z.object({
            source: z.string().min(1).max(32),
            platform: z.string().min(2).max(32),
            field: z.enum(["title", "description", "caption", "hashtags", "tags", "subreddit"]),
            value: z.union([z.string().min(1).max(5000), z.array(z.string().min(1).max(80)).min(1).max(60)]),
            note: z.string().max(240).optional(),
            score: z
              .object({
                name: z.string().min(1).max(40),
                value: z.union([z.string().min(1).max(40), z.number()]),
              })
              .optional(),
          }),
        )
        .min(1)
        .max(40),
    },
    tool(async (args) => eng.proposeSuggestions(args)),
  );

  server.tool(
    "list_posts",
    "List local drafts and posts.",
    {
      profile_id: z.string().min(2).max(64).optional(),
      status: z.enum(["draft", "scheduled", "publishing", "published", "handed_off", "failed", "needs_review"]).optional(),
    },
    tool(async (args) => eng.listPosts(args)),
  );

  server.tool(
    "get_post_status",
    "Get one post by id.",
    {
      post_id: z.string().min(8),
    },
    tool(async (args) => eng.getPostStatus(args.post_id)),
  );

  return { server, engine: eng };
}

export async function startStdioServer(options = {}) {
  const { server, engine } = createSocialMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  return { server, engine };
}

export { createEngine, createDeskServer };
