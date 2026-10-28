# PostPath by 1stStep.ai

Marketing site: [postpath.1ststep.ai](https://postpath.1ststep.ai/)

Local desktop + MCP connector. Connect major social networks once on your machine — then any AI (Cursor, Claude, Codex) can draft, schedule, and publish. No monthly social-API middleman.

Package path stays `packages/social-mcp` for now; the product name is **PostPath**. CLI aliases: `social-mcp` and `postpath`.

## First run — Windows

**Requirement:** [Node.js 20+](https://nodejs.org) (LTS). The launcher checks the version and opens nodejs.org if Node is missing or too old.

1. Install Node.js 20+ from https://nodejs.org
2. Open this folder: `packages\social-mcp`
3. Double-click `scripts\Open-PostPath.bat`  
   (or in PowerShell:)

```powershell
cd path\to\main-website\packages\social-mcp
npm install
npx postpath app
# same as: node .\bin\social-mcp.js app
```

That opens the **PostPath** desk in an app window.

### In the desk (Windows)

1. Paste developer-app credentials for the networks you use → **Save credentials**
2. Register this redirect on every OAuth console:

   `http://127.0.0.1:47831/oauth/callback`

3. Enter a brand name → **Connect accounts** (browser chain for configured providers)
4. Bluesky: use the Bluesky form (handle + app password)
5. Click **Enable in Cursor** → restart Cursor

No MCP JSON paste. No `&&` in chat.

## First run — macOS / Linux

**Requirement:** [Node.js 20+](https://nodejs.org) (LTS). On macOS you can double-click `scripts/Open-PostPath.command` (right-click → Open the first time if Gatekeeper prompts). The launcher opens nodejs.org if Node is missing or older than 20.

```bash
cd packages/social-mcp
# option A — double-click / run the launcher
./scripts/Open-PostPath.command

# option B — terminal
npm install
npx postpath app
# same as: node ./bin/social-mcp.js app
```

### In the desk (macOS / Linux)

1. Paste developer-app credentials → **Save credentials**
2. Register this redirect on every OAuth console:

   `http://127.0.0.1:47831/oauth/callback`

3. Enter a brand name → **Connect accounts**
4. Bluesky: handle + app password form
5. Click **Enable in Cursor** → restart Cursor

## Download zips (optional)

From the repo root (after `npm` tooling is available):

```bash
bash packages/social-mcp/scripts/build-downloads.sh
```

Writes versioned, unsigned developer-preview archives under `public/downloads/postpath/`:

- `PostPath-0.1.0-macOS-developer-preview.zip`
- `PostPath-0.1.0-Windows-developer-preview.zip`
- `SHA256SUMS.txt` and `manifest.json` (`signed: false`, `kind: developer-preview`)

These are not one-click installers. Each requires Node.js 20+ and unpacks into `~/.postpath/app` (or `%USERPROFILE%\.postpath\app`). The marketing page does not link them. `manifest.gitSha` is the commit the script read while packing, which can differ from the later commit that stores the zip bytes.

## What the product is

| Piece | Role |
| --- | --- |
| Desk UI (`postpath app` / `social-mcp app`) | Human face: connect, credentials, Enable in Cursor |
| Local vault `~/.social-mcp` | Encrypted tokens + oauth.env + media |
| MCP server key `postpath` | What Cursor/Claude call for draft / schedule / publish |

## Platforms

Real-account acceptance is **not** claimed. Tests mock `fetch`. Nothing here is a live customer publish.

`SOCIAL_MCP_PUBLISH_MODE=mock` (or `POSTPATH_PUBLISH_MODE=mock`) skips the platform call and stores a result with `result_source: "mock"`. The desk banner says MOCK. `SOCIAL_MCP_MOCK_OUTCOME` may be `posted`, `failed`, `rate_limited`, or `needs_review`. Live mode stores `result_source: "platform"` from the HTTP response. A mock row and a platform row are labeled differently in the Results list.

## Owner app setup

PostPath does not ship a Google or Meta app. Save the ids below in the desk’s App credentials form (written to `~/.social-mcp/oauth.env`, mode 0600) or in the environment. Do not commit them.

Google loopback URI (Desktop client, no path): `http://127.0.0.1:47831` unless `SOCIAL_MCP_OAUTH_PORT` is set. Other providers, including Meta: `http://127.0.0.1:47831/oauth/callback`. If a Web client is already registered with the path form, set `GOOGLE_OAUTH_REDIRECT_URI` to that exact string.

### YouTube

1. Open Google Cloud Console and create or choose a project.
2. APIs & Services → Library → enable **YouTube Data API v3**.
3. APIs & Services → OAuth consent screen. Add scopes `https://www.googleapis.com/auth/youtube.upload` and `https://www.googleapis.com/auth/youtube.readonly`.
4. While the app stays in **Testing**, add the Google account that owns the channel as a test user. Refresh tokens in Testing expire after about seven days.
5. APIs & Services → Credentials → Create credentials → OAuth client ID → **Desktop app**.
6. Save `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. The desk rejects a client id that does not end in `.apps.googleusercontent.com`.
7. Copy the Google loopback URI from the desk into the client if Google asks for a redirect URI.
8. Connect YouTube, save a draft with privacy **Private**, then publish. A vertical MP4 of 3 minutes or less is what YouTube classifies as a Short after processing. PostPath does not crop or transcode.
9. An unverified app can be limited to private uploads. `videos.insert` costs 1,600 quota units. A new project’s default quota is 10,000 units per day.
10. Open the returned watch URL while signed into that channel, then delete the video in YouTube Studio.

### Meta (Facebook Page Reel and Instagram Reel)

1. Create a Meta app of type **Business**. Add Facebook Login and Instagram.
2. Facebook Login → Settings → Valid OAuth Redirect URIs: `http://127.0.0.1:47831/oauth/callback`.
3. Save `META_APP_ID` (numeric) and `META_APP_SECRET`.
4. Add your Facebook user as an app administrator, developer, or tester. Development mode is enough for that user. Anyone else needs App Review for `instagram_content_publish` and `pages_manage_posts`.
5. The Page must be one you manage. Instagram must be a professional (Business or Creator) account linked to that Page.
6. Scopes requested: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`.
7. A local video is uploaded with Meta’s resumable upload. Facebook stays a Page draft (`video_state=DRAFT`) unless privacy is Public. Instagram has no private publish, so PostPath does not upload it until privacy is Public.
8. An https `media_url` still works when the file is already hosted somewhere public. PostPath does not host the file.

| Platform | Connect | Publish | Lane status |
| --- | --- | --- | --- |
| YouTube | Google OAuth Desktop + PKCE loopback | `media_path` under vault `media/`. Resumable `videos.insert`. Privacy defaults to private. | implemented (mock-tested, real-account acceptance NOT claimed) |
| Instagram | Meta OAuth | local `media_path` (resumable Reel upload) or https `media_url`. Publishes only when privacy is public. | implemented (mock-tested, real-account acceptance NOT claimed) |
| Facebook | Meta OAuth | local `media_path` (Page Reel resumable upload, draft unless public) or https `media_url` | implemented (mock-tested, real-account acceptance NOT claimed) |
| TikTok | Login Kit | `media_path` → creator inbox | handoff (TikTok inbox; mock-tested, real-account acceptance NOT claimed) |
| LinkedIn | LinkedIn OAuth | text (`caption` / `description`) | implemented (mock-tested, real-account acceptance NOT claimed) |
| X | X OAuth (PKCE) | text tweet | implemented (mock-tested, real-account acceptance NOT claimed) |
| Threads | Threads OAuth (Meta app) | text and/or https `media_url` | implemented (mock-tested, real-account acceptance NOT claimed) |
| Pinterest | Pinterest OAuth | https `media_url` pin | implemented (mock-tested, real-account acceptance NOT claimed) |
| Bluesky | App password | text post | implemented (mock-tested, real-account acceptance NOT claimed) |
| Google Business | Google OAuth (`business.manage`) | local post text | implemented (mock-tested, real-account acceptance NOT claimed) |
| Reddit | Reddit OAuth | title + text; `tags[0]` = subreddit | implemented (mock-tested, real-account acceptance NOT claimed) |
| Snapchat | OAuth scaffold | API-restricted until Marketing API approval | restricted scaffold |
| WhatsApp Channels | — | API-restricted (no free third-party publish path) | restricted scaffold |

## CLI reference

```text
postpath app / social-mcp app   Desktop Connect UI (default product path)
postpath / social-mcp           stdio MCP server
social-mcp install-cursor       write ~/.cursor/mcp.json (server key: postpath)
social-mcp init                 create vault
social-mcp status
social-mcp connect <id>         CLI fallback
```

## MCP tools (for agents)

`status`, `upsert_profile`, `list_accounts`, `connect_accounts`, `connect_bluesky`, `create_draft`, `update_draft`, `schedule_post`, `cancel_scheduled_post`, `publish_post`, `publish_due`, `list_posts`, `get_post_status`

## Scheduling

- `schedule_post` requires `scheduled_at` to be ISO-8601 **with a timezone offset** (`Z` or `±hh:mm`). Values without an offset are rejected. The stored value is UTC (`toISOString()`).
- Two different wall-clock labels that are the same absolute instant (for example `2026-11-01T01:30:00-04:00` and `2026-11-01T05:30:00.000Z`) cannot both be scheduled for the same profile and platform. Fall-back offsets that are different instants stay different. A missing offset such as `2026-03-08T02:30:00` is rejected, including around the America/New_York spring-forward gap.
- While `social-mcp app` / the desk is running, PostPath periodically calls `publish_due` (default every 30s; override with `SOCIAL_MCP_DUE_INTERVAL_MS`). Closing the desk stops that loop — schedules do not fire offline.
- `cancel_scheduled_post` returns a **scheduled** post to `draft` and clears `scheduled_at`. If cancel wins before dispatch, `publish_due` / the in-flight `publish_post` does not call the platform.
- Once status is `publishing`, cancel fails with `dispatch_started`. PostPath cannot guarantee the platform did not accept the post, and it does not pretend the platform post was undone.
- After dispatch starts, an uncertain result (network error or HTTP 5xx after the publish request was sent, or a `publishing` row still open on startup) is stored as `needs_review`. `publish_due` does not send it again. `publish_post` resends it only when `acknowledge=true` (default off). `force=true` does not acknowledge.
- A failure **before** the publish request is sent (validation, or token refresh that never reached the publish URL) stays `failed`. Explicit `publish_post` may retry `failed`. `publish_due` does not retry `failed`.
- HTTP 429 sets `failed` with `rate_limited` and does not loop.
- A 401 on a publisher that can refresh retries once after a single refresh. A second 401, or `invalid_grant` / revoked, sets the connection to `needs_reconnect` and stops. Meta page tokens have no refresh token: one 401 is `needs_reconnect` with no refresh loop. Snapchat's stored refresh token is unused because publish is a restricted scaffold and does not call the network.

## Security

- Desk and OAuth bind to `127.0.0.1` only
- Secrets in `~/.social-mcp/oauth.env` (mode 0600) and encrypted connection envelopes
- Media paths must stay under `~/.social-mcp/media`
- Do not commit the vault

## Pre-publish validation

`src/publish/validate.js` → `validateDraftForPublish(post)` runs inside `publish_post` / `publish_due` before network calls.

Returns `{ ok, warnings[], errors[] }` with no live API calls. Hard **errors** throw `validation_failed` and block publish. Length overages are **warnings** returned on success (publish still truncates). Platform rules match current publish modules (X ~280, LinkedIn/Threads/Bluesky/Google Business text caps, YouTube/TikTok `media_path`, Instagram/Facebook local `media_path` or https `media_url` with Instagram public-only, Pinterest https `media_url`, Reddit `tags[0]` + title, Snapchat/WhatsApp API-restricted).

## Tests

```bash
npm test
```

## License

Proprietary / UNLICENSED until packaging is decided.
