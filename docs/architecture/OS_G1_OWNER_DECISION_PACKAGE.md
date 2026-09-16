# 1stStep OS G1 owner decision package

**Status:** Evan approved G1-A **Option A's separate OS backend direction** in the current conversation. **G1 remains CLOSED for implementation** until an actual OS backend owner and platform/identity authority are recorded and remaining G1-B/C and privacy/retention decisions are resolved. Prepared against public-site OS contract commit `70c1de4d32033ec835f3b02a663d0aeedcc88001`. This document makes G1-A and G1-B reviewable and covers only the **visible** G1-C brief. The attached G1-C text ends mid-sentence after “A `PatternDefinition` should have provenance such as: source”; no unseen continuation is inferred. No repository, service, database, identity integration, import, or production change is authorized here.

## G1-A — backend ownership

**Option A: dedicated 1stStep OS backend (recommended).** Create a distinct, future Git repository, provisionally named `1ststep-os-backend`, under a dedicated **1stStep OS Engineering Orchestrator** appointed by Evan. That role is the single engineering authority for the Organization, Portfolio, Project, OrganizationMembership, ProjectMembership, Genome, OS manifest/artifact, connection, evidence, audit/finding, release, job, registry projection, Command Center projection, and PatternDefinition domain. Deploy its API as a separate Vercel project or equivalent independently releasable service, provisionally `1ststep-os-api`; a future authenticated OS workspace should share the OS service's origin or use an explicitly reviewed auth boundary. A **dedicated PostgreSQL database** is authoritative for OS identity mapping, membership, metadata, revision, decision, job, and projection source records. Large encrypted evidence and generated files may live in an OS-owned object store keyed by database records and digest; object storage is not an alternate metadata ledger. Only the OS backend repository defines and applies OS migrations. No provider, project, domain, or database instance exists by virtue of this recommendation.

