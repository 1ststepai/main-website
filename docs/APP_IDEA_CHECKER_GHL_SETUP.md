# App Idea Checker GHL Setup

Use this guide to connect the App Idea Viability Checker to GoHighLevel after the deployed preview has passed browser QA.

Do not enable forwarding for production until the preview webhook test passes and no unexpected GHL costs or SMS actions are triggered.

## Current Endpoints

- Main deployment: `https://main-website-repo.vercel.app`
- Checker: `https://main-website-repo.vercel.app/app-idea-viability-checker.html`
- Intake endpoint: `https://main-website-repo.vercel.app/api/app-idea-checker`

## Custom Fields

Create these GHL custom fields before mapping the webhook payload:

- App Idea Score
- App Idea Category
- Lead Quality
- Idea Type
- Audience
- Budget Range
- Launch Timeline
- Recommended Path
- Project Slug
- Context Pack Status
- Repo Creation Status

## Tags

Create these tags:

- `app_idea_checker`
- `mvp_ready_high`
- `mvp_ready_medium`
- `needs_validation`
- `budget_under_1k`
- `budget_1k_3k`
- `budget_3k_10k`
- `budget_10k_plus`
- `discovery_call_needed`
- `repo_locked_until_paid`

## Pipeline Stages

Create these opportunity pipeline stages:

- New Idea Checker Lead
- Qualified Lead
- Discovery Call Booked
- Discovery Completed
- Proposal Sent
- Proposal Accepted
- Deposit Paid
- Phase 1 Build Started
- Phase 1 Delivered
- Won - Ongoing Support
- Lost / Not Fit

## Webhook Payload Fields

The forwarding payload includes:

- `source`
- `lead_id`
- `project_slug`
- `name`
- `email`
- `phone`
- `score`
- `category`
- `lead_quality`
- `idea_type`
- `audience`
- `budget`
- `launch_timeline`
- `recommended_path`
- `tags`
- `answers`
- `context_pack_status`
- `generated_files`
- `server_created_at`
- `pipeline_stage`
- `stage_suggestion`
- `repo_creation_status`

## Field Mapping

Map the payload to GHL fields like this:

| Payload Field | GHL Destination |
| --- | --- |
| `name` | Contact full name |
| `email` | Contact email |
| `phone` | Contact phone |
| `score` | App Idea Score |
| `category` | App Idea Category |
| `lead_quality` | Lead Quality |
| `idea_type` | Idea Type |
| `audience` | Audience |
| `budget` | Budget Range |
| `launch_timeline` | Launch Timeline |
| `recommended_path` | Recommended Path |
| `project_slug` | Project Slug |
| `context_pack_status` | Context Pack Status |
| `repo_creation_status` | Repo Creation Status |

Keep `answers`, `generated_files`, `lead_id`, and `stage_suggestion` available in workflow notes or internal notifications if GHL field limits make full mapping awkward.

## Workflow Steps

Build the GHL workflow in this order:

1. Inbound webhook trigger.
2. Create or update contact using `email` as the primary match key.
3. Map custom fields.
4. Apply all tags from `tags`.
5. Apply `discovery_call_needed` when `lead_quality` is `high` or `medium`.
6. Apply `repo_locked_until_paid` on every App Idea Checker lead.
7. Create an opportunity in `New Idea Checker Lead`.
8. Send an internal notification to Evan.
9. Send the report follow-up email.
10. Send or display the booking CTA.

## Follow-Up Email

Subject:

```text
Your App Idea Readiness Score
```

Body:

```text
Hey {{contact.first_name}},

Your App Idea Readiness Score is in.

Score: {{custom_values.app_idea_score}}
Category: {{custom_values.app_idea_category}}
Recommended path: {{custom_values.recommended_path}}

This is not a guarantee, but it is a useful first-pass signal. The smartest next step is to map the smallest version that can prove demand before you overspend on development.

You can book a Build Strategy Call here:
https://api.leadconnectorhq.com/widget/booking/Rb4aqLM1NdU5kvZcqNmj

- Evan
1stStep.ai
```

If your GHL custom value keys differ, update the merge fields before activating the workflow.

## Booking URL

Use this exact booking URL:

```text
https://api.leadconnectorhq.com/widget/booking/Rb4aqLM1NdU5kvZcqNmj
```

## Vercel Environment Setup

Keep forwarding off until the GHL inbound webhook is created and tested:

```bash
APP_IDEA_FORWARDING_ENABLED=false
```

When ready to test in preview:

```bash
APP_IDEA_FORWARDING_ENABLED=true
APP_IDEA_GHL_WEBHOOK_URL=<GHL inbound webhook URL>
```

Do not add the webhook URL to source code. Store it only in Vercel environment variables.

## Preview QA

Run this in preview only:

1. Set forwarding on in Vercel preview.
2. Submit a test lead from the deployed checker.
3. Confirm the API still returns `ok: true`.
4. Confirm `forwarding.enabled` is `true`.
5. Confirm `forwarding.ghl.status` is `sent`.
6. Confirm contact is created or updated in GHL.
7. Confirm tags are applied.
8. Confirm opportunity is created in `New Idea Checker Lead`.
9. Confirm the follow-up email is sent.
10. Confirm internal notification is sent to Evan.
11. Confirm `repo_creation_status` remains `locked_until_signed_and_paid`.
12. Confirm no SMS, phone, paid AI, or repo-creation actions were triggered.

## Production Rule

Do not connect or promote the real production domain until:

- Browser QA passes.
- GHL webhook test passes.
- Forwarding works in preview.
- No unexpected GHL costs or SMS actions are triggered.
- `repo_creation_status` remains `locked_until_signed_and_paid`.

GitHub repo creation remains locked until discovery is completed, proposal is accepted, deposit is paid, and Phase 1 build has started.
