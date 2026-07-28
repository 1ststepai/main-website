# 1stStep Studio security

The production admin is designed to fail closed. A hidden URL is not treated as authentication.

## Protections in code

- Production requires a one-way scrypt password hash and a six-digit authenticator code.
- Mobile admin login can use the authenticator code only when MFA is configured and `FIRSTSTEP_ADMIN_MOBILE_TOTP_LOGIN` is not `false`; desktop still requires the owner password plus MFA.
- Sessions are HMAC-signed, stored in an `HttpOnly`, `Secure`, `SameSite=Strict` cookie, and expire after two hours.
- Admin writes require a matching browser origin and JSON content type.
- Login attempts are rate-limited without logging a raw IP address.
- Admin pages and API responses use `no-store`; the admin is excluded from indexing and framing.
- A strict admin Content Security Policy allows scripts, styles, and API calls only from 1stStep.ai.
- Client workspaces and persisted App Idea Checker submissions are encrypted with AES-256-GCM before KV receives them.
- Encryption uses purpose-bound authenticated data so an encrypted lead cannot be replayed as an admin workspace.
- Production preview mode is disabled at build time.
- Application logs use request or record IDs and do not contain client names, emails, phone numbers, addresses, quote text, or agreement text.
- Stripe hosts all card entry. Card numbers never enter this application.

## Initial production setup

Run this locally:

```powershell
npm run security:generate-secrets
```

Save the generated owner password in a password manager. Add the generated hash, session secret, authenticator secret, and data-encryption key to Vercel Production environment variables. Add the authenticator URI to a TOTP-compatible authenticator, then delete the terminal output.

Never configure `FIRSTSTEP_ADMIN_PASSWORD` in production. It exists only for local compatibility.

If the original terminal output is lost after saving the owner password and TOTP secret, run:

```powershell
npm run security:recover-secrets
```

The recovery command privately asks for the saved owner password twice, preserves the existing authenticator setup, and prints only a replacement password hash, session secret, and data-encryption key.

## Browser and developer-tools boundary

- The owner password and authenticator code are never placed in cookies, local storage, page source, analytics, or application logs. The login fields are cleared as soon as a sign-in attempt is submitted.
- The cookie contains only a short-lived, signed session token. `HttpOnly` prevents website JavaScript from reading it, but the owner of an unlocked browser can still view or copy that token in browser developer tools.
- With password authentication, the browser must send the password once in the HTTPS login request. HTTPS protects it in transit, but developer tools on that same device can inspect the request payload. Client-side password hashing does not fix this because the visible hash becomes a replayable password equivalent.
- Eliminating password transmission requires a WebAuthn/passkey login flow. A passkey still cannot protect a session from someone who controls the unlocked browser or device.

## Key rotation

1. Generate a new 64-character hexadecimal encryption key.
2. Move the current key to `FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS`.
3. Set the new key as `FIRSTSTEP_DATA_ENCRYPTION_KEY`.
4. Open the authenticated admin and save the workspace once. The new write uses the active key.
5. Keep the previous key for at least `APP_IDEA_RETENTION_SECONDS` so older encrypted lead intakes remain recoverable, or re-encrypt those records separately.
6. Remove `FIRSTSTEP_DATA_ENCRYPTION_KEY_PREVIOUS` only after confirming the workspace opens and the previous lead-retention window has elapsed.

The previous key is intentionally decrypt-only.

## If compromise is suspected

1. Disable the production deployment or protect it at the Vercel project level.
2. Rotate the admin password hash, session secret, TOTP secret, data-encryption key, KV token, Resend key, and Stripe key.
3. Revoke suspicious Stripe payment links and inspect Resend, Stripe, KV, and Vercel access logs.
4. Restore only from a known-good encrypted backup.
5. Notify affected clients and follow applicable breach-notification requirements after legal review.

## Security boundary

Application-layer encryption protects KV exports, snapshots, backups, and a storage-only breach. It cannot keep data secret from a fully compromised live server that can read both runtime memory and environment variables. MFA, Vercel account MFA, least-privilege team access, provider audit logs, dependency updates, and incident response remain required.
