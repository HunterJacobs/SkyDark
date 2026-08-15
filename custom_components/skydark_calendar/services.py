"""Service handlers for Skydark Family Calendar."""

from __future__ import annotations

import json
import logging
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import Any, Callable

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

EVENT_UPDATED = "skydark_calendar_updated"

SERVICE_ADD_EVENT = "add_event"
SERVICE_UPDATE_EVENT = "update_event"
SERVICE_DELETE_EVENT = "delete_event"
SERVICE_COMPLETE_TASK = "complete_task"
SERVICE_UNCOMPLETE_TASK = "uncomplete_task"
SERVICE_ADD_TASK = "add_task"
SERVICE_UPDATE_TASK = "update_task"
SERVICE_DELETE_TASK = "delete_task"
SERVICE_ADD_POINTS = "add_points"
SERVICE_REDEEM_REWARD = "redeem_reward"
SERVICE_ADD_REWARD = "add_reward"
SERVICE_DELETE_REWARD = "delete_reward"
SERVICE_ADD_LIST_ITEM = "add_list_item"
SERVICE_TOGGLE_LIST_ITEM = "toggle_list_item"
SERVICE_DELETE_LIST_ITEM = "delete_list_item"
SERVICE_CREATE_LIST = "create_list"
SERVICE_DELETE_LIST = "delete_list"
SERVICE_ADD_MEAL = "add_meal"
SERVICE_UPDATE_MEAL = "update_meal"
SERVICE_DELETE_MEAL = "delete_meal"
SERVICE_ADD_MEAL_RECIPE = "add_meal_recipe"
SERVICE_DELETE_MEAL_RECIPE = "delete_meal_recipe"
SERVICE_ADD_FAMILY_MEMBER = "add_family_member"
SERVICE_UPDATE_FAMILY_MEMBER = "update_family_member"
SERVICE_DELETE_FAMILY_MEMBER = "delete_family_member"
SERVICE_UPLOAD_PHOTO = "upload_photo"
SERVICE_SEND_NOTIFICATION = "send_notification"
SERVICE_SYNC_CALENDARS = "sync_calendars"

SERVICES = (
    SERVICE_ADD_EVENT,
    SERVICE_UPDATE_EVENT,
    SERVICE_DELETE_EVENT,
    SERVICE_COMPLETE_TASK,
    SERVICE_UNCOMPLETE_TASK,
    SERVICE_ADD_TASK,
    SERVICE_UPDATE_TASK,
    SERVICE_DELETE_TASK,
    SERVICE_ADD_POINTS,
    SERVICE_REDEEM_REWARD,
    SERVICE_ADD_REWARD,
    SERVICE_DELETE_REWARD,
    SERVICE_ADD_LIST_ITEM,
    SERVICE_TOGGLE_LIST_ITEM,
    SERVICE_DELETE_LIST_ITEM,
    SERVICE_CREATE_LIST,
    SERVICE_DELETE_LIST,
    SERVICE_ADD_MEAL,
    SERVICE_UPDATE_MEAL,
    SERVICE_DELETE_MEAL,
    SERVICE_ADD_MEAL_RECIPE,
    SERVICE_DELETE_MEAL_RECIPE,
    SERVICE_ADD_FAMILY_MEMBER,
    SERVICE_UPDATE_FAMILY_MEMBER,
    SERVICE_DELETE_FAMILY_MEMBER,
    SERVICE_UPLOAD_PHOTO,
    SERVICE_SEND_NOTIFICATION,
    SERVICE_SYNC_CALENDARS,
)

ADD_EVENT_SCHEMA = vol.Schema(
    {
        vol.Required("title"): cv.string,
        vol.Required("start_time"): cv.datetime,
        vol.Optional("end_time"): cv.datetime,
        vol.Optional("all_day", default=False): cv.boolean,
        vol.Optional("calendar_id"): cv.string,
        vol.Optional("description"): cv.string,
        vol.Optional("location"): cv.string,
        vol.Optional("color"): cv.string,
        vol.Optional("sync_push_targets"): vol.Any(cv.string, [cv.string]),
    },
    extra=vol.PREVENT_EXTRA,
)

