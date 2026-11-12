# DDoS and abuse runbook

This is the incident guide for `1ststep.ai` and `postpath.1ststep.ai`, which both run on the Vercel project `main-website-repo` in team `1ststep` (Pro plan). Notify **evan@1ststep.ai** for any suspected attack, 429 flood, or firewall change.

Do not enable paid add-ons (including OWASP / Security Plus) or publish live firewall changes without Evan’s approval. Platform DDoS mitigation is already on and is free.

## What is already in place

- **Vercel platform DDoS mitigation** is automatic on every plan. In the 24 hours before this runbook was written it was the only active rule (`sys_dos_mitigation`) and it denied or challenged a share of traffic with no custom WAF rules configured.
- **Application rate limits** on write, paid, login, and other costly `/api` routes: per-IP sliding fixed window that returns `429`, sets `Retry-After`, then escalates to a longer temporary block. Denied hits are logged as JSON (see below).
- **In-memory / per-instance limit.** These counters live in the serverless process (`globalThis` map, max 5,000 keys). Vercel may run many instances, so one client can use about *N × the configured limit* across regions and instances. This is free and uses no new vendor. Edge WAF rate limits (below) are the cross-instance layer, once approved.

## How to read 429 logs

1. Open the project logs: [Vercel runtime logs for main-website-repo](https://vercel.com/1ststep/main-website-repo/logs).
2. Filter on `rate_limited` or `rate_limit_blocked`.
3. Each line is JSON with:
   - `event`: `rate_limited` (short throttle) or `rate_limit_blocked` (temporary block)
   - `scope`: which route policy fired (`admin-login`, `commercial-intake`, `booking-webhook`, `social-agent`, and so on)
   - `ip_hash`: SHA-256 of the client IP, never the raw address
   - `ip_source`: which header was trusted (`x-real-ip`, `x-vercel-forwarded-for`, or `x-forwarded-for`)
   - `stage`, `count`, `limit`, `retry_after_seconds`
4. Application logs must not contain raw IPs, emails, cookies, tokens, or secrets. For the real client IP and path, use [Firewall traffic](https://vercel.com/1ststep/main-website-repo/firewall/traffic) or the request metadata in the runtime log explorer, not the JSON `ip_hash` field.

## Emergency toggles (needs Evan’s go)

Run these from a trusted machine, after `vercel link` or with `--scope 1ststep --project main-website-repo`. Review `vercel firewall diff` before any publish. Do not pause system mitigations.

### Attack Challenge Mode

Use this when the site is under an active attack and legitimate visitors can tolerate a challenge page. It takes effect immediately. Verified search crawlers are exempt. The CLI prompts for confirmation, so Evan or an approved operator should run it:

```bash
vercel --scope 1ststep firewall attack-mode enable --project main-website-repo --duration 1h --yes
# or --duration 6h / 24h
```

Turn it off when traffic returns to normal:

```bash
vercel --scope 1ststep firewall attack-mode disable --project main-website-repo --yes
```

The dashboard control is at [Project Firewall](https://vercel.com/1ststep/main-website-repo/firewall).

### Bot Protection

Managed Bot Protection is currently **off**. AI Bots is set to **allow**. BotID is **basic**. Enabling Bot Protection can challenge or block real users, so start in log mode if the product UI offers it, then raise the action only after Evan reviews traffic.

Dashboard: [Bot Management](https://vercel.com/1ststep/main-website-repo/firewall). There is no safe one-line publish in this runbook; confirm the action (log / challenge / deny) with Evan first.

### Custom firewall rules

There are currently **no custom rules and no IP blocks**. `vercel.json` can only express `deny` and `challenge`, not `rate_limit`. The commands below are the exact rules to add when Evan approves. Stage them first with `--rate-limit-action log` or `--action log`, inspect [firewall traffic](https://vercel.com/1ststep/main-website-repo/firewall/traffic), then tighten.

```bash
# 1. Log obviously abusive probes (publish, review traffic, then change --action to deny)
vercel --scope 1ststep firewall rules add "Log exploit probes" \
  --project main-website-repo \
  --condition '{"type":"path","op":"inc","value":["/wp-admin","/.env","/.git/config","/phpmyadmin"]}' \
  --action log --yes

# 2. Log a generous per-IP cap on write APIs (60s / 60 requests; later switch to rate_limit)
vercel --scope 1ststep firewall rules add "Log API write rate" \
  --project main-website-repo \
  --condition '{"type":"path","op":"pre","value":"/api"}' \
  --condition '{"type":"method","op":"inc","value":["POST","PUT","PATCH","DELETE"]}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 60 \
  --rate-limit-keys ip \
  --rate-limit-action log --yes

# 3. Tighter log cap on public lead and form posts
vercel --scope 1ststep firewall rules add "Log public form rate" \
  --project main-website-repo \
  --condition '{"type":"path","op":"inc","value":["/api/commercial-intake","/api/fit-check","/api/course-signup","/api/app-idea-checker","/api/morris-county-offer","/api/auto-model-router-feedback"]}' \
  --condition '{"type":"method","op":"eq","value":"POST"}' \
  --action rate_limit \
  --rate-limit-window 600 \
  --rate-limit-requests 20 \
  --rate-limit-keys ip \
  --rate-limit-action log --yes

# 4. Log admin login and payment/email abuse
vercel --scope 1ststep firewall rules add "Log admin write rate" \
  --project main-website-repo \
  --condition '{"type":"path","op":"inc","value":["/api/admin-session","/api/admin-create-payment-link","/api/admin-deactivate-payment-links","/api/admin-send-quote"]}' \
  --condition '{"type":"method","op":"inc","value":["POST","DELETE"]}' \
  --action rate_limit \
  --rate-limit-window 600 \
  --rate-limit-requests 30 \
  --rate-limit-keys ip \
  --rate-limit-action log --yes

# 5. Log Post Path / social API abuse (covers postpath.1ststep.ai because it is the same project)
vercel --scope 1ststep firewall rules add "Log social API rate" \
  --project main-website-repo \
  --condition '{"type":"path","op":"pre","value":"/api/social"}' \
  --action rate_limit \
  --rate-limit-window 60 \
  --rate-limit-requests 120 \
  --rate-limit-keys ip \
  --rate-limit-action log --yes
```

After adding drafts:

```bash
vercel --scope 1ststep firewall diff --project main-website-repo
# Only when Evan has approved the staged change:
vercel --scope 1ststep firewall publish --project main-website-repo --yes
```

To block a confirmed abusive IP after review:

```bash
vercel --scope 1ststep firewall ip-blocks block 203.0.113.0 --project main-website-repo --notes "Abuse, ticket or log id" --yes
# then publish, as above
```

OWASP managed rules require a paid **Security Plus** upgrade on this plan. Do not purchase it unless Evan approves a paid change.

## Roll back

- **Attack Challenge Mode:** `vercel --scope 1ststep firewall attack-mode disable --project main-website-repo --yes`
- **Unpublished drafts:** `vercel --scope 1ststep firewall discard --project main-website-repo --yes`
- **A published custom rule:** `vercel --scope 1ststep firewall rules disable "Rule Name" --project main-website-repo --yes` then `publish --yes`. To remove it entirely, `firewall rules remove "Rule Name" --yes` and publish. Persistent denies can outlive a removed rule; check `vercel firewall persistent-actions list --project main-website-repo`.
- **An IP block:** `vercel --scope 1ststep firewall ip-blocks unblock <ip-or-id> --project main-website-repo --yes` then publish.
- **Application rate limits:** revert or disable the production deployment that introduced them, or redeploy the previous successful production deployment from the Vercel dashboard. Limits can be relaxed without a rollback by raising `APP_IDEA_RATE_LIMIT_MAX` or `APP_IDEA_RATE_LIMIT_WINDOW_MS` on the project (these set the default public-form policy).
- **Do not** run `vercel firewall system-mitigations pause`. That turns off platform DDoS protection.

## Application rate-limit policy (code)

Public forms default to 12 requests / 10 minutes per IP, then 429, then a 30-minute block after 24 requests in the same window. Admin login uses the same 12-request window and blocks after 20. Read, write, payment, email, PDF, reviews, and webhook scopes are documented in `lib/http/rateLimit.js`. Client IP is taken from `x-real-ip` or `x-vercel-forwarded-for` first; `X-Forwarded-For` is only used when those are absent, and only the rightmost address is counted so a spoofed prefix cannot reset the bucket.
