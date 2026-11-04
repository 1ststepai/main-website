#!/usr/bin/env bash
# Script supervisor for hosts without a systemd user bus.
# Usage: postpath-supervise.sh {run|start|stop|status}
#   run    foreground loop: restart `postpath app` on failure (backoff 5s..60s)
#   start  run the loop detached (nohup), pid in $SOCIAL_MCP_HOME/supervisor.pid
#   stop   stop the loop and the child
set -euo pipefail
umask 077
export SOCIAL_MCP_HOME="${SOCIAL_MCP_HOME:-/home/box/.postpath-real}"
POSTPATH_BIN="${POSTPATH_BIN:-@POSTPATH_BIN@}"
PIDFILE="$SOCIAL_MCP_HOME/supervisor.pid"
LOG="$SOCIAL_MCP_HOME/logs/desk.log"

harden() {
  mkdir -p "$SOCIAL_MCP_HOME/logs"
  chmod 700 "$SOCIAL_MCP_HOME"
  find "$SOCIAL_MCP_HOME" -type d -exec chmod 700 {} +
  find "$SOCIAL_MCP_HOME" -type f -exec chmod 600 {} +
}

run() {
  harden
  local delay=5 child=""
  trap '[ -n "$child" ] && kill "$child" 2>/dev/null; exit 0' TERM INT
  while true; do
    "$POSTPATH_BIN" app --no-open >>"$LOG" 2>&1 &
    child=$!
    local started=$SECONDS
    set +e; wait "$child"; local code=$?; set -e
    [ "$code" -eq 0 ] && exit 0
    if (( SECONDS - started > 60 )); then delay=5; else delay=$(( delay * 2 > 60 ? 60 : delay * 2 )); fi
    echo "$(date -Is) postpath app exited $code; restarting in ${delay}s" >>"$LOG"
    sleep "$delay"
  done
}

case "${1:-}" in
  run) run ;;
  start)
    harden
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "already running"; exit 0; fi
    nohup "$0" run >/dev/null 2>&1 &
    echo $! >"$PIDFILE"; echo "started pid $(cat "$PIDFILE")" ;;
  stop)
    if [ -f "$PIDFILE" ]; then kill "$(cat "$PIDFILE")" 2>/dev/null || true; rm -f "$PIDFILE"; echo stopped; else echo "not running"; fi ;;
  status)
    if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then echo "running pid $(cat "$PIDFILE")"; else echo "not running"; exit 3; fi ;;
  *) echo "usage: $0 {run|start|stop|status}" >&2; exit 2 ;;
esac
