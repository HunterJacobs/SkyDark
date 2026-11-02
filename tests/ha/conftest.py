"""Fixtures for tests that load SkyDark into a real (in-process) Home Assistant.

Run with:  pip install pytest-homeassistant-custom-component && pytest tests/ha
These live outside the plain-unittest suite because they need Home Assistant installed.
"""
from pathlib import Path
import sys

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

pytest_plugins = "pytest_homeassistant_custom_component"


@pytest.fixture(autouse=True)
def auto_enable_custom_integrations(enable_custom_integrations):
    """Allow loading custom_components/skydark_calendar."""
    yield
