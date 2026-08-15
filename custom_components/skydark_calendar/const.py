"""Constants for Skydark Family Calendar integration."""

DOMAIN = "skydark_calendar"

# Panel
PANEL_URL = "/skydark"
PANEL_TITLE = "Skydark Calendar"
PANEL_ICON = "mdi:calendar-month"

# Config keys
CONF_FAMILY_NAME = "family_name"
CONF_WEATHER_ENTITY = "weather_entity"
CONF_PULL_CALENDARS = "pull_calendars"
CONF_PUSH_CALENDARS = "push_calendars"
CONF_IMPORT_EXISTING = "import_existing"

# Defaults
DEFAULT_FAMILY_NAME = "My Family"

# Database
DB_NAME = "skydark_calendar.db"

# Sync
CALENDAR_SYNC_INTERVAL = 900  # 15 minutes
SYNC_MARKER_PREFIX = "[skydark:"
GOOGLE_SYNC_INTERVAL = CALENDAR_SYNC_INTERVAL
MICROSOFT_SYNC_INTERVAL = CALENDAR_SYNC_INTERVAL
