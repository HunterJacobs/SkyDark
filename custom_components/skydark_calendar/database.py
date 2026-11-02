"""SQLite database for Skydark Family Calendar."""

from __future__ import annotations

import json
import logging
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Generator

_LOGGER = logging.getLogger(__name__)

# Whitelist for _column_exists to prevent SQL injection (PRAGMA table_info doesn't support params).
_ALLOWED_TABLES = frozenset({
    "family_members", "events", "tasks", "lists", "list_items",
    "meal_recipes", "meal_ingredients", "meals", "app_settings",
    "photos", "rewards", "points_log",
    "calendar_sync_links", "calendar_sync_maps", "calendar_sync_tombstones",
})

SCHEMA = """
CREATE TABLE IF NOT EXISTS family_members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  avatar_url TEXT,
  initial TEXT,
  sort_order INTEGER,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  calendar_id TEXT,
  external_id TEXT,
  external_source TEXT,
  recurrence_rule TEXT,
  color TEXT,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (calendar_id) REFERENCES family_members(id)
);

CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time);
CREATE INDEX IF NOT EXISTS idx_events_calendar ON events(calendar_id);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  assignee_id TEXT NOT NULL,
  category TEXT,
  frequency TEXT,
  custom_schedule TEXT,
  icon TEXT,
  points INTEGER DEFAULT 0,
  completed_date TEXT,
  created_at TEXT,
  due_date TEXT,
  FOREIGN KEY (assignee_id) REFERENCES family_members(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed_date);

CREATE TABLE IF NOT EXISTS lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  sort_order INTEGER,
  created_at TEXT,
  owner_id TEXT,
  list_type TEXT DEFAULT 'general',
  FOREIGN KEY (owner_id) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  content TEXT NOT NULL,
  completed INTEGER DEFAULT 0,
  sort_order INTEGER,
  created_at TEXT,
  FOREIGN KEY (list_id) REFERENCES lists(id)
);

CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);

CREATE TABLE IF NOT EXISTS meal_recipes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS meal_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  FOREIGN KEY (recipe_id) REFERENCES meal_recipes(id)
);

CREATE TABLE IF NOT EXISTS meals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  recipe_url TEXT,
  ingredients TEXT,
  meal_date TEXT NOT NULL,
  meal_type TEXT NOT NULL,
  created_at TEXT,
  meal_recipe_id TEXT,
  FOREIGN KEY (meal_recipe_id) REFERENCES meal_recipes(id)
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  caption TEXT,
  uploaded_by TEXT,
  album_id TEXT,
  created_at TEXT,
  FOREIGN KEY (uploaded_by) REFERENCES family_members(id)
);

CREATE TABLE IF NOT EXISTS rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  points_required INTEGER NOT NULL,
  description TEXT,
  icon TEXT
);

CREATE TABLE IF NOT EXISTS points_log (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  points INTEGER,
  reason TEXT,
  task_id TEXT,
  created_at TEXT,
  FOREIGN KEY (member_id) REFERENCES family_members(id)
);

CREATE INDEX IF NOT EXISTS idx_points_log_member ON points_log(member_id);

CREATE INDEX IF NOT EXISTS idx_meals_date ON meals(meal_date);

CREATE TABLE IF NOT EXISTS calendar_sync_links (
  id TEXT PRIMARY KEY,
  entity_id TEXT NOT NULL UNIQUE,
  name TEXT,
  pull_enabled INTEGER DEFAULT 0,
  push_enabled INTEGER DEFAULT 0,
  import_existing INTEGER DEFAULT 0,
  last_synced_at TEXT,
  last_error TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS calendar_sync_maps (
  id TEXT PRIMARY KEY,
  link_id TEXT NOT NULL,
  skydark_event_id TEXT NOT NULL,
  remote_uid TEXT NOT NULL,
  origin TEXT NOT NULL,
  last_hash TEXT,
  UNIQUE(link_id, skydark_event_id),
  UNIQUE(link_id, remote_uid)
);

CREATE INDEX IF NOT EXISTS idx_sync_maps_event ON calendar_sync_maps(skydark_event_id);
CREATE INDEX IF NOT EXISTS idx_sync_maps_link ON calendar_sync_maps(link_id);

CREATE TABLE IF NOT EXISTS calendar_sync_tombstones (
  link_id TEXT NOT NULL,
  remote_uid TEXT NOT NULL,
  created_at TEXT,
  PRIMARY KEY (link_id, remote_uid)
);
"""


