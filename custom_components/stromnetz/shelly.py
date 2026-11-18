"""Shelly-Geräte aus Home Assistant lesen und auf Kanäle abbilden.

Die Shelly-Integration legt bei Mehrkanalgeräten pro Kanal ein Untergerät an (via_device).
Jede Entity trägt Komponente und Kanal in der unique_id, z. B.
    D48AFC78CF98-switch:0          Schalter Kanal 0
    D48AFC78CF98-switch:0-power    Leistung Kanal 0
    ...-em:0-a_act_power           Pro 3EM, Phase A
    ...-em1:1-act_power            Pro EM / EM Gen3, Messkanal 1
    ...-pm1:0-power                PM Mini, Messkanal 0
"""

from __future__ import annotations

import re
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

SHELLY = "shelly"
KEY_RE = re.compile(r"-(switch|cover|light|pm1|em1|em|rgb|rgbw)(?::(\d+))?(?:-(.+))?$")
POWER_SUFFIX = ("power", "act_power", "a_act_power", "b_act_power", "c_act_power")


def _channel(unique_id: str) -> tuple[str, int, str] | None:
    """(Komponente, Kanal, Attribut) aus der unique_id; beim 3EM wird Phase a/b/c zu Kanal 0/1/2."""
    m = KEY_RE.search(unique_id or "")
    if not m:
        return None
    comp, idx, attr = m.group(1), int(m.group(2) or 0), m.group(3) or ""
    if comp == "em" and attr[:2] in ("a_", "b_", "c_"):
        return comp, "abc".index(attr[0]), attr[2:]
    return comp, idx, attr


def shelly_devices(hass: HomeAssistant) -> list[dict[str, Any]]:
    dev_reg, ent_reg = dr.async_get(hass), er.async_get(hass)
    entry_ids = {e.entry_id for e in hass.config_entries.async_entries(SHELLY)}
    devices = [d for d in dev_reg.devices.values() if d.config_entries & entry_ids]
    by_id = {d.id: d for d in devices}

    def root(d):
        while d.via_device_id and d.via_device_id in by_id:
            d = by_id[d.via_device_id]
        return d

    out: dict[str, dict] = {}
    for d in devices:
        r = root(d)
        info = out.setdefault(r.id, {
            "device_id": r.id, "name": r.name_by_user or r.name, "model": r.model, "model_id": r.model_id,
            "area_id": r.area_id, "url": r.configuration_url, "sw": r.sw_version, "channels": {}, "entities": [],
        })
        for ent in er.async_entries_for_device(ent_reg, d.id):
            if ent.disabled_by:
                continue
            info["entities"].append(ent.entity_id)
            ch = _channel(ent.unique_id)
            if ch is None:
                continue
            comp, idx, attr = ch
            c = info["channels"].setdefault(idx, {"index": idx, "name": None, "switch": None, "power": None, "kind": None})
            if d.id != r.id:
                c["name"] = d.name_by_user or d.name
            if ent.domain in ("switch", "light", "cover") and not attr:
                c["switch"] = ent.entity_id
                c["kind"] = "relay"
            elif ent.domain == "sensor" and (ent.original_device_class or ent.device_class) == "power":
                # Kennungen variieren je Gerät: power, act_power, power_light (RGBW PM) …
                exact = attr in POWER_SUFFIX
                if exact or c["power"] is None or not c.get("_exact"):
                    c["power"] = ent.entity_id
                    c["_exact"] = exact
                c["kind"] = c["kind"] or ("meter" if comp in ("em", "em1", "pm1") else "relay")
    result = []
    for info in out.values():
        for c in info["channels"].values():
            c.pop("_exact", None)
        chans = [c for c in sorted(info["channels"].values(), key=lambda c: c["index"]) if c["switch"] or c["power"]]
        if not chans:
            continue
        info["channels"] = chans
        result.append(info)
    return sorted(result, key=lambda i: (i["model"] or "", i["name"] or ""))


def discovered(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Im Netzwerk gefundene, noch nicht eingerichtete Shellys (HA-Zeroconf-Entdeckungen)."""
    out = []
    for flow in hass.config_entries.flow.async_progress_by_handler(SHELLY):
        ctx = flow.get("context") or {}
        if ctx.get("source") in ("user", "reauth", "reconfigure"):
            continue
        ph = ctx.get("title_placeholders") or {}
        out.append({"flow_id": flow["flow_id"], "name": ph.get("name") or ctx.get("unique_id"),
                    "host": ph.get("host") or ctx.get("host"), "source": ctx.get("source")})
    return out
