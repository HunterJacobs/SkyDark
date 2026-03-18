"""Helpers for storing Skydark photos in Home Assistant media."""

from __future__ import annotations

import base64
import binascii
import re
import shutil
import uuid
from pathlib import Path
from typing import Iterable
from urllib.parse import quote, unquote, urlparse

from homeassistant.core import HomeAssistant

CALENDAR_MEDIA_FOLDER = "Calendar Images"
_MEDIA_URL_PREFIX = f"/media/local/{quote(CALENDAR_MEDIA_FOLDER)}"
_DATA_URL_RE = re.compile(
    r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>.+)$", re.DOTALL
)
_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
}


def get_calendar_media_dir(hass: HomeAssistant) -> Path:
    """Return preferred media folder for calendar photos.

    Prefer the configured `local` media directory when available so the folder
    appears in Media > My Media reliably across HA installations.
    """
    media_dirs = getattr(hass.config, "media_dirs", None) or {}
    preferred_root = media_dirs.get("local")
    if preferred_root:
        return (Path(preferred_root) / CALENDAR_MEDIA_FOLDER).resolve()
    return Path(hass.config.path("media", CALENDAR_MEDIA_FOLDER)).resolve()


def ensure_calendar_media_dir(hass: HomeAssistant) -> Path:
    """Create and return the calendar media folder.

    Also ensure the folder exists in any configured media roots so it is
    discoverable in HA's media browser regardless of media_dir setup.
    """
    preferred_dir = get_calendar_media_dir(hass)
    preferred_dir.mkdir(parents=True, exist_ok=True)

    for media_root in _iter_media_roots(hass):
        candidate = (media_root / CALENDAR_MEDIA_FOLDER).resolve()
        candidate.mkdir(parents=True, exist_ok=True)

    return preferred_dir


def save_data_url_to_media(
    hass: HomeAssistant, data_url: str, filename_hint: str | None = None
) -> str:
    """Decode a base64 data URL into media storage and return media URL."""
    match = _DATA_URL_RE.match(data_url)
    if not match:
        raise ValueError("Unsupported image payload. Expected data URL.")

    mime_type = match.group("mime").lower()
    encoded = match.group("data")
    try:
        raw_bytes = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as err:
        raise ValueError("Invalid base64 image payload.") from err

    suffix = _extension_for(mime_type, filename_hint)
    filename = f"{uuid.uuid4().hex}{suffix}"
    media_dir = ensure_calendar_media_dir(hass)
    file_path = media_dir / filename
    file_path.write_bytes(raw_bytes)
    return _to_media_url(filename)


def copy_file_to_media(
    hass: HomeAssistant, source_path: Path, filename_hint: str | None = None
) -> str:
    """Copy a source image file into media storage and return media URL."""
    suffix = source_path.suffix or _extension_for(None, filename_hint)
    filename = f"{uuid.uuid4().hex}{suffix.lower()}"
    media_dir = ensure_calendar_media_dir(hass)
    destination = media_dir / filename
    shutil.copy2(source_path, destination)
    return _to_media_url(filename)


def delete_managed_media_file(hass: HomeAssistant, file_path_or_url: str) -> None:
    """Delete image file if it belongs to the managed Calendar Images folder."""
    media_dir = get_calendar_media_dir(hass)

    candidate: Path | None = None
    raw = file_path_or_url.strip()

    if raw.startswith(_MEDIA_URL_PREFIX):
        filename = unquote(raw[len(_MEDIA_URL_PREFIX) + 1 :])
        candidate = (media_dir / filename).resolve()
    elif raw.startswith("/media/local/"):
        # Accept unescaped path style too for backwards compatibility.
        parsed = urlparse(raw)
        local_path = unquote(parsed.path)
        prefix = f"/media/local/{CALENDAR_MEDIA_FOLDER}/"
        if local_path.startswith(prefix):
            filename = local_path[len(prefix) :]
            candidate = (media_dir / filename).resolve()
    else:
        candidate = Path(raw).resolve()

    if candidate and candidate.is_relative_to(media_dir) and candidate.is_file():
        candidate.unlink(missing_ok=True)


def _to_media_url(filename: str) -> str:
    """Create a Home Assistant media URL for a file in Calendar Images."""
    return f"{_MEDIA_URL_PREFIX}/{quote(filename)}"


def _extension_for(mime_type: str | None, filename_hint: str | None) -> str:
    """Pick file extension from mime type or filename hint."""
    if filename_hint:
        suffix = Path(filename_hint).suffix
        if suffix:
            return suffix.lower()
    if mime_type:
        return _MIME_TO_EXT.get(mime_type, ".bin")
    return ".bin"


def _iter_media_roots(hass: HomeAssistant) -> Iterable[Path]:
    """Yield configured media roots plus /config/media fallback."""
    yielded: set[Path] = set()
    media_dirs = getattr(hass.config, "media_dirs", None) or {}
    for root in media_dirs.values():
        path = Path(root).resolve()
        if path in yielded:
            continue
        yielded.add(path)
        yield path

    fallback = Path(hass.config.path("media")).resolve()
    if fallback not in yielded:
        yield fallback
