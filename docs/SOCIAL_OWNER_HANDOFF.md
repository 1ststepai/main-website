# Social queue owner handoff

Date: 2026-10-26. Branch: `cursor/social-posting-v1-c683`. This is not a production release.

## Working now

From `/admin/` → Social → Swing Trade Pros, the owner can:

- See connection status for YouTube, Instagram, Facebook, TikTok, and X.
- Start Google, Meta, or TikTok OAuth. Swing Trade Pros stores a YouTube connection only when the channel is `UC86s7HqMAR-FSfxuv1N1Pwg`, and a Meta connection only when the linked Instagram account is `28230105726692205`.
- Queue one short with separate copy for YouTube, Instagram, Facebook, and TikTok. The video uploads to private Blob and is copied to the other posts in that brand.
- Review, record vidIQ scores by hand, approve, override with a typed reason, schedule, and run Publish due.
- YouTube: private resumable upload, then `videos.update` after approval. A short description gets `#Shorts` if it is missing.
- Instagram: resumable Reel upload. `media_publish` runs only when privacy is public.
- Facebook: Page Reel. Private finishes as an unpublished draft (`handed_off`). Public publishes.
- TikTok: inbox upload. Status is `handed_off`. The TikTok app finishes the post. This is not a direct post.
- X: not implemented.

## Evidence

- `npm test`: 153 passing, including `test/socialPosting.test.js`.
- Those tests mock the platform HTTP calls. They do not prove a live upload.
- No Preview or production publish was run for `Bitcoin_Prediction_Social_Short.mp4`.

## Blocked

1. The file `Bitcoin_Prediction_Social_Short.mp4` (18.1s, 1080×1920, 12,331,063 bytes) is not in this repository or this runtime. Nothing has been posted from it.
2. Preview and Production do not yet have a verified connect for Google, Meta, or TikTok in this app. The vidIQ connection is not a credential here.
3. Required env names, Preview first, values never committed: `SOCIAL_TOKEN_ENC_KEY`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `META_APP_ID`, `META_APP_SECRET`, `META_OAUTH_REDIRECT_URI`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_OAUTH_REDIRECT_URI`, `BLOB_READ_WRITE_TOKEN`, `SOCIAL_CRON_SECRET`, plus the existing `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
4. YouTube Data API audit can force private even when a post says public.
5. Instagram and Facebook need the Meta app in a mode that allows the STP Page, and `instagram_content_publish` plus `pages_manage_posts`. A development app works for app admins and testers. Other users need App Review.
6. TikTok `video.upload` is the inbox scope. Direct post (`video.publish`) is intentionally not used.
7. This handoff does not authorize a merge or a production deploy.

## Shortest path to a verified production post

1. Put the env vars on the Vercel project `main-website-repo` in Preview only.
2. In Google Cloud, enable YouTube Data API v3 and add the Preview callback. In Meta, create an app with Facebook Login and the scopes in `lib/social/meta.js`, and add the same callback path. In TikTok, create a Login Kit app with `video.upload` and that callback path.
3. Open the Preview `/admin/`, connect Swing Trade Pros, and confirm the labels are @SwingTradePros, @swing_trade_pros, the STP Page, and the STP TikTok account.
4. Upload `Bitcoin_Prediction_Social_Short.mp4` with the queue form. Keep privacy private. Enter the real vidIQ scores, or type an override reason.
5. Approve and run Publish due. Expect a private YouTube URL, an unpublished Facebook Reel, a TikTok inbox item, and Instagram stopped until you set that one post to public.
6. Watch the YouTube video and the Facebook draft. Only then set Instagram and Facebook to public and retry. Finish TikTok in the app.
7. After that Preview evidence, decide on Production env vars and a merge. Rollback is revert the PR, disconnect the accounts, and delete `social:v1:` plus Blob prefix `social/`.

Suggested copy, not posted and not a ruleset: title "Where is Bitcoin in six months?" Description: "Closest prediction wins six months in the Swing Trade Pros Discord." No contest date, price source, eligibility, or tie-break. No exchange names.
