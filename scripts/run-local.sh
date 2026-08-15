#!/usr/bin/env bash
# Build frontend and run full SkyDark app locally via Home Assistant in Docker.
# Requires: Docker, Docker Compose, Node/npm (for frontend build)
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed. Install it first, e.g.:"
  echo "  sudo apt install docker.io docker-compose-plugin"
  echo "  sudo usermod -aG docker \$USER"
  echo "  # then log out and back in"
  echo "See dev/README.md for more."
  exit 1
fi

echo "==> Building frontend into custom_components/skydark_calendar/www ..."
cd frontend
npm run build
cd "$REPO_ROOT"

echo "==> Starting Home Assistant (Docker) with SkyDark integration ..."
cd dev
docker compose up -d

echo ""
echo "==> Full app is starting. Wait ~1–2 minutes for HA to be ready."
echo "    Then:"
echo "    1. Open: http://localhost:8123"
echo "    2. Create a HA account when prompted (local only)."
echo "    3. Go to Settings → Devices & Services → Add Integration"
echo "    4. Search for \"Skydark Family Calendar\" → configure (e.g. family name)."
echo "    5. Open \"Skydark Calendar\" from the sidebar."
echo ""
echo "    Logs: cd dev && docker compose logs -f"
echo "    Stop: cd dev && docker compose down"
echo ""
