# Skydark Family Calendar

Turn Home Assistant into a single family command center.

Skydark is a full-screen family organizer for Home Assistant that combines calendar, chores, lists, meals, rewards, and photos in one clean panel your whole household can use.

[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Custom%20Integration-41BDF5?logo=home-assistant&logoColor=white)](https://www.home-assistant.io/)
[![HACS](https://img.shields.io/badge/HACS-Custom%20Repository-41BDF5)](https://hacs.xyz/)

<img width="1918" height="943" alt="Screenshot 2026-03-17 235039" src="https://github.com/user-attachments/assets/010d9f67-8ade-409e-8eaa-eae8d4548c05" />


## Why people install SkyDark

- One place for everything your family tracks daily.
- Designed for a wall tablet or dashboard view in Home Assistant.
- Built for action, not just display: create tasks, plan meals, check lists, track rewards.
- Clean, touch-friendly UI that works for both adults and kids.

## What you can do

| Area | What it does |
|------|---------------|
| **Calendar** | Month/week/day views, drag-and-drop events, family member colors |
| **Chores** | Per-person tasks, routine frequencies, completion tracking, points |
| **Lists** | Grocery and custom lists with simple check-off flow |
| **Meals** | Weekly planner plus meal prep ingredient generation |
| **Rewards** | Points and reward redemption tracking per family member |
| **Photos** | Family photo view with sleep/screensaver support |
| **Settings** | Profiles, lock controls, feature toggles, family-level preferences |

Runs as a Home Assistant custom integration and panel. Data is stored locally in your HA config using SQLite.

## Install (HACS recommended)

1. Open **HACS** -> **Integrations** -> **Custom repositories**
2. Add `https://github.com/HunterJacobs/SkyDark` as category **Integration**
3. Install **Skydark Family Calendar**
4. Restart Home Assistant
5. Go to **Settings** -> **Devices & Services** -> **Add Integration** -> **Skydark Family Calendar**
6. Open **Skydark Calendar** from the sidebar

## Manual install

1. Download this repo as ZIP and extract it
2. Copy `custom_components/skydark_calendar` into your HA `config/custom_components/` directory
3. Restart Home Assistant
4. Add **Skydark Family Calendar** in **Devices & Services**

The panel is served at `/skydark`.

## Best fit for

- Families using Home Assistant as the home dashboard
- Wall-tablet setups in kitchens, entryways, or living spaces
- Homes that want chores + rewards + meal planning in one workflow

## Services and automations

Skydark includes service calls for event/task/list/meal/reward actions and notification helpers.

Examples:

- `skydark_calendar.add_event`
- `skydark_calendar.complete_task`
- `skydark_calendar.add_list_item`
- `skydark_calendar.add_meal`
- `skydark_calendar.send_notification`

Event automations are supported (for example, event-created triggers).  
See full service docs in **Settings** -> **Devices & Services** -> **Skydark Family Calendar** -> **Services**.

## Troubleshooting

- **White screen or 403 on open/refresh**: update to latest version and fully restart Home Assistant.
- **Console warnings about fonts/sandbox/layout**: usually from HA browser context and typically harmless.

## For contributors

- Developer setup and architecture: [CONTRIBUTING.md](CONTRIBUTING.md)
- HACS submission notes: [docs/HACS_NEXT_STEPS.md](docs/HACS_NEXT_STEPS.md)

If SkyDark helps your household, a star on this repo helps more Home Assistant users find it.
