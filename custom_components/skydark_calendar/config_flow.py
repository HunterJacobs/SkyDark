"""Config flow for Skydark Family Calendar."""

from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import HomeAssistant, callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import CONF_FAMILY_NAME, CONF_WEATHER_ENTITY, DEFAULT_FAMILY_NAME, DOMAIN

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


async def validate_input(_hass: HomeAssistant, data: dict[str, Any]) -> dict[str, Any]:
    """Validate config."""
    if not data.get(CONF_FAMILY_NAME) or not data[CONF_FAMILY_NAME].strip():
        raise ValueError("Family name is required")
    return {"title": data[CONF_FAMILY_NAME].strip()}


class SkydarkConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Skydark Family Calendar."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                info = await validate_input(self.hass, user_input)
            except ValueError:
                errors["base"] = "invalid_family_name"
            else:
                await self.async_set_unique_id("skydark_calendar")
                self._abort_if_unique_id_configured()
                return self.async_create_entry(title=info["title"], data=user_input)

        return self.async_show_form(
            step_id="user",
            data_schema=CONFIG_SCHEMA,
            errors=errors,
            description_placeholders={"name": "Skydark Calendar"},
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
                return self.async_create_entry(title="", data=user_input)

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_FAMILY_NAME,
                        default=self.config_entry.options.get(CONF_FAMILY_NAME)
                        or self.config_entry.data.get(CONF_FAMILY_NAME, DEFAULT_FAMILY_NAME),
                    ): str,
                    vol.Optional(
                        CONF_WEATHER_ENTITY,
                        default=self.config_entry.options.get(CONF_WEATHER_ENTITY)
                        or self.config_entry.data.get(CONF_WEATHER_ENTITY),
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
