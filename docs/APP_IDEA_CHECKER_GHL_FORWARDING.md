# App Idea Checker GHL Forwarding

Phase 3 forwards valid App Idea Checker submissions to GoHighLevel or another webhook automation tool.

The main checker submission must still succeed if forwarding is disabled, unconfigured, or temporarily failing.

## Environment Variables

Required for GHL forwarding:

```bash
APP_IDEA_FORWARDING_ENABLED=true
APP_IDEA_GHL_WEBHOOK_URL=https://your-ghl-webhook-url
```

Optional forwarding targets:

```bash
APP_IDEA_ZAPIER_WEBHOOK_URL=
APP_IDEA_MAKE_WEBHOOK_URL=
APP_IDEA_CUSTOM_WEBHOOK_URL=
```

If `APP_IDEA_FORWARDING_ENABLED` is not exactly `true`, forwarding is skipped.

## Forwarded Payload

The forwarded payload includes:

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

`pipeline_stage` is always:

```text
New Idea Checker Lead
```

`repo_creation_status` is always:

```text
locked_until_signed_and_paid
```

## Response Statuses

Forwarding disabled:

```json
{
  "forwarding": {
    "enabled": false,
    "ghl": { "status": "skipped_disabled" }
  }
}
```

Forwarding enabled but GHL URL missing:

```json
{
  "forwarding": {
    "enabled": true,
    "ghl": { "status": "skipped_missing_url" }
  }
}
```

GHL webhook sent:

```json
{
  "forwarding": {
    "enabled": true,
    "ghl": { "status": "sent" }
  }
}
```

GHL webhook failed:

```json
{
  "forwarding": {
    "enabled": true,
    "ghl": {
      "status": "failed",
      "error": "GHL webhook returned HTTP 500"
    }
  }
}
```

## GHL Pipeline Stages

Create these pipeline stages:

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

## GHL Tags

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

## Security Notes

- Do not hardcode webhook URLs in source code.
- Do not log full webhook URLs.
- Do not expose secrets in API responses.
- Do not create GitHub repos from lead submit.
- Repo creation stays locked until discovery is completed, proposal is accepted, deposit is paid, and Phase 1 build has started.
