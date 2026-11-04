#!/usr/bin/env bash
# Full check on the server: server types, frontend types, tests, frontend build.
#   bash scripts/dev/check.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
bash scripts/dev/run.sh bash -lc '
  set -e
  npm run --silent typecheck && echo "server types: ok"
  npm run --silent typecheck:web && echo "web types: ok"
  npx vitest run --reporter=dot 2>&1 | grep -E "Test Files|Tests|FAIL|Error" || true
  npm run --silent build:web 2>&1 | tail -1
'
