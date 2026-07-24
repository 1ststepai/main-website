# App Idea Checker Webhooks

The checker posts to the same-domain route:

```js
webhookUrl: "/api/app-idea-checker"
```

The primary site remains on Vercel. If an approved external funnel uses the endpoint, use the full HTTPS URL and add that exact browser origin to `APP_ALLOWED_ORIGINS`.

## Available destinations

- GoHighLevel
- Zapier
- Make.com
- an owner-approved custom webhook
- Resend admin notification

Webhook forwarding is disabled unless:

```text
APP_IDEA_FORWARDING_ENABLED=true
```

Keep it disabled until the destination, least-privilege access, retention, failure path, and synthetic preview test are approved. Non-HTTPS webhook URLs are rejected outside local development.

## Safety boundary

- Do not put API keys or webhook URLs in source, logs, screenshots, fixtures, or test output.
- Never trust a webhook response as proof of downstream CRM persistence without checking the destination.
- Do not create GitHub repositories from this route. Repo creation remains `locked_until_signed_and_paid`.
- Do not enable forwarding or send production test communications without explicit approval.
