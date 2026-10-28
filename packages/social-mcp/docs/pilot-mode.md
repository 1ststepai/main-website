# PostPath pilot mode

Pilot mode is a local desk for a broker who picks topics and approves drafts. It runs on that person's Mac or Windows computer. There is no host, tunnel, or public URL. Nothing in pilot mode calls a publisher.

Install from the download zips built by `packages/social-mcp/scripts/build-downloads.sh`. Do not install this pilot with npm.

## Install

From a checkout of this repo, on a machine that already has Node.js 20+, bash, and zip:

```bash
bash packages/social-mcp/scripts/build-downloads.sh
```

That writes Mac and Windows zips under `public/downloads/postpath/`. Give the broker the zip for their computer. They unzip it and double-click the pilot launcher:

- macOS: `Open PostPath Pilot.command`
- Windows: `Open-PostPath-Pilot.bat`

The launcher checks Node.js 20+, unpacks the app under the home folder (`.postpath/app`), and opens the desk on `127.0.0.1` only. The first launch is the installer. The broker does not run npm.

The normal launcher does the same, and it also turns pilot mode on when `pilot.json` in the vault has `"pilot_mode": true`. Both pilot launchers set:

- `SOCIAL_MCP_PILOT_MODE=1`
- `SOCIAL_MCP_DRAFT_ONLY=1`
- `SOCIAL_MCP_PUBLISH_MODE=mock`

`SOCIAL_MCP_PILOT_MODE=0` in the environment keeps a process out of pilot mode on the same home. That is the owner path. The broker launchers do not use it.

## Set up the broker home

On the broker's computer, from the unpacked app (or from `packages/social-mcp` while developing):

```text
node ./bin/social-mcp.js pilot init --home C:\Users\Broker\.social-mcp --pin <pin>
node ./bin/social-mcp.js pilot init --home ~/.social-mcp --pin <pin>
```

Paths work on Windows and macOS. The command does not call a shell.

`pilot init` creates the home, `db.json`, `master.key`, and `pilot.json` from the insurance open-enrollment example (November 1–15, 2026). It sets pilot mode and draft-only MCP access. The owner PIN is stored as a hash. If you omit `--pin`, the PIN is written to `owner-pin.txt` in the home with mode 0600 and is not printed.

The example goals are quote requests, policy reviews, and referrals. Topic ideas are generic. They do not promise rates, savings, or subsidies. Every draft ends with a banner telling the broker to verify the claims.

`ffmpeg` is optional. If it is missing, captions, drafts, and approval still work. Only attaching or generating video is blocked, and the error says so.

## What the broker sees

The desk shows the campaign window, the goal picker, the topics for that goal, and the queue. Picking a topic writes per-network captions for the connected channels, or the defaults when none are connected: Facebook Page, Instagram, LinkedIn, and a YouTube Shorts script.

If `ANTHROPIC_API_KEY` is set on that computer, captions use the existing Claude writer. Otherwise a fixed template from `pilot.json` is used, so the loop works with no key. Regenerate and inline edit stay on the draft. Request changes sends it back to draft.

Approve moves the draft to **approved, waiting to post**. It does not schedule and it does not publish. There is no "Approve and post now" control. The due checker does not run. `/api/publish` returns 403.

Copy captions, Download CSV, and Download zip export the approved text and any media files so the owner can post them by hand.

Connect, settings, keys, license, and provider routes are hidden. They return 401 without the owner PIN (403 if no PIN was set). The approve button does not ask for the PIN. OAuth consent also asks for the owner PIN when one is set.

## Draft-only access

`connect_accounts`, `connect_bluesky`, and `upsert_profile` require `accounts:write` (or `owner`). A `drafts:write` token cannot start a connection or change a profile. `queue:approve` is still required to approve or publish, and it is not in the default scopes.

On a pilot home, stdio MCP is draft-only even without an HTTP PAT. Approve and publish tools are refused. `create_draft` still works. Cursor gets that behavior from:

```text
node ./bin/social-mcp.js install-cursor --pilot
```

That writes the `postpath` stdio entry in `~/.cursor/mcp.json` with `SOCIAL_MCP_PILOT_MODE=1`, `SOCIAL_MCP_DRAFT_ONLY=1`, and `SOCIAL_MCP_PUBLISH_MODE=mock`.

Mint or revoke a token without printing it:

```text
node ./bin/social-mcp.js pat create --scopes posts:read,drafts:write,accounts:read --out C:\Users\Broker\.social-mcp\draft.token --home C:\Users\Broker\.social-mcp
node ./bin/social-mcp.js pat revoke <id> --home C:\Users\Broker\.social-mcp
```

The file is mode 0600. The token is not written to the terminal.

An assistant that can only run a shell on the laptop, and cannot reach localhost MCP, can draft with:

```text
node ./bin/social-mcp.js drafts create --home <dir> --goal quote_requests --topic gather-documents
node ./bin/social-mcp.js drafts list --home <dir>
```

That CLI creates and lists drafts. It has no approve or publish command.

## Same home, two processes

The vault is `db.json` plus `master.key` under `SOCIAL_MCP_HOME` (default `~/.social-mcp` or `%USERPROFILE%\.social-mcp`). Writes take the `db.json.lock` file. Two PostPath processes on that home reload the file under the lock so they do not overwrite each other.

Publishing code outside pilot mode is unchanged. Turn pilot mode off for an owner session when you mean to use the existing publish desk. Do not point the broker launcher at a live publish session.
