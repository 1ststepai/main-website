# Course FAQ objections — unpublished local draft

Date: 2026-11-08. Branch: course/faq-objections-local. Baseline HEAD: b4cc6f9aed3c852aadab135fdfe6d302a1f46237. Initial staged/unstaged/untracked status clean. Only this worktree source was edited; requested task-root status is the sole output outside it.

## Result
Implemented locally: honest why-pay/free alternatives, no-code and existing-ChatGPT fit answers. Seven visible Evan-to-decide DRAFT topics cover refund, recordings/missed sessions, weekly hours, tools/costs, feedback, post-cohort access and additional participation policies. Existing advanced-builder exclusion remains consistent. No invented proof, ROI promises or policies. Research used: buyer objections Themes A/B/C/F/H/I; HeyTony question-first/answer-first organization only. Supporting V4 copy/design, competitor research and library draft inspected. Supplied ink/cream/lime reference, simple dividers, Archivo/Instrument, logo, competitor outline, mock forms/consent/noindex/library behavior retained.

No push, PR, merge, deploy, production configuration changes, live endpoints, email, public indexing, paid APIs or credentials. No other worktree modified. Unknown policies remain owner decisions; no publication authority.

## Actual verification
- Scoped tests: PASS 44/44 via node --test --test-isolation=none tests/course-local-adapter.test.mjs test/publicConversionPaths.test.js test/publicDiscoverability.test.js test/signalPath.test.js test/postpathMarketing.test.js. Log: scoped-tests.log.
- Isolated build: PASS using read-only cached Vite 8.3.2 at C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/vite/bin/vite.js with build --config vite.course-local.config.js --configLoader runner. Eight modules, output dist-course-local only. Log: build.log. Repository-local pinned Vite absent; pinned-version build NOT verified. Independent reviewer attempted local build and confirmed missing module.
- Independent adapter run: 6/6 passed with isolation disabled; default runner failed spawn EPERM. Windows intermittently denied normal process launch; approved local command escalation used, no browser sandbox disabled.
- Browser verifier: 28 actual PNGs, course/library at 1440x1000, 1280x900, 768x1024, 390x844, 320x844 plus detail views. No horizontal overflow, page errors or external requests. Chromium sandbox enabled, non-loopback requests blocked. Separate course consent initially unchecked; unchecked submission writes nothing, checked simulation succeeds. Library optional consent off/on, persistence failure/input retained and Markdown download pass. All seven owner markers checked. See browser.log and verify.mjs.
- git diff --check PASS before documentation addition; final check recorded separately in terminal.
- No lint/typecheck script exists. Full repository suite not rerun for this content/CSS change. No production, full accessibility or pinned-dependency verification claimed.

## Four responsibilities
- UI/frontend: root implementation and actual screenshot inspection; reference cream/divider layout and theme preserved. Longer FAQ naturally increases page height. Visible marker wrapping checked at mobile width.
- Build/tests: root scoped/build/browser execution; independent build/frontend reviewer verified actual diff and 6 adapter tests. Reviewer could not build absent local dependencies.
- Platform integrations: independent read-only reviewer found no blocking issue; stubs only, no runtime/integration changes. Review clarified Q&A format/limits rather than denying existing ask-questions copy.
- Security/credentials: independent read-only reviewer found no blocking scoped issues; no secrets, network handlers, form persistence, CSP/noindex or production inputs changed. This is not a comprehensive security audit.

## Exact changed files
- course/index.html
- src/course/course.css
- docs/architecture/decision-log.md
- evidence/course-faq/verify.mjs
- evidence/course-faq/scoped-tests.log
- evidence/course-faq/build.log
- evidence/course-faq/browser.log
- evidence/course-faq/STATUS.md
- evidence/course-faq/*.png: 28 actual screenshots (course and library full-page at five widths; desktop/mobile lesson, workshops, practice, instructor, FAQ, signup, library resource; FAQ answers/policies closeups).
- ../STATUS-faq-objections.md (explicit requested report, identical to this).

No test source, library source, forms, adapter, lockfile, deployment config or production routes changed. Rollback is the scoped local source diff; no external state requires reversal. Evan policy decisions, real integrations/privacy handling, pinned build and separate release gates remain future work before any publication.
