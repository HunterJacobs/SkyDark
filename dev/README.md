# Running the full SkyDark app locally

This runs **Home Assistant** in Docker with the **Skydark Family Calendar** custom component and the built frontend, so you get the full app (calendar, tasks, lists, meals, etc.) with real backend data.

## Requirements

- **Docker** and **Docker Compose** (e.g. `sudo apt install docker.io docker-compose-plugin` on Ubuntu, then add your user to the `docker` group and log out/in).
- **Node/npm** (for building the frontend; already used in the project).

## One-time: install Docker (if needed)

Home Assistant runs in Docker. Install Docker and Docker Compose, then add your user to the `docker` group so you can run containers without `sudo`.

**Ubuntu / Debian:**

```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo usermod -aG docker $USER
# Log out and back in (or open a new terminal) so the group takes effect
```

**Other Linux:** Install Docker Engine and the Compose plugin from your distro’s packages or from [docs.docker.com](https://docs.docker.com/engine/install/). Then run `sudo usermod -aG docker $USER` and log out and back in.

## Run the full app

From the **repo root**:

```bash
./scripts/run-local.sh
```

This will:

1. Build the frontend into `custom_components/skydark_calendar/www`.
2. Start Home Assistant in Docker (port **8123**).

Wait 1–2 minutes, then:

1. Open **http://localhost:8123**
2. Create a local Home Assistant account when prompted.
3. Go to **Settings** → **Devices & Services** → **Add Integration**.
4. Search for **Skydark Family Calendar** → add it and set e.g. family name.
5. Open **Skydark Calendar** from the sidebar.

You’ll have the full app with SQLite storage, services, and sensors.

## Useful commands

- **View HA logs:** `cd dev && docker compose logs -f`
- **Stop HA:** `cd dev && docker compose down`
- **Rebuild frontend only:** `cd frontend && npm run build` (then restart the container if needed).

## Config and data

- HA config and data (including the Skydark SQLite DB) are stored in `dev/config/`.
- To start with a clean HA instance, remove that folder (e.g. `rm -rf dev/config`) and run `./scripts/run-local.sh` again.
- **Modifying HA:** Edit files under `dev/config/` (e.g. `configuration.yaml`). Custom components go in `dev/config/custom_components/`. After adding or changing integrations, restart HA: `cd dev && docker compose restart`.

## HACS (Home Assistant Community Store)

To install HACS so you can add community integrations (and install Skydark via HACS if you prefer):

1. Start Home Assistant at least once so `dev/config/` exists: `./scripts/run-local.sh`, then open http://localhost:8123 and complete onboarding.
2. Install HACS (from repo root):
   ```bash
   chmod +x scripts/install-hacs.sh
   ./scripts/install-hacs.sh
   ```
   This downloads HACS into `dev/config/custom_components/hacs`.
3. Restart Home Assistant: `cd dev && docker compose restart`.
4. In HA: **Settings → Devices & Services → Add Integration** → search for **HACS** → Add. Accept the terms and complete GitHub device auth at https://github.com/login/device when prompted.
5. After HACS is set up, use **HACS → Integrations** (or Frontend, etc.) to browse and install community add-ons. You can add the Skydark repo as a custom repository: **HACS → Integrations → ⋮ → Custom repositories** → `https://github.com/HunterJacobs/SkyDark` (category: Integration).
