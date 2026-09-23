# The 1stStep Foundry — isolated concept

Base: e1c7c7696b08d9a47959d7f1be8be2c882b5cf39. Route: /foundry/.
Commercial homepage, intake, APIs, privacy, SEO and Studio are unchanged.

Original art direction: a segmented engineering chassis with labeled cassettes, mechanical iris, signal conductors and ownership tokens. Build docks scattered cassettes; Finish scans a fractured arrangement; Automate remaps offset tools around human control. The final transfer brings SOURCE, INFRASTRUCTURE, ACCESS, DATA, DOCUMENTATION and EVIDENCE toward OWNER. This is illustrative choreography, never a live build or diagnostic.

Three.js is lazy imported. Native scrolling supplies a normalized timeline; requestAnimationFrame interpolates transforms. No scroll interception or automated playback. Idle frames stop after settling. Hidden/offscreen scenes stop. DPR capped at 1.5 desktop / 1 mobile, with explicit Full/Balanced/Lite complexity tiers and an automatic downgrade after slow frames. Reduced motion skips the engine. WebGL failure preserves static SVG, copy and keyboard controls. User can select static view. Context loss also exposes fallback.

Asset provenance: product.webp is the existing first-party DaySetGo public demo capture, from https://www.daysetgo.ai/plan?mode=demo, captured 2026-09-22. 1440x1000 WebP, 96,102 bytes. Demo data is explicitly labeled, not customer activity. It is reused as an asset only; no prior cinematic implementation is reused. All geometry and label textures are procedural; no GLB or external scene asset.

References studied: https://lusion.co/ (3D storytelling/interaction philosophy) and https://activetheory.net/ (automated browser reported unsupported, so no complete visual inspection claimed). Original geometry; no copied reference assets.

Validation: npm test, npm run build, npm audit --audit-level=high. Browser script at docs/rd/foundry-browser-check.cjs uses an existing Playwright installation via PLAYWRIGHT_MODULE; BASE_URL selects local or Preview. Screenshots/results go to ignored output/. Tests exercise 1440/1280/768/390/320 widths, all intents, preserved attribution, keyboard progress, reduced motion without scene download, missing WebGL, runtime errors, and a four-second headless desktop scroll FPS observation. Headless FPS is not a hardware-device benchmark. The owner approved the visual concept for continued R&D; performance acceptance and physical mobile GPU testing remain required before any homepage adoption.

## Performance R&D — 2026-09-22

Owner: Evan. Status: continue R&D; no homepage integration or Production release. Base a055c6ef691d022f472df5b94cc37d1dc07b2cba. Story, paths, geometry arrangement, product asset and ownership transfer are preserved. No packages added.

Measurements are explicit opt-in (`?rd=1`) on localhost/Preview only, in memory, with no transmission or storage. The measurement API is removed from a VERCEL_ENV=production build. `window.__foundryRD.sample()` reports active-frame average, reciprocal p99 interval (1% low approximation), worst interval, >32/>50ms counts, render calls/triangles, geometry/texture counts, DPR, tier, and available WebGL identity. First-frame time is from mode activation (including lazy import) to first render return, not a browser presentation timestamp.

Full retains Standard materials, PMREM and three point lights. Balanced/Lite replace those with one 64x64 procedural MatCap; no realtime lighting or PMREM. Full/Balanced request high-performance; Lite requests low-power. The baseline already reached 60 FPS on the RTX 3060 with low-power, so no causal speedup from the preference is claimed.

All labels now share a 512x1152 atlas and a single draw call. Ten meaningful modules and all six ownership deliverables remain. Balanced reduces curve/bevel/ring segments, teeth, fins and traces. Lite removes teeth/fins and a decorative ring, disables bevels and uses coarse segments. Touch/coarse input, <=4 logical cores or save-data starts Lite; other devices start Balanced. Auto can downgrade to Lite after slow frames, but never automatically substitutes Static for a slow renderer. Full is explicitly selectable. Static and reduced-motion behavior remain available.

