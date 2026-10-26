# PR #29 production readiness audit

Date: 2026-10-26. Verdict: **NOT production-ready; retain draft.**

## Immutable baseline and authority

- Repository: `1ststepai/main-website`.
- Reviewed PR head: `3761af3fbc9a631a5da97fa6617ee5a422faa5de`.
- Base: `7ace981b70d270fba09a5e956ccb14ce2b53a9c2`.
- Improvements are isolated on `audit/social-pr29`; they do not update the active Cursor branch, merge, configure credentials, activate a cron, or authorize posting.
- The October 25 summary is stale: this head wires YouTube, Instagram, Facebook and TikTok inbox publishers. X is still unimplemented. HTTP mocks establish code behavior, not platform approval or live integration success.
- Retrieved current PR discussion before editing: Cursor is already implementing the broader workflow. This audit does not duplicate that feature work.
- Owner authority remains at `/admin/`. Brand agents cannot approve or schedule through the agent routes. Private uploads still transfer content to an external service; a private Preview test requires a specifically approved asset/account.

## Findings and disposition

| ID | Severity | Evidence and reproducible failure | Required resolution |
| --- | --- | --- | --- |
| Q1 | High | `store.savePost(create)` does two index reads and a final SET. Two simultaneous creates both read the old index; one post disappears from `listPosts` although its record still exists. Capacity checking is also non-atomic. Executable TODO produces 1 record instead of 2. | Atomic record creation + brand index insertion + capacity check (transaction/Lua or equivalent). Migrate existing array indexes deliberately. Do not add a process-local mutex. |
| Q2 | High | `savePost` overwrites entire records without a revision. A stale draft write after approval succeeds; a draft worker can likewise restore a pre-rejection snapshot. Post and job state can diverge. Executable TODO demonstrates no conflict rejection. | Revision CAS on every agent, owner and worker mutation; conditional transitions; keep cancellation authoritative. Bind approval to a content/media/account revision and require reapproval when that revision changes. |
| Q3 | High | `publishDueSlice` and `draftSlice` read eligibility before writing a timestamp lock. Both simultaneous calls enter the publisher (TODO observes 2 calls instead of 1). Draft and publish locks are separate. Lock expiry is 20 seconds, while provider fetches have no timeout and can outlive it. | One atomic claim shared by draft/publish workers with unique ownership, bounded I/O and fencing. CAS completion/release must not let an expired worker overwrite a new owner or owner cancellation. Recheck approval immediately before visibility changes. |
| U1 | High | Baseline YouTube session is saved only after the whole slice returns. The video blob is deleted before thumbnail upload. A 403 on thumbnail upload throws, loses the newly created session/video ID and leaves a missing source; retry may initialize a duplicate. | **Draft fix:** checkpoint encrypted session before bytes, after probe/chunk completion and after drafting; retain media until the service persists the resulting job. Fail checkpoint -> no further video bytes. Session-init response loss and remote/local exactly-once completion still require reconciliation. |
| O1 | High | Baseline Google scopes are `youtube.upload` + `youtube.readonly`. Final visibility uses `videos.update`, which accepts neither scope. HTTP mocks never enforce scopes. | **Draft fix:** request `youtube.force-ssl` alongside upload. Reconnect and inspect granted scopes in Preview; existing refresh tokens are not upgraded automatically. Google consent/API review is still an external gate. |
| O2 | Medium | `takeNonce` GET then DEL permits two callbacks to consume the same nonce. Baseline concurrency test returns the brand twice. Google normally consumes an individual code once, but two codes for one state still bypass the intended single-use boundary. | **Draft fix:** Redis GETDEL, matching atomic in-memory behavior, fail closed on Redis error envelopes. Verify managed Redis supports GETDEL before connect. No fallback to GET/DEL. |
| R1 | Medium | Rate buckets are a per-process global Map; cold/parallel instances each allow a fresh budget. Bucket identity includes attacker-changeable whole authorization/cookie/IP text, enabling additional buckets even on one instance. | Shared atomic limiter keyed to authenticated token ID/owner plus separate pre-auth IP quota. Exclude irrelevant cookies; trust only platform-provided client IP. Test cold instances and cookie variation. |
| S1 | High operational | No `vercel.json` cron. Endpoint accepts POST only; simply adding a native GET cron would return 405. A call handles one slice/post, not the entire queue; browser loop stops when its tab closes. Bad first draft candidate can starve later drafts. | Explicit authenticated external POST scheduler or deliberate native-GET adaptation, bounded continuation, per-post retry/backoff, fair selection, DLQ, heartbeat/lag alerts and recovery ownership. Leave disabled until separately authorized. |
| U2 | Medium | `draftSlice` sets `platform_draft.status=failed`; draft selection excludes it, but `restartUpload` rejects normal `ready_for_review` draft failures. Private draft jobs can become stuck. `putChunk` assumes end+1 on 308 without Range, unlike probing's offset=0. No Retry-After/backoff, timeout, expiry reconciliation or malformed offset bounds. | Draft-specific retry preserving durable video ID; validate server acknowledgement and handle 308/no Range, 401, 404/410, 429/5xx and lost final responses. Never blindly restart a remotely completed upload. |
| U3 | High functional | Agent upload changes remain allowed while a post is `ready_for_review` even after its private platform draft is ready. Replacing the attached video does not invalidate the existing job/video ID; approval can publish the old video instead of the replacement. The owner thumbnail preview also disappears once its blob is deleted. | Freeze the staged media revision or invalidate/reconcile the job on replacement; verify asset hash, job revision and owner-visible review before approval. Preserve a reviewable thumbnail until review completes or retrieve it securely from YouTube. |

