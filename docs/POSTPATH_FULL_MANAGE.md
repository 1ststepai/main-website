# PostPath: full account management

PostPath can now change things on your connected accounts, not just post: channel and Page details, playlists, video settings, comments, and X posts, likes and follows. Every change follows the same rule as posting:

- Your assistant (or you) **queues** a change. Nothing is sent.
- You **approve** it in the PostPath desk with your owner PIN. There is no approve tool over MCP.
- Deleting, removing, or making a video less public needs a **second, typed confirmation** in the desk (type `DELETE`, or the new privacy word such as `UNLISTED`).
- The auto-post opt-in from earlier releases still covers new posts only, and it is still off by default. Account changes never auto-run.

## What each network can do

| Network | Actions (destructive ones marked †) |
| --- | --- |
| YouTube | channel description and keywords, channel banner, create / rename / delete† playlist, add / remove† playlist item, edit video title, description, tags and category, change visibility† (public→unlisted/private), delete video† |
| Facebook Page | edit post text, delete post†, update Page about / description / website, hide comment, delete comment†, reply to comment |
| Instagram | hide comment, delete comment†, reply to comment, turn comments on or off for a post |
| X (@1ststepai) | create post (text, or with media), reply, delete post†, like, follow |

### What the APIs can't do

- **YouTube:** profile picture, channel name and handle can't be changed through the Data API (use YouTube Studio). A video file can't be replaced after upload. Deletes are permanent. Each write uses API quota (default 10,000 units a day per project).
- **Facebook:** only the text of an existing post can be edited. Page name, username and category can't be changed through the Graph API. Ads and the Messenger inbox are not part of PostPath.
- **Instagram:** posts can't be edited (caption, media, location) or deleted through the Graph API. Bio, name, picture and links can't be changed through any API. Comment moderation works on your own posts only.
- **X:** profile bio, name, picture and banner can't be changed with OAuth 2.0 user tokens. Posts can't be edited; delete and post again. What your developer plan includes, its limits and its cost are set by X. **Check the X developer portal**; PostPath does not list prices.
- Insights permissions are requested now so you don't have to reconnect later, but insights reports are a follow-up.

The desk shows these limits under **Account changes**. MCP: `list_account_actions` returns them too.

## Owner setup, in order

### 1. Google Cloud project `ststep-social-posting`

1. Google Cloud console → APIs & Services → OAuth consent screen (Google Auth Platform → Data access).
2. Add the scopes: `.../auth/youtube.upload`, `.../auth/youtube.readonly`, `.../auth/youtube.force-ssl`.
3. `youtube.force-ssl` (and `youtube.upload`) are **sensitive/restricted** YouTube scopes. While the app's publishing status is **Testing**, only the accounts listed under **Test users** can sign in, and Google may expire refresh tokens after 7 days. Add the Google account that owns the channel as a test user. Moving to **In production** with these scopes needs Google's verification.
4. The existing desktop/loopback client and redirect (`http://127.0.0.1:47831`) don't change.

### 2. Meta app "Post Path" (dev mode)

Add these permissions under App Review → Permissions and Features (or Use cases): `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `pages_manage_engagement`, `pages_manage_metadata`, `pages_read_user_content`, `read_insights`, `business_management`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_comments`, `instagram_manage_insights`.

**Is App Review needed?** Not for you in development mode. People with a role on the app (admin, developer, tester) can grant every permission and use it on Pages and Instagram accounts they manage, with no review. App Review plus Advanced Access is only needed when people *without* a role on the app connect their own Pages, and that needs the app switched to Live.

### 3. X app (none exists in this repo's config yet)

1. In the X developer portal, create a Project and an App.
2. User authentication settings: OAuth 2.0, type **Native App** or **Web App**, permissions **Read and write** (likes and follows are included in read and write for OAuth 2.0 scopes).
3. Callback / redirect URI: `http://127.0.0.1:47831/oauth/callback`. Website URL: `https://1ststep.ai`.
4. Copy the OAuth 2.0 **Client ID** and **Client Secret** into the desk's setup form as `X_CLIENT_ID` and `X_CLIENT_SECRET` (they are stored encrypted on this computer).
5. PostPath requests: `tweet.read tweet.write users.read offline.access like.write follows.write media.write`, with PKCE.
6. Check the portal for which plan your app is on and what it includes and costs.

