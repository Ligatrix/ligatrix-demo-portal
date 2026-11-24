# Runbook

## Run

```sh
npm start
```

The server prints where it is listening and which store it loaded:

```
Created /path/to/ligatrix-demo-portal/data/store.json with demo data.
Corvane operations portal running at http://127.0.0.1:4173
```

Stop it with Ctrl+C (SIGINT) or SIGTERM; it closes open connections and exits. Node.js 20 or later is required and nothing needs installing.

Without the server, open `index.html` in a browser. The footer then reads "Local demo mode": everything works, changes stay in that tab and are gone on reload.

## Configure

All configuration is by environment variable.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `4173` | Port to listen on. `0` picks a free port. |
| `HOST` | `127.0.0.1` | Interface to bind. Use `0.0.0.0` to accept connections from other machines. |
| `DATA_FILE` | `data/store.json` | Path of the JSON store, relative to the repository root or absolute. Created with demo data if missing. |
| `ALLOW_RESET` | on | Set to `0` to disable `POST /api/reset` and hide the "Reset demo data" link. |

Example:

```sh
PORT=8080 DATA_FILE=/var/lib/corvane/store.json ALLOW_RESET=0 npm start
```

The server has no sign-in. Bind it to `127.0.0.1` or put it behind a reverse proxy that authenticates users before exposing it on a network; the "Acting as" selector is a demo control, not an identity.

## Back up the JSON store

The store is a single file, written atomically (temp file, then rename), so a copy taken at any moment is a complete store.

```sh
mkdir -p backups
cp data/store.json "backups/store-$(date -u +%Y%m%dT%H%M%SZ).json"
npm run -s check-store -- "backups/store-<stamp>.json"
```

A handover export is also a full backup with a description of its schema:

```sh
curl -s http://127.0.0.1:4173/api/export -o backups/handover.json
npm run -s check-store -- backups/handover.json
```

For a scheduled backup, run the `cp` line from cron and keep as many copies as your retention needs.

## Restore

1. Stop the server.
2. Check the backup: `npm run -s check-store -- backups/store-<stamp>.json`. It must print `OK`.
3. Keep the current file aside, then put the backup in place:
   ```sh
   mv data/store.json data/store.before-restore.json
   cp backups/store-<stamp>.json data/store.json
   ```
4. Start the server. It validates the file at start-up and refuses to run on a damaged store.

A handover bundle can be restored the same way: `check-store` accepts it, and the server keeps only its `schemaVersion`, `requests` and `log`; the extra `format`, `schema` and `summary` sections are dropped from the file on the next change.

## Common issues

**`Port 4173 is already in use. Set PORT to another value.`** Another process holds the port (often a second copy of the portal). Stop it, or start with `PORT=4174 npm start`.

**`data/store.json is not valid JSON (...)`** The file was edited by hand or truncated outside the server. Restore the latest backup (above). The server never overwrites a store it cannot read.

**`data/store.json failed its integrity check: REQ-1004 is "done" but its log ends at "rejected".`** A request's state and its activity log disagree, usually after a hand edit. Run `npm run check-store` to list every problem, then fix the file or restore a backup.

**The footer says "Local demo mode" while the server is running.** The page was opened from disk or from a different static server, so `/api/health` did not answer. Open the address the server printed.

**Changes disappear on reload.** That is local demo mode, by design. Use the server for anything you want to keep.

**After editing files in `src/`, opening `index.html` from disk shows old behaviour.** The file:// path uses `dist/portal.js`. Run `npm run bundle`; `npm test` fails until you do.

**Reset demo data replaced real entries.** Reset is meant for demos. Disable it with `ALLOW_RESET=0` anywhere the data matters, and restore from a backup if it was used by mistake.