## Brand isolation, authorization and OAuth assessment

- Agent token lookup uses a random secret hashed with SHA-256; list/update/upload check the stored token brand. Cross-brand input and asset paths are rejected. Existing tests exercise cross-brand writes and agent approval/scheduling denial; they passed locally.
- Owner mutations require the signed admin cookie, same-origin check and JSON. Owner has authority across all brands; `brand_id` in the UI request is not an authorization boundary for the owner.
- `publish_due` scans **all brands**, regardless of the displayed brand. A controlled Preview must have no other connected accounts or due posts. A brand-filtered test runner with an explicit allowlisted account/post is recommended before broader testing.
- STP Google connect pins `UC86s7HqMAR-FSfxuv1N1Pwg`; Meta connect pins Instagram `28230105726692205`. Other brands have no configured expected IDs; do not connect a second brand without recording the intended channel and checking for accidental reuse.
- Credential/session envelopes use AES-256-GCM with random IV and purpose AAD under a dedicated key. Purpose separation works in tests. AAD is not brand/post/account specific; encrypted-record transplantation under a storage-write compromise is not detected. Bind these identifiers and an account connection revision on future migration; do not claim crypto alone guarantees cross-brand isolation.
- Signed expiring OAuth state and nonce are present. Callback does not require an authenticated owner or bind state to an initiating browser session. Keep authorization URLs private; add session binding/PKCE where supported and validate actual granted scopes. No direct unauthenticated nonce-guessing exploit was established.
- Disconnect deletes the local envelope but does not revoke Google's remote grant or cancel an in-flight worker. A returning worker can restore its stale connection. Credential rotation/revocation and connection revision fencing are required operational controls.
- Error redaction covers some token patterns only; review provider errors and telemetry with synthetic secrets. Never log state, authorization codes, refresh tokens or resumable URLs.

## Targeted changes and evidence

Changed `lib/social/store.js`, `google.js`, `publishers/youtube.js`, and service checkpoint/cleanup ordering. Added `test/socialReadiness.test.js`.

Before fixes: four active regression cases failed (nonce race, missing update scope, missing durable checkpoint/media preservation, checkpoint failure not stopping bytes). After fixes: five new active cases pass, including REST GETDEL/error-envelope behavior. Existing 153 tests still pass. Three additional executable acceptance tests deliberately remain TODO and currently fail their assertions; they are known blockers, not passing coverage.

Commands:

```sh
node --test test/socialReadiness.test.js test/socialPosting.test.js
npm test
npm run build
```

Full result: **158 pass, 0 ordinary failures, 3 known-failing TODO cases** (161 total). Build succeeded, with the existing large-chunk warning. No real OAuth or platform uploads were performed.

