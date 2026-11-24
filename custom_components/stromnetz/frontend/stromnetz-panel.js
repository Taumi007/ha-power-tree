// Stromnetz-Panel: Fluss, Schaltschrank, Bilanz, Daten
import { CabinetView } from "./cabinet.js";
import { Editor } from "./editor.js";
import { FlowView } from "./flow.js";
import { Net } from "./net.js";
import { STYLE } from "./style.js";
import { CATALOG, CATALOG_BY_KEY, catalogForDevice, dinVariant, itemWidth, ratingColor } from "./catalog.js";
import { roomSankey } from "./sankey.js";
import { LABEL_DEFAULTS, labelPlan, printLabelSheets } from "./print.js";
import { GRID, KIND_LABEL, MDI, PHASES, PHASE_LABEL, clone, debounce, fireMoreInfo, fmtW, h, icon, newId, num, slug } from "./util.js";

const TABS = [["flow", "Fluss"], ["cabinet", "Schaltschrank"], ["balance", "Bilanz"], ["data", "Daten"]];
const LABEL_PREFIX = { breaker: "F", rcbo: "F", rcd: "FI", relay: "K", meter: "P", other: "Z" };

class StromnetzPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.tab = "flow";
    this.dirty = false;
    this.editing = false;
    this.selection = null;
    this.navStack = [];
    this.flash = null;
    this.picking = null;
    this.data = null;
    this.desc = null;
    this.validate = debounce(() => this.revalidate(), 600);
    this.liveTick = debounce(() => this.updateValues(), 250);
    window.addEventListener("beforeunload", (e) => {
      if (this.dirty) e.preventDefault();
    });
  }

  // Höhe = sichtbarer Bereich ab der Oberkante des Panels (iOS: Safe Areas, Browserleisten, Companion-App)
  connectedCallback() {
    this._fitHeight = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const top = Math.max(0, this.getBoundingClientRect().top);
      this.style.height = `${Math.max(240, Math.floor(vh - top))}px`;
    };
    this._fitHeight();
    requestAnimationFrame(this._fitHeight);
    window.addEventListener("resize", this._fitHeight);
    window.visualViewport?.addEventListener("resize", this._fitHeight);
    window.addEventListener("orientationchange", this._fitHeight);
  }

  disconnectedCallback() {
    window.removeEventListener("resize", this._fitHeight);
    window.visualViewport?.removeEventListener("resize", this._fitHeight);
    window.removeEventListener("orientationchange", this._fitHeight);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // Menüknopf wie in HA: nur bei schmalem Fenster oder dauerhaft ausgeblendeter Seitenleiste
    this.toggleAttribute("sidebar-hidden", hass?.dockedSidebar === "always_hidden");
    if (first) this.load();
    else this.liveTick();
  }

  get hass() {
    return this._hass;
  }

  set narrow(v) {
    this._narrow = v;
    this.toggleAttribute("narrow", !!v);
  }

  set panel(v) {
    this._panel = v;
  }

  // ── Daten ─────────────────────────────────────────────────────────────────
  async load() {
    this.renderShell();
    try {
      this.desc = await this.hass.callWS({ type: "stromnetz/get" });
    } catch (err) {
      this.main.replaceChildren(h("p", { class: "empty" }, `Stromnetz konnte nicht geladen werden: ${err.message ?? err}`));
      return;
    }
    try {
      this.data = clone(this.desc.data);
      this.net = new Net(this.data, this.desc);
      this.flow = new FlowView(this);
      this.cabinetView = new CabinetView(this);
      this.editor = new Editor(this);
      this.buildDatalists();
      this.render();
    } catch (err) {
      console.error("Stromnetz", err);
      this.main.replaceChildren(h("pre", { class: "empty" }, `Stromnetz-Panel: ${err.stack ?? err}`));
    }
  }

  async revalidate() {
    try {
      const res = await this.hass.callWS({ type: "stromnetz/validate", data: this.data });
      this.desc = { ...this.desc, ...res, data: this.desc.data };
      this.net = new Net(this.data, this.desc);
      this.renderView();
      this.renderStatus();
    } catch (err) {
      this.toast(`Prüfung fehlgeschlagen: ${err.message ?? err}`);
    }
  }

  changed({ layoutOnly = false, deferred = false } = {}) {
    this.dirty = true;
    this.net = new Net(this.data, this.desc);
    if (deferred) {
      // Aus Formularfeldern: erst nach dem Fokuswechsel neu zeichnen, damit das angeklickte Feld erhalten bleibt
      clearTimeout(this._deferT);
      this._deferT = setTimeout(() => { this.renderView(); this.renderStatus(); }, 0);
    } else {
      this.renderView();
      this.renderStatus();
    }
    if (!layoutOnly) this.validate();
  }

  async save() {
    this.saveBtn.disabled = true;
    try {
      const res = await this.hass.callWS({ type: "stromnetz/save", data: this.data });
      this.desc = res;
      if (res.saved) {
        this.data = clone(res.data);
        this.dirty = false;
        this.toast("Gespeichert. Sensoren werden neu geladen.");
        setTimeout(() => this.reloadDesc(), 2500);
      } else this.toast("Nicht gespeichert – bitte Fehler beheben.");
      this.net = new Net(this.data, this.desc);
      this.renderView();
    } catch (err) {
      this.toast(`Speichern fehlgeschlagen: ${err.message ?? err}`);
    }
    this.renderStatus();
  }

  async reloadDesc() {
    if (this.dirty) return;
    try {
      this.desc = await this.hass.callWS({ type: "stromnetz/get" });
      this.data = clone(this.desc.data);
      this.net = new Net(this.data, this.desc);
      this.renderView();
    } catch {
      /* nächster Versuch beim nächsten Laden */
    }
  }

  discard() {
    if (!this.dirty || !confirm("Alle ungespeicherten Änderungen verwerfen?")) return;
    this.data = clone(this.desc.data);
    this.dirty = false;
    this.selection = null;
    this.revalidate();
  }

  // ── Grundgerüst ───────────────────────────────────────────────────────────
  renderShell() {
    this.shadowRoot.replaceChildren();
    const style = h("style", {}, STYLE);
    this.search = h("input", { type: "search", placeholder: "Knoten oder Adresse suchen", list: "sn-search", "aria-label": "Knoten suchen" });
    this.search.addEventListener("change", () => { this.doSearch(this.search.value); this.header?.classList.remove("searching"); });
    // Auf dem Handy nur Symbole (Beschriftung per CSS ausgeblendet)
    this.saveBtn = h("button", { class: "btn primary ib", title: "Speichern", "aria-label": "Speichern", onclick: () => this.save() },
      icon("M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z", 18), h("span", { class: "bl" }, "Speichern"));
    this.discardBtn = h("button", { class: "btn ib", title: "Verwerfen", "aria-label": "Verwerfen", onclick: () => this.discard() },
      icon("M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z", 18), h("span", { class: "bl" }, "Verwerfen"));
    this.editLabel = h("span", { class: "bl" });
    this.editBtn = h("button", { class: "btn ib", onclick: () => { this.editing = !this.editing; this.renderStatus(); this.renderView(); } },
      icon(MDI.pencil, 18), this.editLabel);
    // Tabs auf dem Handy als Auswahlliste, Suche hinter einem Knopf
    this.tabSelect = h("select", { class: "tab-select", "aria-label": "Ansicht" });
    this.tabSelect.addEventListener("change", () => { this.tab = this.tabSelect.value; this.render(); });
    this.searchBtn = h("button", { class: "icon-btn search-btn", "aria-label": "Suchen", onclick: () => {
      this.header.classList.toggle("searching");
      if (this.header.classList.contains("searching")) this.search.focus();
    } }, icon("M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z"));
    this.status = h("span", { class: "status" });
    this.tabsEl = h("nav", { class: "tabs" });
    this.banner = h("div", { class: "banner" });
    this.main = h("main", {}, h("p", { class: "empty" }, "Lade …"));
    this.menuEl = h("div", { class: "menu", role: "menu" });
    this.toastEl = h("div", { class: "toast" });
    this.lists = h("div", { hidden: true });
    this.pickerEl = h("div", { class: "picker", onclick: () => this.closePicker() });
    const menuBtn = h("button", { class: "icon-btn menu-btn", "aria-label": "Seitenleiste", onclick: () => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })) },
      icon("M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z"));
    const header = this.header = h("header", {},
      menuBtn,
      h("div", { class: "brand" }, icon("M11 15H6L13 1V9H18L11 23V15Z", 22), h("span", {}, "Stromnetz")),
      this.tabsEl,
      this.tabSelect,
      h("div", { class: "grow" }),
      this.searchBtn,
      h("label", { class: "search" }, icon("M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z", 16), this.search),
      this.status, this.editBtn, this.discardBtn, this.saveBtn);
    this.shadowRoot.append(style, header, this.banner, this.main, this.menuEl, this.pickerEl, this.toastEl, this.lists);
    this.shadowRoot.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeMenu();
        this.closePicker();
        if (this.picking) this.stopPick();
      }
    });
    this.shadowRoot.addEventListener("click", (e) => {
      if (!e.target.closest(".menu")) this.closeMenu();
    });
  }

  render() {
    this.tabsEl.replaceChildren(...TABS.map(([k, l]) => h("button", {
      class: `tab${this.tab === k ? " active" : ""}`, onclick: () => { this.tab = k; this.render(); },
    }, l)));
    this.tabSelect.replaceChildren(...TABS.map(([k, l]) => h("option", { value: k, selected: this.tab === k }, l)));
    this.renderStatus();
    this.renderView();
  }

  renderStatus() {
    if (!this.saveBtn) return;
    this.saveBtn.disabled = !this.dirty;
    this.discardBtn.hidden = !this.dirty;
    this.editLabel.textContent = this.editing ? "Bearbeiten: an" : "Bearbeiten: aus";
    this.editBtn.title = this.editBtn.ariaLabel = this.editing ? "Bearbeiten: an" : "Bearbeiten: aus";
    this.editBtn.classList.toggle("on", this.editing);
    const errs = this.desc?.errors ?? [];
    this.status.replaceChildren(errs.length
      ? h("button", { class: "err", onclick: () => { this.tab = "balance"; this.render(); } }, `${errs.length} Fehler`)
      : this.dirty ? h("span", { class: "muted" }, "ungespeichert") : "");
    this.banner.replaceChildren(this.picking
      ? h("div", { class: "row wrap" },
          h("span", { class: "grow" }, this.pickPending
            ? ["»", h("b", {}, this.net.name(this.picking, this.hass)), "« hängen an: ", h("b", {}, this.pickLabel(this.pickPending))]
            : `Neuen Elternknoten für »${this.net.name(this.picking, this.hass)}« anklicken (Doppelklick klappt weiter auf). Netzanschluss oder Kasten-Phase = direkte Einspeisung.`),
          this.pickPending ? h("button", { class: "btn primary", onclick: () => this.confirmPick() }, "Hierher umhängen") : null,
          h("button", { class: "chip", onclick: () => this.stopPick() }, "Abbrechen"))
      : "");
    this.banner.classList.toggle("show", !!this.picking);
  }

  renderView() {
    if (!this.net) return;
    // Scrollposition der Ansicht und Zustand des Seitenpanels über das Neuzeichnen retten
    const oldView = this.main.firstChild?.firstChild;
    const viewScroll = this._lastTab === this.tab && oldView ? { top: oldView.scrollTop, left: oldView.scrollLeft } : null;
    const editorState = this.editor?.snapshot?.();
    this._lastTab = this.tab;
    const body = h("div", { class: `body tab-${this.tab}` });
    if (this.tab === "flow") {
      this.flow.render();
      body.append(this.flow.el);
    } else if (this.tab === "cabinet") {
      this.cabinetView.render();
      body.append(this.cabinetView.el);
    } else if (this.tab === "balance") body.append(this.balanceView());
    else body.append(this.dataView());
    this.editor.render(this.validSelection());
    body.append(this.editor.el);
    this.main.replaceChildren(body);
    if (viewScroll && this.tab !== "flow" && body.firstChild) {
      body.firstChild.scrollTop = viewScroll.top;
      body.firstChild.scrollLeft = viewScroll.left;
    }
    this.editor.restore?.(editorState);
    if (this.tab === "flow" && !this.flow.fitted) requestAnimationFrame(() => { this.flow.fitted = true; this.flow.fit(); });
    this.buildSearchList();
  }

  validSelection() {
    const s = this.selection;
    if (!s) return null;
    if (s.type === "node" && !this.net.nodes.has(s.id)) return null;
    if (s.type === "module" && !this.net.modules.has(s.id)) return null;
    if (s.type === "cabinet" && !this.net.cabinets.has(s.id)) return null;
    return s;
  }

  updateValues() {
    if (!this.net) return;
    if (this.tab === "flow") this.flow.updateValues();
    if (this.tab === "cabinet") this.cabinetView.updateValues();
    if (this.tab === "balance") this.balanceLive?.forEach((l) => l());
    if (this.tab === "data") this.shellyLive?.forEach((l) => l());
    this.editor.updateValues();
  }

  buildDatalists() {
    const power = [], sw = [];
    for (const [id, st] of Object.entries(this.hass.states)) {
      const a = st.attributes;
      if (id.startsWith("sensor.") && (a.device_class === "power" || ["W", "kW"].includes(a.unit_of_measurement))) power.push([id, a.friendly_name]);
      if (/^(switch|light|input_boolean)\./.test(id)) sw.push([id, a.friendly_name]);
    }
    const dl = (id, items) => h("datalist", { id }, ...items.sort().map(([v, l]) => h("option", { value: v }, l ?? "")));
    this.lists.replaceChildren(dl("sn-power", power), dl("sn-switch", sw), h("datalist", { id: "sn-search" }));
    // Datalists müssen im selben Shadow-Root wie die Inputs liegen
  }

  buildSearchList() {
    const list = this.shadowRoot.getElementById("sn-search");
    if (!list || list.childElementCount) return;
    for (const n of this.data.nodes) list.append(h("option", { value: this.net.address(n.id) }, this.net.name(n.id, this.hass)));
  }

  doSearch(q) {
    q = q.trim().toLowerCase();
    if (!q) return;
    const net = this.net;
    const hit = this.data.nodes.find((n) => net.address(n.id).toLowerCase() === q)
      ?? this.data.nodes.find((n) => net.name(n.id, this.hass).toLowerCase().includes(q) || net.address(n.id).toLowerCase().includes(q) || (n.meter ?? "").includes(q));
    if (!hit) {
      this.toast(`Nichts gefunden für »${q}«`);
      return;
    }
    this.tab = "flow";
    this.selection = { type: "node", id: hit.id };
    this.render();
    this.flow.focus(hit.id);
  }

  // ── Auswahl, Menüs, Hinweise ─────────────────────────────────────────────
  // Navigation im Eigenschaften-Panel: go() merkt sich den Weg, back() geht zurück
  go(target) {
    if (this.selection) this.navStack.push(this.selection);
    if (this.navStack.length > 30) this.navStack.shift();
    this.select(target, this.tab === "flow" && target?.type === "node", true);
  }

  back() {
    const t = this.navStack.pop();
    if (t) this.select(t, false, true);
  }

  select(target, focus = false, keepStack = false) {
    if (!keepStack) this.navStack = [];
    this.flash = null;
    this.selection = target;
    if (target?.type === "node" && focus && this.tab === "flow") this.flow.focus(target.id);
    this.renderView();
  }

  openEditor(target) {
    this.select(target);
  }

  moreInfo(entityId) {
    if (entityId) fireMoreInfo(this, entityId);
  }

  showModule(id) {
    const m = this.net.modules.get(id);
    if (!m) return;
    this.tab = "cabinet";
    this.cabinetView.current = m.cabinet;
    this.selection = { type: "module", id };
    this.render();
  }

  menu(x, y, items, title) {
    const el = this.menuEl;
    el.replaceChildren(...[
      title ? h("div", { class: "menu-title" }, title) : null,
      ...items.map((it) => it === "-" ? h("div", { class: "sep" }) : h("button", {
        role: "menuitem", class: it.danger ? "danger" : "", disabled: it.disabled,
        onclick: (e) => { e.stopPropagation(); this.closeMenu(); it.action(); },
      }, it.icon ? icon(it.icon, 18) : h("span", { class: "ico-space" }), it.label))].filter(Boolean));
    el.classList.add("open");
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  }

  closeMenu() {
    this.menuEl?.classList.remove("open");
  }

  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove("show"), 3500);
  }

  contextNode(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const n = this.net.nodes.get(id);
    this.menu(e.clientX, e.clientY, [
      { label: "Eigenschaften …", icon: MDI.pencil, action: () => this.select({ type: "node", id }) },
      { label: "Steckdose dahinter", icon: MDI.outlet, action: () => this.addNode(id, "outlet") },
      { label: "Abzweig dahinter", icon: MDI.link, action: () => this.addNode(id, "junction") },
      { label: "Gerät hinzufügen", icon: MDI.power, action: () => this.addNode(id, "appliance") },
      { label: "Umhängen …", icon: MDI.move, action: () => this.startPick(id) },
      "-",
      { label: this.flow.collapsed.has(id) ? "Ausklappen" : "Einklappen", icon: this.flow.collapsed.has(id) ? MDI.expand : MDI.collapse, disabled: !this.net.kids(id).length, action: () => this.flow.toggle(id) },
      { label: "Im Schaltschrank zeigen", icon: MDI.cabinet, disabled: !n.module, action: () => this.showModule(n.module) },
      { label: "Verlauf", icon: MDI.history, disabled: !n.meter, action: () => this.moreInfo(n.meter) },
      "-",
      { label: "Entfernen", icon: MDI.del, danger: true, action: () => this.removeNode(id) },
    ], `${this.net.name(id, this.hass)} · ${this.net.address(id)}`);
  }

  contextGroup(e, it) {
    e.preventDefault();
    e.stopPropagation();
    this.menu(e.clientX, e.clientY, [
      { label: "Sicherung hinzufügen", icon: MDI.plus, disabled: !it.cabinet, action: () => this.addBreaker(it.cabinet, it.phase) },
      { label: this.flow.collapsed.has(it.key) ? "Ausklappen" : "Einklappen", icon: MDI.collapse, action: () => this.flow.toggle(it.key) },
      { label: "Kasten bearbeiten …", icon: MDI.cabinet, disabled: !it.cabinet, action: () => this.select({ type: "cabinet", id: it.cabinet }) },
    ]);
  }

  contextGrid(e) {
    e.preventDefault();
    this.menu(e.clientX, e.clientY, [
      { label: "Eigenschaften …", icon: MDI.pencil, action: () => this.select({ type: "grid" }) },
      { label: "Unbekannten Stromkreis hinzufügen", icon: MDI.plus, action: () => this.addNode(GRID, "unknown") },
      { label: "Kasten hinzufügen", icon: MDI.cabinet, action: () => this.addCabinet() },
    ]);
  }

  contextModule(e, id) {
    e.preventDefault();
    e.stopPropagation();
    const m = this.net.modules.get(id);
    this.menu(e.clientX, e.clientY, [
      { label: "Eigenschaften …", icon: MDI.pencil, action: () => this.select({ type: "module", id }) },
      { label: "Kanal hinzufügen", icon: MDI.plus, disabled: m.type === "rcd", action: () => this.addChannel(id) },
      { label: "In anderen Kasten verschieben …", icon: MDI.move, disabled: this.data.cabinets.length < 2,
        action: () => setTimeout(() => this.moveMenu(e, id)) },
      { label: "Im Fluss zeigen", icon: MDI.link, disabled: !(this.net.moduleNodes.get(id) ?? []).length,
        action: () => { const n = this.net.moduleNodes.get(id)[0]; this.tab = "flow"; this.selection = { type: "node", id: n.id }; this.render(); this.flow.focus(n.id); } },
      "-",
      { label: "Gerät entfernen", icon: MDI.del, danger: true, action: () => this.removeModule(id) },
    ], this.net.moduleTitle(m));
  }

  // ── Umhängen ──────────────────────────────────────────────────────────────
  startPick(id) {
    this.picking = id;
    this.pickPending = null;
    if (this.tab !== "flow") {
      this.tab = "flow";
      this.render();
    } else {
      this.renderStatus();
      this.renderView();
    }
  }

  stopPick() {
    this.picking = null;
    this.pickPending = null;
    this.renderStatus();
    this.renderView();
  }

  // Klick wählt im Umhängen-Modus nur das Ziel; erst »Hierher umhängen« im Banner führt es aus
  pickTarget(t) {
    if (!this.picking) return;
    const n = this.net.nodes.get(this.picking);
    if (t.type === "node" && (t.id === n.id || this.net.isDescendant(t.id, n.id))) {
      this.toast("Ein Knoten kann nicht an sich selbst oder an einen eigenen Abgang hängen.");
      return;
    }
    this.pickPending = t;
    this.renderStatus();
    this.flow.markPickTarget?.(t);
  }

  pickLabel(t) {
    if (!t) return "";
    if (t.type === "node") return `${this.net.address(t.id)} ${this.net.name(t.id, this.hass)}`.trim();
    if (t.type === "grid") return "Hauszuleitung";
    const cab = t.cabinet ? this.net.cabinets.get(t.cabinet) : null;
    return `Hauszuleitung${cab ? ` (${cab.code}${t.phase ? ` · ${PHASE_LABEL[t.phase]}` : ""})` : t.phase ? ` · ${PHASE_LABEL[t.phase]}` : ""}`;
  }

  confirmPick() {
    const t = this.pickPending;
    if (!this.picking || !t) return;
    const n = this.net.nodes.get(this.picking);
    if (t.type === "node") n.parent = t.id;
    else {
      n.parent = GRID;
      if (t.phase && !n.module) n.phase = t.phase;
    }
    this.picking = null;
    this.pickPending = null;
    this.selection = { type: "node", id: n.id };
    this.changed();
    this.flow.focus(n.id);
  }

  // ── Anlegen und Entfernen ─────────────────────────────────────────────────
  ids() {
    return new Set(this.data.nodes.map((n) => n.id));
  }

  addNode(parent, kind, { stay = false } = {}) {
    const id = newId(slug(KIND_LABEL[kind].split(" ")[0]), this.ids());
    const n = { id, parent, kind, name: `Neue ${KIND_LABEL[kind].split(" ")[0]}`, seq: null, label: null, phase: null, module: null,
      channel: null, meter: null, switch: null, area: null, feed_in: false, sonstiges_id: null, notes: null, pos: null, collapsed: false };
    if (kind === "appliance") n.name = "Neues Gerät";
    if (kind === "junction") n.name = "Neuer Abzweig";
    if (kind === "fixed") n.name = "Neuer Festanschluss";
    if (kind === "unknown") n.name = "Unbekannter Stromkreis";
    this.data.nodes.push(n);
    this.flow.collapsed.delete(parent);
    for (const a of this.net.ancestors(parent)) this.flow.collapsed.delete(a);
    this.flow.saveCollapsed();
    if (stay && this.selection) {
      // Im aktuellen Formular bleiben; der neue Knoten erscheint markiert in der Struktur
      this.flash = id;
      this.changed();
      this.toast(`${n.name} angelegt – zum Bearbeiten in der Struktur anklicken.`);
      return;
    }
    if (this.selection) this.navStack.push(this.selection);
    this.selection = { type: "node", id };
    this.changed();
    if (this.tab === "flow") this.flow.focus(id);
  }

  // Neu angelegter Knoten ohne Inhalt (kein Zähler, keine Kinder, kein Gerät)
  isBlank(n) {
    return !n.meter && !n.switch && !n.module && !this.net.kids(n.id).length;
  }

  // Bestehenden Knoten (mit dem gesuchten Zähler) an die Stelle von `placeholderId` hängen
  replaceWithExisting(placeholderId, existingId) {
    const ph = this.net.nodes.get(placeholderId), ex = this.net.nodes.get(existingId);
    if (!ph || !ex) return;
    if (ph.id === ex.parent || this.net.isDescendant(ph.id, ex.id)) {
      this.toast("Das geht nicht: der Knoten würde an sich selbst hängen.");
      return;
    }
    const oldPlace = ex.parent && ex.parent !== GRID ? `${this.net.address(ex.parent)}` : "Hauszuleitung";
    ex.parent = ph.parent;
    if (ph.parent === GRID && ph.phase && !ex.phase) ex.phase = ph.phase;
    if (this.isBlank(ph)) this.data.nodes = this.data.nodes.filter((x) => x.id !== ph.id);
    if (this.selection) this.navStack.push(this.selection);
    this.selection = { type: "node", id: ex.id };
    this.changed();
    this.toast(`»${this.net.name(ex.id, this.hass)}« verschoben (vorher an ${oldPlace}).`);
  }

  removeNode(id) {
    const net = this.net;
    const doomed = new Set([id]);
    const walk = (k) => net.kids(k).forEach((c) => { doomed.add(c); walk(c); });
    walk(id);
    const extra = doomed.size > 1 ? ` und ${doomed.size - 1} Abgänge darunter` : "";
    if (!confirm(`»${net.name(id, this.hass)}«${extra} entfernen?`)) return;
    this.data.nodes = this.data.nodes.filter((n) => !doomed.has(n.id));
    for (const c of this.data.cabinets) if (doomed.has(c.feed)) c.feed = null;
    this.selection = null;
    this.changed();
  }

  nextLabel(cabId, type) {
    const prefix = LABEL_PREFIX[type] ?? "Z";
    const used = new Set(this.data.modules.filter((m) => m.cabinet === cabId).map((m) => m.label));
    let i = 1;
    const fmt = (k) => (prefix === "F" ? `F${String(k).padStart(2, "0")}` : `${prefix}${k}`);
    while (used.has(fmt(i))) i++;
    return fmt(i);
  }

  // Ein Einzelgerät aus dem Katalog anlegen (ohne changed()); gibt {m, nodes} zurück
  createModule(cabId, item, at, { phase, phases } = {}) {
    const cab = this.net.cabinets.get(cabId);
    const id = newId(`${cabId}_${item.key}`, new Set(this.data.modules.map((m) => m.id)));
    let { row, slot } = at ?? {};
    if (row === null || row === undefined || !new Net(this.data, this.desc).fits(cabId, row, slot, item.width)) {
      ({ row, slot } = new Net(this.data, this.desc).freeSlot(cabId, item.width));
    }
    const m = { id, cabinet: cabId, row, slot, width: item.width, type: item.type, label: this.nextLabel(cabId, item.type),
      model: item.model ?? (["relay", "meter", "other"].includes(item.type) ? item.name : null), poles: item.poles, rating: item.rating ?? null, curve: item.curve ?? null, rcd: null,
      rcd_ma: item.rcd_ma ?? null, notes: null };
    this.data.modules.push(m);
    const ids = this.ids();
    const nodes = [];
    const title = item.model ?? (item.type === "breaker" || item.type === "rcbo" ? "Sicherung" : item.type === "relay" ? "Relais" : item.type === "rcd" ? "FI" : item.name);
    for (let c = 1; c <= item.channels; c++) {
      const chLabel = item.phases?.[c - 1] ? PHASE_LABEL[item.phases[c - 1]] : String(c);
      const nid = newId(slug(`${cab.code}_${m.label}${item.channels > 1 ? `_${chLabel}` : ""}`), ids);
      ids.add(nid);
      const breaker = item.kind === "breaker" || item.kind === "rcd";
      const multiFeed = this.feedNodes(cab).length > 1;
      const ph = phases?.[c - 1] ?? item.phases?.[c - 1] ?? (breaker && (!cab.feed || multiFeed) ? phase ?? "A" : null);
      const n = { id: nid, parent: breaker ? this.feedFor(cab, ph) : null, kind: item.kind ?? "junction",
        name: item.channels > 1 ? `${title} ${m.label} ${item.phases?.[c - 1] ? chLabel : `Kanal ${c}`}` : `${title} ${m.label}`, seq: null, label: null,
        phase: ph, module: id, channel: c, meter: null, switch: null, area: null, feed_in: false, sonstiges_id: null,
        notes: null, pos: null, collapsed: false };
      this.data.nodes.push(n);
      nodes.push(n);
    }
    return { m, nodes, placed: row !== null };
  }

  // Katalogeintrag einsetzen: Einzelgerät oder Kombination
  insertItem(cabId, item, at, opts = {}) {
    const parts = item.combo ?? [{ use: null }];
    const created = [];
    let first = null, unplaced = 0, pos = at;
    for (const part of parts) {
      const base = part.use ? CATALOG_BY_KEY.get(part.use) : item;
      const mods = [], nodes = [];
      for (let i = 0; i < (part.count ?? 1); i++) {
        const phases = part.count > 1 && part.phases ? [part.phases[i]] : part.phases;
        const r = this.createModule(cabId, base, pos, { ...opts, phases });
        pos = r.placed ? { row: r.m.row, slot: r.m.slot + r.m.width } : null;
        if (!r.placed) unplaced++;
        first ??= r.m;
        mods.push(r.m);
        nodes.push(...r.nodes);
      }
      if (part.under !== undefined) {
        const up = created[part.under].nodes;
        nodes.forEach((n, i) => {
          const parent = up[i] ?? up[up.length - 1];
          if (!parent) return;
          n.parent = parent.id;
          n.phase = null;
        });
      }
      if (part.rcdOf !== undefined) for (const m of mods) this.linkRcd(m, created[part.rcdOf].mods[0]?.id ?? null, true);
      created.push({ mods, nodes });
    }
    if (unplaced) this.toast(`${unplaced} Gerät(e) ohne freien Platz – liegen bei »Nicht platziert«.`);
    this.selection = { type: "module", id: first.id };
    this.closePicker();
    this.changed();
  }

  // Einspeisung eines Kastens für eine Phase: bei mehrpoliger Sicherung der Kanal dieser Phase
  feedNodes(cab) {
    if (!cab?.feed) return [];
    const net = new Net(this.data, this.desc);
    const f = net.nodes.get(cab.feed);
    if (!f) return [];
    const siblings = f.module ? (net.moduleNodes.get(f.module) ?? []) : [f];
    return siblings.length > 1 ? siblings : [f];
  }

  feedFor(cab, phase) {
    const nodes = this.feedNodes(cab);
    if (!nodes.length) return GRID;
    if (nodes.length === 1 || !phase) return nodes[0].id;
    const net = new Net(this.data, this.desc);
    return (nodes.find((n) => net.phase(n.id) === phase) ?? nodes[0]).id;
  }

  isFeedOf(cab, parent) {
    return cab.feed ? this.feedNodes(cab).some((n) => n.id === parent) : parent === GRID;
  }

  setCabinetFeed(cabId, feed) {
    const cab = this.net.cabinets.get(cabId);
    const net = this.net;
    const oldFeeds = new Set(cab.feed ? this.feedNodes(cab).map((n) => n.id) : [GRID]);
    cab.feed = feed;
    // Geräte, die an der alten Einspeisung hingen, an die neue hängen (je Phase)
    for (const n of this.data.nodes) {
      if (!n.module || net.modules.get(n.module)?.cabinet !== cabId || !oldFeeds.has(n.parent)) continue;
      const phase = net.phase(n.id);
      n.parent = this.feedFor(cab, phase);
      if (phase && !n.phase) n.phase = phase;
      if (n.phase && n.parent !== GRID && new Net(this.data, this.desc).phase(n.parent) === n.phase) n.phase = null;
    }
    this.changed();
  }

  // Woran hängen die Kanäle eines Geräts? Modul-ID, "feed", "none" oder "mixed"
  uplinkOf(m) {
    const net = this.net;
    const cab = net.cabinets.get(m.cabinet);
    const kinds = new Set();
    for (const n of net.moduleNodes.get(m.id) ?? []) {
      if (n.parent === null) kinds.add("none");
      else if (this.isFeedOf(cab, n.parent)) kinds.add("feed");
      else kinds.add(net.nodes.get(n.parent)?.module ?? `node:${n.parent}`);
    }
    if (kinds.size !== 1) return kinds.size ? "mixed" : "none";
    const k = [...kinds][0];
    return k.startsWith("node:") ? "mixed" : k;
  }

  setUplink(m, target) {
    if (target === "mixed") return;
    const net = new Net(this.data, this.desc);
    const cab = net.cabinets.get(m.cabinet);
    const tnodes = target && !["feed", "none"].includes(target) ? (net.moduleNodes.get(target) ?? []) : [];
    for (const n of net.moduleNodes.get(m.id) ?? []) {
      const phase = net.phase(n.id);
      if (phase && !n.phase) n.phase = phase; // Phase festhalten, bevor sich der Elternknoten ändert
      if (target === "none") n.parent = null;
      else if (target === "feed") n.parent = this.feedFor(cab, phase);
      else {
        const pick = tnodes.find((t) => net.phase(t.id) === phase)
          ?? (tnodes.length === 1 ? tnodes[0] : tnodes.find((t) => t.phase !== "N") ?? tnodes[0]);
        if (pick) n.parent = pick.id;
      }
      if (n.parent && n.parent !== GRID && n.phase && net.phase(n.parent) === n.phase && n.phase !== "N") n.phase = null;
    }
    const tm = tnodes.length ? net.modules.get(target) : null;
    m.rcd = tm && tm.type === "rcd" ? tm.id : null;
    this.changed();
  }

  // Sicherung hinter einen FI setzen: Kanäle hängen dann am FI-Kanal derselben Phase
  linkRcd(m, rcdId, silent = false) {
    const net = new Net(this.data, this.desc);
    const cab = net.cabinets.get(m.cabinet);
    const isFeed = (p) => this.isFeedOf(cab, p);
    const fiNodes = rcdId ? net.moduleNodes.get(rcdId) ?? [] : [];
    const oldFi = new Set((m.rcd ? net.moduleNodes.get(m.rcd) ?? [] : []).map((n) => n.id));
    m.rcd = rcdId;
    for (const n of net.moduleNodes.get(m.id) ?? []) {
      const atFeed = isFeed(n.parent) || oldFi.has(n.parent);
      if (!atFeed) continue;
      const phase = net.phase(n.id);
      if (fiNodes.length) {
        const target = fiNodes.find((f) => net.phase(f.id) === phase) ?? fiNodes[0];
        n.parent = target.id;
        if (net.phase(target.id) === phase || !phase) n.phase = null;
      } else {
        n.parent = this.feedFor(cab, phase);
        if (!n.phase && phase) n.phase = phase;
      }
    }
    if (!silent) this.changed();
  }

  // Ältere FIs ohne Kanäle bekommen L1–L3 als Knoten, zugeordnete Sicherungen wandern dahinter
  addRcdChannels(mid) {
    const m = this.net.modules.get(mid);
    const cab = this.net.cabinets.get(m.cabinet);
    const phases = (m.poles ?? 4) >= 4 ? ["A", "B", "C", "N"] : ["A", "N"];
    const ids = this.ids();
    phases.forEach((p, i) => {
      const id = newId(slug(`${cab.code}_${m.label}${phases.length > 1 ? `_${PHASE_LABEL[p]}` : ""}`), ids);
      ids.add(id);
      this.data.nodes.push({ id, parent: this.feedFor(cab, p === "N" ? null : p), kind: "rcd", name: `FI ${m.label}${phases.length > 1 ? ` ${PHASE_LABEL[p]}` : ""}`,
        seq: null, label: null, phase: p, module: mid, channel: i + 1, meter: null, switch: null, area: null,
        feed_in: false, sonstiges_id: null, notes: null, pos: null, collapsed: false });
    });
    for (const x of this.data.modules) if (x.rcd === mid) this.linkRcd(x, mid, true);
    this.changed();
  }

  addBreaker(cabId, phase) {
    this.insertItem(cabId, CATALOG_BY_KEY.get("ls1_b16"), null, { phase });
  }

  // ── Schalter (Relais) mit Nachfrage ───────────────────────────────────────
  toggleButton(n) {
    const btn = h("button", { class: "tgl", role: "switch", onclick: (e) => { e.stopPropagation(); this.confirmToggle(n); } },
      h("i", {}));
    this.syncToggle(btn, n.switch);
    return btn;
  }

  syncToggle(btn, entity) {
    const st = this.hass?.states[entity]?.state;
    btn.classList.toggle("on", st === "on");
    btn.classList.toggle("unavail", !st || st === "unavailable" || st === "unknown");
    btn.setAttribute("aria-checked", st === "on" ? "true" : "false");
    btn.title = `${this.hass?.states[entity]?.attributes?.friendly_name ?? entity}: ${st === "on" ? "an" : st === "off" ? "aus" : st ?? "?"}`;
  }

  confirmToggle(n) {
    const st = this.hass.states[n.switch];
    if (!st || st.state === "unavailable" || st.state === "unknown") {
      this.toast(`${n.switch} ist nicht erreichbar.`);
      return;
    }
    const target = st.state === "on" ? "ausschalten" : "einschalten";
    const name = st.attributes.friendly_name ?? n.switch;
    const where = `${this.net.address(n.id)} ${this.net.name(n.id, this.hass)}`;
    if (!confirm(`»${name}« ${target}?\n\n${where}\n${n.switch}`)) return;
    this.hass.callService("homeassistant", st.state === "on" ? "turn_off" : "turn_on", { entity_id: n.switch });
  }

  // ── Geräteauswahl: Kategorien links, gegliederte Liste rechts ─────────────
  openPicker(cabId, at) {
    this.closeMenu();
    const net = this.net;
    const cats = CATALOG.filter((c) => c.din !== false);
    let cat = cats.some((c) => c.key === this._pickerCat) ? this._pickerCat : cats[0].key;
    const left = h("nav", { class: "pk-cats" });
    const right = h("div", { class: "pk-list" });
    const fitsAt = (w) => (at ? net.fits(cabId, at.row, at.slot, w) : net.freeSlot(cabId, w).row !== null);
    const draw = () => {
      left.replaceChildren(...cats.map((c) => h("button", { class: c.key === cat ? "active" : "", onclick: () => { cat = c.key; this._pickerCat = cat; draw(); } }, c.name)));
      const c = cats.find((x) => x.key === cat);
      right.replaceChildren(...c.groups.map((g) => h("section", {},
        h("h4", {}, g.name),
        ...g.items.map((it) => {
          const w = itemWidth(it);
          const ok = it.combo ? true : fitsAt(w);
          const swatch = it.rating && it.type !== "rcd" ? ratingColor(it.rating) : null;
          return h("button", { class: "pk-item", onclick: () => this.insertItem(cabId, it, at) },
            swatch ? h("i", { class: "pk-sw", style: { background: swatch } }) : h("i", { class: "pk-sw none" }),
            h("span", { class: "grow" }, h("b", {}, it.name), h("span", { class: "muted" }, ` · ${it.sub}`)),
            h("span", { class: ok ? "muted" : "warn" }, `${w} TE${ok ? "" : " · kein Platz"}`));
        }))));
    };
    draw();
    const cab = net.cabinets.get(cabId);
    const where = at ? `Reihe ${at.row + 1}, Platz ${at.slot + 1}` : "nächster freier Platz";
    this.pickerEl.replaceChildren(h("div", { class: "pk-dialog", role: "dialog", "aria-label": "Gerät einsetzen", onclick: (e) => e.stopPropagation() },
      h("div", { class: "pk-head" }, h("div", {}, h("b", {}, "Gerät einsetzen"), h("span", { class: "muted" }, ` · ${cab.code} · ${where}`)),
        h("button", { class: "icon-btn", "aria-label": "Schließen", onclick: () => this.closePicker() }, icon(MDI.close))),
      h("div", { class: "pk-body" }, left, right),
      h("div", { class: "pk-foot muted" }, "Breiten sind Richtwerte – bitte am Gerät prüfen und bei Bedarf im Gerät anpassen.")));
    this.pickerEl.classList.add("open");
  }

  // Beschriftung: Kästen und Reihen wählen, auf A4-Etikettenpapier gepackt drucken
  openLabelDialog(preselect) {
    this.closeMenu();
    const s = this.data.settings;
    let sel;
    try { sel = JSON.parse(localStorage.getItem("stromnetz.labelsel") ?? "null"); } catch { sel = null; }
    if (!sel || preselect) sel = {};
    const rowsOf = (cab) => [...new Set(this.data.modules.filter((m) => m.cabinet === cab.id && m.row !== null).map((m) => m.row))].sort((a, b) => a - b);
    if (preselect) { const cab = this.data.cabinets.find((c) => c.id === preselect); if (cab) sel[cab.id] = rowsOf(cab); }
    let orientation = "auto", calib = false;
    const summary = h("div", { class: "muted" });
    const save = () => { try { localStorage.setItem("stromnetz.labelsel", JSON.stringify(sel)); } catch { /* egal */ } };
    const update = () => {
      const n = Object.values(sel).reduce((a, r) => a + r.length, 0);
      if (!n && !calib) { summary.textContent = "Nichts ausgewählt."; return; }
      const plan = labelPlan(this, sel, orientation, calib);
      summary.textContent = `${plan.strips} Streifen auf ${plan.sheets.length} ${plan.sheets.length === 1 ? "Blatt" : "Blättern"} · ${plan.orientation === "portrait" ? "Hochformat" : "Querformat"}`;
    };
    const list = h("div", { class: "pk-list lbl-list" }, ...this.data.cabinets.map((cab) => {
      const rows = rowsOf(cab);
      if (!rows.length) return null;
      const boxes = rows.map((r) => {
        const cb = h("input", { type: "checkbox", checked: (sel[cab.id] ?? []).includes(r) });
        cb.addEventListener("change", () => {
          const cur = new Set(sel[cab.id] ?? []);
          cb.checked ? cur.add(r) : cur.delete(r);
          sel[cab.id] = [...cur];
          all.checked = sel[cab.id].length === rows.length;
          all.indeterminate = sel[cab.id].length > 0 && !all.checked;
          save(); update();
        });
        return { r, cb };
      });
      const all = h("input", { type: "checkbox" });
      const n0 = (sel[cab.id] ?? []).length;
      all.checked = n0 === rows.length; all.indeterminate = n0 > 0 && n0 < rows.length;
      all.addEventListener("change", () => {
        sel[cab.id] = all.checked ? [...rows] : [];
        boxes.forEach((b) => { b.cb.checked = all.checked; });
        save(); update();
      });
      return h("section", { class: "lbl-cab" },
        h("label", { class: "lbl-head" }, all, h("b", {}, cab.code), h("span", { class: "muted" }, ` ${cab.name} · ${cab.width} TE`)),
        h("div", { class: "lbl-rows" }, ...boxes.map((b) => h("label", { class: "lbl-row" }, b.cb, `Reihe ${b.r + 1}`))));
    }));
    const orient = h("select", {}, h("option", { value: "auto" }, "Automatisch (spart Papier)"),
      h("option", { value: "portrait" }, "Hochformat"), h("option", { value: "landscape" }, "Querformat"));
    orient.addEventListener("change", () => { orientation = orient.value; update(); });
    const cal = h("input", { type: "checkbox" });
    cal.addEventListener("change", () => { calib = cal.checked; update(); });
    const num = (label, key, def, hint) => {
      const inp = h("input", { type: "number", step: "0.05", min: "1", value: s[key] ?? def, style: { width: "90px" } });
      inp.addEventListener("change", () => { s[key] = parseFloat(inp.value) || def; this.changed(); update(); });
      return h("label", { class: "lbl-num", title: hint }, h("span", {}, label), inp);
    };
    this.pickerEl.replaceChildren(h("div", { class: "pk-dialog lbl-dialog", role: "dialog", "aria-label": "Beschriftung drucken", onclick: (e) => e.stopPropagation() },
      h("div", { class: "pk-head" }, h("b", {}, "Beschriftung auf Etikettenpapier"),
        h("button", { class: "icon-btn", "aria-label": "Schließen", onclick: () => this.closePicker() }, icon(MDI.close))),
      h("div", { class: "pk-body" }, list,
        h("div", { class: "lbl-opts" },
          h("label", { class: "lbl-num" }, h("span", {}, "Ausrichtung"), orient),
          num("mm pro TE", "label_te_mm", LABEL_DEFAULTS.te, "Am eigenen Verteiler messen: Breite von z. B. 20 TE geteilt durch 20"),
          num("Streifenhöhe (mm)", "label_height_mm", LABEL_DEFAULTS.height),
          num("Blattrand (mm)", "label_margin_mm", LABEL_DEFAULTS.margin, "Abstand der Streifen zur Blattkante; mindestens so groß wie der nicht bedruckbare Rand des Druckers"),
          h("label", { class: "lbl-row" }, cal, "Kalibrierstreifen mitdrucken"),
          h("p", { class: "muted small" }, "Im Druckdialog »Ränder: Keine« und »Skalierung: 100 %« wählen; den Abstand zum Blattrand übernimmt »Blattrand«. Passt der Kalibrierstreifen danach nicht genau auf 100 mm, »mm pro TE« anpassen."))),
      h("div", { class: "pk-foot lbl-foot" }, summary,
        h("button", { class: "btn primary", onclick: () => {
          const plan = printLabelSheets(this, sel, orientation, calib);
          if (!plan) this.toast("Nichts zum Drucken ausgewählt.");
        } }, icon(MDI.printer, 16), " Drucken"))));
    this.pickerEl.classList.add("open");
    update();
  }

  closePicker() {
    this.pickerEl?.classList.remove("open");
  }

  addChannel(mid, { silent = false } = {}) {
    const m = this.net.modules.get(mid);
    const nodes = this.net.moduleNodes.get(mid) ?? [];
    const c = Math.max(0, ...nodes.map((n) => n.channel ?? 0)) + 1;
    const cab = this.net.cabinets.get(m.cabinet);
    const id = newId(slug(`${cab.code}_${m.label}_${c}`), this.ids());
    const breaker = ["breaker", "rcbo"].includes(m.type);
    const chPhase = breaker && (!cab.feed || this.feedNodes(cab).length > 1) ? PHASES[(c - 1) % 3] : null;
    this.data.nodes.push({ id, parent: breaker ? this.feedFor(cab, chPhase) : null, kind: breaker ? "breaker" : m.type === "relay" ? "relay" : "junction",
      name: `${m.model || m.label} Kanal ${c}`, seq: null, label: null, phase: chPhase,
      module: mid, channel: c, meter: null, switch: null, area: null, feed_in: false, sonstiges_id: null, notes: null, pos: null, collapsed: false });
    if (silent) return id;
    this.selection = { type: "node", id };
    this.changed();
    return id;
  }

  // ── Shelly ────────────────────────────────────────────────────────────────
  async loadShelly(force = false) {
    // Zwischenspeicher; nach 10 Minuten automatisch neu (das Panel bleibt in der App lange geladen)
    if (!force && this.shelly && Date.now() - this.shelly.t < 600000) return this.shelly;
    try {
      const res = await this.hass.callWS({ type: "stromnetz/shelly" });
      const byEntity = new Map();
      for (const d of res.devices) for (const c of d.channels) for (const e of [c.switch, c.power]) if (e) byEntity.set(e, { dev: d, ch: c });
      this.shelly = { ...res, t: Date.now(), byEntity, byId: new Map(res.devices.map((d) => [d.device_id, d])) };
    } catch (err) {
      this.shelly = { devices: [], discovered: [], byEntity: new Map(), byId: new Map(), t: Date.now(), error: String(err.message ?? err) };
    }
    return this.shelly;
  }

  // Wo ist ein HA-Gerät schon zugeordnet? Gerät (Modul) oder Knoten
  deviceUse(devId) {
    const m = this.data.modules.find((x) => x.device === devId);
    if (m) return { type: "module", id: m.id, label: this.net.moduleTitle(m) };
    const n = this.data.nodes.find((x) => x.device === devId);
    if (n) return { type: "node", id: n.id, label: `${this.net.address(n.id)} ${this.net.name(n.id, this.hass)}` };
    return null;
  }

  // Kanäle (Knoten) mit den Entities eines Shelly-Geräts belegen. targets: [{node, index}]
  applyDevice(dev, targets) {
    const conflicts = [];
    for (const { node, index } of targets) {
      const ch = dev.channels.find((c) => c.index === index);
      if (!ch) continue;
      if (node.switch && ch.switch && node.switch !== ch.switch) conflicts.push(`${node.switch} → ${ch.switch}`);
      if (node.meter && ch.power && node.meter !== ch.power) conflicts.push(`${node.meter} → ${ch.power}`);
    }
    if (conflicts.length && !confirm(`Vorhandene Einträge überschreiben?\n\n${conflicts.join("\n")}`)) return false;
    const used = new Set(this.data.nodes.filter((n) => !targets.some((t) => t.node === n)).map((n) => n.meter).filter(Boolean));
    for (const { node, index } of targets) {
      const ch = dev.channels.find((c) => c.index === index);
      if (!ch) continue;
      if (ch.switch) node.switch = ch.switch;
      if (ch.power && !used.has(ch.power)) node.meter = ch.power;
      const generic = !node.name || /Kanal \d+$|^(Relais|Shelly|Sicherung) /.test(node.name);
      if (generic && ch.name) node.name = ch.name;
    }
    return true;
  }

  linkModuleDevice(m, devId) {
    if (!devId) {
      m.device = null;
      this.changed();
      return;
    }
    const dev = this.shelly?.byId.get(devId);
    if (!dev) return;
    const other = this.deviceUse(devId);
    if (other && !(other.type === "module" && other.id === m.id) && !confirm(`${dev.name} ist schon bei ${other.label} zugeordnet. Trotzdem hier verknüpfen?`)) return;
    while ((this.net.moduleNodes.get(m.id) ?? []).length < dev.channels.length) {
      this.addChannel(m.id, { silent: true });
      this.net = new Net(this.data, this.desc);
    }
    const nodes = (this.net.moduleNodes.get(m.id) ?? []).slice().sort((a, b) => (a.channel ?? 0) - (b.channel ?? 0));
    const targets = dev.channels.map((c, i) => ({ node: nodes[i], index: c.index })).filter((t) => t.node);
    if (!this.applyDevice(dev, targets)) return;
    m.device = devId;
    if (!m.model) m.model = dev.model;
    this.changed();
    this.toast(`${dev.name} verknüpft: ${targets.length} Kanäle belegt.`);
  }

  // Knoten (z. B. Unterputz-Shelly) mit einem HA-Gerät verknüpfen; mehrkanalig über die Kinder mit Kanalnummer
  linkNodeDevice(n, devId, chIndex = null) {
    if (!devId) {
      n.device = null;
      n.device_channel = null;
      this.changed();
      return;
    }
    const dev = this.shelly?.byId.get(devId);
    if (!dev) return;
    const kids = this.net.kids(n.id).map((k) => this.net.nodes.get(k)).filter((k) => k.channel);
    let targets;
    if (kids.length && chIndex === null) targets = kids.map((k) => ({ node: k, index: dev.channels[k.channel - 1]?.index ?? k.channel - 1 }));
    else targets = [{ node: n, index: chIndex ?? dev.channels[0]?.index ?? 0 }];
    if (!this.applyDevice(dev, targets)) return;
    n.device = devId;
    n.device_channel = kids.length && chIndex === null ? null : targets[0].index;
    if (!n.model) n.model = dev.model;
    for (const t of targets) if (t.node !== n) t.node.device = devId;
    this.changed();
    this.toast(`${dev.name} verknüpft.`);
  }

  // Unterputz-/Stecker-Shelly als Knoten hinter `parent` anlegen
  insertFlush(parent, item, devId = null) {
    const ids = this.ids();
    const base = { seq: null, label: null, phase: null, module: null, meter: null, switch: null, area: null, feed_in: false,
      sonstiges_id: null, notes: null, pos: null, collapsed: false, device: null, device_channel: null, model: item.model };
    let top;
    if (item.channels > 1) {
      top = { ...base, id: newId(slug(item.model), ids), parent, kind: "junction", name: item.model, channel: null };
      ids.add(top.id);
      this.data.nodes.push(top);
      for (let c = 1; c <= item.channels; c++) {
        const id = newId(slug(`${item.model}_${c}`), ids);
        ids.add(id);
        this.data.nodes.push({ ...base, id, parent: top.id, kind: item.kind, name: `${item.model} Kanal ${c}`, channel: c });
      }
    } else {
      top = { ...base, id: newId(slug(item.model), ids), parent, kind: item.kind, name: item.model, channel: 1 };
      this.data.nodes.push(top);
    }
    this.flow.collapsed.delete(parent);
    this.closePicker();
    this.net = new Net(this.data, this.desc);
    if (devId) this.linkNodeDevice(top, devId);
    if (this.selection) this.navStack.push(this.selection);
    this.selection = { type: "node", id: top.id };
    this.changed();
    return top.id;
  }

  openFlushPicker(parent) {
    this.closeMenu();
    const cats = CATALOG.filter((c) => c.din === false);
    const list = h("div", { class: "pk-list" },
      ...cats.flatMap((c) => c.groups).map((g) => h("section", {}, h("h4", {}, g.name),
        ...g.items.map((it) => h("button", { class: "pk-item", onclick: () => this.insertFlush(parent, it) },
          h("i", { class: "pk-sw none" }), h("span", { class: "grow" }, h("b", {}, it.name), h("span", { class: "muted" }, ` · ${it.sub}`)),
          h("span", { class: "muted" }, `${it.channels} ${it.channels > 1 ? "Kanäle" : "Kanal"}`))))));
    this.pickerEl.replaceChildren(h("div", { class: "pk-dialog", role: "dialog", "aria-label": "Shelly-Modul anschließen", onclick: (e) => e.stopPropagation() },
      h("div", { class: "pk-head" }, h("div", {}, h("b", {}, "Unterputz-Modul oder Zwischenstecker"), h("span", { class: "muted" }, ` · hinter ${this.net.address(parent) || this.net.name(parent, this.hass)}`)),
        h("button", { class: "icon-btn", "aria-label": "Schließen", onclick: () => this.closePicker() }, icon(MDI.close))),
      h("div", { class: "pk-body" }, list),
      h("div", { class: "pk-foot muted" }, "Wird als Knoten im Fluss angelegt (z. B. in einer Abzweigdose). Danach unter »Shelly-Gerät« mit HA verknüpfen.")));
    this.pickerEl.classList.add("open");
  }

  // Daten-Tab: alle Shelly-Geräte aus HA mit Zuordnung, plus im Netzwerk gefundene
  // Daten-Tab: Shelly-Geräte aus HA (zwischengespeichert), gruppiert nach Aktion, Bereich oder Modell
  get shellyGroup() {
    try { return localStorage.getItem("stromnetz.shellygroup") ?? "action"; } catch { return this._shellyGroup ?? "action"; }
  }

  set shellyGroup(v) {
    this._shellyGroup = v;
    try { localStorage.setItem("stromnetz.shellygroup", v); } catch { /* ohne Speicher */ }
  }

  shellySection() {
    const box = h("section", { class: "card-box shelly-box" });
    const draw = (sh) => {
      this.shellyLive = [];
      const coll = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
      const areaOf = (d) => (d.area_id ? this.net.areaName(d.area_id) : "");
      const ACTIONS = { dup: "Doppelt angelegt – zusammenführen", link: "Mit vorhandenen Knoten verknüpfen", cabinet: "In Kasten einsetzen", node: "Als Knoten anlegen", linked: "Bereits zugeordnet" };
      const entries = sh.devices.map((d) => {
        const use = this.deviceUse(d.device_id);
        const item = catalogForDevice(d);
        const existing = !use ? this.existingForDevice(d) : [];
        // Verknüpft, aber ein anderer Knoten trägt die Zähler/Schalter → doppelt
        const dupes = use?.type === "node" ? this.existingForDevice(d, { exclude: use.id }).filter((e) => e.node.device !== d.device_id || e.node.id !== use.id) : [];
        const linkedOwn = use?.type === "node" ? this.net.nodes.get(use.id) : null;
        const isDup = dupes.length && linkedOwn && !linkedOwn.meter;
        const action = isDup ? "dup" : use ? "linked" : existing.length ? "link" : item && item.din !== false ? "cabinet" : "node";
        return { d, use, item, existing: isDup ? dupes : existing, action, area: areaOf(d) };
      });
      const mode = this.shellyGroup;
      const keyOf = (e) => (mode === "area" ? e.area || "Ohne Bereich" : mode === "model" ? e.d.model ?? "?" : ACTIONS[e.action]);
      const groupOrder = mode === "action" ? Object.values(ACTIONS) : null;
      const groups = new Map();
      for (const e of entries) {
        const k = keyOf(e);
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(e);
      }
      const keys = [...groups.keys()].sort((a, b) => groupOrder
        ? groupOrder.indexOf(a) - groupOrder.indexOf(b)
        : (a === "Ohne Bereich") - (b === "Ohne Bereich") || coll.compare(a, b));
      const free = entries.filter((e) => !e.use).length;
      const seg = h("div", { class: "segment wheel", role: "group", "aria-label": "Gruppieren nach" },
        h("span", { class: "wl" }, "Gruppieren"),
        ...[["action", "Aktion"], ["area", "Bereich"], ["model", "Modell"]].map(([k, l]) => h("button", {
          class: mode === k ? "active" : "", "aria-pressed": mode === k ? "true" : "false",
          onclick: () => { this.shellyGroup = k; draw(this.shelly); },
        }, l)));
      const loaded = new Date(sh.t).toLocaleTimeString("de-AT", { hour: "2-digit", minute: "2-digit" });
      const head = h("div", { class: "row wrap shelly-head" },
        h("h3", { class: "grow" }, "Shelly-Geräte"), seg,
        h("button", { class: "chip", title: "Liste neu aus Home Assistant laden", onclick: async () => { box.classList.add("loading"); draw(await this.loadShelly(true)); } },
          icon("M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z", 16), ` Aktualisieren`));
      const rows = [head, h("p", { class: "muted small" }, `${sh.devices.length} Geräte in HA, davon ${free} noch nicht zugeordnet · Stand ${loaded}`)];
      if (sh.error) rows.push(h("p", { class: "err-line" }, sh.error));
      for (const k of keys) {
        const list = groups.get(k).sort((a, b) => coll.compare(a.area || "~", b.area || "~") || coll.compare(a.d.name ?? "", b.d.name ?? ""));
        rows.push(h("h4", {}, `${k} (${list.length})`));
        for (const e of list) rows.push(this.shellyRow(e));
      }
      if (sh.discovered.length) {
        rows.push(h("h4", {}, `Im Netzwerk gefunden, noch nicht in HA (${sh.discovered.length})`));
        for (const f of sh.discovered) {
          rows.push(h("div", { class: "shelly-row" }, h("div", { class: "grow" }, h("b", {}, f.name ?? "Shelly"), h("div", { class: "muted small" }, f.host ?? f.source ?? "")),
            h("button", { class: "chip", onclick: () => this.navigateHA("/config/integrations/integration/shelly") }, "In HA einrichten")));
        }
      } else rows.push(h("p", { class: "muted small" }, "Keine neuen Shelly-Geräte im Netzwerk entdeckt (Erkennung über Home Assistant)."));
      box.classList.remove("loading");
      box.replaceChildren(...rows);
      this.shellyLive.forEach((l) => l());
    };
    if (this.shelly) draw(this.shelly);
    else {
      box.replaceChildren(h("h3", {}, "Shelly-Geräte"), h("p", { class: "muted" }, "Lade …"));
      this.loadShelly().then(draw);
    }
    return box;
  }

  // Daten › Knoten: alle Knoten mit Zuordnung (Area/Topf), filter- und gruppierbar
  nodesSection() {
    const box = h("section", { class: "card-box nodes-box" });
    const load = (k, def) => { try { const v = localStorage.getItem(`stromnetz.nodes.${k}`); return v === null ? def : JSON.parse(v); } catch { return def; } };
    const store = (k, v) => { try { localStorage.setItem(`stromnetz.nodes.${k}`, JSON.stringify(v)); } catch { /* ohne Speicher */ } };
    const st = this._nodesState ??= { kinds: new Set(load("kinds", [])), only: load("only", false), group: load("group", "area"), q: "" };
    const coll = new Intl.Collator("de", { numeric: true, sensitivity: "base" });
    const areaOpts = (inh) => {
      const areas = Object.entries(this.desc.areas ?? {}).sort((a, b) => coll.compare(a[1].name, b[1].name));
      return [h("option", { value: "" }, inh ? `— erbt: ${this.net.areaName(inh)} —` : "— keine —"),
        h("optgroup", { label: "Töpfe" }, ...Object.entries(this.data.pots ?? {}).map(([k, v]) => h("option", { value: k }, v.name ?? k))),
        h("optgroup", { label: "Areas" }, ...areas.map(([k, v]) => h("option", { value: k }, v.name)))];
    };
    const areaCell = (n) => {
      const eff = this.net.area(n.id);
      const inh = n.parent && n.parent !== GRID ? this.net.area(n.parent) : null;
      const label = n.area ? this.net.areaName(n.area) : eff ? `erbt: ${this.net.areaName(eff)}` : "keine Zuordnung";
      // Auswahl erst beim Anklicken bauen (viele Knoten, schnell auch am Handy)
      const btn = h("button", { class: `area-btn${n.area ? "" : eff ? " inh" : " none"}`, title: "Area / Topf ändern" }, label);
      btn.addEventListener("click", () => {
        const sel = h("select", {}, ...areaOpts(inh));
        sel.value = n.area ?? "";
        sel.addEventListener("change", () => { n.area = sel.value || null; this.changed(); });
        sel.addEventListener("blur", () => { if (sel.isConnected) sel.replaceWith(btn); });
        btn.replaceWith(sel);
        sel.focus();
      });
      return btn;
    };
    // Suchfeld bleibt über Neuzeichnungen erhalten (Fokus und Cursor)
    const search = h("input", { type: "search", placeholder: "Name, Adresse, Zähler …", value: st.q });
    search.addEventListener("input", debounce(() => { st.q = search.value; draw(); }, 250));
    const draw = () => {
      const all = this.data.nodes;
      const counts = new Map();
      for (const n of all) counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1);
      const kinds = Object.keys(KIND_LABEL).filter((k) => counts.has(k));
      const q = st.q.trim().toLowerCase();
      const shown = all.filter((n) => (!st.kinds.size || st.kinds.has(n.kind)) && (!st.only || !this.net.area(n.id))
        && (!q || `${this.net.address(n.id)} ${this.net.name(n.id, this.hass)} ${n.meter ?? ""}`.toLowerCase().includes(q)));
      const unassigned = all.filter((n) => !this.net.area(n.id)).length;
      const keyOf = (n) => st.group === "area" ? (this.net.area(n.id) ? this.net.areaName(this.net.area(n.id)) : "Ohne Zuordnung")
        : st.group === "kind" ? KIND_LABEL[n.kind] : "";
      const groups = new Map();
      for (const n of shown) { const k = keyOf(n); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(n); }
      const keys = [...groups.keys()].sort((a, b) => (b === "Ohne Zuordnung") - (a === "Ohne Zuordnung") || coll.compare(a, b));
      const seg = h("div", { class: "segment wheel", role: "group", "aria-label": "Gruppieren" }, h("span", { class: "wl" }, "Gruppieren"),
        ...[["area", "Zuordnung"], ["kind", "Knotenart"], ["none", "keine"]].map(([k, l]) => h("button", {
          class: st.group === k ? "active" : "", onclick: () => { st.group = k; store("group", k); draw(); } }, l)));
      const chips = h("div", { class: "row wrap" },
        h("button", { class: `chip${st.kinds.size ? "" : " active"}`, onclick: () => { st.kinds.clear(); store("kinds", []); draw(); } }, `Alle (${all.length})`),
        ...kinds.map((k) => h("button", { class: `chip${st.kinds.has(k) ? " active" : ""}`, "aria-pressed": st.kinds.has(k) ? "true" : "false",
          onclick: () => { st.kinds.has(k) ? st.kinds.delete(k) : st.kinds.add(k); store("kinds", [...st.kinds]); draw(); } }, `${KIND_LABEL[k]} (${counts.get(k)})`)));
      const onlyBtn = h("button", { class: `chip${st.only ? " active" : ""}`, onclick: () => { st.only = !st.only; store("only", st.only); draw(); } }, `Nur ohne Zuordnung (${unassigned})`);
      const row = (n) => {
        const parent = n.parent && n.parent !== GRID ? this.net.name(n.parent, this.hass) : n.parent === GRID ? "Hauszuleitung" : "nicht verbunden";
        return h("div", { class: "ua-row" },
          h("button", { class: "slink", title: "Im Fluss zeigen", onclick: () => { this.tab = "flow"; this.selection = { type: "node", id: n.id }; this.render(); this.flow.focus(n.id); } },
            h("span", { class: "saddr" }, this.net.address(n.id) || "–"), h("span", { class: "sname" }, this.net.name(n.id, this.hass))),
          h("span", { class: "muted small ua-kind" }, KIND_LABEL[n.kind]),
          h("span", { class: "muted small ua-parent", title: "hängt an" }, parent),
          areaCell(n));
      };
      const body = [];
      for (const k of keys) {
        const list = groups.get(k).sort((a, b) => coll.compare(this.net.address(a.id) || "~", this.net.address(b.id) || "~"));
        if (k) body.push(h("h4", {}, `${k} (${list.length})`));
        body.push(...list.map(row));
      }
      box.replaceChildren(
        h("div", { class: "row wrap" }, h("h3", { class: "grow" }, "Knoten"),
          h("span", { class: "muted small" }, "Zuordnung = eigene Area/Topf oder vom Elternknoten geerbt. Klick auf die Zuordnung zum Ändern.")),
        h("div", { class: "nodes-tools" }, search, seg, onlyBtn),
        chips,
        shown.length ? h("div", { class: "ua-list" }, ...body) : h("p", { class: "muted" }, "Keine passenden Knoten."));
    };
    draw();
    return box;
  }

  shellyRow({ d, use, item, existing, action: kind, area }) {
    const nodeBtn = () => h("button", { class: "chip", title: "Als nicht verbundenen Knoten anlegen; danach im Fluss umhängen", onclick: () => {
      const it = item ?? { model: d.model ?? "Shelly", channels: d.channels.length, kind: d.channels.some((c) => c.switch) ? "relay" : "junction" };
      this.insertFlush(null, { ...it, channels: d.channels.length }, d.device_id);
      this.tab = "flow";
      this.render();
    } }, "+ Als Knoten anlegen");
    let action = kind === "dup"
      ? h("button", { class: "chip warn", title: `Verknüpft mit ${use.label}, Zähler liegt aber bei ${existing.map((e) => this.net.address(e.node.id)).join(", ")}`,
          onclick: () => { this.mergeDuplicate(d, use.id, existing); this.render(); } },
          `Zusammenführen mit ${this.net.address(existing[0].node.id) || this.net.name(existing[0].node.id, this.hass)}`)
      : kind === "linked"
      ? h("button", { class: "chip", onclick: () => { this.tab = use.type === "module" ? "cabinet" : "flow"; if (use.type === "module") this.cabinetView.current = this.net.modules.get(use.id).cabinet; this.selection = { type: use.type, id: use.id }; this.render(); } }, use.label)
      : kind === "link"
        ? h("button", { class: "chip", title: existing.map((e) => `${this.net.address(e.node.id)} ${this.net.name(e.node.id, this.hass)}`).join("\n"),
            onclick: () => { this.linkExisting(d, existing); this.render(); } },
            `Verknüpfen mit ${existing.length === 1 ? this.net.address(existing[0].node.id) || this.net.name(existing[0].node.id, this.hass) : `${existing.length} Knoten`}`)
        : kind === "cabinet" || (kind === "node" && dinVariant(item))
          ? (() => {
              const din = dinVariant(item);
              const sel = h("select", {}, h("option", { value: "" }, kind === "node" ? "Auf Hutschiene in Kasten …" : "In Kasten einsetzen …"), ...this.data.cabinets.map((c) => h("option", { value: c.id }, `${c.code} · ${c.name}`)));
              sel.addEventListener("change", () => {
                if (!sel.value) return;
                this.insertItem(sel.value, din, null);
                const m = this.net.modules.get(this.selection.id);
                this.net = new Net(this.data, this.desc);
                this.linkModuleDevice(m, d.device_id);
                this.tab = "cabinet";
                this.cabinetView.current = sel.value;
                this.render();
              });
              return sel;
            })()
          : nodeBtn();
    if (kind === "node" && dinVariant(item)) action = h("div", { class: "row wrap shelly-acts" }, action, nodeBtn());
    const chans = h("div", { class: "shelly-chans" }, ...d.channels.map((c) => {
      const v = h("span", { class: "cv" });
      this.shellyLive.push(() => { v.textContent = fmtW(num(this.hass, c.power)); });
      const st = c.switch ? this.hass.states[c.switch]?.state : null;
      return h("span", { class: `ch${st === "on" ? " on" : ""}`, title: [c.switch, c.power].filter(Boolean).join("\n") },
        d.channels.length > 1 ? h("b", {}, `K${c.index + 1}`) : null,
        d.channels.length > 1 && c.name ? h("span", { class: "cn" }, c.name.replace(d.name, "").trim() || c.name) : null,
        c.power ? v : h("span", { class: "cv muted" }, "–"));
    }));
    return h("div", { class: "shelly-row" },
      h("div", { class: "grow" },
        h("div", {}, area ? h("span", { class: "area-tag first" }, area) : null, h("b", {}, d.name)),
        h("div", { class: "muted small" },
          `${d.model ?? "?"}${d.model_id ? ` (${d.model_id})` : ""} · ${d.channels.length} ${d.channels.length > 1 ? "Kanäle" : "Kanal"}${item ? ` · Vorlage: ${item.name}` : ""}`),
        chans),
      h("button", { class: "icon-btn small", title: "In HA öffnen", "aria-label": `${d.name} in HA öffnen`, onclick: () => this.navigateHA(`/config/devices/device/${d.device_id}`) }, icon(MDI.link, 16)),
      action);
  }

  // Knoten, die Zähler oder Schalter dieses Geräts tragen – über alle Entities des Shelly (auch Untergeräte)
  existingForDevice(dev, { exclude = null } = {}) {
    const ents = new Set([...(dev.entities ?? []), ...dev.channels.flatMap((c) => [c.power, c.switch])].filter(Boolean));
    const out = [];
    for (const n of this.data.nodes) {
      if (n.id === exclude || !((n.meter && ents.has(n.meter)) || (n.switch && ents.has(n.switch)))) continue;
      const ch = dev.channels.find((c) => (c.power && c.power === n.meter) || (c.switch && c.switch === n.switch))
        ?? (dev.channels.length === 1 ? dev.channels[0] : null);
      out.push({ node: n, index: ch?.index ?? dev.channels[0]?.index ?? 0 });
    }
    return out;
  }

  // Gerät ist an einem Knoten verknüpft, ein anderer Knoten trägt aber dessen Zähler: zusammenführen
  mergeDuplicate(dev, linkedId, existing) {
    const dup = this.net.nodes.get(linkedId);
    const keep = existing[0].node;
    const kids = this.net.kids(dup.id).length;
    if (!confirm(`»${this.net.name(dup.id, this.hass)}« (${this.net.address(dup.id)}) und »${this.net.name(keep.id, this.hass)}« (${this.net.address(keep.id)}) sind dasselbe Gerät.\n\nDen vorhandenen Knoten behalten und mit ${dev.name} verknüpfen, den doppelten entfernen?${kids ? `\n${kids} Abgänge des doppelten Knotens werden an seine Stelle gehängt.` : ""}`)) return;
    this.dissolveNodes([dup.id]);
    this.net = new Net(this.data, this.desc);
    for (const e of existing) {
      e.node.device = dev.device_id;
      e.node.device_channel = dev.channels.length > 1 ? e.index : null;
      if (!e.node.model) e.node.model = dev.model;
    }
    this.applyDevice(dev, existing);
    this.selection = { type: "node", id: keep.id };
    this.changed();
    this.toast(`Zusammengeführt: ${this.net.name(keep.id, this.hass)} ist jetzt mit ${dev.name} verknüpft.`);
  }

  linkExisting(dev, existing) {
    const mods = new Set(existing.map((e) => e.node.module).filter(Boolean));
    if (mods.size === 1 && existing.every((e) => e.node.module)) {
      this.linkModuleDevice(this.net.modules.get([...mods][0]), dev.device_id);
      return;
    }
    if (!this.applyDevice(dev, existing)) return;
    for (const e of existing) {
      e.node.device = dev.device_id;
      e.node.device_channel = dev.channels.length > 1 ? e.index : null;
      if (!e.node.model) e.node.model = dev.model;
    }
    this.changed();
    this.toast(`${dev.name} mit ${existing.length} vorhandenen Knoten verknüpft.`);
  }

  navigateHA(path) {
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
  }

  // Gerät in einen anderen Kasten umsetzen; Einspeisung der Kanäle wird mitgeführt
  moveModule(mid, cabId) {
    const net = this.net;
    const m = net.modules.get(mid);
    const from = net.cabinets.get(m.cabinet), to = net.cabinets.get(cabId);
    if (!m || !to || m.cabinet === cabId) return;
    const nodes = net.moduleNodes.get(mid) ?? [];
    for (const n of nodes) {
      const phase = net.phase(n.id);
      // Nur Kanäle, die direkt an der Einspeisung des alten Kastens hängen, wandern mit
      if (!this.isFeedOf(from, n.parent)) continue;
      n.parent = this.feedFor(to, phase);
      if (!n.phase && phase) n.phase = phase; // bisher geerbte Phase festschreiben
      if (n.parent !== GRID && net.phase(n.parent) === n.phase) n.phase = null; // kommt von der Einspeisung
    }
    if (m.rcd && net.modules.get(m.rcd)?.cabinet !== cabId) m.rcd = null;
    for (const x of this.data.modules) if (x.rcd === mid) x.rcd = null;
    const taken = new Set(this.data.modules.filter((x) => x.cabinet === cabId).map((x) => x.label));
    const oldLabel = m.label;
    m.cabinet = cabId;
    if (m.label && taken.has(m.label)) m.label = this.nextLabel(cabId, m.type);
    const at = this.net.freeSlot(cabId, m.width || 1);
    m.row = at.row;
    m.slot = at.slot;
    this.cabinetView.current = cabId;
    this.selection = { type: "module", id: mid };
    this.changed();
    const parts = [`${oldLabel ?? mid} → ${to.code}`];
    if (m.label !== oldLabel) parts.push(`neue Bezeichnung ${m.label}`);
    if (m.row === null) parts.push("kein freier Platz, liegt bei »Nicht platziert«");
    this.toast(parts.join(" · "));
  }

  moveMenu(e, mid) {
    const m = this.net.modules.get(mid);
    const items = this.data.cabinets.filter((c) => c.id !== m.cabinet)
      .map((c) => ({ label: `${c.code} · ${c.name}`, icon: MDI.cabinet, action: () => this.moveModule(mid, c.id) }));
    if (!items.length) {
      this.toast("Es gibt keinen anderen Kasten.");
      return;
    }
    this.menu(e.clientX, e.clientY, items, `${this.net.moduleTitle(m)} verschieben nach`);
  }

  // Knoten löschen, seine direkten Abgänge an seinen Elternknoten hängen (Phase bleibt erhalten)
  dissolveNodes(ids) {
    const net = new Net(this.data, this.desc);
    const gone = new Set(ids);
    const upOf = (id) => {
      let p = net.nodes.get(id)?.parent ?? null;
      while (p && gone.has(p)) p = net.nodes.get(p)?.parent ?? null;
      return p;
    };
    let moved = 0;
    for (const n of this.data.nodes) {
      if (gone.has(n.id) || !gone.has(n.parent)) continue;
      const phase = net.phase(n.id);
      n.parent = upOf(n.parent);
      if (phase && !n.phase) n.phase = phase;
      if (n.parent && n.parent !== GRID && n.phase && net.phase(n.parent) === n.phase) n.phase = null;
      moved++;
    }
    this.data.nodes = this.data.nodes.filter((n) => !gone.has(n.id));
    for (const c of this.data.cabinets) if (gone.has(c.feed)) c.feed = null;
    return moved;
  }

  removeModule(mid) {
    const nodes = this.net.moduleNodes.get(mid) ?? [];
    const m = this.net.modules.get(mid);
    const ids = new Set(nodes.map((n) => n.id));
    const behind = this.data.nodes.filter((n) => ids.has(n.parent)).length;
    const feeds = this.data.cabinets.filter((c) => ids.has(c.feed)).map((c) => c.code);
    const msg = [`Gerät ${this.net.moduleTitle(m)} mit ${nodes.length} Kanal/Kanälen entfernen?`,
      behind ? `${behind} Abgänge dahinter werden an die vorherige Stelle gehängt.` : null,
      feeds.length ? `Achtung: ${feeds.join(", ")} wird davon gespeist und hängt danach an der Hauszuleitung.` : null].filter(Boolean).join("\n\n");
    if (!confirm(msg)) return;
    this.dissolveNodes([...ids]);
    for (const x of this.data.modules) if (x.rcd === mid) x.rcd = null;
    this.data.modules = this.data.modules.filter((x) => x.id !== mid);
    this.selection = null;
    this.changed();
  }

  // Reste entfernter Geräte: Kanal-Knoten ohne Gerät, ohne Zähler und ohne Schalter
  orphanChannels() {
    const codes = this.data.cabinets.map((c) => slug(c.code) + "_");
    return this.data.nodes.filter((n) => !n.module && !n.meter && !n.switch
      && (["rcd", "relay"].includes(n.kind) || (["breaker", "junction"].includes(n.kind) && codes.some((c) => n.id.startsWith(c)))));
  }

  cleanupOrphans() {
    const list = this.orphanChannels();
    if (!list.length) return;
    const behind = this.data.nodes.filter((n) => list.some((o) => o.id === n.parent));
    const msg = `${list.length} Reste entfernter Geräte löschen?\n\n${list.map((n) => `• ${this.net.address(n.id)} ${this.net.name(n.id, this.hass)}`).join("\n")}`
      + (behind.length ? `\n\n${behind.length} Abgänge dahinter (${behind.map((n) => this.net.name(n.id, this.hass)).join(", ")}) werden an die vorherige Stelle gehängt.` : "");
    if (!confirm(msg)) return;
    this.dissolveNodes(list.map((n) => n.id));
    this.changed();
    this.toast(`${list.length} Reste entfernt – zum Übernehmen speichern.`);
  }

  addCabinet() {
    const n = this.data.cabinets.length;
    const code = n === 0 ? "HV" : `UV${n}`;
    const id = newId(slug(code), new Set(this.data.cabinets.map((c) => c.id)));
    this.data.cabinets.push({ id, code, name: n === 0 ? "Hauptverteiler" : `Unterverteiler ${n}`, area: null, feed: null, rows: 4, width: 16, notes: null });
    this.tab = "cabinet";
    this.cabinetView.current = id;
    this.selection = { type: "cabinet", id };
    this.changed();
    this.render();
  }

  removeCabinet(id) {
    if (this.data.modules.some((m) => m.cabinet === id)) {
      this.toast("Der Kasten enthält noch Geräte – erst entfernen oder umsetzen.");
      return;
    }
    if (!confirm("Kasten entfernen?")) return;
    this.data.cabinets = this.data.cabinets.filter((c) => c.id !== id);
    this.selection = null;
    this.changed();
  }

  // ── Bilanz ────────────────────────────────────────────────────────────────
  balanceView() {
    this.balanceLive = [];
    const groups = this.desc.groups ?? [];
    const colors = this.data.settings.colors;
    const table = (title, rows) => {
      if (!rows.length) return null;
      const max = () => Math.max(1, ...rows.map((r) => num(this.hass, r.entity_id) ?? 0));
      return h("section", { class: "card-box" }, h("h3", {}, title),
        ...rows.map((r) => {
          const val = h("span", { class: "bval" });
          const bar = h("i", { style: { background: r.color ?? "var(--sn-accent)" } });
          this.balanceLive.push(() => {
            const v = num(this.hass, r.entity_id);
            val.textContent = fmtW(v);
            bar.style.width = `${Math.max(0, ((v ?? 0) / max()) * 100)}%`;
          });
          return h("button", { class: "brow", onclick: () => this.moreInfo(r.entity_id) },
            h("span", { class: "bname" }, r.label), h("span", { class: "bar" }, bar), val);
        }));
    };
    const strip = (s) => s.replace(this.data.settings.name_prefix ?? "", "").replace(/ Leistung$/, "");
    const by = (g) => groups.filter((x) => x.gruppe === g).map((x) => ({ ...x, label: strip(x.name) }));
    const phases = by("phase").map((x) => ({ ...x, color: colors[x.phase], label: `${PHASE_LABEL[x.phase]} (${x.phase})` }));
    const grid = PHASES.filter((p) => this.data.grid.phases[p]?.meter).map((p) => ({ entity_id: this.data.grid.phases[p].meter, label: `Zuleitung ${PHASE_LABEL[p]}`, color: colors[p] }));
    const rest = PHASES.filter((p) => this.net.gridRestEntity(p)).map((p) => ({ entity_id: this.net.gridRestEntity(p), label: `${PHASE_LABEL[p]} nicht erfasst`, color: colors[p] }));
    const errs = this.desc.errors ?? [], warns = this.desc.warnings ?? [];
    // Räume und Töpfe: ein Balken je Raum, der Sonstiges-Anteil rot am rechten Ende
    const roomTable = () => {
      const rooms = by("raum");
      if (!rooms.length) return null;
      const sonst = new Map(by("raum_sonstiges").map((x) => [x.raum, x.entity_id]));
      const max = () => Math.max(1, ...rooms.map((r) => num(this.hass, r.entity_id) ?? 0));
      return h("section", { class: "card-box rooms-box" },
        h("div", { class: "row wrap" }, h("h3", { class: "grow" }, "Räume und Töpfe"),
          h("span", { class: "legend-inline" }, h("span", {}, h("i", { style: { background: "var(--sn-accent)" } }), "gemessen"),
            h("span", {}, h("i", { style: { background: "var(--error-color, #db4437)" } }), "Sonstiges"))),
        ...rooms.map((r) => {
          const se = sonst.get(r.raum);
          const val = h("span", { class: "bval" });
          const restSeg = h("i", { class: "rest" });
          const tot = h("span", { class: "tot" }, h("i", { class: "known" }), restSeg);
          this.balanceLive.push(() => {
            const v = Math.max(0, num(this.hass, r.entity_id) ?? 0);
            const sv = se ? Math.min(v, Math.max(0, num(this.hass, se) ?? 0)) : 0;
            tot.style.width = `${(v / max()) * 100}%`;
            restSeg.style.width = v ? `${(sv / v) * 100}%` : "0";
            val.replaceChildren(fmtW(v), se && sv ? h("span", { class: "sv" }, `davon ${fmtW(sv)} · ${Math.round((sv / (v || 1)) * 100)} %`) : "");
          });
          return h("button", { class: "brow tall", title: se ? "Klick: Verlauf · Sonstiges separat im Sensor " + se : "Klick: Verlauf", onclick: () => this.moreInfo(r.entity_id) },
            h("span", { class: "bname" }, r.label), h("span", { class: "bar split" }, tot), val);
        }));
    };
    // Sankey nach Stockwerk und Raum, volle Breite, live und bei Größenänderung neu gezeichnet
    const sankeyHost = h("div", { class: "sankey-host" });
    const drawSankey = () => {
      const w = sankeyHost.clientWidth;
      if (!w) return;
      const chart = roomSankey(this, w);
      sankeyHost.replaceChildren(chart ?? h("p", { class: "muted" }, "Noch keine Raum-Werte vorhanden."));
    };
    let lastDraw = 0;
    this.balanceLive.push(() => {
      if (Date.now() - lastDraw < 5000) return;
      lastDraw = Date.now();
      drawSankey();
    });
    this._sankeyRO?.disconnect();
    this._sankeyRO = new ResizeObserver(() => drawSankey());
    this._sankeyRO.observe(sankeyHost);
    const sankeyBox = h("section", { class: "card-box sankey-box" },
      h("div", { class: "row" }, h("h3", { class: "grow" }, "Verteilung nach Stockwerk und Raum"),
        h("span", { class: "muted small" }, "Breite = Leistung · Klick auf einen Raum zeigt den Verlauf")),
      sankeyHost);
    const el = h("div", { class: "balance" },
      sankeyBox,
      (() => {
        const orphans = this.orphanChannels();
        if (!errs.length && !warns.length && !orphans.length) return null;
        return h("section", { class: "card-box problems" }, h("h3", {}, "Prüfung"),
          ...errs.map((e) => h("div", { class: "err-line" }, e)), ...warns.map((w) => h("div", { class: "warn-line" }, w)),
          orphans.length ? h("div", { class: "row wrap" },
            h("span", { class: "warn-line grow" }, `${orphans.length} Reste entfernter Geräte: ${orphans.map((n) => this.net.address(n.id) || n.id).join(", ")}`),
            h("button", { class: "chip", onclick: () => this.cleanupOrphans() }, icon(MDI.del, 16), " Aufräumen")) : null);
      })(),
      table("Zuleitung", grid), table("Phasen", phases), table("Nicht erfasst", rest),
      table("Kästen je Phase", by("kasten").map((x) => ({ ...x, color: colors[x.phase] }))),
      table("Stockwerke", by("stockwerk")), roomTable());
    queueMicrotask(() => this.balanceLive.forEach((l) => l()));
    return el;
  }

  // ── Daten ─────────────────────────────────────────────────────────────────
  dataView() {
    const s = this.data.settings;
    const out = h("textarea", { class: "export", readonly: true, rows: 14, hidden: true });
    const field = (label, obj, key, hint) => {
      const inp = h("input", { value: obj[key] ?? "" });
      inp.addEventListener("change", () => { obj[key] = inp.value; this.changed(); });
      return h("label", { class: "field" }, h("span", { class: "flabel" }, label), inp, hint ? h("span", { class: "hint" }, hint) : null);
    };
    const pots = Object.entries(this.data.pots ?? {});
    const floors = Object.entries(this.desc.floors ?? {});
    let sub;
    try { sub = localStorage.getItem("stromnetz.datatab") ?? "nodes"; } catch { sub = this._dataTab ?? "nodes"; }
    const subtabs = h("div", { class: "subtabs" }, ...[["nodes", "Knoten"], ["shelly", "Shelly-Geräte"], ["settings", "Einstellungen"]].map(([k, l]) =>
      h("button", { class: `chip${sub === k ? " active" : ""}`, onclick: () => { this._dataTab = k; try { localStorage.setItem("stromnetz.datatab", k); } catch { /* ohne Speicher */ } this.renderView(); } }, l)));
    if (sub === "nodes") return h("div", { class: "datapage" }, subtabs, this.nodesSection());
    if (sub === "shelly") return h("div", { class: "datapage" }, subtabs, this.shellySection());
    return h("div", { class: "datapage" },
      subtabs,
      h("section", { class: "card-box" }, h("h3", {}, "Export"),
        h("p", { class: "muted" }, "Gespeicherter Stand als YAML, z. B. für Backup oder Git."),
        h("div", { class: "row" },
          h("button", { class: "btn", onclick: async () => {
            const res = await this.hass.callWS({ type: "stromnetz/export_yaml" });
            out.value = res.yaml;
            out.hidden = false;
          } }, "Anzeigen"),
          h("button", { class: "btn", onclick: async () => {
            const res = await this.hass.callWS({ type: "stromnetz/export_yaml" });
            const a = h("a", { href: URL.createObjectURL(new Blob([res.yaml], { type: "text/yaml" })), download: "stromnetz-export.yaml" });
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          } }, "Herunterladen")),
        out),
      h("section", { class: "card-box" }, h("h3", {}, "Sensoren"),
        field("Präfix der entity_ids", s, "prefix", "Ändern legt alle Sensoren neu an (neue entity_ids)."),
        field("Präfix der Namen", s, "name_prefix"),
        field("Schreibintervall (Sekunden)", s, "write_interval",
          "Höchstens ein neuer Wert je Sensor in diesem Abstand; der letzte Wert kommt immer an. Hält die HA-Datenbank klein. 0 = sofort.")),
      h("section", { class: "card-box" }, h("h3", {}, "Bilanz-Töpfe"),
        h("p", { class: "muted" }, "Gruppen ohne eigene HA-Area, z. B. »Klimaanlagen« oder »Nicht erfasst«."),
        ...pots.map(([k, v]) => {
          const name = h("input", { value: v.name ?? "" });
          name.addEventListener("change", () => { v.name = name.value; this.changed(); });
          const fl = h("select", {}, h("option", { value: "" }, "— kein Stockwerk —"), ...floors.map(([f, n]) => h("option", { value: f, selected: v.floor === f }, n)));
          fl.addEventListener("change", () => { v.floor = fl.value || null; this.changed(); });
          return h("div", { class: "row pot" }, h("code", {}, k), name, fl,
            h("button", { class: "icon-btn", "aria-label": `${k} entfernen`, onclick: () => {
              if (this.data.nodes.some((n) => n.area === k) || this.data.grid.pot === k) { this.toast("Topf wird noch verwendet."); return; }
              delete this.data.pots[k];
              this.changed();
            } }, icon(MDI.del, 16)));
        }),
        h("button", { class: "chip", onclick: () => {
          const name = prompt("Name des neuen Topfs");
          if (!name) return;
          this.data.pots[slug(name)] = { name, floor: null };
          this.changed();
        } }, "+ Topf")));
  }
}

if (!customElements.get("stromnetz-panel")) customElements.define("stromnetz-panel", StromnetzPanel);
