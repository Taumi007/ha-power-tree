"""Einrichtung: legt ein leeres Stromnetz an, bearbeitet wird im Panel."""

from __future__ import annotations

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult

from .const import DOMAIN


class StromnetzConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="Stromnetz", data={})
        return self.async_show_form(step_id="user")