### 4. Reconnect in the desk

Connections made before this release keep posting as before. The **Account changes** panel shows each network's access and a **Reconnect for full access** button when scopes are missing. Reconnect in this order:

1. **YouTube** (after step 1).
2. **Facebook Page** (after step 2). Instagram shares the Meta login, so it picks up its new permissions at the same time; check its card shows "Full access".
3. **X** (first-time connect, after step 3).

## Session recorder

Off by default. Turn it on per session in the desk (**Recordings → Start recording**). While it runs, the header shows a red **Recording** label with a one-click **Stop**.

- Saves only to `<PostPath home>/recordings/<id>/` (for the default home, `~/.postpath/recordings/`). Nothing is uploaded or posted, ever.
- `events.jsonl`: desk events (draft queued, approved, published, accounts connected, errors), timestamped.
- `desk.webm` (optional): if you tick "Also record the desk window", your browser asks you to pick a window or tab. No audio, no system-wide capture.
- `summary.md`: demo moments with mm:ss offsets, written when you stop.
- Tokens, secrets, email addresses and customer data are removed before anything is written. Only allowlisted fields are kept.
- The Recordings tab lists sessions and lets you play, rename, export (download) and delete them. Delete needs a confirmation.

Recordings are raw material for edits. When you cut one into a video, follow the video rule: hook in the first 1-2 seconds, captions, pattern interrupts, a subscribe prompt, an end screen, and keep spoken words in their original order.

## Score it

Every PostPath user gets a free, built-in **Score it** button in the composer. It's on demand and informational: it never blocks saving or approval, and no vidIQ account is needed.

- **Title checklist (0-100):** a port of the validated v2 prototype (`postpath-content/scorer-proto/score.py`): length (40-70), hook (first person, how/why, number, contrast), main topic early, 6-12 words, search signal (neutral unless the YouTube search check is on), and penalties for hype words, ALL CAPS, clickbait and listing tool names. Fix over v2: brands that are the topic ("Amazon Seller Chrome Extension With Claude") aren't penalized; only lists like "Claude, ChatGPT, Gemini" are. It's a **checklist score with tips**, not a prediction, and it doesn't claim to match vidIQ.
- **Description and tags checklist (0-100):** title length (30-70), main term near the start of the title, a hook (number, question, or speaking to the viewer), no hype words, main term in the first lines of the description and in tags, 5-15 tags, enough description.
- **Search interest (optional, off by default):** tick "Check YouTube searches" to look up YouTube search suggestions (a read-only request). Google Trends uses the existing Trends interface, which stays off unless `POSTPATH_SEO_TRENDS=1`. Neither affects the score.
- **Thumbnail (0-100):** word count of the text you put on it (1-4 is best), contrast, and how it reads at phone size (checked with ffmpeg when it's installed; skipped with a note when it isn't).
- **vidIQ:** users who have vidIQ can paste a score from **their own** vidIQ account (`vidiq_score`). PostPath never calls vidIQ for scoring and never uses the owner's vidIQ account for other users. A direct per-user vidIQ connection is a follow-up.
- Desk route `POST /api/score` (open to owner and pilot users). MCP tool `score_content` (scope `posts:read`).

### Optional "Connect vidIQ" link

Under each Score it result there's an optional line: "Want a deeper score? Connect vidIQ for search volume and competition data." with a **Connect vidIQ** button. It's a plain link. It never blocks saving, approving or scoring.

- Link: `VIDIQ_AFFILIATE_URL` (environment) or the **vidIQ link** field in the desk (owner only). It must be `https://`. The environment value wins.
- If neither is set, the button goes to `https://vidiq.com/` and **no** affiliate disclosure is shown, because that link earns nothing.
- When an affiliate link is set, the button shows: "Affiliate link: PostPath may earn a commission at no cost to you." The link uses `rel="sponsored"`.
- Promo: `VIDIQ_PROMO_CODE` (or the desk field). "35% off Pro/Boost with code X" shows **only** when a code is set. vidIQ only issues that code to affiliates after 11 referred sales, so it's hidden by default and PostPath makes no discount claim without it.
- Routes: `GET /api/vidiq-upsell`, `POST /api/settings/vidiq` (owner PIN). The `/api/score` response includes `upsell`.
