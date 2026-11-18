# /// script
# requires-python = ">=3.12"
# dependencies = ["pyyaml"]
# ///
"""Erzeugt Mock-Daten für tests/harness aus dem Beispielhaus: desc.json (wie stromnetz/get),
states.json und shelly.json."""
import importlib.util, json, random, sys, types
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1] / "custom_components" / "stromnetz"
pkg = types.ModuleType("sn"); pkg.__path__ = [str(ROOT)]; sys.modules["sn"] = pkg
for name in ("model",):
    spec = importlib.util.spec_from_file_location(f"sn.{name}", ROOT / f"{name}.py")
    mod = importlib.util.module_from_spec(spec); sys.modules[f"sn.{name}"] = mod; spec.loader.exec_module(mod)
from sn.model import Netz
here = Path(__file__).parent
sys.path.insert(0, str(here))
import example_house  # erfundenes Beispielhaus, keine echten Daten
data, areas, floors = example_house.build(), example_house.AREAS, example_house.FLOORS
(here / "harness" / "shelly.json").write_text(json.dumps(example_house.shelly(), ensure_ascii=False, indent=1))
netz = Netz(data, areas, floors)
defs = netz.sensors()
random.seed(1)
states = {}
# Blätter zufällig, Eltern = Summe der Kinder + etwas Rest
def val(nid):
    kids = netz.nearest_metered(netz.children.get(nid, []))
    own = random.uniform(0, 40)
    return own + sum(val(k) for k in kids if not netz.nodes[k]["feed_in"])
for nid, n in netz.nodes.items():
    if n["meter"]:
        states[n["meter"]] = {"state": f"{val(nid):.1f}", "attributes": {"friendly_name": n["meter"].split(".")[1].replace("_", " ").title(), "device_class": "power", "unit_of_measurement": "W"}}
for p, g in data["grid"]["phases"].items():
    if g.get("meter"):
        tot = sum(float(states[netz.nodes[k]["meter"]]["state"]) for k in netz.grid_children(p))
        states[g["meter"]] = {"state": f"{tot + 80:.1f}", "attributes": {"friendly_name": f"Netz {p}", "device_class": "power", "unit_of_measurement": "W"}}
sf = lambda e: float(states[e]["state"]) if e in states else None
prefix = data["settings"]["prefix"]
sensors, groups = {}, []
for d in defs:
    eid = f"sensor.{prefix}{d.key}"
    v = d.value(sf)
    states[eid] = {"state": "unknown" if v is None else str(v), "attributes": {"friendly_name": d.name, "unit_of_measurement": "W"}}
    if d.node: sensors.setdefault(d.node, {})[d.role] = eid
    elif d.role == "gruppe" or d.attrs.get("gruppe"):
        groups.append({"entity_id": eid, "name": d.name, **{k: v for k, v in d.attrs.items() if k in ("gruppe", "raum", "stockwerk", "phase", "kasten")}})
    else: sensors.setdefault(f"grid:{d.attrs.get('phase')}", {})[d.role] = eid
for n in netz.nodes.values():
    if n["switch"]:
        states[n["switch"]] = {"state": "on", "attributes": {"friendly_name": n["name"] or n["switch"]}}
desc = {"data": netz.data, "addresses": netz.addresses, "errors": netz.errors, "warnings": netz.warnings, "sensors": sensors, "groups": groups, "areas": areas, "floors": floors}
(here / "harness" / "desc.json").write_text(json.dumps(desc, ensure_ascii=False))
(here / "harness" / "states.json").write_text(json.dumps(states, ensure_ascii=False))
print(len(states), "States,", len(defs), "Sensoren")
