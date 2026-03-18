"""WebSocket API for Skydark Family Calendar frontend."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant

from .const import DOMAIN
from . import photos as photos_module

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
        vol.Required("type"): "skydark_calendar/get_photos",
    }
)
@websocket_api.async_response
async def websocket_get_photos(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Handle get photos command."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        photos = await hass.async_add_executor_job(db.get_photos)
        # Convert file_path to media-source URL for display
        for p in photos:
            fp = p.get("file_path") or ""
            p["file_path"] = photos_module.file_path_to_media_source_url(fp)
        connection.send_result(msg["id"], {"photos": photos})
    except Exception as e:
        _LOGGER.exception("websocket get_photos failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading photos.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/add_photo",
        vol.Required("url"): str,
        vol.Optional("caption"): str,
        vol.Optional("uploaded_by"): str,
    }
)
@websocket_api.async_response
async def websocket_add_photo(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Save a frontend photo (data URL) to Media > My Media > Calendar Images."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    url = msg["url"]
    # Data URL: save to media folder
    if url.strip().lower().startswith("data:"):
        config_dir = Path(hass.config.config_dir)
        rel_path = await hass.async_add_executor_job(
            photos_module.save_photo_to_media, config_dir, url
        )
        if not rel_path:
            connection.send_error(msg["id"], "failed", "Invalid image data or save failed.")
            return
        try:
            photo_id = await hass.async_add_executor_job(
                partial(
                    db.add_photo,
                    file_path=rel_path,
                    caption=msg.get("caption"),
                    uploaded_by=msg.get("uploaded_by"),
                )
            )
            connection.send_result(msg["id"], {"photo_id": photo_id})
        except Exception as e:
            _LOGGER.exception("websocket add_photo failed: %s", e)
            connection.send_error(msg["id"], "failed", "An error occurred saving photo.")
        return
    # Legacy: non-data URL (e.g. from upload_photo service) - store path as-is
    try:
        photo_id = await hass.async_add_executor_job(
            partial(
                db.add_photo,
                file_path=url,
                caption=msg.get("caption"),
                uploaded_by=msg.get("uploaded_by"),
            )
        )
        connection.send_result(msg["id"], {"photo_id": photo_id})
    except Exception as e:
        _LOGGER.exception("websocket add_photo failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred saving photo.")


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
    """Delete a photo from DB and from Media > Calendar Images if applicable."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    photo_id = msg["photo_id"]
    try:
        photo = await hass.async_add_executor_job(db.get_photo, photo_id)
        if photo:
            rel_path = photo.get("file_path") or ""
            if rel_path and not rel_path.startswith("data:") and ".." not in rel_path:
                config_dir = Path(hass.config.config_dir)
                await hass.async_add_executor_job(
                    photos_module.delete_photo_from_media, config_dir, rel_path
                )
        await hass.async_add_executor_job(db.delete_photo, photo_id)
        connection.send_result(msg["id"], {"success": True})
    except Exception as e:
        _LOGGER.exception("websocket delete_photo failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred deleting photo.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/add_family_member",
        vol.Required("name"): str,
        vol.Required("color"): str,
        vol.Optional("initial"): str,
        vol.Optional("avatar_url"): str,
    }
)
@websocket_api.async_response
async def websocket_add_family_member(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Create a family member and return its full row."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        member_id = await hass.async_add_executor_job(
            partial(
                db.add_family_member,
                name=msg["name"],
                color=msg["color"],
                initial=msg.get("initial"),
                avatar_url=msg.get("avatar_url"),
            )
        )
        members = await hass.async_add_executor_job(db.get_family_members)
        member = next((m for m in members if m.get("id") == member_id), None)
        connection.send_result(msg["id"], {"family_member": member or {"id": member_id}})
    except Exception as e:
        _LOGGER.exception("websocket add_family_member failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred adding family member.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/update_family_member",
        vol.Required("member_id"): str,
        vol.Optional("name"): str,
        vol.Optional("color"): str,
        vol.Optional("initial"): str,
        vol.Optional("avatar_url"): str,
        vol.Optional("sort_order"): int,
    }
)
@websocket_api.async_response
async def websocket_update_family_member(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Update mutable fields for a family member."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        await hass.async_add_executor_job(
            partial(
                db.update_family_member,
                msg["member_id"],
                name=msg.get("name"),
                color=msg.get("color"),
                initial=msg.get("initial"),
                avatar_url=msg.get("avatar_url"),
                sort_order=msg.get("sort_order"),
            )
        )
        connection.send_result(msg["id"], {"success": True})
    except Exception as e:
        _LOGGER.exception("websocket update_family_member failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred updating family member.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/delete_family_member",
        vol.Required("member_id"): str,
    }
)
@websocket_api.async_response
async def websocket_delete_family_member(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a family member by id."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        await hass.async_add_executor_job(db.delete_family_member, msg["member_id"])
        connection.send_result(msg["id"], {"success": True})
    except Exception as e:
        _LOGGER.exception("websocket delete_family_member failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred deleting family member.")


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

        def _enrich_meals():
            out = []
            for m in meals:
                row = dict(m)
                recipe_id = row.get("meal_recipe_id")
                if recipe_id:
                    ing_list = db.get_meal_recipe_ingredients(recipe_id)
                    row["ingredients"] = [
                        {"name": i.get("name", ""), "quantity": i.get("quantity") or "", "unit": i.get("unit") or ""}
                        for i in ing_list
                    ]
                elif row.get("ingredients"):
                    try:
                        parsed = json.loads(row["ingredients"])
                        row["ingredients"] = parsed if isinstance(parsed, list) else []
                    except (TypeError, ValueError):
                        row["ingredients"] = []
                else:
                    row["ingredients"] = []
                out.append(row)
            return out

        enriched = await hass.async_add_executor_job(_enrich_meals)
        connection.send_result(msg["id"], {"meals": enriched})
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
                    "image_url": r.get("image_url"),
                    "instructions": r.get("instructions"),
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


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/add_meal_recipe",
        vol.Required("name"): str,
        vol.Optional("ingredients", default=[]): list,
        vol.Optional("image_url"): str,
        vol.Optional("instructions"): str,
    }
)
@websocket_api.async_response
async def websocket_add_meal_recipe(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add a meal recipe and return its id (for linking to a new meal)."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        name = msg["name"]
        ingredients = msg.get("ingredients") or []
        image_url = msg.get("image_url")
        instructions = msg.get("instructions")
        recipe_id = await hass.async_add_executor_job(
            partial(
                db.add_meal_recipe,
                name=name,
                ingredients=ingredients,
                image_url=image_url,
                instructions=instructions,
            )
        )
        connection.send_result(msg["id"], {"recipe_id": recipe_id})
    except Exception as e:
        _LOGGER.exception("websocket add_meal_recipe failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred adding recipe.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/delete_reward",
        vol.Required("reward_id"): str,
    }
)
@websocket_api.async_response
async def websocket_delete_reward(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Delete a reward by id."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        await hass.async_add_executor_job(db.delete_reward, msg["reward_id"])
        connection.send_result(msg["id"], {"success": True})
    except Exception as e:
        _LOGGER.exception("websocket delete_reward failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred deleting the reward.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/get_app_settings",
    }
)
@websocket_api.async_response
async def websocket_get_app_settings(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return app settings blob stored in DB (shared across devices)."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        settings = await hass.async_add_executor_job(db.get_settings)
        raw_blob = settings.get("frontend_app_settings_v1", "{}")
        parsed_blob: dict[str, Any] = {}
        try:
            candidate = json.loads(raw_blob)
            if isinstance(candidate, dict):
                parsed_blob = candidate
        except (TypeError, ValueError):
            parsed_blob = {}
        connection.send_result(msg["id"], {"settings": parsed_blob})
    except Exception as e:
        _LOGGER.exception("websocket get_app_settings failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred loading app settings.")


@websocket_api.websocket_command(
    {
        vol.Required("type"): "skydark_calendar/set_app_settings",
        vol.Required("settings"): dict,
    }
)
@websocket_api.async_response
async def websocket_set_app_settings(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Persist app settings blob in DB (shared across devices)."""
    db = _get_db(hass)
    if not db:
        connection.send_error(msg["id"], "not_ready", "Integration not loaded")
        return
    try:
        settings_blob = msg.get("settings", {})
        if not isinstance(settings_blob, dict):
            connection.send_error(msg["id"], "invalid_format", "settings must be an object")
            return
        await hass.async_add_executor_job(
            db.save_setting, "frontend_app_settings_v1", json.dumps(settings_blob)
        )
        connection.send_result(msg["id"], {"success": True})
    except Exception as e:
        _LOGGER.exception("websocket set_app_settings failed: %s", e)
        connection.send_error(msg["id"], "failed", "An error occurred saving app settings.")


async def async_register_websocket_handlers(hass: HomeAssistant) -> None:
    """Register WebSocket API handlers (skip if already registered on reload)."""
    if hass.data.get(DOMAIN, {}).get("ws_registered"):
        return
    websocket_api.async_register_command(hass, websocket_get_events)
    websocket_api.async_register_command(hass, websocket_get_tasks)
    websocket_api.async_register_command(hass, websocket_get_lists)
    websocket_api.async_register_command(hass, websocket_get_family_members)
    websocket_api.async_register_command(hass, websocket_get_photos)
    websocket_api.async_register_command(hass, websocket_add_photo)
    websocket_api.async_register_command(hass, websocket_delete_photo)
    websocket_api.async_register_command(hass, websocket_add_family_member)
    websocket_api.async_register_command(hass, websocket_update_family_member)
    websocket_api.async_register_command(hass, websocket_delete_family_member)
    websocket_api.async_register_command(hass, websocket_get_meals)
    websocket_api.async_register_command(hass, websocket_get_config)
    websocket_api.async_register_command(hass, websocket_get_app_settings)
    websocket_api.async_register_command(hass, websocket_set_app_settings)
    websocket_api.async_register_command(hass, websocket_get_points)
    websocket_api.async_register_command(hass, websocket_get_rewards)
    websocket_api.async_register_command(hass, websocket_delete_reward)
    websocket_api.async_register_command(hass, websocket_get_meal_recipes)
    websocket_api.async_register_command(hass, websocket_add_meal_recipe)
    hass.data.setdefault(DOMAIN, {})["ws_registered"] = True
