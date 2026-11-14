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
      { name: "Shelly Pro", items: [
        { key: "pro1", name: "Shelly Pro 1", sub: "1 Kanal, ohne Messung", type: "relay", model: "Shelly Pro 1", width: 1, poles: 1, channels: 1, kind: "relay" },
        { key: "pro1pm", name: "Shelly Pro 1PM", sub: "1 Kanal mit Messung", type: "relay", model: "Shelly Pro 1PM", width: 1, poles: 1, channels: 1, kind: "relay" },
        { key: "pro2", name: "Shelly Pro 2", sub: "2 Kanäle, ohne Messung", type: "relay", model: "Shelly Pro 2", width: 2, poles: 2, channels: 2, kind: "relay" },
        { key: "pro2pm", name: "Shelly Pro 2PM", sub: "2 Kanäle mit Messung", type: "relay", model: "Shelly Pro 2PM", width: 2, poles: 2, channels: 2, kind: "relay" },
        { key: "pro3", name: "Shelly Pro 3", sub: "3 Kanäle, ohne Messung", type: "relay", model: "Shelly Pro 3", width: 3, poles: 3, channels: 3, kind: "relay" },
        { key: "pro4pm", name: "Shelly Pro 4PM", sub: "4 Kanäle mit Messung", type: "relay", model: "Shelly Pro 4PM", width: 2, poles: 4, channels: 4, kind: "relay" },
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
        { key: "pro3em", name: "Shelly Pro 3EM", sub: "3 Phasen", type: "meter", model: "Shelly Pro 3EM", width: 3, poles: 3, channels: 3, kind: "junction", phases: ["A", "B", "C"] },
        { key: "proem", name: "Shelly Pro EM", sub: "1 Phase, 2 Messkanäle", type: "meter", model: "Shelly Pro EM", width: 1, poles: 1, channels: 2, kind: "junction" },
        { key: "meter1", name: "Zwischenzähler 1-phasig", sub: "1 Kanal", type: "meter", width: 1, poles: 1, channels: 1, kind: "junction" },
        { key: "meter3", name: "Zwischenzähler 3-phasig", sub: "3 Kanäle L1–L3", type: "meter", width: 4, poles: 3, channels: 3, kind: "junction", phases: ["A", "B", "C"] },
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
