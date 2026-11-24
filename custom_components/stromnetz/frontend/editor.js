// Eigenschaften-Panel für Knoten, Hutschienengeräte, Kästen und den Netzanschluss
import { GRID, KIND_LABEL, MDI, MODULE_TYPE_LABEL, PHASES, PHASES_N, PHASE_LABEL, fmtW, h, icon, num } from "./util.js";

const CURVES = ["B", "C", "D", "K", "Z"];

export class Editor {
  constructor(panel) {
    this.p = panel;
    this.el = h("aside", { class: "drawer" });
    this.live = [];
  }

  get net() {
    return this.p.net;
  }

  render(target) {
    this.live = [];
    if (!target) {
      this.el.replaceChildren();
      this.el.classList.remove("open");
      return;
    }
    this.el.classList.add("open");
    this.lastKey = `${target.type}:${target.id ?? ""}`;
    const body = { node: () => this.node(target.id), module: () => this.module(target.id),
                   cabinet: () => this.cabinet(target.id), grid: () => this.grid() }[target.type]?.();
    this.el.replaceChildren(
      h("div", { class: "dnav" },
        this.p.navStack.length
          ? h("button", { class: "icon-btn", "aria-label": "Zurück", title: "Zurück", onclick: () => this.p.back() }, icon(MDI.back))
          : null,
        h("nav", { class: "crumbs", "aria-label": "Pfad" }, ...this.crumbs(target)),
        h("button", { class: "icon-btn", "aria-label": "Schließen", onclick: () => this.p.select(null) }, icon(MDI.close))),
      body ?? h("p", {}, "Nicht gefunden"));
    const flash = this.el.querySelector(".srow.flash");
    if (flash) flash.scrollIntoView({ block: "nearest" });
    this.updateValues();
  }

  // Scrollposition, Fokus und Cursor merken, um sie nach dem Neuzeichnen desselben Formulars wiederherzustellen
  snapshot() {
    if (!this.el.classList.contains("open")) return null;
    const focusables = [...this.el.querySelectorAll("input, select, textarea, button")];
    const active = this.p.shadowRoot.activeElement;
    const idx = active ? focusables.indexOf(active) : -1;
    return {
      key: this.lastKey, scroll: this.el.scrollTop, idx,
      sel: idx >= 0 && "selectionStart" in active ? [active.selectionStart, active.selectionEnd] : null,
    };
  }

  restore(st) {
    if (!st || st.key !== this.lastKey) return;
    this.el.scrollTop = st.scroll;
    if (st.idx < 0) return;
    const el = [...this.el.querySelectorAll("input, select, textarea, button")][st.idx];
    if (!el) return;
    el.focus({ preventScroll: true });
    if (st.sel && "setSelectionRange" in el) try { el.setSelectionRange(...st.sel); } catch { /* Feldtyp ohne Cursor */ }
    this.el.scrollTop = st.scroll;
  }

  updateValues() {
    for (const l of this.live) {
      if (l.toggle) this.p.syncToggle(l.el, l.entity);
      else l.el.textContent = fmtW(l.get());
    }
  }

  // Pfad oben im Panel: Kasten › Gerät › Kanal › … › aktuelles Element
  crumbs(t) {
    const net = this.net;
    const items = [];
    const nodeCrumb = (id) => {
      const n = net.nodes.get(id);
      const m = n?.module ? net.modules.get(n.module) : null;
      const label = m ? `${m.label}${(net.moduleNodes.get(m.id) ?? []).length > 1 ? `.${n.channel}` : ""}` : net.address(id).split(".").pop();
      return { label, title: `${net.address(id)} ${net.name(id, this.p.hass)}`, target: { type: "node", id } };
    };
    if (t.type === "node" && net.nodes.has(t.id)) {
      const chain = [...net.ancestors(t.id)].reverse();
      const first = chain[0] ?? t.id;
      const cab = net.cabinetOf(first);
      if (cab) items.push({ label: net.cabinets.get(cab).code, title: net.cabinets.get(cab).name, target: { type: "cabinet", id: cab } });
      else items.push({ label: "Netz", title: "Netzanschluss", target: { type: "grid" } });
      for (const a of chain) {
        const n = net.nodes.get(a);
        if (n.module) {
          const m = net.modules.get(n.module);
          if (m && !items.some((i) => i.target.type === "module" && i.target.id === m.id) && (net.moduleNodes.get(m.id) ?? []).length > 1) {
            items.push({ label: m.label, title: net.moduleTitle(m), target: { type: "module", id: m.id } });
          }
        }
        items.push(nodeCrumb(a));
      }
      const n = net.nodes.get(t.id);
      if (n.module && (net.moduleNodes.get(n.module) ?? []).length > 1 && !items.some((i) => i.target.id === n.module)) {
        const m = net.modules.get(n.module);
        items.push({ label: m.label, title: net.moduleTitle(m), target: { type: "module", id: m.id } });
      }
      items.push(nodeCrumb(t.id));
    } else if (t.type === "module" && net.modules.has(t.id)) {
      const m = net.modules.get(t.id);
      items.push({ label: net.cabinets.get(m.cabinet)?.code ?? "?", title: net.cabinets.get(m.cabinet)?.name, target: { type: "cabinet", id: m.cabinet } });
      items.push({ label: m.label || m.id, title: net.moduleTitle(m), target: t });
    } else if (t.type === "cabinet" && net.cabinets.has(t.id)) {
      items.push({ label: net.cabinets.get(t.id).code, title: net.cabinets.get(t.id).name, target: t });
    } else items.push({ label: "Netz", title: "Netzanschluss", target: { type: "grid" } });
    return items.flatMap((it, i) => [
      i ? h("span", { class: "sep", "aria-hidden": "true" }, "›") : null,
      i === items.length - 1
        ? h("span", { class: "crumb current", title: it.title }, it.label)
        : h("button", { class: "crumb", title: it.title, onclick: () => this.p.go(it.target) }, it.label),
    ]);
  }

