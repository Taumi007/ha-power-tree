# Power Tree

*Power distribution tree and electrical panel documentation for Home Assistant.*

> [!WARNING]
> **Dieses Projekt wurde mit KI-Unterstützung entwickelt.** Es wird ohne jede Gewährleistung bereitgestellt. Ich übernehme keine Garantie oder Haftung für Funktion, Richtigkeit der Berechnungen oder Folgen der Nutzung. Die Dokumentation ersetzt keine Elektrofachkraft; Arbeiten an der Elektroinstallation gehören in fachkundige Hände.
>
> **This project was developed with the help of AI.** It is provided as is, without warranty of any kind. I accept no guarantee or liability for its function, the correctness of its calculations, or any consequences of its use. It is no substitute for a qualified electrician.

Die Integration heißt in Home Assistant „Stromnetz“ (Domain `stromnetz`).

Home-Assistant-Integration, mit der sich die Elektroinstallation eines Hauses dokumentieren lässt: Netzanschluss, Sicherungskästen (auch mehrere Unterverteiler), Hutschienengeräte wie LS, FI oder Shelly Pro, Abgänge, Steckdosen und Geräte. Dazu kommen Zähler und eine Live-Bilanz.

## Bestandteile
- **Panel** „Stromnetz“ in der Seitenleiste (nur für Admins). Es hat die Ansichten Fluss, Schaltschrank, Bilanz und Daten und folgt dem HA-Theme, also auch dem Dark Mode.
- **Sensoren** für Sonstiges/Rest, Verbraucher, Summen und Gruppen (Area/Topf, Stockwerk, Phase, Kasten je Phase). Sie werden bei jeder Zustandsänderung ihrer Quellen neu berechnet. Topf-Sensoren hängen an einem eigenen Dienst-Gerät je Topf (ohne Bereich), Abgangs-Sensoren an einem Gerät mit Name und Bereich des Messgeräts. Die entity_ids bildet Home Assistant daraus, z. B. `sensor.kuche_leistung`.
- **Speicher** in `.storage/stromnetz`. Ein YAML-Export ist möglich.

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
- `uv run tests/gen_desc.py` erzeugt aus dem erfundenen Beispielhaus (`tests/example_house.py`) die Testdaten. Danach `python3 -m http.server` im Repo starten und `tests/harness/index.html` öffnen, um das Panel mit nachgebautem `hass` zu testen.
- `scripts/deploy.sh` kopiert die Integration nach `/Volumes/config/custom_components/stromnetz`. Änderungen am Python-Code brauchen danach einen HA-Neustart, Änderungen an den Panel-Dateien nur ein Neuladen der Seite.

## Lizenz
MIT – siehe [LICENSE](LICENSE).
