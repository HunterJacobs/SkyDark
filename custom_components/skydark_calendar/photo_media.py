"""Store Skydark photos in Home Assistant's local media folder.

Photos are written to ``<media>/Calendar Images`` so they also show up under
Media > My Media, and are referenced in the database by their
``/media/local/...`` URL. Everything here is blocking file I/O and must run in
the executor.
"""

from __future__ import annotations

import base64
import binascii
import re
import shutil
import uuid
from pathlib import Path
from urllib.parse import quote, unquote

from homeassistant.core import HomeAssistant

CALENDAR_MEDIA_FOLDER = "Calendar Images"
MEDIA_URL_PREFIX = f"/media/local/{quote(CALENDAR_MEDIA_FOLDER)}/"

# Decoded size limit. The browser downsizes photos before upload, so this only
# guards against oversized or malicious payloads.
MAX_PHOTO_BYTES = 8 * 1024 * 1024

_DATA_URL_RE = re.compile(
    r"^data:(?P<mime>image/[a-zA-Z0-9.+-]+);base64,(?P<data>[A-Za-z0-9+/=\s]+)$"
)

# Raster formats only: SVG is deliberately excluded because it can carry script.
_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}
_ALLOWED_EXTS = frozenset({".jpg", ".jpeg", ".png", ".gif", ".webp"})


class PhotoError(ValueError):
    """Raised when a photo cannot be accepted."""


def _sniff_ext(raw: bytes) -> str | None:
    """Return the extension matching the file's magic bytes, if it's a supported image."""
    if raw.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return ".gif"
    if raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return ".webp"
    return None


def get_calendar_media_dir(hass: HomeAssistant) -> Path:
    """Return the folder photos are stored in (inside the `local` media source)."""
    media_dirs = getattr(hass.config, "media_dirs", None) or {}
    root = media_dirs.get("local") or hass.config.path("media")
    return (Path(root) / CALENDAR_MEDIA_FOLDER).resolve()


def _write_photo(hass: HomeAssistant, raw: bytes) -> str:
    if not raw:
        raise PhotoError("The photo is empty.")
    if len(raw) > MAX_PHOTO_BYTES:
        raise PhotoError("The photo is too large (8 MB maximum).")
    ext = _sniff_ext(raw)
    if ext is None:
        raise PhotoError("Unsupported image type. Use JPEG, PNG, GIF or WebP.")
    media_dir = get_calendar_media_dir(hass)
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (media_dir / filename).write_bytes(raw)
    return MEDIA_URL_PREFIX + quote(filename)


def save_data_url(hass: HomeAssistant, data_url: str) -> str:
    """Decode a base64 image data URL into media storage; return its media URL."""
    match = _DATA_URL_RE.match(data_url.strip())
    if not match or match.group("mime").lower() not in _MIME_TO_EXT:
        raise PhotoError("Unsupported image payload. Expected a JPEG, PNG, GIF or WebP data URL.")
    encoded = re.sub(r"\s+", "", match.group("data"))
    if len(encoded) * 3 // 4 > MAX_PHOTO_BYTES:
        raise PhotoError("The photo is too large (8 MB maximum).")
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, binascii.Error) as err:
        raise PhotoError("The photo data is corrupted.") from err
    return _write_photo(hass, raw)


def copy_file(hass: HomeAssistant, source: Path) -> str:
    """Copy an image file into media storage; return its media URL."""
    if source.suffix.lower() not in _ALLOWED_EXTS:
        raise PhotoError("Unsupported image type. Use JPEG, PNG, GIF or WebP.")
    if source.stat().st_size > MAX_PHOTO_BYTES:
        raise PhotoError("The photo is too large (8 MB maximum).")
    with source.open("rb") as handle:
        head = handle.read(16)
    if _sniff_ext(head) is None:
        raise PhotoError("The file is not a supported image.")
    media_dir = get_calendar_media_dir(hass)
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{source.suffix.lower()}"
    shutil.copyfile(source, media_dir / filename)
    return MEDIA_URL_PREFIX + quote(filename)


def managed_file(hass: HomeAssistant, media_url: str) -> Path | None:
    """Return the on-disk file for a media URL we created, or None if it isn't ours."""
    if not media_url or not media_url.startswith(MEDIA_URL_PREFIX):
        return None
    filename = unquote(media_url[len(MEDIA_URL_PREFIX):])
    if not filename or "/" in filename or "\\" in filename or filename.startswith("."):
        return None
    media_dir = get_calendar_media_dir(hass)
    candidate = (media_dir / filename).resolve()
    return candidate if candidate.parent == media_dir else None


def delete_file(hass: HomeAssistant, media_url: str) -> None:
    """Delete a photo file we manage. Unknown or foreign paths are ignored."""
    path = managed_file(hass, media_url)
    if path is not None:
        path.unlink(missing_ok=True)
