# Social queue

Owner-reviewed posting for more than one brand. YouTube is the only publisher. Instagram, Facebook, TikTok, and X are interfaces with no implementation.

This is not enabled in production by this repository change. Add the env vars to the Vercel **Preview** environment first. Do not turn on a cron in `vercel.json`.

## Brands

`lib/social/brands.js` is the brand list. Each entry is an `id` and a `name`. Current ids, in order: `swingtradepros`, `1ststep`, `skillsprout`, `daysetgo`.

Adding a brand is one new object in that file, then a deploy. Tokens, connections, and posts key off the id. No other code change is required.

## Storage

- **KV** (existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`): posts, token hashes, audit events, upload grants, and OAuth nonces. Keys start with `social:v1:` and are separate from the studio workspace document.
- **Encrypted in that KV**, with `SOCIAL_TOKEN_ENC_KEY` only: YouTube refresh tokens, access tokens, and resumable upload session URIs.
- **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`): private video and thumbnail bytes. The browser or content agent uploads directly. Functions never accept the file body.

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

- Switch brand and filter the queue.
- Approve, reject, or schedule. Approve is disabled for YouTube when the title score is under 90, the thumbnail score is under 90, or keywords are empty. Override requires a typed reason and is audited.
- Privacy defaults to private and can be changed before publish.
- Publish due walks scheduled posts whose time has arrived, and resumes anything stuck in `publishing`. Each call uploads about 2MB, or more than one chunk while an 8 second budget remains, then returns. The button loops until the queue is caught up.
- Retry publish resumes the same YouTube session. Start upload over discards that session.

`POST /api/social/cron` with `Authorization: Bearer $SOCIAL_CRON_SECRET` runs one of those slices. It is optional. Nothing in `vercel.json` calls it. Vercel Cron's automatic `CRON_SECRET` header is not accepted on purpose, so a cron stays off until you send `SOCIAL_CRON_SECRET` yourself.

## Known limits

- Rate limits are in memory on each function instance. They are not a global counter.
- KV updates to the post index and audit list are read-modify-write. Two writers at the same instant can drop one update.
- Video cap is 8GB. Thumbnail cap is 2MB. Posts per brand cap at 500. Tokens cap at 100.
- Publish needs Blob range reads. If a range read is not honored, the upload stops instead of pulling the whole file into the function.
- A long video takes many Publish due or cron calls. One call does not upload the whole file.
- YouTube category is `22`. `selfDeclaredMadeForKids` is false.
- Unaudited Google projects force `privacyStatus=private`.
- The OAuth callback relies on a signed one-time state because the studio cookie is `SameSite=Strict` and is not sent on the return from Google. The code is single use. Host access logs may still record the callback query string; this app does not log it.
- The server does not call vidIQ, Instagram, Facebook, TikTok, or X.

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
