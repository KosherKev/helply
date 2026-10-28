#!/usr/bin/env bash
# Consistent online backup of the SQLite database (VACUUM INTO), kept 14 days inside the data volume.
# Run on the Droplet from the repo folder; schedule with cron:  0 3 * * *  cd /opt/helply && deploy/backup.sh
# Copy the files off the Droplet too (the HELPLY_ENCRYPTION_KEY is needed to read stored secrets from a restore).
set -euo pipefail
cd "$(dirname "$0")/.."
STAMP="$(date +%Y%m%d-%H%M)"
docker compose --env-file .env.production exec -T api node --experimental-sqlite --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
fs.mkdirSync('/data/backups', { recursive: true });
const d = new DatabaseSync('/data/helply.db');
d.exec(\"VACUUM INTO '/data/backups/helply-${STAMP}.db'\");
const cutoff = Date.now() - 14 * 86400000;
for (const f of fs.readdirSync('/data/backups')) if (fs.statSync('/data/backups/' + f).mtimeMs < cutoff) fs.unlinkSync('/data/backups/' + f);
console.log('backup written: helply-${STAMP}.db');
"