### Reproducible local measurements

Four-second active sweeps per stage, 1440x1000, actual DPR/render DPR 1. Same workstation; no concurrent benchmark runs for reported hardware comparisons. Stage order Entry / Assembly / Product / Handoff. These short runs are indicative, not thermal or battery endurance tests.

| Run | Stage | FPS | 1% low | Calls | Triangles | Geometries | Textures | >32ms / >50ms |
|---|---|---:|---:|---:|---:|---:|---:|---|
| baseline-headless | ENTRY | 6.3 | 6 | 102 | 33444 | 93 | 12 | 26 / 26 |
| baseline-headless | ASSEMBLY | 5.8 | 3.3 | 112 | 34404 | 105 | 13 | 24 / 24 |
| baseline-headless | PRODUCT | 11.1 | 5.5 | 14 | 14958 | 105 | 13 | 45 / 45 |
| baseline-headless | HANDOFF | 7.1 | 6 | 118 | 38968 | 112 | 20 | 29 / 29 |
| baseline-headed | ENTRY | 60 | 59.5 | 102 | 33444 | 93 | 12 | 0 / 0 |
| baseline-headed | ASSEMBLY | 59.7 | 59.5 | 112 | 34404 | 105 | 13 | 1 / 0 |
| baseline-headed | PRODUCT | 60 | 59.5 | 14 | 14958 | 105 | 13 | 0 / 0 |
| baseline-headed | HANDOFF | 60 | 59.5 | 118 | 38968 | 112 | 20 | 0 / 0 |
| full-headless | ENTRY | 6.5 | 6 | 93 | 33460 | 93 | 3 | 26 / 26 |
| full-headless | ASSEMBLY | 5.6 | 3.3 | 103 | 34180 | 105 | 4 | 23 / 23 |
| full-headless | PRODUCT | 11.5 | 5.5 | 15 | 14994 | 105 | 4 | 46 / 46 |
| full-headless | HANDOFF | 6.9 | 6 | 102 | 38970 | 112 | 4 | 28 / 28 |
| balanced-headless | ENTRY | 56.3 | 29.9 | 63 | 12156 | 63 | 2 | 15 / 0 |
| balanced-headless | ASSEMBLY | 50 | 29.9 | 69 | 12372 | 71 | 3 | 34 / 1 |
| balanced-headless | PRODUCT | 53 | 29.9 | 15 | 5810 | 71 | 3 | 28 / 0 |
| balanced-headless | HANDOFF | 40 | 29.9 | 72 | 14162 | 78 | 3 | 79 / 0 |
| lite-headless | ENTRY | 51.8 | 29.9 | 42 | 3036 | 42 | 2 | 33 / 0 |
| lite-headless | ASSEMBLY | 55.8 | 29.9 | 45 | 3090 | 47 | 3 | 9 / 1 |
| lite-headless | PRODUCT | 57.7 | 29.9 | 14 | 1490 | 47 | 3 | 9 / 0 |
| lite-headless | HANDOFF | 60 | 59.5 | 51 | 3618 | 54 | 3 | 0 / 0 |
| full-headed | ENTRY | 60 | 59.5 | 93 | 33460 | 93 | 3 | 0 / 0 |
| full-headed | ASSEMBLY | 59.7 | 59.5 | 103 | 34180 | 105 | 4 | 1 / 0 |
| full-headed | PRODUCT | 60 | 59.5 | 15 | 14994 | 105 | 4 | 0 / 0 |
| full-headed | HANDOFF | 60 | 59.5 | 102 | 38970 | 112 | 4 | 0 / 0 |
| balanced-headed | ENTRY | 59.2 | 30 | 63 | 12156 | 63 | 2 | 3 / 0 |
| balanced-headed | ASSEMBLY | 59.5 | 59.2 | 69 | 12372 | 71 | 3 | 1 / 1 |
| balanced-headed | PRODUCT | 59.7 | 59.2 | 15 | 5810 | 71 | 3 | 1 / 0 |
| balanced-headed | HANDOFF | 60 | 59.2 | 72 | 14162 | 78 | 3 | 0 / 0 |
| lite-headed | ENTRY | 60 | 59.5 | 42 | 3036 | 42 | 2 | 0 / 0 |
| lite-headed | ASSEMBLY | 59.7 | 59.5 | 45 | 3090 | 47 | 3 | 1 / 0 |
| lite-headed | PRODUCT | 60 | 59.5 | 14 | 1490 | 47 | 3 | 0 / 0 |
| lite-headed | HANDOFF | 60 | 59.5 | 51 | 3618 | 54 | 3 | 0 / 0 |
| chrome-balanced | ENTRY | 60 | 59.5 | 63 | 12156 | 63 | 2 | 0 / 0 |
| chrome-balanced | ASSEMBLY | 59.7 | 59.5 | 69 | 12372 | 71 | 3 | 1 / 0 |
| chrome-balanced | PRODUCT | 60 | 59.5 | 15 | 5810 | 71 | 3 | 0 / 0 |
| chrome-balanced | HANDOFF | 60 | 59.5 | 72 | 14162 | 78 | 3 | 0 / 0 |
| mobile-emulated | ENTRY | 60 | 59.5 | 42 | 3036 | 42 | 2 | 0 / 0 |
| mobile-emulated | ASSEMBLY | 59.7 | 59.2 | 45 | 3090 | 47 | 3 | 1 / 0 |
| mobile-emulated | PRODUCT | 59.7 | 59.5 | 14 | 1490 | 47 | 3 | 1 / 0 |
| mobile-emulated | HANDOFF | 60 | 59.5 | 51 | 3618 | 54 | 3 | 0 / 0 |

