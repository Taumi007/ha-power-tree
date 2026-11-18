"""Datenmodell, Validierung, Adressen und Bilanz des Stromnetzes.

Bewusst ohne Home-Assistant-Import, damit es sich eigenständig testen lässt.

Gespeicherte Struktur (Version 1):

    settings   prefix, name_prefix, colors
    grid       name, pot, phases: {A|B|C: {id, name, meter}}
    pots       eigene Bilanz-Töpfe neben den HA-Areas: key -> {name, floor}
    cabinets   [{id, code, name, area, feed, rows, width, notes}]
               feed = Knoten-ID der speisenden Sicherung (Unterverteiler), sonst None
    modules    [{id, cabinet, row, slot, width, type, label, model, poles,
                 rating, curve, rcd, rcd_ma, notes}]
               Hutschienengerät. Jeder Kanal/Pol ist ein eigener Knoten (node.module + node.channel).
    nodes      [{id, parent, kind, name, seq, label, phase, module, channel, meter,
                 switch, area, feed_in, sonstiges_id, notes, pos, collapsed}]
               parent = Knoten-ID, "grid" (direkt an der Hauszuleitung) oder None (nicht verbunden)

Rechenregel (wie bisher in generate.py):
    Rest(Knoten)   = Zähler − Σ nächste gemessene Kinder (+ Einspeisung)
    Gruppe         = Σ Rest aller gemessenen Knoten der Gruppe (Area/Topf, Stockwerk, Phase)
    Area Sonstiges = Σ Rest der Knoten der Area mit gemessenen Kindern
"""

from __future__ import annotations

import copy
import re
from dataclasses import dataclass, field

GRID = "grid"
PHASES = ("A", "B", "C")
PHASE_LABEL = {"A": "L1", "B": "L2", "C": "L3", "N": "N"}
NEUTRAL = "N"  # Neutralleiter, z. B. als vierter Kanal eines FI; zählt in keiner Phasen-Bilanz
NODE_KINDS = ("breaker", "rcd", "relay", "junction", "outlet", "fixed", "appliance", "unknown")
MODULE_TYPES = ("breaker", "rcd", "rcbo", "relay", "meter", "other")
CURVES = ("B", "C", "D", "K", "Z")
# Buchstabe des Adress-Segments je Knotenart (ohne Hutschienengerät)
KIND_LETTER = {"outlet": "X", "junction": "A", "fixed": "E", "appliance": "G",
               "unknown": "U", "breaker": "F", "relay": "K", "rcd": "Q"}
ENTITY_RE = re.compile(r"^[a-z_]+\.[a-z0-9_]+$")
ID_RE = re.compile(r"^[a-z0-9_]+$")
CODE_RE = re.compile(r"^[A-Za-z0-9]+$")

DEFAULT_COLORS = {"A": "#c08a5b", "B": "#5b8fb0", "C": "#8e7cc3", "N": "#7d8a96"}


class ModelError(Exception):
    """Fehler im Netz, der das Speichern verhindert."""


def empty() -> dict:
    return {
        "version": 1,
        "settings": {"prefix": "stromnetz_", "name_prefix": "Stromnetz ", "colors": dict(DEFAULT_COLORS)},
        "grid": {"name": "Netzanschluss", "pot": None,
                 "phases": {p: {"id": f"netz_phase_{p.lower()}", "name": f"Hauszuleitung Phase {p}", "meter": None}
                            for p in PHASES}},
        "pots": {},
        "cabinets": [],
        "modules": [],
        "nodes": [],
    }


def slug(text: str) -> str:
    text = text.lower()
    for a, b in (("ä", "a"), ("ö", "o"), ("ü", "u"), ("ß", "ss")):
        text = text.replace(a, b)
    return re.sub(r"[^a-z0-9]+", "_", text).strip("_")


