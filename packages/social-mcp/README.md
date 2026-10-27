# Social MCP

Local-first connector so **any AI** (Cursor, Claude, Codex, custom agents) can connect social accounts, draft posts, schedule, and publish — without a monthly social-API SaaS bill.

Tokens live on the user’s machine under `~/.social-mcp`, encrypted with AES-256-GCM. Profiles are arbitrary brands or users. Studio on `1ststep.ai` stays optional.

## Why this exists

Tools like Ayrshare charge recurring fees to sit between you and YouTube / Meta / TikTok. The hard part is OAuth + a stable agent interface. This package is that interface as an MCP server you run locally.

## Platforms (v0.1)

| Platform | Connect | Publish |
| --- | --- | --- |
| YouTube | Google OAuth | Local `media_path` under `~/.social-mcp/media` |
| Instagram | Meta OAuth (with Page) | Requires `media_url` (https) |
| Facebook Page | Meta OAuth | Requires `media_url` (https) |
| TikTok | TikTok Login Kit | Local `media_path` under media dir → creator inbox |

Local video files must live inside the vault media directory (`status.media_dir`). That keeps path traversal closed and is the supported agent workflow: copy or save the clip there, then pass that path.

## Quick start

```bash
cd packages/social-mcp
npm install
node ./bin/social-mcp.js init
```

Create developer apps and set env vars (shell or MCP config):

```bash
export GOOGLE_OAUTH_CLIENT_ID=...
export GOOGLE_OAUTH_CLIENT_SECRET=...
export META_APP_ID=...
export META_APP_SECRET=...
export TIKTOK_CLIENT_KEY=...
export TIKTOK_CLIENT_SECRET=...
```

Register this redirect URI on **each** provider:

```text
http://127.0.0.1:47831/oauth/callback
```

Connect a profile from the CLI (opens the browser chain):

```bash
node ./bin/social-mcp.js connect acme "Acme Co"
```

Or let the AI call `upsert_profile` → `connect_accounts`.

## Cursor MCP config

Add to Cursor MCP settings (path adjusted for your machine):

```json
{
  "mcpServers": {
    "social-mcp": {
      "command": "node",
      "args": ["/ABS/PATH/to/main-website/packages/social-mcp/bin/social-mcp.js"],
      "env": {
        "GOOGLE_OAUTH_CLIENT_ID": "",
        "GOOGLE_OAUTH_CLIENT_SECRET": "",
        "META_APP_ID": "",
        "META_APP_SECRET": "",
        "TIKTOK_CLIENT_KEY": "",
        "TIKTOK_CLIENT_SECRET": ""
      }
    }
  }
}
```

## MCP tools

- `status` — home path, profiles, connections, redirect URI
- `upsert_profile` — create/update a brand or user
- `list_accounts` — connected networks
- `connect_accounts` — YouTube → Meta → TikTok browser chain
- `create_draft` / `update_draft` — local drafts (`media_path` must be under the media dir)
- `schedule_post` — ISO schedule time
- `publish_post` — publish now (`force` for early scheduled)
- `publish_due` — flush due scheduled posts
- `list_posts` / `get_post_status`

## Agent flow

1. `upsert_profile` with a stable id  
2. `connect_accounts` once per profile  
3. `create_draft` with copy + `media_path` (and `media_url` for Meta)  
4. `schedule_post` or `publish_post`  
5. `publish_due` on a timer or when the user asks  

## Product shape

- **Free / local:** this MCP on the user’s laptop  
- **Sellable later:** multi-seat approvals, hosted relay for people who will not run Node, analytics, team vaults  

Website studio social queue remains the hosted owner desk for 1stStep brands. This package is the portable product surface for any AI and any brand.

## Tests

```bash
npm test
```

## Security notes

- Vault directory mode `0700`; `master.key` mode `0600`  
- Connection secrets are encrypted envelopes in `db.json`  
- OAuth callback binds to `127.0.0.1` only  
- Do not commit `~/.social-mcp` or real client secrets  

## License

Proprietary / UNLICENSED until product packaging is decided.
