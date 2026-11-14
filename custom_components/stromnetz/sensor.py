"""Berechnete Bilanz-Sensoren (Sonstiges, Summen, Gruppen)."""

from __future__ import annotations

import logging

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import UnitOfPower
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_state_change_event

from . import StromnetzConfigEntry
from .const import DOMAIN
from .model import ModelError, SensorDef

_LOGGER = logging.getLogger(__name__)
ROLE_ICON = {"rest": "mdi:help-circle-outline", "summe": "mdi:sigma", "verbraucher": "mdi:power-plug",
             "gruppe": "mdi:home-lightning-bolt-outline"}


async def async_setup_entry(hass: HomeAssistant, entry: StromnetzConfigEntry,
                            async_add_entities: AddEntitiesCallback) -> None:
    runtime = entry.runtime_data
    netz = runtime.netz(hass)
    try:
        defs = netz.sensors()
    except ModelError as err:
        _LOGGER.error("Stromnetz ungültig, keine Sensoren angelegt: %s", err)
        return
    prefix = runtime.data["settings"].get("prefix") or ""
    device = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Stromnetz",
                        entry_type=DeviceEntryType.SERVICE, manufacturer="Stromnetz")
    entities = [StromnetzSensor(d, prefix, device) for d in defs]

    # Sensoren, die es im Netz nicht mehr gibt, aus der Registry entfernen
    reg = er.async_get(hass)
    wanted = {e.unique_id for e in entities}
    for ent in er.async_entries_for_config_entry(reg, entry.entry_id):
        if ent.unique_id not in wanted:
            reg.async_remove(ent.entity_id)

    async_add_entities(entities)

    by_source: dict[str, list[StromnetzSensor]] = {}
    for ent in entities:
        for src in ent.definition.sources:
            by_source.setdefault(src, []).append(ent)

    @callback
    def changed(event: Event[EventStateChangedData]) -> None:
        for ent in by_source.get(event.data["entity_id"], []):
            if ent.hass is not None:
                ent.recalculate()
                ent.async_write_ha_state()

    if by_source:
        entry.async_on_unload(async_track_state_change_event(hass, list(by_source), changed))


class StromnetzSensor(SensorEntity):
    _attr_should_poll = False
    _attr_device_class = SensorDeviceClass.POWER
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_suggested_display_precision = 1

    def __init__(self, definition: SensorDef, prefix: str, device: DeviceInfo) -> None:
        self.definition = definition
        self._attr_unique_id = definition.key
        self._attr_name = definition.name
        self._attr_icon = ROLE_ICON.get(definition.role)
        self._attr_device_info = device
        self.entity_id = f"sensor.{prefix}{definition.key}"
        self._attr_extra_state_attributes = {"rolle": definition.role, **{
            k: v for k, v in definition.attrs.items() if v is not None}}

    async def async_added_to_hass(self) -> None:
        self.recalculate()

    def _state_of(self, entity_id: str) -> float | None:
        st = self.hass.states.get(entity_id)
        if st is None:
            return None
        try:
            return float(st.state)
        except (TypeError, ValueError):
            return None

    @callback
    def recalculate(self) -> None:
        self._attr_native_value = self.definition.value(self._state_of)
