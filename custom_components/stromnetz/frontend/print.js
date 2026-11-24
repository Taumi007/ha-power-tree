// Druckansichten: Beschriftungsstreifen (Maßstab 1:1) und Kastenübersicht (A4 quer, als PDF speicherbar)
import { onColor, ratingColor } from "./catalog.js";
import { MODULE_TYPE_LABEL, PHASE_LABEL } from "./util.js";


const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function moduleInfo(panel, m) {
  const net = panel.net;
  const nodes = net.moduleNodes.get(m.id) ?? [];
  const phases = net.phasesOfModule(m);
  const colors = phases.map((p) => panel.data.settings.colors[p] ?? "#7d8a96");
  const name = (nodes.length === 1 ? net.name(nodes[0].id, panel.hass) : m.model || MODULE_TYPE_LABEL[m.type]).replace(/^Sicherung\s+/i, "");
  const stripe = colors.length > 1
    ? `linear-gradient(90deg, ${colors.map((c, i) => `${c} ${(i * 100) / colors.length}% ${((i + 1) * 100) / colors.length}%`).join(", ")})`
    : colors[0] ?? "#9e9e9e";
  const rc = m.rating && m.type !== "rcd" ? ratingColor(m.rating) : null;
  const rating = m.rating ? `${m.type === "rcd" ? "" : m.curve ?? ""}${m.rating}${m.type === "rcd" ? " A" : ""}` : "";
  return { nodes, phases, colors, name, stripe, rc, rating, tint: colors.length === 1 ? colors[0] : null };
}

