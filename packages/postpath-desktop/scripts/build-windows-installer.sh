#!/usr/bin/env bash
# Build the Windows installer. The customer does not run this.
# It bundles Electron, the PostPath desk, and production dependencies.
# Signing happens only when CSC_LINK and CSC_KEY_PASSWORD are set and
# osslsigncode can verify the result. Otherwise the installer stays unsigned.
# Do not disable SmartScreen. Do not commit a certificate.
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
BUILDER="$ROOT/node_modules/.bin/electron-builder"
if [[ ! -x "$BUILDER" ]]; then
  echo "electron-builder is not installed in postpath-desktop" >&2
  exit 1
fi
SIGNING=false
if [[ -n "${CSC_LINK:-}" && -n "${CSC_KEY_PASSWORD:-}" ]]; then
  if ! command -v osslsigncode >/dev/null 2>&1; then
    echo "CSC_LINK is set but osslsigncode is not installed. Refusing to emit an unsigned file as if it were signed." >&2
    echo "Install osslsigncode, or unset CSC_LINK to build the unsigned internal preview." >&2
    exit 1
  fi
  SIGNING=true
  export CSC_IDENTITY_AUTO_DISCOVERY="${CSC_IDENTITY_AUTO_DISCOVERY:-true}"
fi

BUILD_ARGS=(--win dir --publish never)
if [[ "$SIGNING" == true ]]; then
  BUILD_ARGS+=(--config.win.signAndEditExecutable=true --config.win.verifyUpdateCodeSignature=true)
else
  export CSC_IDENTITY_AUTO_DISCOVERY=false
fi
"$BUILDER" "${BUILD_ARGS[@]}"
command -v makensis >/dev/null
(cd "$ROOT" && makensis build/postpath.nsi)

EXE="$(find "$STAGE" -maxdepth 1 -type f -name 'PostPath-*-windows-unsigned-internal-preview.exe' -print -quit)"
if [[ -z "$EXE" ]]; then
  echo "Windows installer was not produced" >&2
  exit 1
fi

SIGNED=false
KIND="unsigned-internal-preview"
SMARTSCREEN="Leave SmartScreen enabled. Windows will warn because this build is unsigned."
if [[ "$SIGNING" == true ]]; then
  SIGNED_EXE="${EXE/-windows-unsigned-internal-preview.exe/-windows.exe}"
  # CSC_LINK may be a filesystem path. Base64 and remote certs are not expanded here.
  if [[ ! -f "$CSC_LINK" ]]; then
    echo "CSC_LINK must be a path to a .pfx on this machine. A base64 blob is not used, so the certificate is never written into the repo." >&2
    exit 1
  fi
  osslsigncode sign -pkcs12 "$CSC_LINK" -pass "$CSC_KEY_PASSWORD" -n "PostPath" -i "https://1ststep.ai" -t "http://timestamp.digicert.com" -in "$EXE" -out "$SIGNED_EXE"
  osslsigncode verify -in "$SIGNED_EXE" >/dev/null
  EXE="$SIGNED_EXE"
  SIGNED=true
  KIND="authenticode"
  SMARTSCREEN="Signed with the certificate supplied at build time. SmartScreen can still warn until that certificate has reputation. An EV certificate is what reduces the warning. This is not a macOS notarized build."
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
  "signed": $SIGNED,
  "kind": "$KIND",
  "platform": "Windows",
  "runtime": "Electron bundled; system Node.js is not required",
  "smartScreen": "$SMARTSCREEN"
}
EOF
echo "$SHA  $NAME" > "$OUT/PostPath-windows-installer.sha256"
echo "Built $NAME"
echo "$SHA"
