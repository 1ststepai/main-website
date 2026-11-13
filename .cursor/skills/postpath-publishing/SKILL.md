---
name: postpath-publishing
description: Use when the user wants to draft, schedule, or publish social content through PostPath or the postpath MCP server, or asks to post to connected channels such as YouTube, Instagram, TikTok, LinkedIn, X, Threads, Pinterest, Bluesky, Google Business, or Reddit.
---

# PostPath publishing

Help a person go from “here’s my content” to a real draft, schedule, or publish on **their** connected accounts — using only PostPath tools that exist.

**Product:** PostPath by 1stStep.ai (local desk + MCP). Server key in Cursor: `postpath`. Package: `packages/social-mcp`. Vault: `~/.social-mcp`.

## Hard rules

1. **Discover first.** Call `status` and/or `list_accounts` before drafting. Do not invent tool names, platforms, or CRM/lead actions.
2. **Ask only for missing pieces** needed to finish (profile, platform, copy, media, time, subreddit, approval).
3. **Preview before send.** Show channel-specific copy, destination account labels, media, privacy, and timing. Wait for explicit approval before `publish_post`, `publish_due`, or scheduling the user asked to schedule.
4. **Never claim published** unless the tool result shows `status: "published"` or `"handed_off"`. Quote the tool outcome per channel.
5. **No CRM / outreach.** PostPath tools do not create CRM leads, send DMs, or run outreach. Do not invent those steps.
6. **Local-first honesty.** Scheduled posts do **not** publish while the machine is off. Something must later call `publish_due` (or `publish_post`) with PostPath running and network available.

## Real MCP tools (complete list)

Use only these `postpath` tools:

| Tool | Purpose |
| --- | --- |
| `status` | Home path, profiles, connections, platforms, OAuth redirect URI |
| `upsert_profile` | Create/update a brand profile (`id`, optional `name`) |
| `list_accounts` | Profiles + connections (optional `profile_id`) |
| `connect_accounts` | Browser OAuth chain for configured providers |
| `connect_bluesky` | Bluesky handle + app password (not browser OAuth) |
| `create_draft` | Local draft for one profile + one platform |
| `update_draft` | Edit draft / scheduled / failed post |
| `schedule_post` | Set future `scheduled_at` (ISO-8601) → status `scheduled` |
| `publish_post` | Publish now (`force` for early schedule) |
| `publish_due` | Publish due scheduled posts |
| `list_posts` | List posts (optional profile / status filter) |
| `get_post_status` | One post by id |

If a tool is missing from the client’s MCP list, say PostPath is not enabled: open the desk → **Enable in Cursor** → restart Cursor. Do not invent alternate APIs.

## Platforms that exist

`youtube`, `instagram`, `facebook`, `tiktok`, `linkedin`, `x`, `threads`, `pinterest`, `bluesky`, `google_business`, `reddit`, `snapchat`, `whatsapp`

### Publish requirements (from product behavior)

| Platform | Connect | Publish needs | Outcome notes |
| --- | --- | --- | --- |
| YouTube | Google OAuth (`connect_accounts`) | `media_path` under vault `media/` | Can publish |
| Instagram | Meta OAuth | https `media_url` | May return `handed_off` (container) |
| Facebook | Meta OAuth | https `media_url` | Unpublished privacy → `handed_off` |
| TikTok | TikTok OAuth | `media_path` under vault `media/` | Often `handed_off` (creator inbox) |
| LinkedIn | LinkedIn OAuth | text (`caption` / `description`) | Can publish |
| X | X OAuth | text caption | Can publish |
| Threads | Threads OAuth | text and/or https `media_url` | Can publish |
| Pinterest | Pinterest OAuth | https `media_url` | Can publish |
| Bluesky | `connect_bluesky` | text | Can publish |
| Google Business | Google OAuth | local post text | Can publish |
| Reddit | Reddit OAuth | title + text; **`tags[0]` = subreddit** | Can publish |
| Snapchat | OAuth scaffold | — | Tool errors: API-restricted until Marketing API approval |
| WhatsApp | — | — | Tool errors: no free third-party Channels publish path |

