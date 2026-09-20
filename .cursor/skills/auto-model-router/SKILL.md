# Auto model router

**name:** auto-model-router  
**description:** Before choosing a model or effort for substantial work, read the task context, classify it into the lightest sufficient tier (`fast`, `standard`, `reasoning`, or `max`), suggest that tier and why, wait for user confirmation or an override, then run it through the host's adapter. Prefer lighter for reversible work, never under-provision security or irreversible actions, and escalate after a failed light attempt.

## Purpose

Provide one portable routing policy for Cursor, Claude, Codex, and other multi-model coding agents. The policy reduces manual model picking while keeping the user in control. It is provider-agnostic: the tier is a capability label, not a vendor model name.

## When to use

Use before dispatching substantial coding-agent work or choosing a model/effort when the choice is user-visible. Do not add a routing lecture to an unrelated answer. If the user explicitly names a model or effort, honor it; only classify when the user asks Auto to choose or leaves the choice open.

## Core procedure: context → classify → suggest → confirm → run

1. **Read context.** Assess scope, involved files or systems, ambiguity, required judgment, security or external-action risk, and whether the work is reversible.
2. **Honor an explicit override.** If the user already chose a model, provider, effort, or tier, use that choice and skip an unsolicited suggestion.
3. **Classify** the open choice into the lightest sufficient tier using the rubric below. An optional offline helper is `demo/classify.py` or `demo/classify.py --suggest`; it is only a heuristic second opinion.
4. **Suggest before dispatch.** Give the tier and a short plain-language reason, for example:

   ```text
   Auto suggests reasoning — unknown-root-cause auth debugging needs investigation. Confirm to run, or override: fast, standard, reasoning, or max.
   ```

5. **Wait for confirmation or override.** Accept a clear confirmation (`confirm`, `yes`, or equivalent) or a tier/model choice. Do not silently change the user's selected model. If the host cannot pause, return the suggestion and let the user's next instruction authorize the run.
6. **Map the tier through the host adapter** described below, then run only after confirmation or an explicit override.
7. **Escalate when needed.** If a light attempt fails or clearly needs more judgment, say once that you are escalating and continue toward `reasoning` or `max` as appropriate.

## Tier rubric

| Tier | Use when |
| --- | --- |
| **fast** | Clear, bounded, low-judgment work: rename, format, short factual answer, simple procedure, or short summary. |
| **standard** | Multi-file edits, known patterns, routine features, or moderate debugging with useful clues. |
| **reasoning** | Ambiguous requirements, unknown-root-cause debugging, architecture, tradeoffs, or security-sensitive work. |
| **max** | Research-level work, formal proofs, large ambiguous redesigns, open-ended invention, or the hardest judgment. |

### Routing guardrails

- When signals conflict and the task is reversible (draft, prototype, dry run, easy undo), prefer the lighter tier.
- Never under-provision security-sensitive work, secrets/authentication work, purchases, sends, or other irreversible external actions; these are at least `reasoning` unless the user explicitly overrides.
- A failed or clearly insufficient light attempt is a reason to escalate, not to keep retrying at the same tier.
- Keep the user-facing explanation to the short suggestion line unless they ask for routing details.

## Adapters

Adapters translate the neutral tier into the controls exposed by each host. They must preserve the same suggest → confirm/override → run flow; they do not silently dispatch.

- **Grok Bot:** map `fast` to low effort; map `standard`, `reasoning`, and `max` to high effort when only low/high controls exist. Keep the four-tier suggestion visible even when the host collapses tiers.
- **Cursor:** use the Cursor model picker (and any available effort control) to select the configured model mapped to the confirmed tier. Ask for confirmation in the conversation before invoking the picker or running the edit.
- **Claude:** select the configured Claude model or effort setting mapped to the confirmed tier. A project may map tiers to its available Claude models; the skill does not require or assume specific model names.
- **Codex:** select the configured Codex model and/or reasoning effort mapped to the confirmed tier. Put this policy in `AGENTS.md`, project instructions, or a supported skills folder; do not assume a specific Codex model name.
- **Other agents:** use the host's model, effort, or routing API and document the local mapping. If no control exists, still show the suggestion and ask for confirmation before proceeding.

## Suggestion line shape

```text
Auto suggests <tier> — <short reason>. Confirm to run, or override: fast, standard, reasoning, or max.
```

## Anti-patterns

- Do not silently pick and run when Auto is user-visible.
- Do not send every clear rename or procedure to `reasoning`/`max` merely to be safe.
- Do not stay at `fast` after a failed attempt that needs judgment.
- Do not ignore an explicit model, provider, effort, or tier choice.
- Do not present heuristic output as a production-quality classifier or as an official vendor recommendation.

## Honesty

This is a transparent heuristic rubric, not trained routing ML. The reusable product contract is: **context → classify → suggest → confirm/override → run the lightest sufficient option → escalate on failure**.