Headless Chromium 151 uses ANGLE SwiftShader (software Vulkan). Headed Chromium 151 and installed Chrome 153.0.8010.53 identify NVIDIA GeForce RTX 3060 / Direct3D11. Mobile-emulated is headed Chromium on that same GPU at 390x844 with coarse touch, device DPR 3 capped to render DPR 1; it is NOT a physical phone measurement. No physical mobile device or independent laptop/iGPU was available.

The original whole-route benchmark now measured 45 FPS with default Balanced (prior run ~6 FPS). Full software rendering remains ~6–12 FPS: no claim that Full meets the software-renderer target. Baseline first-frame timing started at scene construction, whereas the tier runs include lazy import, so those initialization measurements are not directly comparable.

Local first render return, headed Chromium: Full 1425ms, Balanced 616ms, Lite 389ms. Installed Chrome Balanced 532ms. Headless: Full 353ms, Balanced 179ms, Lite 207ms. These are single local observations, not network-load guarantees.

Validation: existing 126 tests, build and audit; five-width browser regression including keyboard, paths, attribution, static/reduced-motion and missing WebGL. Lifecycle checks confirm idle/offscreen stopping and wake. Native background visibility was not exposed by the automation environment; the hidden-event branch passed with simulated document visibility, explicitly not native proof.

Commands: set PLAYWRIGHT_MODULE to the existing Playwright installation; set BASE_URL to local or Preview; run `node docs/rd/foundry-performance-check.cjs`. Set TIER=full/balanced/lite, HEADED=1 for a visible browser, CHANNEL=chrome for installed Chrome, MOBILE=1 for touch emulation. Run `node docs/rd/foundry-browser-check.cjs` for regression and `node docs/rd/foundry-lifecycle-check.cjs` for lifecycle. Raw local outputs/screenshots remain in ignored output/.

Recommendation: CONTINUE R&D. Desktop evidence is now adequate to support the concept, but physical mobile, independent laptop/iGPU, native visibility and longer sustained-load measurements remain open. Do not integrate or deploy Production without owner approval.
