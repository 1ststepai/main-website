# Architecture Decision Log

## 2026-09-13: Standard free OS Audit requires zero metered AI/API usage (ADR-OS-003)

- **Status / owner:** Binding product/architecture invariant approved by Evan; engine, call-boundary tests, cost telemetry and release gate are **NOT IMPLEMENTED / NOT_EVALUATED**. No implementation or production change is authorized by this decision.
- **Decision:** The standard free result—baseline-derived Genome, static/evidence-backed findings, deterministic priorities, OS configuration, optional justified agent mappings and templated report—must complete with **$0 incremental metered AI/API usage charged to 1stStep.ai**. No paid model, embeddings, reranking, search/enrichment or repository-analysis service, including a vendor free allowance or paid cached output, may be a mandatory dependency or fallback. Use local/open-source deterministic analysis and a few relevant user-confirmed answers. Unsupported semantic/business/market/nuanced UX judgments stay NOT ASSESSED. Provider-neutral model workers are optional paid/internal work only, with separate authorization. Do not label a deterministic report “AI analysis.”
- **Infrastructure and release:** CPU, bandwidth, repository retrieval, storage, queues and database usage remain real costs; bound and measure them separately. Cache only permission-safe results for a pinned baseline/dirty manifest, engine/control/approved-pattern versions, scope and freshness. `FREE-AUDIT-ZERO-METERED-COST` is a permanent release gate; an instrumented complete-path and negative dependency/fallback test must prove no metered call. Any mandatory usage-priced provider **blocks release** absent an explicit owner reversal. No gate PASS is claimed.
- **Architecture / evidence:** Root OS ADR-022 and separate Audit ADR-022 record the same invariant without merging their ownership. [G1.5 zero-cost rule inventory](OS_G1_5_ZERO_COST_RULE_INVENTORY.md) classifies candidate checks from all six systems by feasibility, tooling, false-positive risk and free/paid boundary; they are design candidates, not finalized findings or implemented PatternDefinitions. Existing G1/G2 ownership, consent and persistence gates remain closed.

## 2026-09-13: Free evidence-first OS Audit is the existing-builder acquisition direction (ADR-OS-002)

- **Status / owner:** Product direction approved by Evan. Audit publication criteria, G1/G2 persistence, read-only connection, pricing, payments, specialist entitlements, and release implementation remain open. The supplied decision ends after “Only introduce quantitat”; no unseen continuation is inferred.
- **Decision:** The future primary path for an existing build is free, useful OS Audit → verified strengths, weaknesses, risks and unknowns → prioritized work and tailored Project OS recommendation → optional paid OS spin-up → core engineering team and only justified specialist agents → remediation, independent verification and re-audit. A healthy project is reported as healthy. Missing evidence is UNKNOWN/UNVERIFIED, never a manufactured failure. Numbers are subordinate to evidence and require a validated publication gate. The new-builder idea/interpretation/adaptive-question path stays distinct; both converge on a single versioned Genome/Profile → Project OS → engineering-team contract.
- **Current-state boundary:** The local `/os/start/` one-link input only prepares a user-sent email request; it does not connect, scan, score, create a Project or deliver a free Audit. Production `/os/start/` was observed returning 404 on 2026-09-13. No commercial funnel UI, OS engine, pricing, or production behavior changes follow from this record.
- **Architecture / authority:** The root `1stStep OS` design owns upstream project/profile, capability, module and generator concepts, subject to its unresolved Genome F-0025 and owner ratification. The separate `1stStep OS Audit` design owns audit-specific baseline, evidence strength, controls, scoring, findings and verification through its versioned integration contract. The public-site agent owns `/os` experience and interface; a named OS backend owner is still required. The Job Agent Engineering Orchestrator retains app-owned systems.
- **Evidence and dependency:** [G1.5 six-system inventory](OS_G1_5_FIRST_PARTY_ECOSYSTEM_AUDIT.md) and [methodology challenge](OS_FREE_AUDIT_FIRST_PARTY_METHOD_REVIEW.md). Resolve the Audit lock drift and ratification contradiction, source identity/coverage, applicability, truthful score presentation, consent/retention, OS scaffold-vs-new-backend authority, and G2 contract before any connector or commercial release. The existing P0/P1 phase assignments are not silently changed.
- **Supersession:** The primary commercial entry direction supersedes the older assumption that idea intake alone defines the product's acquisition strategy. It does not reverse the idea-path MVP scope, separate-backend direction, or existing security and release gates.

## 2026-09-13: Proposed OS project-centered backend boundary (ADR-OS-001)

- **Status / owner:** G1-A separate-backend direction approved by Evan in the current conversation; remaining G1 decisions and **backend implementation gate remain CLOSED**. Evan owns material product, data, vendor, and security decisions; the OS backend implementation owner, platform, and identity boundary are not yet assigned. [G1-A/B/C decision package](OS_G1_OWNER_DECISION_PACKAGE.md) remains the decision record; the supplied G1-C brief is visibly incomplete.
- **Decision:** Use a separate OS backend authority rather than implementing the OS domain in the Job Agent app or public Vite site. Keep the verified `/os/start/` onboarding as a browser-local preview. The approved UX direction is a one-link website or GitHub first-look request, with five-path exploration still available; the current request is a visitor-initiated email draft, not an automated audit. The Organization → Portfolio → many Projects model, per-project membership, derived registry, reviewed pattern policy, identity, hosting, repository connection, and P0 implementation details remain proposed until their respective gates are resolved.
- **Rationale:** A multi-project, project-isolated record survives browser refresh and provider context limits, preserves unknown and contradictory evidence, prevents apparent audit or generated-file claims without proof, supports first-party dogfooding across unlike projects, and avoids coupling OS repository access to Job Agent data or leaking one project into another.
- **Affected systems / authority:** Public `/os` UI contract; proposed OS backend. The public-site agent may design the `/os` contract. The `app.1ststep.ai` Engineering Orchestrator remains authoritative for any Job Agent or shared app implementation; app-owned auth, persistence, APIs, and releases require an accepted handoff.
- **Alternatives:** Browser-only persistence cannot provide authenticated ownership or safe repository access; one-project-per-user would require a later security/schema retrofit; granting organization membership implicit access to every project risks context leakage; extending the Job Agent service directly creates cross-product tenant and release coupling; provider conversation state cannot be the canonical project ledger.
- **Implementation / audit dependencies:** Review [the complete proposal](OS_BACKEND_CONTRACT_PROPOSAL.md) and [versioned schema](os-contract.v1.schema.json), appoint the OS backend owner, resolve platform/identity/privacy/retention/GitHub permissions, first-party portfolio placement, pattern-use policy, and cost decisions, then authorize a narrow P0 implementation. Separate-backend approval alone does not authorize GitHub App registration, backend scaffolding, production deployment, billing, or external writes. Verify two-project same-organization isolation, tenant isolation, idempotency, immutable baseline, pattern sanitization, provenance, and end-to-end UI truth before release.
- **Supersession:** None. The 2026-09-13 public-site authority decision remains in force.

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
