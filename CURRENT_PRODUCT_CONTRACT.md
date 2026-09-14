# 1stStep.ai Current Product Contract — convergence release

**Authority and date:** Evan's 1stStep.ai Convergence & Release Program, reconciled 2026-09-13 ET. This is the single implementation contract for the current convergence milestone. `AGENTS.md`, the public-site operating charter, accepted architecture decisions, app-orchestrator records, security rules, and release gates retain their governing authority. Historical prompts and proposed architectures are evidence, not additional active scope. Update this contract only when evidence or an owner decision changes a row. No statement below authorizes Production deployment.

## Finish Mode Ship Board — 2026-09-14

**Journey A local candidate update (2026-09-14):** Evan approved the OS website/GitHub path for the first real on-page scan. The local public-site candidate now fetches one public HTML response or GitHub public repository metadata and returns only source-backed observations and a bounded next step. This is a public-source first look, not the connected Free OS Audit, a pinned repository baseline, a saved Project, or a release claim. Hosted behavior and production authorization remain unknown/pending. Historical inventory rows below describe earlier source snapshots and do not establish that this new slice is deployed.

**Approved visual/interaction direction:** The public homepage now leads with “AI made starting easy. 1stStep helps you finish,” a direct `/os/start/` preview CTA, and an interactive **illustrative** OS workflow. This is the approved Public/OS storytelling layer, not permission to claim a connected repository, running audit, deployed OS, live agent, or passed release gate. The separate consulting **Begin Your Journey** path remains visible and retains Journey C's full receipt/storage contract. The canonical logo stays unchanged. This direction does not change the hosted, independent-audit, or Production gates below.

**SHIP TARGET:** Ship the public 1stStep.ai + 1stStep OS experience with three distinct journeys. A (existing builder) reaches `/os/start/`, enters a project locator, and receives only a truthful first-look preview and appropriate next action; no connected audit or saved Project is claimed. B (new builder) receives answer-derived Genome and recommendations within the clearly labeled browser-local preview; no account or return persistence is claimed. C (consulting lead) completes Begin Your Journey, receives a useful answer-derived diagnosis, explicitly requests contact, and returns to the browser-local result; the contact request must be durably recorded and available to the authorized operator. The complete Free OS Audit, account-backed Project persistence, and automatic OS spin-up remain blocked by their owner/data/evidence gates. The first external release may expose A/B only as honest previews after hosted verification, while C's receipt and storage path must pass its full contract. No mail-client draft is a receipt.

**DEFINITION OF DONE:** Exact-source Preview passes the seven steps below on desktop and mobile, including refresh/return, validation, duplicate submission, storage failure and consent paths; the contact record is encrypted, retained under an explicit policy and accessible only to authorized admin; attribution excludes private answers; independent review covers the release-critical trust boundaries; analytics and browser console/network are checked; the exact release candidate and rollback are recorded. Only then report **RELEASE READY — AWAITING PRODUCTION AUTHORIZATION**. Production remains a separate explicit decision.

### Public/OS Release Train — source reconciliation, 2026-09-14

This is the integration queue for the **public/OS-owned** candidate only. `main` means the GitHub `1ststepai/main-website` `main` ref, not a local checkout with an old `main` branch. A branch's clean build does not establish hosted behavior, independent release audit, or Production authorization. App-family and DaySetGo release queues belong to their separate engineering authorities; public `/admin` may consume their read-only status when they publish it. The public Loop may prepare a candidate and its exact-source Preview, but merge and Production promotion still follow their review and approval gates.

