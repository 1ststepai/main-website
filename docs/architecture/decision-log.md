# Architecture Decision Log

## 2026-10-21: Homepage v2 replaces the Signal Path first screen on a preview branch

- **Status / owner:** Implementing on `cursor/homepage-v2-1b3b` from the approved v2 handoff. Evan owns the design. This change is preview-only. It does not authorize a production deploy or any change to the live `1ststep.ai` / `www.1ststep.ai` domains.
- **Decision:** Rebuild the public homepage from the v2 static prototype (ink `#0D0C0A`, cream `#F1EADB`, acid `#D4FF3A`, Archivo + Instrument Serif, film grain, reel hero, pinned fictional makeover, pinned lead-to-booked flow, horizontal portfolio, three paths, cartoon-ads cinema, founder, CTA). Keep the Vite multi-page app, the existing routes, SEO head (canonical `https://www.1ststep.ai/`, OG image, Organization JSON-LD), the locked logo, and the LeadConnector calendar on `/book/`. Self-host Archivo and Instrument Serif. Vendor GSAP 3.12.5, ScrollTrigger, and Lenis. Do not mount the Signal Path figure on the homepage. Leave `src/signal-path.js` in the repo, unmounted, so the previous motion model can be restored.
- **Booking:** The v2 copy says “Book a 20-min call.” `/book/` is the 30-minute Website Strategy Call, so the homepage button does not use it. The control scrolls to a visible TODO until Evan names the destination. Footer links keep `/journey/` and `/fit-check/` reachable.
- **Honesty:** Bramblewick is labeled “Example makeover · fictional business,” and `/makeover/before.html` and `/makeover/after.html` are `noindex`. SkillSprout has no metrics. SwingTradePros shows only 8,000+ Discord members, 4,000+ YouTube subscribers, and the name Node AI. No TradingView mention and no performance claim. The Evan photo, testimonials, and client sample reel stay empty placeholders. The lead flow is labeled illustrative.
- **Fixes in this pass:** A heavier lower scrim sits behind the hero type so burned-in reel captions do not read through the subtext. Makeover tiles are clipped with `overflow: hidden` and `clip-path: inset(0)` on the browser viewport. Hero and cinema video stay off until needed. Below-fold stills are WebP with `loading="lazy"`. Reels were re-encoded at CRF 27 (SSIM about 0.987 and 0.990) and have no audio track.
- **CSP:** Homepage fonts, scripts, images, and video are same-origin, which the existing policy already allows. Google Fonts stays allowed for the fictional makeover pages and the rest of the site. The homepage does not embed the LeadConnector frame.
- **Alternatives:** Point the new CTA at `/book/` or `/fit-check/`; rewrite the page as React; delete the Signal Path module.
- **Verification:** Local build, existing route tests updated for the homepage contract, and browser checks at 1440 and 390. Preview URL when Vercel provides one. Production verification is out of scope.
- **Rollback:** Revert this branch. Do not alias the preview to production. The previous production homepage remains the live site until a separate release decision.

## 2026-09-21: 1stStep OS Cycle 1 is a public free core, not a hosted product

