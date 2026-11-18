// Katalog der Hutschienengeräte für die Auswahl. Breiten in TE bitte am Gerät prüfen; sie sind änderbar.
// Einträge mit `combo` setzen mehrere Geräte auf einmal ein:
//   use     Schlüssel eines Einzelgeräts
//   count   Anzahl
//   phases  Phase je Gerät (bei count > 1) bzw. je Kanal
//   under   Index eines früheren Teils: Kanal i hängt hinter Kanal i dieses Teils
//   rcdOf   Index eines früheren Teils: dessen erstes Gerät ist der vorgeschaltete FI

const ls = (rating, curve, poles = 1) => ({
  key: `ls${poles}_${curve}${rating}`.toLowerCase(),
  name: `${curve}${rating}`,
  sub: poles === 1 ? "1-polig" : "3-polig, je Pol ein Kanal",
  type: "breaker", width: poles, poles, channels: poles, kind: "breaker", rating, curve,
  phases: poles === 3 ? ["A", "B", "C"] : undefined,
});
const fi = (rating, ma, poles = 4) => ({
  key: `fi${poles}_${rating}_${ma}`, name: `${rating} A / ${ma} mA`, sub: `${poles}-polig`,
  type: "rcd", width: poles === 4 ? 4 : 2, poles, channels: poles === 4 ? 4 : 2, kind: "rcd", rating, rcd_ma: ma,
  phases: poles === 4 ? ["A", "B", "C", "N"] : ["A", "N"],
});
const fils = (rating, curve) => ({
  key: `fils_${curve}${rating}`.toLowerCase(), name: `${curve}${rating} / 30 mA`, sub: "FI/LS 1+N",
  type: "rcbo", width: 2, poles: 2, channels: 1, kind: "breaker", rating, curve, rcd_ma: 30,
});

