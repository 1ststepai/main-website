# Conversion polish — local review evidence

Owner: public-site agent, authorized by Evan on 2026-11-11. Branch: `site/conversion-polish`, based on `05bc3a9` (PR #81 plus PR #83 card/share-image work). Draft review only.

## Acceptance and evidence

- Hero uses the approved outcome, one primary booking action, and no competing work/journey action. Later work cards, Journey footer, and digital card remain available.
- Public booking buttons use “Free Bottleneck Call”; supporting copy specifies 30 minutes. Calendar iframe and fallback retain the exact authorized LeadConnector URL.
- Pricing amounts and course mailto waitlist preserved. Official logo artwork, `/card`, and `og-home-v3` unchanged.
- Existing `npm run check` passes: root tests, social MCP tests, and Vite build. No lint or typecheck script is defined. Build retains the existing large-bundle warning for the separate scene chunk.
- Chromium/Playwright checked eight routes at 320, 390, 768, 1280, and 1440px (40 route/viewport combinations). No document horizontal overflow. See `responsive-results.json` for headings and visible booking-link labels/heights.
- Clicked homepage hero CTA at 390px: reached `/book/`; verified exact iframe source. No booking was submitted and no confirmation, notification, or calendar availability claim is made. Third-party calendar remained in its loading state during local screenshots; direct calendar fallback remains available.
- Rendered and visually reviewed desktop and mobile screenshots against the retained PR #81 direction: dark/lime Archivo, intact logo, existing light proof band, reduced hero emphasis on the demo. Fixed service CTA contrast and calendar loader contrast found during inspection. Screenshots scroll through lazy images before capture.
- Preserved reduced-motion rules and visible keyboard focus; semantic links and native FAQ controls retained. This is targeted accessibility inspection, not a comprehensive accessibility certification.

## Release state

Locally verified. Preview URL, when available, is for review only; no production verification, production deploy, DNS, Stripe, calendar configuration, or merge performed. PR #82 is excluded and should be rebased later. Roll back by reverting this polish commit while preserving `05bc3a9`.
