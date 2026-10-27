# PostPath publishing skill — audit and handoff

Skill path (Cursor project): [`.cursor/skills/postpath-publishing/SKILL.md`](../.cursor/skills/postpath-publishing/SKILL.md)  
Mirrored for package / agents: `packages/social-mcp/skills/postpath-publishing/SKILL.md`, `.agents/skills/firststep/postpath-publishing/SKILL.md`

## Audit basis (main @ PostPath merge)

Inspected `packages/social-mcp/src/index.js`, `platforms.js`, `engine.js`, `publish/*`, `README.md`, and `docs/SOCIAL_MCP.md` on the PostPath line merged via PR #36.

### Tools that exist

`status`, `upsert_profile`, `list_accounts`, `connect_accounts`, `connect_bluesky`, `create_draft`, `update_draft`, `schedule_post`, `publish_post`, `publish_due`, `list_posts`, `get_post_status`

### Platforms that exist

YouTube, Instagram, Facebook, TikTok, LinkedIn, X, Threads, Pinterest, Bluesky, Google Business, Reddit, Snapchat (connect scaffold), WhatsApp Channels (restricted).

### What does **not** exist (skill must not invent)

- CRM lead create/sync, HubSpot/Salesforce/GHL tools, webhooks, UTM builders
- `connect_caldav`, calendar publish tools
- Auto-replies, DM scraping, comment→lead pipelines
- Cloud 24/7 scheduler (schedule is local vault only)

## What works (verified in-repo)

| Check | Result |
| --- | --- |
| Unit tests (`packages/social-mcp`) | Pass, including skill tool/platform lock test |
| Safe engine demo | Draft + schedule in temp vault **without** live network publish |
| Snapchat / WhatsApp | Engine tests assert honest API-restricted errors |
| Skill invents no extra tools | Asserted by `publishingSkill.test.js` |

## What remains blocked / unverified

| Item | Status |
| --- | --- |
| Live OAuth against real Google/Meta/etc. | Needs owner developer apps + desk credentials |
| Live `publish_post` to production social accounts | Not run in CI; do not claim production-ready without owner verification |
| Cursor MCP discovery of this skill in every client | Skill files are in-repo; user must have PostPath enabled (`Enable in Cursor`) and restart Cursor |
| Always-on `publish_due` | Requires local process; offline machines will not publish |

## Safe demo

```bash
cd packages/social-mcp
node ./scripts/safe-publishing-demo.js
```

Creates a temp vault, drafts an X post, schedules it, asserts status — **no** live API calls.

## Intended user line

> Take this content and help me publish it to my connected channels.

Cursor should load **postpath-publishing**, use only the tools above, preview, get approval, then report tool-confirmed outcomes.
