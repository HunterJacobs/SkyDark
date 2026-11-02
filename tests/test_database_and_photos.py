"""Tests for the SQLite layer and photo storage helpers (no running Home Assistant needed)."""
import base64
import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest

ROOT = Path(__file__).resolve().parents[1] / "custom_components/skydark_calendar"


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


class DatabaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db_mod = load("skydark_db_under_test", "database.py")
        self.db = self.db_mod.SkydarkDatabase(Path(self.tmp.name) / "test.db")
        self.db.init()

    def tearDown(self):
        self.tmp.cleanup()

    def test_delete_member_with_points_and_rewards(self):
        """Regression: points_log rows used to block the delete with a foreign-key error."""
        member = self.db.add_family_member(name="Kid", color="#FFD4D4")
        self.db.add_points(member, 30, "Chores")
        reward = self.db.add_reward("Movie night", 20)
        self.assertTrue(self.db.redeem_reward(member, reward))

        self.db.delete_family_member(member)

        self.assertNotIn(member, [m["id"] for m in self.db.get_family_members()])
        self.assertEqual(self.db.get_points(member), 0)

    def test_redeem_requires_enough_points(self):
        member = self.db.add_family_member(name="Kid", color="#FFD4D4")
        reward = self.db.add_reward("Ice cream", 50)
        self.db.add_points(member, 10, "Chores")
        self.assertFalse(self.db.redeem_reward(member, reward))
        self.assertEqual(self.db.get_points(member), 10)

    def test_photo_round_trip(self):
        photo_id = self.db.add_photo(file_path="/media/local/Calendar%20Images/a.jpg", caption="Beach")
        self.assertEqual(self.db.get_photo(photo_id)["caption"], "Beach")
        self.db.delete_photo(photo_id)
        self.assertIsNone(self.db.get_photo(photo_id))


class PhotoMediaTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.media_root = root / "media"
        self.config_dir = root / "config"
        self.config_dir.mkdir()

        ha = types.ModuleType("homeassistant")
        core = types.ModuleType("homeassistant.core")
        core.HomeAssistant = object
        self._saved = {k: sys.modules.get(k) for k in ("homeassistant", "homeassistant.core")}
        sys.modules["homeassistant"] = ha
        sys.modules["homeassistant.core"] = core
        self.pm = load("skydark_photo_media_under_test", "photo_media.py")

        config = types.SimpleNamespace(
            media_dirs={"local": str(self.media_root)},
            path=lambda *parts: str(self.config_dir.joinpath(*parts)),
        )
        self.hass = types.SimpleNamespace(config=config)

    def tearDown(self):
        for key, module in self._saved.items():
            if module is None:
                sys.modules.pop(key, None)
            else:
                sys.modules[key] = module
        self.tmp.cleanup()

    def test_save_data_url_writes_into_calendar_images(self):
        data_url = "data:image/png;base64," + base64.b64encode(PNG_1PX).decode()
        url = self.pm.save_data_url(self.hass, data_url)
        self.assertTrue(url.startswith("/media/local/Calendar%20Images/"))
        self.assertTrue(url.endswith(".png"))
        path = self.pm.managed_file(self.hass, url)
        self.assertEqual(path.read_bytes(), PNG_1PX)

    def test_extension_comes_from_content_not_claimed_type(self):
        data_url = "data:image/jpeg;base64," + base64.b64encode(PNG_1PX).decode()
        self.assertTrue(self.pm.save_data_url(self.hass, data_url).endswith(".png"))

    def test_rejects_svg_and_non_images(self):
        svg = base64.b64encode(b"<svg onload='alert(1)'/>").decode()
        with self.assertRaises(self.pm.PhotoError):
            self.pm.save_data_url(self.hass, f"data:image/svg+xml;base64,{svg}")
        text = base64.b64encode(b"just some text").decode()
        with self.assertRaises(self.pm.PhotoError):
            self.pm.save_data_url(self.hass, f"data:image/png;base64,{text}")

    def test_rejects_oversized_payload(self):
        huge = "A" * (self.pm.MAX_PHOTO_BYTES * 2)
        with self.assertRaises(self.pm.PhotoError):
            self.pm.save_data_url(self.hass, f"data:image/png;base64,{huge}")

    def test_delete_ignores_paths_outside_the_photo_folder(self):
        secret = self.media_root / "secret.jpg"
        secret.parent.mkdir(parents=True, exist_ok=True)
        secret.write_bytes(PNG_1PX)
        for url in (
            "/media/local/Calendar%20Images/..%2Fsecret.jpg",
            "/media/local/Calendar%20Images/../secret.jpg",
            "/config/secrets.yaml",
            "",
        ):
            self.assertIsNone(self.pm.managed_file(self.hass, url), url)
            self.pm.delete_file(self.hass, url)
        self.assertTrue(secret.exists())

    def test_delete_removes_managed_file(self):
        url = self.pm.save_data_url(
            self.hass, "data:image/png;base64," + base64.b64encode(PNG_1PX).decode()
        )
        path = self.pm.managed_file(self.hass, url)
        self.pm.delete_file(self.hass, url)
        self.assertFalse(path.exists())

    def test_copy_file_checks_type(self):
        good = self.config_dir / "snap.png"
        good.write_bytes(PNG_1PX)
        url = self.pm.copy_file(self.hass, good)
        self.assertTrue(self.pm.managed_file(self.hass, url).is_file())

        fake = self.config_dir / "secrets.png"
        fake.write_text("api_key: hunter2")
        with self.assertRaises(self.pm.PhotoError):
            self.pm.copy_file(self.hass, fake)
        yaml = self.config_dir / "secrets.yaml"
        yaml.write_text("api_key: hunter2")
        with self.assertRaises(self.pm.PhotoError):
            self.pm.copy_file(self.hass, yaml)


if __name__ == "__main__":
    unittest.main()
