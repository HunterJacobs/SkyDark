"""Skydark Family Calendar integration for Home Assistant."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import homeassistant.helpers.config_validation as cv
from homeassistant.components.frontend import async_register_built_in_panel, async_remove_panel
from homeassistant.components.http import HomeAssistantView, StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .const import (
    CONF_IMPORT_EXISTING,
    CONF_PULL_CALENDARS,
    CONF_PUSH_CALENDARS,
    DB_NAME,
    DOMAIN,
    PANEL_ICON,
    PANEL_TITLE,
    PANEL_URL,
)
from .database import SkydarkDatabase
from .services import SERVICES as _SERVICES
from .websocket_api import async_register_websocket_handlers

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.CALENDAR, Platform.SENSOR]

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# Headers that prevent any caching of index.html so that updated asset
# hashes in the file are always picked up — even by HA's service worker.
_NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
}


class SkyDarkIndexView(HomeAssistantView):
    """Serve SkyDark index.html with strict no-cache headers.

    Using a dedicated view (rather than the static-path handler) lets us set
    response headers that HA's service worker will respect, ensuring the
    browser always fetches the latest index.html after an update.
    """

    url = f"{PANEL_URL}/index.html"
    name = "skydark_index"
    requires_auth = False

    def __init__(self, www_path: Path) -> None:
        self._index = www_path / "index.html"

    async def get(self, request):  # type: ignore[override]
        from aiohttp import web

        hass = request.app["hass"]
        exists = await hass.async_add_executor_job(self._index.exists)
        if not exists:
            raise web.HTTPNotFound()
        content = await hass.async_add_executor_job(self._index.read_bytes)
        return web.Response(
            body=content,
            content_type="text/html",
            charset="utf-8",
            headers=_NO_CACHE_HEADERS,
        )


async def async_setup(hass: HomeAssistant, config: dict[str, Any]) -> bool:
    """Set up the Skydark Calendar component."""
    hass.data.setdefault(DOMAIN, {})
    return True


def _sync_options(cfg: dict[str, Any]) -> tuple[list[str], list[str], bool]:
    return (
        sorted(cfg.get(CONF_PULL_CALENDARS) or []),
        sorted(cfg.get(CONF_PUSH_CALENDARS) or []),
        bool(cfg.get(CONF_IMPORT_EXISTING, False)),
    )


async def _async_register_http(hass: HomeAssistant) -> None:
    """Register the panel's static files once per HA run.

    aiohttp refuses duplicate routes, so re-registering on an entry reload
    would make setup fail. Routes can't be removed, so they stay registered
    after unload (harmless: the sidebar panel itself is removed).
    """
    domain_data = hass.data.setdefault(DOMAIN, {})
    if domain_data.get("http_registered"):
        return
    www_path = Path(__file__).parent / "www"
    if not await hass.async_add_executor_job(www_path.exists):
        _LOGGER.error("Skydark frontend files are missing from %s", www_path)
        return
    hass.http.register_view(SkyDarkIndexView(www_path))
    await hass.http.async_register_static_paths(
        [StaticPathConfig(PANEL_URL, str(www_path), cache_headers=True)]
    )
    domain_data["http_registered"] = True


def _cleanup_entry_data(hass: HomeAssistant) -> None:
    domain_data = hass.data.get(DOMAIN, {})
    sync = domain_data.pop("sync", None)
    if sync:
        sync.stop()
    for key in ("db", "panel_url", "entry_id", "config", "ws_registered"):
        domain_data.pop(key, None)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Skydark Calendar from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    try:
        await _async_register_http(hass)

        db_path = Path(hass.config.config_dir) / DOMAIN / DB_NAME
        await hass.async_add_executor_job(
            lambda: db_path.parent.mkdir(parents=True, exist_ok=True)
        )
        db = SkydarkDatabase(db_path)
        await hass.async_add_executor_job(db.init)
    except Exception as err:
        _LOGGER.exception("Skydark Calendar could not open its database")
        raise ConfigEntryNotReady(f"Could not open the Skydark database: {err}") from err

    domain_data = hass.data[DOMAIN]
    domain_data["db"] = db
    domain_data["panel_url"] = PANEL_URL
    domain_data["entry_id"] = entry.entry_id
    cfg = {**entry.data, **(entry.options or {})}
    domain_data["config"] = cfg

    from .calendar_sync import SkydarkCalendarSync

    sync = SkydarkCalendarSync(hass, db)
    domain_data["sync"] = sync

    try:
        await async_register_websocket_handlers(hass)

        from . import services as skydark_services

        await skydark_services.async_setup_services(hass)
        await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    except Exception:
        _cleanup_entry_data(hass)
        raise

    async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path="skydark",
        config={"url": f"{PANEL_URL}/index.html"},
        require_admin=False,
        update=True,
    )

    # Calendar sync failures shouldn't stop the panel from loading.
    existing_links = await hass.async_add_executor_job(db.get_sync_links)
    pull, push, import_existing = _sync_options(cfg)
    if not existing_links and (pull or push):
        hass.async_create_task(
            sync.apply_config_links(pull, push, bool(cfg.get(CONF_IMPORT_EXISTING, True)))
        )
    elif existing_links:
        hass.async_create_task(sync.async_sync_all())
    sync.start()

    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Apply changed options without requiring a restart.

    Only re-apply calendar links when the sync options themselves changed, so
    saving an unrelated option (like the weather entity) doesn't reset links
    configured from the panel.
    """
    domain_data = hass.data.get(DOMAIN)
    if not domain_data:
        return
    previous = domain_data.get("config") or {}
    cfg = {**entry.data, **(entry.options or {})}
    domain_data["config"] = cfg
    sync = domain_data.get("sync")
    if not sync or _sync_options(previous) == _sync_options(cfg):
        return
    pull, push, import_existing = _sync_options(cfg)
    await sync.apply_config_links(pull, push, import_existing)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False
    for name in _SERVICES:
        hass.services.async_remove(DOMAIN, name)
    _cleanup_entry_data(hass)
    async_remove_panel(hass, "skydark")
    return unload_ok
