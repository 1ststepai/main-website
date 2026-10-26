# Social queue

Owner-reviewed posting for more than one brand. YouTube, Instagram Reels, and Facebook Page Reels call the platform APIs. TikTok is an inbox handoff, not a direct post. X is not implemented.

This is not enabled in production by this repository change. Add the env vars to the Vercel **Preview** environment first. Do not turn on a cron in `vercel.json`.

## Brands

`lib/social/brands.js` is the brand list. Each entry is an `id` and a `name`. Current ids, in order: `swingtradepros`, `1ststep`, `skillsprout`, `daysetgo`.

Adding a brand is one new object in that file, then a deploy. Tokens, connections, and posts key off the id. No other code change is required.

## Storage

- **KV** (existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`): posts, token hashes, audit events, upload grants, and OAuth nonces. Keys start with `social:v1:` and are separate from the studio workspace document.
- **Encrypted in that KV**, with `SOCIAL_TOKEN_ENC_KEY` only: YouTube refresh tokens, access tokens, and resumable upload session URIs.
- **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`): a short-lived transit buffer only, never the home of the media. The browser or content agent uploads directly, so functions never take the file body. Each file is deleted as soon as the platform has it (see "Platform drafts").

Brand API tokens are stored as SHA-256 hashes. The plaintext is returned once from the studio and is not written to KV.

## Env var names

New:

| Name | Purpose |
| --- | --- |
| `SOCIAL_TOKEN_ENC_KEY` | 64 hex characters. Encrypts YouTube tokens and resumable session URIs. Not the studio data key. |
| `GOOGLE_OAUTH_CLIENT_ID` | Google OAuth client for YouTube connect. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret. |
| `GOOGLE_OAUTH_REDIRECT_URI` | Full callback URL ending in `/api/social/oauth/callback`. Set the Preview value to the Preview origin. |
| `SOCIAL_CRON_SECRET` | Bearer secret for `POST /api/social/cron`. At least 24 characters. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob read-write token for private media. |
| `META_APP_ID` | Meta app id for Facebook Login. One consent connects the Page and the linked Instagram professional account. |
| `META_APP_SECRET` | Meta app secret. |
| `META_OAUTH_REDIRECT_URI` | Full callback URL ending in `/api/social/oauth/callback`. |
| `TIKTOK_CLIENT_KEY` | TikTok Login Kit client key. Scope is `video.upload` only. |
| `TIKTOK_CLIENT_SECRET` | TikTok client secret. |
| `TIKTOK_OAUTH_REDIRECT_URI` | Full callback URL ending in `/api/social/oauth/callback`. |

Already used by the studio, and required here too: `KV_REST_API_URL`, `KV_REST_API_TOKEN`.

Generate the encryption key locally and paste it into Vercel. Do not commit it.

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

## Connect @SwingTradePros

1. In Google Cloud, create a project for this use.
2. Enable YouTube Data API v3.
3. Configure the OAuth consent screen. Add the YouTube scopes the studio requests: `youtube.upload` and `youtube.readonly`.
4. Create an OAuth client (web). Add the redirect URI that matches `GOOGLE_OAUTH_REDIRECT_URI` for the environment you are using. For a first pass, use the Preview origin: `https://<preview-host>/api/social/oauth/callback`.
5. Put the env vars on the Vercel project `main-website-repo` in **Preview** only until you have reviewed a deployment.
6. Open `/admin/`, choose Swing Trade Pros, and use Connect YouTube. Sign in as the Google account that owns @SwingTradePros and allow offline access so Google returns a refresh token.
7. Submit the YouTube API audit. Until Google approves the project, uploads stay private even if a post is marked public. The post field defaults to `private`.

## How a content agent queues a draft

Create a token in the studio for that brand. It is shown once.

```bash
curl -sS -X POST "https://PREVIEW_HOST/api/social/posts" \
  -H "Authorization: Bearer YOUR_BRAND_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "youtube",
    "status": "ready_for_review",
    "title": "Opening range on SPY",
    "description": "A swing trading look at the opening range.",
    "tags": ["swing trading", "opening range"],
    "privacy_status": "private",
    "title_score": 94,
    "thumbnail_score": 96,
    "keywords": ["swing trading", "opening range"],
    "checked_at": "2026-10-25T15:00:00.000Z"
  }'
```