- **Status / owner:** Approved by Evan via the public-site update request; implemented on `/tools/1ststep-os/`, `/tools/`, and `/os`. Evan retains authority for claiming a hosted OS product, deploying a compile API, or offering a ZIP generator on Vercel or 1ststep.ai.
- **Decision:** Treat 1stStep OS as honestly **live** only as a **public free core**: clone https://github.com/1ststepai/1ststep-os and run Cycle 1 locally (`npm install && npm test && npm run build && npm start`, then http://localhost:3000/os) for idea → project profile → Project OS markdown ZIP. The listing at `/tools/1ststep-os/` and the Tools hub card must link that GitHub URL and give the exact local commands. `/os` may point at the repo and local ZIP path without overselling. Keep illustrative demos labeled illustrative. Do **not** claim a full agent OS, hosted control plane, or production-ready product. Do **not** add a hosted ZIP generator. Cycle 1 is not production-ready; the unauthenticated compile API must not be deployed publicly. Auto Model Router listing stays intact. Primary CTAs remain GitHub / local run / concept page, not hire-us. Supersedes the GitHub-404 and “no ZIP demo” clauses of the earlier 2026-09-21 tools-hub OS listing; Audit CLI honesty rules still hold.
- **Rationale:** The OS repository is now public and Cycle 1 exists as a local thin vertical. Visitors should be able to click from `/tools` to GitHub and know how to run the ZIP path. Calling that a hosted product would overclaim.
- **Affected systems:** `/tools/`, `/tools/1ststep-os/`, `/os`, `/tools/1ststep-os-audit/` companion copy, sitemap lastmod for `/os`, `public/llms.txt`, README, homepage OS showcase/bridge copy.
- **Alternatives:** Keep “source available soon”; add a hosted ZIP UI on the marketing site; label Cycle 1 as a finished agent OS.
- **Implementation / audit:** Tests must require the public OS GitHub href, `localhost:3000/os`, the exact npm command chain, Cycle 1, “free core,” and honest limits (not hosted, not a full agent OS, not a control plane, not production-ready, no hosted ZIP generator). Reject hire-us primary CTAs on the OS tools page. AMR marketplace honesty tests stay unchanged.
- **Reversal:** Requires a new owner decision before labeling 1stStep OS as a hosted product, deploying the compile API, or offering a ZIP generator on 1ststep.ai / Vercel.

## 2026-09-21: Tools hub lists OS Audit live and OS foundation with honest status

- **Status / owner:** Implemented on `/tools/`; **partially superseded** by the Cycle 1 public-core decision above for GitHub linking and local ZIP copy. Audit CLI listing and “no hire-us CTA” rules still hold. Evan retains authority for claiming a hosted OS product or publishing a ZIP generator on this site.
- **Decision:** Add two listings to the public Tools hub. **1stStep OS Audit** is a live, usable free CLI at `/tools/1ststep-os-audit/` with GitHub `https://github.com/1ststepai/1ststep-os-audit`. Pitch: evidence over docs, zero metered API cost path, CLI `--help`, scores can be draft, does not rewrite the target repo. **1stStep OS** was listed at `/tools/1ststep-os/` as foundation / in development (Phase 0, idea→profile→ZIP in progress, free core) until the public repo and Cycle 1 vertical existed. Primary public reference is `https://www.1ststep.ai/os`. Do not claim a hosted OS product. Primary CTAs on these pages are GitHub/CLI or the concept page, not a hire-us path. Extends the 2026-09-20 hub rule: live tools stay live; in-development work may be named only with an explicit status label.
- **Rationale:** The audit CLI is public and usable. At the time of this entry the OS repo was not public; that constraint is lifted by the later Cycle 1 decision.
- **Affected systems:** `/tools/`, `/tools/1ststep-os-audit/`, `/tools/1ststep-os/`, `/os` audit section link, sitemap, Vite/Vercel inputs, `public/llms.txt`, README.
- **Alternatives:** Wait until OS GitHub is public; hide OS until ZIP exists; treat Audit as an `/os` subsection only.
- **Implementation / audit:** Tests must keep GitHub href for Audit, require honest OS status matching the current owner decision, and “does not rewrite.” No hire-us primary CTA on the new tool pages.
- **Reversal:** Requires a new owner decision before labeling 1stStep OS as a hosted product or linking a ZIP generator on this site.

## 2026-09-20: Auto Model Router listings stay honest about marketplace status

