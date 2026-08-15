"""Google Calendar: use Home Assistant's official Google Calendar integration.

SkyDark syncs through HA `calendar.*` entities rather than a separate OAuth app.
"""

from __future__ import annotations

from .calendar_sync import SkydarkCalendarSync, list_ha_calendars

__all__ = ["SkydarkCalendarSync", "list_ha_calendars"]
