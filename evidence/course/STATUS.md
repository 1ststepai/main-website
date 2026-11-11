# Unpublished local course draft

Branch: `course/waitlist-v4-local`; starting HEAD: `a437fd7d74fee4da9a15536692978e3d60411c8e`.
Status: locally verified draft. No commit, push, PR, merge, deploy, production access, email, API call or credentials. Separate agents covered platform stubs, build/regressions and independent security; root owned UI and browser verification. Exclusive files in the already isolated task worktree avoided merges or shared-file branch changes.

## Review

- Course: http://127.0.0.1:4178/course/
- Library: http://127.0.0.1:4178/course/library/
- Running loopback Vite dev server uses `vite.course-local.config.js`.
- Reproduce with installed repo dependencies: `node node_modules/vite/bin/vite.js --config vite.course-local.config.js`.
- This session used existing cached tooling, read-only: `node C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/vite/bin/vite.js --config vite.course-local.config.js`.
- Both forms are simulations. Use fictional email values; no address is stored or transmitted. The single anonymous localStorage simulation record is replaced on each request. Optional library course-update consent starts unchecked. Download never subscribes. Library is readable, copyable and downloadable without entering email.

## Files changed

- `.gitignore`: ignores local draft build output.
- `course/index.html`, `course/library/index.html`: V4 copy, semantic page/form markup, noindex, CSP and no analytics/motion injection.
- `src/course/course.css`: local fonts and responsive ink/cream/lime design.
- `src/course/forms.js`, `src/course/local-adapter.js`: mock forms, explicit consent, honest failures, copy/download UI.
- `src/course/business-prompt-library.md`: six verbatim prompt entries, fictional inputs/checklists and optional bonus from source draft.
- `tests/course-local-adapter.test.mjs`: five adapter tests.
- `vite.course-local.config.js`: isolated local entry points; production Vite config unchanged.
- `docs/architecture/decision-log.md`: authorized scope and verification/release dependencies.
- `evidence/course/verify.mjs`, this status file and 20 PNG screenshots: verification evidence.
- Task-root `STATUS.md`: copy of this report, as requested.

## Actual verification

- `node --test --test-isolation=none tests/course-local-adapter.test.mjs test/publicConversionPaths.test.js test/publicDiscoverability.test.js test/signalPath.test.js test/postpathMarketing.test.js`: **43 passed, 0 failed** (5 new + 38 existing).
- `npm run build`: **blocked/failed**, missing worktree dependencies (`vite` not recognized). No installation or network download attempted.
- `node C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/vite/bin/vite.js build --config vite.course-local.config.js`: **passed**, cached Vite 8.3.2. This does not verify the repository-pinned Vite 6 build. An initial cached build failed on missing Tailwind PostCSS dependency; isolated config now uses plain CSS without those plugins.
- `node evidence/course/verify.mjs`: **passed**. Chromium with sandbox enabled, only loopback requests permitted; desktop 1440x1000, laptop 1280x900, tablet 768x1024, mobile 390x844 and 320x844. No horizontal overflow, page errors or attempted external requests. Consent off/on, direct waitlist simulation, storage failure with input retained, and Markdown download passed.
- 20 actual viewport screenshots saved. Full-page capture failed, so screenshots use viewports and scrolled lesson/workshop/FAQ/form/resource sections. A first final rerun was interrupted by Vite hot reload; subsequent complete run passed. Desktop/mobile hero, library, lesson, form and resource screenshots inspected against supplied boards. Full copy intentionally occupies more space than abbreviated boards; CSS steps approximate the reference illustration.
- `git diff --check`: **passed**. No lint or typecheck script exists. Full repository test suite and social-MCP suite were not run; selected offline regressions only.
- Independent security review found no blocking issue in inspected draft sources: loopback-only adapter, no email persistence/network, unchecked consent, noindex, native-submit-blocking CSP, production config unchanged.
- Sandbox process creation intermittently failed (`Access denied`/`EPERM`); approved escalation ran only local verification commands. No sandbox configuration was changed.

## Remaining blockers

Normal dependency-backed build remains unverified. Full accessibility audit, instructor/content approval, actual privacy policy and retention/consent handling, delivery provider/unsubscribe design, actual email delivery and any release remain outside this local draft. No public indexing, live integration or publication is authorized. Existing site routes, App Idea Checker, notifications, GHL safeguards and repository-creation lock were not edited.
