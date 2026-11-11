# Official logo blue — local verification, 2026-11-11

Owner: Evan; implementation: Codex. Branch: `site/conversion-polish`, baseline `291d96a`. Existing draft PR #84 only; no merge or production deployment.

- Primary accent: `#007BF8`. Primary filled controls: `#006EEC` (documented official-logo pixel) with `#FFFFFF`, WCAG contrast **4.728:1**. White on `#007BF8` is **4.047:1** and was rejected. Cream `#F3F4F0` replaces lime on quieter text, charts, chrome and decorative effects. Card bottom bar and focus affordances use the primary accent.
- `npm run check`: root tests **220 passed, one skipped**; social MCP **44 passed**; Vite build passed. No lint/typecheck scripts exist. Existing separate scene chunk >500 kB warning remains. No test assertions needed color updates. A final build also covers removal of hover brightness filters from booking and Journey.
- Chromium/Playwright: 13 public routes × 320/390/768/1280/1440 widths, **65 combinations**, no document horizontal overflow. Computed filled primary controls render white on `rgb(0,110,236)`; secondary controls stay cream/transparent. Targeted homepage, booking and Journey hover checks retain that pair with no brightness filter. `results.json` records route, width, colors and booking navigation.
- Visually reviewed full desktop/mobile homepage, card and booking screenshots; layout/copy retained, no lime wash or replacement blue glow. Lazy content scrolled into view before final capture. Third-party calendar does not show usable slots in this local environment; the exact iframe URL and direct-calendar fallback are preserved. No booking submitted.
- Homepage hero booking click reaches `/book/` and exact calendar ID `Rb4aqLM1NdU5kvZcqNmj`. Logo and `og-home-v3` bytes, prices, copy, illustrative-data labels, APIs, lead handling, PostPath, Studio/admin and standalone demo sources remain unchanged. Public inherited Journey/OS/tools styles included to remove residual lime.
- State: locally verified, preview verification pending branch integration. Existing PR baseline already had a SonarCloud duplication failure; this is separate from passing local checks. Production remains untouched; rollback is a revert of this accent commit.

## Changed implementation/decision files

- `app-idea-viability-checker.html`
- `book/confirmed/index.html`
- `book/index.html`
- `campaigns/morris-county-free-website/index.html`
- `campaigns/outgrown-website/index.html`
- `docs/architecture/decision-log.md`
- `index.html`
- `journey/journey.css`
- `os/os-details.css`
- `os/os-expanded.css`
- `os/os-positioning.css`
- `os/os.css`
- `privacy.html`
- `public/legal-pages.css`
- `public/service-pages.css`
- `services/app-builds.html`
- `services/internal-tools.html`
- `services/mvp-builds.html`
- `services/revenue-systems.html`
- `services/websites.html`
- `src/card.css`
- `src/commercial-intake.css`
- `src/conversion-polish.css`
- `src/home-v2.css`
- `src/home-v3.css`
- `src/integrations.css`
- `src/motion.css`
- `src/v2-site.css`
- `startup-launch-checker/index.html`
- `terms.html`
- `tools/auto-model-router/index.html`
- `tools/index.html`
- `tools/tools-shelf.css`