export const CATALOG = [
  {
    key: "ls", name: "Leitungsschutz", groups: [
      { name: "1-polig, Charakteristik B", items: [6, 10, 13, 16, 20, 25, 32].map((r) => ls(r, "B")) },
      { name: "1-polig, Charakteristik C", items: [6, 10, 13, 16, 20, 25, 32].map((r) => ls(r, "C")) },
      { name: "3-polig", items: [ls(16, "B", 3), ls(20, "B", 3), ls(25, "B", 3), ls(16, "C", 3), ls(32, "C", 3)] },
    ],
  },
  {
    key: "fi", name: "Fehlerstromschutz", groups: [
      { name: "FI 4-polig", items: [fi(25, 30), fi(40, 30), fi(63, 30), fi(40, 300)] },
      { name: "FI 2-polig", items: [fi(25, 30, 2), fi(40, 30, 2)] },
      { name: "FI/LS-Kombination", items: [fils(10, "B"), fils(13, "B"), fils(16, "B"), fils(16, "C")] },
    ],
  },
  {
    key: "relay", name: "Relais & Aktoren", groups: [
      // Maße laut Shelly Knowledge Base: Pro 1/1PM/2/2PM 94×19×69 mm (1 TE), Pro 3/4PM 96×53×59 mm (3 TE)
      { name: "Shelly Pro", items: [
        { key: "pro1", name: "Shelly Pro 1", sub: "1 Kanal 16 A, ohne Messung", type: "relay", model: "Shelly Pro 1", width: 1, poles: 1, channels: 1, kind: "relay", match: /SPSW-[02]01X/i },
        { key: "pro1pm", name: "Shelly Pro 1PM", sub: "1 Kanal 16 A, mit Messung", type: "relay", model: "Shelly Pro 1PM", width: 1, poles: 1, channels: 1, kind: "relay", match: /SPSW-[02]01P/i },
        { key: "pro2", name: "Shelly Pro 2", sub: "2 Kanäle 16 A, ohne Messung", type: "relay", model: "Shelly Pro 2", width: 1, poles: 2, channels: 2, kind: "relay", match: /SPSW-[02]02X/i },
        { key: "pro2pm", name: "Shelly Pro 2PM", sub: "2 Kanäle 16 A (25 A gesamt), mit Messung", type: "relay", model: "Shelly Pro 2PM", width: 1, poles: 2, channels: 2, kind: "relay", match: /SPSW-[02]02P/i },
        { key: "pro3", name: "Shelly Pro 3", sub: "3 Kanäle 16 A, ohne Messung", type: "relay", model: "Shelly Pro 3", width: 3, poles: 3, channels: 3, kind: "relay", match: /SPSW-003X/i },
        { key: "pro4pm", name: "Shelly Pro 4PM", sub: "4 Kanäle 16 A (40 A gesamt), mit Messung", type: "relay", model: "Shelly Pro 4PM", width: 3, poles: 4, channels: 4, kind: "relay", match: /SPSW-[01]04P/i },
      ] },
      { name: "Relais und Schütze", items: [
        { key: "relay1", name: "Relais 1-polig", sub: "1 Kanal", type: "relay", width: 1, poles: 1, channels: 1, kind: "relay" },
        { key: "relay3", name: "Relais / Schütz 3-polig", sub: "3 Kanäle L1–L3, ein Schalter", type: "relay", width: 3, poles: 3, channels: 3, kind: "relay", phases: ["A", "B", "C"], shared: true },
        { key: "impulse", name: "Stromstoßschalter", sub: "1 Kanal", type: "relay", width: 1, poles: 1, channels: 1, kind: "relay" },
      ] },
    ],
  },
  {
    key: "meter", name: "Messgeräte", groups: [
      { name: "Energiemessung", items: [
        { key: "pro3em", name: "Shelly Pro 3EM", sub: "3 Phasen, Wandler bis 120 A, ohne Relais", type: "meter", model: "Shelly Pro 3EM", width: 1, poles: 3, channels: 3, kind: "junction", phases: ["A", "B", "C"], match: /SPEM-003C/i },
        { key: "proem", name: "Shelly Pro EM-50", sub: "2 Messkanäle bis 50 A, Relais 2 A", type: "meter", model: "Shelly Pro EM-50", width: 1, poles: 1, channels: 2, kind: "junction", match: /SPEM-002C/i },
        { key: "meter1", name: "Zwischenzähler 1-phasig", sub: "1 Kanal", type: "meter", width: 1, poles: 1, channels: 1, kind: "junction" },
        { key: "meter3", name: "Zwischenzähler 3-phasig", sub: "3 Kanäle L1–L3", type: "meter", width: 4, poles: 3, channels: 3, kind: "junction", phases: ["A", "B", "C"] },
      ] },
    ],
  },
  {
    // Unterputz-Shellys auf Hutschienen-Adapter im Kasten. Breite hängt vom Adapter ab (Mini 29×34 mm, sonst 37×42 mm) – im Gerät änderbar.
    key: "shellydin", name: "Shelly Mini & Unterputz", groups: [
      { name: "Shelly Mini (29×34 mm, auf Adapter)", items: [
        { key: "d_1mini", name: "Shelly 1 Mini", sub: "1 Kanal, ohne Messung", type: "relay", model: "Shelly 1 Mini", width: 2, poles: 1, channels: 1, kind: "relay", variantOf: "s1mini", match: /S[N34]SW-001X8/i },
        { key: "d_1pmmini", name: "Shelly 1PM Mini", sub: "1 Kanal 8 A, mit Messung", type: "relay", model: "Shelly 1PM Mini", width: 2, poles: 1, channels: 1, kind: "relay", variantOf: "s1pmmini", match: /S[N34]SW-001P8/i },
        { key: "d_pmmini", name: "Shelly PM Mini", sub: "nur Messung bis 16 A, kein Relais", type: "meter", model: "Shelly PM Mini", width: 2, poles: 1, channels: 1, kind: "junction", variantOf: "spmmini", match: /S[N34]PM-001PC/i },
        { key: "d_emmini", name: "Shelly EM Mini Gen4", sub: "nur Messung bis 16 A, direkt angeschlossen", type: "meter", model: "Shelly EM Mini", width: 2, poles: 1, channels: 1, kind: "junction", variantOf: "semmini", match: /S4EM-001P/i },
      ] },
      { name: "Shelly Unterputz (37×42 mm, auf Adapter)", items: [
        { key: "d_1", name: "Shelly 1", sub: "1 Kanal, ohne Messung", type: "relay", model: "Shelly 1", width: 3, poles: 1, channels: 1, kind: "relay", variantOf: "s1", match: /S[N34]SW-001X16/i },
        { key: "d_1pm", name: "Shelly 1PM", sub: "1 Kanal 16 A, mit Messung", type: "relay", model: "Shelly 1PM", width: 3, poles: 1, channels: 1, kind: "relay", variantOf: "s1pm", match: /S[N34]SW-001P16/i },
        { key: "d_2pm", name: "Shelly 2PM", sub: "2 Kanäle 10 A (16 A gesamt), mit Messung", type: "relay", model: "Shelly 2PM", width: 3, poles: 2, channels: 2, kind: "relay", variantOf: "s2pm", match: /S[N34]SW-[01]02P16/i },
        { key: "d_em", name: "Shelly EM", sub: "2 Messkanäle über Wandler", type: "meter", model: "Shelly EM", width: 3, poles: 1, channels: 2, kind: "junction", variantOf: "sem", match: /S[34]EM-002C/i },
        { key: "d_dim010", name: "Shelly Dimmer 0/1-10V PM", sub: "1 Kanal, mit Messung", type: "relay", model: "Shelly Dimmer 0/1-10V PM", width: 3, poles: 1, channels: 1, kind: "relay", variantOf: "sdim010", match: /S[N34]DM-0010WW/i },
        { key: "d_rgbwpm", name: "Shelly RGBW PM", sub: "12/24 V DC, als 1 Licht", type: "relay", model: "Shelly RGBW PM", width: 3, poles: 1, channels: 1, kind: "relay", variantOf: "srgbwpm", match: /S[N34]DC-0D4P10WW/i },
      ] },
    ],
  },
  {
    // Kein Hutschienengerät: wird als Knoten in den Fluss gesetzt (Abzweigdose, Gerätedose, Steckdose)
    key: "flush", name: "Unterputz & Stecker", din: false, groups: [
      { name: "Shelly Unterputz (Plus, Gen3, Gen4)", items: [
        { key: "s1", name: "Shelly 1", sub: "1 Kanal, ohne Messung", type: "relay", model: "Shelly 1", channels: 1, kind: "relay", din: false, match: /S[N34]SW-001X16/i },
        { key: "s1pm", name: "Shelly 1PM", sub: "1 Kanal 16 A, mit Messung", type: "relay", model: "Shelly 1PM", channels: 1, kind: "relay", din: false, match: /S[N34]SW-001P16/i },
        { key: "s2pm", name: "Shelly 2PM", sub: "2 Kanäle 10 A (16 A gesamt), mit Messung", type: "relay", model: "Shelly 2PM", channels: 2, kind: "relay", din: false, match: /S[N34]SW-[01]02P16/i },
      ] },
      { name: "Shelly Mini", items: [
        { key: "s1mini", name: "Shelly 1 Mini", sub: "1 Kanal, ohne Messung", type: "relay", model: "Shelly 1 Mini", channels: 1, kind: "relay", din: false, match: /S[N34]SW-001X8/i },
        { key: "s1pmmini", name: "Shelly 1PM Mini", sub: "1 Kanal 8 A, mit Messung", type: "relay", model: "Shelly 1PM Mini", channels: 1, kind: "relay", din: false, match: /S[N34]SW-001P8/i },
        { key: "spmmini", name: "Shelly PM Mini", sub: "nur Messung bis 16 A, kein Relais", type: "meter", model: "Shelly PM Mini", channels: 1, kind: "junction", din: false, match: /S[N34]PM-001PC/i },
        { key: "semmini", name: "Shelly EM Mini Gen4", sub: "nur Messung bis 16 A, direkt angeschlossen", type: "meter", model: "Shelly EM Mini", channels: 1, kind: "junction", din: false, match: /S4EM-001P/i },
      ] },
      { name: "Shelly Messung, Dimmer, LED", items: [
        { key: "sem", name: "Shelly EM", sub: "2 Messkanäle über Wandler", type: "meter", model: "Shelly EM", channels: 2, kind: "junction", din: false, match: /S[34]EM-002C/i },
        { key: "sdim010", name: "Shelly Dimmer 0/1-10V PM", sub: "1 Kanal, mit Messung", type: "relay", model: "Shelly Dimmer 0/1-10V PM", channels: 1, kind: "relay", din: false, match: /S[N34]DM-0010WW/i },
        { key: "srgbwpm", name: "Shelly RGBW PM", sub: "12/24 V DC, als 1 Licht", type: "relay", model: "Shelly RGBW PM", channels: 1, kind: "relay", din: false, match: /S[N34]DC-0D4P10WW/i },
      ] },
      { name: "Zwischenstecker", items: [
        { key: "splugs", name: "Shelly Plug S", sub: "1 Kanal, mit Messung (auch Outdoor)", type: "relay", model: "Shelly Plug S", channels: 1, kind: "outlet", din: false, match: /S[N34]PL-\d0112/i },
      ] },
    ],
  },
  {
    key: "combo", name: "Kombinationen", groups: [
      { name: "Sicherung mit Relais", items: [
        { key: "c_3ls_relay3", name: "3 × B16 + Schütz 3-polig", sub: "je Phase eine Sicherung, dahinter das Schütz", combo: [{ use: "ls1_b16", count: 3, phases: ["A", "B", "C"] }, { use: "relay3", under: 0 }] },
        { key: "c_ls3_relay3", name: "B16 3-polig + Schütz 3-polig", sub: "Drehstromabgang, schaltbar", combo: [{ use: "ls3_b16" }, { use: "relay3", under: 0 }] },
        { key: "c_ls_pro1pm", name: "B16 + Shelly Pro 1PM", sub: "eine Sicherung, ein Kanal", combo: [{ use: "ls1_b16" }, { use: "pro1pm", under: 0 }] },
        { key: "c_2ls_pro2pm", name: "2 × B16 + Shelly Pro 2PM", sub: "je Kanal eine Sicherung", combo: [{ use: "ls1_b16", count: 2 }, { use: "pro2pm", under: 0 }] },
        { key: "c_4ls_pro4pm", name: "4 × B16 + Shelly Pro 4PM", sub: "je Kanal eine Sicherung", combo: [{ use: "ls1_b16", count: 4 }, { use: "pro4pm", under: 0 }] },
      ] },
      { name: "FI-Gruppen", items: [
        { key: "c_fi_4ls", name: "FI 40 A + 4 × B16", sub: "Sicherungen hinter dem FI", combo: [{ use: "fi4_40_30" }, { use: "ls1_b16", count: 4, rcdOf: 0 }] },
        { key: "c_fi_6ls", name: "FI 40 A + 6 × B16", sub: "Sicherungen hinter dem FI", combo: [{ use: "fi4_40_30" }, { use: "ls1_b16", count: 6, rcdOf: 0 }] },
      ] },
    ],
  },
  {
    key: "other", name: "Sonstiges", groups: [
      { name: "Weitere Geräte", items: [
        { key: "spd", name: "Überspannungsschutz", sub: "4 TE, ohne Kanal", type: "other", model: "Überspannungsschutz", width: 4, poles: 4, channels: 0 },
        { key: "psu", name: "Netzteil", sub: "1 Kanal", type: "other", model: "Netzteil", width: 2, poles: 1, channels: 1, kind: "appliance" },
        { key: "bell", name: "Klingeltrafo", sub: "1 Kanal", type: "other", model: "Klingeltrafo", width: 2, poles: 1, channels: 1, kind: "appliance" },
        { key: "blank", name: "Leerfeld / Abdeckung", sub: "ohne Kanal", type: "other", model: "Leerfeld", width: 1, poles: 1, channels: 0 },
        { key: "generic", name: "Sonstiges Gerät", sub: "1 Kanal", type: "other", width: 1, poles: 1, channels: 1, kind: "junction" },
      ] },
    ],
  },
];

