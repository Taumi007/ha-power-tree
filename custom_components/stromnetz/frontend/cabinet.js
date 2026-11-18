// Schaltschrank: Frontansicht mit Hutschienen, Geräte per Ziehen platzieren
import { onColor, ratingColor } from "./catalog.js";
import { printLabels, printOverview } from "./print.js";
import { MDI, MODULE_TYPE_LABEL, NEUTRAL, PHASE_LABEL, fmtW, h, icon, num } from "./util.js";

const TE = 46;
const ROW_H = 222;
const MOD_H = 186;

export class CabinetView {
  constructor(panel) {
    this.p = panel;
    this.current = null;
    this.live = [];
    this.el = h("div", { class: "cabinet-view" });
    this.zoom = this.loadZoom();
    this.bindGestures();
  }

  // ── Zoom: Pinch (Touch), ⌘/Strg + Rad, Knöpfe ────────────────────────────
  loadZoom() {
    try {
      const z = parseFloat(localStorage.getItem("stromnetz.cabzoom"));
      return Number.isFinite(z) ? z : null;
    } catch {
      return null;
    }
  }

  setZoom(z, anchor) {
    const board = this.el.querySelector(".board");
    z = Math.min(Math.max(z, 0.35), 2);
    if (!board) {
      this.zoom = z;
      return;
    }
    const sc = this.el, r = sc.getBoundingClientRect(), br = board.getBoundingClientRect();
    const ax = anchor ? anchor.x - r.left : r.width / 2, ay = anchor ? anchor.y - r.top : r.height / 2;
    const old = this.zoom ?? 1;
    // Punkt im Board (ungezoomt), der unter dem Anker liegt, soll dort bleiben
    const px = (ax + r.left - br.left) / old, py = (ay + r.top - br.top) / old;
    this.zoom = z;
    board.style.zoom = String(z);
    const br2 = board.getBoundingClientRect();
    sc.scrollLeft += br2.left + px * z - (ax + r.left);
    sc.scrollTop += br2.top + py * z - (ay + r.top);
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(z * 100)} %`;
    try {
      localStorage.setItem("stromnetz.cabzoom", String(z));
    } catch {
      /* ohne Speicher */
    }
  }

  fitZoom() {
    const board = this.el.querySelector(".board");
    if (!board) return;
    const w = parseFloat(board.style.width);
    const avail = this.el.clientWidth - 48;
    this.setZoom(Math.min(1, avail / w));
    this.el.scrollLeft = 0;
  }

  bindGestures() {
    this.el.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.metaKey)) return; // normales Rad scrollt
      e.preventDefault();
      this.setZoom((this.zoom ?? 1) * Math.pow(1.0015, -(e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY)), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    // Zwei Finger: zoomen. Touch-Events, weil der Browser Pointer-Events beim nativen Scrollen abbricht.
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
    this.el.addEventListener("touchstart", (e) => {
      if (e.touches.length === 1) this.gestureCancelled = false;
      if (e.touches.length === 2) {
        e.preventDefault();
        this.gestureCancelled = true;
        this.pinch = { d0: dist(e.touches), z0: this.zoom ?? 1, m: mid(e.touches) };
      }
    }, { passive: false });
    this.el.addEventListener("touchmove", (e) => {
      if (!this.pinch || e.touches.length < 2) {
        if (e.touches.length === 1) this.touchMoved = true;
        return;
      }
      e.preventDefault();
      const m = mid(e.touches);
      this.setZoom(this.pinch.z0 * (dist(e.touches) / this.pinch.d0), m);
      // Mitverschieben mit beiden Fingern
      this.el.scrollLeft -= m.x - this.pinch.m.x;
      this.el.scrollTop -= m.y - this.pinch.m.y;
      this.pinch.m = m;
    }, { passive: false });
    this.el.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) this.pinch = null;
    });
  }

  render() {
    const net = this.p.net;
    const cabs = this.p.data.cabinets;
    if (!this.current || !net.cabinets.has(this.current)) this.current = cabs[0]?.id ?? null;
    this.live = [];
    const tabs = h("div", { class: "cab-tabs" },
      ...cabs.map((c) => h("button", { class: `chip${c.id === this.current ? " active" : ""}`, onclick: () => {
        this.current = c.id;
        // Ist das Kasten-Formular offen, wechselt es mit
        if (this.p.selection?.type === "cabinet" && this.p.selection.id !== c.id) this.p.select({ type: "cabinet", id: c.id });
        else this.render();
      } },
        `${c.code} · ${c.name}`)),
      this.p.editing ? h("button", { class: "chip dashed", onclick: () => this.p.addCabinet() }, "+ Kasten") : null);
    if (!this.current) {
      this.el.replaceChildren(tabs, h("p", { class: "empty" }, "Noch kein Sicherungskasten angelegt."));
      return;
    }
    const cab = net.cabinets.get(this.current);
    const feed = cab.feed ? `gespeist von ${net.address(cab.feed) || cab.feed} (${net.name(cab.feed, this.p.hass)})` : "gespeist von der Hauszuleitung";
    const head = h("div", { class: "cab-head" },
      h("div", {}, h("b", {}, cab.code), ` – ${cab.name}`, h("span", { class: "muted" }, ` · ${cab.rows} Reihen × ${cab.width} TE · ${feed}`)),
      h("div", { class: "row" },
        h("button", { class: "chip", onclick: (e) => this.addAnywhere(e, cab.id) }, icon(MDI.plus, 16), " Gerät"),
        h("button", { class: "chip", onclick: (e) => {
          e.stopPropagation();
          this.p.menu(e.clientX, e.clientY, [
            { label: "Beschriftungsstreifen (1:1)", icon: MDI.printer, action: () => printLabels(this.p, cab.id) },
            { label: "Kastenübersicht – A4 quer", icon: MDI.cabinet, action: () => printOverview(this.p, cab.id, "landscape") },
            { label: "Kastenübersicht – A4 hoch", icon: MDI.cabinet, action: () => printOverview(this.p, cab.id, "portrait") },
          ], "Drucken");
        } }, icon(MDI.printer, 16), " Drucken"),
        h("button", { class: "chip", onclick: () => this.p.openEditor({ type: "cabinet", id: cab.id }) }, icon(MDI.pencil, 16), " Kasten"),
        h("div", { class: "zoombox" },
          h("button", { class: "icon-btn small", "aria-label": "Verkleinern", onclick: () => this.setZoom((this.zoom ?? 1) / 1.2) }, icon(MDI.minus, 16)),
          (this.zoomLabel = h("button", { class: "zl", title: "Auf Breite einpassen", onclick: () => this.fitZoom() }, `${Math.round((this.zoom ?? 1) * 100)} %`)),
          h("button", { class: "icon-btn small", "aria-label": "Vergrößern", onclick: () => this.setZoom((this.zoom ?? 1) * 1.2) }, icon(MDI.plus, 16)))));

    const board = h("div", { class: `board${this.p.editing ? " editing" : ""}`,
      style: { width: `${cab.width * TE + 72}px`, height: `${cab.rows * ROW_H + 24}px`, zoom: String(this.zoom ?? 1) } });
    for (let r = 0; r < cab.rows; r++) {
      board.append(h("div", { class: "rail", style: { top: `${r * ROW_H + 12 + MOD_H / 2 - 12}px`, width: `${cab.width * TE}px` } }));
      board.append(h("div", { class: "row-label", style: { top: `${r * ROW_H + 12 + MOD_H / 2 - 8}px` } }, `R${r + 1}`));
      if (this.p.editing) {
        const occ = net.occupied(cab.id);
        for (let s = 0; s < cab.width; s++) {
          if (occ.has(`${r}:${s}`)) continue;
          board.append(h("button", {
            class: "slot", title: `Reihe ${r + 1}, Platz ${s + 1}: Gerät hinzufügen`, "aria-label": `Reihe ${r + 1}, Platz ${s + 1}: Gerät hinzufügen`,
            style: { left: `${48 + s * TE}px`, top: `${r * ROW_H + 12}px`, width: `${TE - 4}px`, height: `${MOD_H}px` },
            onclick: (e) => { e.stopPropagation(); this.addMenu(e, cab.id, r, s); },
          }, "+"));
        }
      }
    }
    const unplaced = [];
    for (const m of this.p.data.modules.filter((x) => x.cabinet === cab.id)) {
      if (m.row === null || m.slot === null) unplaced.push(m);
      else board.append(this.module(m));
    }
    const legend = h("div", { class: "legend" },
      ...Object.entries(PHASE_LABEL).map(([p, l]) => h("span", {}, h("i", { style: { background: this.p.data.settings.colors[p] ?? "#7d8a96" } }), l)),
      h("span", { class: "muted" }, "Zahl unten = Leistung"));
    this.el.replaceChildren(...[tabs, head, h("div", { class: "board-wrap" }, board),
      unplaced.length ? h("div", { class: "unplaced" }, h("b", {}, "Nicht platziert: "), ...unplaced.map((m) => this.chip(m))) : null,
      legend].filter(Boolean));
    this.updateValues();
    // Erster Aufruf ohne gespeicherten Zoom: auf die Breite einpassen (Handy)
    if (this.zoom === null) requestAnimationFrame(() => this.fitZoom());
  }

  chip(m) {
    return h("button", { class: "chip", onclick: () => this.p.openEditor({ type: "module", id: m.id }) }, this.p.net.moduleTitle(m));
  }

  module(m) {
    const net = this.p.net;
    const nodes = net.moduleNodes.get(m.id) ?? [];
    const phases = net.phasesOfModule(m);
    const colors = phases.map((p) => this.p.data.settings.colors[p] ?? "#7d8a96");
    const stripe = colors.length > 1
      ? `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`).join(", ")})`
      : colors[0] ?? (m.type === "rcd" ? "var(--secondary-text-color)" : NEUTRAL);
    const sel = this.p.selection;
    const selected = (sel?.type === "module" && sel.id === m.id) || (sel?.type === "node" && nodes.some((n) => n.id === sel.id));
    const width = (m.width || 1) * TE - 4;
    const name = (nodes.length === 1 ? net.name(nodes[0].id, this.p.hass) : m.model || MODULE_TYPE_LABEL[m.type])
      .replace(/^Sicherung\s+/i, "");
    const val = h("span", { class: "mval" });
    this.live.push({ el: val, get: () => {
      const vals = nodes.map((n) => net.value(n.id, this.p.hass)).filter((v) => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
    } });
    const rcd = m.rcd ? net.modules.get(m.rcd) : null;
    // Ein Schalter je Entity (ein 3-poliges Schütz hat oft nur einen)
    const switches = [...new Map(nodes.filter((n) => n.switch).map((n) => [n.switch, n])).values()];
    const rc = m.rating && m.type !== "rcd" ? ratingColor(m.rating) : null;
    const rating = m.rating && m.type !== "rcd"
      ? h("span", { class: `rating${rc ? "" : " plain"}`, style: rc ? { background: rc, color: onColor(rc) } : {}, title: `Nennstrom ${m.rating} A` }, `${m.curve ?? ""}${m.rating}`)
      : null;
    const el = h("div", {
      class: `module type-${m.type}${selected ? " selected" : ""}${width > 60 ? " wide" : ""}${colors.length === 1 ? " tinted" : ""}`,
      style: { left: `${48 + m.slot * TE}px`, top: `${m.row * ROW_H + 12}px`, width: `${width}px`, height: `${MOD_H}px`,
               "--stripe": stripe, ...(colors.length === 1 ? { "--tint": colors[0] } : {}) },
      title: [net.moduleTitle(m), m.model, phases.length ? phases.map((p) => PHASE_LABEL[p]).join("/") : null, rcd ? `über ${rcd.label}` : null].filter(Boolean).join(" · "),
    },
      h("span", { class: "mtop" }, h("b", { class: "mlabel" }, m.label || "?"), rating),
      h("span", { class: "mname" }, name),
      switches.length ? h("span", { class: "switches" }, ...switches.map((n) => this.switchBtn(n))) : null,
      m.type === "rcd" ? h("span", { class: "mval muted" }, m.rcd_ma ? `${m.rating ? `${m.rating} A · ` : ""}${m.rcd_ma} mA` : "FI") : val);
    el.addEventListener("contextmenu", (e) => this.p.contextModule(e, m.id));
    this.bindDrag(el, m);
    return el;
  }

