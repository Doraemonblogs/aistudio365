#!/usr/bin/env bash
# Runs a command for the shop inside a throwaway Node container on the server, with the source in
# /root/aistudio365-shop-dev and node_modules kept in a Docker volume between runs.
#   bash scripts/dev/run.sh npm test
set -euo pipefail
SRC=/root/aistudio365-shop-dev
exec docker run --rm \
  -v "$SRC":/app \
  -v aistudio365-shop-node-modules:/app/node_modules \
  -w /app \
  -e TZ=Asia/Shanghai \
  node:24-bookworm "$@"
