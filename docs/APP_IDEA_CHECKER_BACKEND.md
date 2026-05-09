# App Idea Checker Backend

Phase 2 adds a lightweight intake endpoint for the App Idea Viability Checker.

## Endpoint

`POST /api/app-idea-checker`

## Required Fields

- `name`
- `email`
- `score`
- `category`
- `idea_type`
- `budget`

## Accepted Payload Fields

- `source`
- `name`
- `email`
- `phone`
- `score`
- `category`
- `idea_type`
- `audience`
- `budget`
- `launch_timeline`
- `recommended_path`
- `tags`
- `answers`
- `created_at`

## Normalization

The backend:

- trims string fields
- lowercases email
- lightly validates email format
- validates score as a 0-100 number
- generates `lead_id`
- generates a sanitized `project_slug`
- adds `server_created_at`
- preserves original answers
- preserves computed tags
- classifies `lead_quality`

## Lead Quality

- `high`: score >= 80 and budget is $3,000+
- `medium`: score >= 60
- `low`: score < 60

## Storage Behavior

The storage adapter tries, in order:

1. Vercel KV when `KV_REST_API_URL` and `KV_REST_API_TOKEN` are available.
2. Local JSON/markdown files under `generated-projects/`.
3. Safe no-op storage that returns success and includes a file manifest plus preview metadata.

On Vercel without KV configured, the adapter skips deployment filesystem writes and uses safe no-op storage.

No paid API is required.

## Response Shape

`generated_files` always returns the deterministic 16-file context pack list, even if the runtime cannot physically write files.

`generated_file_manifest` includes path, byte size, and write status details.

Example:

```json
{
  "ok": true,
  "lead_id": "lead_...",
  "project_slug": "test-founder-web-app-saas-...",
  "score": 76,
  "category": "Viable, Needs Validation",
  "lead_quality": "medium",
  "recommended_path": "Focused MVP with only the core workflow",
  "tags": ["app_idea_checker", "mvp_ready_medium", "budget_3k_10k"],
  "context_pack_status": "generated",
  "generated_files": [
    "README.md",
    "PROJECT_BRIEF.md",
    "MVP_SCOPE.md",
    "USER_STORIES.md",
    "TECHNICAL_PLAN.md",
    "BUILD_PHASES.md",
    "RISKS_AND_ASSUMPTIONS.md",
    "CLAUDE_PROMPT.md",
    "CODEX_PROMPT.md",
    "skills/brand-voice.md",
    "skills/mvp-scope-control.md",
    "skills/token-usage-rules.md",
    "skills/discovery-to-build.md",
    "tasks/phase-1-validation.md",
    "tasks/phase-2-mvp.md",
    "tasks/phase-3-polish.md"
  ]
}
```

## Local Test

```bash
curl -X POST http://localhost:3000/api/app-idea-checker \
  -H "Content-Type: application/json" \
  -d '{
    "source":"app_idea_checker",
    "name":"Test Founder",
    "email":"test@example.com",
    "phone":"555-555-5555",
    "score":76,
    "category":"Viable, Needs Validation",
    "idea_type":"Web app / SaaS",
    "audience":"Local businesses",
    "budget":"$3,000-$10,000",
    "launch_timeline":"1-3 months",
    "recommended_path":"Focused MVP with only the core workflow",
    "tags":["app_idea_checker","mvp_ready_medium","budget_3k_10k"],
    "answers":{
      "problem_clarity":"Somewhat clear",
      "monetization":"Monthly subscription",
      "distribution":"I have some warm contacts"
    },
    "created_at":"2026-05-08T12:00:00.000Z"
  }'
```

For local Vercel testing, use:

```bash
npx vercel dev
```

The Vite dev server alone does not run Vercel serverless functions.
