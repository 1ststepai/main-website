# App Idea Checker Backend

The App Idea Checker uses a lightweight Vercel function for bounded lead intake and deterministic context-pack generation.

## Endpoint

`POST /api/app-idea-checker`

The request must use `Content-Type: application/json` and remain below 100 KiB.

## Required fields

- `name`
- `email`
- `score`
- `category`
- `idea_type`
- `budget`

## Accepted fields

- `source`, `name`, `email`, `phone`
- `score`, `category`, `idea_type`, `audience`, `budget`, `launch_timeline`, `recommended_path`
- `tags`, `answers`, `created_at`
- `idea_text`, bounded score-detail fields, `risk_level`, and `biggest_risk`

Unknown top-level fields are rejected. Strings, tags, answers, timestamps, and 0-100 scores have explicit type and length limits.

## Normalization

The backend:

- trims strings and lowercases email
- validates email, score ranges, timestamps, tags, and answer values
- generates a random `lead_id`
- generates a sanitized `project_slug` from idea type plus a random identifier, without the person's name
- adds `server_created_at`
- classifies `lead_quality`
- converts bounded structured answer values to strings before forwarding or context generation

The client-computed score is a first-pass triage value. It is not an entitlement, payment, or automated high-impact decision.

## Storage and delivery

The storage adapter tries, in order:

1. Vercel KV-compatible REST storage when `KV_REST_API_URL` and `KV_REST_API_TOKEN` exist.
2. Local JSON/markdown files under `generated-projects/` outside Vercel.
3. No-op storage with `persisted: false`.

KV records use `APP_IDEA_RETENTION_SECONDS` and default to 90 days. Local development files require manual cleanup.

A `200` response requires at least one successful delivery path:

- storage persisted the intake, or
- Resend sent the admin notification, or
- an explicitly enabled webhook accepted the lead.

If none succeeds, the route returns `503 intake_unavailable`. No-op storage alone is never reported as success.

## Response and privacy

Successful responses include the deterministic file list, a non-content manifest, delivery states, and `repo_creation_status`.

Generated file previews are not returned because they can contain contact and project information. Responses use `Cache-Control: no-store` and include `request_id` plus `X-Request-ID` for support correlation.

## Request controls

- Browser CORS is same-origin by default; extra exact origins require `APP_ALLOWED_ORIGINS`.
- The default best-effort function-instance limit is 12 requests per 10 minutes per hashed network identifier.
- A valid `Idempotency-Key` prevents duplicate delivery within a warm function instance.
- Durable platform rate limiting and cross-instance idempotency remain deployment-layer controls.
- External delivery calls use bounded timeouts; non-HTTPS webhooks are rejected outside local development.

## Local testing

Use `npx vercel dev`; the Vite server alone does not execute `/api` functions.

```bash
curl -X POST http://localhost:3000/api/app-idea-checker \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: local-test-2026-07-22" \
  -d '{
    "source":"app_idea_checker",
    "name":"Synthetic Test",
    "email":"synthetic@example.com",
    "score":76,
    "category":"Viable, Needs Validation",
    "idea_type":"Web app / SaaS",
    "audience":"Local businesses",
    "budget":"$3,000-$10,000",
    "launch_timeline":"1-3 months",
    "recommended_path":"Focused MVP with only the core workflow",
    "tags":["app_idea_checker"],
    "answers":{"problem_clarity":"Somewhat clear"},
    "created_at":"2026-07-22T12:00:00.000Z"
  }'
```

Use synthetic data only. Configured email or webhook destinations can create a real external notification.
