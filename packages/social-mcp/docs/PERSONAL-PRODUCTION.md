# PostPath personal production (Evan, shared box)

Scope: Evan's three brands (`1ststep-ai`, `swing-trade-pros`, `skillsprout`) on the shared Grok Bot box, with one assistant (Marketing Desk) connected over MCP. Draft-only is the default. Google and Meta apps stay in testing or dev mode.

## 1. Run it

```bash
cd packages/social-mcp
export SOCIAL_MCP_HOME=$HOME/.postpath-prod   # fixed path; the folder is 0700, the files in it are 0600
export SOCIAL_MCP_DESK_PORT=47840             # desk + HTTP MCP
export SOCIAL_MCP_OAUTH_PORT=47841            # OAuth callback
node bin/social-mcp.js doctor                 # preflight; exit code 1 means fix the FAIL lines first
node bin/social-mcp.js app --no-open          # desk at http://127.0.0.1:47840/
```

- Both servers bind to `127.0.0.1` only. Don't set `SOCIAL_MCP_PUBLIC_URL` or run a public tunnel. The assistant runs on the same box.
- `doctor` checks:
  - the home folder and file modes
  - publish mode (live or mock)
  - which platform app keys are set (key names only)
  - every brand × network connection, showing the account label and expiry with no token values
  - active MCP tokens, by name and scopes
  - whether the desk and OAuth ports are free
- It never creates the home folder, decrypts anything or prints a secret. Use `doctor --json` for a machine-readable report.
- Set an owner PIN on the desk before the first production start. Approving, publishing and auto-post changes need it.
- There's no persistent service yet. You start it by hand, and the security lane is adding a systemd user unit.

## 2. Connect an assistant (HTTP MCP)

1. On the desk, create a personal access token a token named `Marketing Desk` with the **default scopes** (`posts:read accounts:read drafts:write`). The token (`pp_pat_…`) is shown once. It's stored hashed, so copy it straight into the assistant's secret store and don't paste it into chat. CLI alternative: `postpath pat create`.
2. Configure the assistant's MCP client:
   - URL: `http://127.0.0.1:47840/mcp` (Streamable HTTP)
   - Header: `Authorization: Bearer pp_pat_…`
3. What the assistant can do with that token: read status and accounts, and create, update or discard drafts for any brand by `profile_id`. It **can't** publish, approve, schedule or turn auto-post on. A `save_brand_context` auto-post request is recorded as pending, and only the owner can turn it on from the desk with the PIN. This is covered by `test/prodE2E.test.js`.
4. Note: tokens aren't brand-scoped yet, so one token can draft for all three brands. The security lane is adding per-brand PATs.
5. Revoke the token on the desk (or with `postpath pat revoke`) if it leaks.

Stdio alternative, on the same box: `SOCIAL_MCP_HOME=… node packages/social-mcp/bin/social-mcp.js serve`.

## 3. Per-platform app checklist

For each brand, connect on the desk (**Connect → brand → network**) after the app keys are saved under App credentials. Re-run `doctor` to see the matrix.

| Network | App | Mode for personal use | Evan to do | Limits |
|---|---|---|---|---|
| YouTube | Google Cloud OAuth client (`GOOGLE_OAUTH_CLIENT_ID/SECRET`), YouTube Data API v3 | Testing | Add each channel owner as a test user. Connect SkillSprout and STP channels. | Testing-mode refresh tokens expire after 7 days, so reconnect weekly or publish the app (`youtube.upload` is a sensitive scope and may need verification). Unverified apps may have uploads forced to private. |
| Facebook | Meta app (`META_APP_ID/SECRET`) | Development | Evan is admin on the app and on each Page. Connect the SkillSprout Page. | Works only for accounts that have a role on the app. |
| Instagram | Same Meta app | Development | Link each IG business account to its Page. Connect SkillSprout IG. | Reels need a public https media URL or the local-upload path. |
| X | Evan's own X developer app (`X_CLIENT_ID/SECRET`) | Paid API tier with write access | Create the app and paste its keys on the desk. | Text only today, max 280 characters. No media upload yet (platforms lane). |
| TikTok | TikTok app with Content Posting API (`TIKTOK_CLIENT_KEY/SECRET`) | Unaudited | Create the app and apply for the audit. | Private-only (SELF_ONLY) posts until the audit passes. |
| Pinterest | Pinterest app (`PINTEREST_APP_ID/SECRET`) | Trial | Create the app and apply for Standard access. | Images from a public https `media_url` only. Trial access is sandbox/limited. Known gap: a draft whose `media_content_type` is `image/*` is held in the queue (`image_publish_unsupported`). |

Check each platform's current docs before acting. Requirements change.

## 4. Before a production start

- [ ] `doctor` exits 0. Home is 0700 and files are 0600. Publish mode is live. Ports are free.
- [ ] Owner PIN is set.
- [ ] The only active MCP token is the draft-only `Marketing Desk` (doctor warns if a token can approve).
- [ ] Auto-post is off everywhere unless Evan turned it on for a specific brand × network.
- [ ] `npm test` passes in `packages/social-mcp`.