Request an upload URL, then PUT the file straight to Vercel Blob. Repeat for the thumbnail (`kind` `thumbnail`, an image content type).

```bash
curl -sS -X POST "https://PREVIEW_HOST/api/social/uploads" \
  -H "Authorization: Bearer YOUR_BRAND_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "post_id": "POST_ID",
    "kind": "video",
    "content_type": "video/mp4",
    "size": 12345678
  }'
```

The response includes `upload.pathname`, `upload.upload_url`, and `upload.headers`. PUT the bytes to `upload_url` with those headers. For files over about 100MB, use `@vercel/blob/client` `put` with `multipart: true` and the returned `client_token` so the upload is not one giant request. The token is bound to that pathname.

Then confirm the path:

```bash
curl -sS -X PATCH "https://PREVIEW_HOST/api/social/posts?id=POST_ID" \
  -H "Authorization: Bearer YOUR_BRAND_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm_upload":{"kind":"video","pathname":"PATHNAME_FROM_THE_UPLOAD_RESPONSE"}}'
```

The agent fills `title_score`, `thumbnail_score`, and `keywords`. This server does not call vidIQ.

List is `GET /api/social/posts` and returns only `draft` and `ready_for_review` for that token's brand.

## Owner actions

In `/admin/` → Social:

- Queue one short from the studio: pick the platforms, write each caption, choose the video and a YouTube thumbnail. The file uploads straight to private Blob. The same video is copied onto each platform post in that brand only.
- Switch brand and filter the queue.
- Approve, reject, or schedule. Approve is disabled for YouTube when the title score is under 90, the thumbnail score is under 90, or keywords are empty. Override requires a typed reason and is audited.
- Privacy defaults to private and can be changed before publish.
- Publish due walks scheduled posts whose time has arrived, and resumes anything stuck in `publishing`. Each call uploads about 2MB, or more than one chunk while an 8 second budget remains, then returns. The button loops until the queue is caught up.
- Retry publish resumes the same YouTube session. Start upload over discards that session.

`POST /api/social/cron` with `Authorization: Bearer $SOCIAL_CRON_SECRET` runs one of those slices. It is optional. Nothing in `vercel.json` calls it. Vercel Cron's automatic `CRON_SECRET` header is not accepted on purpose, so a cron stays off until you send `SOCIAL_CRON_SECRET` yourself.

## Platform drafts (media lives on the platform, not here)

| Platform | What this studio does | Temp Blob lifetime | Status |
| --- | --- | --- | --- |
| YouTube | Resumable upload with `privacyStatus=private`. Shorts (`format: short`) append `#Shorts` when the description does not already contain it. After approval, `videos.update` applies the final title, description, tags, and visibility. | Video blob deleted once YouTube returns the video id; thumbnail blob deleted after `thumbnails.set`. | Wired. Direct publish after approval. |
| Instagram Reels | Resumable container upload to `rupload.facebook.com`. `media_publish` runs only when privacy is `public`. A private post stops and stays failed until you set public and retry. | Deleted after the Reel is published. | Wired. There is no private Instagram post. |
| Facebook Page | Page Reels upload to `rupload.facebook.com`. Privacy other than public finishes as `video_state=DRAFT` and the studio status is `handed_off`. Public finishes as `PUBLISHED`. | Deleted when Facebook accepts the finish call. | Wired. A draft is not a public Reel. |
| TikTok | Content Posting API inbox upload (`video.upload`, `FILE_UPLOAD`). Status becomes `handed_off`. The creator finishes in the TikTok app. | Deleted after TikTok accepts the bytes. | Wired as a handoff. Not a direct post. `video.publish` is not called. |
| X | None | Deleted on reject | Not implemented. |

