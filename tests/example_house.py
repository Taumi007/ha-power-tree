"""Erfundenes Beispielhaus für Tests und das Test-Harness (keine echten Daten).

Ein Hauptverteiler (HV) mit FI, LS, einem 3-poligen Herd-LS und einem Shelly Pro 4PM,
ein Unterverteiler (UV1) in der Garage, Steckdosen mit Zwischensteckern und Geräte.
"""

FLOORS = {"eg": "Erdgeschoss", "og": "Obergeschoss", "aussen": "Außenbereich"}

AREAS = {
    "flur": {"name": "Flur", "floor": "eg"},
    "kueche": {"name": "Küche", "floor": "eg"},
    "wohnzimmer": {"name": "Wohnzimmer", "floor": "eg"},
    "bad": {"name": "Bad", "floor": "og"},
    "schlafzimmer": {"name": "Schlafzimmer", "floor": "og"},
    "buero": {"name": "Büro", "floor": "og"},
    "garage": {"name": "Garage", "floor": "aussen"},
    "garten": {"name": "Garten", "floor": "aussen"},
}

SHELLY_DEV = "0000example0000pro4pm00000000001"


def _p(eid: str) -> str:
    return f"sensor.{eid}_leistung"


def build() -> dict:
    cab_hv, cab_uv = "hv", "uv1"
    modules = [
        {"id": "hv_fi1", "cabinet": cab_hv, "type": "rcd", "label": "FI1", "width": 4, "poles": 4,
         "row": 0, "slot": 0, "rating": 40, "rcd_ma": 30},
    ]
    for i, (rating, slot) in enumerate([(16, 4), (16, 5), (16, 6), (13, 7), (13, 8), (16, 9)], start=1):
        modules.append({"id": f"hv_f0{i}", "cabinet": cab_hv, "type": "breaker", "label": f"F0{i}",
                        "width": 1, "poles": 1, "row": 0, "slot": slot, "rating": rating, "curve": "B",
                        "rcd": "hv_fi1"})
    modules += [
        {"id": "hv_f07", "cabinet": cab_hv, "type": "breaker", "label": "F07", "width": 3, "poles": 3,
         "row": 1, "slot": 0, "rating": 16, "curve": "B", "model": "Herd 3-polig"},
        {"id": "hv_f08", "cabinet": cab_hv, "type": "breaker", "label": "F08", "width": 1, "poles": 1,
         "row": 1, "slot": 3, "rating": 16, "curve": "C"},
        {"id": "hv_k1", "cabinet": cab_hv, "type": "relay", "label": "K1", "width": 1, "poles": 4,
         "row": 1, "slot": 5, "model": "Shelly Pro 4PM", "device": SHELLY_DEV},
        {"id": "uv1_f01", "cabinet": cab_uv, "type": "rcbo", "label": "F01", "width": 2, "poles": 1,
         "row": 0, "slot": 0, "rating": 16, "curve": "B", "rcd_ma": 30},
        {"id": "uv1_f02", "cabinet": cab_uv, "type": "breaker", "label": "F02", "width": 1, "poles": 1,
         "row": 0, "slot": 2, "rating": 16, "curve": "B"},
    ]

    nodes = []

    def node(nid, parent, kind, name=None, **kw):
        nodes.append({"id": nid, "parent": parent, "kind": kind, "name": name, **kw})

    # Hauptverteiler: FI-Kanäle hängen am Netz, LS darunter
    node("hv_fi1_n", "grid", "rcd", "FI Wohnbereich", module="hv_fi1", channel=1, phase="A")
    node("kreis_kueche", "hv_fi1_n", "breaker", "Küche Arbeitsplatte", module="hv_f01", channel=1,
         phase="A", area="kueche", meter=_p("kueche_arbeitsplatte"))
    node("kueche_steckdose_links", "kreis_kueche", "outlet", "Steckdose Links", meter=_p("kueche_steckdose_links"))
    node("kueche_kaffeemaschine", "kueche_steckdose_links", "appliance", "Kaffeemaschine",
         meter=_p("kueche_kaffeemaschine"), switch="switch.kueche_kaffeemaschine")
    node("kueche_wasserkocher", "kueche_steckdose_links", "appliance", "Wasserkocher", meter=_p("kueche_wasserkocher"))
    node("kueche_kuehlschrank", "kreis_kueche", "fixed", "Kühlschrank", meter=_p("kueche_kuehlschrank"))

    node("kreis_wohnzimmer", "hv_fi1_n", "breaker", "Wohnzimmer", module="hv_f02", channel=1,
         phase="B", area="wohnzimmer", meter=_p("wohnzimmer_stromkreis"))
    node("wohnzimmer_steckdose_tv", "kreis_wohnzimmer", "outlet", "Steckdose TV", meter=_p("wohnzimmer_steckdose_tv"))
    node("wohnzimmer_fernseher", "wohnzimmer_steckdose_tv", "appliance", "Fernseher", meter=_p("wohnzimmer_fernseher"))
    node("wohnzimmer_lautsprecher", "wohnzimmer_steckdose_tv", "appliance", "Lautsprecher")
    node("wohnzimmer_stehleuchte", "kreis_wohnzimmer", "fixed", "Stehleuchte", meter=_p("wohnzimmer_stehleuchte"))

    node("kreis_bad", "hv_fi1_n", "breaker", "Bad", module="hv_f03", channel=1, phase="C", area="bad",
         meter=_p("bad_stromkreis"))
    node("bad_spiegelschrank", "kreis_bad", "fixed", "Spiegelschrank", meter=_p("bad_spiegelschrank"))
    node("bad_waschmaschine", "kreis_bad", "appliance", "Waschmaschine", meter=_p("bad_waschmaschine"))

    node("kreis_schlafzimmer", "hv_fi1_n", "breaker", "Schlafzimmer", module="hv_f04", channel=1,
         phase="A", area="schlafzimmer")
    node("schlafzimmer_steckdose_bett", "kreis_schlafzimmer", "outlet", "Steckdose Bett",
         meter=_p("schlafzimmer_steckdose_bett"))
    node("schlafzimmer_leselampe", "schlafzimmer_steckdose_bett", "appliance", "Leselampe")

    node("kreis_buero", "hv_fi1_n", "breaker", "Büro", module="hv_f05", channel=1, phase="B", area="buero",
         meter=_p("buero_stromkreis"))
    node("buero_steckdose_schreibtisch", "kreis_buero", "outlet", "Steckdose Schreibtisch",
         meter=_p("buero_steckdose_schreibtisch"))
    node("buero_pc", "buero_steckdose_schreibtisch", "appliance", "PC", meter=_p("buero_pc"))
    node("buero_monitor", "buero_steckdose_schreibtisch", "appliance", "Monitor", meter=_p("buero_monitor"))
    node("buero_drucker", "kreis_buero", "appliance", "Drucker")

    node("kreis_flur", "hv_fi1_n", "breaker", "Flur Licht", module="hv_f06", channel=1, phase="C", area="flur")
    node("flur_deckenleuchte", "kreis_flur", "fixed", "Deckenleuchte", meter=_p("flur_deckenleuchte"))

    # Herd: 3-poliger LS, ein Knoten je Pol
    for ch, ph in enumerate("ABC", start=1):
        node(f"herd_l{ch}", "grid", "breaker", f"Herd L{ch}", module="hv_f07", channel=ch, phase=ph,
             area="kueche", meter=_p(f"herd_l{ch}"))

    # Shelly Pro 4PM als Relais vor einzelnen Abgängen
    node("garage_zuleitung", "grid", "breaker", "Zuleitung Garage", module="hv_f08", channel=1, phase="B",
         area="garage", meter=_p("garage_zuleitung"))
    for ch, (name, area) in enumerate([("Gartenpumpe", "garten"), ("Gartenbeleuchtung", "garten"),
                                       ("Markise", "wohnzimmer"), ("Reserve", None)], start=1):
        slug_ = name.lower().replace("ü", "ue")
        node(f"k1_{ch}", "kreis_wohnzimmer" if ch == 3 else "grid", "relay", name, module="hv_k1", channel=ch,
             phase="A", area=area, meter=_p(f"modul_k1_{slug_}"), switch=f"switch.modul_k1_{slug_}",
             device=SHELLY_DEV, device_channel=ch - 1)

    # Unterverteiler Garage, gespeist von HV-F08
    node("garage_steckdosen", "garage_zuleitung", "breaker", "Steckdosen Garage", module="uv1_f01", channel=1,
         area="garage", meter=_p("garage_steckdosen"))
    node("garage_wallbox", "garage_zuleitung", "appliance", "Wallbox", module="uv1_f02", channel=1,
         area="garage", meter=_p("garage_wallbox"))
    node("garage_kompressor", "garage_steckdosen", "appliance", "Kompressor")
    node("garten_pv", "garage_zuleitung", "appliance", "Balkonkraftwerk", area="garten",
         meter=_p("garten_balkonkraftwerk"), feed_in=True)

    return {
        "version": 1,
        "settings": {"prefix": "stromnetz_", "name_prefix": "Stromnetz "},
        "grid": {"name": "Netzanschluss", "pot": "nicht_zugeordnet", "phases": {
            p: {"id": f"netz_{p.lower()}", "name": f"Netz L{i}", "meter": f"sensor.zaehler_l{i}_leistung"}
            for i, p in enumerate("ABC", start=1)}},
        "pots": {"nicht_zugeordnet": {"name": "Nicht zugeordnet", "floor": None}},
        "cabinets": [
            {"id": cab_hv, "code": "HV", "name": "Hauptverteiler", "area": "flur", "rows": 3, "width": 12,
             "notes": "Beispielhaus – erfundene Daten."},
            {"id": cab_uv, "code": "UV1", "name": "Unterverteiler Garage", "area": "garage", "feed": "garage_zuleitung",
             "rows": 1, "width": 8},
        ],
        "modules": modules,
        "nodes": nodes,
    }


