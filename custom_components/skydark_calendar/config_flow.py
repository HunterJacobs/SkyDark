"""Config flow for Skydark Family Calendar."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import (
    CONF_FAMILY_NAME,
    CONF_IMPORT_EXISTING,
    CONF_PULL_CALENDARS,
    CONF_PUSH_CALENDARS,
    CONF_WEATHER_ENTITY,
    DEFAULT_FAMILY_NAME,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)

CONFIG_SCHEMA = vol.Schema(
    {
        vol.Required(CONF_FAMILY_NAME, default=DEFAULT_FAMILY_NAME): str,
        vol.Optional(CONF_WEATHER_ENTITY): selector.EntitySelector(
            selector.EntitySelectorConfig(
                domain="weather",
                multiple=False,
            )
        ),
    }
)


def _sync_schema(defaults: dict[str, Any] | None = None) -> vol.Schema:
    defaults = defaults or {}
    return vol.Schema(
        {
            vol.Optional(
                CONF_PULL_CALENDARS,
                default=defaults.get(CONF_PULL_CALENDARS, []),
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="calendar", multiple=True)
            ),
            vol.Optional(
                CONF_PUSH_CALENDARS,
                default=defaults.get(CONF_PUSH_CALENDARS, []),
            ): selector.EntitySelector(
                selector.EntitySelectorConfig(domain="calendar", multiple=True)
            ),
            vol.Optional(
                CONF_IMPORT_EXISTING,
                default=defaults.get(CONF_IMPORT_EXISTING, True),
            ): bool,
        }
    )


async def validate_input(_hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Validate config."""
    if not data.get(CONF_FAMILY_NAME) or not str(data[CONF_FAMILY_NAME]).strip():
        raise ValueError("Family name is required")
    return {"title": str(data[CONF_FAMILY_NAME]).strip()}


class SkydarkConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Skydark Family Calendar."""

    VERSION = 1

    def __init__(self) -> None:
        self._user_data: dict[str, Any] = {}

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                await validate_input(self.hass, user_input)
            except ValueError:
                errors["base"] = "invalid_family_name"
            else:
                self._user_data = user_input
                return await self.async_step_sync()

        return self.async_show_form(
            step_id="user",
            data_schema=CONFIG_SCHEMA,
            errors=errors,
            description_placeholders={"name": "Skydark Calendar"},
        )

    async def async_step_sync(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Choose which Home Assistant calendars to import from and export to."""
        if user_input is not None:
            data = {**self._user_data, **user_input}
            info = await validate_input(self.hass, data)
            await self.async_set_unique_id("skydark_calendar")
            self._abort_if_unique_id_configured()
            return self.async_create_entry(title=info["title"], data=data)

        return self.async_show_form(
            step_id="sync",
            data_schema=_sync_schema(),
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> SkydarkOptionsFlow:
        """Get the options flow for this handler."""
        return SkydarkOptionsFlow()


class SkydarkOptionsFlow(config_entries.OptionsFlow):
    """Handle Skydark options."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        errors: dict[str, str] = {}
        if user_input is not None:
            try:
                await validate_input(self.hass, user_input)
            except ValueError:
                errors["base"] = "invalid_family_name"
            else:
                self._options_data = user_input
                return await self.async_step_sync()

        current = {**self.config_entry.data, **(self.config_entry.options or {})}
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_FAMILY_NAME,
                        default=current.get(CONF_FAMILY_NAME, DEFAULT_FAMILY_NAME),
                    ): str,
                    vol.Optional(
                        CONF_WEATHER_ENTITY,
                        default=current.get(CONF_WEATHER_ENTITY),
                    ): selector.EntitySelector(
                        selector.EntitySelectorConfig(
                            domain="weather",
                            multiple=False,
                        )
                    ),
                }
            ),
            errors=errors,
        )

    async def async_step_sync(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Update calendar sync direction."""
        current = {**self.config_entry.data, **(self.config_entry.options or {})}
        if user_input is not None:
            data = {**getattr(self, "_options_data", {}), **user_input}
            return self.async_create_entry(title="", data=data)
        return self.async_show_form(
            step_id="sync",
            data_schema=_sync_schema(current),
        )