- **Status / owner:** Implemented on the public Tools pages; Evan retains authority for claiming an official marketplace is live.
- **Decision:** Advertise Auto Model Router install with real public URLs only: GitHub (install works today) and the cursor.directory community listing. Label cursor.directory as community and do not claim it is live in Cursor’s official Marketplace. Show Cursor official Marketplace and Claude community plugin catalog as “Submitted — pending review” with no invented product URLs. Optional Anthropic docs link for how community plugins are discovered is allowed. Codex public directory remains out of scope. The plugin must not be described as guaranteeing billing or token savings. The live-motion demo from the later-merged pass remains on the same page and is a separate honesty rule (motion replay, not savings proof).
- **Rationale:** Marketplace submissions can exist before a public product page. Linking `/marketplace/publish` or a guessed slug would over-claim availability.
- **Affected systems:** `/tools/auto-model-router/`, `/tools/`, `public/llms.txt`, site README.
- **Alternatives:** Hide pending catalogs; wait until official product URLs exist; invent marketplace slugs.
- **Implementation / audit:** Tests must keep GitHub and cursor.directory hrefs, require the pending status strings, and reject `cursor.com/marketplace/publish` or a fake official product URL.
- **Reversal:** Requires a new owner decision before labeling official Cursor or Claude listings as live.

## 2026-09-20: Auto Model Router live demo is a motion replay of the real pass, not a slide deck

- **Status / owner:** Implemented on `/tools/auto-model-router/`; Evan remains authority for any later billing or estimator claims. Supersedes the earlier “play Evan’s recorded Codex MP4 as a 40-second session recording” presentation after Evan rejected the instructional slide-deck cut.
- **Decision:** Ship the Live demo as a Codex-style chat motion replay of the real suggest → wait → confirm pass (`amr-codex-live-demo.mp4`). Label it as a motion replay, not a slide explainer. Use a wait-state frame as the video poster. Keep the exact real-pass reply strings. Keep the CSS animation labeled `Example flow (illustrative)`. Do not present the demo as billing, invoice, or token-savings evidence. Do not recreate title-card slide decks as the live demo.
- **Rationale:** Visitors need to see the flow happening in a chat UI. A slide deck does not demonstrate suggest → wait → confirm.
- **Affected systems:** `/tools/auto-model-router/`, Tools hub copy, `public/assets/amr-codex-live-demo.mp4`, `public/assets/amr-codex-live-pass.png`, `public/assets/amr-codex-live-demo.vtt`, README, `llms.txt`.
- **Alternatives:** Keep the rejected slide-deck MP4; claim a raw unedited Codex screen recording; claim estimator savings on the public page.
- **Implementation / audit:** The live section must embed the motion-replay MP4 with controls and the wait-frame poster. Exact replies must remain the real-pass strings. Honest copy must say suggest → wait → confirm, not savings or slides. The illustrative kicker stays `Example flow (illustrative)`.
- **Reversal:** Requires a new owner decision before removing the live-motion replay or treating the page as a billing dashboard.

## 2026-09-20: Auto Model Router live demo is a real Codex session, not savings proof

- **Status / owner:** Superseded by the motion-replay decision above after Evan rejected the slide-deck cut. Honesty rule (no billing or token-savings claim) still holds.
- **Decision:** Add a Live demo section labeled “Real Codex session” that plays Evan’s recorded Codex pass (`amr-codex-live-demo.mp4`), quotes the activation and `getUserName` → `fetchUserName` replies, and uses the session frame as the video poster. Keep the existing CSS animation, labeled as an illustrative example only. Offer a copy-paste “Try this in Codex” rename prompt. Do not present the demo as billing, invoice, or token-savings evidence.
- **Rationale:** Visitors need to see suggest → wait before they install. The recorded pass is the real session; the illustrative animation only explains the four-step flow. Mixing those labels, or implying cost savings, would overclaim.
- **Affected systems:** `/tools/auto-model-router/`, Tools hub copy, `public/assets/amr-codex-live-demo.mp4`, `public/assets/amr-codex-live-pass.png`, README, `llms.txt`.
- **Alternatives:** Keep only the still frame; replace the CSS animation; claim estimator savings on the public page.
- **Implementation / audit:** The live section must embed the recorded MP4 with controls and the session-frame poster. Exact replies must remain the real-pass strings. Honest copy must say suggest → wait, not savings. The illustrative kicker stays `Example flow (illustrative)`.
- **Reversal:** Requires a new owner decision before removing the live session or treating the page as a billing dashboard.

