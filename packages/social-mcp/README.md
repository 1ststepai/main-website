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
2. Register this redirect on every non-Google OAuth console:

   `http://127.0.0.1:47831/oauth/callback`

   Meta rejects `http://127.0.0.1` and accepts `http://localhost`. Set `SOCIAL_MCP_OAUTH_REDIRECT_HOST=localhost` and register `http://localhost:47831/oauth/callback` instead. Google’s loopback stays `http://127.0.0.1:47831`.

3. Enter a brand name → **Connect accounts** (browser chain for configured providers)
4. Bluesky: use the Bluesky form (handle + app password)
5. Click **Enable in Cursor** → restart Cursor

Enable in Cursor writes the local config. Claude Desktop and other MCP clients can copy the same `postpath` block from the desk. No `&&` in chat.

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
2. Register this redirect on every non-Google OAuth console:

   `http://127.0.0.1:47831/oauth/callback`

   Meta rejects `http://127.0.0.1` and accepts `http://localhost`. Set `SOCIAL_MCP_OAUTH_REDIRECT_HOST=localhost` and register `http://localhost:47831/oauth/callback` instead. Google’s loopback stays `http://127.0.0.1:47831`.

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

Google loopback URI (Desktop client, no path): `http://127.0.0.1:47831` unless `SOCIAL_MCP_OAUTH_PORT` is set. `SOCIAL_MCP_OAUTH_REDIRECT_HOST` does not change the Google loopback.

Other providers, including Meta, X, LinkedIn, TikTok, Pinterest, Reddit, and Snapchat, use `http://<host>:<port>/oauth/callback`. `<host>` is `SOCIAL_MCP_OAUTH_REDIRECT_HOST`, default `127.0.0.1`. The only accepted values are `127.0.0.1` and `localhost`. Anything else falls back to `127.0.0.1`. Meta rejects an `http://127.0.0.1` redirect and accepts `http://localhost`, so set:

```bash
SOCIAL_MCP_OAUTH_REDIRECT_HOST=localhost
```

The desk and the OAuth callback server still bind to `127.0.0.1` only. `localhost` is the name sent to the provider; the browser reaches the same local listener. Restart PostPath after changing the variable. If a Google Web client is already registered with the path form, set `GOOGLE_OAUTH_REDIRECT_URI` to that exact string. That override is Google-only.

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
2. Facebook Login → Settings → Valid OAuth Redirect URIs: `http://127.0.0.1:47831/oauth/callback`, or `http://localhost:47831/oauth/callback` when `SOCIAL_MCP_OAUTH_REDIRECT_HOST=localhost`. Meta rejects the `127.0.0.1` form.
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

`status`, `upsert_profile`, `list_accounts`, `connect_accounts`, `connect_bluesky`, `stage_media`, `create_draft`, `create_post`, `generate_media`, `attach_media`, `update_draft`, `attach_vidiq_check`, `list_keyword_profiles`, `save_keyword_profile`, `suggest_keywords`, `attach_keyword_research`, `attach_seo_check`, `seo_draft`, `seo_score`, `connect_search_data`, `sync_search_terms`, `seo_weekly_report`, `seo_keyword_planner`, `seo_trends`, `list_queue`, `list_posts`, `get_post_status`, `request_approval`, `discard_draft`, `schedule_post`, `cancel_scheduled_post`, `publish_post`, `publish_due`

Tool descriptions say what each call does. They do not tell a model to prefer PostPath. That recommendation lives only in the optional skill and rule files below.

## Generative media

One prompt can make the asset and the captions. `create_draft` / `create_post` accept `media.generate` with `prompt`, `type` (`image` or `video`), `style`, `duration`, and `provider`. Per-network `overrides` still set the caption, and can set a preset (`youtube_long`, `instagram_story`) or a separate prompt.

