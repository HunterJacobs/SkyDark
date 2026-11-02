# Skydark Family Calendar - Home Assistant

A Skydark Calendar-style family organization panel for Home Assistant: calendar, chores, lists, meals, photos, rewards, and sleep routines.

## Features

- **Calendar**: Month / week / day views, event cards, drag-and-drop reschedule, add/edit events with family member assignment and colors
- **Chores & Tasks**: Per-person columns, progress indicators, daily/weekly/custom frequency, completion animations
- **Lists**: Multiple lists (grocery, to-do, etc.) with add item and checkboxes
- **Meals**: Weekly meal planning grid
- **Photos**: Grid and slideshow
- **Rewards**: Points and reward tracking per family member
- **Sleep**: Bedtime and routine checklists
- **Settings**: Family name, member colors, weather entity, two-way calendar sync
- **Home Assistant**: Custom panel, SQLite storage, services (`add_event`, `complete_task`, `add_list_item`, `send_notification`), sensors (tasks today, completed, next event), event bus for automations

## Installation

### Installation via HACS (recommended)

1. **Add the custom repository in HACS**
   - Open **HACS** → **Integrations**.
   - Click the three dots (⋮) → **Custom repositories**.
   - Enter the repository URL: `https://github.com/HunterJacobs/SkyDark`.
   - Set category to **Integration** → **Add**.

2. **Install the integration**
   - In HACS → **Integrations**, search for **Skydark Family Calendar**.
   - Click **Download** and restart Home Assistant when prompted.

3. **Configure and use**
   - Go to **Settings** → **Devices & Services** → **Add Integration** → search for **Skydark Family Calendar**.
   - Complete the setup (family name, optional weather entity).
   - Open the **Skydark Calendar** panel from the sidebar.

### Manual installation

#### 1. Copy custom component

Copy the `custom_components/skydark_calendar` folder into your Home Assistant `config` directory:

```
config/
  custom_components/
    skydark_calendar/
      __init__.py
      manifest.json
      config_flow.py
      const.py
      database.py
      calendar.py
      sensor.py
      services.py
      google_calendar.py
      microsoft_calendar.py
      services.yaml
      strings.json
      translations/
      www/          # frontend build output (included)
```

#### 2. Restart Home Assistant

Restart HA so the integration is loaded.

#### 3. Add integration

- Go to **Settings** → **Devices & Services** → **Add Integration**
- Search for **Skydark Family Calendar**
- Enter your family name and optionally a weather entity
- Finish the setup

#### 4. Open the panel

- In the sidebar, open **Skydark Calendar** (calendar icon and title).
- The panel loads the React app from `/skydark/`.

## Publishing to GitHub

To publish this integration to your own GitHub repository:

