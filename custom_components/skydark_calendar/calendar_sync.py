"""Two-way sync between SkyDark events and Home Assistant calendar entities.

Users connect Google, Outlook, CalDAV, or Local Calendar through official HA
integrations. SkyDark then pulls and/or pushes events per calendar.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import re
from datetime import datetime, timedelta, timezone
from functools import partial
from typing import Any

from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.event import async_call_later, async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import CALENDAR_SYNC_INTERVAL, DOMAIN, SYNC_MARKER_PREFIX

_LOGGER = logging.getLogger(__name__)

_MARKER_RE = re.compile(r"\[skydark:([0-9a-fA-F-]{36})\]")
_CREATE_FEATURE = 1
_DELETE_FEATURE = 2


def event_marker(event_id: str) -> str:
    return f"{SYNC_MARKER_PREFIX}{event_id}]"


def strip_marker(text: str | None) -> str:
    if not text:
        return ""
    cleaned = _MARKER_RE.sub("", text)
    return cleaned.strip()


def extract_marker_id(text: str | None) -> str | None:
    if not text:
        return None
    match = _MARKER_RE.search(text)
    return match.group(1) if match else None


def description_with_marker(text: str | None, event_id: str) -> str:
    body = strip_marker(text)
    marker = event_marker(event_id)
    if not body:
        return marker
    return f"{body}\n\n{marker}"


def event_content_hash(
    title: str,
    start: str,
    end: str | None,
    all_day: bool,
    description: str | None,
    location: str | None,
) -> str:
    payload = "|".join(
        [
            (title or "").strip(),
            start or "",
            end or "",
            "1" if all_day else "0",
            strip_marker(description),
            (location or "").strip(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]


def parse_sync_targets(raw: str | None) -> list[str] | None:
    """None means default (all push-enabled). Empty list means push nowhere."""
    if raw is None or raw == "":
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(x) for x in parsed]
    except json.JSONDecodeError:
        pass
    return [part.strip() for part in raw.split(",") if part.strip()]


def remote_uid_of(remote: dict[str, Any]) -> str:
    uid = str(remote.get("uid") or "").strip()
    rec = str(remote.get("recurrence_id") or "").strip()
    if uid:
        return f"{uid}::{rec}" if rec else uid
    start = _stringify_ha_time(remote.get("start"))
    end = _stringify_ha_time(remote.get("end"))
    summary = (remote.get("summary") or remote.get("title") or "").strip()
    return f"fallback::{summary}::{start}::{end}"


def _parse_stored_datetime(value: Any) -> datetime:
    text = str(value).replace("Z", "+00:00")
    parsed = dt_util.parse_datetime(text)
    if parsed is None:
        parsed = datetime.fromisoformat(text)
    if parsed.tzinfo is None:
        parsed = dt_util.as_local(parsed)
    return dt_util.as_utc(parsed)


def _stringify_ha_time(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        value = value.get("dateTime") or value.get("date") or value.get("date_time") or ""
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return str(value)


def _ha_dt_parts(value: Any) -> tuple[datetime, bool]:
    """Return (datetime, is_all_day)."""
    raw = value
    if isinstance(value, dict):
        raw = value.get("dateTime") or value.get("date") or value.get("date_time")
    if isinstance(raw, datetime):
        dt = raw if raw.tzinfo else dt_util.as_local(raw.replace(tzinfo=timezone.utc))
        return dt_util.as_utc(dt), False
    text = str(raw or "").strip()
    if len(text) == 10 and text[4] == "-" and text[7] == "-":
        day = datetime.fromisoformat(text).date()
        return datetime(day.year, day.month, day.day, tzinfo=timezone.utc), True
    parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = dt_util.as_local(parsed)
    return dt_util.as_utc(parsed), False


def remote_to_skydark_fields(remote: dict[str, Any]) -> dict[str, Any]:
    start, start_all_day = _ha_dt_parts(remote.get("start"))
    end_raw = remote.get("end")
    if end_raw:
        end, end_all_day = _ha_dt_parts(end_raw)
    else:
        end, end_all_day = start + timedelta(hours=1), start_all_day
    all_day = start_all_day or end_all_day
    if all_day and end.date() > start.date() and end.hour == 0 and end.minute == 0:
        end = end - timedelta(seconds=1)
    return {
        "title": (remote.get("summary") or remote.get("title") or "Untitled").strip(),
        "description": strip_marker(remote.get("description")),
        "location": (remote.get("location") or "").strip() or None,
        "start_time": start,
        "end_time": end,
        "all_day": all_day,
    }


def _calendar_features() -> tuple[int, int]:
    try:
        from homeassistant.components.calendar import CalendarEntityFeature

        return int(CalendarEntityFeature.CREATE_EVENT), int(CalendarEntityFeature.DELETE_EVENT)
    except Exception:
        return _CREATE_FEATURE, _DELETE_FEATURE


def list_ha_calendars(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Return HA calendar entities excluding SkyDark's own calendar."""
    create_bit, delete_bit = _calendar_features()
    registry = er.async_get(hass)
    out: list[dict[str, Any]] = []
    for state in hass.states.async_all("calendar"):
        ent = registry.async_get(state.entity_id)
        if ent and ent.platform == DOMAIN:
            continue
        features = state.attributes.get("supported_features") or 0
        try:
            features = int(features)
        except (TypeError, ValueError):
            features = 0
        out.append(
            {
                "entity_id": state.entity_id,
                "name": state.attributes.get("friendly_name") or state.entity_id,
                "can_create": bool(features & create_bit) if features else True,
                "can_delete": bool(features & delete_bit) if features else True,
                "features_known": bool(features),
            }
        )
    out.sort(key=lambda item: str(item["name"]).lower())
    return out