def normalize(data: dict) -> dict:
    """Fehlende Felder ergänzen und Laufnummern vergeben. Gibt eine Kopie zurück."""
    d = copy.deepcopy(data)
    base = empty()
    for key, val in base.items():
        d.setdefault(key, val)
    for key, val in base["settings"].items():
        d["settings"].setdefault(key, val)
    for key, val in DEFAULT_COLORS.items():
        d["settings"]["colors"].setdefault(key, val)
    for p in PHASES:
        d["grid"].setdefault("phases", {}).setdefault(p, base["grid"]["phases"][p])
    for c in d["cabinets"]:
        c.setdefault("rows", 4)
        c.setdefault("width", 16)
        c.setdefault("feed", None)
        c.setdefault("area", None)
        c.setdefault("notes", None)
    for m in d["modules"]:
        for f in ("row", "slot", "label", "model", "poles", "rating", "curve", "rcd", "rcd_ma", "notes", "device"):
            m.setdefault(f, None)
        m.setdefault("width", 1)
        m.setdefault("type", "breaker")
    for n in d["nodes"]:
        for f in ("name", "seq", "label", "phase", "module", "channel", "meter", "switch",
                  "area", "sonstiges_id", "notes", "pos", "device", "device_channel", "model"):
            n.setdefault(f, None)
        n.setdefault("parent", None)
        n.setdefault("kind", "junction")
        n.setdefault("feed_in", False)
        n.setdefault("collapsed", False)
    # Laufnummern: je Elternknoten und Buchstabe fortlaufend, vorhandene bleiben stabil
    used: dict[tuple, set] = {}
    for n in d["nodes"]:
        if n["seq"] is not None:
            used.setdefault((n["parent"], KIND_LETTER.get(n["kind"], "A")), set()).add(n["seq"])
    for n in d["nodes"]:
        if n["seq"] is None and not n["module"]:
            key = (n["parent"], KIND_LETTER.get(n["kind"], "A"))
            s = used.setdefault(key, set())
            n["seq"] = max(s, default=0) + 1
            s.add(n["seq"])
    return d


@dataclass
class SensorDef:
    """Ein berechneter Sensor: Wert = Σ plus − Σ minus."""

    key: str                       # object_id ohne Präfix, zugleich unique_id-Basis
    name: str
    role: str                      # rest | summe | verbraucher | gruppe
    plus: list[str]
    minus: list[str] = field(default_factory=list)
    node: str | None = None
    attrs: dict = field(default_factory=dict)
    # Eigenes HA-Gerät statt "Stromnetz": {"kind": "topf"|"knoten", "key", "name", "area", "meter"}
    device: dict | None = None
    short: str | None = None       # Entitätsname am eigenen Gerät (z. B. "Verbraucher Leistung")

    @property
    def sources(self) -> list[str]:
        return self.plus + self.minus

    def value(self, state_of) -> float | None:
        """state_of(entity_id) -> float | None"""
        if self.role == "rest":
            first = state_of(self.plus[0]) if self.plus else None
            if first is None:
                return None
        vals_p = [state_of(e) for e in self.plus]
        vals_m = [state_of(e) for e in self.minus]
        if self.role in ("summe", "verbraucher"):
            nums = [v for v in vals_p if v is not None]
            return round(sum(nums), 1) if nums else None
        total = sum(v or 0.0 for v in vals_p) - sum(v or 0.0 for v in vals_m)
        return max(round(total, 1), 0.0)