  // Eingerückter Baum: Kanäle/Abgänge und alles dahinter, mit + zum Anlegen an Ort und Stelle
  structure(title, roots, { includeRoot, chips = true, maxDepth = Infinity }, extra) {
    const net = this.net, hass = this.p.hass;
    const wrap = h("div", { class: `kids structure${title ? "" : " bare"}` }, title ? h("div", { class: "flabel" }, title) : null);
    const kindIcon = { outlet: MDI.outlet, appliance: MDI.power, fixed: MDI.lamp, junction: MDI.junction, relay: MDI.toggle,
                       breaker: MDI.breaker, rcd: MDI.breaker, unknown: MDI.breaker };
    let count = 0;
    const row = (id, depth) => {
      count++;
      const n = net.nodes.get(id);
      const val = h("span", { class: "sval" });
      this.live.push({ el: val, get: () => net.value(id, hass) });
      const tgl = n.switch ? this.p.toggleButton(n) : null;
      if (tgl) this.live.push({ toggle: true, el: tgl, entity: n.switch });
      const add = h("button", { class: "icon-btn small", title: "Dahinter anlegen", "aria-label": `Hinter ${net.name(id, hass)} anlegen`,
        onclick: (e) => { e.stopPropagation(); this.addMenu(e, id); } }, icon(MDI.plus, 16));
      const r = h("div", { class: `srow${this.p.flash === id ? " flash" : ""}`, style: { paddingLeft: `${6 + depth * 18}px` } },
        h("button", { class: "slink", onclick: () => this.p.go({ type: "node", id }) },
          icon(n.feed_in ? MDI.solar : kindIcon[n.kind] ?? MDI.junction, 16),
          h("span", { class: "saddr" }, net.address(id).split(".").pop()),
          h("span", { class: "sname" }, net.name(id, hass))),
        tgl, val, add);
      wrap.append(r);
      const kids = net.kids(id);
      if (kids.length && depth + 1 >= maxDepth) {
        const deep = (k) => net.kids(k).reduce((a, c) => a + 1 + deep(c), 0);
        wrap.append(h("button", { class: "srow more", style: { paddingLeft: `${30 + (depth + 1) * 18}px` }, onclick: () => this.p.go({ type: "node", id }) },
          `… ${deep(id)} weitere dahinter`));
        return;
      }
      for (const c of kids) row(c, depth + 1);
    };
    for (const r of roots) {
      if (includeRoot) row(r, 0);
      else for (const c of net.kids(r)) row(c, 0);
    }
    if (!count) wrap.append(h("div", { class: "hint" }, "Noch nichts angeschlossen."));
    if (!includeRoot && chips) {
      wrap.append(h("div", { class: "row wrap" },
        ...[["outlet", "Steckdose"], ["junction", "Abzweig"], ["fixed", "Festanschluss"], ["appliance", "Gerät"]]
          .map(([kind, l]) => h("button", { class: "chip", onclick: () => this.p.addNode(roots[0], kind, { stay: true }) }, `+ ${l}`))));
    }
    if (extra) wrap.append(extra);
    return wrap;
  }

  addMenu(e, parent) {
    this.p.menu(e.clientX, e.clientY,
      [["outlet", "Steckdose", MDI.outlet], ["junction", "Abzweig / Dose", MDI.junction], ["fixed", "Festanschluss / Leuchte", MDI.lamp], ["appliance", "Gerät", MDI.power]]
        .map(([kind, label, ic]) => ({ label, icon: ic, action: () => this.p.addNode(parent, kind, { stay: true }) }))
        .concat(["-", { label: "Shelly Unterputz / Stecker …", icon: MDI.toggle, action: () => this.p.openFlushPicker(parent) }]),
      `Hinter ${this.net.address(parent)} anlegen`);
  }

  // ── Shelly ────────────────────────────────────────────────────────────────
  shellyRefreshBtn() {
    return h("button", { class: "icon-btn small", title: "Shelly-Liste neu aus HA laden", "aria-label": "Shelly-Liste aktualisieren",
      onclick: async (e) => { e.preventDefault(); await this.p.loadShelly(true); this.p.renderView(); this.p.toast(`${this.p.shelly.devices.length} Shelly-Geräte geladen.`); } },
      icon("M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z", 16));
  }

  shellyReady() {
    if (this.p.shelly && Date.now() - this.p.shelly.t < 600000) return true;
    if (this.p.shelly && !this._shellyLoading) {
      // Veraltet: im Hintergrund neu laden, bis dahin die alte Liste zeigen
      this._shellyLoading = true;
      this.p.loadShelly(true).then(() => { this._shellyLoading = false; this.p.renderView(); });
      return true;
    }
    if (!this._shellyLoading) {
      this._shellyLoading = true;
      this.p.loadShelly().then(() => { this._shellyLoading = false; this.p.renderView(); });
    }
    return false;
  }

