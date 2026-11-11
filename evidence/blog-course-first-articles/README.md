# Course-cluster articles — local draft verification

Date: November 11, 2026. Owner: Codex for Evan Pancis.
Branch: `blog/course-first-articles`; baseline `0b477cb2ed85260bfda99cf99fdc8fab356939c9`.
Status: locally verified drafts. No push, PR or deployment.

## Scope and reference

Two beginner articles, shared blog styles, blog index entries, Vite build/preview routes, Vercel rewrite configuration and both source/served sitemaps. Existing blog posts are the template reference; their header, footer, type and dark background are preserved. The teaching diagram uses white and official blue, with real HTML text, numbered steps and an explicit revision path. No new dependencies, forms or data-handling behavior.

Examples are fictional teaching copy, not recorded tool runs. Author/date are visible. Article and FAQPage structured data match the visible content. Course/library copy uses the user-approved planned facts and keeps resource requests separate from the waitlist.

## Verification

- `npm run build`: PASS; both `dist/blog/<slug>/index.html` files exist. Vite reports a bundle-size warning for existing shared application chunks.
- `npm test`: PASS, 237 tests, 0 failures/skips. Includes two new article metadata, visible FAQ, sitemap, cross-link and routing checks.
- `git diff --check`: PASS.
- Built static pages served locally and rendered in installed headless Chrome at 1440×1000, 1280×900, 768×1024, 390×844 and 320×844. Both pages: one H1, expected title/description/canonical, library/course links, no horizontal overflow. Machine observations: `browser-checks.json`.
- Every internal `href` on both built articles returns HTTP 200 from the local static server. External provider pages are references, not form integrations. OpenAI's two linked help articles were opened and checked November 11, 2026; Anthropic and Gemini links are provided for readers to recheck their own tool.
- Desktop/mobile full-page screenshots inspected against the existing blog layout. Figure close-up inspected for readable mobile steps and revision guidance. Five PNGs are committed because existing repository evidence folders already track screenshots.
- Local static preview does not serve Vercel's analytics endpoint (`/_vercel/insights/script.js`); analytics delivery is unverified. No hosted rewrite, production, signup submission or email-delivery verification was attempted for this local content change.
- No standalone lint/typecheck script is defined. No deployment approval is sought or implied.

## Screenshots

- `first-task-desktop.png`
- `first-task-mobile.png`
- `privacy-desktop.png`
- `privacy-mobile.png`
- `review-loop-mobile.png`

Rollback for later review: revert the local article commit. Nothing has been released remotely.