## 2026-09-20: Homepage first screen is owner-offer + fit-check, architecture below the fold

- **Status / owner:** Implemented on the public site; complementary to Tools PRs #10 and #11. Evan retains authority for CTA or booking-path changes.
- **Decision:** The homepage first screen states the offer in owner language—websites, apps, and AI systems that capture and follow up leads—with one primary CTA to `/fit-check/`. Service pages are secondary links. The architecture story, Begin Your Journey, and System Audit email stay below the fold. `/book/` remains the website-strategy calendar and is not the homepage primary CTA. Canonical host is `www.1ststep.ai`.
- **Rationale:** Busy owners need the offer and next step in the first screen. Fit Check is the lighter website-intent start. Journey remains the systems diagnosis. This sprint does not change Tools pages owned by open PRs #10 and #11.
- **Affected systems:** Homepage hero/FAQ, service H1s and OG, sitemap, robots, `llms.txt`, fit-check/book metadata.
- **Alternatives:** Keep Journey as the only first-screen CTA; send all owners to `/book/`.
- **Implementation / audit:** JSON-LD FAQ must match visible FAQ text. Do not label `/book/` as a System Audit. No guaranteed-revenue copy.
- **Reversal:** Requires a new owner decision before moving the primary homepage CTA off `/fit-check/`.

## 2026-09-20: Public Tools hub is for builder utilities, not client services

- **Status / owner:** Implemented on the public site with the Auto Model Router page.
- **Decision:** Publish `/tools/` as a short hub for free/open tools that help people build with AI coding agents. List only live, usable tools. Auto Model Router is the first card. Future directions may be mentioned as unlisted work, never as fake products. Homepage primary nav and Explore footer link to the hub. Distinguish this shelf from `/services/internal-tools.html`.
- **Rationale:** A single signup URL is not enough of a public home for OSS builder tools. A hub keeps later tools from becoming one-off URLs and keeps services vs. utilities separate.
- **Affected systems:** Homepage nav/footer, `/tools/`, `/tools/auto-model-router/`, sitemap, Vite/Vercel `/tools` rewrite.
- **Alternatives:** Keep only the Auto Model Router URL; mix OSS tools into the OS or services pages.
- **Implementation / audit:** Hub copy must stay honest. Email remains optional on the Auto Model Router form.
- **Reversal:** Requires a new owner decision before removing the hub or treating Tools as a paid catalog.

## 2026-09-20: Auto Model Router public feedback is opt-in only

- **Status / owner:** Implemented for the public site; Evan retains authority for any later CRM or marketing-list expansion.
- **Decision:** Publish `/tools/auto-model-router/` as an optional feedback page for the MIT Auto Model Router skill. Accept written feedback without an email. Require a visible opt-in before storing or emailing a submitted address. Deliver submissions through the existing Resend owner-notification path used by Fit Check and the App Idea Checker. Do not add a new SaaS vendor, silent list capture, or a requirement to sign up to use the skill.
- **Rationale:** The skill is open source and must remain usable without contact details. Reusing the current CORS, rate-limit, idempotency, allowlist, and Resend contract keeps delivery honest without inventing a lead store.
- **Affected systems:** Public site page, `POST /api/auto-model-router-feedback`, Resend admin notification, sitemap, privacy copy.
- **Alternatives:** Formspree; GHL forwarding; a new database table. All add a vendor or persistence surface the repo does not already use for this kind of note.
- **Implementation / audit:** Validation requires feedback or email, and opt-in when email is present. Success is `201` only after Resend accepts the message; otherwise `503`. Analytics events must not include the email or feedback text.
- **Reversal:** Remove the page and endpoint, or replace delivery only after an approved alternative that preserves the same opt-in and no-harvest contract.

## 2026-09-13: Public-site and OS engineering authority