  deviceOptions(current, preferModel) {
    const sh = this.p.shelly;
    const norm = (x) => (x ?? "").toLowerCase().replace(/\s*(gen\s*\d|plus|v\d)\b/g, "").replace(/\s+/g, " ").trim();
    const want = norm(preferModel);
    const label = (d) => {
      const use = this.p.deviceUse(d.device_id);
      const area = d.area_id ? this.net.areaName(d.area_id) : null;
      return `${area ? `${area} · ` : ""}${d.name} · ${d.model ?? "?"} · ${d.channels.length} Kan.${use && d.device_id !== current ? ` (bei ${use.label})` : ""}`;
    };
    const coll = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    const areaKey = (d) => (d.area_id ? this.net.areaName(d.area_id) : "~");
    const sorted = sh.devices.slice().sort((a, b) => coll.compare(areaKey(a), areaKey(b)) || coll.compare(a.name ?? "", b.name ?? ""));
    const match = sorted.filter((d) => want && norm(d.model) === want);
    const rest = sorted.filter((d) => !match.includes(d));
    const opt = (d) => h("option", { value: d.device_id, selected: d.device_id === current }, label(d));
    return [h("option", { value: "" }, "— nicht verknüpft —"),
      match.length ? h("optgroup", { label: `Passend: ${preferModel}` }, ...match.map(opt)) : null,
      h("optgroup", { label: "Alle Shelly-Geräte" }, ...rest.map(opt))].filter(Boolean);
  }

  shellyModuleField(m, nodes) {
    if (!this.shellyReady()) return this.field("Shelly-Gerät", h("span", { class: "muted small" }, "Lade Shelly-Geräte …"));
    const sh = this.p.shelly;
    if (!sh.devices.length) return null;
    const sel = h("select", {}, ...this.deviceOptions(m.device, m.model));
    sel.addEventListener("change", () => this.p.linkModuleDevice(m, sel.value || null));
    const selRow = h("div", { class: "row" }, h("div", { class: "grow" }, sel), this.shellyRefreshBtn());
    const dev = m.device ? sh.byId.get(m.device) : null;
    // Vorschlag: Zähler/Schalter eines Kanals gehört schon zu einem Shelly
    const hit = !m.device ? nodes.map((n) => sh.byEntity.get(n.meter) ?? sh.byEntity.get(n.switch)).find(Boolean) : null;
    return h("div", { class: "field" }, h("span", { class: "flabel" }, "Shelly-Gerät"), selRow,
      dev ? h("div", { class: "shelly-hint" }, `${dev.model ?? ""}${dev.model_id ? ` (${dev.model_id})` : ""} · ${dev.channels.length} Kanäle`,
        h("button", { class: "chip", onclick: () => this.p.navigateHA(`/config/devices/device/${dev.device_id}`) }, icon(MDI.link, 16), " In HA")) : null,
      hit ? h("div", { class: "shelly-hint" }, `Die Zähler gehören zu »${hit.dev.name}« (${hit.dev.model}).`,
        h("button", { class: "chip", onclick: () => this.p.linkModuleDevice(m, hit.dev.device_id) }, "Verknüpfen")) : null);
  }

  shellyNodeHint(n, dev) {
    return h("div", { class: "field" }, h("span", { class: "flabel" }, "Shelly-Gerät"),
      h("div", { class: "shelly-hint" }, `Zähler/Schalter gehören zu »${dev.name}« (${dev.model}).`,
        h("button", { class: "chip", onclick: () => this.p.linkNodeDevice(n, dev.device_id, dev.channels.length > 1 ? dev.channels[0].index : null) }, "Verknüpfen")));
  }

  shellyNodeField(n) {
    // Kanal eines Hutschienengeräts: dasselbe Feld wie im Geräte-Formular (verknüpft alle Kanäle)
    if (n.module) {
      const m = this.net.modules.get(n.module);
      if (!m || !(["relay", "meter", "other"].includes(m.type) || m.device || /shelly/i.test(m.model ?? ""))) return null;
      return this.shellyModuleField(m, this.net.moduleNodes.get(m.id) ?? []);
    }
    const isDeviceish = n.model || n.device || ["relay", "junction", "outlet", "appliance", "fixed"].includes(n.kind);
    if (!isDeviceish) return null;
    if (!this.shellyReady()) return null;
    const sh = this.p.shelly;
    const hit = !n.device ? (sh.byEntity.get(n.meter) ?? sh.byEntity.get(n.switch)) : null;
    if (!n.device && !hit) {
      const dev = sh.devices.find((d) => (d.entities ?? []).includes(n.meter) || (d.entities ?? []).includes(n.switch));
      if (dev) return this.shellyNodeHint(n, dev);
    }
    if (!n.device && !n.model && !hit) return null; // normale Knoten ohne Shelly-Bezug nicht zumüllen
    const sel = h("select", {}, ...this.deviceOptions(n.device, n.model));
    sel.addEventListener("change", () => this.p.linkNodeDevice(n, sel.value || null));
    const dev = n.device ? sh.byId.get(n.device) : null;
    const hasChannelKids = this.net.kids(n.id).some((k) => this.net.nodes.get(k).channel);
    let chSel = null;
    if (dev && dev.channels.length > 1 && !hasChannelKids) {
      chSel = h("select", {}, ...dev.channels.map((c) => h("option", { value: c.index, selected: n.device_channel === c.index }, `Kanal ${c.index + 1}${c.name ? ` · ${c.name}` : ""}`)));
      chSel.addEventListener("change", () => this.p.linkNodeDevice(n, dev.device_id, Number(chSel.value)));
    }
    return h("div", { class: "field" }, h("span", { class: "flabel" }, "Shelly-Gerät"),
      h("div", { class: "row" }, h("div", { class: "grow" }, sel), chSel, this.shellyRefreshBtn()),
      dev ? h("div", { class: "shelly-hint" }, `${dev.model ?? ""} · ${dev.channels.length} ${dev.channels.length > 1 ? "Kanäle" : "Kanal"}`,
        h("button", { class: "chip", onclick: () => this.p.navigateHA(`/config/devices/device/${dev.device_id}`) }, icon(MDI.link, 16), " In HA")) : null,
      hit ? h("div", { class: "shelly-hint" }, `Gehört zu »${hit.dev.name}« (${hit.dev.model}), Kanal ${hit.ch.index + 1}.`,
        h("button", { class: "chip", onclick: () => this.p.linkNodeDevice(n, hit.dev.device_id, hit.dev.channels.length > 1 ? hit.ch.index : null) }, "Verknüpfen")) : null);
  }

