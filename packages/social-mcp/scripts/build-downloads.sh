#!/usr/bin/env bash
# Build versioned Mac + Windows developer-preview zips into public/downloads/postpath/.
#
# Reconciliation:
# - Keeps main's Node.js 20+ launcher checks, dialogs, and first-run errors.
# - Does not emit PR 38's unversioned PostPath-macOS.zip / PostPath-Windows.zip blobs.
# - Rebuilds the archives from this script (version, checksums, manifest).
# - The intermediate postpath-app.tgz stays in the zip only; the loose copy is gitignored.
#
# This is a developer preview for a Node.js 20+ checkout-style payload.
# It is not a signed one-click installer. Do not bypass Gatekeeper or SmartScreen.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
OUT="${POSTPATH_DOWNLOADS_OUT:-$REPO/public/downloads/postpath}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

VERSION="$(node -p "require(process.argv[1]).version" "$ROOT/package.json")"
NODE_REQ="$(node -p "require(process.argv[1]).engines.node" "$ROOT/package.json")"
GIT_SHA="$(git -C "$REPO" rev-parse HEAD)"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z]+)*$ ]]; then
  echo "Refusing to build downloads: unexpected social-mcp version '$VERSION'" >&2
  exit 1
fi
if [[ -z "$NODE_REQ" || -z "$GIT_SHA" ]]; then
  echo "Refusing to build downloads: missing node requirement or git sha" >&2
  exit 1
fi

MAC_NAME="PostPath-${VERSION}-macOS-developer-preview.zip"
WIN_NAME="PostPath-${VERSION}-Windows-developer-preview.zip"

mkdir -p "$OUT"
rm -f "$OUT"/PostPath-*.zip "$OUT"/PostPath-macOS.zip "$OUT"/PostPath-Windows.zip \
  "$OUT"/SHA256SUMS.txt "$OUT"/manifest.json "$OUT"/postpath-app.tgz

