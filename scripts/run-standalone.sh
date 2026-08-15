#!/usr/bin/env bash
# Run SkyDark locally without Home Assistant: standalone API + frontend.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Ensure standalone deps
if [ ! -d "standalone/node_modules" ]; then
  echo "==> Installing standalone server dependencies..."
  (cd standalone && npm install)
fi

# Start API server in background
echo "==> Starting standalone API on http://localhost:4000 ..."
(cd standalone && node server.js) &
API_PID=$!
trap "kill $API_PID 2>/dev/null" EXIT

sleep 1

# Start frontend (standalone mode: uses /api/ws)
echo "==> Starting frontend at http://localhost:5173/skydark/ (standalone mode) ..."
cd frontend
env VITE_STANDALONE=true npm run dev
