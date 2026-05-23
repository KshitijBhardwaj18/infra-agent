#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Stopping dev servers on ports 3000 and 3001..."
for port in 3000 3001; do
  pids="$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
  fi
done

sleep 1

echo "Clearing Next.js cache..."
rm -rf "$ROOT/apps/web/.next"

echo "Starting dev (api + web)..."
cd "$ROOT"
exec bun run dev