  switchBtn(n) {
    const btn = this.p.toggleButton(n);
    btn.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.live.push({ toggle: true, el: btn, entity: n.switch });
    return btn;
  }

  updateValues() {
    for (const l of this.live) {
      if (l.toggle) this.p.syncToggle(l.el, l.entity);
      else l.el.textContent = fmtW(l.get());
    }
  }

  addMenu(e, cabId, row, slot) {
    this.p.openPicker(cabId, { row, slot });
  }

  // Gerät am ersten freien Platz einsetzen (ohne Bearbeiten-Modus erreichbar)
  addAnywhere(e, cabId) {
    e.stopPropagation();
    this.p.openPicker(cabId, null);
  }

  bindDrag(el, m) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      if (e.isPrimary) this.gestureCancelled = false;
      const sx = e.clientX, sy = e.clientY;
      let moved = false;
      const z = this.zoom ?? 1;
      if (this.p.editing) try { el.setPointerCapture(e.pointerId); } catch { /* Zeiger schon weg */ }
      const target = () => ({ slot: m.slot + Math.round((lastX - sx) / (TE * z)), row: m.row + Math.round((lastY - sy) / (ROW_H * z)) });
      let lastX = sx, lastY = sy;
      const move = (ev) => {
        lastX = ev.clientX;
        lastY = ev.clientY;
        if (!moved && Math.hypot(lastX - sx, lastY - sy) >= 8 && !this.p.editing) this.gestureCancelled = true; // war Scrollen
        if (!this.p.editing || this.gestureCancelled || (!moved && Math.hypot(lastX - sx, lastY - sy) < 6)) return;
        moved = true;
        el.style.transform = `translate(${(lastX - sx) / z}px, ${(lastY - sy) / z}px)`;
        const t = target();
        el.classList.toggle("blocked", !this.p.net.fits(m.cabinet, t.row, t.slot, m.width || 1, m.id));
      };
      const up = (ev) => {
        el.removeEventListener("pointermove", move);
        el.removeEventListener("pointerup", up);
        el.removeEventListener("pointercancel", up);
        if (ev.type === "pointercancel" || this.gestureCancelled) {
          el.style.transform = "";
          el.classList.remove("blocked");
          return;
        }
        if (!moved) {
          this.p.select({ type: "module", id: m.id });
          return;
        }
        const t = target();
        if (this.p.net.fits(m.cabinet, t.row, t.slot, m.width || 1, m.id)) {
          m.row = t.row;
          m.slot = t.slot;
          this.p.changed();
        } else this.render();
      };
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
    });
  }
}

export function moduleValue(net, m, hass) {
  const vals = (net.moduleNodes.get(m.id) ?? []).map((n) => num(hass, n.meter)).filter((v) => v !== null);
  return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
}
