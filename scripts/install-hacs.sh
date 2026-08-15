#!/usr/bin/env bash
# Install HACS (Home Assistant Community Store) into the local dev HA config.
# Run from repo root. HA config is at dev/config; container must be stopped or
# we install while it's running (files will be picked up after restart).
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_DIR="${1:-$REPO_ROOT/dev/config}"
HACS_ZIP_URL="https://github.com/hacs/integration/releases/latest/download/hacs.zip"

if [[ ! -d "$CONFIG_DIR" ]]; then
  echo "Config directory does not exist: $CONFIG_DIR"
  echo "Start Home Assistant once first: ./scripts/run-local.sh"
  echo "Then stop it (cd dev && docker compose down) and run this script again."
  exit 1
fi

CUSTOM_COMPONENTS="$CONFIG_DIR/custom_components"
mkdir -p "$CUSTOM_COMPONENTS"
TMPDIR="$(mktemp -d)"
trap "rm -rf '$TMPDIR'" EXIT

echo "==> Downloading HACS from GitHub..."
curl -sSL -o "$TMPDIR/hacs.zip" "$HACS_ZIP_URL"
echo "==> Extracting to $CUSTOM_COMPONENTS/hacs ..."
rm -rf "$CUSTOM_COMPONENTS/hacs"
# Zip contents are the hacs component files at root, not under custom_components/
unzip -q -o "$TMPDIR/hacs.zip" -d "$TMPDIR/hacs"
cp -R "$TMPDIR/hacs" "$CUSTOM_COMPONENTS/"
echo "==> HACS installed. Restart Home Assistant to load it."
echo "    Then: Settings → Devices & Services → Add Integration → search 'HACS'."
echo "    Complete setup at https://github.com/login/device when prompted."