export const CATALOG_BY_KEY = new Map(CATALOG.flatMap((c) => c.groups.flatMap((g) => g.items)).map((i) => [i.key, i]));

export function itemWidth(item) {
  if (!item.combo) return item.width;
  return item.combo.reduce((s, p) => s + CATALOG_BY_KEY.get(p.use).width * (p.count ?? 1), 0);
}

// Farbcode der D-Schmelzeinsätze (DIN VDE 0636), als dezente Kennzeichnung des Nennstroms
export const RATING_COLORS = {
  2: "#e991b5", 4: "#8d6e63", 6: "#5fae63", 10: "#e0524b", 13: "#3a3a3a", 16: "#9aa0a6",
  20: "#3f88d8", 25: "#e2c23b", 32: "#9a5fc4", 35: "#3a3a3a", 40: "#3a3a3a", 50: "#f2f2f2", 63: "#c27a4a",
};

export function ratingColor(r) {
  return RATING_COLORS[r] ?? null;
}

// Gut lesbare Schriftfarbe auf einer Hintergrundfarbe
export function onColor(hex) {
  const v = parseInt(hex.slice(1), 16);
  const lum = (0.299 * ((v >> 16) & 255) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.6 ? "#1b1b1b" : "#ffffff";
}

// Katalogeintrag zu einem Shelly-Gerät aus HA (über model_id, sonst über den Modellnamen)
export function catalogForDevice(dev) {
  // Unterputz-Vorlage (Knoten) zuerst, die Hutschienen-Variante gibt es über dinVariant()
  const items = [...CATALOG_BY_KEY.values()].filter((i) => i.match).sort((a, b) => (a.din === false ? 0 : a.variantOf ? 2 : 1) - (b.din === false ? 0 : b.variantOf ? 2 : 1));
  const byId = items.find((i) => dev.model_id && i.match.test(dev.model_id));
  if (byId) return byId;
  const name = (dev.model ?? "").toLowerCase().replace(/\s*(gen\s*\d|plus|v\d)\b/g, "").replace(/\s+/g, " ").trim();
  return items.find((i) => i.model?.toLowerCase() === name) ?? null;
}

// Hutschienen-Variante einer Unterputz-Vorlage (z. B. 1PM Mini auf Adapter im Kasten)
export function dinVariant(item) {
  if (!item) return null;
  if (item.din !== false) return item;
  return [...CATALOG_BY_KEY.values()].find((i) => i.variantOf === item.key) ?? null;
}
