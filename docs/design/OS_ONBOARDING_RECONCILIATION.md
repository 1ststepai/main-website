# 1stStep OS onboarding: storyboard reconciliation

Status: Gates 0–4 reviewed on 2026-09-13. This is a local/preview implementation brief, not production authorization. Primary design authority: `docs/design/1ststep-os-onboarding-storyboard.png` in the outer `1ststep.ai` project (the storyboard is outside this website Git worktree). The canonical repository logo overrides the storyboard's drawn approximation.

## Gate 0 — authority and workspace safety: PASS

The deployable public-site repository is `main-website`. The observed baseline was branch `codex/reconcile-agency-site-20260910`, HEAD `6c2388737508b3e3ce5c395e102c577df47053dc`, equal to `origin/main`, in `C:/Users/evanp/Documents/Claude/Projects/1ststep.ai/main-website`. No tracked staged or unstaged changes existed. Untracked `.chrome-qa-admin/`, `.chrome-qa-admin2/`, `brand-proposals/`, `out/`, `tmp/`, and two `tools/visual-renders/*-og.html` files were left untouched. The other listed worktrees were two admin tasks and the prior public release; none showed overlapping `/os` ownership. This work uses a new isolated branch/worktree, `codex/os-onboarding-storyboard-20260913` in `main-website-os-onboarding-20260913`, from that exact baseline. No destructive Git operation is needed.

`AGENTS.md`, `docs/PUBLIC_SITE_AGENT_OPERATING_CHARTER.md`, `docs/architecture/decision-log.md`, `docs/BRAND_LOGO_USAGE.md`, and `docs/OS_MARKETING_PAGE.md` agree: this agent owns the public site and `/os`; the app Engineering Orchestrator owns `app.1ststep.ai`; app changes require a contract/handoff. The locked logo is `public/assets/firststep-logo-transparent-cleaned.png`, used intact. The current repository `/os` is a Vite multi-page public concept, not an authenticated OS. `origin/main` identifies the source baseline; the live production alias was not re-verified for this local-only task and is not inferred from Git.

## Gate 1 — current experience capture: PASS

Before implementation, desktop and 390px mobile screenshots were captured in the original repo's ignored `output/playwright/` directory: `os-before-desktop.png`, `os-before-mobile.png`, `os-before-full.png`, and `os-before-mobile-full.png`. They show the hero, four-path marketing section, illustrative Project Genome, capability explorer, Project OS file depiction, Discovery map, fictional audit readiness scorecard, business example, and local prompt preview. The site renders at `/os` from `os/index.html` through Vite's multi-page entry and Vercel rewrite. `os/os.js` contains the four hardcoded Genome examples, capability selector, animated illustrative build, and local four-intent result. `os/os.css` plus three supplemental OS stylesheets supply the existing navy/blue/cyan/violet tokens, responsive rules, and reduced-motion behavior. `src/site-analytics.js` supplies Vercel Analytics, UTM attribution, and `window.fsaiTrack`; the prompt text is not tracked. There is no existing `/os/start` router, onboarding state, repository connection, audit engine, or OS compiler to preserve.

## Gate 2 — storyboard gap analysis: PASS

Classification describes the current implementation and the smallest justified change. `BACKEND DEPENDENCY` and `PREVIEW ONLY` are product boundaries, not permission to simulate work as completed.

