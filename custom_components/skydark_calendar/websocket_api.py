"""WebSocket API for Skydark Family Calendar frontend."""

from __future__ import annotations

import logging
from datetime import datetime
from functools import partial
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN

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
    connection.send_result(
        msg["id"],
        {
            "panel_url": data.get("panel_url"),
            "config": data.get("config", {}),
        },
    )


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
        members = await hass.async_add_executor_job(db.get_family_members)
        points_by_member = {}
        for m in members:
            mid = m.get("id")
            if mid:
                pts = await hass.async_add_executor_job(db.get_points, mid)
                points_by_member[mid] = pts
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
    """Return meal recipes with ingredients (for library)."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        def _load():
            recipes = db.get_meal_recipes()
            out = []
            for r in recipes:
                ing = db.get_meal_recipe_ingredients(r["id"])
                out.append({
                    "id": r["id"],
                    "name": r["name"],
                    "ingredients": [
                        {"name": i.get("name", ""), "quantity": i.get("quantity") or "", "unit": i.get("unit") or ""}
                        for i in ing
                    ],
                })
            return out
        recipes = await hass.async_add_executor_job(_load)
        connection.send_result(msg["id"], {"recipes": recipes})
    except Exception as e:
        _LOGGER.exception("websocket get_meal_recipes failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading recipes.")


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
    hass.data.setdefault(DOMAIN, {})["ws_registered"] = True
