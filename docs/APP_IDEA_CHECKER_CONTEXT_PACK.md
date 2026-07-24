# App Idea Checker Context Pack

Every valid App Idea Checker submission generates a deterministic 16-file markdown context pack under:

```text
generated-projects/{project_slug}/
```

The project slug uses the idea type plus a random identifier and does not include the submitter's name.

## Files

- `README.md`
- `PROJECT_BRIEF.md`
- `MVP_SCOPE.md`
- `USER_STORIES.md`
- `TECHNICAL_PLAN.md`
- `BUILD_PHASES.md`
- `RISKS_AND_ASSUMPTIONS.md`
- `CLAUDE_PROMPT.md`
- `CODEX_PROMPT.md`
- `skills/brand-voice.md`
- `skills/mvp-scope-control.md`
- `skills/token-usage-rules.md`
- `skills/discovery-to-build.md`
- `tasks/phase-1-validation.md`
- `tasks/phase-2-mvp.md`
- `tasks/phase-3-polish.md`

## Runtime behavior

Local development can write the pack under `generated-projects/`. Vercel uses configured KV-compatible storage or reports `persisted: false`.

The route returns success only when storage or another delivery path succeeds. It returns the stable relative filename list and a path/byte manifest, but never returns generated content previews to the browser.

## Scope rule

The pack supports validation and scoped planning. It does not authorize repository creation, deployment, payment, legal action, or any other high-impact automation. `repo_creation_status` remains `locked_until_signed_and_paid`.
