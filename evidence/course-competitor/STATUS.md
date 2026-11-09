# Course competitor-pattern revision - LOCAL DRAFT

Date: 2026-11-08. Worktree: competitor-patterns-worktree. Branch: course/competitor-patterns-local. Starting/current HEAD: b32cbac5b5a22c0b3f8d2200d032556cf1c6138d (uncommitted changes).

## Result
Implemented and locally verified within the limits below. No push, PR, merge, deploy, production configuration changes, live endpoint access, email or public indexing. Other worktrees untouched. No credentials added or printed.

Applied supplied competitor research outline to the V4 page: outcome/format/planned $297 hero; early fit/not-for; fictional Oak Street lesson before proof; four emphasized named practice artifacts; separate live practice loop; V4 instructor description; hidden proof placeholder; seven V4 beginner FAQs; repeated identical waitlist CTA. Existing Archivo/Instrument Serif, ink/cream/lime, canonical intact logo and library behavior retained.

New fit/loop labels, proof placeholder and consent copy are DRAFT for Evan review, marked in HTML comments; consent wording also has a visible draft marker. Instructor text is retained from V4; no new work links, video, testimonials or client/course results were supplied or verified. Proof stays hidden until real owner-approved evidence exists. No manufactured proof, metrics, scarcity, timers, value stacks or income claims.

Waitlist now has separate required UNCHECKED course/waitlist consent; library optional consent remains separate and unchecked. Both forms simulate only. Email never persists or transmits. Adapter rejects absent waitlist consent and non-loopback hosts. Existing local anonymous simulation storage, copy and Blob download preserved. Both pages retain noindex and form-action none.

## Four responsibilities
- UI/frontend: root implementation, actual desktop/mobile screenshot inspection against V4.
- Build/tests: delegated agent; offline build/test/browser artifacts.
- Platform integrations: independent read-only agent reviewed stubs, consent separation, no-network library behavior; root applied correction.
- Security/credentials hygiene: independent agent reviewed scoped diff, noindex, CSP, local adapter and credential patterns. No blocking scoped findings; see evidence/course-competitor/security-review.md.

## Files changed
- course/index.html
- src/course/course.css
- src/course/forms.js
- src/course/local-adapter.js
- tests/course-local-adapter.test.mjs
- docs/architecture/decision-log.md
- evidence/course-competitor/build-tests.md
- evidence/course-competitor/full-test.log
- evidence/course-competitor/verify.mjs
- evidence/course-competitor/review.md
- evidence/course-competitor/security-review.md
- evidence/course-competitor/STATUS.md (copy of this report)
- evidence/course-competitor/: 24 actual course/library PNG screenshots at five widths and desktop/mobile detail sections.
- Requested task-root STATUS-competitor-patterns.md (this report).

No library page/resource, production config, lockfile, notifications, GHL safeguards or repo-creation lock changes.

## Actual command outcomes
- node --test tests/course-local-adapter.test.mjs: FAIL, spawn EPERM in test worker.
- node --test --test-isolation=none tests/course-local-adapter.test.mjs test/publicConversionPaths.test.js test/publicDiscoverability.test.js test/signalPath.test.js test/postpathMarketing.test.js: PASS, 44 tests, 0 failed (includes sixth consent/no-write case).
- node --test --test-isolation=none: FAIL, 187 passed / 7 failed; six missing-package failures (stripe/pdf-lib/@vercel packages), one Windows DPAPI process-spawn EPERM. Full output in full-test.log. Not a full-suite pass.
- npm.cmd ci --offline --ignore-scripts --no-audit --no-fund: FAIL, ENOTCACHED locked Vite 6.4.5; no network download.
- node node_modules/vite/bin/vite.js build --config vite.course-local.config.js --configLoader runner: FAIL, local Vite missing.
- node C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/vite/bin/vite.js build --config vite.course-local.config.js --configLoader runner: PASS, cached Vite 8.3.2, 8 modules, 315ms. Isolated dist-course-local only. This does not establish locked Vite 6 compatibility.
- node evidence/course-competitor/verify.mjs: PASS, exit 0. Current-worktree isolated Vite on 127.0.0.1:4179; occupied port 4178 left untouched. Chromium sandbox enabled. 24 actual screenshots. No overflow at 320/390/768/1280/1440; no page errors/external requests. Library off/on consent, storage failure/input retention, waitlist initially unchecked/blocked without consent/success with consent, Markdown download passed.
- git diff --check: PASS; CRLF normalization warning for CSS only.
- No lint or typecheck script exists. Scoped filename-only credential pattern scan had no matches; not an exhaustive security audit.
- Initial shell/process creation and browser navigation attempts failed; local command escalation did not disable the Chromium sandbox. Final browser run completed. See build-tests.md for details.

## Limits and next review
Local draft only. Pinned-dependency build and full suite remain unverified/failing as described. No full accessibility audit or public/production verification. Evan review of draft labels, consent, proposed artifacts and content remains pending. Privacy/delivery/unsubscribe/live integrations are not implemented or authorized; launch requires separate approval and gates. Rollback is reverting this scoped uncommitted diff; no external state was changed.
