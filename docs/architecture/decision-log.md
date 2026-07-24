# Architecture Decision Log

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