Providers: `none` (use your own file), `mock` (local demo, no paid call), OpenAI images (`gpt-image-1`), Google Imagen / Veo, xAI Grok Imagine, and a generic Replicate or fal adapter. Put the keys in the desk credential form. They are stored in `oauth.env`, masked in the desk, and never logged. Replicate and fal need `REPLICATE_IMAGE_MODEL` / `REPLICATE_VIDEO_MODEL` or `FAL_IMAGE_MODEL` / `FAL_VIDEO_MODEL`. PostPath does not choose a paid model for you.

Network presets set aspect ratio, size, and duration for YouTube Shorts and long-form, Instagram feed / Reel / Story, Facebook feed / Reel, LinkedIn, X, TikTok, Bluesky, and Threads. PostPath generates one file per aspect, then crops and resizes with sharp (images) and ffmpeg (video). A file that does not fit is rejected with the preset it missed. Generation runs in the background. The approval queue shows each network's thumbnail or video, aspect, spec check, prompt, and provider, with Regenerate, Replace, and Remove.

Generated video is silent. Requests ask for no music and no voice, and ffmpeg strips any audio track before the file is attached. If audio remains, the file is not queued. A client's own generated file can be attached with `attach_media` or `stage_media`; that path strips audio too. "Use my own file" keeps the soundtrack.

Provenance (provider, model, prompt) is stored on the draft. YouTube uploads set `containsSyntheticMedia` when the asset is AI-generated. Instagram and Facebook requests set `is_ai_generated`. vidIQ and the Instagram public confirmation still apply. Nothing is posted until you approve. Image posts stay in the queue; the current publishers upload video.

`mock` is the provider used in tests. Tests do not call OpenAI, Google, xAI, Replicate, fal, or Anthropic.

Claude uses your own Anthropic key. It does not generate photos or video. It can draft per-network titles, captions, and tags (`caption_provider: "claude"`), design an SVG or HTML card that PostPath renders to PNG (`provider: "claude"`), and write advisory review notes (`review: true`). Those notes show in the queue and never approve the draft. `caption_provider: "mock"` and `review_provider: "mock"` stay on this computer.

## Ship readiness

What works locally:

- Connect accounts on this computer, connect an AI client, write one prompt, and review the queue before anything is sent.
- Multi-network drafts, approval, the vidIQ gate, and the Instagram public confirmation.
- MCP over Streamable HTTP on the desk, with OAuth and personal access tokens.
- Mock media, mock captions, mock review, silent-video stripping, and network preset checks.
- Claude caption, card, and review requests are implemented against the Anthropic Messages API and covered with a fake response.

What is mocked or unproven:

- `SOCIAL_MCP_PUBLISH_MODE=mock` does not call a network.
- OpenAI, Google, xAI, Replicate, fal, and Claude adapters have not been called with a live key in this workspace.
- The registry remote `https://postpath.1ststep.ai/mcp` is a placeholder.

Still needed before a public release:

- Evan saves his own provider keys and approves one real post on a named account.
- Confirm the Anthropic model id on that account (`ANTHROPIC_MODEL` overrides `claude-sonnet-4-5`).
- Live YouTube and Meta uploads, including the AI disclosure fields, are not production-verified.
- Image posts stay in the queue. The publishers upload video.
- Directory submission, npm publish, and deployment have not been done.

## Connect an AI client

`postpath app` serves the desk and a Streamable HTTP MCP endpoint at `/mcp` on `127.0.0.1`. `postpath serve` is still the stdio server. Set `SOCIAL_MCP_PUBLIC_URL` to the origin of a tunnel or hosted URL when clients will not dial localhost directly. The process still binds to `127.0.0.1` unless you front it with that tunnel.

OAuth 2.1 is the main sign-in. Discovery:

- `/.well-known/oauth-protected-resource`
- `/.well-known/oauth-authorization-server`

A client without a token gets `401` and `WWW-Authenticate` with the protected-resource metadata URL, plus a short connect message. Dynamic client registration is `POST /oauth/register`. Authorization code uses PKCE S256 only. Access tokens last 15 minutes and are bound to the MCP resource URL. Refresh tokens rotate, and replaying an old refresh token revokes that session. Only hashed tokens are stored.