Pros: clear data and migration authority; per-project isolation designed once; independent release/rollback and secrets; no Job Agent billing/resume/extension coupling; stronger future multi-tenant SaaS boundary; one owner for jobs, audit and pattern policy. Cons: another deployable and database to operate, an authenticated handoff from `/os/start/`, additional observability and cost, and cross-service integration work if shared identity is later chosen. [Vercel projects](https://vercel.com/docs/projects) support separate deployment, domains and settings; [PostgreSQL row security](https://www.postgresql.org/docs/18/ddl-rowsecurity.html) can add defense in depth, but does not replace server authorization and can be bypassed by inappropriate owner roles.

**Option B: extend the Job Agent backend in `1ststep-resume-deploy`.** Its existing Vercel API project and migration machinery would host OS tables and endpoints, with the app Engineering Orchestrator becoming OS backend authority or sharing that authority with a new OS lead.

Pros: fewer initial deployment surfaces, possible reuse of existing identity/operational tooling, and potentially faster initial plumbing. Cons: unrelated repository access and enterprise project data become coupled to a consumer job-search app; billing and app releases share a blast radius; app worktree and migration ownership already have an independent authority; public-site OS work would require continuous cross-team coordination; future SaaS extraction becomes a high-risk migration. The inspected app checkout has substantial active staged and unstaged work, so using it now would also violate the current non-overlap boundary. A shared database is **not** implied or recommended.

Putting the domain in `main-website` was also evaluated and rejected: the inspected deployable site is a Vite public/lead funnel with limited Vercel functions, and its `/os/start/` state is explicitly ephemeral. Giving that repo private tenant data, GitHub credentials, migrations and long-running jobs would erase the established public-site/app authority boundary. The older outer `OS/` directory is a non-Git local marketing-operations guide, not a deployable 1stStep OS backend candidate.

**Recommended authority map:**

| Question | Proposed answer |
| --- | --- |
| Canonical backend repository / migration author | New dedicated OS backend Git repository; the appointed 1stStep OS Engineering Orchestrator reviews its schema, migration, auth and release changes. Repository name is provisional until approved. |
| API deployment | Independent OS API service/project with separate Preview/Production configuration, secrets, logs, rollback and release gate. Proposed DNS/API origin is undecided; do not reserve a domain now. |
| Authoritative datastore | Dedicated managed PostgreSQL database controlled by OS backend, separate from Job Agent. Database vendor, region, retention, backup, RLS policy and credentials need an implementation decision. |
| Read authority | Authenticated OS API for authorized project members; public `/os` reads only explicitly public product metadata or a user's authorized OS API response. Admin/analytics read only approved, minimized projections. Job Agent reads no OS private data by default. |
| Write authority | OS API and its authorized workers only, with organization **and** project checks, idempotency and audit. No browser, website function, app service, agent adapter or direct database client writes OS tables. |
| `main-website` | Public marketing and browser-local onboarding client; it does not own OS domain, migrations, credentials or jobs. A future Save handoff is a separately reviewed API/auth contract. |
| `app.1ststep.ai` | Remains Job Agent authority. It need not own/share OS backend. If a user navigates across products, use an explicit identity subject-mapping or service API/event contract, scoped consent, signed opaque IDs, no shared tables, no direct OS DB access, no implicit Job Agent access to repo content. App-owned changes are implemented by its Engineering Orchestrator. |
| Engineering authority | Evan appoints one 1stStep OS Engineering Orchestrator for backend implementation and release. This public-site agent owns `/os` client/interface contract; the existing app orchestrator owns Job Agent. No two agents may independently mutate the OS backend. |

**Recorded owner decision:** Evan answered yes to the proposed separate-backend direction and requested a simpler website-or-GitHub first-look entry. Option A is the chosen ownership boundary; the actual OS Engineering Orchestrator, implementation platform/provider, datastore instance, and identity boundary remain undecided. This approval does not itself open G1 or authorize backend scaffolding. Option B is no longer the preferred path.

## G1-B — first-party and customer portfolio placement

**Contractual meanings:** An `Organization` is the security, consent, billing and data-controller boundary; legal identity must be verified rather than inferred from brand similarity. A `Portfolio` is a grouping and authorized read projection inside exactly one Organization, **not** an independent tenant or a grant of access to all contained Project content. A `Project` is one bounded system/product/workflow with exactly one owning Organization and one current Portfolio assignment; it has its own permissions, sources, Genome, OS, audits, findings, releases and jobs. A Project can move portfolios through an audited operation but cannot belong to multiple portfolios simultaneously. Tags/saved views can show it in several screens without duplicating authority. An Organization member can participate in many Projects, including across Organizations when explicitly invited.

**Proposed hierarchy, conditional on verified control:**

```text
1stStep-controlled Organization (name/legal controller to verify)
  First-Party Products portfolio
    1stStep OS
    app.1ststep.ai / AI Job Agent
    DaySetGo, SwingTradePros, Real-Rank.ai, Unveiling Rarities
    (each becomes a record only after owner, source and baseline verification)
  Internal Experiments portfolio (only if/when a real experiment needs tracking)

Customer-owned Organization A
  Customer-selected portfolio(s)
    Customer Project 1, Customer Project 2, ...

Separate synthetic Demo/Sandbox Organization
  Demo portfolio
    Synthetic or explicitly authorized public-data projects only
```

The six named first-party items are an **authoritative dogfooding target list**, not evidence that 1stStep.ai is their single legal/data controller or that they have been imported, connected, audited, launched or made public. If one is controlled by another entity, place it in that verified Organization and grant 1stStep an explicit project role; do not force it into the first-party Organization for convenience. The public `1ststep.ai` site is not silently added as a seventh registry record; it can be a separate Project after Evan chooses its ownership and scope. Client projects belong to customer-controlled Organizations by default, never a shared “Client Projects” portfolio inside the 1stStep Organization. A services engagement gives named 1stStep users scoped project roles, time limits and revocation, not customer-organization ownership.

Sandbox/demo data is isolated from real first-party and customer repositories. “Demo” is not a disclosure permission for a real Project; copying real data into it needs explicit consent, minimization and review. `ARCHIVED` changes visibility and write policy, not ownership: archived Projects remain in their Organization/Portfolio, retain evidence/decision history under the approved retention policy, are hidden from default active views, and cannot run new jobs or connections without deliberate reactivation. Archive is not deletion or a claim of health.

**Membership inheritance:** Organization membership is necessary to enter the tenant, but grants no default read of private project content. ProjectMembership grants project-specific viewer/editor/admin/owner rights; portfolio lists contain only projects for which the user has a ProjectMembership. Organization owners can manage invitations, retention and emergency access, but content access beyond their memberships requires a separately logged, time-bounded break-glass or grant operation. A project role cannot mutate Organization settings. Cross-organization participation needs independent membership and consent in each Organization. Migrations and workers enforce both organization and project IDs, not name/slug matching.

**Contractual now:** one Organization per Project; one current Portfolio per Project; project-scoped access; customer ownership; isolated synthetic demos; no implicit membership inheritance; unknown registry state; audited move/archive. **Flexible later:** portfolio names/counts, tags and saved views, whether 1stStep needs an Internal Experiments portfolio, and exactly which verified first-party entity owns each target. Those flexible choices do not change the security model.

**Decision required from Evan:** “Approve this placement and membership rule, with first-party project ownership checked individually before import?” **Yes / No.** A yes does not import any project or assert its deployment/audit state.

## G1-C — cross-project pattern permissions, visible brief only

**Default:** project data stays in its project, including when two projects have the same owner. The OS may recommend general engineering knowledge from independently public standards without accessing another tenant. Pattern extraction is a separate reviewed act, not an automatic side effect of an audit, model call, or an agent's memory.

| Class | Cross-project treatment |
| --- | --- |
| Source code, secrets, credentials, repository files, customer-specific architecture/requirements, private documents, raw audit evidence, PII, customer business data | **Never cross by default.** No raw copy into PatternDefinition, vector index, model prompt, logs, analytics, export, or another Project. A customer-specific exception would need an explicit purpose, contract and authorization and is outside this default pattern pathway. |
| Generic failure/remediation patterns, framework checks, test heuristics, public dependency advisories, non-identifying anti-patterns, generalized release gates | **Candidate only after abstraction.** Strip names/URLs/code/rare combinations, map to a general condition, attach source evidence internally, and state applicability, risks and confidence. Human/security review and allowed-audience decision precede use by another Project. |
| Aggregate comparisons across different customers | **Closed by default.** Require separate customer opt-in, privacy/contract review, cohort-size and rare-attribute suppression, and revocation treatment. No implied model-training right. |

The internal `PatternDefinition` may hold restricted `sourceProjectIds`, evidence IDs, and OutcomeObservation IDs **only for provenance verification by authorized reviewers**. Its draft schema now permits only `INTERNAL` audience. Those provenance fields must never be serialized into an external project response. A separate sanitized publication/view contract would carry only pattern text, applicability, risk, review/consent record, version and safe citation class; direct external exposure of the internal schema would be a data leak. External approval must bind pattern version, reviewer, source-controller permission, audience, purpose, expiry/review date, and withdrawal path. New contradictory evidence or withdrawn consent makes downstream pattern recommendations stale. A single project's practice is a hypothesis, not a universal rule. Pattern confidence reflects strength and diversity of evidence, not model enthusiasm.

**Provisional decision required from Evan after the complete G1-C text is available:** choose either **internal-only reviewed patterns** for the first implementation, or separately authorize a customer-facing sanitized publication contract with explicit source-controller opt-in. This package recommends **internal-only**. Because the attachment stops mid-provenance list, any further requirements and final G1-C acceptance remain **UNKNOWN**; G1 stays CLOSED. No external customer corpus, publication endpoint, or model training is approved.
