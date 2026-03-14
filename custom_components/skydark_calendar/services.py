"""Service handlers for Skydark Family Calendar."""

from __future__ import annotations

import logging
import os
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import Any

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

SERVICE_ADD_EVENT = "add_event"
SERVICE_ADD_TASK = "add_task"
SERVICE_UPDATE_TASK = "update_task"
SERVICE_COMPLETE_TASK = "complete_task"
SERVICE_ADD_POINTS = "add_points"
SERVICE_ADD_REWARD = "add_reward"
SERVICE_REDEEM_REWARD = "redeem_reward"
SERVICE_ADD_LIST_ITEM = "add_list_item"
SERVICE_CREATE_LIST = "create_list"
SERVICE_ADD_MEAL_RECIPE = "add_meal_recipe"
SERVICE_UPLOAD_PHOTO = "upload_photo"
SERVICE_SEND_NOTIFICATION = "send_notification"

ADD_EVENT_SCHEMA = vol.Schema(
    {
        vol.Required("title"): cv.string,
        vol.Required("start_time"): vol.Any(cv.datetime, cv.string),
        vol.Optional("end_time"): vol.Any(cv.datetime, cv.string),
        vol.Optional("all_day", default=False): cv.boolean,
        vol.Optional("calendar_id"): cv.string,
        vol.Optional("description"): cv.string,
        vol.Optional("location"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

ADD_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("title"): cv.string,
        vol.Required("assignee_id"): cv.string,
        vol.Optional("category"): cv.string,
        vol.Optional("frequency", default="daily"): cv.string,
        vol.Optional("icon"): cv.string,
        vol.Optional("points", default=0): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Optional("due_date"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

UPDATE_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Optional("title"): cv.string,
        vol.Optional("assignee_id"): cv.string,
        vol.Optional("category"): cv.string,
        vol.Optional("frequency"): cv.string,
        vol.Optional("icon"): cv.string,
        vol.Optional("points"): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Optional("due_date"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

COMPLETE_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("task_id"): cv.string,
        vol.Optional("completed_date"): cv.string,
        vol.Optional("points", default=0): vol.All(vol.Coerce(int), vol.Range(min=0)),
    },
    extra=vol.PREVENT_EXTRA,
)

ADD_REWARD_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Required("points_required"): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Optional("description"): cv.string,
        vol.Optional("icon"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

ADD_POINTS_SCHEMA = vol.Schema(
    {
        vol.Required("member_id"): cv.string,
        vol.Required("points"): int,
        vol.Required("reason"): cv.string,
        vol.Optional("task_id"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

REDEEM_REWARD_SCHEMA = vol.Schema(
    {
        vol.Required("member_id"): cv.string,
        vol.Required("reward_id"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

CREATE_LIST_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("color"): cv.string,
        vol.Optional("owner_id"): cv.string,
        vol.Optional("list_type", default="general"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

ADD_MEAL_RECIPE_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("ingredients", default=[]): vol.All(
            cv.ensure_list,
            [
                vol.Schema(
                    {
                        vol.Required("name"): cv.string,
                        vol.Optional("quantity", default=""): cv.string,
                        vol.Optional("unit", default=""): cv.string,
                    }
                )
            ],
        ),
    },
    extra=vol.PREVENT_EXTRA,
)

UPLOAD_PHOTO_SCHEMA = vol.Schema(
    {
        vol.Required("file_path"): cv.string,
        vol.Optional("caption"): cv.string,
        vol.Optional("uploaded_by"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

ADD_LIST_ITEM_SCHEMA = vol.Schema(
    {
        vol.Required("list_id"): cv.string,
        vol.Required("content"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

SEND_NOTIFICATION_SCHEMA = vol.Schema(
    {
        vol.Required("message"): cv.string,
        vol.Optional("title"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)


async def async_setup_services(hass: HomeAssistant) -> None:
    """Register Skydark Calendar services."""

    def _parse_datetime(value: Any) -> datetime | None:
        """Parse start_time/end_time from datetime or ISO string."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError:
                pass
        return None

    async def add_event(call: ServiceCall) -> None:
        """Add a calendar event."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            _LOGGER.warning("Database not ready")
            return
        start = _parse_datetime(call.data.get("start_time"))
        end = _parse_datetime(call.data.get("end_time"))
        if start is None:
            _LOGGER.warning("add_event: invalid or missing start_time")
            return
        try:
            event_id = await hass.async_add_executor_job(
                partial(
                    db.add_event,
                    title=call.data["title"],
                    start_time=start,
                    end_time=end,
                    all_day=call.data.get("all_day", False),
                    calendar_id=call.data.get("calendar_id"),
                    description=call.data.get("description"),
                    location=call.data.get("location"),
                )
            )
            hass.bus.async_fire(
                "skydark_calendar_event_created",
                {"event_id": event_id, "title": call.data["title"]},
            )
        except Exception as e:
            _LOGGER.exception("add_event failed: %s", e)

    async def add_task(call: ServiceCall) -> None:
        """Add a new task."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            _LOGGER.warning("Database not ready")
            return
        try:
            await hass.async_add_executor_job(
                partial(
                    db.add_task,
                    title=call.data["title"],
                    assignee_id=call.data["assignee_id"],
                    category=call.data.get("category"),
                    frequency=call.data.get("frequency", "daily"),
                    icon=call.data.get("icon"),
                    points=call.data.get("points", 0),
                    due_date=call.data.get("due_date"),
                )
            )
        except Exception as e:
            _LOGGER.exception("add_task failed: %s", e)

    async def update_task(call: ServiceCall) -> None:
        """Update an existing task."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            _LOGGER.warning("Database not ready")
            return
        try:
            await hass.async_add_executor_job(
                partial(
                    db.update_task,
                    call.data["task_id"],
                    title=call.data.get("title"),
                    assignee_id=call.data.get("assignee_id"),
                    category=call.data.get("category"),
                    frequency=call.data.get("frequency"),
                    icon=call.data.get("icon"),
                    points=call.data.get("points"),
                    due_date=call.data.get("due_date"),
                )
            )
        except Exception as e:
            _LOGGER.exception("update_task failed: %s", e)

    async def complete_task(call: ServiceCall) -> None:
        """Mark a task complete and optionally award points (atomic)."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            _LOGGER.warning("Database not ready")
            return
        try:
            task_id = call.data["task_id"]
            completed_date_str = call.data.get("completed_date")
            points = call.data.get("points", 0)

            parsed_date = None
            if completed_date_str:
                try:
                    parsed_date = datetime.fromisoformat(
                        completed_date_str.replace("Z", "+00:00")
                    )
                except ValueError:
                    _LOGGER.warning(
                        "Invalid completed_date '%s', using current time",
                        completed_date_str,
                    )

            await hass.async_add_executor_job(
                partial(
                    db.complete_task_and_award_points,
                    task_id,
                    parsed_date,
                    points,
                )
            )
        except Exception as e:
            _LOGGER.exception("complete_task failed: %s", e)

    async def add_points(call: ServiceCall) -> None:
        """Award points to a family member."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return
        try:
            await hass.async_add_executor_job(
                partial(
                    db.add_points,
                    member_id=call.data["member_id"],
                    points=call.data["points"],
                    reason=call.data["reason"],
                    task_id=call.data.get("task_id"),
                )
            )
        except Exception as e:
            _LOGGER.exception("add_points failed: %s", e)

    async def add_reward(call: ServiceCall) -> None:
        """Add a new reward definition."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return
        try:
            await hass.async_add_executor_job(
                partial(
                    db.add_reward,
                    name=call.data["name"],
                    points_required=call.data["points_required"],
                    description=call.data.get("description"),
                    icon=call.data.get("icon"),
                )
            )
        except Exception as e:
            _LOGGER.exception("add_reward failed: %s", e)

    async def redeem_reward(call: ServiceCall) -> None:
        """Deduct points and redeem a reward for a member."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return
        try:
            ok = await hass.async_add_executor_job(
                db.redeem_reward,
                call.data["member_id"],
                call.data["reward_id"],
            )
            if not ok:
                _LOGGER.warning("redeem_reward: insufficient points or invalid reward")
        except Exception as e:
            _LOGGER.exception("redeem_reward failed: %s", e)

    async def create_list(call: ServiceCall) -> None:
        """Create a new list with optional owner."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return
        try:
            await hass.async_add_executor_job(
                partial(
                    db.add_list,
                    name=call.data["name"],
                    color=call.data.get("color"),
                    owner_id=call.data.get("owner_id"),
                    list_type=call.data.get("list_type", "general"),
                )
            )
        except Exception as e:
            _LOGGER.exception("create_list failed: %s", e)

    async def add_meal_recipe(call: ServiceCall) -> None:
        """Add a meal recipe with ingredients."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return
        try:
            await hass.async_add_executor_job(
                partial(
                    db.add_meal_recipe,
                    name=call.data["name"],
                    ingredients=call.data.get("ingredients", []),
                )
            )
        except Exception as e:
            _LOGGER.exception("add_meal_recipe failed: %s", e)

    async def upload_photo(call: ServiceCall) -> None:
        """Register a photo (file_path already stored on disk)."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return

        file_path = call.data["file_path"]

        config_dir = Path(hass.config.config_dir).resolve()
        try:
            resolved_path = Path(file_path).resolve()
            if not resolved_path.is_relative_to(config_dir):
                _LOGGER.warning(
                    "upload_photo: rejected file_path '%s' outside config directory",
                    file_path,
                )
                return
            if not resolved_path.is_file():
                _LOGGER.warning("upload_photo: file does not exist '%s'", file_path)
                return
        except (ValueError, OSError) as e:
            _LOGGER.warning("upload_photo: invalid file_path '%s': %s", file_path, e)
            return

        try:
            await hass.async_add_executor_job(
                partial(
                    db.add_photo,
                    file_path=file_path,
                    caption=call.data.get("caption"),
                    uploaded_by=call.data.get("uploaded_by"),
                )
            )
        except Exception as e:
            _LOGGER.exception("upload_photo failed: %s", e)

    async def add_list_item(call: ServiceCall) -> None:
        """Add item to a list."""
        if DOMAIN not in hass.data:
            return
        db = hass.data[DOMAIN].get("db")
        if not db:
            return
        try:
            await hass.async_add_executor_job(
                db.add_list_item,
                call.data["list_id"],
                call.data["content"],
            )
        except Exception as e:
            _LOGGER.exception("add_list_item failed: %s", e)

    async def send_notification(call: ServiceCall) -> None:
        """Send notification to display."""
        title = call.data.get("title", "Skydark")
        message = call.data.get("message", "")
        try:
            await hass.services.async_call(
                "persistent_notification",
                "create",
                {"title": title, "message": message},
                blocking=True,
            )
        except Exception as e:
            _LOGGER.exception("send_notification failed: %s", e)

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_EVENT, add_event, schema=ADD_EVENT_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_TASK, add_task, schema=ADD_TASK_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPDATE_TASK, update_task, schema=UPDATE_TASK_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_COMPLETE_TASK, complete_task, schema=COMPLETE_TASK_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_REWARD, add_reward, schema=ADD_REWARD_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_POINTS, add_points, schema=ADD_POINTS_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_REDEEM_REWARD, redeem_reward, schema=REDEEM_REWARD_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_LIST_ITEM, add_list_item, schema=ADD_LIST_ITEM_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CREATE_LIST, create_list, schema=CREATE_LIST_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_ADD_MEAL_RECIPE, add_meal_recipe, schema=ADD_MEAL_RECIPE_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_UPLOAD_PHOTO, upload_photo, schema=UPLOAD_PHOTO_SCHEMA
    )
    hass.services.async_register(
        DOMAIN, SERVICE_SEND_NOTIFICATION, send_notification, schema=SEND_NOTIFICATION_SCHEMA
    )
