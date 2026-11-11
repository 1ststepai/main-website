# Build and test evidence

Local verification only, 2026-11-08. Current worktree only. No production endpoints or deployment touched.

- `node --test tests/course-local-adapter.test.mjs`: exit 1, Node test-worker spawn blocked by EPERM.
- `node --test --test-isolation=none tests/course-local-adapter.test.mjs`: exit 0, 5/5 passed after explicit-consent implementation (before sixth regression test was added).
- `node --test --test-isolation=none`: test process exit 1, 194 tests, 187 passed, 7 failed. Six failures are missing installed packages (`stripe`, `pdf-lib`, `@vercel/analytics`, `@vercel/blob`); one Windows DPAPI test cannot spawn due to EPERM. Full output: `full-test.log`. The shell wrapper that printed the log returned 0; this does not imply suite success.
- Root agent subsequently reports scoped regressions 44/44 passed including sixth consent/no-write test; see root status for its exact command.
- `npm.cmd ci --offline --ignore-scripts --no-audit --no-fund`: exit 1, ENOTCACHED for locked Vite 6.4.5. No dependency download performed.
- `node node_modules/vite/bin/vite.js build --config vite.course-local.config.js --configLoader runner`: exit 1, local Vite absent.
- `node C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/vite/bin/vite.js build --config vite.course-local.config.js --configLoader runner`: exit 0. Read-only cached Vite 8.3.2; 8 modules, built in 315 ms. Output exclusively ignored `dist-course-local`. This is a successful isolated build with cached Vite 8.3.2, not locked Vite 6.4.5 validation.

## Actual browser verification

Current-worktree Vite started on loopback port 4179 using cached Vite and the isolated config. Port 4178 was occupied and left untouched. Command: `node C:/gh-runners/skillsprout/_work/skillsprout/skillsprout/node_modules/vite/bin/vite.js --config vite.course-local.config.js --configLoader runner --port 4179`.

`node evidence/course-competitor/verify.mjs`: exit 0. Chromium sandbox enabled. Every non-loopback request blocked; observed external requests: none. Page errors: none.

24 actual PNG screenshots saved in this directory. Full-page course and library at widths 1440, 1280, 768, 390, 320; desktop/mobile detail screenshots for lesson, workshops, practice, instructor, FAQ, signup and library resource. No horizontal overflow at any tested width.

Verified library consent initially unchecked, library off/on simulations, storage failure with input retained, waitlist initially unchecked, unchecked waitlist submission writes nothing, checked waitlist simulation succeeds, and prompt-library markdown download filename.

First browser attempt failed with transient execution-context navigation at font check. Final verifier uses navigation `networkidle` and completed successfully.
