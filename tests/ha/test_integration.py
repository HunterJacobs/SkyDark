"""End-to-end tests: SkyDark running inside Home Assistant."""
import base64
from unittest.mock import patch

import pytest
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ServiceValidationError
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.skydark_calendar.const import DOMAIN

PNG_1PX = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
)


@pytest.fixture
async def entry(hass: HomeAssistant, tmp_path):
    # Each test gets its own config folder (and therefore its own SQLite database).
    hass.config.config_dir = str(tmp_path)
    hass.config.media_dirs = {"local": str(tmp_path / "media")}
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, data={"family_name": "Testers"})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    return entry


async def test_reload_succeeds(hass: HomeAssistant, entry):
    """Regression: re-registering the static routes made a reload fail."""
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.LOADED
    assert hass.data[DOMAIN]["db"] is not None


async def test_unload_cleans_up(hass: HomeAssistant, entry):
    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert entry.state is ConfigEntryState.NOT_LOADED
    assert "db" not in hass.data[DOMAIN]
    assert not hass.services.has_service(DOMAIN, "add_event")


async def test_config_reports_version_and_saves_weather(hass: HomeAssistant, entry, hass_ws_client):
    hass.states.async_set("weather.home", "sunny")
    client = await hass_ws_client(hass)

    await client.send_json_auto_id({"type": "skydark_calendar/get_config"})
    msg = await client.receive_json()
    assert msg["success"]
    assert msg["result"]["version"]  # from manifest.json
    assert msg["result"]["config"]["family_name"] == "Testers"

    await client.send_json_auto_id(
        {"type": "skydark_calendar/update_config", "weather_entity": "weather.home", "family_name": "The Hunters"}
    )
    msg = await client.receive_json()
    assert msg["success"], msg
    await hass.async_block_till_done()
    assert entry.options["weather_entity"] == "weather.home"
    assert hass.data[DOMAIN]["config"]["family_name"] == "The Hunters"

    await client.send_json_auto_id({"type": "skydark_calendar/update_config", "weather_entity": "light.kitchen"})
    msg = await client.receive_json()
    assert not msg["success"]
    assert msg["error"]["code"] == "invalid_entity"


async def test_unrelated_option_change_keeps_panel_calendar_links(hass: HomeAssistant, entry):
    """Regression: saving any option used to switch off links made from the panel."""
    sync = hass.data[DOMAIN]["sync"]
    with patch.object(sync, "apply_config_links") as apply_links:
        hass.config_entries.async_update_entry(entry, options={"weather_entity": "weather.home"})
        await hass.async_block_till_done()
        apply_links.assert_not_called()

        hass.config_entries.async_update_entry(
            entry, options={"weather_entity": "weather.home", "pull_calendars": ["calendar.family"]}
        )
        await hass.async_block_till_done()
        apply_links.assert_called_once()


async def test_photo_upload_list_delete(hass: HomeAssistant, entry, hass_ws_client, hass_client_no_auth, tmp_path):
    assert await async_setup_component(hass, "media_source", {})
    client = await hass_ws_client(hass)
    data_url = "data:image/png;base64," + base64.b64encode(PNG_1PX).decode()

    await client.send_json_auto_id({"type": "skydark_calendar/upload_photo", "data_url": data_url})
    msg = await client.receive_json()
    assert msg["success"], msg
    photo = msg["result"]["photo"]
    assert photo["url"].startswith("/media/local/Calendar%20Images/")
    assert "authSig=" in photo["url"]  # signed so an <img> can load it without a login header
    files = list((tmp_path / "media" / "Calendar Images").iterdir())
    assert len(files) == 1

    # The signed URL must actually be servable by HA's media endpoint, unauthenticated.
    web = await hass_client_no_auth()
    resp = await web.get(photo["url"])
    assert resp.status == 200
    assert await resp.read() == PNG_1PX
    unsigned = await web.get(photo["url"].split("?")[0])
    assert unsigned.status == 401

    await client.send_json_auto_id({"type": "skydark_calendar/get_photos"})
    msg = await client.receive_json()
    assert [p["id"] for p in msg["result"]["photos"]] == [photo["id"]]

    await client.send_json_auto_id({"type": "skydark_calendar/delete_photo", "photo_id": photo["id"]})
    msg = await client.receive_json()
    assert msg["success"]
    assert not files[0].exists()

    svg = "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode()
    await client.send_json_auto_id({"type": "skydark_calendar/upload_photo", "data_url": svg})
    msg = await client.receive_json()
    assert msg["error"]["code"] == "invalid_photo"


async def test_upload_photo_service_copies_into_media(hass: HomeAssistant, entry, tmp_path):
    snapshot = tmp_path / "snap.png"
    snapshot.write_bytes(PNG_1PX)
    await hass.services.async_call(DOMAIN, "upload_photo", {"file_path": str(snapshot)}, blocking=True)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(DOMAIN, "upload_photo", {"file_path": "/etc/passwd"}, blocking=True)
    photos = await hass.async_add_executor_job(hass.data[DOMAIN]["db"].get_photos)
    assert len(photos) == 1
    assert photos[0]["file_path"].startswith("/media/local/Calendar%20Images/")


async def test_redeem_without_points_raises(hass: HomeAssistant, entry):
    db = hass.data[DOMAIN]["db"]
    member = await hass.async_add_executor_job(lambda: db.add_family_member(name="Kid", color="#FFD4D4"))
    reward = await hass.async_add_executor_job(db.add_reward, "Movie night", 100)
    with pytest.raises(ServiceValidationError):
        await hass.services.async_call(
            DOMAIN, "redeem_reward", {"member_id": member, "reward_id": reward}, blocking=True
        )


async def test_delete_member_with_points_via_service(hass: HomeAssistant, entry):
    db = hass.data[DOMAIN]["db"]
    member = await hass.async_add_executor_job(lambda: db.add_family_member(name="Kid", color="#FFD4D4"))
    await hass.services.async_call(
        DOMAIN, "add_points", {"member_id": member, "points": 5, "reason": "Dishes"}, blocking=True
    )
    await hass.services.async_call(DOMAIN, "delete_family_member", {"member_id": member}, blocking=True)
    members = await hass.async_add_executor_job(db.get_family_members)
    assert member not in [m["id"] for m in members]