At the reviewed head, GitHub `verify` failed on `npm audit --audit-level=high`: Vite and source-map-js high findings, plus moderate PostCSS chain findings. Its tests (153) and build passed. SonarCloud passed; Vercel Preview Comments passed. Sonar success is not a complete release gate. Dependency changes were deliberately excluded from this focused patch; fix actual dependency findings without force-upgrading Tailwind or weakening the gate.

## Controlled YouTube Preview entry requirements

1. Integrate/review these fixes and resolve Q1-Q3 before any claim of production readiness. For a limited manual diagnostic, enforce an isolated single operator, one YouTube post and no scheduler/other worker; this reduces exposure but does not resolve the races. Record explicit acceptance of these limits before performing such a diagnostic.
2. Use a pinned Preview deployment, record its exact source SHA and URL, and protect admin access. Use separate Preview KV, private Blob, encryption key and admin/session secrets; merely selecting Vercel Preview does not establish data isolation. Confirm no production credentials/storage or due posts are shared.
3. Configure names only through protected settings: `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `SOCIAL_TOKEN_ENC_KEY`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, and existing admin authentication configuration. `SOCIAL_CRON_SECRET` is needed only if testing the cron endpoint; keep its trigger disabled. Meta/TikTok credentials are unnecessary for this YouTube-only test. Runtime env existence was not inspected in this audit.
4. Enable YouTube Data API v3, configure the exact stable Preview callback `/api/social/oauth/callback`, add the owner as consent test user if required, and verify quota plus channel upload/custom-thumbnail eligibility. Reconnect after the scope change, confirm granted `youtube.force-ssl` and upload access and the exact STP channel ID. Refresh-token expiry, app verification and YouTube upload audit are separate gates.
5. Use an explicitly approved non-sensitive video and a supported thumbnail (JPEG/PNG, within 2 MiB); current code requires both even for Shorts. Confirm asset access without inventing a path. For the planned Bitcoin short, verify the actual transferred file, not the PR's filename claim. Keep visibility private throughout. Real vidIQ scores or an owner-entered override are required; never fabricate scores.
6. Test upload -> interrupted request -> same saved session resume -> thumbnail failure -> retry same video ID; token refresh; permission denial; KV checkpoint failure; duplicate invocation; rejected post; wrong-brand token/account. Verify no duplicate videos, no rejected post resurrection, and no metadata/visibility update before owner approval. Confirm cleanup only after durable recovery information exists.
7. Owner reviews video, thumbnail, copy and target in the actual Preview flow; then explicitly approves and schedules the private test. Run one controlled manual slice/continuation at a time. Record YouTube ID, actual privacy from API/Studio (not merely requested privacy or queue `published`), playback, processing status, token refresh outcome, audit trail and Blob cleanup.
8. Test scheduled reliability separately with an authorized Preview-only authenticated trigger, two due posts, overlapping ticks, serverless timeout, browser closed and scheduler interruption. Require recovery/lag evidence. Do not activate production cron/posting as part of this audit.

A private upload is sufficient for Preview evidence even when an unaudited Google API project forces private. It does not prove public publishing eligibility. Production requires resolved blockers, clean mandatory checks, exact tested/Preview/release SHA mapping, account/credential review and separate owner release/posting authorization.

## Handoff, rollback and coverage limits

- Cursor remains owner of PR #29 feature completion; consume the isolated audit patch after reviewing the pinned baseline. Do not overwrite active work or silently apply it to a newer head.
- Revert the audit commit to undo these changes; no migration or environment mutation was performed. GETDEL needs Redis support. Reverting the scope request does not revoke grants already consented to.
- Do not delete a KV namespace as a routine rollback: preserve encrypted job/video IDs and audit history so remote private uploads can be reconciled. Disable triggers, retain records, inventory provider video IDs, and revoke connections deliberately.
- Review traced all social backend modules/routes, owner UI queue/publish behavior, existing tests, configuration and applicable supporting auth/blob code. No rendered UI, deployment environment, real provider API, Redis service or production behavior was verified. The security skill's auxiliary preflight resource was unavailable; this is a manual code/readiness audit, not a finalized Codex Security Cloud scan or SARIF certification.

Official protocol references: https://developers.google.com/youtube/v3/docs/videos/update and https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol .
