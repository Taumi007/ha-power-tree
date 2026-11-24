// Flussdiagramm: Netzanschluss → Kasten je Phase → Abgänge → … → Geräte
import { GRID, MDI, NEUTRAL, PHASES, PHASE_LABEL, fmtW, h, icon, num, svg } from "./util.js";

const W = 228;
const H = 54;
const GAP = 76;
const PITCH = 66;
const GRID_H = H + 3 * 24 + 30;
const COLLAPSE_KEY = "stromnetz.collapsed";

function loadCollapsed() {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY);
    return raw === null ? null : new Set(JSON.parse(raw));
  } catch {
    return null;
  }
}

const sum = (vals) => {
  const v = vals.filter((x) => x !== null && x !== undefined);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export class FlowView {
  constructor(panel) {
    this.p = panel;
    // Startansicht: immer bis zu den Sicherungen eingeklappt (Ein-/Ausklappen gilt bis zum nächsten Öffnen)
    void loadCollapsed;
    this.collapsed = new Set();
    this.firstStart = true;
    this.view = { s: 0.85, x: 40, y: 40 };
    this.live = [];
    this.el = h("div", { class: "flow" });
    this.stage = h("div", { class: "stage" });
    this.edges = svg("svg", { class: "edges" });
    this.stage.append(this.edges);
    this.el.append(this.stage, this.controls());
    this.bindPanZoom();
    this.fitted = false;
  }

  saveCollapsed() {
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...this.collapsed]));
    } catch {
      /* ohne Speicher weiter */
    }
  }

  controls() {
    const b = (path, label, fn) => h("button", { class: "icon-btn", title: label, "aria-label": label, onclick: fn }, icon(path));
    return h("div", { class: "flow-controls" },
      b(MDI.plus, "Vergrößern", () => this.zoomBy(1.2)),
      b(MDI.minus, "Verkleinern", () => this.zoomBy(1 / 1.2)),
      b(MDI.fit, "Einpassen", () => this.fit()),
      this.wheelSwitch(),
      this.groupSwitch(),
      h("button", { class: "chip wide-only", onclick: () => this.collapseTo("breaker") }, "Bis Sicherungen"),
      h("button", { class: "chip wide-only", onclick: () => this.collapseTo(null) }, "Alles ausklappen"),
      // Handy: Ein-/Ausklappen im Menü, damit alles in eine Zeile passt
      h("button", { class: "icon-btn narrow-only", title: "Mehr", "aria-label": "Weitere Ansichtsoptionen", onclick: (e) => {
        e.stopPropagation();
        this.p.menu(e.clientX, e.clientY - 90, [
          { label: "Bis Sicherungen einklappen", icon: MDI.collapse, action: () => this.collapseTo("breaker") },
          { label: "Alles ausklappen", icon: MDI.expand, action: () => this.collapseTo(null) },
        ]);
      } }, icon("M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z")));
  }

  // Gliederung unter dem Netzanschluss: je Kasten und Phase oder nur je Kasten
  get groupMode() {
    try {
      return localStorage.getItem("stromnetz.flowgroup") ?? "phase";
    } catch {
      return this._groupMode ?? "phase";
    }
  }

  set groupMode(v) {
    this._groupMode = v;
    try {
      localStorage.setItem("stromnetz.flowgroup", v);
    } catch {
      /* ohne Speicher */
    }
  }

  get total() {
    return this.groupMode === "total";
  }

  groupKey(rootId) {
    const net = this.p.net;
    const cab = net.cabinetOf(rootId) ?? "-";
    return this.groupMode !== "phase" ? `grp:${cab}:*` : `grp:${cab}:${net.phase(rootId) ?? "?"}`;
  }

  // Gesamt-Ansicht: Kanäle eines mehrpoligen Geräts (LS, FI, FI/LS, Mehrphasen-Zähler) als ein Knoten.
  // Schütze werden zusammengefasst; Relais-Module wie der Shelly Pro 4PM bleiben getrennt,
  // ihre Kanäle sind eigene Stromkreise.
  mergeKeyOf(id) {
    const net = this.p.net;
    const n = net.nodes.get(id);
    const m = n?.module ? net.modules.get(n.module) : null;
    if (!m) return null;
    const chNodes = net.moduleNodes.get(m.id) ?? [];
    const channels = chNodes.length;
    // Schütz: alle Pole hängen an einem Schalter; Shelly-Relais haben je Kanal einen eigenen
    const oneSwitch = new Set(chNodes.map((c) => c.switch ?? null)).size <= 1;
    const multi = (["breaker", "rcd", "rcbo"].includes(m.type) && (m.poles ?? 1) > 1 && channels > 1)
      || (m.type === "meter" && channels > 1)
      || (m.type === "relay" && channels > 1 && !m.device && !/shelly/i.test(m.model ?? "") && oneSwitch);
    return multi ? m.id : null;
  }

  // [[primär, [mitglieder]]] – außerhalb der Gesamt-Ansicht jeder Knoten für sich
  mergeIds(ids) {
    if (!this.total) return ids.map((id) => [id, [id]]);
    const net = this.p.net;
    const out = [], byMod = new Map();
    for (const id of ids) {
      const k = this.mergeKeyOf(id);
      if (!k) { out.push([id, [id]]); continue; }
      if (byMod.has(k)) byMod.get(k)[1].push(id);
      else { const e = [id, [id]]; byMod.set(k, e); out.push(e); }
    }
    for (const e of out) {
      if (e[1].length < 2) continue;
      e[1].sort((a, b) => (net.nodes.get(a).channel ?? 0) - (net.nodes.get(b).channel ?? 0));
      e[0] = e[1][0];
    }
    return out;
  }

  membersOf(id) {
    return this.mergedMembers?.get(id) ?? [id];
  }

  groupSwitch() {
    const wrap = h("div", { class: "segment wheel group-mode", role: "group", "aria-label": "Gliederung",
      title: "Phasen: je Kasten und Phase · Kästen: nur je Kasten · Gesamt: mehrpolige Geräte als ein Knoten, ohne Phasen" });
    const draw = () => {
      wrap.replaceChildren(h("span", { class: "wl" }, "Gliederung"),
        ...[["phase", "Phasen"], ["cabinet", "Kästen"], ["total", "Gesamt"]].map(([k, l]) => h("button", {
          class: this.groupMode === k ? "active" : "", "aria-pressed": this.groupMode === k ? "true" : "false",
          onclick: () => {
            if (this.groupMode === k) return;
            this.groupMode = k;
            // Gruppen der neuen Gliederung starten eingeklappt wie bisher
            for (const key of [...this.collapsed]) if (key.startsWith("grp:")) this.collapsed.delete(key);
            draw();
            this.render();
            this.fit();
          },
        }, l)));
    };
    draw();
    return wrap;
  }

  // Mausrad: zoomen oder verschieben (pro Browser gespeichert)
  get wheelMode() {
    try {
      return localStorage.getItem("stromnetz.wheel") ?? "zoom";
    } catch {
      return "zoom";
    }
  }

  set wheelMode(v) {
    try {
      localStorage.setItem("stromnetz.wheel", v);
    } catch {
      /* ohne Speicher gilt die Einstellung bis zum Neuladen nicht */
    }
  }

  wheelSwitch() {
    const wrap = h("div", { class: "segment wheel wheel-mode", role: "group", "aria-label": "Mausrad",
      title: "Mausrad: Zoomen (Shift + Rad verschiebt) oder Verschieben (⌘/Strg + Rad zoomt). Mittlere Maustaste ziehen verschiebt immer." });
    const draw = () => {
      wrap.replaceChildren(h("span", { class: "wl" }, "Rad"),
        ...[["zoom", "Zoom"], ["pan", "Verschieben"]].map(([k, l]) => h("button", {
          class: this.wheelMode === k ? "active" : "", "aria-pressed": this.wheelMode === k ? "true" : "false",
          onclick: () => { this.wheelMode = k; draw(); },
        }, l)));
    };
    draw();
    return wrap;
  }

  // ── Anzeige-Baum ───────────────────────────────────────────────────────────
  buildTree() {
    const net = this.p.net;
    this.mergedMembers = new Map();
    this.mergedPrimary = new Map();
    const item = (id, ids = [id]) => {
      if (ids.length > 1) {
        this.mergedMembers.set(id, ids);
        ids.forEach((m) => this.mergedPrimary.set(m, id));
      }
      return { key: id, type: "node", id, ids, children: [] };
    };
    const items = (ids) => this.mergeIds(ids).map(([p, ms]) => fill(item(p, ms)));
    // Nicht verbundene Kanäle eines Geräts erscheinen bei ihrem Kasten (gestrichelt), nicht ganz unten
    const looseByCab = new Map();
    for (const id of net.kids(null)) {
      const n = net.nodes.get(id);
      const cab = n.module ? net.modules.get(n.module)?.cabinet : null;
      if (!cab) continue;
      if (!looseByCab.has(cab)) looseByCab.set(cab, []);
      looseByCab.get(cab).push(id);
    }
    const placed = new Set();
    const looseItems = (cab) => {
      const ids = (looseByCab.get(cab) ?? []).filter((id) => !placed.has(id));
      ids.forEach((id) => placed.add(id));
      return items(ids).map((it) => ({ ...it, loose: true }));
    };
    const fill = (it) => {
      if (this.collapsed.has(it.key)) {
        it.hidden = (it.ids ?? [it.id ?? null]).reduce((a, id) => a + this.countDesc(id), 0);
        return it;
      }
      if (it.type === "node") {
        // Geräte eines Unterverteilers, der an diesem Knoten hängt, unter einer eigenen Kasten-Karte bündeln
        const own = [], sub = new Map();
        for (const c of it.ids.flatMap((x) => net.kids(x))) {
          const cn = net.nodes.get(c);
          const cab = cn.module ? net.modules.get(cn.module)?.cabinet : null;
          if (cab && cab !== net.cabinetOf(it.id)) {
            if (!sub.has(cab)) sub.set(cab, []);
            sub.get(cab).push(c);
          } else own.push(c);
        }
        it.children = [
          ...[...sub].map(([cab, members]) => {
            const key = `cab:${cab}:${it.id}`;
            const g = { key, type: "subcab", cabinet: cab, parentId: it.id, members, children: [] };
            if (this.collapsed.has(key)) g.hidden = members.length + (looseByCab.get(cab)?.length ?? 0);
            else g.children = [...items(members), ...looseItems(cab)];
            return g;
          }),
          ...items(own),
        ];
        const rests = it.ids.map((x) => net.sensorsOf(x).rest).filter(Boolean);
        if (rests.length && it.children.length) {
          it.children.push({ key: `${it.id}:rest`, type: "rest", entity: rests[0], entities: rests, parent: it.id, children: [] });
        }
      }
      return it;
    };
    const groups = new Map();
    for (const id of net.kids(GRID)) {
      const cab = net.cabinetOf(id);
      const ph = net.phase(id);
      const key = this.groupKey(id);
      const byCab = this.groupMode !== "phase";
      if (!groups.has(key)) groups.set(key, { key, type: "group", cabinet: cab, phase: byCab ? null : ph, allPhases: byCab, members: [], children: [] });
      groups.get(key).members.push(id);
    }
    const cabOrder = (c) => { const i = this.p.data.cabinets.findIndex((x) => x.id === c); return i < 0 ? 99 : i; };
    const order = (g) => this.groupMode !== "phase"
      ? cabOrder(g.cabinet)
      : (g.phase ? PHASES.indexOf(g.phase) : 9) * 100 + (g.cabinet ? cabOrder(g.cabinet) : 50);
    const root = { key: "grid", type: "grid", children: [] };
    const sorted = [...groups.values()].sort((a, b) => order(a) - order(b));
    for (const g of sorted) {
      if (this.collapsed.has(g.key)) g.hidden = this.mergeIds(g.members).length;
      else g.children = items(g.members);
      root.children.push(g);
    }
    // Restliche nicht verbundene Kanäle an die Gruppe ihres Kastens hängen (passende Phase bevorzugt)
    for (const [cab, ids] of looseByCab) {
      const byGroup = new Map();
      for (const id of ids) {
        if (placed.has(id)) continue;
        const ph = net.phase(id);
        const g = sorted.find((x) => x.cabinet === cab && (x.allPhases || x.phase === ph)) ?? sorted.find((x) => x.cabinet === cab);
        if (!g || this.collapsed.has(g.key)) continue;
        placed.add(id);
        if (!byGroup.has(g)) byGroup.set(g, []);
        byGroup.get(g).push(id);
      }
      for (const [g, gids] of byGroup) g.children.push(...items(gids).map((it) => ({ ...it, loose: true })));
    }
    if (this.total) {
      const es = PHASES.map((p) => net.gridRestEntity(p)).filter(Boolean);
      if (es.length) root.children.push({ key: "grid:rest", type: "rest", entity: es[0], entities: es, children: [], gridRest: true });
    } else {
      for (const p of PHASES) {
        const e = net.gridRestEntity(p);
        if (e) root.children.push({ key: `grid:rest:${p}`, type: "rest", entity: e, phase: p, children: [], gridRest: true });
      }
    }
    const loose = net.kids(null).filter((id) => !placed.has(id));
    const extra = loose.length
      ? { key: "loose", type: "loose", children: this.collapsed.has("loose") ? [] : items(loose), hidden: this.collapsed.has("loose") ? loose.length : 0 }
      : null;
    return { root, extra };
  }

  countDesc(id) {
    if (!id) return 0;
    const net = this.p.net;
    let n = 0;
    const walk = (k) => net.kids(k).forEach((c) => { n++; walk(c); });
    walk(id);
    return n;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  layout(root, extra) {
    let cursor = 0;
    const place = (it, depth) => {
      it.x = depth * (W + GAP);
      it.h = it.type === "grid" ? GRID_H : H;
      if (!it.children.length) {
        it.y = cursor;
        cursor += it.type === "grid" ? GRID_H + 12 : PITCH;
      } else {
        it.children.forEach((c) => place(c, depth + 1));
        const first = it.children[0], last = it.children[it.children.length - 1];
        it.y = (first.y + first.h / 2 + last.y + last.h / 2) / 2 - it.h / 2;
      }
    };
    place(root, 0);
    if (extra) {
      cursor += PITCH;
      place(extra, 0);
    }
    // Manuelle Verschiebungen (pos.dx/dy) gelten für den ganzen Teilbaum
    const shift = (it, dx, dy) => {
      const n = it.type === "node" ? this.p.net.nodes.get(it.id) : null;
      const ox = dx + (n?.pos?.dx ?? 0), oy = dy + (n?.pos?.dy ?? 0);
      it.x += ox;
      it.y += oy;
      it.children.forEach((c) => shift(c, ox, oy));
    };
    shift(root, 0, 0);
    if (extra) shift(extra, 0, 0);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  breakerLevel() {
    const set = new Set();
    for (const n of this.p.data.nodes) {
      if ((n.module || n.kind === "breaker" || n.kind === "unknown") && n.kind !== "rcd" && this.p.net.kids(n.id).length) set.add(n.id);
    }
    return set;
  }

  render() {
    if (this.firstStart) {
      this.firstStart = false;
      this.collapsed = this.breakerLevel();
      this.saveCollapsed();
    }
    const { root, extra } = this.buildTree();
    this.layout(root, extra);
    this.live = [];
    this.cards = new Map();
    this.stage.replaceChildren(this.edges);
    this.edges.replaceChildren();
    const all = [];
    const walk = (it, parent) => {
      all.push([it, parent]);
      it.children.forEach((c) => walk(c, it));
    };
    walk(root, null);
    if (extra) walk(extra, null);
    let maxX = 0, maxY = 0;
    for (const [it, parent] of all) {
      if (parent) this.edge(parent, it);
      const card = this.card(it);
      this.stage.append(card);
      this.cards.set(it.key, card);
      maxX = Math.max(maxX, it.x + W);
      maxY = Math.max(maxY, it.y + it.h);
    }
    this.edges.setAttribute("width", maxX + 40);
    this.edges.setAttribute("height", maxY + 40);
    this.applyView();
    this.updateValues();
    if (this.p.picking && this.p.pickPending) this.markPickTarget(this.p.pickPending);
    if (!this.fitted && this.el.isConnected) {
      this.fitted = true;
      requestAnimationFrame(() => this.fit());
    }
  }

  phaseColor(p) {
    return (p && this.p.data.settings.colors?.[p]) || NEUTRAL;
  }

  edge(parent, child) {
    const net = this.p.net;
    let y1 = parent.y + parent.h / 2;
    let phase = null;
    if (parent.type === "grid") {
      phase = child.phase ?? null;
      const i = PHASES.indexOf(phase);
      if (i >= 0) y1 = parent.y + H + 12 + i * 24 + 10;
    } else if (parent.type === "group") phase = parent.phase;
    else if (parent.type === "node") phase = net.phase(parent.id);
    else if (parent.type === "subcab") phase = net.phase(parent.parentId);
    // Gesamt-Ansicht: neutral, solange der Ast mehrphasig ist; ab dem ersten einphasigen Knoten farbig
    if (this.total && parent.type !== "grid") {
      const single = (it) => it.type === "node" && !(it.ids?.length > 1);
      phase = single(child) ? net.phase(child.id)
        : child.type === "rest" && single(parent) ? net.phase(parent.id) : null;
    }
    const x1 = parent.x + W, x2 = child.x, y2 = child.y + child.h / 2;
    const mx = Math.min(x1 + GAP / 2, x2 - 8);
    const colored = child.type === "group" || child.type === "subcab" || child.gridRest
      || (child.type === "node" && (["breaker", "unknown", "relay"].includes(net.nodes.get(child.id)?.kind) || net.nodes.get(child.id)?.module));
    const line = (d, stroke) => {
      const path = svg("path", {
        d, fill: "none", stroke,
        "stroke-width": 2,
        "stroke-linejoin": "round",
        "stroke-dasharray": child.type === "rest" ? "5 5" : child.loose ? "2 6" : null,
        opacity: child.type === "rest" || child.loose ? 0.7 : 1,
      });
      this.edges.append(path);
      this.live.push({ kind: "edge", el: path, get: () => this.itemValue(child) });
    };
    const color = colored && phase ? this.phaseColor(phase) : NEUTRAL;
    // Gesamt-Ansicht: der gemeinsame Stamm eines mehrphasigen Knotens bleibt neutral,
    // nur das Stück zum einphasigen Kind ist farbig
    if (this.total && parent.type === "node" && parent.ids?.length > 1 && color !== NEUTRAL) {
      line(`M ${x1} ${y1} H ${mx} V ${y2}`, NEUTRAL);
      line(`M ${mx} ${y2} H ${x2}`, color);
    } else line(`M ${x1} ${y1} H ${mx} V ${y2} H ${x2}`, color);
  }

  itemValue(it) {
    const net = this.p.net, hass = this.p.hass;
    switch (it.type) {
      case "grid":
        return PHASES.reduce((s, p) => s + (net.gridValue(p, hass) ?? 0), 0);
      case "group": {
        const e = it.cabinet && it.phase ? net.cabinetPhaseEntity(it.cabinet, it.phase) : null;
        if (e) return num(hass, e);
        if (it.allPhases && it.cabinet) {
          const es = PHASES.map((p) => net.cabinetPhaseEntity(it.cabinet, p)).filter(Boolean);
          if (es.length) return es.reduce((a, x) => a + (num(hass, x) ?? 0), 0);
        }
        const vals = it.members.map((id) => net.value(id, hass)).filter((v) => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      }
      case "subcab": {
        const vals = it.members.map((id) => net.value(id, hass)).filter((v) => v !== null);
        return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
      }
      case "rest":
        return it.entities ? sum(it.entities.map((e) => num(hass, e))) : num(hass, it.entity);
      case "node":
        return it.ids?.length > 1 ? sum(it.ids.map((id) => net.value(id, hass))) : net.value(it.id, hass);
      default:
        return null;
    }
  }

  card(it) {
    const net = this.p.net;
    const sel = this.p.selection;
    const base = { class: "card", style: { left: `${it.x}px`, top: `${it.y}px`, width: `${W}px`, height: `${it.h}px` }, dataset: { key: it.key } };
    let el;
    if (it.type === "grid") {
      const g = this.p.data.grid;
      el = h("div", { ...base, class: "card grid-card" },
        h("div", { class: "title" }, g.name || "Netzanschluss"),
        h("div", { class: "sub" }, "Hauszuleitung"),
        ...PHASES.map((p) => {
          const v = h("span", { class: "val" });
          this.live.push({ kind: "text", el: v, get: () => net.gridValue(p, this.p.hass) });
          return h("div", { class: "phase-row" }, h("span", { class: "ph", style: { color: this.phaseColor(p) } }, PHASE_LABEL[p]), v,
            h("span", { class: "port", style: { background: this.phaseColor(p) } }));
        }));
      el.addEventListener("contextmenu", (e) => this.p.contextGrid(e));
      el.addEventListener("click", () => (this.p.picking ? this.p.pickTarget({ type: "grid" }) : this.p.openEditor({ type: "grid" })));
    } else if (it.type === "group") {
      const cab = it.cabinet ? net.cabinets.get(it.cabinet) : null;
      const v = h("span", { class: "val", style: { color: this.phaseColor(it.phase) } });
      this.live.push({ kind: "text", el: v, get: () => this.itemValue(it) });
      el = h("div", { ...base, class: `card group-card${it.phase ? " tinted" : ""}`, style: { ...base.style, ...(it.phase ? { "--tint": this.phaseColor(it.phase) } : {}) } },
        h("div", { class: "txt" },
          h("div", { class: "title" }, cab ? cab.name : "Ohne Kasten"),
          h("div", { class: "sub" }, `${cab ? cab.code : "?"} · ${it.allPhases ? `${it.members.length} Abgänge` : it.phase ? PHASE_LABEL[it.phase] : "Phase unbekannt"}${it.hidden ? ` · +${it.hidden} eingeklappt` : ""}`)),
        v);
      el.addEventListener("dblclick", () => this.toggle(it.key));
      el.addEventListener("contextmenu", (e) => this.p.contextGroup(e, it));
      el.addEventListener("click", () => this.p.pickTarget({ type: "group", phase: it.phase, cabinet: it.cabinet }));
    } else if (it.type === "subcab") {
      const cab = net.cabinets.get(it.cabinet);
      const v = h("span", { class: "val" });
      this.live.push({ kind: "text", el: v, get: () => this.itemValue(it) });
      el = h("div", { ...base, class: "card group-card subcab" },
        h("span", { class: "kicon" }, icon(MDI.cabinet, 16)),
        h("div", { class: "txt" }, h("div", { class: "title" }, cab?.name ?? it.cabinet),
          h("div", { class: "sub" }, `${cab?.code ?? "?"} · Unterverteiler · ${it.members.length} Abgänge${it.hidden ? ` · +${it.hidden} eingeklappt` : ""}`)),
        v);
      el.addEventListener("dblclick", () => this.toggle(it.key));
      el.addEventListener("click", () => (this.p.picking ? this.p.pickTarget({ type: "node", id: it.parentId }) : this.p.select({ type: "cabinet", id: it.cabinet })));
    } else if (it.type === "loose") {
      el = h("div", { ...base, class: "card group-card loose" },
        h("div", { class: "txt" }, h("div", { class: "title" }, "Nicht verbunden"),
          h("div", { class: "sub" }, it.hidden ? `+${it.hidden} eingeklappt` : "Knoten ohne Einspeisung")));
      el.addEventListener("dblclick", () => this.toggle("loose"));
    } else if (it.type === "rest") {
      const v = h("span", { class: "val" });
      this.live.push({ kind: "text", el: v, get: () => this.itemValue(it) });
      el = h("div", { ...base, class: "card rest-card" },
        h("div", { class: "txt" }, h("div", { class: "title" }, it.gridRest ? (it.phase ? `${PHASE_LABEL[it.phase]} nicht erfasst` : "Nicht erfasst") : "Sonstiges"),
          h("div", { class: "sub" }, it.gridRest ? "Zuleitung ohne Messung" : "Rest ohne eigenen Zähler")), v);
      el.addEventListener("click", () => this.p.moreInfo(it.entity));
    } else {
      const n = net.nodes.get(it.id);
      const merged = it.ids?.length > 1;
      const phase = merged ? null : net.phase(it.id);
      const v = h("span", { class: "val", style: (n.module || n.kind === "breaker") && phase ? { color: this.phaseColor(phase) } : {} });
      this.live.push({ kind: "text", el: v, get: () => this.itemValue(it) });
      const parent = n.parent && n.parent !== GRID ? n.parent : null;
      const area = net.area(it.id);
      const areaHint = area && (!parent || net.area(parent) !== area) ? net.areaName(area) : null;
      const addr = merged ? (net.address(it.id) ?? "").replace(/\.(L[123]|N|\d+)$/, "") : net.address(it.id);
      const sub = [addr, merged ? `${it.ids.length}-polig` : null, it.loose ? "nicht verbunden" : areaHint, it.hidden ? `+${it.hidden}` : null].filter(Boolean).join(" · ");
      const title = merged ? net.name(it.id, this.p.hass).replace(/\s+(L[123]|Phase [ABC]|N|Kanal \d+)$/i, "") : net.name(it.id, this.p.hass);
      const kindIcon = n.feed_in ? MDI.solar : n.kind === "outlet" ? MDI.outlet : n.switch ? MDI.toggle : null;
      el = h("div", {
        ...base,
        class: `card node-card kind-${n.kind}${it.loose ? " loose-node" : ""}${sel?.type === "node" && sel.id === it.id ? " selected" : ""}${this.p.picking === it.id ? " picking" : ""}${n.meter ? "" : " unmetered"}`,
      },
        kindIcon ? h("span", { class: "kicon" }, icon(kindIcon, 16)) : null,
        h("div", { class: "txt" }, h("div", { class: "title" }, title), h("div", { class: "sub" }, sub)),
        n.switch && !merged ? (() => {
          const t = this.p.toggleButton(n);
          t.addEventListener("pointerdown", (e) => e.stopPropagation());
          this.live.push({ kind: "toggle", el: t, entity: n.switch });
          return t;
        })() : null,
        v);
      const tint = (n.module || n.kind === "breaker" || n.kind === "unknown") && phase ? this.phaseColor(phase) : null;
      if (tint) {
        el.classList.add("tinted");
        el.style.setProperty("--tint", tint);
      }
      el.addEventListener("contextmenu", (e) => this.p.contextNode(e, it.id));
      this.bindDrag(el, it);
    }
    return el;
  }

  updateValues() {
    for (const l of this.live) {
      const v = l.get ? l.get() : null;
      if (l.kind === "toggle") this.p.syncToggle(l.el, l.entity);
      else if (l.kind === "text") l.el.textContent = fmtW(v);
      else l.el.setAttribute("stroke-width", Math.min(1.5 + Math.abs(v ?? 0) / 120, 12).toFixed(1));
    }
  }

  // Ausklappen zeigt nur die direkten Kinder; deren eigene Abgänge bleiben eingeklappt
  // Ausgewähltes Umhänge-Ziel hervorheben, ohne neu zu zeichnen (Doppelklick bleibt möglich)
  markPickTarget(t) {
    this.stage.querySelectorAll(".card.pick-target").forEach((c) => c.classList.remove("pick-target"));
    const key = t.type === "node" ? t.id : t.type === "grid" ? "grid"
      : [...this.cards.keys()].find((k) => k.startsWith("grp:") && k.split(":")[1] === (t.cabinet ?? "-") && (k.split(":")[2] === (t.phase ?? "?") || k.split(":")[2] === "*"));
    this.cards.get(key)?.classList.add("pick-target");
  }

  toggle(key) {
    const net = this.p.net;
    if (this.collapsed.has(key)) {
      this.collapsed.delete(key);
      let kids = [];
      if (net.nodes.has(key)) kids = this.membersOf(key).flatMap((m) => net.kids(m));
      else if (key === "loose") kids = net.kids(null);
      else if (key.startsWith("cab:")) {
        const [, cab, parent] = key.split(":");
        kids = net.kids(parent).filter((c) => net.modules.get(net.nodes.get(c).module ?? "")?.cabinet === cab);
      }
      else if (key.startsWith("grp:")) {
        kids = net.kids(GRID).filter((id) => this.groupKey(id) === key);
      }
      for (const c of kids) if (net.kids(c).length) this.collapsed.add(c);
    } else this.collapsed.add(key);
    this.saveCollapsed();
    this.render();
  }

  collapseTo(kind) {
    this.collapsed = kind === "breaker" ? this.breakerLevel() : new Set();
    this.saveCollapsed();
    this.render();
    this.fit();
  }

  focus(id) {
    const net = this.p.net;
    for (const a of net.ancestors(id)) { this.collapsed.delete(a); this.collapsed.delete(this.mergedPrimary?.get(a)); }
    for (const k of [...this.collapsed]) if (k.startsWith("cab:")) {
      const [, cab, parent] = k.split(":");
      if ((parent === net.nodes.get(id)?.parent || [...net.ancestors(id)].includes(parent)) && net.cabinetOf(id) === cab) this.collapsed.delete(k);
    }
    const root = [id, ...net.ancestors(id)].pop();
    this.collapsed.delete(this.groupKey(root));
    this.saveCollapsed();
    this.render();
    const card = this.cards.get(id) ?? this.cards.get(this.mergedPrimary?.get(id));
    if (!card) return;
    const r = this.el.getBoundingClientRect();
    const x = parseFloat(card.style.left), y = parseFloat(card.style.top);
    this.view.s = Math.max(this.view.s, 0.9);
    this.view.x = r.width / 2 - (x + W / 2) * this.view.s;
    this.view.y = r.height / 2 - (y + H / 2) * this.view.s;
    this.applyView();
  }

  // ── Pan, Zoom, Ziehen ─────────────────────────────────────────────────────
  applyView() {
    this.stage.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.s})`;
  }

  zoomBy(f, cx, cy) {
    const r = this.el.getBoundingClientRect();
    cx ??= r.width / 2;
    cy ??= r.height / 2;
    const s = Math.min(Math.max(this.view.s * f, 0.15), 2.5);
    this.view.x = cx - ((cx - this.view.x) * s) / this.view.s;
    this.view.y = cy - ((cy - this.view.y) * s) / this.view.s;
    this.view.s = s;
    this.applyView();
  }

  fit() {
    const r = this.el.getBoundingClientRect();
    const w = parseFloat(this.edges.getAttribute("width")) || 1, hh = parseFloat(this.edges.getAttribute("height")) || 1;
    if (!r.width) return;
    const cw = Math.max(1, w - 40), ch = Math.max(1, hh - 40); // Inhalt ohne Rand
    this.view.s = Math.min(Math.max(Math.min((r.width - 80) / cw, (r.height - 80) / ch), 0.15), 1.1);
    this.view.x = (r.width - cw * this.view.s) / 2;
    this.view.y = (r.height - ch * this.view.s) / 2;
    this.applyView();
  }

  bindPanZoom() {
    this.el.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      // Pinch (ctrlKey) und ⌘/Strg + Rad zoomen immer. Das normale Rad je nach Einstellung:
      // »zoom« → Rad zoomt, Shift + Rad verschiebt; »pan« → Rad verschiebt
      const wheelZooms = this.wheelMode === "zoom" && !e.shiftKey;
      if (e.ctrlKey || e.metaKey || wheelZooms) {
        const step = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        this.zoomBy(Math.pow(1.0015, -step), e.clientX - r.left, e.clientY - r.top);
      } else {
        const k = e.deltaMode === 1 ? 16 : 1;
        this.view.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
        this.view.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
        this.applyView();
      }
    }, { passive: false });
    // Zeiger-Gesten (Maus, Stift, Touch) zentral in der Capture-Phase:
    //   1 Zeiger  → verschieben (freie Fläche, mittlere Taste, oder Finger auf einer Karte außerhalb des Bearbeitens)
    //   2 Zeiger  → Pinch-Zoom um den Mittelpunkt, verschiebt dabei mit; Tippen/Ziehen der Karte wird verworfen
    this.el.addEventListener("mousedown", (e) => { if (e.button === 1) e.preventDefault(); });
    this.el.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });
    this.pointers = new Map();
    const rel = (e) => {
      const r = this.el.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const startPinch = () => {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0: { ...this.view } };
    };
    this.el.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".flow-controls")) return;
      if (!this.pointers.size) {
        this.gestureCancelled = false;
        this.panMoved = 0;
      }
      this.pointers.set(e.pointerId, rel(e));
      const onCard = !!e.target.closest(".card");
      if (this.pointers.size === 1) {
        this.panning = e.button === 1 || (e.button === 0 && !onCard) || (onCard && e.pointerType === "touch" && !this.p.editing);
        if (e.button === 1) e.preventDefault();
        if (this.panning && !onCard) try { this.el.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      } else if (this.pointers.size === 2) {
        this.panning = false;
        this.gestureCancelled = true;
        startPinch();
      }
    }, true);
    this.el.addEventListener("pointermove", (e) => {
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const cur = rel(e);
      this.pointers.set(e.pointerId, cur);
      if (this.pinch && this.pointers.size >= 2) {
        e.stopPropagation();
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1, m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const { d0, m0, v0 } = this.pinch;
        const s = Math.min(Math.max(v0.s * (d / d0), 0.15), 2.5);
        this.view.s = s;
        this.view.x = m.x - ((m0.x - v0.x) * s) / v0.s;
        this.view.y = m.y - ((m0.y - v0.y) * s) / v0.s;
        this.applyView();
        return;
      }
      if (this.panning && this.pointers.size === 1) {
        this.view.x += cur.x - prev.x;
        this.view.y += cur.y - prev.y;
        this.panMoved += Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
        if (this.panMoved > 8) this.gestureCancelled = true; // war ein Wischen, kein Tippen
        this.applyView();
      }
    }, true);
    const end = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (this.pointers.size === 1 && this.gestureCancelled) this.panning = true; // nach dem Pinch mit einem Finger weiter verschieben
      if (!this.pointers.size) {
        if (this.panning && this.panMoved < 3 && !e.target.closest(".card")) this.p.closeMenu();
        this.panning = false;
      }
    };
    this.el.addEventListener("pointerup", end, true);
    this.el.addEventListener("pointercancel", end, true);
  }

  bindDrag(el, it) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      try { el.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      const move = (ev) => {
        if (this.gestureCancelled && !moved) return;
        const dx = (ev.clientX - sx) / this.view.s, dy = (ev.clientY - sy) / this.view.s;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        moved = this.p.editing && !(e.pointerType === "touch" && this.pointers.size > 1);
        if (!moved) return;
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        el.classList.add("dragging");
      };
      const up = (ev) => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (this.gestureCancelled || ev.type === "pointercancel") {
          // Pinch oder Wischen: weder auswählen noch verschieben
          el.style.transform = "";
          el.classList.remove("dragging");
          return;
        }
        if (!moved) {
          const now = Date.now();
          if (this.lastClick?.key === it.key && now - this.lastClick.t < 400) {
            this.lastClick = null;
            if (this.p.net.kids(it.id).length) this.toggle(it.id);
            return;
          }
          this.lastClick = { key: it.key, t: now };
          if (this.p.picking) this.p.pickTarget({ type: "node", id: it.id });
          else this.p.select({ type: "node", id: it.id });
          return;
        }
        const n = this.p.net.nodes.get(it.id);
        const dx = Math.round((ev.clientX - sx) / this.view.s), dy = Math.round((ev.clientY - sy) / this.view.s);
        n.pos = { dx: (n.pos?.dx ?? 0) + dx, dy: (n.pos?.dy ?? 0) + dy };
        this.p.changed({ layoutOnly: true });
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }
}
