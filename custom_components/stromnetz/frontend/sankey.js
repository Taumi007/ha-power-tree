// Sankey: Netz → Stockwerk → Raum/Topf, aus den Gruppen-Sensoren der Bilanz (ohne externe Bibliothek)
import { fmtW, num, svg } from "./util.js";

// Gedeckte Farben, im Hell- und Dunkelmodus gut unterscheidbar
const FLOOR_COLORS = ["#6f9fc8", "#c9a25b", "#86b07a", "#a985c4", "#cf8a6e", "#5fae9f", "#c27ba0", "#8d99ae"];
const NO_FLOOR = "#8a8f96";

export function roomSankey(panel, width, { minShare = 0.004 } = {}) {
  const hass = panel.hass, desc = panel.desc;
  const strip = (s) => s.replace(panel.data.settings.name_prefix ?? "", "").replace(/ Leistung$/, "");
  const rooms = (desc.groups ?? []).filter((g) => g.gruppe === "raum")
    .map((g) => ({ id: g.entity_id, name: strip(g.name), floor: g.stockwerk ?? null, value: Math.max(0, num(hass, g.entity_id) ?? 0) }))
    .filter((r) => r.value > 0);
  const total = rooms.reduce((a, r) => a + r.value, 0);
  if (!total) return null;

  // Stockwerke in der Reihenfolge von HA, unbekannte am Ende
  const floorOrder = Object.keys(desc.floors ?? {});
  const floors = new Map();
  for (const r of rooms) {
    const key = r.floor ?? "__none";
    if (!floors.has(key)) floors.set(key, { key, name: r.floor ? desc.floors?.[r.floor] ?? r.floor : "Ohne Stockwerk", rooms: [], value: 0 });
    const f = floors.get(key);
    f.value += r.value;
    f.rooms.push(r);
  }
  const fl = [...floors.values()].sort((a, b) => {
    const ia = a.key === "__none" ? 999 : floorOrder.indexOf(a.key), ib = b.key === "__none" ? 999 : floorOrder.indexOf(b.key);
    return (ia < 0 ? 500 : ia) - (ib < 0 ? 500 : ib);
  });
  fl.forEach((f, i) => {
    f.color = f.key === "__none" ? NO_FLOOR : FLOOR_COLORS[i % FLOOR_COLORS.length];
    // Kleine Räume je Stockwerk zusammenfassen, damit die Beschriftung lesbar bleibt
    f.rooms.sort((a, b) => b.value - a.value);
    const small = f.rooms.filter((r) => r.value / total < minShare);
    if (small.length > 1) {
      f.rooms = f.rooms.filter((r) => !small.includes(r));
      f.rooms.push({ id: null, name: `${small.length} kleinere`, value: small.reduce((a, r) => a + r.value, 0), small });
    }
  });

  // Geometrie
  const labelW = Math.min(190, Math.max(120, width * 0.2));
  const nodeW = 14, pad = 6;
  const roomCount = fl.reduce((a, f) => a + f.rooms.length, 0);
  const height = Math.max(360, roomCount * 26 + 40);
  const usable = height - 20 - pad * Math.max(roomCount - 1, fl.length - 1, 0);
  const k = usable / total;
  const x0 = 8, x2 = width - labelW - nodeW, x1 = (x0 + nodeW + labelW + x2) / 2 - nodeW / 2;

  const root = svg("svg", { width, height, viewBox: `0 0 ${width} ${height}`, class: "sankey", role: "img", "aria-label": "Leistung nach Stockwerk und Raum" });
  const links = svg("g", { class: "links" }), nodes = svg("g", { class: "nodes" }), labels = svg("g", { class: "labels" });
  root.append(links, nodes, labels);
  const band = (sx, sy0, sy1, tx, ty0, ty1, color, title) => {
    const c = (sx + tx) / 2;
    const p = svg("path", {
      d: `M${sx},${sy0} C${c},${sy0} ${c},${ty0} ${tx},${ty0} L${tx},${ty1} C${c},${ty1} ${c},${sy1} ${sx},${sy1} Z`,
      fill: color, "fill-opacity": 0.32,
    }, svg("title", {}, title));
    p.addEventListener("mouseenter", () => p.setAttribute("fill-opacity", 0.55));
    p.addEventListener("mouseleave", () => p.setAttribute("fill-opacity", 0.32));
    links.append(p);
  };
  const rect = (x, y, hgt, color, title, entity) => {
    const r = svg("rect", { x, y, width: nodeW, height: Math.max(hgt, 1.5), rx: 2, fill: color, class: entity ? "clickable" : "" }, svg("title", {}, title));
    if (entity) r.addEventListener("click", () => panel.moreInfo(entity));
    nodes.append(r);
  };
  const label = (x, y, text, value, anchor = "start", entity = null) => {
    const t = svg("text", { x, y, "text-anchor": anchor, "dominant-baseline": "middle", class: entity ? "clickable" : "" },
      svg("tspan", { class: "n" }, text), svg("tspan", { class: "v", dx: 6 }, fmtW(value)));
    if (entity) t.addEventListener("click", () => panel.moreInfo(entity));
    labels.append(t);
  };

  // Spalte 0: Netz
  const totalH = total * k;
  const y0 = (height - totalH - pad * (fl.length - 1)) / 2;
  rect(x0, y0, totalH + pad * (fl.length - 1), "var(--sn-accent)", `Gesamt ${fmtW(total)}`);
  // Spalte 1 und 2: Stockwerke und Räume, Räume bestimmen die Höhe
  let ry = 10, sy = y0;
  const floorTotalH = fl.reduce((a, f) => a + f.value * k, 0) + pad * (fl.length - 1);
  let fy = (height - floorTotalH) / 2;
  for (const f of fl) {
    const fh = f.value * k;
    band(x0 + nodeW, sy, sy + fh, x1, fy, fy + fh, f.color, `${f.name}: ${fmtW(f.value)}`);
    sy += fh + pad;
    rect(x1, fy, fh, f.color, `${f.name}: ${fmtW(f.value)} (${Math.round((f.value / total) * 100)} %)`);
    label(x1 + nodeW + 6, fy + fh / 2, f.name, f.value);
    let oy = fy;
    for (const r of f.rooms) {
      const rh = r.value * k;
      band(x1 + nodeW, oy, oy + rh, x2, ry, ry + rh, f.color, `${f.name} → ${r.name}: ${fmtW(r.value)}`);
      rect(x2, ry, rh, f.color, `${r.name}: ${fmtW(r.value)}${r.small ? `\n${r.small.map((s) => `${s.name} ${fmtW(s.value)}`).join("\n")}` : ""}`, r.id);
      label(x2 + nodeW + 6, ry + rh / 2, r.name, r.value, "start", r.id);
      oy += rh;
      ry += rh + pad;
    }
    fy += fh + pad;
  }
  label(x0 + nodeW + 6, y0 - 10 < 8 ? 8 : y0 - 10, "Gesamt", total);
  return root;
}
