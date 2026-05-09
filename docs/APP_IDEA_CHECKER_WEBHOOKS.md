# App Idea Checker Webhooks

The backend currently saves and returns the normalized lead/report data. Forwarding hooks are intentionally TODOs so the first production test can prove intake and context-pack generation before adding automations.

## Front-End Hook

`app-idea-viability-checker.html` sends to:

```js
webhookUrl: "/api/app-idea-checker"
```

The checker is hosted on the Vercel main website. If a separate GHL funnel or landing page ever embeds a copy of the checker on another domain, replace this with the full deployed Vercel endpoint URL:

```js
webhookUrl: "https://1ststep.ai/api/app-idea-checker"
```

Do not move the primary main website or checker hosting to GoHighLevel. GHL should receive leads through webhook forwarding and automation only.

## Backend TODO Hooks

The TODO hook block lives in `api/app-idea-checker.js`.

Planned forwarding targets:

- GoHighLevel webhook forwarding
- Zapier webhook forwarding
- Make.com webhook forwarding
- Custom API endpoint forwarding
- GitHub repo creation later, preferably admin-triggered
- PDF report generation
- Admin email notification

## Recommended GHL Fields

- `lead_id`
- `project_slug`
- `score`
- `category`
- `lead_quality`
- `idea_type`
- `audience`
- `budget`
- `launch_timeline`
- `recommended_path`

## Recommended Tags

- `app_idea_checker`
- `mvp_ready_high`
- `mvp_ready_medium`
- `needs_validation`
- `budget_3k_10k`
- `budget_10k_plus`

## Security Notes

- Do not log secrets.
- Do not store API keys in code.
- Use environment variables for forwarding endpoints.
- Keep GitHub repo creation out of the default lead-submit path until the intake has been proven.
