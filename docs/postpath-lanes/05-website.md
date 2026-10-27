# Lane 5 — Website and conversion

Status: locally verified (unit tests and production build). Visual browser QA was not run in this environment.

## Scope

Branch `cursor/postpath-site-funnel-da32`. Marketing site only. No merge, deploy, ads, or new analytics vendor.

Reused the PostPath homepage section from `cursor/postpath-site-ship-c683` (`93a919999fbf03a228bf08a328a752c74e7db7ab`) without replacing the consultancy homepage. Brought CRM names from `cursor/postpath-crm-advertise-c683` as planned text only.

`docs/architecture/decision-log.md` still mentions a “Download for Mac” nav. This lane follows the later brief: the customer path is email, and that decision-log line was not edited because it is outside this lane’s file ownership.

## Claims corrected

- Primary control is **Request early access**, opening `mailto:evan@1ststep.ai`. No button links to a zip.
- The desk badge says **Simulated**. It does not say LIVE DEMO.
- Networks in the local app are listed without a claim of real-account publishing acceptance. TikTok is an inbox handoff.
- Snapchat and WhatsApp are restricted text labels. The page does not describe them as publishing and does not use their logo files.
- HubSpot, Salesforce, GoHighLevel, and Pipedrive are planned. The CRM block does not call them live, shipping, or connected, and it does not use their logos.
- Removed the competitor price range and the “No Monthly API Fees” line.
- Open Graph and Twitter text matches the email early-access product. Canonical host remains `https://postpath.1ststep.ai/`. Host rewrites in `vercel.json` were already present.

## Discovery

PostPath is linked from the homepage nav, homepage product section, homepage footer, Work nav/card/footer, and Tools nav/card/footer. Homepage hero and Begin Your Journey stay the consultancy path. Events `postpath_early_access_click` and `postpath_nav_click` go through `src/site-analytics.js` with placement only. The form tracker does not send name, email, or message body.

## Not visually verified

No browser was used. Markup checks covered focus rings, 44px primary controls, wrapping PostPath nav under 980px, and Midnight / Electric / Violet / Sunrise contrast for the new controls (midnight text on `#3B82F6`, midnight text on `#FF6B6B`, cloud text on `#1F2937`). Desktop and mobile screenshots were not taken.
