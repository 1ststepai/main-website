# PostPath install

The public site still says Request early access. It does not link an installer. This file is the internal install record for PR #51.

## Why the zip needed Node.js

The older Mac and Windows zips shipped source plus a launcher. The first launch ran `npm install` and required Node.js 20 or newer on PATH. Electron was only a developer shell, and it started that same system Node process.

The desk dependencies are `@modelcontextprotocol/sdk` and `zod`. They can be installed when the installer is built. The desk runtime can be the bundled Electron binary with `ELECTRON_RUN_AS_NODE=1`. A customer does not need a separate Node.js install.

## Windows installer

`packages/postpath-desktop/scripts/build-windows-installer.sh` produces an NSIS setup executable:

`public/downloads/postpath/PostPath-0.1.0-windows-unsigned-internal-preview.exe`

SHA256: `3c79455c8ad4b9329a276ab30ace075e729cb9bebe8cd6fe99c09185d27b3eb5`

The file is about 94 MB. It was built on Linux and has not been executed on Windows.

It is an unsigned internal preview. Windows SmartScreen will warn. Leave SmartScreen enabled. Choose More info, then Run anyway, for this file only. Do not turn SmartScreen off.

What the installer does:

- Copies PostPath into the per-user install folder the setup wizard shows.
- Adds a Start menu shortcut and a desktop shortcut named PostPath.
- Bundles the desk and its production dependencies. The first launch does not download Node.js and does not run npm.
- Opens the PostPath window. Close the window to quit.
- A second launch focuses the window that is already open. It does not start a second publisher.
- The vault file lock still stops another process from claiming a post that is already publishing.

The uninstaller removes the app and the shortcuts. It does not delete `%USERPROFILE%\.social-mcp`. Saved accounts, drafts, and scheduled posts stay there. To delete them, install or open PostPath and choose Remove saved accounts, then quit and open it again. That does not delete a video already on YouTube.

## Scheduled posts

A scheduled post sends only while the PostPath window is open and the computer is on. Closing PostPath, signing out, or shutting down pauses the queue. The posts remain scheduled. Opening PostPath again lets a due post send. If the app stops after a request may have reached a platform, that row becomes needs review and is not sent again automatically.

## Updates

There is no automatic updater. Quit PostPath, download the newer installer, and run it. It replaces the app files. The vault stays. Checksums in `PostPath-windows-installer-provenance.json` are for release verification, not a step in customer setup.

## macOS plan

Use the same Electron core and `ELECTRON_RUN_AS_NODE` desk launch. Package it with electron-builder as a signed, notarized `.dmg` or `.pkg`.

This environment cannot finish that package. It has no Apple Developer ID Application certificate, no notarization credentials, and no Mac. Do not treat an unsigned Mac build as accepted. Gatekeeper stays on. A customer Mac test waits until a signed build exists.

## YouTube first test

Not run. Do not connect, upload, or delete until Evan approves the account and the exact text.

The desk asks for the Google client id and secret once and stores them in the local vault. Do not paste them into chat. The redirect URI to register is `http://127.0.0.1:47831/oauth/callback`.

The YouTube connection requests `youtube.upload` and `youtube.readonly`, with offline access. Upload uses the resumable `videos.insert` call. Privacy defaults to `private`. The code sets category 22 and made-for-kids to false. PostPath cannot delete the YouTube video afterward.

`youtube.upload` is a sensitive Google scope. If the OAuth consent screen is in Testing, only listed test users can connect, and refresh tokens can expire after seven days. An unverified production app shows Google's unverified-app warning and may block that scope until Google verifies the app. This repository does not record that verification status. Use the existing Swing Trade Pros Google client, and make sure that Google account is allowed on its consent screen.

Prepared test, still not uploaded:

| Field | Value |
| --- | --- |
| Channel | Swing Trade Pros, after Evan confirms it |
| File | `docs/postpath-lanes/swing-trade-pros-private-test.mp4` |
| Title | PostPath private connection test |
| Description | Private upload from PostPath to confirm the Swing Trade Pros channel connection. Delete after the check. |
| Privacy | Private |

After a private upload, open the returned `youtube.com/watch` URL while signed into that channel. Then in YouTube Studio, delete that video.
