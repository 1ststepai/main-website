# SkillSprout intake contract

Backend: `POST https://www.1ststep.ai/api/skillsprout-intake`.
The SkillSprout repo owns the public form; this repo owns storage and admin visibility.
No deployment has been performed as part of this implementation.

```js
const response = await fetch('https://www.1ststep.ai/api/skillsprout-intake', {
  method: 'POST',
  credentials: 'omit',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email,
    consent: true, // only after an explicit unchecked-by-default consent control
    tag: 'SkillSprout',
    source: 'starter-pack' // or 'feature-request'
  })
});
```

The form should explain that the email is stored for the selected SkillSprout request. No child data or free-text feature request is collected by this API. `consent` must be boolean `true`; tag is exactly `SkillSprout`; source must be one of the two values above. Email is trimmed, lowercased and validated (maximum 254 characters). Server-generated UTC `timestamp`, UUID and `consent_version: skillsprout-intake-v1` are stored. Client timestamps and extra fields are discarded. Request maximum: 2 KiB.

Success: `201 {"ok":true}`. Errors: `{ "ok": false, "code": "..." }`: 400 invalid email/source/request or consent_required; 403 origin_not_allowed; 405 method_not_allowed; 413 body_too_large; 415 json_required; 429 rate_limited (Retry-After: 600); 503 storage_unavailable. Treat non-201 as unsaved and preserve the form for retry. No email or existing-contact status is returned. Repeated successful submissions create separate consent records; no uniqueness promise.

Only exact Origin `https://skillsprout.1ststep.ai` is accepted, including OPTIONS preflight. No browser secret or admin cookie is required. Origin enforcement protects browser callers, not forged scripted requests. An atomic Redis counter limits each platform-forwarded IP to 12 valid submissions per 10 minutes, failing closed on storage errors. IPs are stored only as keyed HMAC bucket names with 600-second expiry. Hosting must preserve Vercel's trusted forwarded-IP headers; do not place this endpoint behind a proxy that passes arbitrary client-supplied IP headers. No CAPTCHA is added; distributed abuse remains possible.

## Storage and admin

Uses existing KV_REST_API_URL / KV_REST_API_TOKEN and FIRSTSTEP_DATA_ENCRYPTION_KEY configuration. No new secrets or vendors. Encrypted AES-256-GCM records use purpose `skillsprout-contacts` and atomic LPUSH into Redis list `firststep_admin:skillsprout_contacts:v1`. This is independent of the workspace, newsletter and UGC documents. No mail sending, sales/nurture enrollment, export to outreach, or external integration occurs. No raw emails are logged.

Open `/admin/?page=skillsprout` or choose **SkillSprout Contacts** in the existing admin sidebar. The read-only view shows email, SkillSprout tag, source, consent timestamp and consent version. `GET /api/admin-skillsprout?offset=0` requires the existing admin session (not desktop pairing). Pages contain up to 50 newest-first records; concurrent intake may shift offsets, so refresh to return to the newest records. Responses are private/no-store. Preview shows an empty collection without invented contacts or counts.

Retention is indefinite, matching the existing manual admin storage model; no automatic deletion or workflow enrollment is introduced. A future retention/deletion workflow requires a separate scoped change. Deploy/release and public form integration are subsequent tasks, outside this draft PR.
