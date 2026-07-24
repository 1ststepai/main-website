# App Idea Checker Operations

This is the public-safe operator guide for `/api/app-idea-checker`. Keep secret values in Vercel environment settings, never in this repository.

## Required production decision

At least one delivery path must be configured and tested:

- Vercel KV-compatible REST storage with a bounded retention TTL, or
- Resend admin notification, or
- an owner-approved webhook with `APP_IDEA_FORWARDING_ENABLED=true`.

The route returns `503 intake_unavailable` when none succeeds. This is intentional: the visitor must not be told a report was saved when it was dropped.

## Safe configuration sequence

1. Keep forwarding disabled.
2. Configure exact `APP_ALLOWED_ORIGINS`.
3. Configure KV and/or Resend using least-privilege credentials.
4. Confirm `APP_IDEA_RETENTION_SECONDS` with the privacy owner.
5. Deploy to preview.
6. Run tests and build.
7. Submit one clearly labeled synthetic test lead in preview.
8. Verify the configured destination, request ID, and UI success state.
9. Verify a forced dependency failure renders a recoverable error and creates no false success.
10. Obtain explicit approval before production deployment or enabling forwarding.

## Diagnostics

Use the response `request_id` or `X-Request-ID` to correlate application logs. Logs should contain event name, request ID, status code, and error code—not contact details, tokens, raw prompts, or webhook URLs.

Common response codes:

- `400`: invalid or unexpected input
- `403`: browser origin not allowed
- `413`: payload over 100 KiB
- `415`: non-JSON request
- `429`: function-instance rate limit reached
- `503`: no persistence or delivery path succeeded

## Recovery

- Resend failure: verify service status and environment-variable presence without printing values.
- KV failure: verify endpoint reachability, least-privilege token, and TTL behavior.
- Webhook failure: leave forwarding disabled until the endpoint is approved and passes a synthetic preview test.
- Repeated abuse: apply a durable Vercel Firewall rule; the in-code limiter is best effort across serverless instances.

Never issue refunds, create repositories, change billing, rotate credentials, enable forwarding, or deploy from an automated support action.