| Surface | Class | Current evidence and decision |
| --- | --- | --- |
| `/os` entry | KEEP / REFINE | Keep the strong technical hero, real logo, authority diagram, and marketing depth. Add an honest entry to an interactive preview. No homepage rebuild. |
| First decision / path router | RESTRUCTURE | Existing four lower-page links navigate to static sections; they do not change system state. Use five in-flow start choices as the first onboarding decision, including unsure. Keep the marketing rows. |
| New idea | RESTRUCTURE | Local text box exists at the page end but skips interpretation and state evolution. Reuse its privacy model, move the interaction into staged onboarding. |
| Existing build | RESTRUCTURE / PREVIEW ONLY | Marketing audit method and fictional scores exist; no user-specific baseline. Add a read-first path that never claims a scan. Keep the explanatory page sections. |
| Business automation | RESTRUCTURE / PREVIEW ONLY | Moving-company example is useful but static. Make the user's workflow answers update a visible conceptual process map; no execution or numerical ROI. |
| Growth / Discovery | RESTRUCTURE / PREVIEW ONLY | Discovery map is a useful visual primitive but does not respond to user answers. Show a user-specific, explicitly unmeasured Discovery state. |
| Unsure path | MISSING | Fifth decision needs freeform goal and deterministic route suggestion with user confirmation. |
| Project Genome | REFINE / PREVIEW ONLY | Keep the 12-field visual vocabulary. The four preset examples are marketing examples; onboarding needs its own state-backed, labeled signals. Do not infer a backend schema from this UI. |
| Capability activation | REFINE / PREVIEW ONLY | Keep the existing dormant/active language. In onboarding, active areas must recompute from confirmed answers, not hardcoded example clicks. |
| Recommendations | MISSING / PREVIEW ONLY | Add three preliminary, rule-based next directions with reason, confidence, source state, Accept/Change. No research claim. |
| Project OS reveal | RESTRUCTURE / PREVIEW ONLY | Existing illustrative file window belongs to marketing. Add a state-dependent proposed workspace preview; no claim that files were generated. |
| Repository connection | BACKEND DEPENDENCY | No OAuth, upload, provider, local analysis, or scanner exists. Render choices as planned/unavailable; do not solicit code or credentials. |
| Repository permissions | MISSING | Explain read-first scope and explicitly list write permissions not requested. Do not imply an actual permission request. |
| Existing baseline | BACKEND DEPENDENCY / PREVIEW ONLY | No repository facts are available. Capture user-stated project stage only; show repo/branch/commit/stack as unverified until a real connection exists. |
| Audit readiness | PREVIEW ONLY | Existing fictional 64/100 score is labeled. Do not turn it into a personalized score. Show an unassessed readiness framework and evidence gaps. |
| Next three steps | RESTRUCTURE / PREVIEW ONLY | Existing sample findings are generic and fictional. Offer three preliminary discovery/verification steps based on user's stated needs, never actual audit findings or remediation execution. |
| Business process mapping | REFINE / PREVIEW ONLY | Keep visual chain vocabulary; derive a labeled draft process hypothesis from the user's chosen workflow and label opportunities as unverified candidates. |
| Discovery Genome | MISSING / PREVIEW ONLY | Show stated channels as known-from-user and all metrics as unverified/needs connection. Existing marketing map remains. |
| Signup timing | MISSING / BACKEND DEPENDENCY | No OS project account/save endpoint. Give useful preview first; label persistence as planned rather than displaying an active signup CTA. Existing consultancy CTA remains a separate action. |
| Desktop | KEEP / REFINE | Existing two-column hero and panel craft work. New left conversation/right reactive system stage uses the same visual family. |
| Mobile | REFINE | Current marketing page stacks cleanly. Onboarding needs question → response → state → action, sticky progress, expandable Genome, full-width controls. |
| Motion | REFINE | Existing motion/reduced-motion utilities can support route and field activation. Avoid continuous decorative loops in onboarding. |
| Accessibility | KEEP / REFINE | Existing semantic sections, focus, and reduced-motion baseline are useful. Add keyboard-operable stage controls, live response announcements, explicit labels, and touch targets. |
| Analytics | KEEP / REFINE | Reuse `fsaiTrack` and attribution. Add event names for mode, stage, recommendation, and preview; never send freeform text, repository URLs, or personal data. |
| Truth boundaries | KEEP / REFINE | Existing concept labels are strong but isolated to the marketing page. Put AVAILABLE/PREVIEW/IN DEVELOPMENT/PLANNED at each consequential onboarding step. |

