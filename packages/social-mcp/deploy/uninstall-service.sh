#!/usr/bin/env bash
# Remove PostPath service files. Never deletes $SOCIAL_MCP_HOME (tokens, posts).
set -euo pipefail
UNIT="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user/postpath.service"
SUP="$HOME/.local/bin/postpath-supervise"
if [ -f "$UNIT" ]; then
  if systemctl --user show-environment >/dev/null 2>&1; then
    systemctl --user disable --now postpath 2>/dev/null || true
  fi
  rm -f "$UNIT"; systemctl --user daemon-reload 2>/dev/null || true; echo "removed $UNIT"
fi
if [ -f "$SUP" ]; then "$SUP" stop || true; rm -f "$SUP"; echo "removed $SUP"; fi
echo "Data in ${SOCIAL_MCP_HOME:-$HOME/.postpath-real} was left in place."