  // ── Feld-Bausteine ────────────────────────────────────────────────────────
  field(label, input, hint) {
    return h("label", { class: "field" }, h("span", { class: "flabel" }, label), input, hint ? h("span", { class: "hint" }, hint) : null);
  }

  text(label, obj, key, { placeholder, hint, list, multiline, transform } = {}) {
    const tag = multiline ? "textarea" : "input";
    const inp = h(tag, { value: obj[key] ?? "", placeholder: placeholder ?? "", list, rows: multiline ? 1 : undefined, class: multiline ? "autosize" : undefined });
    if (multiline) {
      const fit = () => { inp.style.height = "auto"; inp.style.height = `${inp.scrollHeight + 2}px`; };
      inp.addEventListener("input", fit);
      requestAnimationFrame(fit);
    }
    inp.addEventListener("change", () => {
      let v = inp.value.trim();
      if (transform) v = transform(v);
      obj[key] = v === "" ? null : v;
      this.p.changed({ deferred: true });
    });
    return this.field(label, inp, hint);
  }

  number(label, obj, key, { min, max, offset = 0, hint, placeholder } = {}) {
    const inp = h("input", { type: "number", value: obj[key] === null || obj[key] === undefined ? "" : obj[key] + offset, min, max, placeholder: placeholder ?? "" });
    inp.addEventListener("change", () => {
      obj[key] = inp.value === "" ? null : Number(inp.value) - offset;
      this.p.changed({ deferred: true });
    });
    return this.field(label, inp, hint);
  }

  select(label, obj, key, options, { hint, onchange } = {}) {
    const sel = h("select", {}, ...options.map(([v, l]) => h("option", { value: v ?? "", selected: (obj[key] ?? "") === (v ?? "") }, l)));
    sel.addEventListener("change", () => {
      obj[key] = sel.value === "" ? null : sel.value;
      onchange?.(obj[key]);
      this.p.changed({ deferred: true });
    });
    return this.field(label, sel, hint);
  }

  check(label, obj, key) {
    const inp = h("input", { type: "checkbox", checked: !!obj[key] });
    inp.addEventListener("change", () => {
      obj[key] = inp.checked;
      this.p.changed({ deferred: true });
    });
    return h("label", { class: "field check" }, inp, h("span", {}, label));
  }

  segment(label, obj, key, options, inherited) {
    const wrap = h("div", { class: "segment" });
    for (const [v, l, color] of options) {
      const active = (obj[key] ?? null) === v;
      wrap.append(h("button", {
        class: active ? "active" : "", style: active && color ? { background: color, color: "#fff" } : {},
        onclick: (e) => { e.preventDefault(); obj[key] = v; this.p.changed({ deferred: true }); },
      }, l));
    }
    return this.field(label, wrap, obj[key] === null && inherited ? `erbt: ${inherited}` : null);
  }

