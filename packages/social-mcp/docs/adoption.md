# Onboarding, starter packs and the shareable brand page

## Guided onboarding
The desk "Get started" panel shows one screen at a time:

name → starter pack or blank → connect one account → first draft → approve → done

- Every step after the name has a "Set up later" link.
- The normal gates apply. The owner PIN is required where one is set, and vidIQ, Instagram-public, media and compliance checks run as usual.
- In pilot mode, approval ends at "approved, waiting to post".
- Outside pilot, approval schedules the draft for a time the owner picks. Onboarding never posts right away.
- API: `GET /api/onboarding` and `POST /api/onboarding/step` with `{step, later?, ...}`.

## Starter packs
The packs are insurance agent, coach, realtor, e-commerce, local business and personal brand. Each one fills in:
- audience
- voice: tone, words to avoid, on-camera style, energy, on camera
- hashtags
- caption footer
- search terms: primary, secondary and negative
- default networks

Every field can be edited afterwards with `save_brand_context` or the desk. "Start blank" leaves every field blank.

- The insurance pack's avoid list covers rates, savings, subsidies, prices, dollar amounts and eligibility claims.
- The realtor pack's avoid list covers fair-housing wording, meaning phrases that describe who should live somewhere rather than describing the property.

## Shareable brand page
- Owner opt-in per brand. It is off by default, and turning it on needs the owner PIN where one is set. Turning it off needs no PIN, takes effect immediately and kills the old link. Turning it back on mints a new slug.
- Read-only page at `/b/<slug>`. The slug is 32 random base64url characters.
- Static HTML export: `GET /api/brand-page/export.html?profile_id=…`.
- The page uses a whitelist of fields: network, title, caption, status (approved, scheduled or posted), date and a public `https://` link for posted items only.
- It never shows drafts, failed posts, other brands, private or unlisted YouTube, Facebook drafts, account labels, tokens, media paths, voice, search terms, audience or ids.
- No scripts. The page sends `noindex` headers.

**Hosting:** the page is served only by the local desk, which accepts only localhost hosts. Public hosting is not built. It needs Evan's explicit okay first. Until then, share the exported HTML by hand if needed.
