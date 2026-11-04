# Running the PostPath desk as a service (personal use)

The desk (`postpath app`) listens on **127.0.0.1 only** (hard-coded in `src/desk/server.js`). Nothing here opens a public tunnel.

Home: `~/.postpath-real` (on the box: `/home/box/.postpath-real`). The service runs with umask 077. On every start it resets folders to 700 and files to 600.

## Install (writes files only; never enables or starts)

```bash
packages/social-mcp/deploy/install-service.sh            # auto: systemd user if a user bus exists, else supervisor
packages/social-mcp/deploy/install-service.sh --mode systemd --bin "$(command -v postpath)"
packages/social-mcp/deploy/install-service.sh --dry-run  # show what it would do
```

* **systemd user** writes `~/.config/systemd/user/postpath.service`. Start it yourself with `systemctl --user daemon-reload && systemctl --user start postpath`, and `enable` it if you want it at login (`loginctl enable-linger` is needed to run without a session).
* **supervisor** (for hosts with no user bus, like the box: "Failed to connect to user scope bus") writes `~/.local/bin/postpath-supervise`. Use `start|stop|status|run`. It restarts on failure with a 5s to 60s backoff, writes logs to `~/.postpath-real/logs/desk.log` and keeps its pid in `~/.postpath-real/supervisor.pid`.

## Uninstall

`packages/social-mcp/deploy/uninstall-service.sh` stops the service and removes the unit or script. It **never** deletes `~/.postpath-real`.