UPDATE_EVENT_SCHEMA = vol.Schema(
    {
        vol.Required("event_id"): cv.string,
        vol.Optional("title"): cv.string,
        vol.Optional("start_time"): cv.datetime,
        vol.Optional("end_time"): cv.datetime,
        vol.Optional("all_day"): cv.boolean,
        vol.Optional("calendar_id"): cv.string,
        vol.Optional("description"): cv.string,
        vol.Optional("location"): cv.string,
        vol.Optional("color"): cv.string,
        vol.Optional("sync_push_targets"): vol.Any(cv.string, [cv.string]),
    },
    extra=vol.PREVENT_EXTRA,
)

DELETE_ID_SCHEMA = vol.Schema(
    {vol.Required("event_id"): cv.string},
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

UNCOMPLETE_TASK_SCHEMA = vol.Schema(
    {vol.Required("task_id"): cv.string},
    extra=vol.PREVENT_EXTRA,
)

TASK_SCHEDULE_SCHEMA = {
    vol.Optional("weekdays"): vol.All(cv.ensure_list, [vol.Coerce(int)]),
    vol.Optional("custom_schedule"): cv.string,
    vol.Optional("custom_monthday"): vol.Coerce(int),
    vol.Optional("custom_month"): vol.Coerce(int),
    vol.Optional("custom_weekday"): vol.Coerce(int),
    vol.Optional("custom_week_of_month"): vol.Coerce(int),
}

ADD_TASK_SCHEMA = vol.Schema(
    {
        vol.Required("title"): cv.string,
        vol.Required("assignee_id"): cv.string,
        vol.Optional("category"): cv.string,
        vol.Optional("frequency", default="daily"): cv.string,
        vol.Optional("icon"): cv.string,
        vol.Optional("points", default=0): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Optional("due_date"): cv.string,
        **TASK_SCHEDULE_SCHEMA,
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
        **TASK_SCHEDULE_SCHEMA,
    },
    extra=vol.PREVENT_EXTRA,
)

DELETE_TASK_SCHEMA = vol.Schema(
    {vol.Required("task_id"): cv.string},
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

ADD_REWARD_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Required("points_required"): vol.All(vol.Coerce(int), vol.Range(min=0)),
        vol.Optional("description"): cv.string,
        vol.Optional("icon"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

DELETE_REWARD_SCHEMA = vol.Schema(
    {vol.Required("reward_id"): cv.string},
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

DELETE_LIST_SCHEMA = vol.Schema(
    {vol.Required("list_id"): cv.string},
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

DELETE_MEAL_RECIPE_SCHEMA = vol.Schema(
    {vol.Required("recipe_id"): cv.string},
    extra=vol.PREVENT_EXTRA,
)

ADD_MEAL_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Required("meal_date"): cv.string,
        vol.Optional("meal_type", default="Dinner"): cv.string,
        vol.Optional("recipe_url"): cv.string,
        vol.Optional("ingredients"): vol.Any(cv.string, list),
        vol.Optional("meal_recipe_id"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

UPDATE_MEAL_SCHEMA = vol.Schema(
    {
        vol.Required("meal_id"): cv.string,
        vol.Optional("name"): cv.string,
        vol.Optional("meal_date"): cv.string,
        vol.Optional("meal_type"): cv.string,
        vol.Optional("recipe_url"): cv.string,
        vol.Optional("ingredients"): vol.Any(cv.string, list),
        vol.Optional("meal_recipe_id"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

DELETE_MEAL_SCHEMA = vol.Schema(
    {vol.Required("meal_id"): cv.string},
    extra=vol.PREVENT_EXTRA,
)

ADD_FAMILY_MEMBER_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Required("color"): cv.string,
        vol.Optional("initial"): cv.string,
        vol.Optional("avatar_url"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)

UPDATE_FAMILY_MEMBER_SCHEMA = vol.Schema(
    {
        vol.Required("member_id"): cv.string,
        vol.Optional("name"): cv.string,
        vol.Optional("color"): cv.string,
        vol.Optional("initial"): cv.string,
        vol.Optional("avatar_url"): cv.string,
        vol.Optional("sort_order"): vol.Coerce(int),
    },
    extra=vol.PREVENT_EXTRA,
)

DELETE_FAMILY_MEMBER_SCHEMA = vol.Schema(
    {vol.Required("member_id"): cv.string},
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

TOGGLE_LIST_ITEM_SCHEMA = vol.Schema(
    {vol.Required("item_id"): cv.string},
    extra=vol.PREVENT_EXTRA,
)

DELETE_LIST_ITEM_SCHEMA = vol.Schema(
    {vol.Required("item_id"): cv.string},
    extra=vol.PREVENT_EXTRA,
)

SEND_NOTIFICATION_SCHEMA = vol.Schema(
    {
        vol.Required("message"): cv.string,
        vol.Optional("title"): cv.string,
    },
    extra=vol.PREVENT_EXTRA,
)


def _get_db(hass: HomeAssistant):
    if DOMAIN not in hass.data:
        return None
    return hass.data[DOMAIN].get("db")


def _schedule_payload(data: dict[str, Any]) -> dict[str, Any] | None:
    payload: dict[str, Any] = {}
    for key in (
        "weekdays",
        "custom_schedule",
        "custom_monthday",
        "custom_month",
        "custom_weekday",
        "custom_week_of_month",
    ):
        if key in data and data[key] is not None:
            payload[key] = data[key]
    return payload or None


def _encode_sync_targets(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return json.dumps([str(v) for v in value])
    text = str(value).strip()
    if not text:
        return json.dumps([])
    if text.startswith("["):
        return text
    return json.dumps([part.strip() for part in text.split(",") if part.strip()])


def _request_calendar_sync(hass: HomeAssistant) -> None:
    sync = hass.data.get(DOMAIN, {}).get("sync")
    if sync:
        sync.request_sync()


def _normalize_ingredients(value: Any) -> list | str | None:
    if value is None:
        return None
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else value
        except json.JSONDecodeError:
            return value
    return value


async def _run_db(hass: HomeAssistant, fn: Callable, *args: Any, **kwargs: Any) -> Any:
    db = _get_db(hass)
    if not db:
        _LOGGER.warning("Database not ready")
        return None
    try:
        if kwargs:
            result = await hass.async_add_executor_job(partial(fn, *args, **kwargs))
        else:
            result = await hass.async_add_executor_job(fn, *args)
        hass.bus.async_fire(EVENT_UPDATED)
        return result
    except Exception:
        _LOGGER.exception("Skydark service failed")
        return None


async def async_setup_services(hass: HomeAssistant) -> None:
    """Register Skydark Calendar services."""

    async def add_event(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        event_id = await _run_db(
            hass,
            db.add_event,
            title=call.data["title"],
            start_time=call.data["start_time"],
            end_time=call.data.get("end_time"),
            all_day=call.data.get("all_day", False),
            calendar_id=call.data.get("calendar_id"),
            description=call.data.get("description"),
            location=call.data.get("location"),
            color=call.data.get("color"),
            sync_push_targets=_encode_sync_targets(call.data.get("sync_push_targets")),
        )
        if event_id:
            hass.bus.async_fire(
                "skydark_calendar_event_created",
                {"event_id": event_id, "title": call.data["title"]},
            )
            _request_calendar_sync(hass)

    async def update_event(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        fields = {
            k: call.data[k]
            for k in (
                "title",
                "start_time",
                "end_time",
                "all_day",
                "calendar_id",
                "description",
                "location",
                "color",
            )
            if k in call.data
        }
        if "sync_push_targets" in call.data:
            fields["sync_push_targets"] = _encode_sync_targets(call.data.get("sync_push_targets"))
        await _run_db(hass, partial(db.update_event, call.data["event_id"], **fields))
        _request_calendar_sync(hass)

    async def delete_event(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        event_id = call.data["event_id"]
        sync = hass.data.get(DOMAIN, {}).get("sync")
        if sync:
            await sync.async_handle_local_delete(event_id)
        await _run_db(hass, db.delete_event, event_id)

    async def sync_calendars(call: ServiceCall) -> None:
        sync = hass.data.get(DOMAIN, {}).get("sync")
        if not sync:
            return
        entity_id = call.data.get("entity_id")
        import_all = bool(call.data.get("import_existing", False))
        await sync.async_sync_all(import_all=import_all, only_entity_id=entity_id)

    async def complete_task(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        parsed_date = None
        completed_date_str = call.data.get("completed_date")
        if completed_date_str:
            try:
                parsed_date = datetime.fromisoformat(completed_date_str.replace("Z", "+00:00"))
            except ValueError:
                _LOGGER.warning(
                    "Invalid completed_date '%s', using current time",
                    completed_date_str,
                )
        await _run_db(
            hass,
            db.complete_task_and_award_points,
            call.data["task_id"],
            parsed_date,
            call.data.get("points", 0),
        )

    async def uncomplete_task(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.uncomplete_task_and_revoke_points, call.data["task_id"])

    async def add_task(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_task,
            title=call.data["title"],
            assignee_id=call.data["assignee_id"],
            category=call.data.get("category"),
            frequency=call.data.get("frequency", "daily"),
            icon=call.data.get("icon"),
            points=call.data.get("points", 0),
            due_date=call.data.get("due_date"),
            custom_schedule=_schedule_payload(call.data),
        )

    async def update_task(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        kwargs: dict[str, Any] = {}
        for key in ("title", "assignee_id", "category", "frequency", "icon", "points", "due_date"):
            if key in call.data:
                kwargs[key] = call.data[key]
        schedule = _schedule_payload(call.data)
        if schedule is not None:
            kwargs["custom_schedule"] = schedule
        await _run_db(hass, partial(db.update_task, call.data["task_id"], **kwargs))

    async def delete_task(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_task, call.data["task_id"])

    async def add_points(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_points,
            member_id=call.data["member_id"],
            points=call.data["points"],
            reason=call.data["reason"],
            task_id=call.data.get("task_id"),
        )

    async def redeem_reward(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        ok = await _run_db(
            hass,
            db.redeem_reward,
            call.data["member_id"],
            call.data["reward_id"],
        )
        if ok is False:
            _LOGGER.warning("redeem_reward: insufficient points or invalid reward")

    async def add_reward(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_reward,
            call.data["name"],
            call.data["points_required"],
            call.data.get("description"),
            call.data.get("icon"),
        )

    async def delete_reward(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_reward, call.data["reward_id"])

    async def create_list(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_list,
            name=call.data["name"],
            color=call.data.get("color"),
            owner_id=call.data.get("owner_id"),
            list_type=call.data.get("list_type", "general"),
        )

    async def delete_list(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_list, call.data["list_id"])

    async def add_meal_recipe(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_meal_recipe,
            name=call.data["name"],
            ingredients=call.data.get("ingredients", []),
        )

    async def delete_meal_recipe(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_meal_recipe, call.data["recipe_id"])

    async def add_meal(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_meal,
            name=call.data["name"],
            meal_date=call.data["meal_date"],
            meal_type=call.data.get("meal_type", "Dinner"),
            recipe_url=call.data.get("recipe_url"),
            ingredients=_normalize_ingredients(call.data.get("ingredients")),
            meal_recipe_id=call.data.get("meal_recipe_id"),
        )

    async def update_meal(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        kwargs: dict[str, Any] = {}
        for key in ("name", "meal_date", "meal_type", "recipe_url", "meal_recipe_id"):
            if key in call.data:
                kwargs[key] = call.data[key]
        if "ingredients" in call.data:
            kwargs["ingredients"] = _normalize_ingredients(call.data["ingredients"])
        await _run_db(hass, partial(db.update_meal, call.data["meal_id"], **kwargs))

    async def delete_meal(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_meal, call.data["meal_id"])

    async def add_family_member(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(
            hass,
            db.add_family_member,
            name=call.data["name"],
            color=call.data["color"],
            initial=call.data.get("initial"),
            avatar_url=call.data.get("avatar_url"),
        )

    async def update_family_member(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        kwargs: dict[str, Any] = {}
        for key in ("name", "color", "initial", "avatar_url", "sort_order"):
            if key in call.data:
                kwargs[key] = call.data[key]
        await _run_db(hass, partial(db.update_family_member, call.data["member_id"], **kwargs))

    async def delete_family_member(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_family_member, call.data["member_id"])

    async def upload_photo(call: ServiceCall) -> None:
        db = _get_db(hass)
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
        except (ValueError, OSError) as err:
            _LOGGER.warning("upload_photo: invalid file_path '%s': %s", file_path, err)
            return

        await _run_db(
            hass,
            db.add_photo,
            file_path=file_path,
            caption=call.data.get("caption"),
            uploaded_by=call.data.get("uploaded_by"),
        )

    async def add_list_item(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.add_list_item, call.data["list_id"], call.data["content"])

    async def toggle_list_item(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.toggle_list_item, call.data["item_id"])

    async def delete_list_item(call: ServiceCall) -> None:
        db = _get_db(hass)
        if not db:
            return
        await _run_db(hass, db.delete_list_item, call.data["item_id"])

    async def send_notification(call: ServiceCall) -> None:
        title = call.data.get("title", "Skydark")
        message = call.data.get("message", "")
        try:
            await hass.services.async_call(
                "persistent_notification",
                "create",
                {"title": title, "message": message},
                blocking=True,
            )
        except Exception:
            _LOGGER.exception("send_notification failed")

    registrations = (
        (SERVICE_ADD_EVENT, add_event, ADD_EVENT_SCHEMA),
        (SERVICE_UPDATE_EVENT, update_event, UPDATE_EVENT_SCHEMA),
        (SERVICE_DELETE_EVENT, delete_event, DELETE_ID_SCHEMA),
        (SERVICE_COMPLETE_TASK, complete_task, COMPLETE_TASK_SCHEMA),
        (SERVICE_UNCOMPLETE_TASK, uncomplete_task, UNCOMPLETE_TASK_SCHEMA),
        (SERVICE_ADD_TASK, add_task, ADD_TASK_SCHEMA),
        (SERVICE_UPDATE_TASK, update_task, UPDATE_TASK_SCHEMA),
        (SERVICE_DELETE_TASK, delete_task, DELETE_TASK_SCHEMA),
        (SERVICE_ADD_POINTS, add_points, ADD_POINTS_SCHEMA),
        (SERVICE_REDEEM_REWARD, redeem_reward, REDEEM_REWARD_SCHEMA),
        (SERVICE_ADD_REWARD, add_reward, ADD_REWARD_SCHEMA),
        (SERVICE_DELETE_REWARD, delete_reward, DELETE_REWARD_SCHEMA),
        (SERVICE_ADD_LIST_ITEM, add_list_item, ADD_LIST_ITEM_SCHEMA),
        (SERVICE_TOGGLE_LIST_ITEM, toggle_list_item, TOGGLE_LIST_ITEM_SCHEMA),
        (SERVICE_DELETE_LIST_ITEM, delete_list_item, DELETE_LIST_ITEM_SCHEMA),
        (SERVICE_CREATE_LIST, create_list, CREATE_LIST_SCHEMA),
        (SERVICE_DELETE_LIST, delete_list, DELETE_LIST_SCHEMA),
        (SERVICE_ADD_MEAL, add_meal, ADD_MEAL_SCHEMA),
        (SERVICE_UPDATE_MEAL, update_meal, UPDATE_MEAL_SCHEMA),
        (SERVICE_DELETE_MEAL, delete_meal, DELETE_MEAL_SCHEMA),
        (SERVICE_ADD_MEAL_RECIPE, add_meal_recipe, ADD_MEAL_RECIPE_SCHEMA),
        (SERVICE_DELETE_MEAL_RECIPE, delete_meal_recipe, DELETE_MEAL_RECIPE_SCHEMA),
        (SERVICE_ADD_FAMILY_MEMBER, add_family_member, ADD_FAMILY_MEMBER_SCHEMA),
        (SERVICE_UPDATE_FAMILY_MEMBER, update_family_member, UPDATE_FAMILY_MEMBER_SCHEMA),
        (SERVICE_DELETE_FAMILY_MEMBER, delete_family_member, DELETE_FAMILY_MEMBER_SCHEMA),
        (SERVICE_UPLOAD_PHOTO, upload_photo, UPLOAD_PHOTO_SCHEMA),
        (SERVICE_SEND_NOTIFICATION, send_notification, SEND_NOTIFICATION_SCHEMA),
        (SERVICE_SYNC_CALENDARS, sync_calendars, vol.Schema({
            vol.Optional("entity_id"): cv.string,
            vol.Optional("import_existing", default=False): cv.boolean,
        }, extra=vol.PREVENT_EXTRA)),
    )
    for name, handler, schema in registrations:
        hass.services.async_register(DOMAIN, name, handler, schema=schema)
