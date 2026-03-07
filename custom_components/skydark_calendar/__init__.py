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

from .const import DB_NAME, DOMAIN, PANEL_ICON, PANEL_TITLE, PANEL_URL
from .database import SkydarkDatabase
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

        if not self._index.exists():
            raise web.HTTPNotFound()

        # index.html is tiny (~600 bytes); synchronous read is fine here.
        content = self._index.read_bytes()
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


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Skydark Calendar from a config entry."""
    hass.data.setdefault(DOMAIN, {})

    www_path = Path(__path__[0]) / "www"
    if www_path.exists():
        # Serve index.html through a dedicated view with no-cache headers so
        # that HA's service worker never returns a stale copy after an update.
        hass.http.register_view(SkyDarkIndexView(www_path))

        # Serve all other static assets (JS/CSS chunks, manifest, icons).
        # Content-hashed filenames mean these are safe to cache long-term.
        await hass.http.async_register_static_paths(
            [StaticPathConfig(PANEL_URL, str(www_path), cache_headers=True)]
        )

    # Register the panel (iframe that loads our frontend).
    # Always remove first to avoid duplicate-registration errors on reload.
    async_remove_panel(hass, "skydark")
    async_register_built_in_panel(
        hass,
        component_name="iframe",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        frontend_url_path="skydark",
        config={"url": f"{PANEL_URL}/index.html"},
        require_admin=False,
    )

    # Database
    db_path = Path(hass.config.config_dir) / DOMAIN / DB_NAME
    db_path.parent.mkdir(parents=True, exist_ok=True)
    db = SkydarkDatabase(db_path)
    await hass.async_add_executor_job(db.init)
    hass.data[DOMAIN]["db"] = db

    # Store panel URL and config for frontend
    hass.data[DOMAIN]["panel_url"] = PANEL_URL
    hass.data[DOMAIN]["entry_id"] = entry.entry_id
    hass.data[DOMAIN]["config"] = entry.data

    # Register WebSocket API for frontend
    await async_register_websocket_handlers(hass)

    # Register services
    from . import services as skydark_services

    if not hass.services.has_service(DOMAIN, "add_event"):
        await skydark_services.async_setup_services(hass)

    # Set up platforms
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok and DOMAIN in hass.data:
        hass.data[DOMAIN].pop("db", None)
        hass.data[DOMAIN].pop("panel_url", None)
        hass.data[DOMAIN].pop("entry_id", None)
        hass.data[DOMAIN].pop("config", None)
    async_remove_panel(hass, "skydark")
    return unload_ok