  areaOptions(inherited) {
    const areas = Object.entries(this.p.desc.areas ?? {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
    const pots = Object.entries(this.p.data.pots ?? {});
    return [[null, inherited ? `— erbt: ${this.net.areaName(inherited)} —` : "— keine —"],
      ...pots.map(([k, v]) => [k, `${v.name} (Topf)`]),
      ...areas.map(([k, v]) => [k, v.name])];
  }

  valueBox(get, entity) {
    const v = h("span", { class: "big" });
    this.live.push({ el: v, get });
    return h("div", { class: "valuebox" }, v,
      entity ? h("button", { class: "chip", onclick: () => this.p.moreInfo(entity) }, icon(MDI.history, 16), " Verlauf") : null);
  }

  // ── Knoten ────────────────────────────────────────────────────────────────
  node(id) {
    const net = this.net, n = net.nodes.get(id);
    if (!n) return null;
    const parentArea = n.parent && n.parent !== GRID ? net.area(n.parent) : null;
    const parentPhase = n.parent && n.parent !== GRID ? net.phase(n.parent) : null;
    const modules = this.p.data.modules.filter((m) => m.type !== "rcd")
      .map((m) => [m.id, `${net.moduleTitle(m)}${m.model ? ` · ${m.model}` : ""}`]);
    const rest = net.sensorsOf(id).rest;
    const parentLabel = n.parent === GRID ? "Hauszuleitung" : n.parent ? `${net.address(n.parent)} ${net.name(n.parent, this.p.hass)}` : "nicht verbunden";
    const kids = net.kids(id);
    const cols = this.p.data.settings.colors;
    return h("div", { class: "form" },
      h("div", { class: "dhead" },
        h("div", {}, h("div", { class: "dtitle" }, net.name(id, this.p.hass)), h("div", { class: "muted" }, `${net.address(id)} · ${KIND_LABEL[n.kind]}`))),
      this.valueBox(() => net.value(id, this.p.hass), n.meter),
      rest ? h("div", { class: "muted small" }, "Sonstiges: ", (() => { const s = h("span"); this.live.push({ el: s, get: () => num(this.p.hass, rest) }); return s; })()) : null,
      this.text("Name", n, "name", { placeholder: n.meter ? net.name(id, this.p.hass) : "" }),
      this.select("Art", n, "kind", Object.entries(KIND_LABEL)),
      this.meterField(n),
      this.shellyNodeField(n),
      ["relay", "outlet", "appliance", "fixed"].includes(n.kind) || n.switch
        ? this.text("Schalter", n, "switch", { list: "sn-switch", placeholder: "switch.…" }) : null,
      this.select("Area / Topf", n, "area", this.areaOptions(parentArea)),
      this.segment("Phase", n, "phase", [[null, "erbt"], ...(n.kind === "rcd" ? PHASES_N : PHASES).map((p) => [p, PHASE_LABEL[p], cols[p] ?? "#7d8a96"])], parentPhase ? PHASE_LABEL[parentPhase] : null),
      this.check("Einspeisung (Erzeugung, z. B. Wechselrichter)", n, "feed_in"),
      h("div", { class: "field" }, h("span", { class: "flabel" }, "Hängt an"),
        h("div", { class: "row" }, h("span", { class: "grow" }, parentLabel),
          h("button", { class: "chip", onclick: () => this.p.startPick(id) }, icon(MDI.move, 16), " Umhängen"))),
      h("details", { open: !!n.module },
        h("summary", {}, "Hutschienengerät"),
        this.select("Gerät", n, "module", [[null, "— keines —"], ...modules]),
        n.module ? this.number("Kanal / Pol", n, "channel", { min: 1, max: 12 }) : null,
        n.module ? h("button", { class: "chip", onclick: () => this.p.showModule(n.module) }, icon(MDI.cabinet, 16), " Im Schaltschrank zeigen") : null),
      h("details", {},
        h("summary", {}, "Adresse, ID, Notizen"),
        this.text("Adress-Segment", n, "label", { placeholder: n.module ? "aus Gerät" : "automatisch", hint: "Überschreibt z. B. X3 im Adress-Pfad" }),
        this.field("Knoten-ID", h("input", { value: n.id, readonly: true }), "Basis der Sensor-IDs, bleibt beim Umbenennen gleich"),
        this.text("Sonstiges-ID", n, "sonstiges_id", { placeholder: `${n.id}_sonstiges_leistung` }),
        this.text("Notizen", n, "notes", { multiline: true })),
      this.structure("Struktur", [id], { includeRoot: false, parent: id }),
      h("div", { class: "row end" },
        h("button", { class: "chip danger", onclick: () => this.p.removeNode(id) }, icon(MDI.del, 16), " Entfernen")));
  }

  // Zählerfeld: ein Zähler darf nur einmal vorkommen – bei Doppelung Verschieben anbieten
  meterField(n) {
    const net = this.net;
    const inp = h("input", { value: n.meter ?? "", placeholder: "sensor.…_leistung", list: "sn-power" });
    inp.addEventListener("change", () => {
      const v = inp.value.trim() || null;
      const other = v ? this.p.data.nodes.find((x) => x.id !== n.id && x.meter === v) : null;
      const grid = v ? Object.entries(this.p.data.grid.phases).find(([, g]) => g.meter === v) : null;
      if (grid) {
        this.p.toast(`${v} ist schon der Zähler der Hauszuleitung ${PHASE_LABEL[grid[0]]}.`);
        inp.value = n.meter ?? "";
        return;
      }
      if (other) {
        const where = other.parent && other.parent !== GRID ? `${net.address(other.parent)} ${net.name(other.parent, this.p.hass)}` : "Hauszuleitung";
        const msg = `${v} ist schon bei »${net.name(other.id, this.p.hass)}« (${net.address(other.id)}) eingetragen, hängt an: ${where}.\n\n`
          + `OK: diesen bestehenden Knoten an die Stelle von »${net.name(n.id, this.p.hass)}« verschieben${this.p.isBlank(n) ? " (der neue, leere Knoten wird entfernt)" : ""}.\nAbbrechen: nichts ändern.`;
        if (confirm(msg)) this.p.replaceWithExisting(n.id, other.id);
        else inp.value = n.meter ?? "";
        return;
      }
      n.meter = v;
      this.p.changed({ deferred: true });
    });
    const mm = !n.meter ? net.mountMeters?.get(n.id) : null;
    const from = mm ? net.modules.get(mm.from) : null;
    return this.field("Zähler (Leistung)", inp,
      from ? `Leer gelassen: kommt vom Anbaugerät ${net.moduleTitle(from)} (Kanal ${mm.channel + 1}, ${mm.entity})` : undefined);
  }

  // ── Hutschienengerät ──────────────────────────────────────────────────────
  module(id) {
    const net = this.net, m = net.modules.get(id);
    if (!m) return null;
    if (m.mount) return this.mountForm(m);
    const hass = this.p.hass;
    const nodes = net.moduleNodes.get(id) ?? [];
    const cols = this.p.data.settings.colors;
    const isBreaker = ["breaker", "rcbo"].includes(m.type), isRcd = m.type === "rcd";
    const phaseList = isRcd ? PHASES_N : PHASES;

    const channelCard = (n) => {
      const parentPhase = n.parent && n.parent !== GRID ? net.phase(n.parent) : null;
      const val = h("span", { class: "ch-val" });
      if (!isRcd) this.live.push({ el: val, get: () => net.value(n.id, hass) });
      const tgl = n.switch ? this.p.toggleButton(n) : null;
      if (tgl) this.live.push({ toggle: true, el: tgl, entity: n.switch });
      const title = nodes.length > 1 ? (isRcd && n.phase ? PHASE_LABEL[n.phase] : `Kanal ${n.channel ?? "?"}`) : "Stromkreis";
      return h("section", { class: "channel" },
        h("div", { class: "ch-head" },
          h("b", {}, title), h("span", { class: "muted grow" }, net.address(n.id)), tgl, val,
          h("button", { class: "icon-btn small", title: "Alle Einstellungen des Kanals", "aria-label": `${title} öffnen`, onclick: () => this.p.go({ type: "node", id: n.id }) }, icon(MDI.pencil, 16))),
        this.text(isRcd ? "Bezeichnung" : "Bezeichnung des Stromkreises", n, "name", { placeholder: isRcd ? `FI ${m.label}` : "z. B. Küche Arbeitsplatte" }),
        this.segment("Phase", n, "phase", [[null, "erbt"], ...phaseList.map((p) => [p, PHASE_LABEL[p], cols[p] ?? "#7d8a96"])], parentPhase ? PHASE_LABEL[parentPhase] : null),
        this.structure(null, [n.id], { includeRoot: false, chips: false, maxDepth: 2 }),
        h("div", { class: "row" }, h("button", { class: "chip", onclick: (e) => { e.stopPropagation(); this.addMenu(e, n.id); } }, icon(MDI.plus, 16), " Dahinter anschließen")));
    };

    return h("div", { class: "form" },
      h("div", { class: "dhead" }, h("div", {},
        h("div", { class: "dtitle" }, `${net.moduleTitle(m)}`),
        h("div", { class: "muted" }, `${MODULE_TYPE_LABEL[m.type]}${m.model ? ` · ${m.model}` : ""}${m.row !== null ? ` · Reihe ${m.row + 1}, Platz ${m.slot + 1}` : " · nicht platziert"}`))),
      !isRcd ? this.valueBox(() => {
        const v = nodes.map((n) => net.value(n.id, hass)).filter((x) => x !== null);
        return v.length ? v.reduce((a, b) => a + b, 0) : null;
      }) : null,
      h("div", { class: "grid2" },
        this.text("Bezeichnung im Kasten", m, "label", { placeholder: "F12, K1, Q1 …" }),
        this.select("Typ", m, "type", Object.entries(MODULE_TYPE_LABEL))),
      isBreaker ? h("div", { class: "grid-cr" },
        this.segment("Charakteristik", m, "curve", [[null, "–"], ...CURVES.map((c) => [c, c])]),
        this.number("Nennstrom (A)", m, "rating", { min: 1, placeholder: "offen" })) : null,
      isRcd || m.type === "rcbo" ? h("div", { class: "grid2" },
        isRcd ? this.number("Nennstrom (A)", m, "rating", { min: 1, placeholder: "offen" }) : h("span"),
        this.number("Fehlerstrom (mA)", m, "rcd_ma", { min: 10 })) : null,
      nodes.length ? this.uplinkField(m, nodes) : null,
      ["relay", "meter", "other"].includes(m.type) || m.device || /shelly/i.test(m.model ?? "") ? this.shellyModuleField(m, nodes) : null,

      h("div", { class: "channels" },
        h("div", { class: "sec-title" }, nodes.length > 1 ? `Kanäle (${nodes.length})` : nodes.length ? "Stromkreis" : "Kanäle"),
        ...nodes.map(channelCard),
        !nodes.length && isRcd
          ? h("div", { class: "hint" }, "Dieser FI ist noch nicht im Fluss. Mit Kanälen L1–L3 und N bekommt er eine Einspeisung (Uplink), und die zugeordneten Sicherungen hängen dahinter.")
          : null,
        !nodes.length && !isRcd ? h("div", { class: "hint" }, "Keine Kanäle.") : null,
        h("div", { class: "row wrap" },
          !nodes.length && isRcd ? h("button", { class: "chip", onclick: () => this.p.addRcdChannels(id) }, "+ Kanäle L1–L3 und N anlegen") : null,
          !isRcd ? h("button", { class: "chip", onclick: () => this.p.addChannel(id) }, "+ Kanal") : null)),

      h("details", { class: "sec" },
        h("summary", {}, "Einbau und Modell"),
        h("div", { class: "grid4" },
          this.number("Breite (TE)", m, "width", { min: 1, max: 12 }),
          this.number("Pole", m, "poles", { min: 1, max: 4 }),
          this.number("Reihe", m, "row", { min: 1, offset: 1 }),
          this.number("Platz", m, "slot", { min: 1, offset: 1 })),
        this.text("Hersteller / Modell", m, "model", { placeholder: "optional, z. B. Hager MBN116", hint: "Nur das Gerät selbst – der Name des Stromkreises steht beim Kanal" })),
      this.text("Notizen", m, "notes", { multiline: true, placeholder: "Notiz …" }),
      h("div", { class: "row end" },
        h("button", { class: "chip danger", onclick: () => this.p.removeModule(id) }, icon(MDI.del, 16), " Gerät entfernen")));
  }

  // Anbaugerät (über/unter einer Reihe): je Kanal ein Zähler, den das Gerät darunter übernimmt
  mountForm(m) {
    const net = this.net, hass = this.p.hass;
    m.meters ??= [];
    const targets = net.mountTargets(m);
    const channel = (i) => {
      const t = targets[i];
      const node = t?.node ? net.nodes.get(t.node) : null;
      const inp = h("input", { value: m.meters[i] ?? "", placeholder: "sensor.…_leistung", list: "sn-power" });
      inp.addEventListener("change", () => {
        m.meters[i] = inp.value.trim() || null;
        this.p.changed({ deferred: true });
      });
      const val = h("span", { class: "ch-val" });
      this.live.push({ el: val, get: () => num(hass, m.meters[i]) });
      const own = node?.meter && node.meter !== m.meters[i];
      return h("section", { class: "channel" },
        h("div", { class: "ch-head" }, h("b", {}, `Kanal ${i + 1}`),
          h("span", { class: "muted grow" }, node ? `→ ${net.address(node.id)} · ${net.name(node.id, hass)}` : "kein Gerät darunter"), val,
          node ? h("button", { class: "icon-btn small", title: "Gerät darunter öffnen", "aria-label": "Gerät darunter öffnen", onclick: () => this.p.go({ type: "node", id: node.id }) }, icon(MDI.pencil, 16)) : null),
        this.field("Zähler (Leistung)", inp),
        own ? h("div", { class: "hint" }, `${net.address(node.id)} hat einen eigenen Zähler (${node.meter}); dieser Kanal wird dort nicht verwendet.`) : null);
    };
    const setCount = (n) => {
      if (n < 1) return;
      m.meters = Array.from({ length: n }, (_, i) => m.meters[i] ?? null);
      m.poles = n;
      this.p.changed();
    };
    return h("div", { class: "form" },
      h("div", { class: "dhead" }, h("div", {},
        h("div", { class: "dtitle" }, net.moduleTitle(m)),
        h("div", { class: "muted" }, `Anbaugerät ${m.mount === "top" ? "oben" : "unten"}${m.model ? ` · ${m.model}` : ""}${m.row !== null ? ` · Reihe ${m.row + 1}, ab Platz ${m.slot + 1}` : " · nicht platziert"}`))),
      this.valueBox(() => {
        const v = (m.meters ?? []).map((e) => num(hass, e)).filter((x) => x !== null);
        return v.length ? v.reduce((a, b) => a + b, 0) : null;
      }),
      h("div", { class: "hint" }, "Kein eigener Knoten im Fluss: Jeder Kanal gibt seinen Zähler an das Gerät darunter weiter, bei mehrpoligen an den passenden Pol."),
      h("div", { class: "grid2" },
        this.text("Bezeichnung im Kasten", m, "label", { placeholder: "P1, Q1 …" }),
        this.select("Anbauort", m, "mount", [["top", "über der Reihe"], ["bottom", "unter der Reihe"]])),
      this.shellyModuleField(m, []),
      h("div", { class: "channels" },
        h("div", { class: "sec-title" }, `Kanäle (${m.meters.length})`),
        ...m.meters.map((_, i) => channel(i)),
        h("div", { class: "row wrap" },
          h("button", { class: "chip", onclick: () => setCount(m.meters.length + 1) }, "+ Kanal"),
          m.meters.length > 1 ? h("button", { class: "chip", onclick: () => setCount(m.meters.length - 1) }, "− Kanal") : null)),
      h("details", { class: "sec" },
        h("summary", {}, "Einbau und Modell"),
        h("div", { class: "grid4" },
          this.number("Breite (TE)", m, "width", { min: 1, max: 12 }),
          this.number("Reihe", m, "row", { min: 1, offset: 1 }),
          this.number("Platz", m, "slot", { min: 1, offset: 1 })),
        this.text("Hersteller / Modell", m, "model", { placeholder: "z. B. Shelly 3EM-63 Gen3" })),
      this.text("Notizen", m, "notes", { multiline: true, placeholder: "Notiz …" }),
      h("div", { class: "row end" },
        h("button", { class: "chip danger", onclick: () => this.p.removeModule(m.id) }, icon(MDI.del, 16), " Anbaugerät entfernen")));
  }

  // »Gespeist von«: vorgelagertes Gerät aus einem beliebigen Kasten, die Kasten-Einspeisung oder nichts
  uplinkField(m, nodes) {
    const net = this.net;
    const cab = net.cabinets.get(m.cabinet);
    const current = this.p.uplinkOf(m);
    const own = new Set(nodes.map((n) => n.id));
    const blocked = (x) => (net.moduleNodes.get(x.id) ?? []).some((t) => own.has(t.id) || [...own].some((o) => net.isDescendant(t.id, o)));
    const typeShort = { breaker: "LS", rcd: "FI", rcbo: "FI/LS", relay: "Relais", meter: "Messung", other: "Gerät" };
    const feedLabel = cab.feed ? `Einspeisung des Kastens (${net.address(cab.feed) || cab.feed})` : "Einspeisung des Kastens (Hauszuleitung)";
    const opt = (v, l) => h("option", { value: v, selected: current === v }, l);
    const groups = this.p.data.cabinets.map((c) => {
      const mods = this.p.data.modules.filter((x) => x.cabinet === c.id && x.id !== m.id && (net.moduleNodes.get(x.id) ?? []).length && !blocked(x))
        .sort((a, b) => (a.type === "rcd" ? 0 : 1) - (b.type === "rcd" ? 0 : 1) || (a.row ?? 99) - (b.row ?? 99) || (a.slot ?? 0) - (b.slot ?? 0));
      if (!mods.length) return null;
      return h("optgroup", { label: `${c.code} · ${c.name}${c.id === m.cabinet ? " (dieser Kasten)" : ""}` },
        ...mods.map((x) => {
          const first = net.moduleNodes.get(x.id)[0];
          const name = (net.moduleNodes.get(x.id).length === 1 ? net.name(first.id, this.p.hass) : x.model) ?? "";
          return opt(x.id, `${net.moduleTitle(x)} · ${typeShort[x.type] ?? x.type}${x.rating ? (x.type === "rcd" ? ` ${x.rating} A` : ` ${x.curve ?? ""}${x.rating}`) : ""}${x.rcd_ma ? ` / ${x.rcd_ma} mA` : ""}${name ? ` · ${name}` : ""}`);
        }));
    });
    const sel = h("select", {},
      current === "mixed" ? opt("mixed", "— gemischt (Kanäle einzeln umgehängt) —") : null,
      opt("feed", feedLabel),
      opt("none", "— nicht verbunden —"),
      ...groups.filter(Boolean));
    sel.addEventListener("change", () => this.p.setUplink(m, sel.value));
    return this.field("Gespeist von", sel, "Jeder Kanal hängt am Kanal gleicher Phase des gewählten Geräts – z. B. hinter einem FI in einem anderen Kasten.");
  }

  // ── Kasten ────────────────────────────────────────────────────────────────
  cabinet(id) {
    const net = this.net, c = net.cabinets.get(id);
    if (!c) return null;
    const feeds = this.p.data.nodes.filter((n) => net.cabinetOf(n.id) !== id)
      .map((n) => [n.id, `${net.address(n.id)} ${net.name(n.id, this.p.hass)}`]).sort((a, b) => a[1].localeCompare(b[1]));
    return h("div", { class: "form" },
      h("div", { class: "dhead" }, h("div", {}, h("div", { class: "dtitle" }, `${c.code} – ${c.name}`), h("div", { class: "muted" }, "Sicherungskasten"))),
      h("div", { class: "grid2" },
        this.text("Kürzel", c, "code", { hint: "Beginn jeder Adresse, z. B. HV, UV1, UVK", transform: (v) => v.replace(/[^A-Za-z0-9]/g, "") }),
        this.text("Name", c, "name")),
      this.select("Area", c, "area", this.areaOptions(null)),
      h("div", { class: "grid2" },
        this.number("Reihen", c, "rows", { min: 1, max: 12 }),
        this.number("Breite (TE)", c, "width", { min: 4, max: 36 })),
      (() => {
        // Mehrpolige Sicherungen einmal als Ganzes anbieten (gespeichert wird der erste Kanal)
        const multi = new Map();
        for (const m of this.p.data.modules) {
          const ns = net.moduleNodes.get(m.id) ?? [];
          if (ns.length > 1 && m.cabinet !== id && m.type !== "rcd") multi.set(ns[0].id, `${net.moduleTitle(m)} · ${ns.length}-polig, alle Phasen`);
        }
        const sel = h("select", {},
          h("option", { value: "" }, "— Hauszuleitung —"),
          multi.size ? h("optgroup", { label: "Mehrpolige Sicherungen" }, ...[...multi].map(([v, l]) => h("option", { value: v, selected: c.feed === v }, l))) : null,
          h("optgroup", { label: "Einzelne Knoten" }, ...feeds.filter(([v]) => !multi.has(v)).map(([v, l]) => h("option", { value: v, selected: c.feed === v }, l))));
        sel.addEventListener("change", () => this.p.setCabinetFeed(c.id, sel.value || null));
        return this.field("Gespeist von", sel, "Unterverteiler: die speisende Sicherung. Bei mehrpoligen hängt jedes Gerät am Kanal seiner Phase.");
      })(),
      this.text("Notizen", c, "notes", { multiline: true }),
      h("div", { class: "row end" },
        h("button", { class: "chip danger", onclick: () => this.p.removeCabinet(id) }, icon(MDI.del, 16), " Kasten entfernen")));
  }

  // ── Netzanschluss ─────────────────────────────────────────────────────────
  grid() {
    const g = this.p.data.grid, s = this.p.data.settings;
    return h("div", { class: "form" },
      h("div", { class: "dhead" }, h("div", {}, h("div", { class: "dtitle" }, g.name || "Netzanschluss"), h("div", { class: "muted" }, "Hauszuleitung je Phase"))),
      this.valueBox(() => PHASES.reduce((a, p) => a + (num(this.p.hass, g.phases[p]?.meter) ?? 0), 0)),
      this.text("Name", g, "name"),
      ...PHASES.map((p) => this.text(`Zähler ${PHASE_LABEL[p]}`, g.phases[p], "meter", { list: "sn-power", placeholder: "sensor.…" })),
      this.select("Topf für »nicht erfasst«", g, "pot", this.areaOptions(null)),
      h("div", { class: "grid3" }, ...PHASES.map((p) => {
        const inp = h("input", { type: "color", value: s.colors[p] });
        inp.addEventListener("change", () => { s.colors[p] = inp.value; this.p.changed({ layoutOnly: true }); });
        return this.field(`Farbe ${PHASE_LABEL[p]}`, inp);
      })));
  }
}