function printHtml(title, css, body) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: Roboto, "Helvetica Neue", Arial, sans-serif; color: #1b1b1b; background: #fff; }
.hint { font-size: 9pt; color: #666; margin: 0 0 4mm; }
@media screen { body { padding: 10mm; background: #f2f2f2; } .sheet { background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.2); padding: 8mm; margin-bottom: 8mm; } }
@media print { .sheet { padding: 0; } }
${css}
</style></head><body>${body}</body></html>`;
  // Unsichtbarer Rahmen statt Popup: funktioniert auch in der Companion-App und ohne Popup-Freigabe
  const frame = document.createElement("iframe");
  Object.assign(frame.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
  document.body.append(frame);
  frame.srcdoc = html;
  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 60000);
    }, 250);
  };
}

// ── Beschriftung auf Etikettenpapier (z. B. Avery Zweckform 6603, A4 1-fach) ──
export const LABEL_DEFAULTS = { te: 17.75, height: 15, margin: 6 };

export function labelSettings(panel) {
  const s = panel.data.settings ?? {};
  const num = (v, d) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : d; };
  return { te: num(s.label_te_mm, LABEL_DEFAULTS.te), height: num(s.label_height_mm, LABEL_DEFAULTS.height),
    margin: num(s.label_margin_mm, LABEL_DEFAULTS.margin) };
}

// Zellen einer Reihe: Geräte und Lücken, je mit Start-TE und Breite
function rowCells(panel, cab, r) {
  const mods = panel.data.modules.filter((m) => m.cabinet === cab.id && m.row === r).sort((a, b) => a.slot - b.slot);
  const cells = [];
  let slot = 0;
  for (const m of mods) {
    if (m.slot > slot) cells.push({ from: slot, width: m.slot - slot, empty: true });
    cells.push({ from: m.slot, width: m.width || 1, m });
    slot = m.slot + (m.width || 1);
  }
  if (slot < cab.width) cells.push({ from: slot, width: cab.width - slot, empty: true });
  return { cells, has: mods.length > 0 };
}

// Teilt eine Reihe in möglichst gleich lange Stücke mit höchstens maxTE; geschnitten wird nur
// zwischen Geräten oder in Lücken, nie durch ein Gerät
function splitRow(cells, total, maxTE) {
  const blocked = new Set();
  for (const c of cells) if (!c.empty) for (let t = c.from + 1; t < c.from + c.width; t++) blocked.add(t);
  const segs = [];
  let start = 0;
  while (total - start > maxTE) {
    const parts = Math.ceil((total - start) / maxTE);
    const target = start + Math.round((total - start) / parts);
    let cut = null;
    for (let d = 0; d <= maxTE; d++) {
      for (const t of [target - d, target + d]) {
        if (cut === null && t > start && t <= start + maxTE && t < total && !blocked.has(t)) cut = t;
      }
    }
    if (cut === null) cut = start + maxTE; // Gerät breiter als das Blatt: dann eben hart schneiden
    segs.push([start, cut]);
    start = cut;
  }
  segs.push([start, total]);
  return segs;
}

function segmentHtml(panel, cells, from, to, te) {
  let html = "";
  for (const c of cells) {
    const a = Math.max(c.from, from), b = Math.min(c.from + c.width, to);
    if (b <= a) continue;
    if (c.empty) { html += `<div class="cell empty" style="width:${(b - a) * te}mm"></div>`; continue; }
    const m = c.m, i = moduleInfo(panel, m);
    html += `<div class="cell" style="width:${(b - a) * te}mm;${i.tint ? `background:color-mix(in srgb, #fff 82%, ${i.tint} 18%)` : ""}">
      <i class="stripe" style="background:${i.stripe}"></i>
      <b class="lb">${esc(m.label)}</b>
      ${i.rating ? `<span class="rt" style="${i.rc ? `background:${i.rc};color:${onColor(i.rc)}` : ""}">${esc(i.rating)}</span>` : ""}
    </div>`;
  }
  return html;
}

// Streifen für die Auswahl {cabId: [reihen]} bei gegebener nutzbarer Breite
export function labelStrips(panel, selection, usableW) {
  const { te } = labelSettings(panel);
  const maxTE = Math.max(1, Math.floor(usableW / te));
  const strips = [];
  for (const cab of panel.data.cabinets) {
    for (const r of (selection[cab.id] ?? []).slice().sort((a, b) => a - b)) {
      const { cells, has } = rowCells(panel, cab, r);
      if (!has) continue;
      // Leere TE am Anfang und Ende eines Stücks brauchen kein Etikett; ganz leere Stücke entfallen
      const mods = cells.filter((c) => !c.empty);
      const trim = ([a, b]) => {
        const inside = mods.filter((c) => c.from < b && c.from + c.width > a);
        if (!inside.length) return null;
        return [Math.max(a, Math.min(...inside.map((c) => c.from))), Math.min(b, Math.max(...inside.map((c) => c.from + c.width)))];
      };
      const segs = splitRow(cells, cab.width, maxTE).map(trim).filter(Boolean);
      segs.forEach(([a, b], i) => strips.push({
        title: `${cab.code} · Reihe ${r + 1}${segs.length > 1 ? ` · Teil ${i + 1}/${segs.length}` : ""} · TE ${a + 1}–${b}`,
        w: (b - a) * te, html: () => segmentHtml(panel, cells, a, b, te),
      }));
    }
  }
  return strips;
}

const GAP = 2;    // mm zwischen den Streifen
const HEAD = 3.2; // mm Kopfzeile über jedem Streifen

// Regal-Packung in natürlicher Reihenfolge (Kasten, Reihe, Teil): jeder Streifen kommt in die
// erste Zeile, in die er noch passt; so bleiben Teile einer Reihe beisammen und kurze füllen Lücken
function pack(strips, W, H, lineH) {
  const perSheet = Math.max(1, Math.floor((H + GAP) / (lineH + GAP)));
  const lines = [];
  for (const s of strips) {
    const line = lines.find((l) => l.used + GAP + s.w <= W + 0.01);
    if (line) { s.x = line.used + GAP; line.used += GAP + s.w; line.items.push(s); }
    else { s.x = 0; lines.push({ used: s.w, items: [s] }); }
  }
  const sheets = [];
  lines.forEach((l, i) => {
    const sheet = Math.floor(i / perSheet);
    (sheets[sheet] ??= []).push(...l.items.map((s) => ({ ...s, y: (i % perSheet) * (lineH + GAP) })));
  });
  return sheets;
}

// Plan für eine Ausrichtung; "auto" nimmt die mit weniger Blättern, bei Gleichstand weniger Teilungen
export function labelPlan(panel, selection, orientation = "auto", calib = false) {
  const { height, margin, te } = labelSettings(panel);
  const lineH = height + HEAD;
  const make = (o) => {
    const W = (o === "portrait" ? 210 : 297) - 2 * margin;
    const H = (o === "portrait" ? 297 : 210) - 2 * margin;
    const strips = labelStrips(panel, selection, W);
    if (calib) strips.push({ calib: true, title: "Kalibrierung", w: Math.min(W, Math.max(100, 10 * te)) });
    const sheets = pack(strips, W, H, lineH);
    return { orientation: o, W, H, sheets, strips: strips.filter((s) => !s.calib).length };
  };
  if (orientation !== "auto") return make(orientation);
  const p = make("portrait"), l = make("landscape");
  if (p.sheets.length !== l.sheets.length) return p.sheets.length < l.sheets.length ? p : l;
  return p.strips <= l.strips ? p : l;
}

export function printLabelSheets(panel, selection, orientation = "auto", calib = false) {
  const { height, margin, te } = labelSettings(panel);
  const plan = labelPlan(panel, selection, orientation, calib);
  if (!plan.sheets.length) return null;
  const calibHtml = (w) => `<div class="calib" style="width:${w}mm;height:${height}mm">
      <div class="bar" style="width:100mm"><span>100 mm</span></div>
      <div class="bar te" style="width:${10 * te}mm"><span>10 TE = ${(10 * te).toFixed(1).replace(".", ",")} mm</span></div>
    </div>`;
  const pages = plan.sheets.map((items) => `<div class="page"><div class="area">${items.map((s) => `
    <div class="item" style="left:${s.x}mm;top:${s.y}mm;width:${s.w}mm">
      <div class="rl">${esc(s.title)}</div>
      ${s.calib ? calibHtml(s.w) : `<div class="strip" style="height:${height}mm">${s.html()}</div>`}
    </div>`).join("")}</div></div>`).join("");
  const css = `
@page { size: A4 ${plan.orientation}; margin: 0; }
@media screen { body { padding: 10mm; background: #f2f2f2; } .page { background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.2); margin-bottom: 8mm; } }
/* Seite ohne Druckrand (sonst skaliert der Drucker das Blatt herunter); der Blattrand wird hier
   als Einzug umgesetzt, damit nichts im nicht bedruckbaren Bereich landet */
.page { position: relative; width: ${plan.W + 2 * margin}mm; height: ${plan.H + 2 * margin - 0.5}mm; overflow: hidden; break-after: page; }
.area { position: absolute; left: ${margin}mm; top: ${margin}mm; width: ${plan.W}mm; height: ${plan.H}mm; }
.page:last-child { break-after: auto; }
.item { position: absolute; }
.rl { height: ${HEAD}mm; font-size: 6.5pt; line-height: ${HEAD}mm; color: #777; white-space: nowrap; overflow: hidden; }
.strip { display: flex; outline: 0.2mm dashed #555; }
.cell { position: relative; height: 100%; border-right: 0.2mm dashed #888; padding: 1.8mm 0.3mm 0.6mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6mm; text-align: center; }
.cell:last-child { border-right: 0; }
.cell.empty { background: repeating-linear-gradient(45deg, #fff 0 1.5mm, #f1f1f1 1.5mm 3mm); }
.stripe { position: absolute; left: 0; right: 0; top: 0; height: 1.4mm; }
.lb { font-size: 16pt; line-height: 1; letter-spacing: -0.3pt; white-space: nowrap; }
.rt { font-size: 8pt; font-weight: 700; line-height: 1; padding: 0.4mm 0.8mm; border-radius: 0.6mm; border: 0.15mm solid #888; }
.calib { display: flex; flex-direction: column; justify-content: space-around; outline: 0.2mm dashed #555; padding: 0 0 0 0; }
.bar { position: relative; height: 3mm; border: 0.2mm solid #000; border-top: 0; }
.bar.te { border-color: #1565c0; }
.bar span { position: absolute; left: 1mm; top: -0.2mm; font-size: 6.5pt; line-height: 3mm; }`;
  printHtml("Beschriftung", css, pages);
  return plan;
}

export function printOverview(panel, cabId, orientation = "landscape") {
  const portrait = orientation === "portrait";
  const net = panel.net;
  const cab = net.cabinets.get(cabId);
  const mods = panel.data.modules.filter((m) => m.cabinet === cabId);
  const te = Math.min(12, (portrait ? 170 : 250) / cab.width); // mm je TE, passt auf die Seitenbreite
  const modH = 30, rowH = 38;
  let board = "";
  for (let r = 0; r < cab.rows; r++) {
    board += `<div class="rail" style="top:${r * rowH + 4 + modH / 2 - 2.5}mm;width:${cab.width * te}mm"></div>
              <div class="rlab" style="top:${r * rowH + 4 + modH / 2 - 2}mm">R${r + 1}</div>`;
  }
  for (const m of mods.filter((x) => x.row !== null)) {
    const i = moduleInfo(panel, m);
    const wide = (m.width || 1) > 1;
    board += `<div class="mod${wide ? " wide" : ""}" style="left:${10 + m.slot * te}mm;top:${m.row * rowH + 4}mm;width:${(m.width || 1) * te - 0.8}mm;height:${modH}mm;${i.tint ? `background:color-mix(in srgb, #f4f4f4 78%, ${i.tint} 22%);border-color:color-mix(in srgb, #bbb 50%, ${i.tint} 50%)` : ""}">
      <i class="stripe" style="background:${i.stripe}"></i>
      <b>${esc(m.label)}</b>
      ${i.rating ? `<span class="rt" style="${i.rc ? `background:${i.rc};color:${onColor(i.rc)}` : ""}">${esc(i.rating)}</span>` : ""}
      <span class="nm">${esc(i.name)}</span>
    </div>`;
  }
  const rcdLabel = (id) => net.modules.get(id)?.label ?? "";
  const rowsHtml = mods
    .slice().sort((a, b) => (a.row ?? 99) - (b.row ?? 99) || (a.slot ?? 0) - (b.slot ?? 0))
    .flatMap((m) => {
      const i = moduleInfo(panel, m);
      const nodes = i.nodes.length ? i.nodes : [null];
      return nodes.map((n, k) => {
        const ph = n ? net.phase(n.id) : null;
        return `<tr>
          <td>${k === 0 ? `<b>${esc(m.label)}</b>` : ""}</td>
          <td class="nw">${n ? esc(net.address(n.id)) : esc(net.moduleTitle(m))}</td>
          <td>${n ? esc(net.name(n.id, panel.hass)) : esc(i.name)}</td>
          <td>${k === 0 ? esc(m.model || MODULE_TYPE_LABEL[m.type]) : ""}</td>
          <td class="nw">${ph ? `<span class="ph" style="background:${panel.data.settings.colors[ph] ?? "#7d8a96"}"></span>${PHASE_LABEL[ph]}` : ""}</td>
          <td>${k === 0 && i.rating ? `<span class="rt" style="${i.rc ? `background:${i.rc};color:${onColor(i.rc)}` : ""}">${esc(i.rating)}</span>${m.rcd_ma ? ` ${m.rcd_ma} mA` : ""}` : ""}</td>
          <td>${k === 0 ? esc(rcdLabel(m.rcd)) : ""}</td>
          <td>${k === 0 ? esc(m.notes ?? "") : ""}</td>
        </tr>`;
      });
    }).join("");
  const feed = cab.feed ? `gespeist von ${esc(net.address(cab.feed))} ${esc(net.name(cab.feed, panel.hass))}` : "gespeist von der Hauszuleitung";
  const legend = Object.entries(panel.data.settings.colors).map(([p, c]) => `<span><i style="background:${c}"></i>${PHASE_LABEL[p]}</span>`).join("");
  const css = `
@page { size: A4 ${portrait ? "portrait" : "landscape"}; margin: 10mm; }
h1 { font-size: 15pt; margin: 0 0 1mm; }
.nw { white-space: nowrap; }
.ph { margin-right: 1.5mm; }
.meta { font-size: 9pt; color: #555; margin-bottom: 5mm; }
.board { position: relative; border: 0.4mm solid #999; border-radius: 3mm; background: #fafafa; margin-bottom: 4mm; }
.rail { position: absolute; left: 10mm; height: 5mm; background: #e2e2e2; border-top: 0.2mm solid #c8c8c8; border-bottom: 0.2mm solid #c8c8c8; }
.rlab { position: absolute; left: 2.5mm; font-size: 7pt; color: #777; }
.mod { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 1mm; padding: 2.4mm 0.4mm 1mm; background: #f4f4f4; border: 0.25mm solid #bbb; border-radius: 0.8mm; overflow: hidden; font-size: 7pt; }
.mod .stripe { position: absolute; left: 0; right: 0; top: 0; height: 1.3mm; }
.mod .nm { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 6.3pt; line-height: 1.1; overflow: hidden; flex: 1; min-height: 0; white-space: nowrap; text-overflow: ellipsis; }
.mod.wide .nm { writing-mode: horizontal-tb; transform: none; white-space: normal; text-align: center; }
.rt { display: inline-block; font-size: 6pt; font-weight: 700; padding: 0.3mm 0.8mm; border-radius: 0.7mm; border: 0.15mm solid #999; }
.legend { display: flex; gap: 6mm; font-size: 8pt; color: #555; margin-bottom: 4mm; }
.legend i, .ph { display: inline-block; width: 4mm; height: 1.6mm; margin-right: 1.5mm; vertical-align: middle; border-radius: 0.4mm; }
table { width: 100%; border-collapse: collapse; font-size: 8pt; }
th { text-align: left; font-weight: 600; border-bottom: 0.4mm solid #444; padding: 1.2mm 1.5mm; }
td { border-bottom: 0.15mm solid #ccc; padding: 1mm 1.5mm; vertical-align: top; }
tr { break-inside: avoid; }
.mono { font-family: ui-monospace, Menlo, monospace; font-size: 7pt; }
.page-break { break-before: page; }`;
  printHtml(`Kastenübersicht ${cab.code}`, css,
    `<div class="sheet">
      <h1>${esc(cab.code)} – ${esc(cab.name)}</h1>
      <div class="meta">${cab.rows} Reihen × ${cab.width} TE · ${feed} · Stand ${new Date().toLocaleDateString("de-AT")}</div>
      <div class="board" style="width:${cab.width * te + 14}mm;height:${cab.rows * rowH + 4}mm">${board}</div>
      <div class="legend">${legend}<span>Farbmarke = Nennstrom (Farbcode D-Schmelzeinsätze)</span></div>
    </div>
    <div class="sheet page-break">
      <h1>Stromkreise ${esc(cab.code)}</h1>
      <table><thead><tr><th>Gerät</th><th>Adresse</th><th>Bezeichnung</th><th>Typ / Modell</th><th>Phase</th><th>Nennstrom</th><th>FI</th><th>Notizen</th></tr></thead>
      <tbody>${rowsHtml}</tbody></table>
    </div>`);
}
