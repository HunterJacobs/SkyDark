"""Photo storage in Home Assistant Media > My Media > Calendar Images."""

from __future__ import annotations

import base64
import re
import uuid
from pathlib import Path

from .const import CALENDAR_IMAGES_DIR, MEDIA_SOURCE_PREFIX

# Data URL pattern: data:[<mediatype>][;base64],<data>
_DATA_URL_RE = re.compile(r"^data:([^;,]+)(;base64)?,(.+)$")

_MIME_TO_EXT = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
}


def _parse_data_url(url: str) -> tuple[bytes, str] | None:
    """Parse data URL and return (raw_bytes, extension)."""
    m = _DATA_URL_RE.match(url.strip())
    if not m:
        return None
    mime = m.group(1).lower().strip()
    is_base64 = m.group(2) == ";base64"
    data = m.group(3)
    ext = _MIME_TO_EXT.get(mime, ".jpg")
    try:
        if is_base64:
            raw = base64.b64decode(data)
        else:
            import urllib.parse
            raw = urllib.parse.unquote_to_bytes(data)
    except Exception:
        return None
    return raw, ext


def ensure_media_dir_exists(config_dir: Path) -> Path:
    """Create media/Calendar Images if it does not exist. Returns the path."""
    media_dir = config_dir / "media" / CALENDAR_IMAGES_DIR
    media_dir.mkdir(parents=True, exist_ok=True)
    return media_dir


def save_photo_to_media(
    config_dir: Path,
    data_url: str,
) -> str | None:
    """
    Save a data URL to media/Calendar Images and return the relative path.
    Returns None on failure.
    """
    parsed = _parse_data_url(data_url)
    if not parsed:
        return None
    raw, ext = parsed
    media_dir = config_dir / "media" / CALENDAR_IMAGES_DIR
    media_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = media_dir / filename
    try:
        file_path.write_bytes(raw)
    except OSError:
        return None
    return f"{CALENDAR_IMAGES_DIR}/{filename}"


def delete_photo_from_media(config_dir: Path, file_path: str) -> bool:
    """
    Delete a photo file from media/Calendar Images.
    file_path can be "Calendar Images/filename.ext" or "media/Calendar Images/filename.ext".
    Returns True if deleted or file did not exist.
    """
    if not file_path or ".." in file_path:
        return False
    path_clean = file_path.replace("\\", "/")
    if CALENDAR_IMAGES_DIR + "/" not in path_clean:
        return True  # Not our file, nothing to delete
    idx = path_clean.find(CALENDAR_IMAGES_DIR + "/")
    rel = path_clean[idx:]
    full_path = config_dir / "media" / rel
    try:
        if full_path.is_file():
            full_path.unlink()
        return True
    except OSError:
        return False


def file_path_to_media_source_url(file_path: str) -> str:
    """
    Convert a stored file_path to a media-source URL for the frontend.
    - If already a media-source URL or data URL, return as-is.
    - If path is in Calendar Images, return media-source URL.
    - Otherwise return as-is (legacy).
    """
    if not file_path:
        return ""
    if file_path.startswith("media-source://") or file_path.startswith("data:"):
        return file_path
    if file_path.startswith("http://") or file_path.startswith("https://"):
        return file_path
    # Path in Calendar Images (e.g. "Calendar Images/x.jpg" or "media/Calendar Images/x.jpg")
    path_clean = file_path.replace("\\", "/")
    if CALENDAR_IMAGES_DIR + "/" in path_clean:
        idx = path_clean.find(CALENDAR_IMAGES_DIR + "/")
        rel = path_clean[idx:]
        return f"{MEDIA_SOURCE_PREFIX}/{rel}"
    if path_clean.startswith(CALENDAR_IMAGES_DIR + "/"):
        return f"{MEDIA_SOURCE_PREFIX}/{path_clean}"
    return file_path
