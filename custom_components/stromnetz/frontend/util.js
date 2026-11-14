// Hilfsfunktionen ohne Abhängigkeiten

export const PHASES = ["A", "B", "C"];
export const PHASES_N = ["A", "B", "C", "N"];
export const PHASE_LABEL = { A: "L1", B: "L2", C: "L3", N: "N" };
export const GRID = "grid";
export const NEUTRAL = "var(--sn-neutral)";

export const KIND_LABEL = {
  breaker: "Sicherung / Abgang",
  rcd: "FI-Kanal",
  relay: "Relais-Kanal",
  junction: "Abzweig / Leitung",
  outlet: "Steckdose",
  fixed: "Festanschluss / Leuchte",
  appliance: "Gerät",
  unknown: "Unbekannter Stromkreis",
};

export const MODULE_TYPE_LABEL = {
  breaker: "Leitungsschutzschalter",
  rcd: "FI-Schutzschalter",
  rcbo: "FI/LS-Kombination",
  relay: "Relais / Aktor",
  meter: "Messgerät",
  other: "Sonstiges",
};


export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith("--")) el.style.setProperty(sk, sv);
        else el.style[sk] = sv;
      }
    }
    else if (k === "class") el.className = v;
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && typeof v !== "string") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function svg(tag, attrs = {}, ...children) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, v);
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

export function icon(path, size = 18) {
  return svg("svg", { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": "true", class: "ico" },
    svg("path", { d: path, fill: "currentColor" }));
}

// MDI-Pfade (Apache 2.0)
export const MDI = {
  plus: "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",
  minus: "M19,13H5V11H19V13Z",
  fit: "M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z",
  pencil: "M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z",
  del: "M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z",
  move: "M14,18L12,16L10,18L12,20L14,18M18,10L16,12L18,14L20,12L18,10M10,6L12,8L14,6L12,4L10,6M6,10L4,12L6,14L8,12L6,10Z",
  collapse: "M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z",
  expand: "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z",
  cabinet: "M3,3H21V21H3V3M5,5V19H8V5H5M10,5V19H14V5H10M16,5V19H19V5H16Z",
  history: "M16,11.78L20.24,4.45L21.97,5.45L16.74,14.5L10.23,10.75L5.46,19H22V21H2V3H4V17.54L9.5,8L16,11.78Z",
  outlet: "M8 6H10V11H8V6M14 6H16V11H14V6M5 3H19A2 2 0 0 1 21 5V19A2 2 0 0 1 19 21H5A2 2 0 0 1 3 19V5A2 2 0 0 1 5 3M5 5V19H19V5H5M10 15V13H14V15H10Z",
  power: "M16.5,7.5V4H15V7.5H9V4H7.5V7.5C6.67,7.5 6,8.17 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8.17 17.33,7.5 16.5,7.5Z",
  solar: "M3.33,16H11V13H4L3.33,16M13,16H20.67L20,13H13V16M21.11,18H13V22H22L21.11,18M2,22H11V18H2.89L2,22M11,8H13V11H11V8M15.76,7.21L17.18,5.79L19.3,7.91L17.89,9.33L15.76,7.21M4.71,7.91L6.83,5.79L8.24,7.21L6.12,9.33L4.71,7.91M3,2H6V4H3V2M18,2H21V4H18V2M12,1A5,5 0 0,1 17,6H7A5,5 0 0,1 12,1Z",
  link: "M10.59,13.41C11,13.8 11,14.44 10.59,14.83C10.2,15.22 9.56,15.22 9.17,14.83C7.22,12.88 7.22,9.71 9.17,7.76V7.76L12.71,4.22C14.66,2.27 17.83,2.27 19.78,4.22C21.73,6.17 21.73,9.34 19.78,11.29L18.29,12.78C18.3,11.96 18.17,11.14 17.89,10.36L18.36,9.88C19.54,8.71 19.54,6.81 18.36,5.64C17.19,4.46 15.29,4.46 14.12,5.64L10.59,9.17C9.41,10.34 9.41,12.24 10.59,13.41M13.41,9.17C13.8,8.78 14.44,8.78 14.83,9.17C16.78,11.12 16.78,14.29 14.83,16.24V16.24L11.29,19.78C9.34,21.73 6.17,21.73 4.22,19.78C2.27,17.83 2.27,14.66 4.22,12.71L5.71,11.22C5.7,12.04 5.83,12.86 6.11,13.65L5.64,14.12C4.46,15.29 4.46,17.19 5.64,18.36C6.81,19.54 8.71,19.54 9.88,18.36L13.41,14.83C14.59,13.66 14.59,11.76 13.41,10.59C13,10.2 13,9.56 13.41,9.17Z",
  close: "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",
  back: "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",
  lamp: "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z",
  junction: "M12,2A3,3 0 0,1 15,5C15,6.3 14.16,7.4 13,7.82V11H17.18C17.6,9.84 18.7,9 20,9A3,3 0 0,1 23,12A3,3 0 0,1 20,15C18.7,15 17.6,14.16 17.18,13H13V16.18C14.16,16.6 15,17.7 15,19A3,3 0 0,1 12,22A3,3 0 0,1 9,19C9,17.7 9.84,16.6 11,16.18V13H6.82C6.4,14.16 5.3,15 4,15A3,3 0 0,1 1,12A3,3 0 0,1 4,9C5.3,9 6.4,9.84 6.82,11H11V7.82C9.84,7.4 9,6.3 9,5A3,3 0 0,1 12,2Z",
  breaker: "M8,2H16V4H18V20H16V22H8V20H6V4H8V2M9,6V11H15V6H9M10,13V18H14V13H10Z",
  printer: "M18,3H6V7H18M19,12A1,1 0 0,1 18,11A1,1 0 0,1 19,10A1,1 0 0,1 20,11A1,1 0 0,1 19,12M16,19H8V14H16M19,8H5A3,3 0 0,0 2,11V17H6V21H18V17H22V11A3,3 0 0,0 19,8Z",
  toggle: "M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M17,15A3,3 0 0,1 14,12A3,3 0 0,1 17,9A3,3 0 0,1 20,12A3,3 0 0,1 17,15Z",
};

export function clone(o) {
  return JSON.parse(JSON.stringify(o));
}

export function newId(prefix, taken) {
  if (!taken.has(prefix)) return prefix;
  let i = 2;
  while (taken.has(`${prefix}_${i}`)) i++;
  return `${prefix}_${i}`;
}

export function slug(text) {
  return String(text).toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function fmtW(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  const a = Math.abs(v);
  if (a >= 10000) return `${(v / 1000).toFixed(1)} kW`;
  return `${Math.round(v)} W`;
}

export function num(hass, entityId) {
  if (!entityId || !hass) return null;
  const st = hass.states[entityId];
  if (!st) return null;
  const v = parseFloat(st.state);
  return Number.isFinite(v) ? v : null;
}

export function friendly(hass, entityId) {
  const st = entityId && hass?.states[entityId];
  return st?.attributes?.friendly_name ?? entityId ?? "";
}

export function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function fireMoreInfo(el, entityId) {
  el.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
}
