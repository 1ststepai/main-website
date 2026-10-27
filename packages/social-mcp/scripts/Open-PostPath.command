#!/bin/bash
# PostPath by 1stStep.ai — macOS / Linux launcher
# Double-click Open-PostPath.command, or run: ./scripts/Open-PostPath.command

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

open_nodejs() {
  if command -v open >/dev/null 2>&1; then
    open "https://nodejs.org" >/dev/null 2>&1 || true
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "https://nodejs.org" >/dev/null 2>&1 || true
  fi
}

show_node_required() {
  local detail="${1:-}"
  echo ""
  echo "PostPath needs Node.js 20 or newer."
  if [ -n "$detail" ]; then
    echo "$detail"
  fi
  echo "Download the LTS installer from https://nodejs.org"
  echo "Then run this launcher again."
  echo ""
  if command -v osascript >/dev/null 2>&1; then
    osascript -e 'display dialog "PostPath needs Node.js 20+.\nInstall from https://nodejs.org and try again." buttons {"OK"} default button 1 with title "PostPath"' >/dev/null 2>&1 || true
  fi
  open_nodejs
}

if ! command -v node >/dev/null 2>&1; then
  show_node_required "Node.js was not found on PATH."
  exit 1
fi

NODE_VER="$(node -v 2>/dev/null || true)"
if [ -z "$NODE_VER" ]; then
  show_node_required "Could not read the Node.js version."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  show_node_required "Found Node.js ${NODE_VER} — PostPath requires 20+."
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "First run: installing dependencies (this may take a minute)..."
  if ! npm install; then
    echo ""
    echo "Dependency install failed. Check your network, then try again."
    exit 1
  fi
fi

echo "Starting PostPath by 1stStep.ai (Node ${NODE_VER})..."
exec node ./bin/social-mcp.js app
