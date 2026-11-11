# Course production wiring: local verification (2026-11-11)

Status: ready for Evan's push. Local commit only; no push, PR, merge or deployment. No live GoHighLevel call was made.

## Contract

Public host -> same-origin `POST /api/course-signup` -> validate kind, email and consent -> GHL `POST /contacts/upsert` (locationId, email, source only; never tags) -> GHL `POST /contacts/{id}/tags` (additive) -> success.
Loopback hosts (localhost, 127.0.0.1, ::1) keep the offline simulation adapter. Library success starts the Markdown download in the browser; no email with the file is promised. Payment stays closed, dates unannounced, joining reserves no place.

Server env vars: `COURSE_GHL_TOKEN` (fallback `GHL_PRIVATE_INTEGRATION_TOKEN`), optional `COURSE_GHL_LOCATION_ID` (default `ER85bbRj2EUSuMtO0uFQ`, the 1ststep.ai location). The Private Integration token needs contact write access (upsert and tags). Missing token -> 503 `delivery_unavailable`.

Tags: library -> `course-prompt-library`; waitlist -> `course-waitlist`; library with the optional box checked -> both.

## Verification

- Focused suite (`node --test --test-isolation=none tests/course-local-adapter.test.mjs tests/course-signup.test.mjs test/publicConversionPaths.test.js test/publicDiscoverability.test.js test/signalPath.test.js test/postpathMarketing.test.js`): 53/53 passed. GHL is mocked.
- Full `node --test`: 198/204. The 6 failing files (adminPaymentLink, adminQuoteEmail, adminQuotePdf, leadconnectorBookingConfirmed, newsletterQuote, socialPosting) fail to load because this worktree has no installed dependencies (stripe, pdf-lib, @vercel/blob, etc.). They are unrelated to this change.
- Isolated course build: an existing Vite 8.3.6 install elsewhere on this PC, configFile false, PostCSS plugins off, output outside the repo. Both pages built.
- Browser smoke test on the built output at `course.localhost` (non-loopback hostname, so the real API adapter runs) with a mocked `/api/course-signup`: no draft or simulation markers, logo loads, unchecked waitlist consent blocks the POST, waitlist success copy is correct, library submit downloads `business-prompt-library.md` and posts `courseUpdates:false`, Idempotency-Key is sent, no console errors.
- Not run: the full production `vite build` (project node_modules missing; nothing installed) and `evidence/course-faq/verify.mjs` (its Playwright path is no longer present). The screenshots in this folder predate this change.
