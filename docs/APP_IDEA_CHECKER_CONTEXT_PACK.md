# App Idea Checker Context Pack

Every valid App Idea Checker submission generates a deterministic markdown context pack.

## Generated Paths

The pack is generated under:

```text
generated-projects/{project_slug}/
```

Files:

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

## Runtime Behavior

If files can be written locally, the adapter writes the pack under `generated-projects/`.

If running in a read-only runtime, the endpoint still returns success with:

- `generated_files`
- `generated_file_manifest`
- `context_pack_status`
- `storage.mode`
- `storage.persisted`
- `storage.preview_files`

This prevents lead intake from failing just because the runtime cannot persist files.

`generated_files` is the stable relative filename list. `generated_file_manifest` is the detailed storage-aware manifest.

## Prompt Usage

Use `CLAUDE_PROMPT.md` for strategy, discovery, positioning, and build-scope planning.

Use `CODEX_PROMPT.md` for implementation planning and scoped engineering work.

## Scope Rule

The generated context pack is designed to prevent overbuilding. It should keep the next step focused on validation, a prototype, or one narrow MVP workflow depending on lead quality, budget, and recommended path.