def _row_to_dict(cursor: sqlite3.Cursor, row: tuple) -> dict[str, Any]:
    return {cursor.description[i][0]: row[i] for i in range(len(row))}


def _iso(value: datetime | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _encode_task_schedule(extra: dict[str, Any] | None) -> str | None:
    if not extra:
        return None
    payload = {k: v for k, v in extra.items() if v is not None}
    return json.dumps(payload) if payload else None


def _decode_task_row(row: dict[str, Any]) -> dict[str, Any]:
    """Expand JSON stored in tasks.custom_schedule onto the row."""
    raw = row.get("custom_schedule")
    if not raw or not isinstance(raw, str) or not raw.startswith("{"):
        return row
    try:
        extra = json.loads(raw)
    except json.JSONDecodeError:
        return row
    if not isinstance(extra, dict):
        return row
    out = dict(row)
    if "weekdays" in extra:
        out["weekdays"] = extra["weekdays"]
    for key in (
        "custom_schedule",
        "custom_monthday",
        "custom_month",
        "custom_weekday",
        "custom_week_of_month",
    ):
        if key in extra:
            out[key] = extra[key]
    return out


def _parse_ingredients(raw: Any) -> list[dict] | None:
    if not raw:
        return None
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            return [{"name": raw, "quantity": "", "unit": ""}]
    return None


_DEFAULT_MEMBERS = (
    ("Mom", "#FFD4D4", "M"),
    ("Dad", "#C8E6F5", "D"),
    ("Harper", "#C8F5E8", "H"),
    ("Liam", "#FFF4D4", "L"),
)


class SkydarkDatabase:
    """SQLite database wrapper for Skydark Calendar."""

    def __init__(self, path: str | Path) -> None:
        self._path = str(path)

    @contextmanager
    def _connection(self) -> Generator[sqlite3.Connection, None, None]:
        conn = sqlite3.connect(
            self._path,
            timeout=30,
            check_same_thread=False,
        )
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.execute("PRAGMA busy_timeout=30000")
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def _column_exists(self, conn: sqlite3.Connection, table: str, column: str) -> bool:
        if table not in _ALLOWED_TABLES:
            return False
        cur = conn.execute("PRAGMA table_info(%s)" % table)
        return any(row[1] == column for row in cur.fetchall())

    def init(self) -> None:
        """Create tables if they don't exist and run migrations for new columns."""
        def _init(conn: sqlite3.Connection) -> None:
            conn.executescript(SCHEMA)
            # Migrations for existing DBs: add new columns if missing
            if not self._column_exists(conn, "tasks", "points"):
                conn.execute("ALTER TABLE tasks ADD COLUMN points INTEGER DEFAULT 0")
            if not self._column_exists(conn, "tasks", "due_date"):
                conn.execute("ALTER TABLE tasks ADD COLUMN due_date TEXT")
            if not self._column_exists(conn, "lists", "owner_id"):
                conn.execute("ALTER TABLE lists ADD COLUMN owner_id TEXT")
            if not self._column_exists(conn, "lists", "list_type"):
                conn.execute("ALTER TABLE lists ADD COLUMN list_type TEXT DEFAULT 'general'")
            if not self._column_exists(conn, "meals", "meal_recipe_id"):
                conn.execute("ALTER TABLE meals ADD COLUMN meal_recipe_id TEXT")
            if not self._column_exists(conn, "events", "sync_push_targets"):
                conn.execute("ALTER TABLE events ADD COLUMN sync_push_targets TEXT")
            if not self._column_exists(conn, "points_log", "completion_date"):
                conn.execute("ALTER TABLE points_log ADD COLUMN completion_date TEXT")
            self._seed_if_empty(conn)

        with self._connection() as conn:
            _init(conn)

    def _seed_if_empty(self, conn: sqlite3.Connection) -> None:
        cur = conn.execute("SELECT COUNT(*) FROM family_members")
        if (cur.fetchone()[0] or 0) > 0:
            return
        now = datetime.now(timezone.utc).isoformat()
        for i, (name, color, initial) in enumerate(_DEFAULT_MEMBERS, start=1):
            conn.execute(
                "INSERT INTO family_members (id, name, color, initial, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (str(uuid.uuid4()), name, color, initial, i, now),
            )
        conn.execute(
            "INSERT OR IGNORE INTO app_settings (key, value) VALUES ('family_name', 'My Family')"
        )

    # Family members
    def get_family_members(self) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT * FROM family_members ORDER BY sort_order, name"
            )
            return [dict(row) for row in cur.fetchall()]

    def add_family_member(
        self,
        name: str,
        color: str,
        initial: str | None = None,
        avatar_url: str | None = None,
    ) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        init = (initial or (name[0].upper() if name else "?"))
        with self._connection() as conn:
            cur = conn.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM family_members")
            sort_order = cur.fetchone()[0]
            conn.execute(
                "INSERT INTO family_members (id, name, color, initial, avatar_url, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (id_, name, color, init, avatar_url, sort_order, now),
            )
        return id_

    def update_family_member(
        self,
        id_: str,
        name: str | None = None,
        color: str | None = None,
        initial: str | None = None,
        avatar_url: str | None = None,
        sort_order: int | None = None,
    ) -> None:
        updates = []
        values: list[Any] = []
        if name is not None:
            updates.append("name = ?")
            values.append(name)
        if color is not None:
            updates.append("color = ?")
            values.append(color)
        if initial is not None:
            updates.append("initial = ?")
            values.append(initial)
        if avatar_url is not None:
            updates.append("avatar_url = ?")
            values.append(avatar_url)
        if sort_order is not None:
            updates.append("sort_order = ?")
            values.append(sort_order)
        if not updates:
            return
        values.append(id_)
        with self._connection() as conn:
            conn.execute(
                f"UPDATE family_members SET {', '.join(updates)} WHERE id = ?",
                values,
            )

    def delete_family_member(self, id_: str) -> None:
        """Remove a member and detach related rows so FKs cannot block the delete."""
        with self._connection() as conn:
            conn.execute("UPDATE events SET calendar_id = NULL WHERE calendar_id = ?", (id_,))
            conn.execute("DELETE FROM tasks WHERE assignee_id = ?", (id_,))
            conn.execute("UPDATE lists SET owner_id = NULL WHERE owner_id = ?", (id_,))
            conn.execute("UPDATE photos SET uploaded_by = NULL WHERE uploaded_by = ?", (id_,))
            conn.execute("DELETE FROM points_log WHERE member_id = ?", (id_,))
            conn.execute("DELETE FROM family_members WHERE id = ?", (id_,))

    # Events
    def get_events(
        self,
        start: datetime | str | None = None,
        end: datetime | str | None = None,
    ) -> list[dict]:
        """Return events overlapping [start, end]. Includes events that started before the range."""
        with self._connection() as conn:
            start_iso = _iso(start)
            end_iso = _iso(end)
            if start_iso and end_iso:
                cur = conn.execute(
                    """
                    SELECT * FROM events
                    WHERE start_time <= ?
                      AND COALESCE(end_time, start_time) >= ?
                    ORDER BY start_time
                    """,
                    (end_iso, start_iso),
                )
            else:
                cur = conn.execute("SELECT * FROM events ORDER BY start_time")
            return [dict(row) for row in cur.fetchall()]

    def add_event(
        self,
        title: str,
        start_time: datetime,
        end_time: datetime | None = None,
        all_day: bool = False,
        calendar_id: str | None = None,
        description: str | None = None,
        location: str | None = None,
        color: str | None = None,
        recurrence_rule: str | None = None,
        external_id: str | None = None,
        external_source: str | None = None,
        sync_push_targets: str | None = None,
        event_id: str | None = None,
    ) -> str:
        id_ = event_id or str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute(
                """INSERT INTO events (id, title, description, start_time, end_time, all_day, location, calendar_id, external_id, external_source, recurrence_rule, color, created_at, updated_at, sync_push_targets)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    id_,
                    title,
                    description or "",
                    start_time.isoformat() if hasattr(start_time, "isoformat") else str(start_time),
                    end_time.isoformat() if end_time and hasattr(end_time, "isoformat") else (str(end_time) if end_time else None),
                    1 if all_day else 0,
                    location or "",
                    calendar_id,
                    external_id,
                    external_source,
                    recurrence_rule,
                    color,
                    now,
                    now,
                    sync_push_targets,
                ),
            )
        return id_

    def get_event(self, id_: str) -> dict | None:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM events WHERE id = ?", (id_,))
            row = cur.fetchone()
            return dict(row) if row else None

    def update_event(self, id_: str, **kwargs: Any) -> None:
        allowed = {
            "title",
            "description",
            "start_time",
            "end_time",
            "all_day",
            "location",
            "calendar_id",
            "color",
            "recurrence_rule",
            "external_id",
            "external_source",
            "sync_push_targets",
        }
        updates = []
        values = []
        for k, v in kwargs.items():
            if k not in allowed:
                continue
            if k in ("start_time", "end_time") and hasattr(v, "isoformat"):
                v = v.isoformat()
            if k == "all_day":
                v = 1 if v else 0
            updates.append(f"{k} = ?")
            values.append(v)
        if not updates:
            return
        values.append(datetime.now(timezone.utc).isoformat())
        values.append(id_)
        updates.append("updated_at = ?")
        with self._connection() as conn:
            conn.execute(
                f"UPDATE events SET {', '.join(updates)} WHERE id = ?",
                values,
            )

    def delete_event(self, id_: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM calendar_sync_maps WHERE skydark_event_id = ?", (id_,))
            conn.execute("DELETE FROM events WHERE id = ?", (id_,))

    # Calendar sync
    def get_sync_links(self) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM calendar_sync_links ORDER BY name, entity_id")
            return [dict(row) for row in cur.fetchall()]

    def get_sync_link(self, link_id: str) -> dict | None:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM calendar_sync_links WHERE id = ?", (link_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def get_sync_link_by_entity(self, entity_id: str) -> dict | None:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM calendar_sync_links WHERE entity_id = ?", (entity_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def upsert_sync_link(
        self,
        entity_id: str,
        name: str | None = None,
        pull_enabled: bool | None = None,
        push_enabled: bool | None = None,
        import_existing: bool | None = None,
    ) -> str:
        existing = self.get_sync_link_by_entity(entity_id)
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            if existing:
                fields = []
                values: list[Any] = []
                if name is not None:
                    fields.append("name = ?")
                    values.append(name)
                if pull_enabled is not None:
                    fields.append("pull_enabled = ?")
                    values.append(1 if pull_enabled else 0)
                if push_enabled is not None:
                    fields.append("push_enabled = ?")
                    values.append(1 if push_enabled else 0)
                if import_existing is not None:
                    fields.append("import_existing = ?")
                    values.append(1 if import_existing else 0)
                if fields:
                    values.append(existing["id"])
                    conn.execute(
                        f"UPDATE calendar_sync_links SET {', '.join(fields)} WHERE id = ?",
                        values,
                    )
                return existing["id"]
            id_ = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO calendar_sync_links
                   (id, entity_id, name, pull_enabled, push_enabled, import_existing, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    id_,
                    entity_id,
                    name or entity_id,
                    1 if pull_enabled else 0,
                    1 if push_enabled else 0,
                    1 if import_existing else 0,
                    now,
                ),
            )
            return id_

    def delete_sync_link(self, link_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM calendar_sync_maps WHERE link_id = ?", (link_id,))
            conn.execute("DELETE FROM calendar_sync_tombstones WHERE link_id = ?", (link_id,))
            conn.execute("DELETE FROM calendar_sync_links WHERE id = ?", (link_id,))

    def set_sync_link_status(self, link_id: str, last_error: str | None = None) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute(
                "UPDATE calendar_sync_links SET last_synced_at = ?, last_error = ? WHERE id = ?",
                (now, last_error, link_id),
            )

    def get_sync_maps(self, link_id: str) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM calendar_sync_maps WHERE link_id = ?", (link_id,))
            return [dict(row) for row in cur.fetchall()]

    def get_sync_maps_for_event(self, event_id: str) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT * FROM calendar_sync_maps WHERE skydark_event_id = ?",
                (event_id,),
            )
            return [dict(row) for row in cur.fetchall()]

    def upsert_sync_map(
        self,
        link_id: str,
        skydark_event_id: str,
        remote_uid: str,
        origin: str,
        last_hash: str | None,
    ) -> None:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT id FROM calendar_sync_maps WHERE link_id = ? AND skydark_event_id = ?",
                (link_id, skydark_event_id),
            )
            row = cur.fetchone()
            if row:
                conn.execute(
                    "UPDATE calendar_sync_maps SET remote_uid = ?, origin = ?, last_hash = ? WHERE id = ?",
                    (remote_uid, origin, last_hash, row["id"]),
                )
                return
            conn.execute(
                """INSERT INTO calendar_sync_maps (id, link_id, skydark_event_id, remote_uid, origin, last_hash)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (str(uuid.uuid4()), link_id, skydark_event_id, remote_uid, origin, last_hash),
            )

    def delete_sync_map(self, link_id: str, skydark_event_id: str) -> None:
        with self._connection() as conn:
            conn.execute(
                "DELETE FROM calendar_sync_maps WHERE link_id = ? AND skydark_event_id = ?",
                (link_id, skydark_event_id),
            )

    def add_tombstone(self, link_id: str, remote_uid: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO calendar_sync_tombstones (link_id, remote_uid, created_at) VALUES (?, ?, ?)",
                (link_id, remote_uid, now),
            )

    def is_tombstoned(self, link_id: str, remote_uid: str) -> bool:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT 1 FROM calendar_sync_tombstones WHERE link_id = ? AND remote_uid = ?",
                (link_id, remote_uid),
            )
            return cur.fetchone() is not None

    # Tasks
    def get_tasks(
        self,
        assignee_id: str | None = None,
        due_date: str | None = None,
        completed_date: str | None = None,
        include_completed: bool = True,
    ) -> list[dict]:
        with self._connection() as conn:
            q = "SELECT * FROM tasks WHERE 1=1"
            params: list[Any] = []
            if assignee_id:
                q += " AND assignee_id = ?"
                params.append(assignee_id)
            if due_date is not None:
                q += " AND (due_date = ? OR due_date IS NULL)"
                params.append(due_date)
            if completed_date is not None:
                q += " AND completed_date = ?"
                params.append(completed_date)
            if not include_completed:
                q += " AND completed_date IS NULL"
            q += " ORDER BY created_at"
            cur = conn.execute(q, params)
            return [_decode_task_row(dict(row)) for row in cur.fetchall()]

    def add_task(
        self,
        title: str,
        assignee_id: str,
        category: str | None = None,
        frequency: str = "daily",
        icon: str | None = None,
        points: int = 0,
        due_date: str | None = None,
        custom_schedule: dict[str, Any] | str | None = None,
    ) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        schedule = (
            custom_schedule
            if isinstance(custom_schedule, str)
            else _encode_task_schedule(custom_schedule)
        )
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO tasks (id, title, assignee_id, category, frequency, icon, points, due_date, custom_schedule, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (id_, title, assignee_id, category, frequency, icon, points, due_date, schedule, now),
            )
        return id_

    def update_task(
        self,
        task_id: str,
        title: str | None = None,
        assignee_id: str | None = None,
        category: str | None = None,
        frequency: str | None = None,
        icon: str | None = None,
        points: int | None = None,
        due_date: str | None = None,
        custom_schedule: dict[str, Any] | str | None = None,
    ) -> None:
        updates = []
        values: list[Any] = []
        if title is not None:
            updates.append("title = ?")
            values.append(title)
        if assignee_id is not None:
            updates.append("assignee_id = ?")
            values.append(assignee_id)
        if category is not None:
            updates.append("category = ?")
            values.append(category)
        if frequency is not None:
            updates.append("frequency = ?")
            values.append(frequency)
        if icon is not None:
            updates.append("icon = ?")
            values.append(icon)
        if points is not None:
            updates.append("points = ?")
            values.append(points)
        if due_date is not None:
            updates.append("due_date = ?")
            values.append(due_date)
        if custom_schedule is not None:
            updates.append("custom_schedule = ?")
            values.append(
                custom_schedule
                if isinstance(custom_schedule, str)
                else _encode_task_schedule(custom_schedule)
            )
        if not updates:
            return
        values.append(task_id)
        with self._connection() as conn:
            conn.execute(
                f"UPDATE tasks SET {', '.join(updates)} WHERE id = ?",
                values,
            )

    def get_task(self, task_id: str) -> dict | None:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            return _decode_task_row(dict(row)) if row else None

    def complete_task(self, task_id: str, completed_date: datetime | None = None) -> None:
        d = (completed_date or datetime.now(timezone.utc)).date().isoformat()
        with self._connection() as conn:
            conn.execute(
                "UPDATE tasks SET completed_date = ? WHERE id = ?",
                (d, task_id),
            )

    def complete_task_and_award_points(
        self,
        task_id: str,
        completed_date: datetime | None = None,
        points: int = 0,
    ) -> None:
        """Mark task complete and award points to assignee in one transaction.

        Completing the same task again on the same calendar day is a no-op so
        points are not awarded twice. Completing on a new day overwrites the
        date and awards points again (daily/weekly chores).
        """
        d = (completed_date or datetime.now(timezone.utc)).date().isoformat()
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute(
                "SELECT assignee_id, completed_date FROM tasks WHERE id = ?", (task_id,)
            )
            row = cur.fetchone()
            if not row:
                return
            assignee_id = row[0]
            if row[1] == d:
                return
            conn.execute(
                "UPDATE tasks SET completed_date = ? WHERE id = ?",
                (d, task_id),
            )
            if points > 0 and assignee_id:
                id_ = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                conn.execute(
                    "INSERT INTO points_log (id, member_id, points, reason, task_id, created_at, completion_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (id_, assignee_id, points, "Task completed", task_id, now, d),
                )

    def uncomplete_task(self, task_id: str) -> None:
        self.uncomplete_task_and_revoke_points(task_id)

    def uncomplete_task_and_revoke_points(self, task_id: str) -> None:
        """Clear completion and remove today's 'Task completed' points for this task."""
        with self._connection() as conn:
            conn.execute("BEGIN IMMEDIATE")
            cur = conn.execute("SELECT completed_date FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if not row:
                return
            completed = row[0]
            conn.execute(
                "UPDATE tasks SET completed_date = NULL WHERE id = ?",
                (task_id,),
            )
            if completed:
                conn.execute(
                    """
                    DELETE FROM points_log
                    WHERE task_id = ?
                      AND reason = 'Task completed'
                      AND COALESCE(completion_date, date(created_at)) = date(?)
                    """,
                    (task_id, completed),
                )

    def delete_task(self, task_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))

    # Lists
    def get_lists(self) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM lists ORDER BY sort_order, name")
            return [dict(row) for row in cur.fetchall()]

    def add_list(
        self,
        name: str,
        color: str | None = None,
        owner_id: str | None = None,
        list_type: str = "general",
    ) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            cur = conn.execute("SELECT COALESCE(MAX(sort_order), 0) + 1 FROM lists")
            sort_order = cur.fetchone()[0]
            conn.execute(
                "INSERT INTO lists (id, name, color, sort_order, created_at, owner_id, list_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (id_, name, color or "#E8D8F5", sort_order, now, owner_id, list_type),
            )
        return id_

    def delete_list(self, list_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM list_items WHERE list_id = ?", (list_id,))
            conn.execute("DELETE FROM lists WHERE id = ?", (list_id,))

    def get_list_items(self, list_id: str) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT * FROM list_items WHERE list_id = ? ORDER BY sort_order, created_at",
                (list_id,),
            )
            return [dict(row) for row in cur.fetchall()]

    def get_all_list_items(self) -> dict[str, list[dict]]:
        """Return all list items keyed by list_id (single query, avoids N+1)."""
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT * FROM list_items ORDER BY list_id, sort_order, created_at"
            )
            rows = [dict(row) for row in cur.fetchall()]
        result: dict[str, list[dict]] = {}
        for row in rows:
            lid = row["list_id"]
            if lid not in result:
                result[lid] = []
            result[lid].append(row)
        return result

    def add_list_item(self, list_id: str, content: str) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM list_items WHERE list_id = ?",
                (list_id,),
            )
            sort_order = cur.fetchone()[0]
            conn.execute(
                "INSERT INTO list_items (id, list_id, content, completed, sort_order, created_at) VALUES (?, ?, ?, 0, ?, ?)",
                (id_, list_id, content, sort_order, now),
            )
        return id_

    def toggle_list_item(self, item_id: str) -> None:
        with self._connection() as conn:
            conn.execute(
                "UPDATE list_items SET completed = 1 - completed WHERE id = ?",
                (item_id,),
            )

    def delete_list_item(self, item_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM list_items WHERE id = ?", (item_id,))

    # Meals
    def get_meals(self, start_date: str | None = None, end_date: str | None = None) -> list[dict]:
        with self._connection() as conn:
            if start_date and end_date:
                cur = conn.execute(
                    "SELECT * FROM meals WHERE meal_date >= ? AND meal_date <= ? ORDER BY meal_date, meal_type",
                    (start_date, end_date),
                )
            else:
                cur = conn.execute("SELECT * FROM meals ORDER BY meal_date")
            meals = []
            for row in cur.fetchall():
                item = dict(row)
                parsed = _parse_ingredients(item.get("ingredients"))
                if parsed is not None:
                    item["ingredients"] = parsed
                meals.append(item)
            return meals

    def add_meal(
        self,
        name: str,
        meal_date: str,
        meal_type: str = "dinner",
        recipe_url: str | None = None,
        ingredients: str | list | None = None,
        meal_recipe_id: str | None = None,
    ) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        ing = ingredients if isinstance(ingredients, str) or ingredients is None else json.dumps(ingredients)
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO meals (id, name, recipe_url, ingredients, meal_date, meal_type, created_at, meal_recipe_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (id_, name, recipe_url, ing, meal_date, meal_type, now, meal_recipe_id),
            )
        return id_

    def update_meal(
        self,
        meal_id: str,
        name: str | None = None,
        meal_recipe_id: str | None = None,
        meal_date: str | None = None,
        meal_type: str | None = None,
        ingredients: str | list | None = None,
        recipe_url: str | None = None,
    ) -> None:
        updates = []
        values: list[Any] = []
        if name is not None:
            updates.append("name = ?")
            values.append(name)
        if meal_recipe_id is not None:
            updates.append("meal_recipe_id = ?")
            values.append(meal_recipe_id)
        if meal_date is not None:
            updates.append("meal_date = ?")
            values.append(meal_date)
        if meal_type is not None:
            updates.append("meal_type = ?")
            values.append(meal_type)
        if ingredients is not None:
            updates.append("ingredients = ?")
            values.append(
                ingredients if isinstance(ingredients, str) else json.dumps(ingredients)
            )
        if recipe_url is not None:
            updates.append("recipe_url = ?")
            values.append(recipe_url)
        if not updates:
            return
        values.append(meal_id)
        with self._connection() as conn:
            conn.execute(
                f"UPDATE meals SET {', '.join(updates)} WHERE id = ?",
                values,
            )

    def delete_meal(self, meal_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM meals WHERE id = ?", (meal_id,))

    # Meal recipes and ingredients (for library and shopping list)
    def get_meal_recipes(self) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM meal_recipes ORDER BY name")
            return [dict(row) for row in cur.fetchall()]

    def add_meal_recipe(self, name: str, ingredients: list[dict] | None = None) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO meal_recipes (id, name, created_at) VALUES (?, ?, ?)",
                (id_, name, now),
            )
            if ingredients:
                for ing in ingredients:
                    ing_id = str(uuid.uuid4())
                    conn.execute(
                        "INSERT INTO meal_ingredients (id, recipe_id, name, quantity, unit) VALUES (?, ?, ?, ?, ?)",
                        (
                            ing_id,
                            id_,
                            ing.get("name", ""),
                            ing.get("quantity", ""),
                            ing.get("unit", ""),
                        ),
                    )
        return id_

    def get_meal_recipe_ingredients(self, recipe_id: str) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT * FROM meal_ingredients WHERE recipe_id = ? ORDER BY name",
                (recipe_id,),
            )
            return [dict(row) for row in cur.fetchall()]

    def get_meal_recipes_with_ingredients(self) -> list[dict]:
        """Return recipes with an ingredients list attached (single extra query)."""
        recipes = self.get_meal_recipes()
        if not recipes:
            return recipes
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM meal_ingredients ORDER BY name")
            by_recipe: dict[str, list[dict]] = {}
            for row in cur.fetchall():
                item = dict(row)
                by_recipe.setdefault(item["recipe_id"], []).append(item)
        for recipe in recipes:
            recipe["ingredients"] = by_recipe.get(recipe["id"], [])
        return recipes

    def delete_meal_recipe(self, recipe_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM meal_ingredients WHERE recipe_id = ?", (recipe_id,))
            conn.execute("UPDATE meals SET meal_recipe_id = NULL WHERE meal_recipe_id = ?", (recipe_id,))
            conn.execute("DELETE FROM meal_recipes WHERE id = ?", (recipe_id,))

    def get_shopping_list(self, start_date: str, end_date: str) -> list[dict]:
        """Aggregate ingredients from meals in date range; each row has name, quantity, unit, meal_date, meal_name."""
        with self._connection() as conn:
            cur = conn.execute(
                """
                SELECT mi.name, mi.quantity, mi.unit, m.meal_date, m.meal_type, m.name AS meal_name
                FROM meals m
                JOIN meal_recipes mr ON m.meal_recipe_id = mr.id
                JOIN meal_ingredients mi ON mi.recipe_id = mr.id
                WHERE m.meal_date >= ? AND m.meal_date <= ?
                ORDER BY mi.name, m.meal_date
                """,
                (start_date, end_date),
            )
            return [dict(row) for row in cur.fetchall()]

    # App settings (e.g. PIN hash)
    def get_settings(self) -> dict[str, str]:
        with self._connection() as conn:
            cur = conn.execute("SELECT key, value FROM app_settings")
            return {row[0]: row[1] for row in cur.fetchall()}

    def save_setting(self, key: str, value: str) -> None:
        with self._connection() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
                (key, value),
            )

    # Photos
    def add_photo(
        self,
        file_path: str,
        caption: str | None = None,
        uploaded_by: str | None = None,
    ) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO photos (id, file_path, caption, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?)",
                (id_, file_path, caption, uploaded_by, now),
            )
        return id_

    def get_photos(self) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM photos ORDER BY created_at DESC")
            return [dict(row) for row in cur.fetchall()]

    def get_photo(self, photo_id: str) -> dict | None:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def delete_photo(self, photo_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM photos WHERE id = ?", (photo_id,))

    # Rewards / points
    def get_points(self, member_id: str) -> int:
        with self._connection() as conn:
            cur = conn.execute(
                "SELECT COALESCE(SUM(points), 0) FROM points_log WHERE member_id = ?",
                (member_id,),
            )
            return cur.fetchone()[0] or 0

    def get_points_by_member(self) -> dict[str, int]:
        """Return points balance for every family member in two queries."""
        with self._connection() as conn:
            members = conn.execute("SELECT id FROM family_members").fetchall()
            totals = {
                row[0]: int(row[1] or 0)
                for row in conn.execute(
                    "SELECT member_id, COALESCE(SUM(points), 0) FROM points_log GROUP BY member_id"
                )
            }
            return {m[0]: totals.get(m[0], 0) for m in members}

    def add_points(self, member_id: str, points: int, reason: str, task_id: str | None = None) -> str:
        id_ = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO points_log (id, member_id, points, reason, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (id_, member_id, points, reason, task_id, now),
            )
        return id_

    def get_rewards(self) -> list[dict]:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM rewards ORDER BY points_required")
            return [dict(row) for row in cur.fetchall()]

    def add_reward(self, name: str, points_required: int, description: str | None = None, icon: str | None = None) -> str:
        id_ = str(uuid.uuid4())
        with self._connection() as conn:
            conn.execute(
                "INSERT INTO rewards (id, name, points_required, description, icon) VALUES (?, ?, ?, ?, ?)",
                (id_, name, points_required, description or "", icon),
            )
        return id_

    def delete_reward(self, reward_id: str) -> None:
        with self._connection() as conn:
            conn.execute("DELETE FROM rewards WHERE id = ?", (reward_id,))

    def get_reward(self, reward_id: str) -> dict | None:
        with self._connection() as conn:
            cur = conn.execute("SELECT * FROM rewards WHERE id = ?", (reward_id,))
            row = cur.fetchone()
            return dict(row) if row else None

    def redeem_reward(self, member_id: str, reward_id: str) -> bool:
        """Deduct points for reward atomically; returns True if member had enough points."""
        with self._connection() as conn:
            conn.execute("BEGIN EXCLUSIVE")
            cur = conn.execute(
                "SELECT name, points_required FROM rewards WHERE id = ?", (reward_id,)
            )
            row = cur.fetchone()
            if not row:
                return False
            reward_name = row[0]
            cost = row[1]

            cur = conn.execute(
                "SELECT COALESCE(SUM(points), 0) FROM points_log WHERE member_id = ?",
                (member_id,),
            )
            current = cur.fetchone()[0] or 0

            if current < cost:
                return False

            id_ = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO points_log (id, member_id, points, reason, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (id_, member_id, -cost, "Redeemed: " + reward_name, None, now),
            )
            return True
