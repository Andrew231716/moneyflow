#!/usr/bin/env bash
# Start MoneyFlow with portable Node 22 (avoids system Node 24 hang).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE22="$ROOT/.tools/node-v22.14.0-darwin-arm64/bin"
if [[ ! -x "$NODE22/node" ]]; then
  echo "Missing portable Node 22 at $NODE22" >&2
  echo "Download: https://nodejs.org/dist/v22.14.0/node-v22.14.0-darwin-arm64.tar.gz" >&2
  exit 1
fi
export PATH="$NODE22:$PATH"
ulimit -n 65536 2>/dev/null || true
cd "$ROOT"
for port in 3000 3001 3002 3004; do
  pids="$(lsof -tiTCP:$port -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids}" ]]; then
    echo "Killing PIDs on :$port -> $pids"
    kill -9 $pids 2>/dev/null || true
  fi
done
pkill -9 -f "next dev" 2>/dev/null || true
pkill -9 -f "next start" 2>/dev/null || true
sleep 1
echo "Using $(node -v) ($(which node))"
exec env WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true \
  npx next dev --hostname 127.0.0.1 --port 3000
