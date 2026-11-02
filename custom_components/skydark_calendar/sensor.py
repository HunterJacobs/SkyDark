"""Sensor platform for Skydark Family Calendar."""

from __future__ import annotations

from datetime import datetime, timedelta
import logging

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import Event, HomeAssistant, callback
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DOMAIN

EVENT_UPDATED = "skydark_calendar_updated"

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Set up Skydark sensors from a config entry."""
    sensors = [
        SkydarkTasksTodaySensor(hass, entry),
        SkydarkCompletedTasksSensor(hass, entry),
        SkydarkUpcomingEventsSensor(hass, entry),
    ]
    async_add_entities(sensors, update_before_add=True)


class SkydarkBaseSensor(SensorEntity):
    """Base class for Skydark sensors."""

    _attr_has_entity_name = True
    _attr_icon = "mdi:calendar"

    def __init__(
        self, hass: HomeAssistant, entry: ConfigEntry, key: str, name: str, icon: str
    ) -> None:
        """Initialize the sensor."""
        self._attr_unique_id = f"{entry.entry_id}_{key}"
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.data.get("family_name", "Skydark Calendar"),
        }
        self._attr_name = name
        self._attr_icon = icon
        self._entry = entry
        self._hass = hass

    async def async_added_to_hass(self) -> None:
        """Refresh as soon as Skydark data changes instead of waiting for the next poll."""
        await super().async_added_to_hass()

        @callback
        def _on_update(_event: Event) -> None:
            self.async_schedule_update_ha_state(True)

        self.async_on_remove(self.hass.bus.async_listen(EVENT_UPDATED, _on_update))


class SkydarkTasksTodaySensor(SkydarkBaseSensor):
    """Sensor for number of tasks due today."""

    _attr_translation_key = "tasks_today"
    _attr_native_unit_of_measurement = "tasks"
    _attr_native_value: int = 0
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the sensor."""
        super().__init__(hass, entry, "tasks_today", "Tasks today", "mdi:checkbox-marked")

    async def async_update(self) -> None:
        """Fetch tasks from database in executor."""
        if DOMAIN not in self._hass.data:
            self._attr_available = False
            return
        db = self._hass.data[DOMAIN].get("db")
        if not db:
            self._attr_available = False
            return
        try:
            today = dt_util.now().date().isoformat()
            tasks = await self._hass.async_add_executor_job(
                lambda: db.get_tasks(due_date=today, include_completed=False)
            )
            self._attr_native_value = len(tasks)
            self._attr_available = True
        except Exception as e:
            _LOGGER.exception("Failed to update tasks_today sensor: %s", e)
            self._attr_available = False


class SkydarkCompletedTasksSensor(SkydarkBaseSensor):
    """Sensor for number of completed tasks today."""

    _attr_translation_key = "completed_tasks"
    _attr_native_unit_of_measurement = "tasks"
    _attr_native_value: int = 0
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the sensor."""
        super().__init__(
            hass, entry, "completed_tasks", "Completed tasks today", "mdi:check-circle"
        )

    async def async_update(self) -> None:
        """Fetch tasks from database in executor."""
        if DOMAIN not in self._hass.data:
            self._attr_available = False
            return
        db = self._hass.data[DOMAIN].get("db")
        if not db:
            self._attr_available = False
            return
        try:
            today = dt_util.now().date().isoformat()
            tasks = await self._hass.async_add_executor_job(
                lambda: db.get_tasks(completed_date=today)
            )
            self._attr_native_value = len(tasks)
            self._attr_available = True
        except Exception as e:
            _LOGGER.exception("Failed to update completed_tasks sensor: %s", e)
            self._attr_available = False


class SkydarkUpcomingEventsSensor(SkydarkBaseSensor):
    """Sensor for next upcoming event."""

    _attr_translation_key = "next_event"
    _attr_native_value: str | None = None

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        """Initialize the sensor."""
        super().__init__(
            hass, entry, "upcoming_events", "Next event", "mdi:calendar-clock"
        )

    async def async_update(self) -> None:
        """Fetch events from database in executor."""
        if DOMAIN not in self._hass.data:
            self._attr_available = False
            return
        db = self._hass.data[DOMAIN].get("db")
        if not db:
            self._attr_available = False
            return
        try:
            now = dt_util.utcnow()
            end = now + timedelta(days=30)
            events = await self._hass.async_add_executor_job(
                lambda: db.get_events(start=now, end=end)
            )
            now_iso = now.isoformat()
            upcoming = [e for e in events if (e.get("start_time") or "") >= now_iso]
            if upcoming:
                upcoming.sort(key=lambda e: e.get("start_time", ""))
                self._attr_native_value = upcoming[0].get("title")
            else:
                self._attr_native_value = None
            self._attr_available = True
        except Exception as e:
            _LOGGER.exception("Failed to update upcoming_events sensor: %s", e)
            self._attr_available = False