APP_STAGE="$STAGE/postpath-app"
mkdir -p "$APP_STAGE"
shopt -s dotglob nullglob
for item in "$ROOT"/*; do
  base="$(basename "$item")"
  case "$base" in
    node_modules|test|skills|coverage|.git) continue ;;
    .env|.env.*|oauth.env|credentials.json|*.log|*.pem|*.key|*.tgz) continue ;;
    *) ;;
  esac
  cp -a "$item" "$APP_STAGE/"
done
tar -czf "$STAGE/postpath-app.tgz" -C "$STAGE" postpath-app
# Build id: the launcher compares this with the installed copy and replaces the app files when it differs.
APP_SHA="$(sha256sum "$STAGE/postpath-app.tgz" 2>/dev/null | awk '{print $1}' || shasum -a 256 "$STAGE/postpath-app.tgz" | awk '{print $1}')"
BUILD_ID="${VERSION}-${APP_SHA:0:16}"
printf '%s\n' "$BUILD_ID" > "$STAGE/postpath-app.build"

stamp_version() {
  local file="$1"
  local tmp
  tmp="$(mktemp)"
  sed "s/__POSTPATH_VERSION__/${VERSION}/g" "$file" > "$tmp"
  mv "$tmp" "$file"
}

MAC="$STAGE/PostPath-macOS"
mkdir -p "$MAC"
cp "$STAGE/postpath-app.tgz" "$STAGE/postpath-app.build" "$MAC/"
cat > "$MAC/Open PostPath.command" <<'EOF'
#!/bin/bash
# PostPath by 1stStep.ai — macOS developer preview __POSTPATH_VERSION__
# Not a one-click installer. Requires Node.js 20+. Unsigned; do not disable Gatekeeper.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="${HOME}/.postpath/app"
mkdir -p "${HOME}/.postpath"

open_nodejs() {
  if command -v open >/dev/null 2>&1; then
    open "https://nodejs.org" >/dev/null 2>&1 || true
  fi
}

require_node() {
  local detail="${1:-}"
  echo ""
  echo "PostPath needs Node.js 20 or newer."
  [ -n "$detail" ] && echo "$detail"
  echo "Download the LTS installer from https://nodejs.org"
  echo ""
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'display dialog "PostPath needs Node.js 20+.\nInstall from https://nodejs.org and try again." buttons {"OK"} default button 1 with title "PostPath"' >/dev/null 2>&1 || true
  fi
  open_nodejs
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  require_node "Node.js was not found on PATH."
fi

NODE_VER="$(node -v 2>/dev/null || true)"
NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ -z "$NODE_VER" ] || [ "${NODE_MAJOR}" -lt 20 ]; then
  require_node "Found ${NODE_VER:-unknown} — PostPath requires 20+."
fi

BUNDLE_BUILD="$(head -n 1 "${DIR}/postpath-app.build" 2>/dev/null | tr -d '[:space:]' || true)"
INSTALLED_BUILD="$(head -n 1 "${APP}/.postpath-build" 2>/dev/null | tr -d '[:space:]' || true)"

# Unpack into a staging folder first, so a failed unpack or npm install leaves the old app working.
# Only ~/.postpath/app is replaced. The data home (~/.social-mcp: db.json, master.key, pilot.json) is never touched.
stage_app() {
  local next="${HOME}/.postpath/app.next"
  rm -rf "${next}"
  mkdir -p "${next}"
  tar -xzf "${DIR}/postpath-app.tgz" -C "${next}" --strip-components=1
  (cd "${next}" && npm install --omit=dev)
  if [ -n "${BUNDLE_BUILD}" ]; then printf '%s\n' "${BUNDLE_BUILD}" > "${next}/.postpath-build"; fi
  rm -rf "${HOME}/.postpath/app.old"
  if [ -d "${APP}" ]; then mv "${APP}" "${HOME}/.postpath/app.old"; fi
  mv "${next}" "${APP}"
  rm -rf "${HOME}/.postpath/app.old"
}

if [ ! -f "${APP}/bin/social-mcp.js" ]; then
  echo "First run: unpacking PostPath developer preview __POSTPATH_VERSION__ and installing dependencies..."
  stage_app
elif [ -n "${BUNDLE_BUILD}" ] && [ "${BUNDLE_BUILD}" != "${INSTALLED_BUILD}" ]; then
  echo "Update: installed app ${INSTALLED_BUILD:-unknown} differs from this download ${BUNDLE_BUILD}. Replacing the app files at ${APP}."
  echo "Your data home is left as it is."
  stage_app
else
  echo "Relaunch: using existing app at ${APP} (${INSTALLED_BUILD:-unknown})"
fi

cd "${APP}"
echo "Starting PostPath by 1stStep.ai developer preview __POSTPATH_VERSION__ (Node ${NODE_VER})..."
echo "This is not a one-click installer. Node.js 20+ is required."
apply_pilot_env() {
  if [ -n "${SOCIAL_MCP_PILOT_MODE:-}" ]; then
    return
  fi
  local vault="${SOCIAL_MCP_HOME:-${HOME}/.social-mcp}"
  local file="${vault}/pilot.json"
  if [ -f "$file" ] && grep -Eq '"pilot_mode"[[:space:]]*:[[:space:]]*true' "$file"; then
    export SOCIAL_MCP_PILOT_MODE=1
    export SOCIAL_MCP_DRAFT_ONLY=1
    if [ -z "${SOCIAL_MCP_PUBLISH_MODE:-}" ]; then
      export SOCIAL_MCP_PUBLISH_MODE=mock
    fi
    echo "pilot.json is on: starting in pilot mode. Publish stays off."
  fi
}
apply_pilot_env

if [ "${POSTPATH_NO_OPEN:-}" = "1" ]; then
  exec node ./bin/social-mcp.js app --no-open
fi
exec node ./bin/social-mcp.js app
EOF
stamp_version "$MAC/Open PostPath.command"
chmod +x "$MAC/Open PostPath.command"
cat > "$MAC/Open PostPath Pilot.command" <<'EOF'
#!/bin/bash
# Start the broker desk: topic picker, drafts, approve. Nothing is published.
export SOCIAL_MCP_PILOT_MODE=1
export SOCIAL_MCP_DRAFT_ONLY=1
export SOCIAL_MCP_PUBLISH_MODE=mock
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/Open PostPath.command"
EOF
chmod +x "$MAC/Open PostPath Pilot.command"
cat > "$MAC/README.txt" <<'EOF'
PostPath by 1stStep.ai — macOS developer preview __POSTPATH_VERSION__

This is a developer preview for people who already have Node.js 20 or newer.
It is not a one-click installer. It is not signed or notarized.
macOS Gatekeeper will treat it as an unidentified developer. Do not disable Gatekeeper.

Fresh install:
1. Install Node.js 20+ from https://nodejs.org
2. Unzip this folder somewhere you can write.
3. Double-click "Open PostPath.command".
   Broker pilot: double-click "Open PostPath Pilot.command" instead.
   If macOS blocks it, right-click the command file and choose Open.
4. The first launch unpacks the app into ~/.postpath/app and runs npm install once.
5. In the desk:
   - Paste OAuth credentials → Save credentials
   - Register redirect URI: http://127.0.0.1:47831/oauth/callback
   - Connect accounts
   - Click Enable in Cursor → restart Cursor

Redirect URI for every developer console:
http://127.0.0.1:47831/oauth/callback

Relaunch:
Run "Open PostPath.command" again. When ~/.postpath/app matches this download, the launcher starts it without unpacking again.

Upgrade:
Quit PostPath. Unzip the newer developer preview and run its launcher. It sees the different build,
replaces ~/.postpath/app, and leaves your data in ~/.social-mcp alone.
Do not delete ~/.social-mcp.

Credentials:
The vault stays in ~/.social-mcp (override with SOCIAL_MCP_HOME).
Uninstalling or upgrading the app does not delete the vault.

Uninstall:
Quit PostPath. Delete this unzipped folder and delete ~/.postpath/app.
Leave ~/.social-mcp in place if you want saved connections later.

Node.js: 20+
Signed: no
Kind: developer preview
EOF
stamp_version "$MAC/README.txt"

WIN="$STAGE/PostPath-Windows"
mkdir -p "$WIN"
cp "$STAGE/postpath-app.tgz" "$STAGE/postpath-app.build" "$WIN/"
cat > "$WIN/Open-PostPath.ps1" <<'EOF'
# PostPath by 1stStep.ai — Windows developer preview __POSTPATH_VERSION__
# Not a one-click installer. Requires Node.js 20+. Unsigned; do not disable SmartScreen.
$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $env:USERPROFILE ".postpath\app"

function Show-NodeRequired {
  param([string]$Detail)
  Write-Host ""
  Write-Host "PostPath needs Node.js 20 or newer." -ForegroundColor Yellow
  if ($Detail) { Write-Host $Detail -ForegroundColor Yellow }
  Write-Host "Download the LTS installer from https://nodejs.org" -ForegroundColor Yellow
  Write-Host ""
  try { Start-Process "https://nodejs.org" } catch { }
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Show-NodeRequired "Node.js was not found on PATH."
  exit 1
}

try {
  $raw = (& node -v 2>$null)
  $major = [int](($raw -replace '^v', '').Split('.')[0])
} catch {
  Show-NodeRequired "Could not read the Node.js version."
  exit 1
}

if ($major -lt 20) {
  Show-NodeRequired "Found Node.js $raw — PostPath requires 20+."
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".postpath") | Out-Null
$entry = Join-Path $App "bin\social-mcp.js"
$Root = Join-Path $env:USERPROFILE ".postpath"
$bundleFile = Join-Path $Dir "postpath-app.build"
$installedFile = Join-Path $App ".postpath-build"
$BundleBuild = if (Test-Path -LiteralPath $bundleFile) { (Get-Content -LiteralPath $bundleFile -TotalCount 1).Trim() } else { "" }
$InstalledBuild = if (Test-Path -LiteralPath $installedFile) { (Get-Content -LiteralPath $installedFile -TotalCount 1).Trim() } else { "" }

# Unpack into a staging folder first so a failed unpack or npm install leaves the old app working.
# Only %USERPROFILE%\.postpath\app is replaced. The data home (.social-mcp: db.json, master.key, pilot.json) is never touched.
function Install-AppFiles {
  $next = Join-Path $Root "app.next"
  $old = Join-Path $Root "app.old"
  if (Test-Path -LiteralPath $next) { Remove-Item -LiteralPath $next -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $next | Out-Null
  tar -xzf (Join-Path $Dir "postpath-app.tgz") -C $next --strip-components=1
  if ($LASTEXITCODE -ne 0) { throw "Could not unpack postpath-app.tgz." }
  Push-Location $next
  npm install --omit=dev
  $npmCode = $LASTEXITCODE
  Pop-Location
  if ($npmCode -ne 0) { throw "npm install failed." }
  if ($BundleBuild) { Set-Content -LiteralPath (Join-Path $next ".postpath-build") -Value $BundleBuild }
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }
  try {
    if (Test-Path -LiteralPath $App) { Move-Item -LiteralPath $App -Destination $old }
  } catch {
    throw "Close every PostPath window, then run the launcher again. The app folder is in use."
  }
  Move-Item -LiteralPath $next -Destination $App
  if (Test-Path -LiteralPath $old) { Remove-Item -LiteralPath $old -Recurse -Force }
}

if (-not (Test-Path -LiteralPath $entry)) {
  Write-Host "First run: unpacking PostPath developer preview __POSTPATH_VERSION__ and installing dependencies..."
  Install-AppFiles
} elseif ($BundleBuild -and ($BundleBuild -ne $InstalledBuild)) {
  Write-Host "Update: installed app $InstalledBuild differs from this download $BundleBuild. Replacing the app files at $App."
  Write-Host "Your data home is left as it is."
  Install-AppFiles
} else {
  Write-Host "Relaunch: using existing app at $App ($InstalledBuild)"
}

function Enable-PilotFromFile {
  if ($env:SOCIAL_MCP_PILOT_MODE) { return }
  $vault = if ($env:SOCIAL_MCP_HOME) { $env:SOCIAL_MCP_HOME } else { Join-Path $env:USERPROFILE ".social-mcp" }
  $file = Join-Path $vault "pilot.json"
  if (-not (Test-Path -LiteralPath $file)) { return }
  $rawJson = Get-Content -LiteralPath $file -Raw
  if ($rawJson -match '"pilot_mode"\s*:\s*true') {
    $env:SOCIAL_MCP_PILOT_MODE = "1"
    $env:SOCIAL_MCP_DRAFT_ONLY = "1"
    if (-not $env:SOCIAL_MCP_PUBLISH_MODE) { $env:SOCIAL_MCP_PUBLISH_MODE = "mock" }
    Write-Host "pilot.json is on: starting in pilot mode. Publish stays off."
  }
}
Enable-PilotFromFile

Set-Location $App
Write-Host "Starting PostPath by 1stStep.ai developer preview __POSTPATH_VERSION__ (Node $raw)..."
Write-Host "This is not a one-click installer. Node.js 20+ is required."
if ($env:POSTPATH_NO_OPEN -eq "1") {
  node .\bin\social-mcp.js app --no-open
} else {
  node .\bin\social-mcp.js app
}
exit $LASTEXITCODE
EOF
stamp_version "$WIN/Open-PostPath.ps1"
cat > "$WIN/Open-PostPath.bat" <<'EOF'
@echo off
setlocal
title PostPath by 1stStep.ai developer preview
cd /d "%~dp0"
echo.
echo  PostPath by 1stStep.ai developer preview __POSTPATH_VERSION__
echo  Not a one-click installer. Checking Node.js 20+ and launching the desk...
echo  SmartScreen may warn because this preview is unsigned. Do not disable it.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-PostPath.ps1"
if errorlevel 1 (
  echo.
  echo  Something went wrong. Need Node 20+? https://nodejs.org
  echo.
  pause
)
EOF
stamp_version "$WIN/Open-PostPath.bat"
cat > "$WIN/Open-PostPath-Pilot.bat" <<'EOF'
@echo off
setlocal
title PostPath pilot
cd /d "%~dp0"
set SOCIAL_MCP_PILOT_MODE=1
set SOCIAL_MCP_DRAFT_ONLY=1
set SOCIAL_MCP_PUBLISH_MODE=mock
echo.
echo  PostPath pilot. Topic picker, drafts, and approve. Nothing is published.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-PostPath.ps1"
if errorlevel 1 pause
EOF
cat > "$WIN/README.txt" <<'EOF'
PostPath by 1stStep.ai — Windows developer preview __POSTPATH_VERSION__

This is a developer preview for people who already have Node.js 20 or newer.
It is not a one-click installer. It is not Authenticode-signed.
Windows SmartScreen may warn. Do not disable SmartScreen.

Fresh install:
1. Install Node.js 20+ from https://nodejs.org
2. Unzip this folder somewhere you can write.
3. Double-click Open-PostPath.bat.
   Broker pilot: double-click Open-PostPath-Pilot.bat instead.
4. The first launch unpacks the app into %USERPROFILE%\.postpath\app and runs npm install once.
5. In the desk:
   - Paste OAuth credentials → Save credentials
   - Register redirect URI: http://127.0.0.1:47831/oauth/callback
   - Connect accounts
   - Click Enable in Cursor → restart Cursor

Redirect URI for every developer console:
http://127.0.0.1:47831/oauth/callback

Relaunch:
Run Open-PostPath.bat again. When %USERPROFILE%\.postpath\app matches this download, the launcher starts it without unpacking again.

Upgrade:
Quit PostPath. Unzip the newer developer preview and run its launcher. It sees the different build,
replaces %USERPROFILE%\.postpath\app, and leaves your data in %USERPROFILE%\.social-mcp alone.
Do not delete %USERPROFILE%\.social-mcp.

Credentials:
The vault stays in %USERPROFILE%\.social-mcp (override with SOCIAL_MCP_HOME).
Uninstalling or upgrading the app does not delete the vault.

Uninstall:
Quit PostPath. Delete this unzipped folder and delete %USERPROFILE%\.postpath\app.
Leave %USERPROFILE%\.social-mcp in place if you want saved connections later.

Node.js: 20+
Signed: no
Kind: developer preview
EOF
stamp_version "$WIN/README.txt"

rm -f "$OUT/$MAC_NAME" "$OUT/$WIN_NAME"
(cd "$STAGE" && zip -rq "$OUT/$MAC_NAME" PostPath-macOS)
(cd "$STAGE" && zip -rq "$OUT/$WIN_NAME" PostPath-Windows)

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

MAC_SHA="$(sha256_file "$OUT/$MAC_NAME")"
WIN_SHA="$(sha256_file "$OUT/$WIN_NAME")"
{
  printf '%s  %s\n' "$MAC_SHA" "$MAC_NAME"
  printf '%s  %s\n' "$WIN_SHA" "$WIN_NAME"
} > "$OUT/SHA256SUMS.txt"

POSTPATH_VERSION="$VERSION" \
POSTPATH_GIT_SHA="$GIT_SHA" \
POSTPATH_NODE_REQUIREMENT="$NODE_REQ" \
POSTPATH_MAC_ZIP_NAME="$MAC_NAME" \
POSTPATH_WIN_ZIP_NAME="$WIN_NAME" \
POSTPATH_MAC_SHA="$MAC_SHA" \
POSTPATH_WIN_SHA="$WIN_SHA" \
POSTPATH_MANIFEST_PATH="$OUT/manifest.json" \
node --input-type=module -e '
import { writeFileSync } from "node:fs";
const manifest = {
  version: process.env.POSTPATH_VERSION,
  gitSha: process.env.POSTPATH_GIT_SHA,
  nodeRequirement: process.env.POSTPATH_NODE_REQUIREMENT,
  signed: false,
  kind: "developer-preview",
  artifacts: [
    { filename: process.env.POSTPATH_MAC_ZIP_NAME, platform: "macOS", sha256: process.env.POSTPATH_MAC_SHA },
    { filename: process.env.POSTPATH_WIN_ZIP_NAME, platform: "Windows", sha256: process.env.POSTPATH_WIN_SHA },
  ],
};
writeFileSync(process.env.POSTPATH_MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
'

(
  cd "$OUT"
  sha256sum -c SHA256SUMS.txt
)

echo "Built developer preview ${VERSION} (${GIT_SHA}) into ${OUT}"
ls -lh "$OUT"