No current marketing section is removed. The only restructuring is the entry action and the local prompt's role: the old four-intent prompt remains a marketing preview and links to the new five-path flow. This avoids destroying useful explanatory work while fixing the missing cause-and-effect product interaction.

## Gate 3 — architecture plan: PASS

Routing: retain `/os` and all existing pages. Add one Vite HTML entry at `/os/start/` with internal state-driven stages and Vercel rewrites for slash and non-slash URLs. The 12 storyboard panels are narrative moments, not routes. `/os` links to the preview from its hero and final prompt; the existing informational entry-path anchors remain.

State: one ephemeral in-memory object stores `mode`, `stage`, `goal`, `goalConfirmed`, `answers`, question index, and recommendation decisions/changes. Pure functions derive interpretation, Genome signals (value + evidence state), active capabilities, preliminary recommendations, process hypotheses, Discovery state, and progress from those inputs. Connection and audit stages have no fabricated remote state. No browser storage or network submission of goal text; reload starts over. Browser history holds an in-memory snapshot key only, not freeform content. The contract is a replaceable front-end projection, not a permanent backend schema.

Reuse: canonical logo, OS CSS variables/font roles, existing button/panel visual language, Genome field names, capability names, audit dimensions, Discovery vocabulary, Vite entry/rewrite conventions, and site analytics. Extend `/os` links and documentation. Create only a small onboarding shell, deterministic state derivation module, and local CSS. Existing marketing widgets and animation are not retired or copied wholesale into the new route. No app-owned component or backend is touched.

Desktop: one prominent conversation panel left, one visibly reactive system panel right. Each answer yields an interpretation, changed Genome signals, capability activation, then the next meaningful question. Mobile: one dominant question, immediate response, compact live state, then action; progress stays visible and Genome details can expand. Content and controls work without animation.

Motion: short transforms/opacity and route/field highlights only after state transitions; pause when not relevant and remove via `prefers-reduced-motion`. Analytics: reuse `window.fsaiTrack` with enumerated stage/mode/action metadata only; never user text, URLs, project names, or inferred sensitive facts. Existing page view remains.

Backend boundary: repository connectors, permission grants, scans, immutable baseline capture, real readiness scoring, AI interpretation/research, compiled downloadable Project OS, account persistence, and remediation execution require later engineering. None is needed to deliver the labeled local preview. If any intended authenticated OS implementation is assigned to `app.1ststep.ai`, issue a contract to its Engineering Orchestrator instead of modifying that app here.

## Gate 4 — product truth review: PASS for a clearly labeled preview

| Capability | State now | Onboarding representation |
| --- | --- | --- |
| `/os` marketing page, local input handling, static examples, existing analytics | AVAILABLE | Existing site behavior; never called an operating project account. |
| Deterministic path suggestions, answer-driven Genome/capability state, preliminary recommendations, proposed workspace, user-stated process/discovery state | PREVIEW | Browser-local rule-based guidance, labeled at the relevant panel; no external research or AI call. |
| OS onboarding and audit product direction | IN DEVELOPMENT | Status copy, not a claim of live backend capability. |
| GitHub/other-provider connection, archive upload, repository scan, verified baseline, audit scoring, OS file compilation/download, saving an OS project, automation execution, Discovery measurement | PLANNED | Clearly unavailable; no fake connect/scan/save buttons or fictional user-specific scores. |

The preview cannot claim that 1stStep has inspected code, measured growth, found audit issues, generated documents, run an automation, or created an account. The only confirmed facts in its project state are user-provided answers; derived guidance is marked inferred or recommended. The gate passes because the narrative can be demonstrated without those claims or permissions. Production remains closed.

## Gates 5–10 — local acceptance record

