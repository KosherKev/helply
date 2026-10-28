#!/usr/bin/env bash
# Runs central-logging-service against a LOCAL, ISOLATED MongoDB database for the Helply demo, on :8080.
# Never point the demo at the shared Atlas database in that repo's .env (it holds real apps' logs).
# Usage: scripts/start-local-cls.sh [path-to-central-logging-service]
set -euo pipefail
CLS_DIR="${1:-$(dirname "$0")/../../_Modules/central-logging-service}"
cd "$CLS_DIR"
echo "central-logging-service: $(pwd)  ->  mongodb://127.0.0.1:27017/helply_demo_logs  on :8080"
MONGODB_URI="mongodb://127.0.0.1:27017/helply_demo_logs" PORT=8080 exec node src/server.js