Flow for YouTube: agent uploads to Blob → agent confirms → the next cron or "Publish due" call with nothing due uploads the file as a **private** YouTube video and deletes both blobs. The post stays `ready_for_review`. Owner approval, the vidIQ gate, and scheduling are unchanged. At the due time the publish step runs only `videos.update`. If a post is approved and due before its draft exists, the same pipeline uploads private first and then updates.

Reject is the cancel path. It deletes any temp blobs. A YouTube draft already uploaded stays private on the channel; delete it in YouTube Studio if you don't want it.

Orphan sweeper: `/api/social/cron` (already present and triggered externally with `SOCIAL_CRON_SECRET`) also deletes `social/` blobs older than 24h that no open post references, at most once an hour. No new scheduled job was added. If nothing external calls the cron endpoint, the sweeper never runs, and leftovers are bounded only by the reject and publish deletes.

Why bytes still pass through Blob for YouTube: Google's resumable-upload docs show the OAuth bearer on every chunk PUT. Handing an unauthenticated session URI to an agent or browser is not documented, so we don't rely on it.

Docs: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol · https://developers.google.com/youtube/v3/docs/videos/update · https://developers.tiktok.com/doc/content-posting-api-reference-upload-video · https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide · https://developers.facebook.com/docs/graph-api/reference/page/videos/

## Known limits

- Rate limits are in memory on each function instance. They are not a global counter.
- KV updates to the post index and audit list are read-modify-write. Two writers at the same instant can drop one update.
- Video cap is 8GB. Thumbnail cap is 2MB. Posts per brand cap at 500. Tokens cap at 100.
- Publish needs Blob range reads. If a range read is not honored, the upload stops instead of pulling the whole file into the function.
- A long video takes many Publish due or cron calls. One call does not upload the whole file.
- YouTube category is `22`. `selfDeclaredMadeForKids` is false.
- Unaudited Google projects force `privacyStatus=private`, so `videos.update` to public may be overridden by Google until the API project passes audit.
- Facebook `file_url` must be reachable by Facebook. The Blob store is private, so a short-lived signed URL or proxy is required before Facebook can be wired.
- The OAuth callback relies on a signed one-time state because the studio cookie is `SameSite=Strict` and is not sent on the return from Google. The code is single use. Host access logs may still record the callback query string; this app does not log it.
- The server does not call vidIQ. Scores are whatever the owner or the agent recorded.
- X is not implemented. TikTok is an inbox handoff, not a direct post.
- Instagram cannot publish a private Reel. A private Instagram post stops before `media_publish`.
- Swing Trade Pros refuses a YouTube channel other than `UC86s7HqMAR-FSfxuv1N1Pwg` and an Instagram account other than `28230105726692205`.
- TikTok files at or under 64MB are one chunk, which is TikTok's rule. A 12MB short is one request.
- Meta and TikTok publishing need the new env vars and a successful connect. Until then those posts fail closed with "not connected".

## Test plan

```bash
npm test
npm run build
```

`test/socialPosting.test.js` covers:

- Token hashing, and that the plaintext is absent from storage.
- Encrypt and decrypt of a refresh token with `SOCIAL_TOKEN_ENC_KEY`, including a purpose mismatch, and that the studio key is not used.
- A token cannot create or update another brand, cannot list that brand, and cannot set `approved`.
- The owner route rejects a brand token. An owner session can approve.
- Title score 89 blocks approval. A typed override reason allows it and is audited. Empty keywords block. Scores of 90 with keywords allow approval. A missing title cannot be overridden.
- A two-chunk YouTube upload uses the resumable session, sets the thumbnail, and does not store the refresh token, access token, or session URI in plaintext.
- OAuth state is single use, and the other platforms throw `publisher_not_implemented`.

Manual, on Preview, after the env vars exist:

1. Create a Swing Trade Pros token, queue a draft with the curl above, and confirm it does not appear under 1stStep.
2. Confirm Approve stays disabled at a score of 89 and enables after a reason, or at 90/90 with keywords.
3. Connect @SwingTradePros, schedule the post as private, and run Publish due until the private YouTube URL is on the post.
4. Call the cron endpoint without the secret and confirm it is rejected. Do not add a cron.
