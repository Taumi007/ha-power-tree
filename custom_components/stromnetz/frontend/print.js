// Druckansichten: Beschriftungsstreifen (Maßstab 1:1) und Kastenübersicht (A4 quer, als PDF speicherbar)
import { onColor, ratingColor } from "./catalog.js";
import { MODULE_TYPE_LABEL, PHASE_LABEL } from "./util.js";

const TE_MM = 17.5; // Teilungseinheit nach DIN 43880

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

export function printLabels(panel, cabId) {
  const cab = panel.net.cabinets.get(cabId);
  const mods = panel.data.modules.filter((m) => m.cabinet === cabId && m.row !== null);
  const rows = [];
  for (let r = 0; r < cab.rows; r++) {
    const inRow = mods.filter((m) => m.row === r).sort((a, b) => a.slot - b.slot);
    if (!inRow.length) continue;
    let cells = "", slot = 0;
    for (const m of inRow) {
      if (m.slot > slot) cells += `<div class="cell empty" style="width:${(m.slot - slot) * TE_MM}mm"></div>`;
      const i = moduleInfo(panel, m);
      cells += `<div class="cell" style="width:${(m.width || 1) * TE_MM}mm;${i.tint ? `background:color-mix(in srgb, #fff 82%, ${i.tint} 18%)` : ""}">
        <i class="stripe" style="background:${i.stripe}"></i>
        <b class="lb">${esc(m.label)}</b>
        ${i.rating ? `<span class="rt" style="${i.rc ? `background:${i.rc};color:${onColor(i.rc)}` : ""}">${esc(i.rating)}</span>` : ""}
      </div>`;
      slot = m.slot + (m.width || 1);
    }
    if (slot < cab.width) cells += `<div class="cell empty" style="width:${(cab.width - slot) * TE_MM}mm"></div>`;
    rows.push(`<div class="label-row"><div class="rl">${esc(cab.code)} · Reihe ${r + 1}</div><div class="strip">${cells}</div></div>`);
  }
  const css = `
@page { size: A4 landscape; margin: 6mm; }
h1 { font-size: 13pt; margin: 0 0 2mm; }
.label-row { margin-bottom: 7mm; break-inside: avoid; }
.rl { font-size: 8pt; color: #666; margin-bottom: 1mm; }
.strip { display: flex; height: 15mm; border: 0.3mm solid #444; width: max-content; }
.cell { position: relative; height: 100%; border-right: 0.2mm dashed #888; padding: 1.8mm 0.3mm 0.6mm; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6mm; text-align: center; }
.cell:last-child { border-right: 0; }
.cell.empty { background: repeating-linear-gradient(45deg, #fff 0 1.5mm, #f1f1f1 1.5mm 3mm); }
.stripe { position: absolute; left: 0; right: 0; top: 0; height: 1.4mm; }
.lb { font-size: 16pt; line-height: 1; letter-spacing: -0.3pt; white-space: nowrap; }
.rt { font-size: 8pt; font-weight: 700; line-height: 1; padding: 0.4mm 0.8mm; border-radius: 0.6mm; border: 0.15mm solid #888; }`;
  printHtml(`Beschriftung ${cab.code}`, css,
    `<div class="sheet"><h1>Beschriftung ${esc(cab.code)} – ${esc(cab.name)}</h1>
     <p class="hint">Maßstab 1:1 (1 TE = ${TE_MM} mm). Beim Drucken »Tatsächliche Größe / 100 %« wählen, an der gestrichelten Linie entlang schneiden.</p>
     ${rows.join("") || "<p>Keine platzierten Geräte.</p>"}</div>`);
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