class SkydarkCalendarSync:
    """Coordinates pull/push between SQLite and HA calendar entities."""

    def __init__(self, hass: HomeAssistant, db: Any) -> None:
        self.hass = hass
        self.db = db
        self._lock = asyncio.Lock()
        self._applying = False
        self._unsub_interval = None
        self._debounce_unsub = None
        self.last_run: str | None = None

    def start(self) -> None:
        self._unsub_interval = async_track_time_interval(
            self.hass, self._interval_tick, timedelta(seconds=CALENDAR_SYNC_INTERVAL)
        )

    def stop(self) -> None:
        if self._unsub_interval:
            self._unsub_interval()
            self._unsub_interval = None
        if self._debounce_unsub:
            self._debounce_unsub()
            self._debounce_unsub = None

    @callback
    def _interval_tick(self, _now: datetime) -> None:
        self.hass.async_create_task(self.async_sync_all())

    def request_sync(self, delay: float = 2.0) -> None:
        if self._applying:
            return

        def _run(_now: datetime) -> None:
            self._debounce_unsub = None
            self.hass.async_create_task(self.async_sync_all())

        if self._debounce_unsub:
            self._debounce_unsub()
        self._debounce_unsub = async_call_later(self.hass, delay, _run)

    async def apply_config_links(
        self,
        pull_ids: list[str],
        push_ids: list[str],
        import_existing: bool,
    ) -> None:
        calendars = {item["entity_id"]: item for item in list_ha_calendars(self.hass)}
        pull_ids = [eid for eid in pull_ids if eid in calendars]
        push_ids = [eid for eid in push_ids if eid in calendars]
        entity_ids = sorted(set(pull_ids) | set(push_ids))
        for entity_id in entity_ids:
            info = calendars.get(entity_id) or {"name": entity_id}
            await self.hass.async_add_executor_job(
                partial(
                    self.db.upsert_sync_link,
                    entity_id=entity_id,
                    name=info.get("name") or entity_id,
                    pull_enabled=entity_id in pull_ids,
                    push_enabled=entity_id in push_ids,
                    import_existing=import_existing if entity_id in pull_ids else False,
                )
            )
        if entity_ids:
            await self.async_sync_all(import_all=import_existing)

    async def async_sync_all(self, *, import_all: bool = False, only_entity_id: str | None = None) -> dict[str, Any]:
        async with self._lock:
            self._applying = True
            summary: dict[str, Any] = {"ok": True, "links": []}
            try:
                links = await self.hass.async_add_executor_job(self.db.get_sync_links)
                if only_entity_id:
                    links = [link for link in links if link["entity_id"] == only_entity_id]
                for link in links:
                    item = await self._sync_link(link, import_all=import_all or bool(link.get("import_existing")))
                    summary["links"].append(item)
                    if item.get("error"):
                        summary["ok"] = False
                self.last_run = dt_util.utcnow().isoformat()
                return summary
            finally:
                self._applying = False

    async def async_handle_local_delete(self, event_id: str) -> None:
        maps = await self.hass.async_add_executor_job(self.db.get_sync_maps_for_event, event_id)
        links = {link["id"]: link for link in await self.hass.async_add_executor_job(self.db.get_sync_links)}
        for mapped in maps:
            link = links.get(mapped["link_id"])
            if not link:
                continue
            if link.get("push_enabled"):
                await self._delete_remote(link["entity_id"], mapped["remote_uid"])
            else:
                await self.hass.async_add_executor_job(
                    self.db.add_tombstone, mapped["link_id"], mapped["remote_uid"]
                )

    async def _sync_link(self, link: dict[str, Any], *, import_all: bool) -> dict[str, Any]:
        entity_id = link["entity_id"]
        result: dict[str, Any] = {"entity_id": entity_id, "pulled": 0, "pushed": 0, "error": None}
        try:
            if link.get("pull_enabled"):
                result["pulled"] = await self._pull_link(link, import_all=import_all)
            if link.get("push_enabled"):
                result["pushed"] = await self._push_link(link)
            if import_all and link.get("import_existing"):
                await self.hass.async_add_executor_job(
                    partial(self.db.upsert_sync_link, entity_id=entity_id, import_existing=False)
                )
            await self.hass.async_add_executor_job(self.db.set_sync_link_status, link["id"], None)
        except Exception as err:
            _LOGGER.exception("Calendar sync failed for %s", entity_id)
            result["error"] = str(err)
            await self.hass.async_add_executor_job(self.db.set_sync_link_status, link["id"], str(err)[:400])
        return result

    def _window(self, import_all: bool) -> tuple[datetime, datetime]:
        now = dt_util.utcnow()
        if import_all:
            return now - timedelta(days=730), now + timedelta(days=730)
        return now - timedelta(days=60), now + timedelta(days=400)

    async def _fetch_remote_events(self, entity_id: str, start: datetime, end: datetime) -> list[dict[str, Any]]:
        if not self.hass.services.has_service("calendar", "get_events"):
            raise RuntimeError("calendar.get_events is not available")
        try:
            response = await self.hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "start_date_time": dt_util.as_local(start).strftime("%Y-%m-%d %H:%M:%S"),
                    "end_date_time": dt_util.as_local(end).strftime("%Y-%m-%d %H:%M:%S"),
                },
                target={"entity_id": entity_id},
                blocking=True,
                return_response=True,
            )
        except Exception:
            response = await self.hass.services.async_call(
                "calendar",
                "get_events",
                {
                    "entity_id": entity_id,
                    "start_date_time": dt_util.as_local(start).strftime("%Y-%m-%d %H:%M:%S"),
                    "end_date_time": dt_util.as_local(end).strftime("%Y-%m-%d %H:%M:%S"),
                },
                blocking=True,
                return_response=True,
            )
        if not response:
            return []
        block = response.get(entity_id) or next(iter(response.values()), {})
        events = block.get("events") if isinstance(block, dict) else None
        return list(events or [])

    async def _pull_link(self, link: dict[str, Any], *, import_all: bool) -> int:
        start, end = self._window(import_all)
        remotes = await self._fetch_remote_events(link["entity_id"], start, end)
        maps = await self.hass.async_add_executor_job(self.db.get_sync_maps, link["id"])
        by_uid = {item["remote_uid"]: item for item in maps}
        by_event = {item["skydark_event_id"]: item for item in maps}
        seen_uids: set[str] = set()
        pulled = 0
        for remote in remotes:
            uid = remote_uid_of(remote)
            seen_uids.add(uid)
            if await self.hass.async_add_executor_job(self.db.is_tombstoned, link["id"], uid):
                continue
            fields = remote_to_skydark_fields(remote)
            remote_hash = event_content_hash(
                fields["title"],
                fields["start_time"].isoformat(),
                fields["end_time"].isoformat() if fields["end_time"] else None,
                fields["all_day"],
                fields["description"],
                fields["location"],
            )
            marker_id = extract_marker_id(remote.get("description"))
            mapped = by_uid.get(uid)
            if not mapped and marker_id:
                mapped = by_event.get(marker_id)
            if mapped:
                local = await self.hass.async_add_executor_job(self.db.get_event, mapped["skydark_event_id"])
                if not local:
                    mapped = None
                else:
                    local_hash = event_content_hash(
                        local.get("title") or "",
                        local.get("start_time") or "",
                        local.get("end_time"),
                        bool(local.get("all_day")),
                        local.get("description"),
                        local.get("location"),
                    )
                    last_hash = mapped.get("last_hash")
                    remote_changed = remote_hash != last_hash
                    local_changed = local_hash != last_hash
                    stored_hash = last_hash
                    if remote_changed and not local_changed:
                        await self.hass.async_add_executor_job(
                            partial(
                                self.db.update_event,
                                mapped["skydark_event_id"],
                                title=fields["title"],
                                description=fields["description"],
                                location=fields["location"],
                                start_time=fields["start_time"],
                                end_time=fields["end_time"],
                                all_day=fields["all_day"],
                                external_id=uid,
                                external_source=link["entity_id"],
                            )
                        )
                        stored_hash = remote_hash
                        pulled += 1
                    elif not remote_changed and not local_changed:
                        stored_hash = local_hash
                    await self.hass.async_add_executor_job(
                        partial(
                            self.db.upsert_sync_map,
                            link["id"],
                            mapped["skydark_event_id"],
                            uid,
                            mapped.get("origin") or "remote",
                            stored_hash,
                        )
                    )
                    continue
            if marker_id:
                existing = await self.hass.async_add_executor_job(self.db.get_event, marker_id)
                if existing:
                    await self.hass.async_add_executor_job(
                        partial(
                            self.db.upsert_sync_map,
                            link["id"],
                            marker_id,
                            uid,
                            "skydark",
                            remote_hash,
                        )
                    )
                    continue
            new_id = await self.hass.async_add_executor_job(
                partial(
                    self.db.add_event,
                    title=fields["title"],
                    start_time=fields["start_time"],
                    end_time=fields["end_time"],
                    all_day=fields["all_day"],
                    description=fields["description"],
                    location=fields["location"],
                    external_id=uid,
                    external_source=link["entity_id"],
                    sync_push_targets=json.dumps([]),
                )
            )
            await self.hass.async_add_executor_job(
                partial(self.db.upsert_sync_map, link["id"], new_id, uid, "remote", remote_hash)
            )
            pulled += 1

        for mapped in maps:
            if mapped["remote_uid"] in seen_uids:
                continue
            if mapped.get("origin") != "remote":
                continue
            await self.hass.async_add_executor_job(self.db.delete_event, mapped["skydark_event_id"])
        return pulled

    def _should_push_event(self, event: dict[str, Any], entity_id: str) -> bool:
        targets = parse_sync_targets(event.get("sync_push_targets"))
        if targets is None:
            return True
        return entity_id in targets

    async def _push_link(self, link: dict[str, Any]) -> int:
        start, end = self._window(False)
        events = await self.hass.async_add_executor_job(self.db.get_events, start, end)
        maps = await self.hass.async_add_executor_job(self.db.get_sync_maps, link["id"])
        by_event = {item["skydark_event_id"]: item for item in maps}
        pushed = 0
        for event in events:
            if not self._should_push_event(event, link["entity_id"]):
                continue
            if (event.get("external_source") or "") == link["entity_id"] and event["id"] not in by_event:
                # Pulled from this calendar; do not clone it back unless user opted in via targets.
                if parse_sync_targets(event.get("sync_push_targets")) is None:
                    continue
            local_hash = event_content_hash(
                event.get("title") or "",
                event.get("start_time") or "",
                event.get("end_time"),
                bool(event.get("all_day")),
                event.get("description"),
                event.get("location"),
            )
            mapped = by_event.get(event["id"])
            if mapped and mapped.get("last_hash") == local_hash:
                continue
            if mapped and mapped.get("remote_uid"):
                await self._delete_remote(link["entity_id"], mapped["remote_uid"])
            uid = await self._create_remote(link["entity_id"], event)
            remote_uid = uid or mapped["remote_uid"] if mapped else f"pending::{event['id']}"
            if uid:
                remote_uid = uid
            await self.hass.async_add_executor_job(
                partial(
                    self.db.upsert_sync_map,
                    link["id"],
                    event["id"],
                    remote_uid,
                    "skydark",
                    local_hash,
                )
            )
            pushed += 1
        return pushed

    async def _create_remote(self, entity_id: str, event: dict[str, Any]) -> str | None:
        if not self.hass.services.has_service("calendar", "create_event"):
            raise RuntimeError("calendar.create_event is not available")
        start = _parse_stored_datetime(event["start_time"])
        end = _parse_stored_datetime(event.get("end_time") or event["start_time"])
        data: dict[str, Any] = {
            "summary": event.get("title") or "Untitled",
            "description": description_with_marker(event.get("description"), event["id"]),
        }
        if event.get("location"):
            data["location"] = event["location"]
        if event.get("all_day"):
            start_d = start.date()
            end_d = end.date()
            if end_d <= start_d:
                end_d = start_d + timedelta(days=1)
            else:
                end_d = end_d + timedelta(days=1)
            data["start_date"] = start_d.isoformat()
            data["end_date"] = end_d.isoformat()
        else:
            data["start_date_time"] = dt_util.as_local(dt_util.as_utc(start)).strftime("%Y-%m-%d %H:%M:%S")
            data["end_date_time"] = dt_util.as_local(dt_util.as_utc(end)).strftime("%Y-%m-%d %H:%M:%S")
        try:
            response = await self.hass.services.async_call(
                "calendar",
                "create_event",
                data,
                target={"entity_id": entity_id},
                blocking=True,
                return_response=True,
            )
        except TypeError:
            await self.hass.services.async_call(
                "calendar",
                "create_event",
                data,
                target={"entity_id": entity_id},
                blocking=True,
            )
            return None
        if not response:
            return None
        block = response.get(entity_id) if isinstance(response, dict) else None
        if isinstance(block, dict):
            uid = block.get("uid") or (block.get("event") or {}).get("uid")
            if uid:
                return str(uid)
        return None

    async def _delete_remote(self, entity_id: str, remote_uid: str) -> None:
        if not remote_uid or remote_uid.startswith("pending::") or remote_uid.startswith("fallback::"):
            return
        if not self.hass.services.has_service("calendar", "delete_event"):
            return
        uid, _, rec = remote_uid.partition("::")
        payload: dict[str, Any] = {"uid": uid}
        if rec:
            payload["recurrence_id"] = rec
        try:
            await self.hass.services.async_call(
                "calendar",
                "delete_event",
                payload,
                target={"entity_id": entity_id},
                blocking=True,
            )
        except Exception:
            _LOGGER.warning("Could not delete remote event %s on %s", remote_uid, entity_id)