- **Status / owner:** Approved by Evan Pancis through the public-site master operating prompt; Evan retains human authority for material business and risk decisions.
- **Decision:** The public-site agent owns `1ststep.ai`, `/os`, and the public/business experience, including UI/UX, responsive and design-system quality, brand integrity, conversion, technical SEO, analytics/attribution, performance, visual QA, accessibility, security, and release verification. The site leads with systems architecture and automation consultancy; `/os` develops the distinct AI Engineering Operating System and AI-engineering service direction. The dedicated `app.1ststep.ai` Engineering Orchestrator owns the authenticated Job Agent application and its engineering domain. Cross-app needs become explicit contracts and handoffs; this agent does not independently implement app-owned changes.
- **Rationale:** Give the public site and AI Engineering OS one accountable technical steward, preserve the canonical logo decision, and avoid competing authorities or overlapping application edits.
- **Affected systems:** Main website, `/os`, Begin Your Journey, public integrations, public-facing Lead OS/Pain Finder, and interfaces to `app.1ststep.ai`.
- **Alternatives:** Split public-site ownership across unrelated agents; allow the website agent to edit app engineering independently. Both increase drift and collision risk.
- **Implementation / audit:** `AGENTS.md` and `docs/PUBLIC_SITE_AGENT_OPERATING_CHARTER.md` carry the operating responsibilities. Verify task ownership, evidence, and release gates on each substantial change; this entry is not proof those workflows already exist.
- **Reversal:** Requires a new explicit owner decision and a reconciled authority contract. No decision is superseded by this entry.

## 2026-07-22: Keep the checker deterministic and vendor-light

- **Decision:** Preserve deterministic scoring and the Vercel function architecture; do not add a paid model provider.
- **Context:** The product offers an instant first-pass assessment and lead intake, not autonomous AI decision-making.
- **Alternatives:** Add a hosted model; move the flow into GHL; rebuild as a larger application.
- **Rationale:** Lower cost, smaller secret surface, predictable output, and no new availability dependency.
- **Risk:** Marketing must not imply that a model performed analysis.
- **Reversal:** Add a server-side provider only after owner approval, budget controls, privacy review, timeouts, and output validation.

## 2026-07-22: A success response requires real delivery

- **Decision:** Return `200` only when KV persistence, Resend notification, or an approved webhook succeeds; otherwise return `503`.
- **Context:** No-op storage previously allowed the UI to claim a report was saved even when it could be dropped.
- **Alternatives:** Always return success; require KV only.
- **Rationale:** Truthful failure behavior while preserving low-cost delivery choices.
- **Risk:** Misconfigured production environments will expose an error rather than silently collect nothing.
- **Reversal:** Add another verified delivery adapter that satisfies the same success contract.

## 2026-07-22: Minimize browser-resident lead data

- **Decision:** Remove legacy raw lead storage, preserve `appIdeaCheckerLastResponse`, and store only a small non-contact result summary.
- **Context:** Raw contact details, idea text, and generated previews were persisted in browser storage.
- **Alternatives:** Encrypt client-side; retain full local history.
- **Rationale:** Client-side encryption would not solve same-origin script access; full lead data is unnecessary for the user flow.
- **Risk:** Old local history is cleared when the checker loads.
- **Reversal:** Add an authenticated, server-backed history feature with a documented need and deletion controls.

## 2026-07-22: Layer application controls with deployment controls

- **Decision:** Add strict input allowlisting, same-origin CORS, request IDs, per-instance rate limiting, and warm-instance idempotency without a new dependency.
- **Context:** The public endpoint had permissive CORS and no abuse or duplicate-delivery protection.
- **Alternatives:** Add a paid rate-limit vendor; rely only on Vercel Firewall.
- **Rationale:** Immediate defense in depth with no new vendor.
- **Risk:** Serverless instances do not share the in-memory limits or idempotency cache.
- **Reversal:** Replace the in-memory layer with an approved durable store while keeping the same response contract.

