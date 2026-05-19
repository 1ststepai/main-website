# Superpowers Methodology Layer

## When To Use This Skill

Use this skill as a generic agent methodology layer when work benefits from extra discipline around:

- understanding an ambiguous request
- brainstorming implementation options
- writing or following a plan
- debugging a failing behavior
- test-driven or verification-heavy changes
- reviewing code before shipping
- deciding whether work is truly done

Do not use this skill as the source of business, brand, legal, privacy, product, pricing, or conversion strategy.

## Source

This local skill adapts the methodology from the public Superpowers project:

- Repository: https://github.com/obra/superpowers
- Purpose: reusable agent skills for structured software development workflows

Do not copy or run upstream installers in this project without explicit approval. Do not overwrite `AGENTS.md`, `CLAUDE.md`, or project-specific skills.

## Priority Rules

Superpowers is lower priority than project instructions.

Load order for this project:

1. Current user request
2. `AGENTS.md` and any `CLAUDE.md`
3. 1stStep.ai skills in `.agents/skills/firststep/`
4. Premium web design and visual asset rendering skills when applicable
5. This Superpowers methodology layer
6. Default agent behavior

If this skill conflicts with 1stStep.ai rules, ignore this skill.

For other related projects, preserve the same hierarchy:

- Universal Relocations: privacy, security, and data-protection rules before generic coding methodology.
- Real Rank AI: product, legal, pricing, and demo-mode rules before generic coding methodology.
- 1stStep.ai: brand, design, conversion, funnel, and App Idea Checker rules before generic coding methodology.

## 1stStep.ai Guardrails

Preserve the existing 1stStep.ai funnel:

- homepage to App Idea Checker
- `/app-idea-viability-checker.html`
- `/api/app-idea-checker`
- Resend admin notification
- `localStorage` key `appIdeaCheckerLastResponse`
- deterministic context pack generation
- `repo_creation_status: locked_until_signed_and_paid`
- GHL forwarding disabled unless explicitly requested

Do not use this methodology layer to:

- introduce paid AI APIs
- enable GHL forwarding
- enable repo creation
- add secrets or credentials
- change app behavior without a user request
- replace project-specific copy, design, or conversion rules

## Methodology

Use the smallest useful amount of process for the task.

For small edits:

1. Read the relevant files.
2. Make the narrow change.
3. Run targeted checks.
4. Report what changed.

For larger or risky changes:

1. Clarify the goal and constraints.
2. Identify affected files and routes.
3. Plan the implementation.
4. Make incremental edits.
5. Verify with tests, build checks, browser checks, or screenshots as appropriate.
6. Review for regressions against project-specific rules.

For debugging:

1. Reproduce the issue when possible.
2. Inspect the smallest relevant surface area first.
3. Form one concrete hypothesis at a time.
4. Test the hypothesis.
5. Fix the cause, not just the symptom.
6. Verify the fix in the real user flow.

For code review:

1. Look for behavior regressions.
2. Check security and data handling.
3. Check route and API preservation.
4. Check missing validation or failure states.
5. Check tests/build/browser verification.
6. Keep summaries secondary to findings.

## Acceptance Checklist

Before reporting done, confirm:

- Project-specific instructions were preserved.
- No existing rules were overwritten.
- No secrets or credentials were added.
- No unrelated app code was changed.
- No paid API, GHL forwarding, or repo creation behavior was introduced.
- Relevant checks were run or the reason they were not run is stated.
- The final response clearly separates files changed, checks run, and remaining risks.