1. In the project root, run:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Skydark Family Calendar integration"
   git remote add origin https://github.com/HunterJacobs/SkyDark.git
   git branch -M main
   git push -u origin main
   ```

After pushing, others can install via HACS by adding your repo URL as a custom repository (Integration).

## Development

### Frontend

```bash
cd frontend
npm install
npm run dev    # Vite dev server
npm run build  # Builds into custom_components/skydark_calendar/www
npm run test   # Vitest
```

### Run full app locally

To run the full app (frontend + Home Assistant backend) on your machine:

1. Install **Docker** and **Docker Compose** (see `dev/README.md`).
2. From the repo root run: **`./scripts/run-local.sh`**
3. Wait 1–2 minutes, then open **http://localhost:8123**, create a local HA account, add the **Skydark Family Calendar** integration, and open the panel from the sidebar.

Details and troubleshooting: **`dev/README.md`**.

### Backend

The backend is the Home Assistant custom component. Use a Python environment matching your HA version if you run tests locally. The SQLite database is created at `config/skydark_calendar/skydark_calendar.db` after the first run.

## Services

- `skydark_calendar.add_event` / `update_event` / `delete_event`
- `skydark_calendar.add_task` / `update_task` / `delete_task` / `complete_task` / `uncomplete_task`
- `skydark_calendar.add_list_item` / `toggle_list_item` / `delete_list_item` / `create_list` / `delete_list`
- `skydark_calendar.add_meal` / `update_meal` / `delete_meal` / `add_meal_recipe` / `delete_meal_recipe`
- `skydark_calendar.add_family_member` / `update_family_member` / `delete_family_member`
- `skydark_calendar.add_reward` / `delete_reward` / `add_points` / `redeem_reward`
- `skydark_calendar.upload_photo` / `send_notification` / `sync_calendars`

## Automations

The integration fires `skydark_calendar_event_created` when an event is added via the service, and `skydark_calendar_updated` after any data mutation. Use them as triggers in automations.

## Calendar sync

SkyDark syncs through Home Assistant calendar entities, so Google, Outlook, CalDAV, and Local Calendar all work once they are connected in HA.

1. In Home Assistant, add the official integration for your provider (Google Calendar, Microsoft 365 / Outlook, CalDAV, or Local Calendar).
2. During SkyDark setup (or later in **Settings → Calendar**), choose:
   - **Import into SkyDark** — events from that calendar appear on the family calendar.
   - **Export SkyDark events** — events you create in SkyDark are created on that calendar.
   - **Import existing events** — copy current history (about two years back and forward) on first link.
3. When adding an event in SkyDark, use **Also add to** to pick which export calendars receive that event.

Sync runs every 15 minutes and after you add, edit, or delete an event. SkyDark’s own `calendar.skydark_*` entity is never used as a sync target, so it cannot loop.

## UI

The UI follows the Skydark reference: light background `#F8FAFB`, accent `#3B9BBF`, pastel event colors, 80px sidebar, FAB bottom-right. Optimized for landscape tablet (e.g. 15" display).

## Responsive and touch use

- Phones open in Agenda view; Month, Week, and Day remain available. Week view scrolls horizontally on narrow screens. Tap a date or “more” in Month to open that day.
- Mobile navigation has labeled Calendar, Lists, Chores, and Meals tabs. More opens Rewards, Meal Prep, Photos, and Settings.
- Meals use day cards on phones and a weekly grid on larger displays. Previous/next controls let you plan other weeks.
- Tap an event, then Edit, to reschedule without dragging. On touch-enabled week grids, hold briefly before dragging. Meal slots also support choosing recipes without dragging.
- Dialogs contain keyboard focus and restore it when closed. Browser zoom is enabled; forms scroll within the available screen height.
- Calendar changes stay in the form when a save fails. Reconnection retries create a fresh connection attempt. Open displays refresh on backend updates, reconnect, tab visibility, and a one-minute fallback interval.

### Calendar sync behavior

Use Settings → Calendar after connecting your provider through Home Assistant. Sync uses the HA calendar entity API to retain stable event IDs. Updates modify existing events rather than deleting and recreating them. Unsupported updates/deletions show an error and preserve the original event.

Disabling both directions pauses a link while retaining its mappings. Imported history outside the current fetch window is retained. The sync screen shows failed attempts and import/export counts; a successful HTTP/WebSocket response alone is not treated as a successful sync. All-day events retain their calendar dates across time zones.

New exports may need another sync pass before the provider returns their stable IDs. Until then, edits/deletes report a pending-ID error rather than risking duplicates. Imported events are not exported by default; select their export destination in the event editor when needed.

### Validation

```bash
python -m unittest discover -s tests -v
cd frontend
npm ci
npm test
npm run build
# Browser checks use an isolated standalone SQLite file:
cd ../standalone && npm ci
cd ../frontend
npx playwright install chromium
npm run test:ui
```

The browser checks cover 320×568, 390×844, 667×375, 768×1024, 1024×768, and 1440×900, all eight routes, calendar modes, event creation, failed-save draft retention, and mobile touch navigation. Set `SKYDARK_UI_ARTIFACTS` to save screenshots; `CHROMIUM_EXECUTABLE_PATH` optionally selects an existing Chromium binary.

Backend tests use real SQLite with an HA API test double. They do not replace a live Google/Outlook/CalDAV test. Before release, verify import, create, edit, delete, all-day events, provider outages, and restart against the Home Assistant version and calendar providers you use. Real-device iOS/Android drag and virtual-keyboard behavior also deserve a final device check.
