# Contributing to Skydark Family Calendar

This doc is for anyone who wants to run, build, or change the code — new or experienced.

---

## Before you start

- **Users** (just installing): see the [README](README.md#installation-via-hacs-recommended).
- **Developers**: this file + the [Project layout](#project-layout-quick-ref) below.

---

## Running the app locally

### Frontend only (no Home Assistant)

Good for UI, layout, and component work:

```bash
cd frontend
npm install
npm run dev
```

Opens a Vite dev server. The app can run without a backend (e.g. uses localStorage for some data). To talk to a real Home Assistant instance, open the app through HA (e.g. `/skydark`) or configure the connection as your setup requires.

### Full stack (frontend + Home Assistant)

1. Install the integration into your Home Assistant (see README).
2. Build the frontend and copy it into the integration:

   ```bash
   cd frontend
   npm run build
   ```

   The build output goes to `custom_components/skydark_calendar/www/`. Restart Home Assistant if the integration was already loaded.

---

## Project layout (quick ref)

| Part | Where | Tech |
|------|--------|------|
| **Backend** | `custom_components/skydark_calendar/` | Python, Home Assistant integration |
| **Frontend** | `frontend/` | React, TypeScript, Vite, Tailwind |
| **API** | `frontend/src/lib/skyDarkApi.ts` ↔ `websocket_api.py` | WebSocket commands (`skydark_calendar/*`) |
| **Data** | `database.py` + SQLite | Stored under HA `config/skydark_calendar/` |

Changing the UI: work in `frontend/src/` (views, components, contexts).  
Changing data or HA behavior: work in `custom_components/skydark_calendar/` (database, services, websocket_api).

---

## Commands

| Command | Where | What it does |
|--------|--------|----------------|
| `npm run dev` | `frontend/` | Start Vite dev server |
| `npm run build` | `frontend/` | TypeScript + Vite build → `custom_components/.../www` |
| `npm run test` | `frontend/` | Run Vitest tests |
| `npm run test:watch` | `frontend/` | Vitest watch mode |

---

## Making a change and testing

1. **Frontend change**  
   - Edit files under `frontend/src/`.  
   - Run `npm run dev` to test in the browser, or `npm run build` and restart HA to test in the panel.

2. **Backend change**  
   - Edit Python under `custom_components/skydark_calendar/`.  
   - Restart Home Assistant (or reload the integration) and test in the Skydark panel.

3. **New WebSocket command or service**  
   - Backend: add handler in `websocket_api.py` or register a service in `services.py` and `services.yaml`.  
   - Frontend: add a function in `skyDarkApi.ts` that sends the right message or calls the service.

---

## Code style

- **Frontend**: TypeScript, React function components; existing style in `frontend/src/` is the reference.
- **Backend**: Follow existing Python style in `custom_components/skydark_calendar/`; HA integration conventions apply.

---

## Questions or issues

Open an issue or discussion on [GitHub](https://github.com/HunterJacobs/SkyDark). For install/config problems, check the [README installation instructions](README.md#installation) first.
