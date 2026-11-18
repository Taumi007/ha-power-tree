"""Berechnete Bilanz-Sensoren (Sonstiges, Summen, Gruppen)."""

from __future__ import annotations

import logging
import re

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import UnitOfPower
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers import area_registry as ar, device_registry as dr, entity_registry as er
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
    main = DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name="Stromnetz",
                      entry_type=DeviceEntryType.SERVICE, manufacturer="Stromnetz")
    ent_reg = er.async_get(hass)
    dev_reg = dr.async_get(hass)

    # Eigene Geräte für Töpfe (ohne Bereich) und gemessene Abgänge (Name und Bereich vom Messgerät).
    # Vorab anlegen, damit HA den Bereich schon beim Erzeugen der entity_id kennt.
    # Messgeräte, die mehrere Abgänge messen (z. B. Emporia Vue ohne Untergeräte): Name/Bereich vom Knoten
    per_device: dict[str, set] = {}
    for d in defs:
        if d.device and d.device["kind"] == "knoten" and d.device.get("meter"):
            ent = ent_reg.async_get(d.device["meter"])
            if ent and ent.device_id:
                per_device.setdefault(ent.device_id, set()).add(d.device["key"])
    shared = {dev_id for dev_id, keys in per_device.items() if len(keys) > 1}

    devices: dict[str, tuple[DeviceInfo, dr.DeviceEntry]] = {}
    for d in defs:
        if not d.device:
            continue
        ident = f"{entry.entry_id}_{d.device['kind']}_{d.device['key']}"
        if ident in devices:
            continue
        name, area = _device_name_area(hass, d.device, shared)
        info = DeviceInfo(identifiers={(DOMAIN, ident)}, name=name, manufacturer="Stromnetz",
                          model="Topf" if d.device["kind"] == "topf" else "Abgang",
                          entry_type=DeviceEntryType.SERVICE if d.device["kind"] == "topf" else None)
        dev = dev_reg.async_get_or_create(config_entry_id=entry.entry_id, **info)
        changes = {}
        if dev.name != name:
            changes["name"] = name
        if d.device["kind"] == "knoten" and dev.area_id != area:
            changes["area_id"] = area
        if changes:
            dev = dev_reg.async_update_device(dev.id, **changes)
        devices[ident] = (info, dev)

    entities = []
    for d in defs:
        if d.device:
            info, dev = devices[f"{entry.entry_id}_{d.device['kind']}_{d.device['key']}"]
            _migrate_entity_id(hass, ent_reg, d, dev, prefix)
            entities.append(StromnetzSensor(d, prefix, info))
        else:
            entities.append(StromnetzSensor(d, prefix, main))

    # Sensoren und Geräte, die es im Netz nicht mehr gibt, aus den Registries entfernen
    wanted = {e.unique_id for e in entities}
    for ent in er.async_entries_for_config_entry(ent_reg, entry.entry_id):
        if ent.unique_id not in wanted:
            ent_reg.async_remove(ent.entity_id)
    wanted_devs = {entry.entry_id, *devices}
    for dev in dr.async_entries_for_config_entry(dev_reg, entry.entry_id):
        if not any(i[0] == DOMAIN and i[1] in wanted_devs for i in dev.identifiers):
            dev_reg.async_remove_device(dev.id)

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


def _device_name_area(hass: HomeAssistant, spec: dict, shared: set) -> tuple[str, str | None]:
    """Topf: Name des Topfs, kein Bereich. Abgang: Gerätename (ohne Bereich) und Bereich des Messgeräts.

    Misst ein HA-Gerät mehrere Abgänge, gelten Name und Bereich des Knotens."""
    if spec["kind"] == "topf":
        return spec["name"], None
    name, area = spec["name"], spec["area"]
    ent = er.async_get(hass).async_get(spec["meter"]) if spec.get("meter") else None
    dev = dr.async_get(hass).async_get(ent.device_id) if ent and ent.device_id else None
    if dev and dev.id not in shared:
        name = dev.name_by_user or dev.name or name
        area = dev.area_id or area
        if ent.area_id:
            area = ent.area_id
    # Bereichsnamen im Gerätenamen weglassen, HA stellt ihn ohnehin voran
    if area and (a := ar.async_get(hass).async_get_area(area)):
        stripped = " ".join(re.sub(rf"(^|\s){re.escape(a.name)}(?=\s|$)", " ", name).split())
        name = stripped or name
    return name, area


@callback
def _migrate_entity_id(hass: HomeAssistant, ent_reg: er.EntityRegistry, d: SensorDef,
                       dev: dr.DeviceEntry, prefix: str) -> None:
    """Bestehende Einträge mit alter fester ID (sensor.<prefix><key>) auf die HA-Namenslogik umstellen."""
    old = ent_reg.async_get_entity_id("sensor", DOMAIN, d.key)
    if old is None or old != f"sensor.{prefix}{d.key}":
        return
    parts = [dev.name, d.short]
    if d.device["kind"] == "knoten" and dev.area_id and (area := ar.async_get(hass).async_get_area(dev.area_id)):
        parts.insert(0, area.name)
    new = ent_reg.async_get_available_entity_id("sensor", " ".join(p for p in parts if p),
                                                current_entity_id=old)
    ent_reg.async_update_entity(old, new_entity_id=new, device_id=dev.id)
    _LOGGER.info("Stromnetz: %s -> %s", old, new)


class StromnetzSensor(SensorEntity):
    _attr_should_poll = False
    _attr_device_class = SensorDeviceClass.POWER
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_native_unit_of_measurement = UnitOfPower.WATT
    _attr_suggested_display_precision = 1

    def __init__(self, definition: SensorDef, prefix: str, device: DeviceInfo) -> None:
        self.definition = definition
        self._attr_unique_id = definition.key
        self._attr_icon = ROLE_ICON.get(definition.role)
        self._attr_device_info = device
        if definition.device:
            # entity_id erzeugt HA aus Bereich + Gerät + Entität
            self._attr_has_entity_name = True
            self._attr_name = definition.short
        else:
            self._attr_name = definition.name
            self.entity_id = f"sensor.{prefix}{definition.key}"
        self._attr_extra_state_attributes = {"rolle": definition.role, **{
            k: v for k, v in definition.attrs.items() if v is not None}}

    async def async_added_to_hass(self) -> None:
        self.recalculate()
        dev = self.definition.device
        if dev and dev["kind"] == "topf" and dev["area"] and self.registry_entry \
                and self.registry_entry.area_id is None:
            # Topf-Gerät bleibt ohne Bereich, die Entitäten selbst gehören in den Bereich
            er.async_get(self.hass).async_update_entity(self.entity_id, area_id=dev["area"])

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