| Project | Candidate | SHA | Source | Test status | Audit status | Integration status | Preview | Prod | Disposition / next promotion |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `1ststep.ai` / `/os` / `/os/start` | Canonical `main` | `6c238873` | GitHub `main` | Historical deployment build READY; current journey proof incomplete | Release audit UNKNOWN | Canonical Git source | — | Git-sourced `dpl_AxSUnJyUJaNqqq6WxNQ8ukcvxKT2` at `6c238873` | `PRODUCTION_DEPLOYED`; `/os/start/` returns 404, so the new OS preview is not live. |
| Public Journey + OS onboarding, [PR #5](https://github.com/1ststepai/main-website/pull/5) | `codex/public-launch-release-20260913` | `e901cd36` | Clean branch; draft PR | 105 local tests/build reported; GitHub verify, Sonar and Vercel checks PASS at this SHA | Independent release audit UNKNOWN | Open, unmerged | Git-sourced `dpl_9gConRrnvKHTWo6m2cBScH9A97As`; SSO redirects unauthenticated probes | `6c238873` | `DEPLOYED_PREVIEW`; hosted Journey C and retention/storage decision block promotion. |
| Journey return + OS storytelling + exact legacy review proof | `codex/public-os-storytelling-20260914` | `86e53f9d` | Clean descendant of PR #5; contains `7f3b891` | `npm run check` PASS locally on 2026-09-14 | No independent release audit | Six commits beyond PR #5; not on `main` or PR #5 | No exact-SHA Preview verified | `6c238873` | **STRANDED VERIFIED WORK**: `READY_TO_INTEGRATE` into the isolated public train candidate, subject to combined verification. |
| Read-only Command Center + public Ship Mode telemetry | `codex/studio-idle-telemetry-20260914` | `9517590d` | Clean branch; includes the public admin projection `1b854e1` | 111 tests/build PASS locally on 2026-09-14 | No independent release audit | Not on `main` or PR #5 | No exact-SHA Preview verified | `6c238873` | **STRANDED VERIFIED WORK**: `READY_TO_INTEGRATE` into the isolated train candidate; hosted publisher remains unconnected. |
| Combined public integration candidate | `codex/public-release-train-20260914` | Pin after commit | Isolated branch from `86e53f9d` integrating `9517590d` | Combined 120 tests/build PASS locally; exact SHA must be rechecked after commit | Milestone release audit pending | Not merged to canonical `main` | Git-sourced Preview pending | `6c238873` | `READY_TO_INTEGRATE` into review; then exact-SHA Preview and hosted verification. No automatic Production action. |

Transition rule: accepted scope and owner → deterministic verify → `READY_TO_INTEGRATE` → conflict-safe integration candidate → Git-sourced exact-SHA Preview → hosted journey and trust checks → independent milestone/release audit → canonical PR merge with recorded merged SHA → `PRODUCTION_READY` with known last-good target, rollback and migration review → explicit owner Production approval → deployment and exact-source Production smoke. Failed checks return to remediation; a stale or unknown source cannot be certified. Retain dirty/unique worktrees until an owner marks them merged, superseded, abandoned, or evidence-only; do not delete them during reconciliation.

Status vocabulary in each evidence column: `PASS | FAIL | BLOCKED | NOT IMPLEMENTED | UNKNOWN`. A source implementation or HTTP 200 never upgrades Hosted or Audit to PASS. This table tracks C's contact-path release gate; the A/B evidence matrix below tracks the separate OS preview and full-product boundaries. Journey D belongs to the external App Product Family and is not this lead's implementation Ship Board.

| # | Production journey step | Implementation | Automated test | Hosted verification | Independent audit | Blocker | Owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Stranger reaches homepage and understands systems consultancy versus OS/Job Agent | PASS | PASS | UNKNOWN | UNKNOWN | Rendered conversion/CTA proof at exact source | Public-site lead |
| 2 | Opens `/journey/` and completes six validated answers | PASS | PASS | UNKNOWN | UNKNOWN | Desktop/mobile keyboard and error-path proof | Public-site lead |
| 3 | Receives truthful first-pass diagnosis and relevant next action | PASS | PASS | UNKNOWN | UNKNOWN | Exact hosted behavior and no audit claim | Public-site lead |
| 4 | Explicitly opts in and submits a contact request | PASS | PASS | UNKNOWN | UNKNOWN | Preview needs storage configuration and browser success proof | Public-site lead |
| 5 | Lead and minimal attribution persist with duplicate/failure safeguards | PASS | PASS | UNKNOWN | UNKNOWN | `SHIP-P0-01`: no KV variables in Preview/Production | Public-site lead |
| 6 | Authorized operator can retrieve request; unauthorized user cannot | PASS | PASS | UNKNOWN | UNKNOWN | `SHIP-P0-01`: hosted admin readback not proved | Public-site lead |
| 7 | Visitor returns to diagnosis and sees honest request status | PASS | PASS (local VM return/clear) | UNKNOWN | UNKNOWN | `SHIP-P1-02`: hosted rendered return and clear proof missing | Public-site lead |

**JOURNEY: 0 / 7 PASS** at hosted-and-audited release level. Source/test PASS in rows 1–3 is narrower evidence. Live `https://1ststep.ai/`, `/journey/`, `/os/` and `/admin/` returned HTTP 200 on 2026-09-14; `/os/start/` returned 404. The serving Production deployment identifies Git `main` at `6c238873`, but the seven-step rendered journey and independent audit remain unverified.

**A/B preview release checks (separate from the full Free Audit and saved-Project milestones):**

| Journey | First external-release check | Local source/test | Exact hosted verification | Status |
| --- | --- | --- | --- | --- |
| A | Homepage → `/os` → existing-project `/os/start/` first look gives a truthful locator-derived next action without claiming connection, audit or save | PASS | UNKNOWN (`/os/start/` live 404 at last check) | BLOCKED |
| B | Homepage → `/os` → idea `/os/start/` gives answer-derived Genome and recommendations labeled browser-local preview | PASS | UNKNOWN (`/os/start/` live 404 at last check) | BLOCKED |
| A/B | Navigation, mobile/accessibility, return/reset semantics and preview limitations are verified at exact candidate | PARTIAL | UNKNOWN | BLOCKED |

**A/B PREVIEW: 0 / 3 PASS** at hosted release level. Full A/B account-backed persistence and evidence-backed free audit remain NOT IMPLEMENTED; these preview checks do not substitute for them.

| Priority | Blocker | User Journey Step | Owner | Next Action | Acceptance Test | Status |
| --- | --- | --- | --- | --- | --- | --- |
| P0 | `SHIP-P0-01` Lead consent, privacy, encrypted durable storage and admin-only read boundary | 4–6 | Public-site lead + Evan for storage provider | Review local security evidence; approve/configure a protected KV destination for Preview and Production; run hosted denial/readback | Consent, idempotency, distributed rate limit, encryption, admin denial and retention pass at exact hosted SHA | BLOCKED |
| P1 | `SHIP-P1-01` Journey contact request and truthful receipt | 4–5 | Public-site lead | Finish browser success proof against configured Preview, including network failure | Persisted receipt from real server; failed request retains answers and shows no success | BLOCKED |
| P1 | `SHIP-P1-02` Return to useful result | 7 | Public-site lead | Repeat return/clear in an exact-source hosted browser and verify receipt status | Refresh and return recover result; clearing browser data removes it; no server-side Project claim | BLOCKED (local test PASS) |
| P1 | `SHIP-P1-03` Exact-source hosted and independent release proof | 1–7 | Public-site lead + independent reviewer | Build Preview from final SHA; verify mobile, auth, errors, analytics and release gate | Seven hosted steps and trust-boundary audit PASS; rollback identified | BLOCKED |

**Active stream allocation (maximum three for this lead):** (1) public website and consulting Journey; (2) public `/os` and `/os/start/` convergence; (3) minimum Audit/Command Center infrastructure required to operate those journeys. App-family First Real User work is an `EXTERNAL DEPENDENCY — APP PRODUCT FAMILY`, owned by its Engineering Orchestrator; it consumes none of this lead's implementation slots. Live agent counts are UNKNOWN; open worktrees are not active-agent proof. Growth, Sales, Opportunity, advanced Command Center, agency and speculative OS features remain LATER. The older app PR and public PR inventory below are point-in-time evidence, not current open-PR claims.

**Local evidence this cycle:** The six-answer browser path produced the correct first-pass diagnosis and survived a reload at 390px width. A missing local API produced no success receipt and preserved the answers; a technical JSON error was then replaced by a plain-language failure message. Focused intake/authorization/encryption/idempotency/fail-closed tests and Vite build passed. The real hosted write/read path and independent review remain UNKNOWN. `vercel env ls` showed `FIRSTSTEP_DATA_ENCRYPTION_KEY` and admin secrets but **no `KV_REST_API_URL` or `KV_REST_API_TOKEN` in Preview or Production**; do not treat the existing admin workspace or App Idea Checker as durably stored there without further evidence.

**New local proof:** `test/journeyReturn.test.js` executes the real Journey script in a controlled DOM/storage context, completes the six answers, reloads into the saved diagnosis, checks the answer-derived recommendation, clears storage and verifies a blank return. The full 1stStep.ai check passed after dependencies were installed. Engineering OS WorkItem `SHIP-P1-02-LOCAL-TEST` and AuditJob `e308c419-a611-4eaa-9caf-aca70a576bf9` closed this bounded deterministic criterion on candidate `4223788593ffee78ccd29c9dacbfebd3f3042247`; `SHIP-P1-03-REVIEW` was assigned next. This is not rendered hosted proof or an independent release audit, and later Ship Board documentation commit(s) require exact-source revalidation before promotion.

**Owner decisions:** The narrow Journey implementation is locally reversible. For hosted contact persistence, Evan must approve the exact protected storage provider/account and 90-day retention/PII boundary before credentials are provisioned. OS G1 persistence, app résumé/billing choices and Production promotion remain separate decisions at their gates. Never expose or copy provider credentials into this board.

### Supporting baseline and future journeys

The following 2026-09-13 convergence snapshot is retained for provenance. Its older `REQUIRED FOR CURRENT RELEASE` classification is superseded by the Finish Mode Ship Target above. A/B full persistence and Free Audit remain future gated milestones; D is external app-family status only. No row below silently expands this first Ship Target.

**Milestone:** A new user completes the applicable journey without manual rescue; correct state survives return; failures and unknowns are honest; security and attribution hold; an independent auditor can reproduce the result. A local build, an HTTP 200, or source code alone does not meet this milestone.

## Historical reconciled scope

| Class | Governing requirement |
| --- | --- |
| REQUIRED FOR CURRENT RELEASE | Public consultancy proposition and working Begin Your Journey lead path; distinct existing-builder and new-builder OS paths with truthful labels and durable state before claiming they are complete; one exact-source, hosted, audited first-user app path under the app Engineering Orchestrator; deterministic-first, provider-neutral independent audit routing so Claude quota does not block eligible source review; responsive/accessibility/security/analytics checks for released paths; minimal read-only admin evidence needed to see leads and gates. No simulated audit, connection, saved Project, generated OS, or agent activity. |
| REQUIRED NEXT | Dedicated OS owner and approved identity/persistence boundary; narrow real Project/Genome persistence; permissioned read-only baseline and evidence-backed, zero-metered-AI-cost free audit; OS compilation only after real inputs; verified internal handoff/observability contracts. These are prerequisites to a complete A/B release, not permission to portray the current preview as live. |
| LATER | Growth/Opportunity/Sales Engines, advanced Jarvis, Model Router, advanced agent performance, due-diligence product, public audit badges, referrals, autonomous Command Center, new marketing experiments, speculative agents, optional specialist agents without evidence. Prior approvals are preserved as direction, not active work. |
| SUPERSEDED | Treating `/os` as only a prompt generator; treating a local onboarding preview, one-link email draft, fixture audit score, static agent cards, or `mailto:` as a connected/saved/audited product; using the previously discussed launch-everything scope as the current implementation queue. The user has replaced that queue with this convergence program. |
| CONFLICTING — OWNER DECISION REQUIRED | G1 separate OS backend direction is approved, but backend owner, platform/identity, retention/privacy, portfolio placement and the unseen end of G1-C remain unresolved; Audit foundation ratification conflicts in its own records. No implicit selection or implementation. App AUD-022 résumé legacy-selection policy and AUD-019 paid-entitlement continuity need their stated owner decisions at their gates. |

**Ownership:** This public-site agent owns `1ststep.ai`, `/os`, `/os/start/`, Begin Your Journey, public UI and public-site release verification. The app Engineering Orchestrator owns `app.1ststep.ai`, `resume.1ststep.ai`, `partners.1ststep.ai`, app identity/data/extension and app releases. The root 1stStep OS and Audit foundations have their own stated authorities; this document does not transfer them. Cross-system changes require contracts and handoffs. Preserve the canonical `public/assets/firststep-logo-transparent-cleaned.png` artwork and brand usage rules.

## Exact authority and surface inventory

Point-in-time source evidence, not a claim of deployment parity:

| Repository / surface | Branch and commit or source state | Functional classification and evidence |
| --- | --- | --- |
| Main website release worktree, `main-website` | `codex/public-launch-release-20260913` fast-forwarded from `a89fa4d4b9733ae8f527d28809f4ebde91dfd66c` through OS/documentation commit `a87071edcf52fda79ba8ff6aedd06fb7b668eb94` | Public source candidate now contains `/os/start/`. `npm run check` passed 101 tests and built `dist/os/start/index.html`; local Playwright navigation and one-link first-look state passed. Homepage, `/os`, `/journey/` and `/admin` each returned HTTPS 200 on 2026-09-13; live deployment-to-Git SHA and full rendered browser behavior are UNKNOWN. No open `main-website` PR was returned by `gh pr list`. |
| OS/onboarding worktree, same `main-website` repo | `codex/os-onboarding-storyboard-20260913` at `a87071edcf52fda79ba8ff6aedd06fb7b668eb94`, now an ancestor of the release candidate | `/os/start/` is PREVIEW ONLY in source: five paths, answer-derived Genome/recommendations, one public-link human first-look email draft. State is in memory and clears on reload. No connection, audit, save, account, or OS artifact. Prior local rendered QA exists in `docs/design/OS_ONBOARDING_RECONCILIATION.md`; the release worktree's local first-look browser path passed. No hosted proof exists. Live `/os/start/` returned 404. |
| Admin worktree, same `main-website` repo | `codex/admin-command-center-20260913` at `28e307a3d04006a31e5a3560fb6764dd41f17f8d` | PARTIAL local read-only Command Center with protected API, audit-capacity projection and UNKNOWN telemetry fallbacks. Local tests/build pass; live `/admin` returned 200, but equivalence to this branch and live feed operation are UNKNOWN. |
| Ecosystem Engineering OS infrastructure | `codex/audit-router-convergence-20260913` at `afab4a5870189da7a76d32b244f88fd1d289b222` | Local durable AuditJob, deterministic-first free routing, Claude escalation queue and role mailbox handoff; 34 synthetic tests pass. No live OpenRouter candidate call, shared state deployment, active loop subscriber or hosted admin publisher was verified. This is independent engineering-audit routing, not the customer-facing Free OS Audit engine. |
| App-family repository `1ststep-resume` | Agent OS worktree `codex/job-agent-engineering-os-20260912` at `8fa839297246ed48e6aff91cb4668c83ae6d59eb`; app release PR #80 at `b071371d80c90ca78213cbac9d604789ea4b96fc`, open | App homepage WORKING as public shell (HTTPS 200); signed Job Agent journey BLOCKED. Cycle 2 independent audit: local PASS WITH FINDINGS, hosted BLOCKED, Production NOT AUTHORIZED. Several fixes are isolated/unintegrated; authenticated exact-SHA Preview and two-tenant proof absent. Resume public shell PARTIAL/old conditional result with current parity UNKNOWN; authenticated résumé authority BLOCKED. Partners public shell responds 200; operational partner lifecycle BLOCKED. These are app-orchestrator handoff findings, not public-site implementation assignments. |
| Root `1stStep OS` folder | Not a Git repository; `PROJECT.md` calls it foundation/pre-implementation | PARTIAL specification/scaffold, no proven hosted OS application, persistent customer Project, or real generation workflow. |
| Root `1stStep OS Audit` folder | Git-initialized unborn `main`, no committed HEAD; files untracked | PARTIAL foundation/schema/fixture validator. No scanner, sealed baseline store, customer audit engine, or accepted scoring gate. Free audit method specified but not validated end-to-end; zero-metered-cost gate NOT_EVALUATED. |
| `resume.1ststep.ai`, `partners.1ststep.ai` live | App-family authority | Both returned HTTPS 200, which proves reachability only. Authenticated/current functionality and exact deployed source remain UNKNOWN or BLOCKED as above. |

Public HTTP probes used `curl -L` against the eight named URLs on 2026-09-13 ET. HTTP alone does not establish rendered usability; a current live rendered browser pass could not be completed in this reconciliation. The prior local onboarding browser evidence is historical and is not substituted for hosted proof. No exact Git-sourced Preview for these current public branches was verified.

## Canonical journey matrix

Status vocabulary is strictly `PASS | FAIL | BLOCKED | NOT IMPLEMENTED | UNKNOWN`. `PASS` means the narrow row behavior has direct evidence, never that the entire journey is released. Automated-test and hosted-proof cells say exactly what is known.

| Journey | Step | Implementation | Automated Test | Hosted Proof | Status | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| A existing builder | Understand consultancy/OS and choose existing build | Public homepage and `/os` source; local release candidate includes one-link start | `npm run check` 101/101 and local first-look Playwright navigation | Homepage and `/os` HTTP 200; current CTA-to-start route not proven | BLOCKED | Live `/os/start/` 404; no exact hosted candidate proof |
| A | Enter website or GitHub link | Local URL normalization and email draft in release source | Unit/local browser evidence, including release-worktree Playwright first-look state | No hosted `/os/start/` | BLOCKED | Route absent live; no backend collection |
| A | Appropriate onboarding and stated Genome | Five in-memory paths; user-stated Genome, no repository facts | Local unit/browser evidence recorded at earlier commit | None at exact candidate | BLOCKED | No hosted exact-SHA evidence |
| A | Evidence-backed strengths, weaknesses, risks and priorities | No real connector, baseline or engine | Method/foundation tests only; no real-project acceptance | None | NOT IMPLEMENTED | G1 closed; Audit method unvalidated |
| A | Honest recommendation/next action | Preliminary answer-based preview and human email option | Local tests recorded | No hosted flow | BLOCKED | Recommendations cannot be called audited or ready |
| A | Create/save Project and return to it | No OS backend/account | None | None | NOT IMPLEMENTED | G1 owner, identity, persistence, privacy decisions |
| B new builder | Navigate site → `/os` → idea path | Public concept and local five-path OS candidate | Local onboarding tests/screenshots recorded | `/os` HTTP 200; `/os/start/` 404 | BLOCKED | Current route not deployed |
| B | Freeform goal, interpretation, adaptive questions | Deterministic in-memory preview | Unit/browser checks recorded, not exact hosted proof | None | BLOCKED | Source candidate only |
| B | Genome evolution and preliminary recommendations | Derived from answers, labeled preview | Unit/browser checks recorded | None | BLOCKED | No hosted full-path test |
| B | Proposed Project OS | Illustrative modules/files explicitly NOT GENERATED | Local review | None | NOT IMPLEMENTED | No compiler or authorized backend |
| B | Save/create, leave, return, continue | In-memory snapshots only; reload clears | No persistence test can pass | None | NOT IMPLEMENTED | G1/persistence boundary |
| C consulting lead | Understand systems/automation consultancy | Homepage source and live content | Site checks previously passed | Homepage HTTP 200; live render/analytics unverified | UNKNOWN | Current rendered conversion verification |
| C | Begin Your Journey and complete six-question diagnosis | Public `/journey/` with deterministic local result | Prior website test/build; no current hosted E2E | `/journey/` HTTP 200 | UNKNOWN | Current browser journey proof |
| C | Receive useful, truthful result and next action | Local diagnosis, user-controlled `mailto:` and copy | Source behavior inspected | Live user action not verified | UNKNOWN | Browser behavior and email-client outcome |
| C | Lead and source/attribution persist | Journey JS has no submission/persistence path; email is visitor initiated | None | None | NOT IMPLEMENTED | Narrow secure lead intake, consent and attribution storage |
| C | Lead visible in correct admin system | No journey lead record/lookup contract | None | None | NOT IMPLEMENTED | Intake storage/admin integration |
| D app family | Real sign-in and session | PR #80 candidate source, not accepted integration | Local browser suite 40/42 on one candidate; obsolete Clerk fixture | Exact signed Git Preview unverified | BLOCKED | AUD-002/017/025 and owner-controlled auth evidence |
| D | Supported ATS capture exactly once | Candidate and isolated identity fix | Local tests only | No signed two-capture receipt | BLOCKED | AUD-001; integration and hosted proof |
| D | Refresh and My Jobs historical/current identity | Candidate plus isolated multi-run fix | Focused tests, no full integrated green suite | No signed two-run proof | BLOCKED | AUD-026; isolated fix integration |
| D | Explicit résumé authority and package preparation | RESUME-001 local candidate; owner selection policy open | Source/local PASS WITH FOLLOW-UP | No hosted signed package proof | BLOCKED | AUD-005/007/021/022; owner decision |
| D | Package review | PR #80 controls | Full signed-path test incomplete | None | BLOCKED | Exact candidate and hosted review |
| D | Sign out/in persistence and second-account isolation | Auth/data contracts and source paths only | No accepted hosted two-tenant denial | None | BLOCKED | P0 auth/data/tenant gates |

**Journey counts (strict current release evidence):** A 0/6 PASS, B 0/5 PASS, C 0/5 PASS, D 0/6 PASS. This intentionally does not convert local preview checks or HTTP reachability into end-to-end PASS.

## Top 10 convergence blockers

| Rank | Priority | Blocker | Owner / first closure evidence |
| --- | --- | --- | --- |
| 1 | P0 | App exact signed identity, session lifecycle and two-tenant isolation not verified | App Orchestrator; Git-sourced exact-SHA Preview, auth lifecycle and denial proof |
| 2 | P0 | App real capture and résumé facts can misbind/skip authority; isolated fixes not integrated | App Orchestrator; AUD-001/005/007/021/022 reconciliation and independent re-audit |
| 3 | P1 | OS backend identity, owner, privacy/retention and Project persistence G1 closed | Evan + appointed OS owner; recorded G1 decision then narrow implementation |
| 4 | P1 | Live `/os/start/` is 404 though the flow is now integrated locally | Public-site lead; exact Git Preview, browser proof, audit, approved release |
| 5 | P1 | No real read-only baseline, evidence-backed audit or validated zero-metered-cost free lane | OS/Audit owners; sealed self-audit, unlike-project regression, cost gate |
| 6 | P1 | Consulting Journey lead and attribution are not durably recorded | Public-site lead; secure minimal intake and admin readback, failure proof |
| 7 | P1 | App PR #80/five fixes lack clean full-suite integration and exact hosted attribution | App Orchestrator; clean integration, passing suite, independent audit |
| 8 | P1 | New-builder Project OS is illustrative only; no saved continuation | OS owner; persisted Project/Genome, real compiler and return test |
| 9 | P1 | Independent audit routing is only locally verified; no configured shared state, live free-provider proof or active loop subscriber | Ecosystem Lead; approved public-source policy, content-free live smoke, runtime entrypoint and mailbox acknowledgment proof |
| 10 | P2 | Public/admin rendered, mobile, accessibility, analytics and protected telemetry paths lack exact hosted proof; minimal admin remains isolated from this release | Public-site lead + feed owners; exact-SHA browser/network/analytics evidence and protected integration |

P3 visual polish remains frozen while these P0/P1 rows are open.

## Three active implementation streams and handoffs

These are the **three permitted allocations**, not a claim that three runtimes are currently working; a live agent census was not verified. (1) Public website + onboarding convergence, this agent. (2) App First Real User convergence, the existing app Engineering Orchestrator/Loop/Auditor. (3) Audit/OS/minimal observability foundation, appointed OS/Audit owners as decisions permit. Growth/Opportunity/Sales work is `LATER` and must not open a fourth stream. The app team receives Journey D and findings as a contract; this public-site agent does not edit app files.

## One owner decision list

| Decision | Recommendation | Why / blocked work | Default if deferred |
| --- | --- | --- | --- |
| Appoint OS backend owner and approve platform/identity/privacy/retention for narrow Project persistence (G1) | Dedicated OS authority/backend per approved G1-A direction; decide exact identity and retention before collecting project data | A/B saved return and baseline/audit are blocked | Keep preview labeled, collect no private repository data, no backend work |
| G1-B first-party portfolio placement and G1-C pattern-use policy | Verify each first-party owner; internal-only reviewed patterns initially | Registry/import and reuse across projects blocked; G1-C source ends mid-sentence | No import, no cross-project pattern publication |
| App AUD-022 unselected legacy résumé policy and bound AUD-021 pre-generation review | Require explicit version selection or explicit legacy review, never silently pick | App hosted package acceptance | Keep release blocked; app team can continue unrelated tests |
| App AUD-019 paid-entitlement continuity | Preserve authoritative legacy billing until provider evidence and owner choice | Any app deployment beyond isolated free Preview | No paid release or migration |
| Consulting intake privacy and destination if existing public-site delivery contract cannot satisfy it | Minimal consented server-side lead record with source/landing metadata and protected admin readback | C end-to-end persistent lead | Keep `mailto:` honest; do not claim captured lead |
| Private-source external auditor policy | Keep OpenRouter free pool blocked for private source; review any exact third-party endpoint and its terms before approval | Private-repository automated reasoning audit | Deterministic/local checks and safe work continue; high-risk judgment remains queued |
| Production promotion | Review exact candidate, gates, audit, rollback after all applicable rows pass | Production release | No deployment |

## Exact execution order and release gate

1. Freeze this matrix and preserve current branches/worktrees. The `/os/start/` candidate is integrated into the clean local release source; checks and local first-look navigation passed. Obtain exact Git Preview/browser proof when deployment is authorized. Do not expose Preview features as automated Audit or saved OS.
2. Public-site stream closes C's minimum secure lead/attribution/admin persistence path, then runs full desktop/mobile/keyboard/error browser E2E. If the intake destination/privacy choice is genuinely new, carry the above decision while doing non-blocked work.
3. In parallel, configure and verify the locally implemented Audit Router on an approved shared state path, prove eligible free-provider execution with a content-free/public synthetic packet, and connect active Loop-cycle inbox ingestion. Keep private packets off the changing free pool. Under its own authority, the app Orchestrator closes P0 auth/tenant/capture/résumé proof, integrates audited isolated fixes at exact PR head, and runs the signed first-user journey on an attributable Preview; return its audit state here as a contract.
4. After G1 owner decisions, OS/Audit owners implement the smallest real Project/Genome persistence and read-only baseline slice. Validate an independently reviewed self-audit and a distinct project before claiming free audit; pass zero-metered-cost and coverage gates before publishing results.
5. Converge A/B on saved return and truthful audited/generated output; integrate only the minimum protected admin visibility needed for these release rows. Verify analytics, responsive/accessibility/security, exact Preview, independent audit, and rollback.
6. Report **RELEASE READY — AWAITING PRODUCTION AUTHORIZATION** only after clean exact source, full journey tests, hosted proof and independent audit. Production deployment requires separate explicit approval, followed by live verification.

**Current release status: BLOCKED.** No canonical journey has complete hosted proof; no Production deployment is authorized by this contract.
