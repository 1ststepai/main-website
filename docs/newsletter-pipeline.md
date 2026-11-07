# Newsletter Pipeline in 1stStep Studio

Status: production deployed and encrypted persistence verified October 1, 2026. The 25-prospect import and reusable quote draft survive full reload. Owner-provided Upstash Free Tier is connected; no paid upgrade. Owner: Evan Pancis. Scope: the consultancy's existing `/admin/` portal; no Job Agent changes, mail sending, Gmail OAuth, new vendor or paid dependency.

The user's job is to find the next appropriate action for every newsletter prospect. The finish line is a saved prospect with a stage, next action/date and accessible source evidence, while respecting requested timing and declines. The current primary action is review the attention queue and save the next step.

## Operating flow

Open Newsletter Pipeline in the existing admin sidebar, or `/admin/?page=newsletter`. Import the private JSON export, inspect the record count, then choose **Import and save update**. Select a business to review its proposal, source, Gmail conversation and reply notes; save a next review date. A date is an internal review reminder, not a sending instruction or another scheduled automation.

The first import is prepared outside the repository in `.codex-artifacts/newsletter-outreach-20260930/dashboard-import.json`. Run its sibling `export-dashboard.py` to rebuild from the private CSV and ledgers. Never commit that export, contact data, email bodies or postal address to the repository, static assets or public proposal site. The initial export carries 25 businesses, Hebe's actual contact, the January request and two declined businesses.

Imports merge records rather than replace the database: owner notes and review dates remain, new suppression is applied, and newer reply evidence advances reply state. Later imports cannot undo a suppression. Imported authentication and account-send counts are dated snapshots, not live telemetry. Old authentication checks are marked stale after 24 hours. The initial snapshot records missing SPF/DMARC and unknown DKIM. Saving a prospect does not enable sending or clear the native workflow's independent authentication hold.

The native daily automation and Gmail connector remain the current sending workflow. This dashboard does not automatically sync either. Refresh fetches saved backend records; **Import update** loads newly exported source evidence. A production Gmail connection or an authenticated automation writeback would require a separately verified integration, not a fictitious live status. No additional schedule is created by this feature.

## Storage and recovery

`/api/admin-newsletter-pipeline` requires the existing signed owner session for every read/write; writes require matching origin and JSON. It reuses the existing KV configuration and encryption key, with a separate `firststep_admin:newsletter_pipeline:v1` key and purpose-bound AES-GCM encryption. No prospect is stored in browser localStorage. Atomic Redis compare-and-set prevents overlapping writes from losing an edit or suppression. A conflicting tab must refresh, review its retained draft and save again.

Records are validated and limited to 5,000 prospects and 2 MiB per pipeline/import. Invalid URLs, invalid dates, duplicate IDs/emails and unproven verified sends fail validation. Export before archiving at capacity; there is no automatic destructive archival. An absent key is empty; invalid/error storage responses fail closed. Failed saves retain the editor draft. Navigating within Studio keeps it mounted; browser exit warns about unsaved edits. Local `?preview=1` works only in development, uses session memory and never writes production storage.

Release requires Evan's deployment approval, current production baseline and independent live persistence/auth verification. Existing env configuration must support Redis EVAL. No existing workspace record or key is migrated. Rollback the scoped admin/API changes to the previous deployment; keep the separate encrypted key recoverable rather than deleting it.

## Product pattern evidence, September 30, 2026

- [HubSpot's 2025 results](https://ir.hubspot.com/news-releases/news-release-details/hubspot-reports-strong-q4-and-full-year-2025-results) report 288,706 customers at December 31, 2025; this is adoption, not retention. Its [Q4 prepared remarks](https://ir.hubspot.com/static-files/16e62e09-ab4b-4839-8852-8b1bd09fad95) report net revenue retention of 105%, a revenue measure rather than a user cohort measure. Its [task queues](https://knowledge.hubspot.com/tasks/use-task-queues) demonstrate grouping follow-up work into an actionable queue.
- [Pipedrive](https://www.pipedrive.com/en/about) reports 100,000+ companies; this is an adoption count, not retention evidence. Its [activity model](https://support.pipedrive.com/en/article/activities) links next actions to leads and organizations. Its [activity/goals view](https://www.pipedrive.com/en/features/activities-goals) identifies due, overdue and unassigned work.
- The simpler comparison is Evan's existing private CSV: fast to import and inspect, but easy to miss an undated row or overwrite a decline. Keep its portable data model while adding derived attention, dated evidence, encrypted saves and conflict handling. No competitor branding or automated engagement pressure is copied.

Activation is a verified import save. The repeat loop is review an attention item, read evidence, save the next step, return at its date. The minimum measurable outcome is persisted next-action/date coverage and unresolved attention count, using stored record state without contact analytics. UI tests establish pre-release behavior only; there is no live usage or improved-retention claim.
