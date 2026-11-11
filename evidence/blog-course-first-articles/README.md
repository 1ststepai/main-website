# Course-cluster articles — publication-ready blue-and-white styling

Date: November 11, 2026. Owner: Codex for Evan Pancis.
Branch: `blog/course-first-articles`; implementation baseline `b5633100be10650fed7343a5fd648f64934bbc0e`.
Status: publication-ready article presentation, locally verified. Evan approved these articles after restyling; no push, PR, merge or deployment performed.

## Scope and reference

Only the two approved article pages use `src/blog-course-articles.css`: Archivo, course paper/white surfaces, ink text, official blue accents, course header navigation and wrapping footer links. Byline Draft labels removed. Ordinary uses of draft, fictional teaching labels, body copy, FAQs, JSON-LD, metadata and cross-links are preserved. `src/blog.css` matches its pre-article baseline; blog index, other posts and course files are unchanged.

## Verification

- `npm test`: PASS, 237 tests, 0 failures, 0 skips. The two article tests now guard byline status removal, isolated stylesheet, home navigation/brand and required footer links as well as metadata, FAQ, routing, sitemap and discovery paths.
- `npm run build`: PASS; existing shared application chunk-size warning remains. Initial sandbox runs were blocked by process-spawn EPERM; reruns outside that restriction passed.
- `git diff --check`: PASS.
- Built static pages served on localhost, rendered in installed headless Chrome at 1440×1000, 1280×900, 768×1024, 390×844 and 320×844. Ten viewport checks pass with no horizontal overflow, loaded logos, Archivo, one H1 and no byline Draft status. Mobile review-loop steps stack in one column. Machine observations: `browser-checks.json`; reproducible capture: `verify-browser.py` (requires Python websocket-client and installed Chrome).
- All internal article hrefs return HTTP 200 locally. Article text and schema compared against the baseline: unchanged except the intended byline status removal.
- Contrast: #0059CC links on white 6.362:1 and paper 5.759:1; ink 19.478:1 / 17.632:1; muted text 7.557:1 / 6.841:1. All meet normal-text WCAG AA. Accent #007BF8 is used for decoration/large wordmark, not small link text.
- All five screenshots visually reviewed: course-style header/footer, restrained article title sizes (46px desktop / 33px mobile), readable tables, practice examples and mobile diagram. No obvious clipping or layout issues observed.
- No standalone lint/typecheck script exists. No new dependencies, forms or runtime data behavior.

## Screenshots

- `first-task-desktop.png` — 1440-wide full page
- `first-task-mobile.png` — 390-wide full page
- `privacy-desktop.png` — 1440-wide full page
- `privacy-mobile.png` — 390-wide full page
- `review-loop-mobile.png` — 390 viewport, figure close-up with real HTML text

## Limits and rollback

Local static preview returns 404 for Vercel's analytics endpoint (`/_vercel/insights/script.js`); analytics delivery remains unverified. Hosted rewrites, production behavior, signup submission and email delivery were not verified. No content facts were re-researched during this styling-only task. No deployment approval is implied. Rollback: revert this new local styling commit; no external state changed.
