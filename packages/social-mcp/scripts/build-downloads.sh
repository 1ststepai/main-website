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
    *) ;;
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

if [ ! -f "${APP}/bin/social-mcp.js" ]; then
  echo "First run: unpacking PostPath and installing dependencies..."
  mkdir -p "${APP}"
  tar -xzf "${DIR}/postpath-app.tgz" -C "${APP}" --strip-components=1
  (cd "${APP}" && npm install --omit=dev)
fi

cd "${APP}"
echo "Starting PostPath by 1stStep.ai (Node ${NODE_VER})..."
exec node ./bin/social-mcp.js app
EOF
chmod +x "$MAC/Open PostPath.command"
cat > "$MAC/README.txt" <<'EOF'
PostPath by 1stStep.ai — macOS

1. Install Node.js 20+ from https://nodejs.org
2. Double-click "Open PostPath.command"
   (First launch: right-click → Open if macOS blocks an unidentified developer)
3. In the desk:
   - Paste OAuth credentials → Save credentials
   - Register redirect URI: http://127.0.0.1:47831/oauth/callback
   - Connect accounts
   - Click Enable in Cursor → restart Cursor

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
if (-not (Test-Path $entry)) {
  Write-Host "First run: unpacking PostPath and installing dependencies..."
  New-Item -ItemType Directory -Force -Path $App | Out-Null
  tar -xzf (Join-Path $Dir "postpath-app.tgz") -C $App --strip-components=1
  Push-Location $App
  npm install --omit=dev
  Pop-Location
}

Set-Location $App
Write-Host "Starting PostPath by 1stStep.ai (Node $raw)..."
node .\bin\social-mcp.js app
EOF
cat > "$WIN/Open-PostPath.bat" <<'EOF'
@echo off
setlocal
title PostPath by 1stStep.ai
cd /d "%~dp0"
echo.
echo  PostPath by 1stStep.ai
echo  Checking Node.js 20+ and launching the desk...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Open-PostPath.ps1"
if errorlevel 1 (
  echo.
  echo  Something went wrong. Need Node 20+? https://nodejs.org
  echo.
  pause
)
EOF
cat > "$WIN/README.txt" <<'EOF'
PostPath by 1stStep.ai — Windows

1. Install Node.js 20+ from https://nodejs.org
2. Double-click Open-PostPath.bat
3. In the desk:
   - Paste OAuth credentials → Save credentials
   - Register redirect URI: http://127.0.0.1:47831/oauth/callback
   - Connect accounts
   - Click Enable in Cursor → restart Cursor

Vault: %USERPROFILE%\.social-mcp
App files: %USERPROFILE%\.postpath\app
EOF
rm -f "$OUT/PostPath-Windows.zip"
(cd "$STAGE" && zip -rq "$OUT/PostPath-Windows.zip" PostPath-Windows)

echo "Built:"
ls -lh "$OUT"
