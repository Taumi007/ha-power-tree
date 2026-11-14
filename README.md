# Stromnetz

Home-Assistant-Integration, mit der sich die Elektroinstallation eines Hauses dokumentieren lässt: Netzanschluss, Sicherungskästen (auch mehrere Unterverteiler), Hutschienengeräte wie LS, FI oder Shelly Pro, Abgänge, Steckdosen und Geräte. Dazu kommen Zähler und eine Live-Bilanz.

## Bestandteile
- **Panel** „Stromnetz“ in der Seitenleiste (nur für Admins). Es hat die Ansichten Fluss, Schaltschrank, Bilanz und Daten und folgt dem HA-Theme, also auch dem Dark Mode.
- **Sensoren** für Sonstiges/Rest, Verbraucher, Summen und Gruppen (Area/Topf, Stockwerk, Phase, Kasten je Phase). Sie werden bei jeder Zustandsänderung ihrer Quellen neu berechnet.
- **Speicher** in `.storage/stromnetz`. Die YAML-Datei dient nur für Import und Export.

## Adressen
Adressen hängen an der Verdrahtung, nicht am Raum:

| Adresse | Bedeutung |
|---|---|
| `HV-F07` | Kasten HV, Sicherung F07 |
| `HV-F07.X2` | zweite Steckdose an F07 |
| `HV-F07.X2.G3` | drittes Gerät an dieser Steckdose |
| `UV1-F03` | Sicherung F03 im Unterverteiler UV1, der von einer Sicherung im HV gespeist wird |

Buchstaben der Abgänge: X = Steckdose, A = Abzweig, E = Festanschluss, G = Gerät, U = unbekannter Stromkreis.

Hutschienengeräte mit mehreren Kanälen (Shelly Pro 4PM, 3-poliger LS) haben pro Kanal einen eigenen Knoten, z. B. `HV-K1.3` oder `HV-KF.L2`.

## Entwicklung
- `uv run tests/compare_generate.py /Volumes/config/stromnetz tests/areas.json` vergleicht den Import mit dem alten generate.py.
- `uv run tests/gen_desc.py` erzeugt Testdaten. Danach `python3 -m http.server` starten und `tests/harness/index.html` öffnen, um das Panel mit nachgebautem `hass` zu testen.
- `scripts/deploy.sh` kopiert die Integration nach `/Volumes/config/custom_components/stromnetz`. Änderungen am Python-Code oder an den Panel-Dateien brauchen danach einen HA-Neustart.
