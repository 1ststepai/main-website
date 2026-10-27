#!/usr/bin/env bash
# Build Mac + Windows download zips into public/downloads/postpath/
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
OUT="$REPO/public/downloads/postpath"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT"

APP_STAGE="$STAGE/postpath-app"
mkdir -p "$APP_STAGE"
shopt -s dotglob nullglob
for item in "$ROOT"/*; do
  base="$(basename "$item")"
  case "$base" in
    node_modules|test|*.log|skills) continue ;;
  esac
  cp -a "$item" "$APP_STAGE/"
done
tar -czf "$OUT/postpath-app.tgz" -C "$STAGE" postpath-app

MAC="$STAGE/PostPath-macOS"
mkdir -p "$MAC"
cp "$OUT/postpath-app.tgz" "$MAC/"
cat > "$MAC/Open PostPath.command" <<'EOF'
#!/bin/bash
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
APP="${HOME}/.postpath/app"
mkdir -p "${HOME}/.postpath"

if ! command -v node >/dev/null 2>&1; then
  osascript -e 'display dialog "Node.js 20+ is required for PostPath.\nInstall it from https://nodejs.org and try again." buttons {"OK"} default button 1 with title "PostPath"' || true
  open "https://nodejs.org"
  exit 1
fi

if [ ! -f "${APP}/bin/social-mcp.js" ]; then
  mkdir -p "${APP}"
  tar -xzf "${DIR}/postpath-app.tgz" -C "${APP}" --strip-components=1
  (cd "${APP}" && npm install --omit=dev)
fi

cd "${APP}"
exec node ./bin/social-mcp.js app
EOF
chmod +x "$MAC/Open PostPath.command"
cat > "$MAC/README.txt" <<'EOF'
PostPath by 1stStep.ai — macOS

1. Install Node.js 20+ from https://nodejs.org
2. Double-click "Open PostPath.command"
   (First launch: right-click → Open if macOS blocks an unidentified developer)
3. In the desk: save OAuth credentials, connect accounts, Enable in Cursor

Redirect URI for every developer console:
http://127.0.0.1:47831/oauth/callback

Vault: ~/.social-mcp
App files: ~/.postpath/app
EOF
rm -f "$OUT/PostPath-macOS.zip"
(cd "$STAGE" && zip -rq "$OUT/PostPath-macOS.zip" PostPath-macOS)

WIN="$STAGE/PostPath-Windows"
mkdir -p "$WIN"
cp "$OUT/postpath-app.tgz" "$WIN/"
cat > "$WIN/Open-PostPath.ps1" <<'EOF'
$ErrorActionPreference = "Stop"
$Dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$App = Join-Path $env:USERPROFILE ".postpath\app"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js 20+ is required. Install from https://nodejs.org and try again."
  Start-Process "https://nodejs.org"
  exit 1
}

New-Item -ItemType Directory -Force -Path (Join-Path $env:USERPROFILE ".postpath") | Out-Null
$entry = Join-Path $App "bin\social-mcp.js"
if (-not (Test-Path $entry)) {
  New-Item -ItemType Directory -Force -Path $App | Out-Null
  tar -xzf (Join-Path $Dir "postpath-app.tgz") -C $App --strip-components=1
  Push-Location $App
  npm install --omit=dev
  Pop-Location
}

Set-Location $App
node .\bin\social-mcp.js app
EOF
cat > "$WIN/Open-PostPath.bat" <<'EOF'
@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-PostPath.ps1"
if errorlevel 1 pause
EOF
cat > "$WIN/README.txt" <<'EOF'
PostPath by 1stStep.ai — Windows

1. Install Node.js 20+ from https://nodejs.org
2. Double-click Open-PostPath.bat
3. In the desk: save OAuth credentials, connect accounts, Enable in Cursor

Redirect URI for every developer console:
http://127.0.0.1:47831/oauth/callback

Vault: %USERPROFILE%\.social-mcp
App files: %USERPROFILE%\.postpath\app
EOF
rm -f "$OUT/PostPath-Windows.zip"
(cd "$STAGE" && zip -rq "$OUT/PostPath-Windows.zip" PostPath-Windows)

echo "Built:"
ls -lh "$OUT"