class Netz:
    """Aufgelöstes Netz: Validierung, Vererbung, Adressen und Sensoren."""

    def __init__(self, data: dict, areas: dict | None = None, floors: dict | None = None):
        """areas: area_id -> {"name", "floor"}; floors: floor_id -> name (beides aus HA)."""
        self.data = normalize(data)
        self.areas = areas or {}
        self.floors = floors or {}
        self.errors: list[str] = []
        self.warnings: list[str] = []
        d = self.data
        self.settings = d["settings"]
        self.cabinets = {c["id"]: c for c in d["cabinets"]}
        self.modules = {m["id"]: m for m in d["modules"]}
        self.nodes = {n["id"]: n for n in d["nodes"]}
        self.children: dict[str | None, list[str]] = {}
        for n in d["nodes"]:
            self.children.setdefault(n["parent"], []).append(n["id"])
        self._validate()
        if not self.errors:
            self.addresses = {nid: self._address(nid) for nid in self.nodes}
            dup = {}
            for nid, a in self.addresses.items():
                dup.setdefault(a, []).append(nid)
            for a, ids in dup.items():
                if len(ids) > 1:
                    self.errors.append(f"Adresse {a} doppelt: {', '.join(ids)}")
        else:
            self.addresses = {}

    # ── Validierung ──────────────────────────────────────────────────────────
    def _validate(self) -> None:
        err = self.errors.append
        d = self.data
        if len(self.cabinets) != len(d["cabinets"]):
            err("Kasten-IDs doppelt")
        codes = [c.get("code") for c in d["cabinets"]]
        for c in d["cabinets"]:
            if not c.get("code") or not CODE_RE.match(c["code"]):
                err(f"Kasten {c['id']}: Kürzel fehlt oder enthält Sonderzeichen")
            elif codes.count(c["code"]) > 1:
                err(f"Kasten-Kürzel {c['code']} doppelt")
            if c["feed"] is not None and c["feed"] not in self.nodes:
                err(f"Kasten {c['code']}: speisender Knoten {c['feed']} fehlt")
        if len(self.modules) != len(d["modules"]):
            err("Modul-IDs doppelt")
        occupied: dict[tuple, str] = {}
        for m in d["modules"]:
            if m["cabinet"] not in self.cabinets:
                err(f"Modul {m['id']}: Kasten {m['cabinet']} fehlt")
                continue
            if m["type"] not in MODULE_TYPES:
                err(f"Modul {m['id']}: Typ {m['type']} unbekannt")
            if m["curve"] not in (None, *CURVES):
                err(f"Modul {m['label'] or m['id']}: Charakteristik {m['curve']} unbekannt")
            if m["rcd"] is not None and m["rcd"] not in self.modules:
                err(f"Modul {m['label'] or m['id']}: FI {m['rcd']} fehlt")
            if m["row"] is not None and m["slot"] is not None:
                cab = self.cabinets[m["cabinet"]]
                for i in range(int(m["width"] or 1)):
                    key = (m["cabinet"], m["row"], m["slot"] + i)
                    if m["slot"] + i >= cab["width"] or m["row"] >= cab["rows"]:
                        err(f"Modul {m['label'] or m['id']} ragt aus Kasten {cab['code']}")
                        break
                    if key in occupied:
                        err(f"Modul {m['label'] or m['id']} überlappt {occupied[key]}")
                        break
                    occupied[key] = m["label"] or m["id"]
            labels = [x["label"] for x in d["modules"] if x["cabinet"] == m["cabinet"] and x["label"]]
            if m["label"] and labels.count(m["label"]) > 1:
                err(f"Bezeichnung {m['label']} im Kasten {self.cabinets[m['cabinet']]['code']} doppelt")
        if len(self.nodes) != len(d["nodes"]):
            err("Knoten-IDs doppelt")
        meters: dict[str, str] = {}
        for p, g in d["grid"]["phases"].items():
            if p not in PHASES:
                err(f"Netz: Phase {p} unbekannt")
            if g.get("meter"):
                meters[g["meter"]] = f"Netz {p}"
        for n in d["nodes"]:
            nid = n["id"]
            if not ID_RE.match(nid) or nid == GRID:
                err(f"Knoten-ID {nid!r} ungültig")
            if n["kind"] not in NODE_KINDS:
                err(f"{nid}: Art {n['kind']} unbekannt")
            if n["parent"] not in (None, GRID) and n["parent"] not in self.nodes:
                err(f"{nid}: Elternknoten {n['parent']} fehlt")
            if n["phase"] not in (None, *PHASES, NEUTRAL):
                err(f"{nid}: Phase {n['phase']} unbekannt")
            if n["module"] is not None and n["module"] not in self.modules:
                err(f"{nid}: Modul {n['module']} fehlt")
            for f in ("meter", "switch"):
                if n[f] and not ENTITY_RE.match(n[f]):
                    err(f"{nid}: {f} {n[f]} ist keine entity_id")
            if n["meter"]:
                if n["meter"] in meters:
                    err(f"Zähler {n['meter']} doppelt: {meters[n['meter']]} und {nid}")
                meters[n["meter"]] = nid
            if n["feed_in"] and self.children.get(nid):
                err(f"{nid}: Einspeisung darf keine Kinder haben")
            if n["parent"] is None and not n["module"]:
                self.warnings.append(f"{nid} ({n['name'] or n['meter'] or 'ohne Namen'}) hängt nirgends – im Fluss unter »Nicht verbunden«")
            if n["area"] is not None and n["area"] not in self.areas and n["area"] not in d["pots"]:
                self.warnings.append(f"{nid}: Area {n['area']} unbekannt")
        # Zyklen
        for nid in self.nodes:
            seen, k = set(), nid
            while k not in (None, GRID):
                if k in seen:
                    err(f"Zyklus bei {nid}")
                    break
                seen.add(k)
                k = self.nodes[k]["parent"] if k in self.nodes else None
        # Kanäle eines Moduls eindeutig
        chans: dict[tuple, str] = {}
        for n in d["nodes"]:
            if n["module"]:
                key = (n["module"], n["channel"])
                if key in chans:
                    err(f"Modul {n['module']}: Kanal {n['channel']} doppelt ({chans[key]}, {n['id']})")
                chans[key] = n["id"]

    # ── Vererbung ────────────────────────────────────────────────────────────
    def ancestors(self, nid: str):
        k = self.nodes[nid]["parent"]
        while k not in (None, GRID):
            yield k
            k = self.nodes[k]["parent"]

    def inherit(self, nid: str, f: str):
        if self.nodes[nid][f] is not None:
            return self.nodes[nid][f]
        for a in self.ancestors(nid):
            if self.nodes[a][f] is not None:
                return self.nodes[a][f]
        return None

    def phase(self, nid: str) -> str | None:
        return self.inherit(nid, "phase")

    def area(self, nid: str) -> str | None:
        return self.inherit(nid, "area")

    def floor(self, area: str | None) -> str | None:
        if area is None:
            return None
        if area in self.data["pots"]:
            return self.data["pots"][area].get("floor")
        return self.areas.get(area, {}).get("floor")

    def area_name(self, area: str) -> str:
        if area in self.data["pots"]:
            return self.data["pots"][area].get("name") or area
        return self.areas.get(area, {}).get("name") or area

    def cabinet_of(self, nid: str) -> str | None:
        """Kasten des Knotens oder seines nächsten Vorfahren mit Modul."""
        for k in (nid, *self.ancestors(nid)):
            m = self.nodes[k]["module"]
            if m:
                return self.modules[m]["cabinet"]
        return None

    def display_name(self, nid: str) -> str:
        n = self.nodes[nid]
        return n["name"] or (n["meter"] or nid).split(".")[-1].removesuffix("_leistung").replace("_", " ")

    # ── Adressen ─────────────────────────────────────────────────────────────
    def _address(self, nid: str) -> str:
        n = self.nodes[nid]
        if n["module"]:
            m = self.modules[n["module"]]
            cab = self.cabinets[m["cabinet"]]
            base = f"{cab['code']}-{m['label'] or m['id']}"
            siblings = [x for x in self.data["nodes"] if x["module"] == m["id"]]
            if len(siblings) > 1 or (m["type"] == "relay" and (m["poles"] or 1) > 1):
                if m["type"] in ("breaker", "rcbo", "rcd", "meter") and n["phase"]:
                    return f"{base}.{PHASE_LABEL[n['phase']]}"
                return f"{base}.{n['channel'] or 1}"
            return base
        seg = n["label"] or f"{KIND_LETTER.get(n['kind'], 'A')}{n['seq']}"
        if n["parent"] in (None, GRID):
            return seg
        return f"{self._address(n['parent'])}.{seg}"

    # ── Bilanz ───────────────────────────────────────────────────────────────
    def nearest_metered(self, nids) -> list[str]:
        out = []
        for c in nids:
            n = self.nodes[c]
            if n["meter"]:
                out.append(c)
            else:
                out.extend(self.nearest_metered(self.children.get(c, [])))
        return out

    def grid_children(self, phase: str) -> list[str]:
        roots = [r for r in self.children.get(GRID, []) if self.phase(r) == phase]
        return self.nearest_metered(roots)

    def _rest_coef(self, meter: str, kids: list[str]) -> dict:
        coef = {meter: 1}
        for c in kids:
            e = self.nodes[c]["meter"]
            coef[e] = coef.get(e, 0) + (1 if self.nodes[c]["feed_in"] else -1)
        return coef

    @staticmethod
    def _sum_coef(coefs: list[dict], what: str) -> tuple[list, list]:
        total: dict[str, int] = {}
        for c in coefs:
            for e, v in c.items():
                total[e] = total.get(e, 0) + v
        bad = {e: v for e, v in total.items() if v not in (-1, 0, 1)}
        if bad:
            raise ModelError(f"{what}: {', '.join(f'{e} {v:+d}-fach' for e, v in bad.items())} – Baum prüfen")
        return [e for e, v in total.items() if v == 1], [e for e, v in total.items() if v == -1]

    def metered_units(self) -> list[dict]:
        """Alle gemessenen Einheiten inkl. Netzphasen: {id, name, meter, kids, area, phase, node}."""
        units = []
        grid = self.data["grid"]
        for p in PHASES:
            g = grid["phases"].get(p) or {}
            if g.get("meter"):
                units.append({"id": g["id"], "name": g.get("name") or f"Phase {p}", "meter": g["meter"],
                              "kids": self.grid_children(p), "area": grid.get("pot"), "phase": p, "node": None})
        for nid, n in self.nodes.items():
            if n["meter"] and not n["feed_in"]:
                units.append({"id": nid, "name": self.display_name(nid), "meter": n["meter"],
                              "kids": self.nearest_metered(self.children.get(nid, [])),
                              "area": self.area(nid), "phase": self.phase(nid), "node": nid})
        return units

    def sensors(self) -> list[SensorDef]:
        if self.errors:
            raise ModelError("; ".join(self.errors))
        np = self.settings.get("name_prefix") or ""
        out: list[SensorDef] = []
        units = self.metered_units()

        def meta(u, **extra):
            nid = u["node"]
            return {"adresse": self.addresses.get(nid) if nid else f"{self.data['grid'].get('name')} {PHASE_LABEL.get(u['phase'], '')}".strip(),
                    "knoten": nid, "area": u["area"], "stockwerk": self.floor(u["area"]), "phase": u["phase"],
                    "kasten": (self.cabinets[self.cabinet_of(nid)]["code"] if nid and self.cabinet_of(nid) else None),
                    **extra}

        for u in units:
            if not u["kids"]:
                continue
            consumers = [self.nodes[c]["meter"] for c in u["kids"] if not self.nodes[c]["feed_in"]]
            dev = None
            if u["node"]:
                dev = {"kind": "knoten", "key": u["node"], "name": u["name"], "meter": u["meter"],
                       "area": u["area"] if u["area"] in self.areas else None}
            out.append(SensorDef(f"{u['id']}_verbraucher_leistung", f"{np}{u['name']} Verbraucher Leistung",
                                 "verbraucher", consumers, node=u["node"], attrs=meta(u, entity_id=consumers),
                                 device=dev, short="Verbraucher Leistung"))
            plus, minus = self._sum_coef([self._rest_coef(u["meter"], u["kids"])], u["name"])
            sid = (self.nodes[u["node"]]["sonstiges_id"] if u["node"] else None) or f"{u['id']}_sonstiges_leistung"
            out.append(SensorDef(sid, f"{np}{u['name']} Sonstiges Leistung", "rest", plus, minus,
                                 node=u["node"], attrs=meta(u, steckdose=u["meter"]),
                                 device=dev, short="Sonstiges Leistung"))

        # Ungemessene Knoten mit gemessenen Nachfahren: Summe (für Fluss und Sankey)
        for nid, n in self.nodes.items():
            if n["meter"] or n["feed_in"]:
                continue
            kids = [self.nodes[c]["meter"] for c in self.nearest_metered(self.children.get(nid, []))
                    if not self.nodes[c]["feed_in"]]
            if kids:
                u = {"node": nid, "area": self.area(nid), "phase": self.phase(nid)}
                out.append(SensorDef(f"{nid}_summe_leistung", f"{np}{self.display_name(nid)} Summe Leistung",
                                     "summe", kids, node=nid, attrs=meta(u, zaehler=kids)))

        # Kasten je Phase: Summe der obersten gemessenen Abgänge des Kastens
        for cid, cab in self.cabinets.items():
            for p in PHASES:
                tops = [nid for nid, n in self.nodes.items()
                        if n["module"] and self.modules[n["module"]]["cabinet"] == cid and self.phase(nid) == p
                        and not any(self.nodes[a]["module"] and self.modules[self.nodes[a]["module"]]["cabinet"] == cid
                                    for a in self.ancestors(nid))]
                kids = [self.nodes[c]["meter"] for c in self.nearest_metered(tops) if not self.nodes[c]["feed_in"]]
                if kids:
                    out.append(SensorDef(f"{cid}_phase_{p.lower()}_summe_leistung",
                                         f"{np}{cab['name']} Phase {p} Summe Leistung", "summe", kids,
                                         attrs={"kasten": cab["code"], "phase": p, "gruppe": "kasten", "zaehler": kids}))

        # Gruppen
        groups: dict[tuple, list] = {}
        for u in units:
            for art, key in (("raum", u["area"]), ("stockwerk", self.floor(u["area"])),
                             ("phase", u["phase"] if u["phase"] in PHASES else None)):
                if key is not None:
                    groups.setdefault((art, key), []).append(u)
        order = {"raum": 0, "stockwerk": 1, "phase": 2}
        for (art, key), us in sorted(groups.items(), key=lambda kv: (order[kv[0][0]], kv[0][1])):
            if art == "raum":
                oid, name = f"{key}_leistung", self.area_name(key)
                extra = {"raum": key, "stockwerk": self.floor(key)}
            elif art == "stockwerk":
                oid, name = f"stockwerk_{key}_leistung", f"Stockwerk {self.floors.get(key, key)}"
                extra = {"stockwerk": key}
            else:
                oid, name = f"phase_{key.lower()}_leistung", f"Phase {key}"
                extra = {"phase": key}
            plus, minus = self._sum_coef([self._rest_coef(u["meter"], u["kids"]) for u in us], name)
            topf = ({"kind": "topf", "key": key, "name": name, "area": key if key in self.areas else None}
                    if art == "raum" else None)
            out.append(SensorDef(oid, f"{np}{name} Leistung", "gruppe", plus, minus,
                                 attrs={"gruppe": art, **extra, "plus": plus, "minus": minus},
                                 device=topf, short="Leistung" if topf else None))
            if art == "raum":
                with_kids = [u for u in us if u["kids"]]
                if with_kids:
                    plus, minus = self._sum_coef([self._rest_coef(u["meter"], u["kids"]) for u in with_kids], name)
                    out.append(SensorDef(f"{key}_sonstiges_leistung", f"{np}{name} Sonstiges Leistung", "gruppe",
                                         plus, minus, attrs={"gruppe": "raum_sonstiges", **extra},
                                         device=topf, short="Sonstiges Leistung"))
        keys = [s.key for s in out]
        dup = sorted({k for k in keys if keys.count(k) > 1})
        if dup:
            raise ModelError(f"Erzeugte Sensoren kollidieren: {', '.join(dup)}")
        return out

    def summary(self) -> dict:
        """Abgeleitete Werte für das Panel."""
        return {"addresses": self.addresses, "errors": self.errors, "warnings": self.warnings}
