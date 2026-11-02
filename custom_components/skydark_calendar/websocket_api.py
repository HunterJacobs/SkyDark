"""WebSocket API for Skydark Family Calendar frontend."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from functools import partial
from typing import Any
from urllib.parse import quote

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import HomeAssistant, valid_entity_id
from homeassistant.loader import async_get_integration

from . import photo_media
from .const import CONF_FAMILY_NAME, CONF_WEATHER_ENTITY, DOMAIN

# How long signed photo URLs stay valid; the panel refreshes the list well before this.
PHOTO_URL_TTL = timedelta(hours=24)
EVENT_UPDATED = "skydark_calendar_updated"

_LOGGER = logging.getLogger(__name__)


def _get_db(hass: HomeAssistant):
    """Get database from hass data."""
    if DOMAIN not in hass.data:
        return None
    return hass.data[DOMAIN].get("db")


def _get_lists_with_items(db: Any) -> tuple[list, dict[str, list]]:
    """Fetch all lists and all list items in one pass (avoids N+1)."""
    lists_data = db.get_lists()
    items_map = db.get_all_list_items()
    list_items_by_list = {lst["id"]: items_map.get(lst["id"], []) for lst in lists_data}
    return lists_data, list_items_by_list


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_events",
        vol.Optional("start_date"): str,
        vol.Optional("end_date"): str,
    }
)
@websocket_api.async_response
async def websocket_get_events(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get events command."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    start = None
    end = None
    if msg.get("start_date"):
        try:
            start = datetime.fromisoformat(msg["start_date"].replace("Z", "+00:00"))
        except ValueError:
            connection.send_error(msg["id"], "invalid_format", "Invalid start_date")
            return
    if msg.get("end_date"):
        try:
            end = datetime.fromisoformat(msg["end_date"].replace("Z", "+00:00"))
        except ValueError:
            connection.send_error(msg["id"], "invalid_format", "Invalid end_date")
            return

    try:
        events = await hass.async_add_executor_job(
            partial(db.get_events, start=start, end=end)
        )
        connection.send_result(msg["id"], {"events": events})
    except Exception as e:
        _LOGGER.exception("websocket get_events failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading events.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_tasks",
    }
)
@websocket_api.async_response
async def websocket_get_tasks(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get tasks command."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    try:
        tasks = await hass.async_add_executor_job(db.get_tasks)
        connection.send_result(msg["id"], {"tasks": tasks})
    except Exception as e:
        _LOGGER.exception("websocket get_tasks failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading tasks.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_lists",
    }
)
@websocket_api.async_response
async def websocket_get_lists(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get lists command."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    try:
        lists_data, list_items_by_list = await hass.async_add_executor_job(
            _get_lists_with_items, db
        )
        connection.send_result(
            msg["id"], {"lists": lists_data, "list_items": list_items_by_list}
        )
    except Exception as e:
        _LOGGER.exception("websocket get_lists failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading lists.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_family_members",
    }
)
@websocket_api.async_response
async def websocket_get_family_members(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get family members command."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    try:
        members = await hass.async_add_executor_job(db.get_family_members)
        connection.send_result(msg["id"], {"family_members": members})
    except Exception as e:
        _LOGGER.exception("websocket get_family_members failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading family members.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_meals",
        vol.Optional("start_date"): str,
        vol.Optional("end_date"): str,
    }
)
@websocket_api.async_response
async def websocket_get_meals(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get meals command."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    start_date = msg.get("start_date")
    end_date = msg.get("end_date")

    try:
        meals = await hass.async_add_executor_job(
            partial(db.get_meals, start_date=start_date, end_date=end_date)
        )
        connection.send_result(msg["id"], {"meals": meals})
    except Exception as e:
        _LOGGER.exception("websocket get_meals failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading meals.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_config",
    }
)
@websocket_api.async_response
async def websocket_get_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get config command (panel URL and integration config)."""
    if DOMAIN not in hass.data:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    data = hass.data[DOMAIN]
    try:
        version = (await async_get_integration(hass, DOMAIN)).version
    except Exception:  # noqa: BLE001 - version is informational only
        version = None
    connection.send_result(
        msg["id"],
        {
            "panel_url": data.get("panel_url"),
            "config": data.get("config", {}),
            "version": str(version) if version else None,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/update_config",
        vol.Optional(CONF_FAMILY_NAME): vol.All(str, vol.Length(min=1, max=60)),
        vol.Optional(CONF_WEATHER_ENTITY): str,
    }
)
@websocket_api.async_response
async def websocket_update_config(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Save family name / weather entity to the config entry so every display shares them."""
    entry_id = hass.data.get(DOMAIN, {}).get("entry_id")
    entry = hass.config_entries.async_get_entry(entry_id) if entry_id else None
    if entry is None:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return

    options = {**entry.options}
    if CONF_FAMILY_NAME in msg:
        options[CONF_FAMILY_NAME] = msg[CONF_FAMILY_NAME].strip()
    if CONF_WEATHER_ENTITY in msg:
        weather = msg[CONF_WEATHER_ENTITY].strip()
        if weather and (
            not valid_entity_id(weather)
            or not weather.startswith("weather.")
            or hass.states.get(weather) is None
        ):
            connection.send_error(
                msg["id"], "invalid_entity", f"{weather} is not a weather entity in Home Assistant."
            )
            return
        options[CONF_WEATHER_ENTITY] = weather

    hass.config_entries.async_update_entry(entry, options=options)
    config = {**entry.data, **options}
    hass.data[DOMAIN]["config"] = config
    connection.send_result(msg["id"], {"config": config})


def _signed_photo(hass: HomeAssistant, connection: Any, row: dict[str, Any]) -> dict[str, Any]:
    # HA signs the decoded path; re-encode it so the URL is valid as-is in an <img src>.
    signed = async_sign_path(
        hass, row["file_path"], PHOTO_URL_TTL, refresh_token_id=connection.refresh_token_id
    )
    path, sep, query = signed.partition("?")
    return {
        "id": row["id"],
        "url": quote(path) + sep + query,
        "caption": row.get("caption") or "",
        "created_at": row.get("created_at"),
    }


@websocket_api.websocket_command({vol.Required("type"): "skydark_calendar/get_photos"})
@websocket_api.async_response
async def websocket_get_photos(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return photos with short-lived signed URLs the panel can load directly."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    rows = await hass.async_add_executor_job(db.get_photos)
    photos = [
        _signed_photo(hass, connection, row)
        for row in rows
        if str(row.get("file_path") or "").startswith(photo_media.MEDIA_URL_PREFIX)
    ]
    connection.send_result(msg["id"], {"photos": photos})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/upload_photo",
        vol.Required("data_url"): str,
        vol.Optional("caption"): vol.All(str, vol.Length(max=200)),
    }
)
@websocket_api.async_response
async def websocket_upload_photo(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Save an uploaded photo into Media > Calendar Images."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        url = await hass.async_add_executor_job(photo_media.save_data_url, hass, msg["data_url"])
    except photo_media.PhotoError as err:
        connection.send_error(msg["id"], "invalid_photo", str(err))
        return
    except OSError:
        _LOGGER.exception("Could not save uploaded photo")
        connection.send_error(msg["id"], "failed", "Could not save the photo to Home Assistant media.")
        return
    photo_id = await hass.async_add_executor_job(
        partial(db.add_photo, file_path=url, caption=msg.get("caption"))
    )
    row = await hass.async_add_executor_job(db.get_photo, photo_id)
    hass.bus.async_fire(EVENT_UPDATED)
    connection.send_result(msg["id"], {"photo": _signed_photo(hass, connection, row)})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/delete_photo",
        vol.Required("photo_id"): str,
    }
)
@websocket_api.async_response
async def websocket_delete_photo(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a photo and its file."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    row = await hass.async_add_executor_job(db.get_photo, msg["photo_id"])
    if row is None:
        connection.send_error(msg["id"], "not_found", "Photo not found")
        return
    await hass.async_add_executor_job(db.delete_photo, msg["photo_id"])
    try:
        await hass.async_add_executor_job(photo_media.delete_file, hass, row["file_path"])
    except OSError:
        _LOGGER.warning("Photo %s removed but its file could not be deleted", msg["photo_id"])
    hass.bus.async_fire(EVENT_UPDATED)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_points",
    }
)
@websocket_api.async_response
async def websocket_get_points(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return points balance per family member (member_id -> points)."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        points_by_member = await hass.async_add_executor_job(db.get_points_by_member)
        connection.send_result(msg["id"], {"points_by_member": points_by_member})
    except Exception as e:
        _LOGGER.exception("websocket get_points failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading points.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_rewards",
    }
)
@websocket_api.async_response
async def websocket_get_rewards(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return rewards list."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        rewards = await hass.async_add_executor_job(db.get_rewards)
        connection.send_result(msg["id"], {"rewards": rewards})
    except Exception as e:
        _LOGGER.exception("websocket get_rewards failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading rewards.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_meal_recipes",
    }
)
@websocket_api.async_response
async def websocket_get_meal_recipes(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return meal recipes with ingredients."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        recipes = await hass.async_add_executor_job(db.get_meal_recipes_with_ingredients)
        connection.send_result(msg["id"], {"recipes": recipes})
    except Exception as e:
        _LOGGER.exception("websocket get_meal_recipes failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading recipes.")


@websocket_api.websocket_command(
    {vol.Required("type"): "skydark_calendar/get_ha_calendars"}
)
@websocket_api.async_response
async def websocket_get_ha_calendars(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """List Home Assistant calendar entities that can be synced."""
    from .calendar_sync import list_ha_calendars

    connection.send_result(msg["id"], {"calendars": list_ha_calendars(hass)})


@websocket_api.websocket_command(
    {vol.Required("type"): "skydark_calendar/get_sync_status"}
)
@websocket_api.async_response
async def websocket_get_sync_status(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return configured sync links plus available HA calendars."""
    from .calendar_sync import list_ha_calendars

    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    links = await hass.async_add_executor_job(db.get_sync_links)
    sync = hass.data.get(DOMAIN, {}).get("sync")
    connection.send_result(
        msg["id"],
        {
            "calendars": list_ha_calendars(hass),
            "links": links,
            "last_run": getattr(sync, "last_run", None),
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/save_sync_link",
        vol.Required("entity_id"): str,
        vol.Optional("name"): str,
        vol.Optional("pull_enabled"): bool,
        vol.Optional("push_enabled"): bool,
        vol.Optional("import_existing"): bool,
    }
)
@websocket_api.async_response
async def websocket_save_sync_link(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create or update a per-calendar sync link."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    from .calendar_sync import list_ha_calendars

    calendars = {item["entity_id"]: item for item in list_ha_calendars(hass)}
    info = calendars.get(msg["entity_id"])
    if not info:
        connection.send_error(msg["id"], "not_found", "Calendar entity not found")
        return
    if msg.get("push_enabled") and not info.get("can_create"):
        connection.send_error(
            msg["id"],
            "read_only",
            "This calendar cannot receive new events from Home Assistant.",
        )
        return
    link_id = await hass.async_add_executor_job(
        partial(
            db.upsert_sync_link,
            entity_id=msg["entity_id"],
            name=msg.get("name") or info["name"],
            pull_enabled=msg.get("pull_enabled"),
            push_enabled=msg.get("push_enabled"),
            import_existing=msg.get("import_existing"),
        )
    )
    sync = hass.data.get(DOMAIN, {}).get("sync")
    summary = None
    if sync and (msg.get("pull_enabled") or msg.get("push_enabled") or msg.get("import_existing")):
        summary = await sync.async_sync_all(
            import_all=bool(msg.get("import_existing")),
            only_entity_id=msg["entity_id"],
        )
    connection.send_result(msg["id"], {"link_id": link_id, "sync": summary})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/delete_sync_link",
        vol.Required("entity_id"): str,
    }
)
@websocket_api.async_response
async def websocket_delete_sync_link(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Remove a sync link. Imported events stay in SkyDark."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    link = await hass.async_add_executor_job(db.get_sync_link_by_entity, msg["entity_id"])
    if link:
        await hass.async_add_executor_job(db.delete_sync_link, link["id"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/sync_now",
        vol.Optional("entity_id"): str,
        vol.Optional("import_existing"): bool,
    }
)
@websocket_api.async_response
async def websocket_sync_now(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Run calendar sync immediately."""
    sync = hass.data.get(DOMAIN, {}).get("sync")
    if not sync:
        connection.send_error(msg["id"], "not_ready", "Sync is not running")
        return
    summary = await sync.async_sync_all(
        import_all=bool(msg.get("import_existing")),
        only_entity_id=msg.get("entity_id"),
    )
    connection.send_result(msg["id"], summary)


async def async_register_websocket_handlers(hass: HomeAssistant) -> None:
    """Register WebSocket API handlers (skip if already registered on reload)."""
    if hass.data.get(DOMAIN, {}).get("ws_registered"):
        return
    websocket_api.async_register_command(hass, websocket_get_events)
    websocket_api.async_register_command(hass, websocket_get_tasks)
    websocket_api.async_register_command(hass, websocket_get_lists)
    websocket_api.async_register_command(hass, websocket_get_family_members)
    websocket_api.async_register_command(hass, websocket_get_meals)
    websocket_api.async_register_command(hass, websocket_get_config)
    websocket_api.async_register_command(hass, websocket_get_points)
    websocket_api.async_register_command(hass, websocket_get_rewards)
    websocket_api.async_register_command(hass, websocket_get_meal_recipes)
    websocket_api.async_register_command(hass, websocket_get_ha_calendars)
    websocket_api.async_register_command(hass, websocket_get_sync_status)
    websocket_api.async_register_command(hass, websocket_save_sync_link)
    websocket_api.async_register_command(hass, websocket_delete_sync_link)
    websocket_api.async_register_command(hass, websocket_sync_now)
    websocket_api.async_register_command(hass, websocket_update_config)
    websocket_api.async_register_command(hass, websocket_get_photos)
    websocket_api.async_register_command(hass, websocket_upload_photo)
    websocket_api.async_register_command(hass, websocket_delete_photo)
    hass.data.setdefault(DOMAIN, {})["ws_registered"] = True
