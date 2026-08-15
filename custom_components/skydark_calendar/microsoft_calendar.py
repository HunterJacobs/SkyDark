"""Microsoft / Outlook Calendar: use Home Assistant's official calendar integrations.

SkyDark syncs through HA `calendar.*` entities rather than Microsoft Graph OAuth.
"""

from __future__ import annotations

from .calendar_sync import SkydarkCalendarSync, list_ha_calendars

__all__ = ["SkydarkCalendarSync", "list_ha_calendars"]
