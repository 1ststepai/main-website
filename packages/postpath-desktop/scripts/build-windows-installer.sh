#!/usr/bin/env bash
# Build the unsigned Windows installer. The customer does not run this.
# It bundles Electron, the PostPath desk, and production dependencies.
# No code signing certificate is available. Do not disable SmartScreen.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
MCP="$REPO/packages/social-mcp"
OUT="$REPO/public/downloads/postpath"
STAGE="$ROOT/dist"

cd "$MCP"
if [[ ! -d node_modules/@modelcontextprotocol/sdk ]]; then
  npm ci --ignore-scripts --omit=dev
fi

cd "$ROOT"
if [[ ! -d node_modules/electron-builder ]]; then
  npm install --no-audit --no-fund --ignore-scripts
fi

# electron-builder prepares the Windows app directory. NSIS is compiled with the
# Linux makensis so the installer does not depend on Wine.
npx electron-builder --win dir --publish never
command -v makensis >/dev/null
(cd "$ROOT" && makensis build/postpath.nsi)

EXE="$(find "$STAGE" -maxdepth 1 -type f -name 'PostPath-*-windows-unsigned-internal-preview.exe' -print -quit)"
if [[ -z "$EXE" ]]; then
  echo "Windows installer was not produced" >&2
  exit 1
fi

mkdir -p "$OUT"
cp "$EXE" "$OUT/"
NAME="$(basename "$EXE")"
SHA="$(sha256sum "$OUT/$NAME" | awk '{print $1}')"
GIT_SHA="$(git -C "$REPO" rev-parse HEAD)"
VERSION="$(node -p "require('./package.json').version")"
cat > "$OUT/PostPath-windows-installer-provenance.json" <<EOF
{
  "filename": "$NAME",
  "version": "$VERSION",
  "gitSha": "$GIT_SHA",
  "sha256": "$SHA",
  "signed": false,
  "kind": "unsigned-internal-preview",
  "platform": "Windows",
  "runtime": "Electron bundled; system Node.js is not required",
  "smartScreen": "Leave SmartScreen enabled. Windows will warn because this build is unsigned."
}
EOF
echo "$SHA  $NAME" > "$OUT/PostPath-windows-installer.sha256"
echo "Built $NAME"
echo "$SHA"