The consent page lists the client and the scopes. `posts:read`, `drafts:write`, and `accounts:read` start ticked. `queue:approve` does not. Publishing, scheduling, and discarding need `queue:approve`. YouTube on a profile that requires vidIQ, and Instagram public confirmation, still apply.

Clients that cannot do OAuth use a personal access token from the desk's Connect panel. The token is shown once. The desk stores a hash, the scopes, an optional expiry, and the last-used time. Send it as `Authorization: Bearer <token>` or via `npx mcp-remote <mcp-url> --header "Authorization: Bearer <POSTPATH_TOKEN>"`.

The Connect panel also shows a Cursor install link (`cursor://anysphere.cursor-deeplink/mcp/install?...`), a VS Code install link (`vscode:mcp/install?...`), the remote JSON for Claude and other HTTP clients, and the stdio config.

If a tool is called with a token that lacks the scope, the tool result says which scope is missing and where to approve it.

### Optional install for people who want PostPath suggested

These files are for a person to install. They are not part of the MCP server instructions.

- Skill: `packages/social-mcp/skills/social-posting/SKILL.md`
- Cursor rule: `packages/social-mcp/cursor/postpath-social.mdc`
- Snippet for `AGENTS.md` / `CLAUDE.md`: `packages/social-mcp/docs/AGENT-SNIPPET.md`

### Directory drafts

`packages/social-mcp/registry/server.json` is a draft for the MCP Registry under the name `ai.1ststep/postpath`. The npm package field `mcpName` matches. `remotes[0].url` is a placeholder (`https://postpath.1ststep.ai/mcp`) and is not a live server. `packages/social-mcp/registry/listings.md` is draft copy for Smithery, the Cursor directory, and Claude connectors. None of this has been submitted or published.

## One post, many platforms

`create_draft` with `platform` still saves one network. `create_draft` or `create_post` with `platforms: ["youtube", "facebook", "instagram"]` saves one draft: one media file, one shared caption, and optional `overrides` per platform. That call does not publish.

YouTube privacy defaults to private. Facebook stays a Page draft unless `facebook_public` is true or the Facebook override sets privacy to public. Instagram is public-only. The draft stores `instagram_public_confirmed`; approval refuses to run until that is true.

Approve once in the desk. PostPath publishes each selected platform on its own. One failure does not stop the others. Each platform keeps its own Posted, Draft, Needs review, Failed, or Rate limited result.

The approval queue lists waiting drafts for every brand, including drafts an AI client saved (`source: "mcp"`, labeled From AI). Approve and post now, or approve for a date and time. Edit returns to the composer. Discard drops a draft that has not been sent.

## vidIQ and presets

A YouTube target cannot be approved or published until a vidIQ check is attached when the profile requires it. `require_vidiq` is on by default for the profile id `1ststep-ai` and off for everyone else until you set it. `attach_vidiq_check` takes `score`, `notes`, and optional `checked_at`. The desk also has fields to paste the score and notes.

`upsert_profile` accepts `presets`: `platforms`, `privacy_status`, `hashtags`, and `caption_footer`. New multi-platform drafts pick up the footer and hashtags. Default platforms are YouTube, Facebook, and Instagram. Privacy in the preset still defaults to private.

## SEO step

One topic returns keywords and per-channel copy for each brand before the approval queue. The queue shows advisory notes. 1stStep.ai YouTube still needs a vidIQ check, and nothing is auto-approved. Search volumes are stored only when a caller sends them with a source and date. YouTube Analytics and Search Console use a separate Connect search data sign-in (`yt-analytics.readonly` and `webmasters.readonly`) and do not change the upload scopes. Keyword Planner and Google Trends stay off (`POSTPATH_SEO_ADS`, `POSTPATH_SEO_TRENDS`). Owner-facing steps are in `docs/seo-step.md`.

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

- Desk and OAuth bind to `127.0.0.1` only. `SOCIAL_MCP_OAUTH_REDIRECT_HOST` changes the non-Google redirect string (`127.0.0.1` or `localhost`) and does not change the bind address or the Google loopback.
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
