# Newsletter Studio desktop

The desktop shortcut launches a local Node program in a Brave app window. It reuses the compiled Studio interface and existing encrypted cloud pipeline/workspace storage. No extra packages or paid services are required.

## Connection

After the cloud endpoint is released, open **Newsletter Studio** on the Windows desktop and select **Pair this PC**. Sign in to the owner website with the existing password and MFA, then enter the six-digit code displayed by the desktop app. Requests expire after ten minutes. The PC subsequently connects with its own revocable credential, independently of the website's two-hour session.

The connection can read/save the newsletter pipeline, client records and quote drafts. Sending emails, creating payment links and Job Agent operations still require the website. Use **Manage linked PCs** to revoke a connection. Revocation does not delete business records.

## Installation and protection

Run `npm run build`, then `desktop/install.ps1` with the existing custom icon files. The current installation is under `%LOCALAPPDATA%\1stStep\Newsletter Studio`. The shortcut uses Windows Script Host to launch installed Node without a console window. Node and Brave must remain installed.

Credentials and launcher state are encrypted using Windows DPAPI for the current Windows account, and the installation folder allows only that account and SYSTEM. Cloud storage contains a credential hash, never the raw secret. The browser never receives the cloud credential. This protects stored credentials from other accounts; it does not protect against compromised software already running as the Windows owner.

The helper binds only to 127.0.0.1 on a random port. A short-lived, single-use launch ticket establishes an HttpOnly local session. Host, session and Origin checks protect local requests. Only the pipeline and workspace API methods are proxied to the fixed HTTPS cloud origin. Cloud redirects are refused. Offline failures retain the saved connection and do not erase cloud data. Reopening the shortcut reuses the running helper.

## Verification and release state — 2026-10-01

Installed locally and opened successfully; icon loads and the pairing screen has no horizontal overflow. Build passed; all 142 tests passed. Focused checks cover owner approval, wrong code, expiry, replay, revocation, credential scope, anonymous denial, loopback CSRF and a real Windows DPAPI round trip. An isolated in-memory browser test confirmed wrong-code recovery and pairing confirmation. That fixture grants no production access.

Evan explicitly approved independent review and production deployment on October 1. The reviewer found and then verified a fix for overbroad workspace writes. Device writes now preserve pricing/templates, issued or payment-linked quotes and delivery/payment metadata; canonical newsletter-pilot template addition is allowed. Updated consent explicitly describes saved workspace reads and restricted writes. All 143 tests and the build passed. Independent actual-handler checks confirmed valid draft/client saves and rejection of out-of-scope writes.

Deployed commit `d158f10` as `dpl_96JTApXwier5uuHcnvbACDETMc3D`, aliased to www.1ststep.ai. Live anonymous pairing/status/device-list and workspace/pipeline calls return 401/no-store. Homepage/admin return 200. The installed desktop app successfully created a live pending request and displayed its code. The owner login page is open for one-time password/MFA and code approval. Real owner approval and live cloud-sync/reopen verification remain pending. The website password/MFA implementation is unchanged.

For rollback, restore the website alias to deployment `dpl_DXZirLrdQFDreQdHuBJYAdo79UDh`. Device records use only `firststep_admin:desktop:*`; revoke paired devices before reverting if removing this feature. Pipeline and workspace keys must be preserved. The desktop shortcut can then point back to the authenticated website. Alias rollback does not change database records.
