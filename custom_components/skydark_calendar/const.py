"""Constants for Skydark Family Calendar integration."""

DOMAIN = "skydark_calendar"

# Panel
PANEL_URL = "/skydark"
PANEL_TITLE = "Skydark Calendar"
PANEL_ICON = "mdi:calendar-month"

# Config keys
CONF_FAMILY_NAME = "family_name"
CONF_WEATHER_ENTITY = "weather_entity"

# Defaults
DEFAULT_FAMILY_NAME = "My Family"

# Database
DB_NAME = "skydark_calendar.db"

# Photos: stored in Media > My Media > Calendar Images
CALENDAR_IMAGES_DIR = "Calendar Images"
MEDIA_SOURCE_PREFIX = "media-source://media_source/local"

# Sync intervals (seconds)
GOOGLE_SYNC_INTERVAL = 900  # 15 minutes
MICROSOFT_SYNC_INTERVAL = 900  # 15 minutes
