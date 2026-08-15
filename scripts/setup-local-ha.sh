#!/usr/bin/env bash
# One-shot: install Docker, start Home Assistant, install HACS.
# Run from repo root. You will be prompted for your sudo password.
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# --- 1. Install Docker if missing ---
if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker and Docker Compose plugin (sudo required)..."
  sudo apt update
  sudo apt install -y docker.io docker-compose-plugin
  sudo usermod -aG docker "$USER"
  echo "==> Docker installed. You were added to the 'docker' group."
  sudo systemctl start docker 2>/dev/null || true
  sudo systemctl enable docker 2>/dev/null || true
fi

# Use 'sg docker' so we can run docker without logging out after usermod
run_docker() { sg docker -c "cd $REPO_ROOT && $*"; }

# --- 2. Build frontend and start Home Assistant ---
echo "==> Building frontend into custom_components/skydark_calendar/www ..."
cd frontend
npm run build
cd "$REPO_ROOT"

echo "==> Starting Home Assistant (Docker)..."
run_docker "cd dev && docker compose up -d"

# --- 3. Wait for config dir (HA creates it on first run) ---
echo "==> Waiting for Home Assistant to create config (up to 3 minutes)..."
CONFIG_DIR="$REPO_ROOT/dev/config"
for i in {1..90}; do
  if [[ -f "$CONFIG_DIR/configuration.yaml" || -d "$CONFIG_DIR/.storage" ]]; then
    break
  fi
  sleep 2
done
if [[ ! -d "$CONFIG_DIR" ]]; then
  echo "Config dir not found. Open http://localhost:8123, complete onboarding, then run: ./scripts/install-hacs.sh"
  exit 0
fi

# --- 4. Install HACS ---
echo "==> Installing HACS..."
"$REPO_ROOT/scripts/install-hacs.sh"

# --- 5. Restart HA to load HACS ---
echo "==> Restarting Home Assistant to load HACS..."
run_docker "cd dev && docker compose restart"

echo ""
echo "==> Done. Next steps:"
echo "    1. Open http://localhost:8123 and log in."
echo "    2. Settings → Devices & Services → Add Integration → search 'HACS' → add it."
echo "    3. Complete GitHub device auth at https://github.com/login/device when prompted."
echo "    4. Use HACS to add custom repos (e.g. Skydark) and install integrations."
echo ""
echo "    Logs:  cd dev && docker compose logs -f"
echo "    Stop:  cd dev && docker compose down"
echo ""
