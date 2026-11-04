#!/usr/bin/env bash
# Install the PostPath desk service files. Does NOT enable or start anything.
# Usage: deploy/install-service.sh [--mode systemd|supervisor|auto] [--bin /path/to/postpath] [--dry-run]
set -euo pipefail
umask 077
HERE="$(cd "$(dirname "$0")" && pwd)"
MODE=auto; BIN="$(command -v postpath || echo "$HERE/../bin/social-mcp.js")"; DRY=0
while [ $# -gt 0 ]; do case "$1" in
  --mode) MODE="$2"; shift 2;; --bin) BIN="$2"; shift 2;; --dry-run) DRY=1; shift;;
  *) echo "unknown arg $1" >&2; exit 2;; esac; done
HOME_DIR="${SOCIAL_MCP_HOME:-$HOME/.postpath-real}"
if [ "$MODE" = auto ]; then
  if systemctl --user show-environment >/dev/null 2>&1; then MODE=systemd; else MODE=supervisor; fi
fi
do_() { if [ "$DRY" = 1 ]; then echo "+ $*"; else "$@"; fi; }
do_ mkdir -p "$HOME_DIR"; do_ chmod 700 "$HOME_DIR"
case "$MODE" in
  systemd)
    UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
    do_ mkdir -p "$UNIT_DIR"
    if [ "$DRY" = 1 ]; then echo "+ write $UNIT_DIR/postpath.service"; else
      sed "s|@POSTPATH_BIN@|$BIN|" "$HERE/systemd/postpath.service" >"$UNIT_DIR/postpath.service"; chmod 600 "$UNIT_DIR/postpath.service"; fi
    echo "Installed $UNIT_DIR/postpath.service (not enabled, not started)."
    echo "To run it yourself: systemctl --user daemon-reload && systemctl --user start postpath" ;;
  supervisor)
    DEST="$HOME/.local/bin/postpath-supervise"
    do_ mkdir -p "$HOME/.local/bin"
    if [ "$DRY" = 1 ]; then echo "+ write $DEST"; else
      sed "s|@POSTPATH_BIN@|$BIN|" "$HERE/supervisor/postpath-supervise.sh" >"$DEST"; chmod 700 "$DEST"; fi
    echo "Installed $DEST (not started)."
    echo "To run it yourself: $DEST start   (stop: $DEST stop)" ;;
  *) echo "bad mode $MODE" >&2; exit 2;;
esac
