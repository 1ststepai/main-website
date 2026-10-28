# The SEO step cuts repeated writing

For one brand and four channels — YouTube, Facebook, Instagram, and Bluesky — doing the keyword research and the caption writing by hand is **26 actions**. The same work in this step is **7 actions**, including pasting a vidIQ check and choosing the brand.

This is a count of actions, not a promise about minutes saved.

When the brand is already selected and the post does not need a vidIQ check, the same work is **25 actions** by hand and **5 actions** here.

Draft copy also returns TikTok, X, and LinkedIn text in that same click. Writing those three by hand is **15** more actions per brand. On-screen text is included here and is not in the hand count.

The same topic for all 4 saved brands is **95 actions** by hand and **10 actions** here, because each brand still needs its own Approve click.

## What it does

You type one topic. PostPath returns keywords, then a title, description, caption, hashtags, and on-screen text for each channel and each brand. You read the notes beside each draft in the approval queue. You approve the draft yourself. Nothing posts until you do.

The brands it starts with are 1stStep.ai, SkillSprout, Swing Trade Pros, and DaySetGo. Each one has an audience, primary keywords, secondary keywords, and keywords to avoid. You can edit those lists. The notes check that a primary keyword is in the title or the first line, that the text fits the channel, that the hashtags are not too many or unrelated, that keywords are not repeated or weak, and that two brands are not chasing the same primary keyword or almost the same title in the same week.

The notes are there to read. They do not approve the draft. YouTube for 1stStep.ai still needs a vidIQ check before approval. PostPath does not sign in to vidIQ. Paste the scores from the assistant that already has that login. A volume is stored only when you paste one, with where it came from and when.

## How it fits

1. Type the topic once.
2. Get keywords, then the per-channel copy for every brand.
3. Read the score notes on each draft in the approval queue.
4. Approve.

YouTube, Facebook, Instagram, and Bluesky can go into the approval queue. TikTok, X, and LinkedIn stay as copy you can paste. YouTube still needs the video file before it can send. Approval is still yours.

## By hand, for one brand and four channels, including the vidIQ lookup

1. Look up the topic in YouTube search suggestions.
2. Look up the topic in Google search suggestions.
3. Look up the topic in vidIQ and copy the scores you want to keep.
4. Write the primary, secondary, and avoid keywords.
5. Write the YouTube title.
6. Write the YouTube description.
7. Write the YouTube caption.
8. Write the YouTube hashtags.
9. Check the YouTube title, description, and caption against the length limits.
10. Write the Facebook title.
11. Write the Facebook description.
12. Write the Facebook caption.
13. Write the Facebook hashtags.
14. Check the Facebook title, description, and caption against the length limits.
15. Write the Instagram title.
16. Write the Instagram description.
17. Write the Instagram caption.
18. Write the Instagram hashtags.
19. Check the Instagram title, description, and caption against the length limits.
20. Write the Bluesky title.
21. Write the Bluesky description.
22. Write the Bluesky caption.
23. Write the Bluesky hashtags.
24. Check the Bluesky title, description, and caption against the length limits.
25. Save the draft.
26. Approve it.

## In this step, for the same work

1. Choose the brand. Skip this when that brand is already selected.
2. Type the topic once.
3. Click Suggest keywords.
4. Paste the vidIQ scores and click Attach keyword check.
5. Click Draft copy.
6. Click Add to approval queue.
7. Click Approve on that draft.

## Setup

This section is for connecting search data and for the switches that stay off. The steps above do not depend on it.

Keyword suggestions that need the network come from YouTube and Google autocomplete. If either one fails, the other still returns, and the failure is shown. Results are cached on this computer for a day. Nothing here is a search volume.

vidIQ stays in the connected assistant. PostPath stores only what that assistant attaches: term, volume, competition, overall score, source, and date. `attach_vidiq_check` still records a vidIQ score. `attach_keyword_research` and `attach_seo_check` take the fuller record. A source of `vidiq` is what 1stStep.ai YouTube approval checks for. Other sources do not satisfy that check.

Search terms from a connected YouTube channel use the YouTube Analytics API report dimension `insightTrafficSourceDetail` filtered to `insightTrafficSourceType==YT_SEARCH`. Search Console uses the search analytics query for a site you configure. Those calls need two Google scopes that are not part of the posting sign-in:

- `https://www.googleapis.com/auth/yt-analytics.readonly`
- `https://www.googleapis.com/auth/webmasters.readonly`

Use Connect search data. That starts a separate Google sign-in and stores a separate connection named search data. The YouTube upload sign-in is unchanged. After you connect, Update search terms saves the queries and later suggestion lists can include them. If the account is not connected, nothing is requested.

The site string has to match the Search Console property, for example `https://1ststep.ai/`. The starter sites are `https://1ststep.ai/`, `https://skillsprout.1ststep.ai/`, `https://swingtradepros.com/`, and `https://daysetgo.ai/`. Change them if the property in Search Console is different.

Google Ads Keyword Planner is off. It needs a Google Ads account and a developer token, and it returns ranges rather than exact volumes. The switch is `POSTPATH_SEO_ADS=1`. This version does not call the API even when the switch is on.

Google Trends is off. Official access is limited and is not a general keyword-volume API. The switch is `POSTPATH_SEO_TRENDS=1`. This version does not call the API even when the switch is on.

Copy is a starting draft from the topic and the saved keywords, unless a caption provider is configured with `POSTPATH_CAPTION_PROVIDER=brief` (brief only) or by passing a `captionProvider` function to the engine. The template does not invent search volumes. A connected assistant can replace the template from the brief `seo_draft` returns. Saving into the approval queue does not approve anything.

The weekly report is `seo_weekly_report`. It lists, per brand, what was posted in the window, which saved keywords showed up, search terms already stored, overlaps, and those search terms as suggestions. It is on the desk as Weekly report and on the same PostPath connection any of your bots already use.

Tokens and client secrets are not written into these results or into error text.