def shelly() -> dict:
    """Antwort von stromnetz/shelly für das Harness."""
    chans = [("Gartenpumpe", "garten"), ("Gartenbeleuchtung", "garten"), ("Markise", "wohnzimmer"), ("Reserve", None)]
    devices = [{
        "device_id": SHELLY_DEV, "name": "Modul K1", "model": "Shelly Pro 4PM", "model_id": "SPSW-104PE16EU",
        "area_id": "flur",
        "channels": [{"index": i, "name": n, "kind": "relay",
                      "switch": f"switch.modul_k1_{n.lower().replace('ü', 'ue')}",
                      "power": f"sensor.modul_k1_{n.lower().replace('ü', 'ue')}_leistung"}
                     for i, (n, _a) in enumerate(chans)],
    }, {
        "device_id": "0000example0000plugs00000000002", "name": "Steckdose TV", "model": "Shelly Plug S",
        "model_id": "SNPL-00112EU", "area_id": "wohnzimmer",
        "channels": [{"index": 0, "name": "Steckdose TV", "kind": "relay", "switch": "switch.wohnzimmer_steckdose_tv",
                      "power": "sensor.wohnzimmer_steckdose_tv_leistung"}],
    }, {
        "device_id": "0000example0000pmmini0000000003", "name": "Deckenleuchte", "model": "Shelly PM Mini Gen3",
        "model_id": "S3PM-001PCEU16", "area_id": "flur",
        "channels": [{"index": 0, "name": "Deckenleuchte", "kind": "meter", "switch": None,
                      "power": "sensor.flur_deckenleuchte_leistung"}],
    }]
    return {"devices": devices,
            "discovered": [{"flow_id": "x1", "name": "shellyplus1pm-000000", "host": "192.0.2.10", "source": "zeroconf"}]}
