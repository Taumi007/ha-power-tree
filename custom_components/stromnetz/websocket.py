"""WebSocket-API für das Panel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
import yaml

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN
from .model import ModelError, normalize


def _entry(hass: HomeAssistant):
    entries = hass.config_entries.async_loaded_entries(DOMAIN)
    return entries[0] if entries else None


def _describe(hass: HomeAssistant, entry, data: dict) -> dict[str, Any]:
    """Daten plus abgeleitete Werte (Adressen, Fehler, Sensor-Zuordnung)."""
    from . import registries

    areas, floors = registries(hass)
    netz = entry.runtime_data.netz(hass, data)
    sensors: dict[str, dict] = {}
    groups: list[dict] = []
    error = None
    if not netz.errors:
        try:
            defs = netz.sensors()
        except ModelError as err:
            error = str(err)
            defs = []
        reg = er.async_get(hass)
        prefix = netz.settings.get("prefix") or ""
        for d in defs:
            eid = reg.async_get_entity_id("sensor", DOMAIN, d.key) or f"sensor.{prefix}{d.key}"
            if d.node:
                sensors.setdefault(d.node, {})[d.role] = eid
            elif d.role == "gruppe" or d.attrs.get("gruppe"):
                groups.append({"entity_id": eid, "name": d.name, **{k: v for k, v in d.attrs.items()
                                                                       if k in ("gruppe", "raum", "stockwerk", "phase", "kasten")}})
            elif d.key.endswith("_sonstiges_leistung") or d.key.endswith("_verbraucher_leistung"):
                sensors.setdefault(f"grid:{d.attrs.get('phase')}", {})[d.role] = eid
    return {"data": netz.data, "addresses": netz.addresses, "errors": netz.errors + ([error] if error else []),
            "warnings": netz.warnings, "sensors": sensors, "groups": groups,
            "areas": areas, "floors": floors}


@websocket_api.websocket_command({vol.Required("type"): "stromnetz/get"})
@callback
def ws_get(hass: HomeAssistant, connection, msg) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Stromnetz ist nicht eingerichtet")
        return
    connection.send_result(msg["id"], _describe(hass, entry, entry.runtime_data.data))


@websocket_api.websocket_command({vol.Required("type"): "stromnetz/validate", vol.Required("data"): dict})
@callback
def ws_validate(hass: HomeAssistant, connection, msg) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Stromnetz ist nicht eingerichtet")
        return
    connection.send_result(msg["id"], _describe(hass, entry, msg["data"]))


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): "stromnetz/save", vol.Required("data"): dict})
@websocket_api.async_response
async def ws_save(hass: HomeAssistant, connection, msg) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Stromnetz ist nicht eingerichtet")
        return
    data = normalize(msg["data"])
    desc = _describe(hass, entry, data)
    if desc["errors"]:
        connection.send_result(msg["id"], {"saved": False, **desc})
        return
    old = entry.runtime_data.data
    entry.runtime_data.data = desc["data"]
    await entry.runtime_data.store.async_save(desc["data"])
    if _structure(old) != _structure(desc["data"]):
        hass.config_entries.async_schedule_reload(entry.entry_id)
    connection.send_result(msg["id"], {"saved": True, **desc})


def _structure(data: dict) -> Any:
    """Alles, was Sensoren beeinflusst (ohne Positionen, Notizen, Einklappen)."""
    skip = {"pos", "collapsed", "notes"}
    return (data.get("settings", {}).get("prefix"), data.get("settings", {}).get("name_prefix"),
            data.get("grid"), data.get("pots"), data.get("cabinets"), data.get("modules"),
            [{k: v for k, v in n.items() if k not in skip} for n in data.get("nodes", [])])


@websocket_api.websocket_command({vol.Required("type"): "stromnetz/export_yaml"})
@callback
def ws_export(hass: HomeAssistant, connection, msg) -> None:
    entry = _entry(hass)
    if entry is None:
        connection.send_error(msg["id"], "not_loaded", "Stromnetz ist nicht eingerichtet")
        return
    text = yaml.safe_dump(entry.runtime_data.data, allow_unicode=True, sort_keys=False)
    connection.send_result(msg["id"], {"yaml": text})


@websocket_api.websocket_command({vol.Required("type"): "stromnetz/shelly"})
@callback
def ws_shelly(hass: HomeAssistant, connection, msg) -> None:
    """Shelly-Geräte aus HA mit Kanälen (Schalter, Leistung) und noch nicht eingerichtete Funde."""
    from .shelly import discovered, shelly_devices

    connection.send_result(msg["id"], {"devices": shelly_devices(hass), "discovered": discovered(hass)})


@callback
def async_register_commands(hass: HomeAssistant) -> None:
    for cmd in (ws_get, ws_validate, ws_save, ws_export, ws_shelly):
        websocket_api.async_register_command(hass, cmd)
