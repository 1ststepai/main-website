# PostPath by 1stStep.ai

Marketing site: [postpath.1ststep.ai](https://postpath.1ststep.ai/)

Local desktop + MCP connector. Connect major social networks once on your machine — then any AI (Cursor, Claude, Codex) can draft, schedule, and publish. No monthly social-API middleman.

Package path stays `packages/social-mcp` for now; the product name is **PostPath**.

## Windows (recommended)

1. Install [Node.js 20+](https://nodejs.org)
2. Open this folder: `packages\social-mcp`
3. Double-click `scripts\Open-PostPath.bat`  
   (or in PowerShell:)

```powershell
cd path\to\main-website\packages\social-mcp
npm install
node .\bin\social-mcp.js app
```

That opens the **PostPath** desk in an app window.

### In the desk

1. Paste developer-app credentials for the networks you use → **Save credentials**
2. Register this redirect on every OAuth console:

   `http://127.0.0.1:47831/oauth/callback`

3. Enter a brand name → **Connect accounts** (browser chain for configured providers)
4. Bluesky: use the Bluesky form (handle + app password)
5. Click **Enable in Cursor** → restart Cursor

No MCP JSON paste. No `&&` in chat.

## macOS / Linux

```bash
cd packages/social-mcp
npm install
node ./bin/social-mcp.js app
```

## What the product is

| Piece | Role |
| --- | --- |
| Desk UI (`social-mcp app`) | Human face: connect, credentials, Enable in Cursor |
| Local vault `~/.social-mcp` | Encrypted tokens + oauth.env + media |
| MCP server key `postpath` | What Cursor/Claude call for draft / schedule / publish |

## Platforms

| Platform | Connect | Publish |
| --- | --- | --- |
| YouTube | Google OAuth | `media_path` under vault `media/` |
| Instagram | Meta OAuth | https `media_url` |
| Facebook | Meta OAuth | https `media_url` |
| TikTok | Login Kit | `media_path` → creator inbox |
| LinkedIn | LinkedIn OAuth | text (`caption` / `description`) |
| X | X OAuth (PKCE) | text tweet |
| Threads | Threads OAuth (Meta app) | text and/or https `media_url` |
| Pinterest | Pinterest OAuth | https `media_url` pin |
| Bluesky | App password | text post |
| Google Business | Google OAuth (`business.manage`) | local post text |
| Reddit | Reddit OAuth | title + text; `tags[0]` = subreddit |
| Snapchat | OAuth scaffold | API-restricted until Marketing API approval |
| WhatsApp Channels | — | API-restricted (no free third-party publish path) |

## CLI reference

```text
social-mcp app             Desktop Connect UI (default product path)
social-mcp                 stdio MCP server
social-mcp install-cursor  write ~/.cursor/mcp.json (server key: postpath)
social-mcp init            create vault
social-mcp status
social-mcp connect <id>    CLI fallback
```

## MCP tools (for agents)

`status`, `upsert_profile`, `list_accounts`, `connect_accounts`, `connect_bluesky`, `create_draft`, `update_draft`, `schedule_post`, `cancel_scheduled_post`, `publish_post`, `publish_due`, `list_posts`, `get_post_status`

## Scheduling

- `schedule_post` stores a local `scheduled` post with `scheduled_at` (ISO time).
- While `social-mcp app` / the desk is running, PostPath periodically calls `publish_due` (default every 30s; override with `SOCIAL_MCP_DUE_INTERVAL_MS`). Closing the desk stops that loop — schedules do not fire offline.
- `cancel_scheduled_post` returns a post to `draft` and clears `scheduled_at`.
- Agents can still call `publish_due` or `publish_post` with `force=true` manually.

## Security

- Desk and OAuth bind to `127.0.0.1` only
- Secrets in `~/.social-mcp/oauth.env` (mode 0600) and encrypted connection envelopes
- Media paths must stay under `~/.social-mcp/media`
- Do not commit the vault

## Tests

```bash
npm test
```

## License

Proprietary / UNLICENSED until packaging is decided.
