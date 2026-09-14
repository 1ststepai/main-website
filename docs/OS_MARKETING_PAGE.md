# 1stStep OS public page: design and information architecture

Status: `/os` is a public concept page. `/os/start/` now opens with a website-or-GitHub first-look email request and retains the separate browser-local interactive onboarding preview; it does not create an account, inspect code, or compile a Project OS. The current opening positions the OS as an **AI Engineering Operating System**: context → authority → isolated work → evidence → release decision. The broader product, business, and discovery concepts below remain visibly labeled as future or illustrative. Connected application architecture remains open.

## Existing 1stStep.ai design language (observed in `index.html` and `public/service-pages.css`)

- Near-black navy canvas (`#070912`), fine grid, restrained violet/blue/cyan light, high-contrast off-white type.
- Inter for interface and body copy, Space Grotesk for display in the homepage; tight, confident headings and quiet monospace labels.
- 1280px content rhythm, rounded dark panels, fine borders, restrained depth, pill-shaped primary/secondary actions.
- Existing transparent 1stStep.ai logo, favicon, focus-visible treatment, and reduced-motion behavior can be reused visually. The homepage's large inline stylesheet is not a reusable component API.
- Brand decision: the current live-site logo asset is locked; see `docs/BRAND_LOGO_USAGE.md`. Signal Path may describe secondary motion and diagrams but is not a replacement logo.
- The site is a Vite multi-page build. A separate `os/index.html` entry preserves the homepage, checker, service routes, and their existing behavior.

## `/os` information architecture

1. Hero and authority board: the AI engineering promise, early product status, Context → Authority → Evidence → Release, and an illustrative gate-based engineering contract. The broader lifecycle appears below.
2. Four entry paths: start new, audit an existing build, automate a business, and grow/get discovered.
3. Project Genome: four selectable examples change a conceptual 12-signal project profile and selectively illuminate 12 capabilities. This is a marketing depiction of the canonical Project Profile, not a schema or compiler implementation.
4. Transformation: the retained scripted bakery-owner prompt moves through research, illustrative Project OS files, and a finished pickup-order website preview.
5. Problem: context loss, agent conflicts, repeated prompting, drift, missed quality checks, and late growth.
6. Capability universe: 12 compact selectable areas and a detail panel, with full names and descriptions in crawlable HTML.
7. Project OS and continuity: execution sessions feed illustrative files, knowledge/evidence/current-state layers, vendor-neutral model handoff, and a resumable checkpoint story.
8. Cost harness: whole-context default contrasted with scoped context, deterministic checks, model routing, reuse, validation, and cost observation.
9. Media factory and Discovery OS: brand-to-asset pipeline, search/AI/social channels, and clearly future AI share-of-voice measurement.
10. Audit and Business Owner Mode: evidence-first baseline, clearly fictional sample scores/findings, and a moving-company workflow example with no fabricated savings estimate.
11. Truth, opportunity, command center: evidence labels, post-launch customer voice, and a clearly fictional future dashboard.
12. Final prompt: four selectable intents and a local-only static starting-path preview. The input is never submitted, stored, or used to create a project. The new-idea path can link to the site's existing App Idea Checker.

## Audience and motion refinement

- Lead with builders and teams responsible for real AI-assisted software engineering. The hero states that authority, isolated work, acceptance criteria, tests, evidence, and release gates are the system around the models.
- Give three equally visible additional doors: a builder or small team recovering an AI-built app, a business owner identifying repeatable work, and a launched product seeking customers. Experienced developers and agencies can recognize themselves in the deeper system story without displacing the beginner.
- State each starting condition in the visitor's language, then show a concrete direction: a researched first-product plan, a mapped recovery plan, or a bounded automation opportunity. These are illustrative marketing paths, not live generated results.
- Animate the hero as one directional signal from Context → Authority → Evidence → Release. Use small staggered motion and scroll emphasis to explain sequence. All content remains present without JavaScript, and `prefers-reduced-motion` removes movement.
- The journey demo uses a 20-second CSS loop started only when visible, with Pause and Replay controls. It is explicitly illustrative, sends no request, and defaults to the final product preview without JavaScript or under reduced motion. The visual has a complete text alternative; the animation itself is hidden from assistive technology to avoid repeated announcements. Hero, genome, memory, and provider motion pause offscreen.
- The hero's primary CTA opens `/os/start/`, where one public website or GitHub link can prepare a human first-look email request. Five browser-local onboarding paths remain available without a link. The lower-page four-intent prompt remains an illustrative marketing widget. None creates or submits an OS project.

## Reuse and boundaries

- Reuse the existing logo asset, favicon, Vite entry convention, metadata pattern, dark palette, typography direction, rounded controls, and focus behavior.
- Keep OS-specific diagrams and styling local to the new route. Use semantic HTML/CSS and minimal progressive enhancement rather than new dependencies.
- Most CTA destinations remain within `/os`; the optional new-idea follow-up goes to the already existing App Idea Checker and is labeled as such. The local prompt never sends its contents.
- The prompt has no asynchronous state today. A future connected version needs explicit loading, success, and error feedback before accepting submissions; that behavior belongs to the later architecture work.
- Reuse the site's existing `site-analytics.js` for a page view and sparse intent interactions. Never track prompt text. No onboarding conversion event exists until an approved onboarding flow exists.
- Metadata includes a canonical URL, OG fields, and `WebPage` JSON-LD. It describes the public concept, not a live software application. Core copy and diagram labels remain in HTML for crawlability and AI/search answerability.
- Current: public page, browser-local onboarding preview, and interactive marketing visualizations. In development: connected onboarding, audit, adapters, routing, and capability workflows. Designed for/coming: media factory, discovery intelligence, resumability, opportunity engine, and command center. None of the conceptual scores represent a real project.
- The expanded brief's `FACT`, `ESTIMATED`, and `STALE` labels appear only in a future Truth OS concept. They do not replace the canonical Project OS evidence vocabulary in `AGENTS.md` (`CONFIRMED`, `OBSERVED`, `INFERRED`, `ASSUMED`, `UNVERIFIED`, `BLOCKED`). The marketing page makes no schema decision.
- No auth, data architecture, Project OS generation, production deployment, or external action.

## `/os/start/` preview boundary

The Vite entry uses the existing OS palette, typography, logo, and analytics. It first offers a single website-or-GitHub URL for a visitor-initiated email draft; entering the URL never fetches or saves it. A secondary choice preserves all five browser-local starting paths (idea, existing build, business, growth, unsure), their in-memory interpretation, changing Genome/capability lenses, preliminary recommendations, and proposed Project OS. Existing-build, business, and growth paths show respectively an unverified repository baseline, a draft process hypothesis, and an unmeasured Discovery Genome. No freeform answer, repository URL, or recommendation change is sent to analytics; only enumerated events are tracked. Reload discards all answers. GitHub and other connectors, scans, real audit scores, generated files, downloads, saved projects, automation, and Discovery measurements are visibly planned. The detailed gap analysis, architecture, and product-truth review are in `docs/design/OS_ONBOARDING_RECONCILIATION.md`.