- **Gate 5, implementation:** one state-driven `/os/start/` entry was added beside the retained `/os` page. The new browser-local flow covers all five starting paths, confirmable interpretation, four to six path-specific questions, reactive Genome/capability state, preliminary recommendations with Accept/Change, a proposed OS reveal, and a clearly unavailable provider/connection boundary. No app-owned or production system changed.
- **Gate 6, function:** `npm run check` passed all 100 tests and the Vite production build. Browser runs completed idea, existing-build, business, growth, and unsure paths. Back restored in-tab decisions; changing an earlier answer invalidated downstream acceptance; reload cleared the preview. `/os`, `/os/start`, and `/os/start/` returned 200 from the built local preview. The built route's interpretation interaction worked with zero browser console errors after localhost analytics used the package's development mode.
- **Gate 7, visual:** local ignored `output/playwright/` captures include `os-start-router-desktop.png`, `os-start-idea-input-desktop.png`, `os-start-genome-mid-desktop.png`, `os-start-recommendations-desktop.png`, `os-start-project-os-desktop.png`, `os-start-existing-connector-desktop.png`, `os-start-audit-next-steps-desktop.png`, `os-start-router-tablet.png`, `os-start-router-mobile.png`, and `os-start-mobile-mid.png`. These were compared with the 12-panel storyboard: numbered narrative, technical dark surfaces, cyan/blue state resolution, reactive right panel, recommendations, proposed files, and read-first audit path are present. Screenshots are local QA artifacts, not committed product imagery.
- **Gate 8, responsive/accessibility:** 1440px desktop, 768px tablet, and 390px mobile had no horizontal overflow. Mobile puts the answer and system state before the next question; the full Genome is keyboard-expandable and initially collapsed. Keyboard selection, visible focus, an announced state change, 44px Back target, reduced motion, and escaped user text were browser-checked. Measured primary/muted/status text contrast pairs on OS surfaces ranged from 7.32:1 to 17.15:1 for the sampled combinations.
- **Gate 9, performance/motion:** no package was added. The built onboarding JavaScript is 35.82 kB (12.38 kB gzip) and route CSS is 20.32 kB (5.20 kB gzip). Only progress and short state-resolution motion were added; reduced-motion media emulation returned `animation-name: none`. The entry did not use continuous particles or a heavy animation runtime.
- **Gate 10, independent review:** a decorative right panel, stale accepted guidance after editing, a misleading personalized audit score, accidental analytics capture of freeform text, and mobile action order were tested as failure hypotheses. The right panel changes from answers; stale decisions are cleared; no audit score is personalized; analytics events use enumerated metadata; and mobile places the action after the updated system view. Remaining product gaps are the planned backend connectors, verified baseline/audit, AI interpretation/research, saved account/project, OS compilation/export, and actual provider handoff. The retained four-intent marketing widget is still a separate quick illustration and now points to the five-path preview. It is not the new onboarding route.

Release status: **LOCAL/PREVIEW VERIFIED ONLY — PRODUCTION NOT AUTHORIZED**.

## 2026-09-13 — one-link first-look entry (later UX refinement)

Evan approved a separate OS backend direction and asked for a simpler website-or-GitHub entry, similar to a free first look. The prior five-path onboarding implementation and its Gates 0–10 evidence remain historical context, not a claim that a backend now exists. The current `/os/start/` opening accepts one public link, classifies website versus GitHub locally, strips URL query/fragment before presentation, and offers a visitor-initiated email draft. The five-path preview remains behind an accessible secondary choice. Entering a link performs no fetch, scan, connection, storage, or analytics transmission of the URL. A public GitHub link grants no private repository access. No audit result, score, or response time is promised. The future automated website and GitHub contracts are separated in `docs/architecture/OS_BACKEND_CONTRACT_PROPOSAL.md`; G1 backend implementation and production release remain closed.

Local checks for this refinement: `npm run check` passed; browser snapshots verified website and GitHub email-draft links, query/fragment stripping, the retained idea path, invalid local-address rejection, and 320/390/1280/1440px layouts without horizontal overflow. Final desktop/mobile captures are ignored QA files under `output/playwright/os-start-one-link-final-*.png`. No email was sent, backend run created, or production deployment made.