## 2026-09-23: Outcome-led commercial homepage; Foundry remains separate

- **Owner / authority:** Evan's explicit outcome-led homepage instruction. Preview only; no merge or Production approval.
- **Base:** 0d8eb5ae59fc02770b7f1992000b0251008ff4b7. Isolated branch astra/outcome-homepage-preview.
- **Decision:** Lead with business outcomes and the Build / Finish / Automate paths. Use a six-second, one-shot illustrative workflow transformation with pause/replay and static reduced-motion behavior. Keep the entire Foundry implementation unchanged at /foundry/, linked as optional capability proof.
- **Preserved:** Intake/API/security/analytics/attribution implementation, intent identifiers, approved client-control language and counsel gate. No absolute ownership claim. No new packages.
- **Proof boundary:** Three first-party products/projects, never paid-client engagements. DaySetGo public-demo screenshot, Job Agent public-entry screenshot and Nova public-access screenshot were captured 2026-09-22 and reused without fabricating interfaces or results. Sources: https://www.daysetgo.ai/plan?mode=demo ; https://app.1ststep.ai/concierge ; https://swingtradepros.com/ai-assistant-demo . Authenticated service completion is not claimed. Prior owner-approved Google excerpts and their exact source links are preserved; review status is separate from paid-client status.
- **Verification:** Existing security/intake tests remain intact. Updated homepage tests assert the approved headline, three honest project stories, optional Foundry link, correct intake paths and FAQ parity. Browser checks cover 1440/1280/768/390/320 widths, no overflow, all intent/attribution paths, keyboard FAQ, pause/finite motion, reduced motion and no Foundry renderer request on the homepage. No external form submitted.
- **Release gate / rollback:** Owner Preview review required. No merge or Production. Previous candidate remains available at the base SHA.

## 2026-09-23 - Homepage Original / Light appearance (owner approved)

- Owner: Evan. Status: implementation for isolated Preview review, not Production.
- Base and rollback: 62297119b619b666462d6cf2b566efba0956a977.
- Preserve the outcome-led structure and all commercial copy/routes. Original navy/blue/cyan is default; ivory/forest remains Light. One homepage, one motion system, centralized semantic CSS tokens, native Appearance select.
- Explicit preference is local-only under firststep-home-appearance; allowlisted pre-style restoration. Storage denial safely retains Original on reload. No theme analytics. Foundry and all non-home routes remain independent.
- Scope: index.html, src/outcome-home.css, src/outcome-home.js and this decision. No backend, intake, attribution, schema, reviews, ownership, Handoff Standard or Foundry changes. Captions receive opaque themed surfaces; decorative workflow icons hide at 320px to avoid text collision.
- Local evidence: 126 tests pass; build passes. Browser checks at 1440,1280,768,390,320 for both themes: no horizontal overflow; computed text contrast passes WCAG AA thresholds (including gradient endpoints). Desktop/mobile screenshots inspected; focus and native keyboard selection verified. All three intent/attribution paths and back/reload preference restoration pass in both themes. Reduced-motion mode retains static accessible content. No console warnings/errors observed.
- Bootstrap checks: missing, invalid, Original, Light and blocked storage. Restoration executes before CSS/content. Preference is origin-local, so different Preview URLs do not share it. JS/storage disabled cannot restore a saved preference; page defaults to Original.
- Preview SHA and deployment verification recorded in delivery; no merge or Production authorization. Existing Foundry build chunk warning remains outside this theme scope. No lint/typecheck script exists in package.json.

## 2026-09-26 - Signal Path hero and restored Journey secondary path (owner approved, Slice 1)

