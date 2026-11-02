"""Regression tests using real SQLite and a small HA entity API test double.

No running HA instance/provider credentials are needed. Live provider verification
is still required before release.
"""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import IntFlag
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import AsyncMock, Mock, patch

ROOT = Path(__file__).resolve().parents[1] / 'custom_components/skydark_calendar'


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


class Feature(IntFlag):
    CREATE_EVENT = 1
    DELETE_EVENT = 2
    UPDATE_EVENT = 4


class CalendarSyncTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        modules = {name: types.ModuleType(name) for name in (
            'homeassistant', 'homeassistant.core', 'homeassistant.helpers',
            'homeassistant.helpers.entity_registry', 'homeassistant.helpers.event',
            'homeassistant.util', 'homeassistant.util.dt', 'homeassistant.components',
            'homeassistant.components.calendar', 'homeassistant.components.calendar.const',
            'skydark_test',
        )}
        modules['homeassistant.core'].HomeAssistant = object
        modules['homeassistant.core'].callback = lambda f: f
        modules['homeassistant.components.calendar'].CalendarEntityFeature = Feature
        modules['homeassistant.components.calendar.const'].DATA_COMPONENT = 'calendar'
        dt = modules['homeassistant.util.dt']
        dt.DEFAULT_TIME_ZONE = timezone.utc
        dt.utcnow = lambda: datetime.now(timezone.utc)
        dt.as_local = lambda d: d.astimezone(timezone.utc)
        dt.as_utc = lambda d: d.astimezone(timezone.utc)
        dt.parse_datetime = lambda s: datetime.fromisoformat(s)
        modules['homeassistant.util'].dt = dt
        modules['homeassistant.helpers.event'].async_call_later = Mock()
        modules['homeassistant.helpers.event'].async_track_time_interval = Mock()
        self.modules = patch.dict(sys.modules, modules)
        self.modules.start()
        load('skydark_test.const', 'const.py')
        db_module = load('skydark_test.database', 'database.py')
        self.module = load('skydark_test.calendar_sync', 'calendar_sync.py')
        self.temp = tempfile.TemporaryDirectory()
        self.db = db_module.SkydarkDatabase(Path(self.temp.name) / 'test.db')
        self.db.init()
        self.entity = types.SimpleNamespace(
            supported_features=Feature.CREATE_EVENT | Feature.DELETE_EVENT | Feature.UPDATE_EVENT,
            async_get_events=AsyncMock(return_value=[]),
            async_create_event=AsyncMock(), async_update_event=AsyncMock(), async_delete_event=AsyncMock(),
        )
        async def executor(fn, *args):
            return fn(*args)
        self.hass = types.SimpleNamespace(
            async_add_executor_job=executor, bus=types.SimpleNamespace(async_fire=Mock()),
            data={'calendar': types.SimpleNamespace(get_entity=lambda _: self.entity)},
            states=types.SimpleNamespace(get=lambda _: types.SimpleNamespace(state='off')),
        )
        self.sync = self.module.SkydarkCalendarSync(self.hass, self.db)
        self.link_id = self.db.upsert_sync_link('calendar.family', pull_enabled=True, push_enabled=True)

    def tearDown(self):
        self.modules.stop()
        self.temp.cleanup()

    def event(self, days=1):
        start = datetime.now(timezone.utc) + timedelta(days=days)
        return self.db.add_event('Test event', start, start + timedelta(hours=1))

    async def test_normal_sync_preserves_imported_history_outside_window(self):
        event_id = self.event(-365)
        self.db.upsert_sync_map(self.link_id, event_id, 'historic', 'remote', 'hash')
        await self.sync._pull_link(self.db.get_sync_link(self.link_id), import_all=False)
        self.assertIsNotNone(self.db.get_event(event_id))

    async def test_remote_deletion_inside_fetched_window_is_applied(self):
        event_id = self.event()
        self.db.upsert_sync_map(self.link_id, event_id, 'deleted', 'remote', 'hash')
        await self.sync._pull_link(self.db.get_sync_link(self.link_id), import_all=False)
        self.assertIsNone(self.db.get_event(event_id))

    async def test_invalid_response_does_not_delete_local_data(self):
        event_id = self.event()
        self.db.upsert_sync_map(self.link_id, event_id, 'remote', 'remote', 'hash')
        self.entity.async_get_events.return_value = None
        with self.assertRaises(RuntimeError):
            await self.sync._pull_link(self.db.get_sync_link(self.link_id), import_all=False)
        self.assertIsNotNone(self.db.get_event(event_id))

    async def test_update_uses_existing_uid_without_deleting(self):
        event_id = self.event()
        self.db.upsert_sync_map(self.link_id, event_id, 'uid-1', 'skydark', 'old')
        await self.sync._push_link(self.db.get_sync_link(self.link_id))
        self.entity.async_update_event.assert_awaited_once()
        self.assertEqual(self.entity.async_update_event.call_args.args[0], 'uid-1')
        self.entity.async_delete_event.assert_not_awaited()
        self.entity.async_create_event.assert_not_awaited()

    async def test_unsupported_update_preserves_original_and_reports_error(self):
        self.entity.supported_features = Feature.CREATE_EVENT
        with self.assertRaisesRegex(RuntimeError, 'original event was preserved'):
            await self.sync._update_remote('calendar.family', 'uid-1', self.db.get_event(self.event()))
        self.entity.async_create_event.assert_not_awaited()
        self.entity.async_delete_event.assert_not_awaited()

    async def test_failed_delete_propagates(self):
        self.entity.async_delete_event.side_effect = RuntimeError('Provider offline')
        with self.assertRaisesRegex(RuntimeError, 'Provider offline'):
            await self.sync._delete_remote('calendar.family', 'uid-1')

    async def test_pending_export_is_not_recreated(self):
        event_id = self.event()
        self.db.upsert_sync_map(self.link_id, event_id, f'pending::{event_id}', 'skydark', 'old')
        with self.assertRaisesRegex(RuntimeError, 'stable event ID'):
            await self.sync._push_link(self.db.get_sync_link(self.link_id))
        self.entity.async_create_event.assert_not_awaited()

    async def test_deselecting_calendars_disables_links_preserving_maps(self):
        event_id = self.event()
        self.db.upsert_sync_map(self.link_id, event_id, 'uid-1', 'remote', 'old')
        with patch.object(self.module, 'list_ha_calendars', return_value=[]):
            await self.sync.apply_config_links([], [], False)
        link = self.db.get_sync_link(self.link_id)
        self.assertFalse(link['pull_enabled'])
        self.assertFalse(link['push_enabled'])
        self.assertEqual(len(self.db.get_sync_maps(self.link_id)), 1)

    async def test_equal_content_rebaselines_legacy_hash(self):
        event_id = self.event()
        local = self.db.get_event(event_id)
        self.db.upsert_sync_map(self.link_id, event_id, 'uid-1', 'remote', 'legacy-hash')
        self.sync._fetch_remote_events = AsyncMock(return_value=[{
            'uid':'uid-1', 'summary':local['title'], 'start':local['start_time'],
            'end':local['end_time'], 'description':'', 'location':'',
        }])
        await self.sync._pull_link(self.db.get_sync_link(self.link_id), import_all=False)
        expected = self.module.event_content_hash(local['title'],local['start_time'],local['end_time'],False,'','')
        self.assertEqual(self.db.get_sync_maps(self.link_id)[0]['last_hash'], expected)

    def test_hash_normalizes_equivalent_timezones(self):
        fn = self.module.event_content_hash
        self.assertEqual(fn('A','2026-11-01T12:00:00Z',None,False,'',''),
                         fn('A','2026-11-01T07:00:00-05:00',None,False,'',''))

    def test_all_day_export_uses_dates_and_exclusive_end(self):
        event = {'id':'abc', 'title':'Birthday', 'start_time':'2026-11-01T00:00:00+00:00',
                 'end_time':'2026-11-02T23:59:59+00:00', 'all_day':True}
        payload = self.sync._event_payload(event)
        self.assertEqual(str(payload['start']), '2026-11-01')
        self.assertEqual(str(payload['end']), '2026-11-03')

    def test_undo_points_uses_completion_date_not_utc_log_date(self):
        member = self.db.add_family_member('Test', '#ffffff')
        task = self.db.add_task('Chore', member, points=10)
        local_date = datetime.now(timezone.utc) - timedelta(days=1)
        self.db.complete_task_and_award_points(task, local_date, 10)
        self.db.uncomplete_task_and_revoke_points(task)
        self.assertEqual(self.db.get_points(member), 0)
        self.db.complete_task_and_award_points(task, local_date, 10)
        self.db.complete_task_and_award_points(task, local_date, 10)
        self.assertEqual(self.db.get_points(member), 10)


if __name__ == '__main__':
    unittest.main()