Do not promise Snapchat or WhatsApp live publish. If the user asks, explain the restriction and offer connected alternatives.

## Workflow

```text
1. status / list_accounts
2. Resolve profile_id (upsert_profile if none / user names a brand)
3. Match requested channels ↔ connected platforms
4. Collect missing: copy, media_path or media_url, privacy, schedule time, Reddit subreddit
5. Adapt copy per channel (length, title vs caption) using AI — do not invent PostPath “rewrite” tools
6. Preview table → wait for approval
7. create_draft (one call per platform) → optional schedule_post → publish_post or leave scheduled
8. Report each post_id + status + published_url / error from the tool
```

### Preview format (show the user)

```markdown
### Ready to post?
| Channel | Account | When | Copy / media |
| --- | --- | --- | --- |
| X | @acme | Now | "…" |
| LinkedIn | Acme Co | 2026-10-28T15:00:00Z | "…" |

Reply **yes** to publish/schedule, or tell me what to change.
```

### Approval

- **Publish now:** after yes → `create_draft` then `publish_post` (or draft first, then publish when they confirm).
- **Schedule:** after yes → `create_draft` then `schedule_post`. Remind them that `publish_due` must run later while PostPath is available.
- **Draft only:** `create_draft` / `update_draft` without publish.

## Missing connections

- If a requested platform is not in `list_accounts` connections: say so clearly.
- Offer `connect_accounts` with that provider (or `connect_bluesky` for Bluesky). OAuth needs credentials saved in the desk first (`oauth_not_configured` means open the desk → App credentials).
- Do not pretend a channel is connected.

## Unsupported or restricted

- Unknown network (e.g. “post to Discord”): not a PostPath platform — say so; do not invent a tool.
- Snapchat / WhatsApp: explain API restriction; do not claim success.
- Instagram/Facebook without `media_url`: ask for a public https URL; local `media_path` alone is not enough for those networks.

## Offline / scheduling truth

- `schedule_post` only stores a local schedule in the vault.
- Nothing fires if the computer is asleep/offline or PostPath/MCP is not running.
- When the time arrives, call `publish_due` (or tell the user to open the desk / ask again when online).
- Never imply 24/7 cloud scheduling unless a separate always-on runner exists (it does not in this product today).

## Example requests

**User:** “Take this caption and post it to LinkedIn and X.”

1. `list_accounts` → confirm both connected.
2. Adapt caption lengths if needed.
3. Preview → wait for yes.
4. `create_draft` ×2 → `publish_post` ×2.
5. Report each tool result (published id/url or error).

**User:** “Schedule this YouTube Short tomorrow at 9am ET.”

1. Confirm YouTube connected + `media_path` under `~/.social-mcp/media`.
2. Convert time to ISO-8601.
3. Preview → approval.
4. `create_draft` → `schedule_post`.
5. Explain that publish waits for a later `publish_due` while online.

**User:** “Post to Instagram.”

1. Need https `media_url` + caption; connection via Meta.
2. If missing either, ask — do not publish.

**User:** “Send this lead to our CRM.”

1. Refuse as a PostPath publish action. PostPath tools listed above do not sync CRM leads.
2. Offer to publish social content instead if that was the intent.

## Outcome reporting

For each channel, report facts from the tool only:

- `published` — live (or platform-accepted) publish; include `platform_post_id` / `published_url` when present
- `handed_off` — accepted by platform but needs creator/app completion (common for TikTok inbox / some Meta paths)
- `scheduled` — local only; not live yet
- `failed` — show `error.code` / `error.message`
- Tool/MCP unavailable — PostPath not running or not installed in Cursor

## Setup pointers (when tools missing)

Desk: `node packages/social-mcp/bin/social-mcp.js app` → credentials → Connect → **Enable in Cursor** → restart Cursor.  
Redirect URI for every OAuth app: `http://127.0.0.1:47831/oauth/callback`.  
Details: `packages/social-mcp/README.md`, `docs/SOCIAL_MCP.md`.
