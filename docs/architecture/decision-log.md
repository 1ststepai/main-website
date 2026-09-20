# Architecture Decision Log

## 2026-09-20: Tools pages target token-usage search intent without overclaiming

- **Status / owner:** Implemented on `/tools/` and `/tools/auto-model-router/`; Evan retains authority for later product or savings claims.
- **Decision:** Align public Tools titles, headings, and copy with how people search for Cursor/Claude usage limits and agent token burn, while keeping the existing honesty contract. Auto Model Router remains suggest → confirm. It does not shrink context by itself, does not always pick the right model, and does not save a percentage automatically. Dashboard figures stay relative estimates from a local log. Complementary habits (new chat, `/compact`, trim rules/MCP, Composer vs Opus, lean.ctx/ponytail-style context tools) are described as separate tips, not as features of the skill. The skill remains free without email.
- **Rationale:** The live pages described the policy accurately but not the problem people actually Google. Search-aligned copy only helps if it stays falsifiable.
- **Affected systems:** `/tools/`, `/tools/auto-model-router/`, sitemap, `public/llms.txt`.
- **Alternatives:** Keep product-policy-only titles; publish unverifiable savings percentages.
- **Implementation / audit:** FAQ visible text must match FAQPage schema. Tests reject automatic-percentage and always-right-model claims.
- **Reversal:** Requires a new owner decision before promising quantified savings or silent model switching.

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