- **Owner / authority:** Evan's explicit Slice 1 authorization. Zero-user Preview only; no merge to main and no Production.
- **Base and rollback:** 8af9397a9343cfa13a4fc425c7accd15e4b30df6 (`codex/outcome-theme-preview`, the build matched to current Production), treated as the immutable baseline. Isolated branch `claude/signal-path-hero`. Production/main drift is a separate release-management item that must be reconciled before any Production release.
- **Decision:** Replace the scattered-card hero figure with the Signal Path: one illustrative inquiry travels Source, Capture, Qualify, Route, Follow up, Convert and Measure, and attribution returns to the source. It starts disconnected (duplicate entry, no owner, follow-up not sent, unattributed outcome), comes online once in about six seconds, and rests. Pause and Replay are kept. On desktop (at least 1280px) a slim, non-interactive status rail carries the same system state through Problem, Work, Services, How, Reviews and the final CTA. It never pins, hijacks or gates scrolling. Below 1280px the figure is a vertical, tappable signal path with no rail.
- **CTA hierarchy:** Fit Check stays the only primary CTA ("Tell us what you need built"). Begin Your Journey is restored as a text-link secondary path in the hero and final section ("Need to understand what's broken first?"), tracked as `journey_start_click` with a placement. This reverses the hero's earlier "no /journey/ link" test assertion by owner decision. "Deploy Our OS" is not introduced. The headline is unchanged.
- **Honesty:** Figure values are labeled illustrative (not live data, not a client). No metrics, clients or results are implied.
- **Engineering:** No new dependencies and no WebGL. It uses semantic HTML, inline SVG, CSS transitions and one requestAnimationFrame clock (`src/motion/core.js`), with choreography in `src/signal-path.js` loaded by dynamic import after the page is usable. Every visual state is a `reach-*` class, shared by the animation, step-through, rail and static fallback. The no-JS markup ships fully resolved. An inline script holds the disconnected first frame only when motion is allowed, and it restores the resolved state if the module has not initialized within 4s. A failed import also restores it. Reduced motion shows the complete system with a six-step inspector and no autoplay. Offscreen or hidden tabs pause the clock.
- **Affected systems:** `index.html` (hero figure, secondary Journey links), `src/outcome-home.css` (removed dead scattered-card rules and tokens; added Signal Path, rail and secondary-link styles), `src/outcome-home.js`, new `src/motion/core.js`, new `src/signal-path.js`, `test/signalPath.test.js`, `test/publicDiscoverability.test.js`.
- **Verification / release gate:** See the Slice 1 delivery report (Lighthouse before/after, width matrix, reduced motion, no-JS, blocked-module and keyboard checks). Owner visual review is required before Slice 2, merge or Production.
- **Release (2026-09-26):** Evan explicitly approved Production. `caa1468` (diagram breakpoint raised to 1280px) was deployed by Vercel CLI from a clean checkout as `main-website-repo-e3zwfry1d-1ststep.vercel.app`, aliased to www.1ststep.ai. The previous Production was confirmed content-identical to `8af9397` before the release, so the release only adds this slice.
- **Production verification:** www and apex resolve and serve the Signal Path markup, both secondary Journey placements, source-linked reviews and canonical. All assets and the /journey/, /fit-check/, /foundry/, /os, /tools/, app-checker, robots and sitemap routes return 200. In a live browser, Vercel Analytics loads and nothing else fails; there are no console errors. Pause/resume, step announcements, all six rail states, reduced motion at 1440 and 390, the 1279/1280 layout switch and zero overflow all pass.
- **Live Lighthouse, median of 3 (before -> after):** mobile perf 69 -> 71, LCP 7.20s -> 6.14s, CLS 0.105 -> 0.106. Desktop perf 96 -> 96, LCP 1.37s -> 1.38s, CLS 0.005 -> 0.009.
- **Rollback:** Vercel instant rollback to `dpl_5uV2cw18AL1uRUmfJPWaeP9aa4wo` (`main-website-repo-75gz2vvt8-1ststep.vercel.app`, content `8af9397`).
- **Still open:** `main` (324e589) does not contain `8af9397` or this slice. A Production deploy built from `main` would roll the live homepage back. Fast-forward `main` to `caa1468` (it contains all of `main`) before any main-based deploy.
