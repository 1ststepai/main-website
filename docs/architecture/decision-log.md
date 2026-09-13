# Architecture Decision Log

## 2026-09-13: Proposed OS project-centered backend boundary (ADR-OS-001)

- **Status / owner:** Proposed, not approved. Evan owns material product, data, vendor, and security decisions; the OS backend implementation owner is not yet assigned.
- **Decision proposed:** Keep the verified `/os/start/` onboarding as a browser-local preview. When Save/Create is approved, make a versioned Project with tenant-scoped answers, Genome, evidence, decisions, audit, and OS artifacts the durable source of truth. Use deterministic derivation first, least-privilege read-only GitHub inspection for existing builds, immutable baselines, evidence-linked findings, provider-neutral exports, and resumable jobs. A separate OS service is the recommended boundary; exact hosting and identity are open.
- **Rationale:** A project-centered record survives browser refresh and provider context limits, preserves unknown and contradictory evidence, prevents apparent audit or generated-file claims without proof, and avoids coupling OS repository access to Job Agent data.
- **Affected systems / authority:** Public `/os` UI contract; proposed OS backend. The public-site agent may design the `/os` contract. The `app.1ststep.ai` Engineering Orchestrator remains authoritative for any Job Agent or shared app implementation; app-owned auth, persistence, APIs, and releases require an accepted handoff.
- **Alternatives:** Browser-only persistence cannot provide authenticated ownership or safe repository access; extending the Job Agent service directly creates cross-product tenant and release coupling; provider conversation state cannot be the canonical project ledger.
- **Implementation / audit dependencies:** Review [the complete proposal](OS_BACKEND_CONTRACT_PROPOSAL.md) and [versioned schema](os-contract.v1.schema.json), resolve owner/identity/privacy/retention/GitHub permission and cost decisions, then separately authorize a narrow P0 implementation. This ADR does not authorize GitHub App registration, backend scaffolding, production deployment, billing, or external writes. Verify tenant isolation, idempotency, immutable baseline, provenance, and end-to-end UI truth before release.
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
