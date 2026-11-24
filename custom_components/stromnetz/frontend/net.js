// Client-Sicht auf das Netz: Indizes, Vererbung, Namen und Live-Werte
import { CATALOG_BY_KEY } from "./catalog.js";
import { GRID, PHASES, friendly, num } from "./util.js";

// Modellnamen aus dem Katalog; andere Einträge im Modellfeld wurden bisher als Name benutzt
const CATALOG_MODELS = new Set([...CATALOG_BY_KEY.values()].flatMap((i) => [i.model, i.name]).filter(Boolean));

// Kurzzeichen einer CT-Klemme: CT1 … CT16, CTA/CTB/CTC
export function clampCode(src, i) {
  const name = src?.clamps?.[i]?.name ?? String((i ?? 0) + 1);
  return `CT${String(name).replace(/\s+/g, "")}`;
}

export class Net {
  constructor(data, desc) {
    this.data = data;
    this.desc = desc || {};
    this.nodes = new Map(data.nodes.map((n) => [n.id, n]));
    this.modules = new Map(data.modules.map((m) => [m.id, m]));
    this.cabinets = new Map(data.cabinets.map((c) => [c.id, c]));
    this.children = new Map();
    for (const n of data.nodes) {
      const p = n.parent ?? null;
      if (!this.children.has(p)) this.children.set(p, []);
      this.children.get(p).push(n.id);
    }
    // Kinder natürlich nach Adresse sortieren (F02 vor F10, X2 vor X10); ohne Adresse ans Ende
    const coll = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    const addr = (id) => this.desc.addresses?.[id];
    for (const list of this.children.values()) {
      list.sort((a, b) => {
        const x = addr(a), y = addr(b);
        if (x && y) return coll.compare(x, y);
        return x ? -1 : y ? 1 : coll.compare(a, b);
      });
    }
    this.moduleNodes = new Map();
    for (const n of data.nodes) {
      if (!n.module) continue;
      if (!this.moduleNodes.has(n.module)) this.moduleNodes.set(n.module, []);
      this.moduleNodes.get(n.module).push(n);
    }
    for (const list of this.moduleNodes.values()) list.sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0));
    // Anbaugeräte: ihre Zähler gelten für die Kanäle darunter (nur in dieser Sicht, nicht in den Daten)
    this.mountMeters = new Map();
    for (const m of data.modules) {
      for (const t of this.mountTargets(m)) {
        if (!t.entity || !t.node) continue;
        const n = this.nodes.get(t.node);
        if (n?.meter) continue;
        this.mountMeters.set(t.node, { entity: t.entity, from: m.id, channel: t.channel });
      }
    }
  }

  // [{channel, entity, te, node}] eines Anbaugeräts: Kanal i über TE slot + i·Breite/Kanäle
  mountTargets(m) {
    const meters = m.meters ?? [];
    if (!m.mount || m.row === null || m.row === undefined || m.slot === null || m.slot === undefined || !meters.length) return [];
    const width = m.width || 1;
    return meters.map((entity, i) => {
      const te = m.slot + Math.floor((i * width) / meters.length);
      const x = this.data.modules.find((y) => y.cabinet === m.cabinet && !y.mount && y.row === m.row
        && y.slot !== null && y.slot <= te && te < y.slot + (y.width || 1));
      const chans = x ? this.moduleNodes.get(x.id) ?? [] : [];
      // je Pol 1 TE (z. B. 3+N auf 4 TE: N ohne Kanal); mehr Kanäle als TE: anteilig
      const xw = x?.width || 1;
      const k = x ? (xw >= chans.length ? te - x.slot : Math.floor(((te - x.slot) * chans.length) / xw)) : -1;
      const node = k >= 0 && k < chans.length ? chans[k].id : null;
      return { channel: i, entity, te, module: x?.id ?? null, node };
    });
  }

  // Zähler eines Knotens: eigener oder der eines Anbaugeräts darüber/darunter
  meterOf(id) {
    return this.nodes.get(id)?.meter || this.mountMeters?.get(id)?.entity || null;
  }

  kids(id) {
    return this.children.get(id) ?? [];
  }

  *ancestors(id) {
    let k = this.nodes.get(id)?.parent;
    while (k && k !== GRID && this.nodes.has(k)) {
      yield k;
      k = this.nodes.get(k).parent;
    }
  }

  inherit(id, field) {
    const n = this.nodes.get(id);
    if (!n) return null;
    if (n[field] !== null && n[field] !== undefined) return n[field];
    for (const a of this.ancestors(id)) {
      const v = this.nodes.get(a)[field];
      if (v !== null && v !== undefined) return v;
    }
    return null;
  }

  phase(id) {
    return this.inherit(id, "phase");
  }

  area(id) {
    return this.inherit(id, "area");
  }

  areaName(key) {
    if (!key) return "";
    return this.data.pots?.[key]?.name ?? this.desc.areas?.[key]?.name ?? key;
  }

  cabinetOf(id) {
    for (const k of [id, ...this.ancestors(id)]) {
      const m = this.nodes.get(k)?.module;
      if (m && this.modules.has(m)) return this.modules.get(m).cabinet;
    }
    return null;
  }

  isDescendant(id, of) {
    for (const a of this.ancestors(id)) if (a === of) return true;
    return false;
  }

  address(id) {
    return this.desc.addresses?.[id] ?? "";
  }

  name(id, hass) {
    const n = this.nodes.get(id);
    if (!n) return id;
    if (n.name) return n.name;
    const meter = this.meterOf(id);
    if (meter) return friendly(hass, meter).replace(/ Leistung$/, "");
    return id;
  }

  // Name eines Hutschienengeräts: eigenes Feld, sonst erster Kanal ohne » Kanal n«/» L1«, sonst Modell/Typ
  defaultModuleName(m, hass) {
    const first = (this.moduleNodes.get(m.id) ?? [])[0];
    const fromChannel = first ? this.name(first.id, hass).replace(/\s+(L[123]|N|Phase [ABC]|Kanal \d+)$/i, "") : "";
    // Automatisch vergebene Kanalnamen (»Sicherung F17«, »FI FI1«) sind nur die Bezeichnung: dann Modell/Typ
    const auto = !fromChannel || fromChannel === first.id || (m.label && (fromChannel === m.label || fromChannel.endsWith(` ${m.label}`)));
    if (m.model && !CATALOG_MODELS.has(m.model)) return m.model;
    return auto ? (m.model || "") : fromChannel;
  }

  moduleName(m, hass, typeLabel = "") {
    return (m.name || this.defaultModuleName(m, hass) || typeLabel).replace(/^Sicherung\s+/i, "");
  }

  moduleTitle(m) {
    // CT-Klemme: Unterelement ihres Messgeräts (wie ein Kanal), egal in welchem Kasten sie sitzt
    const src = m.source ? this.modules.get(m.source) : null;
    if (src) return `${this.moduleTitle(src)}.${clampCode(src, m.clamp)}`;
    const cab = this.cabinets.get(m.cabinet);
    return `${cab?.code ?? "?"}-${m.label || m.id}`;
  }

  sensorsOf(id) {
    return this.desc.sensors?.[id] ?? {};
  }

  value(id, hass) {
    const n = this.nodes.get(id);
    if (!n) return null;
    const meter = this.meterOf(id);
    if (meter) return num(hass, meter);
    const s = this.sensorsOf(id).summe;
    return s ? num(hass, s) : null;
  }

  rest(id, hass) {
    const s = this.sensorsOf(id).rest;
    return s ? num(hass, s) : null;
  }

  gridValue(phase, hass) {
    return num(hass, this.data.grid?.phases?.[phase]?.meter);
  }

  gridRestEntity(phase) {
    return this.desc.sensors?.[`grid:${phase}`]?.rest ?? null;
  }

  cabinetPhaseEntity(cabId, phase) {
    const code = this.cabinets.get(cabId)?.code;
    return (this.desc.groups ?? []).find((g) => g.gruppe === "kasten" && g.kasten === code && g.phase === phase)?.entity_id ?? null;
  }

  phasesOfModule(m) {
    const set = new Set();
    for (const n of this.moduleNodes.get(m.id) ?? []) {
      const p = this.phase(n.id);
      if (p) set.add(p);
    }
    return [...PHASES, "N"].filter((p) => set.has(p));
  }

  // Belegung der Hutschiene (mount null) oder einer Anbauzone ("top"/"bottom")
  occupied(cabId, exceptModule, mount = null) {
    const occ = new Map();
    for (const m of this.data.modules) {
      if (m.cabinet !== cabId || m.id === exceptModule || m.row === null || m.slot === null || (m.mount ?? null) !== mount) continue;
      for (let i = 0; i < (m.width || 1); i++) occ.set(`${m.row}:${m.slot + i}`, m.id);
    }
    return occ;
  }

  fits(cabId, row, slot, width, exceptModule, mount = null) {
    const cab = this.cabinets.get(cabId);
    if (!cab || row < 0 || slot < 0 || row >= cab.rows || slot + width > cab.width) return false;
    const occ = this.occupied(cabId, exceptModule, mount);
    for (let i = 0; i < width; i++) if (occ.has(`${row}:${slot + i}`)) return false;
    return true;
  }

  freeSlot(cabId, width) {
    const cab = this.cabinets.get(cabId);
    for (let r = 0; r < cab.rows; r++) for (let s = 0; s + width <= cab.width; s++) if (this.fits(cabId, r, s, width)) return { row: r, slot: s };
    return { row: null, slot: null };
  }
}
