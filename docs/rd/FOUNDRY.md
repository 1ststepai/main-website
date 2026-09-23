# The 1stStep Foundry — isolated concept

Base: e1c7c7696b08d9a47959d7f1be8be2c882b5cf39. Route: /foundry/.
Commercial homepage, intake, APIs, privacy, SEO and Studio are unchanged.

Original art direction: a segmented engineering chassis with labeled cassettes, mechanical iris, signal conductors and ownership tokens. Build docks scattered cassettes; Finish scans a fractured arrangement; Automate remaps offset tools around human control. The final transfer brings SOURCE, INFRASTRUCTURE, ACCESS, DATA, DOCUMENTATION and EVIDENCE toward OWNER. This is illustrative choreography, never a live build or diagnostic.

Three.js is lazy imported. Native scrolling supplies a normalized timeline; requestAnimationFrame interpolates transforms. No scroll interception or automated playback. Idle frames stop after settling. Hidden/offscreen scenes stop. DPR capped at 1.5 desktop / 1 mobile, with an economy tier after slow frames. Reduced motion skips the engine. WebGL failure preserves static SVG, copy and keyboard controls. User can select static view. Context loss also exposes fallback.

Asset provenance: product.webp is the existing first-party DaySetGo public demo capture, from https://www.daysetgo.ai/plan?mode=demo, captured 2026-09-22. 1440x1000 WebP, 96,102 bytes. Demo data is explicitly labeled, not customer activity. It is reused as an asset only; no prior cinematic implementation is reused. All geometry and label textures are procedural; no GLB or external scene asset.

References studied: https://lusion.co/ (3D storytelling/interaction philosophy) and https://activetheory.net/ (automated browser reported unsupported, so no complete visual inspection claimed). Original geometry; no copied reference assets.

Validation: npm test, npm run build, npm audit --audit-level=high. Browser script at docs/rd/foundry-browser-check.cjs uses an existing Playwright installation via PLAYWRIGHT_MODULE; BASE_URL selects local or Preview. Screenshots/results go to ignored output/. Tests exercise 1440/1280/768/390/320 widths, all intents, preserved attribution, keyboard progress, reduced motion without scene download, missing WebGL, runtime errors, and a four-second headless desktop scroll FPS observation. Headless FPS is not a hardware-device benchmark. Owner visual approval and physical mobile GPU testing remain required before any homepage adoption.
