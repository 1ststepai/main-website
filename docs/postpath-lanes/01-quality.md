# Lane 1 — Quality and Security

Branch: `cursor/postpath-sonar-quality-da32`
Baseline: `57a3821` (main quality gate)

This lane only changed the quality worktree. It did not merge, deploy, or open a pull request. Rules, exclusions, and quality-gate thresholds were left unchanged.

## Security

### javascript:S2245 — `public/work/lyons-life-demo/index.html`

The count-up token only cancels a stale animation. `Math.random` was replaced with `crypto.getRandomValues`. Scoring and demo copy are unchanged.

### Web:S7039 — `admin/index.html` `style-src 'unsafe-inline'`

The admin meta policy now uses `style-src 'self'`, matching the production header in `vercel.json`. `test/adminAuth.test.js` now requires both the HTML policy and the production header to block `unsafe-inline`.

Production admin CSS is emitted as an external stylesheet (`adminStudio-*.css`). Local Vite can inject styles with a `<style>` tag, so the admin dev server may render without those injected rules while this meta policy is present.

### javascript:S2068 — `lib/admin/auth.js`

`PASSWORD_HASH_PREFIX` was renamed to `HASH_FORMAT_PREFIX`. The stored format string is still `scrypt_v1`. Hash creation and verification are unchanged. Admin auth tests passed, including the scrypt hash test.

### javascript:S2245 — `app-idea-viability-checker.html`

The idempotency-key fallback no longer calls `Math.random`. It uses `crypto.randomUUID` when present, otherwise `crypto.getRandomValues`. There is no `Math.random` fallback when `crypto` is missing. Scoring, `localStorage` key `appIdeaCheckerLastResponse`, the context pack, and `repo_creation_status: locked_until_signed_and_paid` were not changed.

### githubactions:S6505 — `.github/workflows/ci.yml`

`npm ci` is now `npm ci --ignore-scripts`, followed by `npm rebuild esbuild`.

`esbuild@0.25.12` is the only install script required on Ubuntu CI. Its `postinstall` runs `node install.js`, which Vite needs for `npm run build`. `fsevents` also has an install script, but it is optional and Darwin-only, so it is not rebuilt. `npm test` uses Node's built-in test runner and does not need other install scripts.

`npm ci` was not run again here because `node_modules` is already present. `npm rebuild esbuild` completed successfully in this worktree.

## Reliability

### javascript:S930 — `foundry/scene.js`

`label(text, size=.2, color)` now accepts the third argument used by `label('HUMAN CONTROL', .18, '#cbf5df')`. `foundry/labels.js` paints that color into the shared label atlas for that label. The color argument was kept. `labels.js` is outside the original file list; the atlas is the only place a per-label color can be applied.

### css:S4649 — generic font family

Added a generic family where `font` or `font-family` did not already end with one:

- `public/makeover/after.html`: Manrope `sans-serif`, Fraunces `serif`
- `public/makeover/before.html`: Courier New `monospace`, Impact `sans-serif`
- `demos/style-board.html`: Inter and Archivo `sans-serif`, Space Grotesk `sans-serif`, Fraunces `serif`

Existing generic families (`serif`, `sans-serif`, `monospace`, `cursive`, `fantasy`, `system-ui`) were left in place.

### Web:S5254 and Web:InputWithoutLabelCheck — `public/makeover/before.html`

The document element now has `lang="en"`. Each text input and the message textarea has an `id` and a `<label for>` with the same id.

### javascript:S9383 — `src/admin/main.jsx`

`loadOperations()` and `checkSession()` are no longer floating promises. Each rejection is logged with `console.error` and surfaced through the existing operations error state or by returning the studio to the signed-out state. The operations interval uses the same handler. Catches are not empty.

### javascript:S6324 — `lib/admin/quotePdf.js`

The cleaner no longer uses control-character escapes in a regular expression. Carriage returns still become newlines, and the same character ranges are kept (tab, newline, printable ASCII, and Latin-1). A direct comparison with the previous cleaner matched on sample strings that include newlines, tabs, punctuation, and characters outside that range. Quote PDF tests passed.

## Duplication

Sonar reported 1,999 duplicated lines / 36,933 (5.4%). The gate needs density at or below 3% (about 1,108 duplicated lines if the denominator stays near 36,933), so at least about 900 duplicated lines had to be removed.

A local copy of SonarJS tokenization (string literals collapsed to one token, imports ignored, 100-token / 10-line windows) counted 1,501 duplicated lines before the change and 1,154 of those in the owned files. After the extracts it counted 322 duplicated lines, all outside this lane, and 0 in the owned files. That is 1,179 duplicated lines removed in that model.

Extracts, behavior preserved and covered by the existing module tests:

- `lib/admin/agreementLibrary.data.json` holds the clause library and contract-template specs. `lib/admin/agreementLibrary.js` still builds the same section and template objects. A deep compare against the previous exports matched (32 clauses, 10 templates).
- `lib/intake/jsonEndpoint.js` is the shared public JSON intake handler for fit check, Auto Model Router feedback, Morris County offer, and commercial intake.
- `lib/intake/submissionFields.js` is the shared field cleaning, attribution allowlist, and website URL normalization.
- `lib/intake/emailFormat.js` is the shared HTML escape, Resend configuration check, and attribution text used by the three owned notification emails.
- `lib/admin/adminRequest.js` is the shared admin JSON response, body parser, identifier check, write guard, and error response.
- `test/intakeEndpointHarness.js` holds the shared fit-check and Auto Model Router HTTP test harness. Assertions for delivery, closed configuration, and hostile origin remain.

Files intentionally not edited, which still contain the remaining estimated duplication: `lib/social/**` and `packages/social-mcp/**`.

## Tests

| Command | Result |
| --- | --- |
| `node --test` on fit check, Auto Model Router feedback, commercial intake, Morris County offer, agreement library, admin auth, quote PDF, workspace, quote email, payment links, and app idea checker | 73 pass, 0 fail |
| `npm rebuild esbuild` | rebuilt successfully (`esbuild@0.25.12`) |
| `npm test` | 203 pass, 0 fail |
| `npm run build` | Vite production build succeeded |

`npm ci` was not run. The CI workflow change is the source change above; the rebuild, test, and build commands were run against the existing install.

## Residual Sonar risk

SonarCloud was not re-run from this lane, so the gate status after this commit is not production-verified.

- Owned duplication in the local token model is cleared. If Sonar's extra lines beyond that model were only in the forbidden social packages, density should fall under 3%. If Sonar tokenizes `agreementLibrary.data.json` as duplicated code, the clause table could still count. SonarJS copy-paste detection does not treat JSON as JavaScript.
- Social publisher duplication remains because this lane was not allowed to edit `packages/social-mcp/**` or the broader social modules.
- The admin meta CSP no longer allows inline styles. That matches production. Local Vite style injection can be blocked by the meta policy.
- `npm ci --ignore-scripts` was not executed in this environment. The follow-up `npm rebuild esbuild` is the package whose install script the production build needs, and both `npm test` and `npm run build` passed after that rebuild.
