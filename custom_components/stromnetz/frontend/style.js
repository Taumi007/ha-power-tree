// Styles: nutzt ausschließlich HA-Theme-Variablen, dadurch automatisch Hell/Dunkel
export const STYLE = `
:host {
  --sn-bg: var(--primary-background-color);
  --sn-card: var(--card-background-color, var(--ha-card-background));
  --sn-text: var(--primary-text-color);
  --sn-sub: var(--secondary-text-color);
  --sn-div: var(--divider-color);
  --sn-accent: var(--primary-color);
  --sn-neutral: var(--disabled-text-color, #8a8f96);
  --sn-raised: color-mix(in srgb, var(--sn-card) 88%, var(--sn-text) 12%);
  --sn-hover: color-mix(in srgb, var(--sn-card) 80%, var(--sn-text) 20%);
  --sn-sel: color-mix(in srgb, var(--sn-card) 75%, var(--sn-accent) 25%);
  display: flex; flex-direction: column; height: 100vh; height: 100dvh; overflow: hidden; overscroll-behavior: none; background: var(--sn-bg); color: var(--sn-text);
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); font-size: 14px;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
input, select, textarea { font: inherit; color: var(--sn-text); background: var(--sn-raised); border: 1px solid var(--sn-div); border-radius: 8px; padding: 8px 10px; min-width: 0; }
input:focus, select:focus, textarea:focus { outline: 2px solid var(--sn-accent); outline-offset: -1px; }
.ico { flex: none; }
.muted { color: var(--sn-sub); }
.small { font-size: 12px; }
.grow { flex: 1; min-width: 0; }
.row { display: flex; align-items: center; gap: 8px; }
.row.wrap { flex-wrap: wrap; }
.row.end { justify-content: flex-end; }
.empty { padding: 32px; color: var(--sn-sub); }

header { display: flex; align-items: center; gap: 12px; height: var(--header-height, 56px); padding: 0 12px 0 8px; background: var(--app-header-background-color, var(--sn-card)); color: var(--app-header-text-color, var(--sn-text)); border-bottom: 1px solid var(--sn-div); flex-wrap: nowrap; }
.icon-btn.menu-btn { display: none; }
:host([narrow]) .icon-btn.menu-btn, :host([sidebar-hidden]) .icon-btn.menu-btn { display: inline-flex; }
.brand { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 400; padding-left: 8px; }
.brand .ico { color: var(--sn-accent); }
.tabs { display: flex; align-self: stretch; margin-left: 12px; }
.tab { background: none; border: 0; border-bottom: 2px solid transparent; padding: 0 14px; color: var(--sn-sub); font-weight: 500; }
.tab.active { color: var(--sn-text); border-bottom-color: var(--sn-accent); }
.search { display: flex; align-items: center; gap: 6px; padding: 0 10px; height: 36px; border-radius: 18px; background: var(--sn-raised); border: 1px solid var(--sn-div); color: var(--sn-sub); }
.search input { background: none; border: 0; padding: 0; width: 220px; outline: none; }
.btn { height: 36px; padding: 0 14px; border-radius: 18px; border: 1px solid var(--sn-div); background: transparent; font-weight: 500; white-space: nowrap; }
.btn.primary { background: var(--sn-accent); border-color: var(--sn-accent); color: var(--text-primary-color, #fff); }
.btn:disabled { opacity: .45; cursor: default; }
.btn.on { background: var(--sn-sel); border-color: var(--sn-accent); }
.status .err { background: none; border: 0; color: var(--error-color, #db4437); font-weight: 500; }
.icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; border: 0; background: transparent; }
.icon-btn:hover { background: var(--sn-hover); }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border-radius: 16px; border: 1px solid var(--sn-div); background: var(--sn-card); font-size: 13px; font-weight: 500; white-space: nowrap; }
.chip:hover { background: var(--sn-hover); }
.chip.active { background: var(--sn-sel); border-color: var(--sn-accent); }
.chip.dashed { border-style: dashed; color: var(--sn-sub); }
.chip.danger, .danger { color: var(--error-color, #db4437); }
.banner { display: none; padding: 8px 16px; background: var(--sn-sel); border-bottom: 1px solid var(--sn-accent); }
.banner.show { display: block; }
.banner .chip { margin-left: 8px; }

main { flex: 1; min-height: 0; position: relative; }
.body { position: absolute; inset: 0; display: flex; }
.body > :first-child { flex: 1; min-width: 0; }

/* Fluss */
.flow { position: relative; overflow: hidden; touch-action: none; cursor: grab;
  background-color: var(--sn-bg); background-image: radial-gradient(color-mix(in srgb, var(--sn-text) 14%, transparent) 1px, transparent 1px); background-size: 24px 24px; }
.flow:active { cursor: grabbing; }
.stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.edges { position: absolute; left: 0; top: 0; overflow: visible; pointer-events: none; }
.edges path { stroke-linecap: round; transition: stroke-width .4s; }
.card { position: absolute; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 10px; font-size: 13px; line-height: 17px; cursor: pointer; user-select: none; box-shadow: 0 1px 2px rgba(0,0,0,.12); }
.card:hover { border-color: var(--sn-sub); }
.card .txt { flex: 1; min-width: 0; }
.card .title { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .sub { color: color-mix(in srgb, var(--sn-text) 74%, transparent); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.card .val { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.card .kicon { color: var(--sn-sub); display: flex; }
.card.selected { border: 2px solid var(--sn-accent); background: var(--sn-sel); padding: 0 11px; }
.card.picking { outline: 2px dashed var(--sn-accent); outline-offset: 3px; }
.card.dragging { opacity: .85; z-index: 5; box-shadow: 0 8px 24px rgba(0,0,0,.35); }
.card.unmetered .val { color: var(--sn-sub); font-weight: 500; }
.grid-card { flex-direction: column; align-items: stretch; justify-content: flex-start; padding: 10px 14px; gap: 2px; }
.grid-card .title { font-size: 15px; }
.phase-row { position: relative; display: flex; justify-content: space-between; height: 24px; align-items: center; }
.phase-row .ph { font-weight: 700; }
.phase-row .port { position: absolute; right: -21px; width: 14px; height: 14px; border-radius: 7px; border: 3px solid var(--sn-card); }
.group-card { background: var(--sn-raised); }
.group-card.loose { border-style: dashed; }
.rest-card { background: transparent; border-style: dashed; color: var(--sn-sub); }
.flow-controls { position: absolute; left: 16px; bottom: 16px; display: flex; gap: 6px; align-items: center; }
.flow-controls .icon-btn { background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 8px; }

/* Schaltschrank */
.cabinet-view { overflow: auto; padding: 16px 24px 24px; touch-action: pan-x pan-y; overscroll-behavior: contain; }
.cab-tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.cab-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.board-wrap { overflow: visible; width: max-content; }
.board { position: relative; background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 14px; }
.rail { position: absolute; left: 48px; height: 24px; background: var(--sn-raised); border-top: 1px solid var(--sn-div); border-bottom: 1px solid var(--sn-div); }
.row-label { position: absolute; left: 14px; font-size: 12px; color: var(--sn-sub); }
.slot { position: absolute; border: 1px dashed color-mix(in srgb, var(--sn-text) 25%, transparent); border-radius: 4px; background: transparent; color: color-mix(in srgb, var(--sn-text) 30%, transparent); font-size: 18px; }
.slot:hover { color: var(--sn-text); border-color: var(--sn-accent); background: var(--sn-hover); }
.module { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: space-between; gap: 6px; padding: 10px 2px 8px; background: var(--sn-raised); border: 1px solid var(--sn-div); border-radius: 4px; cursor: pointer; user-select: none; touch-action: pan-x pan-y; font-size: 11px; overflow: hidden; }
.module::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--stripe); }
.module .mlabel { font-size: 13px; color: var(--sn-text); }
.module .mname { flex: 1; min-height: 0; writing-mode: vertical-rl; transform: rotate(180deg); color: var(--sn-text); font-size: 12.5px; font-weight: 500; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.module.wide .mname { writing-mode: horizontal-tb; transform: none; text-align: center; white-space: normal; padding: 0 6px; font-size: 13px; display: flex; align-items: center; justify-content: center; align-self: stretch; }
.module.wide .mname .mni { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; overflow-wrap: anywhere; hyphens: auto; }
.module .mrcd { font-size: 11px; color: var(--sn-sub); white-space: nowrap; }
.module .mval { font-variant-numeric: tabular-nums; color: var(--sn-text); font-weight: 600; }
.zone { position: absolute; border: 1px dashed color-mix(in srgb, var(--sn-accent) 45%, transparent); border-radius: 6px; background: color-mix(in srgb, var(--sn-accent) 5%, transparent); }
.zslot { font-size: 14px; }
.mount::before { content: ""; position: absolute; left: 0; right: 0; top: 0; height: 4px; background: var(--stripe); }
.mount { position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; padding: 4px 6px 0; background: color-mix(in srgb, var(--sn-accent) 16%, var(--sn-raised)); border: 1px solid color-mix(in srgb, var(--sn-accent) 60%, transparent); border-radius: 4px; font-size: 11px; cursor: pointer; user-select: none; touch-action: none; overflow: hidden; white-space: nowrap; }
.mount .mhead { display: flex; gap: 6px; max-width: 100%; }
.mount .mname { color: var(--sn-sub); overflow: hidden; text-overflow: ellipsis; }
/* Werte je Kanal: gleich breite Abschnitte wie die Phasenbalken oben */
.chrow { display: flex; align-self: stretch; font-variant-numeric: tabular-nums; }
.chrow .chv { flex: 1 1 0; min-width: 0; text-align: center; white-space: nowrap; overflow: hidden; font-size: 10px; letter-spacing: -0.2px; }
.mount.selected { border: 2px solid var(--sn-accent); }
.mount.blocked { opacity: .5; outline: 2px solid var(--error-color, #db4437); }
.mount-bar { position: absolute; height: 4px; padding: 0; border: 0; border-radius: 2px; background: var(--sn-accent); cursor: pointer; }
.mount-bar.selected { height: 6px; box-shadow: 0 0 0 2px color-mix(in srgb, var(--sn-accent) 35%, transparent); }
.module.selected { border: 2px solid var(--sn-accent); background: var(--sn-sel); box-shadow: 0 0 0 3px color-mix(in srgb, var(--sn-accent) 30%, transparent); }
.module.blocked { outline: 2px solid var(--error-color, #db4437); }
.module.type-rcd { background: color-mix(in srgb, var(--sn-raised) 85%, var(--sn-text) 15%); }
.switches { display: flex; gap: 3px; }
.sw { width: 12px; height: 12px; border-radius: 6px; border: 1px solid var(--sn-sub); background: transparent; padding: 0; }
.sw.on { background: var(--state-active-color, var(--sn-accent)); border-color: transparent; }
.unplaced { margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.legend { margin-top: 12px; display: flex; gap: 18px; font-size: 12px; color: var(--sn-sub); align-items: center; }
.legend i { display: inline-block; width: 16px; height: 4px; margin-right: 6px; vertical-align: middle; }

/* Seitenpanel */
.drawer { flex: none; width: 0; overflow: hidden; background: var(--sn-card); border-left: 1px solid var(--sn-div); position: relative; transition: width .15s; }
.drawer.open { width: 400px; overflow-y: auto; }
.drawer .close { position: absolute; right: 8px; top: 8px; }
.form { display: flex; flex-direction: column; gap: 14px; padding: 18px 20px 24px; }
.dhead { padding-right: 36px; }
.dtitle { font-size: 18px; font-weight: 500; }
.valuebox { display: flex; align-items: center; justify-content: space-between; }
.valuebox .big { font-size: 26px; font-weight: 700; font-variant-numeric: tabular-nums; }
.field { display: flex; flex-direction: column; gap: 5px; }
.field.check { flex-direction: row; align-items: center; gap: 10px; }
.flabel { font-size: 12px; color: var(--sn-sub); }
.hint { font-size: 12px; color: var(--sn-sub); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.segment { display: flex; border: 1px solid var(--sn-div); border-radius: 8px; overflow: hidden; }
.segment button { flex: 1; height: 36px; border: 0; background: transparent; color: var(--sn-sub); }
.segment button + button { border-left: 1px solid var(--sn-div); }
.segment button.active { background: var(--sn-sel); color: var(--sn-text); font-weight: 700; }
details { border-top: 1px solid var(--sn-div); padding-top: 10px; display: flex; flex-direction: column; gap: 12px; }
details[open] > :not(summary) { margin-top: 12px; }
summary { cursor: pointer; color: var(--sn-sub); font-size: 13px; }
.kids { display: flex; flex-direction: column; gap: 4px; border-top: 1px solid var(--sn-div); padding-top: 10px; }
.kid { display: flex; gap: 10px; align-items: center; text-align: left; background: none; border: 0; border-radius: 6px; padding: 6px; font-size: 13px; }
.kid:hover { background: var(--sn-hover); }
.kid .muted { min-width: 90px; font-size: 12px; }

/* Menü und Hinweise */
.menu { position: fixed; display: none; z-index: 20; min-width: 240px; max-height: calc(100vh - 16px); overflow-y: auto; padding: 6px 0; background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.4); }
.menu.open { display: block; }
.menu-title { padding: 6px 16px 8px; font-size: 12px; color: var(--sn-sub); border-bottom: 1px solid var(--sn-div); margin-bottom: 4px; max-width: 320px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu button { display: flex; align-items: center; gap: 12px; width: 100%; height: 38px; padding: 0 16px; border: 0; background: transparent; text-align: left; }
.menu button:hover:not(:disabled) { background: var(--sn-hover); }
.menu button:disabled { opacity: .4; cursor: default; }
.menu button .ico { color: var(--sn-sub); }
.menu .ico-space { width: 18px; }
.menu .sep { height: 1px; margin: 4px 0; background: var(--sn-div); }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 40px); opacity: 0; transition: .2s; background: var(--sn-text); color: var(--sn-bg); padding: 10px 16px; border-radius: 8px; pointer-events: none; z-index: 30; max-width: 80vw; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }

/* Bilanz und Daten */
.balance, .datapage { overflow: auto; padding: 16px 24px 32px; display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px; align-content: start; }
.card-box { background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 12px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; }
.card-box h3 { margin: 0 0 4px; font-size: 15px; font-weight: 500; }
.card-box p { margin: 0; }
.brow { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 72px; gap: 10px; align-items: center; background: none; border: 0; padding: 4px 2px; text-align: left; border-radius: 6px; }
.brow:hover { background: var(--sn-hover); }
.bname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { height: 6px; border-radius: 3px; background: var(--sn-raised); overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 3px; transition: width .4s; }
.bval { text-align: right; font-variant-numeric: tabular-nums; font-weight: 500; }
.problems { grid-column: 1 / -1; }
.err-line { color: var(--error-color, #db4437); }
.warn-line { color: var(--warning-color, #ffa600); }
.export { width: 100%; font-family: ui-monospace, monospace; font-size: 12px; }
.pot code { min-width: 120px; color: var(--sn-sub); }
.pot input { flex: 1; }

:host { overflow: hidden; }
header { min-width: 0; overflow: hidden; }
.search { flex: 0 1 280px; min-width: 120px; }
.search input { width: 100%; }
@media (max-width: 1100px) {
  .brand span { display: none; }
  .status .muted { display: none; }
}
@media (max-width: 900px) {
  .drawer.open { position: absolute; right: 0; top: 0; bottom: 0; width: min(400px, 100%); z-index: 10; }
  .tabs .tab { padding: 0 8px; }
  .brand span { display: none; }
}
/* Farbe: Phasen-Tönung, Nennstrom, Schalter */
.module.tinted { background: color-mix(in srgb, var(--sn-raised) 78%, var(--tint) 22%); border-color: color-mix(in srgb, var(--sn-div) 50%, var(--tint) 50%); }
.module.tinted .mlabel { color: color-mix(in srgb, var(--sn-text) 70%, var(--tint) 30%); }
.module.tinted.selected { background: color-mix(in srgb, var(--sn-sel) 70%, var(--tint) 30%); }
.module .mtop { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.rating { font-size: 10.5px; font-weight: 700; line-height: 1; padding: 3px 5px; border-radius: 4px; letter-spacing: .2px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.18); }
.rating.plain { background: transparent; color: var(--sn-text); box-shadow: inset 0 0 0 1px var(--sn-div); }
.card.tinted { background: color-mix(in srgb, var(--sn-card) 84%, var(--tint) 16%); border-color: color-mix(in srgb, var(--sn-div) 55%, var(--tint) 45%); }
.card.group-card.tinted { background: color-mix(in srgb, var(--sn-raised) 76%, var(--tint) 24%); }
.card.tinted.selected { background: color-mix(in srgb, var(--sn-sel) 75%, var(--tint) 25%); }
.tgl { position: relative; flex: none; width: 30px; height: 17px; padding: 0; border-radius: 9px; border: 1px solid var(--sn-div); background: var(--sn-raised); }
.tgl i { position: absolute; top: 2px; left: 2px; width: 11px; height: 11px; border-radius: 50%; background: var(--sn-sub); transition: left .15s, background .15s; }
.tgl.on { background: color-mix(in srgb, var(--state-active-color, var(--sn-accent)) 35%, transparent); border-color: var(--state-active-color, var(--sn-accent)); }
.tgl.on i { left: 15px; background: var(--state-active-color, var(--sn-accent)); }
.tgl.unavail { opacity: .4; }
.module .switches { flex-direction: column; gap: 4px; }
.module.wide .switches { flex-direction: row; }
.phases { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--sn-div); padding-top: 10px; }

/* Geräteauswahl */
.picker { position: fixed; inset: 0; z-index: 25; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.45); }
.picker.open { display: flex; }
.pk-dialog { width: min(820px, calc(100vw - 32px)); height: min(560px, calc(100vh - 64px)); display: flex; flex-direction: column; background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 14px; box-shadow: 0 20px 48px rgba(0,0,0,.5); overflow: hidden; }
.pk-head { display: flex; align-items: center; justify-content: space-between; padding: 10px 10px 10px 20px; border-bottom: 1px solid var(--sn-div); font-size: 15px; }
.pk-body { flex: 1; min-height: 0; display: flex; }
.pk-cats { flex: none; width: 200px; padding: 8px; border-right: 1px solid var(--sn-div); display: flex; flex-direction: column; gap: 2px; overflow-y: auto; }
.pk-cats button { text-align: left; border: 0; background: transparent; padding: 10px 12px; border-radius: 8px; color: var(--sn-sub); font-weight: 500; }
.pk-cats button:hover { background: var(--sn-hover); color: var(--sn-text); }
.pk-cats button.active { background: var(--sn-sel); color: var(--sn-text); }
.pk-list { flex: 1; min-width: 0; overflow-y: auto; padding: 4px 16px 16px; }
.pk-list h4 { margin: 14px 0 6px; font-size: 12px; font-weight: 500; color: var(--sn-sub); text-transform: uppercase; letter-spacing: .5px; }
.pk-item { display: flex; align-items: center; gap: 12px; width: 100%; text-align: left; border: 0; background: transparent; padding: 9px 10px; border-radius: 8px; }
.pk-item:hover { background: var(--sn-hover); }
.pk-item .muted { font-size: 13px; }
.pk-item .warn { font-size: 13px; color: var(--warning-color, #ffa600); }
.pk-sw { flex: none; width: 14px; height: 14px; border-radius: 3px; box-shadow: inset 0 0 0 1px rgba(0,0,0,.2); }
.pk-sw.none { background: transparent; box-shadow: inset 0 0 0 1px var(--sn-div); }
.pk-foot { padding: 10px 20px; border-top: 1px solid var(--sn-div); font-size: 12px; }
@media (max-width: 640px) { .pk-body { flex-direction: column; } .pk-cats { width: auto; flex-direction: row; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--sn-div); } }
/* Bestätigungsdialog */
.picker.ask { z-index: 30; }
.ask-dialog { width: min(440px, calc(100vw - 32px)); display: flex; flex-direction: column; gap: 16px; padding: 20px; background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 14px; box-shadow: 0 20px 48px rgba(0,0,0,.5); }
.ask-msg { white-space: pre-line; line-height: 1.45; font-size: 14px; max-height: 50vh; overflow-y: auto; }
.ask-btns { display: flex; justify-content: flex-end; gap: 8px; }
.btn.danger-fill { background: var(--error-color, #db4437); border-color: var(--error-color, #db4437); color: #fff; }
/* Beschriftungsdialog */
.lbl-dialog { height: min(620px, calc(100vh - 64px)); }
.lbl-list { padding-top: 8px; }
.lbl-cab { padding: 8px 0; border-bottom: 1px solid var(--sn-div); }
.lbl-head { display: flex; align-items: center; gap: 8px; font-size: 14px; }
.lbl-rows { display: flex; flex-wrap: wrap; gap: 4px 14px; padding: 6px 0 0 26px; }
.lbl-row { display: flex; align-items: center; gap: 6px; font-size: 13px; }
.lbl-opts { flex: none; width: 260px; padding: 12px 16px; border-left: 1px solid var(--sn-div); display: flex; flex-direction: column; gap: 10px; overflow-y: auto; }
.lbl-num { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.lbl-num span { color: var(--sn-sub); }
.lbl-opts .small { font-size: 12px; line-height: 1.4; margin: 4px 0 0; }
.lbl-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
@media (max-width: 640px) { .lbl-opts { width: auto; border-left: 0; border-top: 1px solid var(--sn-div); } }
/* Panel-Kopf: Zurück und Pfad */
.drawer .close { display: none; }
.dnav { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 4px; padding: 6px 6px 6px 10px; background: var(--sn-card); border-bottom: 1px solid var(--sn-div); }
.crumbs { flex: 1; min-width: 0; display: flex; align-items: center; gap: 2px; overflow-x: auto; white-space: nowrap; font-size: 13px; scrollbar-width: none; }
.crumb { border: 0; background: transparent; padding: 4px 6px; border-radius: 6px; color: var(--sn-accent); font-weight: 500; }
.crumb:hover { background: var(--sn-hover); }
.crumb.current { color: var(--sn-text); }
.crumbs .sep { color: var(--sn-sub); }
.dhead { padding-right: 0; }
/* Struktur-Baum */
.structure { gap: 0; }
.structure .flabel { margin-bottom: 4px; }
.srow { position: relative; display: flex; align-items: center; gap: 6px; min-height: 34px; padding-right: 2px; border-radius: 6px; }
.srow:hover { background: var(--sn-hover); }
.srow.flash { background: var(--sn-sel); animation: snflash 1.6s ease-out; }
@keyframes snflash { from { box-shadow: inset 0 0 0 2px var(--sn-accent); } to { box-shadow: inset 0 0 0 0 transparent; } }
.srow::before { content: ""; position: absolute; left: calc(var(--d, 0) * 18px); top: 0; bottom: 0; }
.slink { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-start; gap: 8px; border: 0; background: transparent; padding: 6px 4px; text-align: left; font-size: 13px; }
.slink .ico { color: var(--sn-sub); }
.saddr { color: var(--sn-sub); font-size: 12px; min-width: 34px; }
.sname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sval { font-size: 12px; font-variant-numeric: tabular-nums; color: var(--sn-sub); min-width: 44px; text-align: right; }
.icon-btn.small { width: 28px; height: 28px; color: var(--sn-sub); }
.icon-btn.small:hover { color: var(--sn-text); }
.structure .row.wrap { margin-top: 8px; }
/* Geräte-Panel: Kanäle im Fokus */
.grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.grid-cr { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 12px; align-items: start; }
.channels { display: flex; flex-direction: column; gap: 10px; border-top: 1px solid var(--sn-div); padding-top: 12px; }
.sec-title { font-size: 13px; font-weight: 600; color: var(--sn-text); }
.channel { display: flex; flex-direction: column; gap: 10px; padding: 12px; border: 1px solid var(--sn-div); border-radius: 10px; background: color-mix(in srgb, var(--sn-card) 92%, var(--sn-text) 8%); }
.ch-head { display: flex; align-items: center; gap: 8px; }
.ch-head b { font-size: 13px; }
.ch-head .muted { font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ch-val { font-weight: 600; font-variant-numeric: tabular-nums; font-size: 13px; }
.structure.bare { border-top: 0; padding-top: 0; }
.structure.bare .hint { font-size: 12px; }
details.sec { gap: 12px; }
details.sec > :not(summary) { margin-top: 12px; }
textarea.autosize { resize: none; overflow: hidden; min-height: 38px; line-height: 1.4; }
.srow.more { width: 100%; border: 0; background: transparent; color: var(--sn-accent); font-size: 12px; text-align: left; }
.segment.wheel { background: var(--sn-card); height: 32px; align-items: stretch; }
.segment.wheel .wl { display: flex; align-items: center; padding: 0 8px 0 10px; font-size: 12px; color: var(--sn-sub); border-right: 1px solid var(--sn-div); }
.segment.wheel button { height: auto; padding: 0 10px; font-size: 12px; flex: none; }
.board.editing .module { touch-action: none; }
.zoombox { display: inline-flex; align-items: center; gap: 2px; height: 32px; padding: 0 2px; border: 1px solid var(--sn-div); border-radius: 16px; background: var(--sn-card); }
.zoombox .zl { border: 0; background: transparent; font-size: 12px; min-width: 48px; color: var(--sn-sub); }
.zoombox .zl:hover { color: var(--sn-text); }
.cab-head .row { flex-wrap: wrap; }
.flow-controls { flex-wrap: wrap; right: 16px; pointer-events: none; }
.flow-controls > * { pointer-events: auto; }
.card.subcab { border-style: solid; border-width: 1px 1px 1px 1px; background: color-mix(in srgb, var(--sn-raised) 85%, var(--sn-accent) 15%); }
.card.loose-node { border-style: dashed; }
.card.loose-node .sub { color: var(--warning-color, #ffa600); }
.sankey-box { grid-column: 1 / -1; }
.sankey-host { width: 100%; min-height: 200px; }
.sankey { display: block; font-size: 12px; }
.sankey text { fill: var(--sn-text); paint-order: stroke; stroke: var(--sn-card); stroke-width: 3px; stroke-linejoin: round; }
.sankey text .v { fill: var(--sn-sub); font-variant-numeric: tabular-nums; }
.sankey text .n { font-weight: 500; }
.sankey .clickable { cursor: pointer; }
.sankey path { transition: fill-opacity .15s; }
.shelly-box { grid-column: 1 / -1; }
.shelly-box h4 { margin: 12px 0 4px; font-size: 12px; font-weight: 500; color: var(--sn-sub); text-transform: uppercase; letter-spacing: .5px; }
.shelly-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-top: 1px solid var(--sn-div); }
.shelly-row select { max-width: 220px; }
.shelly-hint { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 12px; color: var(--sn-sub); }
.area-tag { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 10px; font-size: 11px; background: var(--sn-raised); color: var(--sn-sub); vertical-align: 1px; }
.shelly-chans { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
.shelly-chans .ch { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 6px; font-size: 12px; background: var(--sn-raised); border: 1px solid var(--sn-div); }
.shelly-chans .ch.on { border-color: color-mix(in srgb, var(--state-active-color, var(--sn-accent)) 60%, transparent); }
.shelly-chans .cn { color: var(--sn-sub); max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shelly-chans .cv { font-variant-numeric: tabular-nums; font-weight: 600; }
.card.pick-target { outline: 3px solid var(--sn-accent); outline-offset: 3px; box-shadow: 0 0 0 6px color-mix(in srgb, var(--sn-accent) 25%, transparent); }
.banner .btn { height: 32px; }
.area-tag.first { margin: 0 8px 0 0; }
.shelly-head { align-items: center; }
.shelly-head h3 { margin: 0; }
.shelly-box.loading { opacity: .6; pointer-events: none; }
.chip.warn { border-color: var(--warning-color, #ffa600); color: var(--warning-color, #ffa600); }
.unassigned-box { grid-column: 1 / -1; }
.ua-list { display: flex; flex-direction: column; }
.ua-row { display: grid; grid-template-columns: minmax(0, 2fr) 150px minmax(0, 1fr) 220px; gap: 10px; align-items: center; padding: 4px 0; border-top: 1px solid var(--sn-div); }
.ua-row .slink { padding: 4px 2px; }
.ua-parent { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 760px) { .ua-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .ua-kind, .ua-parent { display: none; } }
/* Kopfzeile: Symbol-Knöpfe, Tab-Auswahl und Such-Knopf (Handy) */
.btn.ib { display: inline-flex; align-items: center; gap: 6px; }
.tab-select, .search-btn { display: none; }
.tab-select { height: 36px; padding: 0 10px; font-weight: 500; background: var(--sn-raised); border-radius: 18px; max-width: 160px; }
@media (max-width: 760px) {
  header { gap: 6px; padding: 0 8px 0 4px; position: relative; overflow: visible; }
  .brand { padding-left: 0; }
  .tabs { display: none; }
  .tab-select { display: block; }
  .search-btn { display: inline-flex; }
  .search { display: none; }
  header.searching .search { display: flex; position: absolute; left: 8px; right: 8px; top: calc(100% + 6px); z-index: 15; background: var(--sn-card); box-shadow: 0 8px 24px rgba(0,0,0,.35); height: 44px; }
  header.searching .search input { width: 100%; font-size: 16px; }
  .btn.ib { width: 40px; height: 40px; padding: 0; justify-content: center; border-radius: 50%; flex: none; }
  .btn.ib .bl { display: none; }
  .status .muted { display: none; }
}
.narrow-only { display: none; }
@media (max-width: 760px) {
  .flow-controls { flex-wrap: nowrap; left: 8px; right: 8px; bottom: 10px; gap: 4px; }
  .flow-controls .wide-only, .flow-controls .wheel-mode { display: none; }
  .flow-controls .group-mode .wl { display: none; }
  .flow-controls .narrow-only { display: inline-flex; background: var(--sn-card); border: 1px solid var(--sn-div); border-radius: 8px; }
  .flow-controls .icon-btn { width: 38px; height: 38px; }
}
.flow-controls { bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }
.cabinet-view, .balance, .datapage { padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px)); }
.shelly-acts { justify-content: flex-end; max-width: 380px; }
/* Bilanz: Raum mit Sonstiges-Anteil */
.bar.split { position: relative; background: var(--sn-raised); }
.bar.split .tot { position: absolute; left: 0; top: 0; bottom: 0; display: flex; border-radius: 3px; overflow: hidden; transition: width .4s; }
.bar.split .known { flex: 1 1 auto; background: var(--sn-accent); }
.bar.split .rest { flex: none; background: var(--error-color, #db4437); transition: width .4s; }
.bval .sv { display: block; font-size: 11px; font-weight: 400; color: var(--error-color, #db4437); }
.brow.tall { grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr) 96px; }
.legend-inline { display: flex; gap: 14px; font-size: 12px; color: var(--sn-sub); }
.legend-inline i { display: inline-block; width: 12px; height: 6px; border-radius: 2px; margin-right: 5px; vertical-align: middle; }
/* Daten: Unter-Tabs */
.subtabs { grid-column: 1 / -1; display: flex; gap: 8px; flex-wrap: wrap; }
.nodes-box { grid-column: 1 / -1; }
.nodes-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.nodes-tools input[type=search] { width: 220px; }
.area-btn { border: 1px dashed var(--sn-div); background: transparent; border-radius: 6px; padding: 4px 8px; font-size: 12px; text-align: left; color: var(--sn-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.area-btn.inh { color: var(--sn-sub); font-style: italic; }
.area-btn.none { color: var(--warning-color, #ffa600); border-color: color-mix(in srgb, var(--warning-color, #ffa600) 50%, transparent); }
.nodes-box h4 { margin: 14px 0 4px; font-size: 12px; font-weight: 500; color: var(--sn-sub); text-transform: uppercase; letter-spacing: .5px; }
.rooms-box { grid-column: span 2; }
.rooms-box .brow.tall { grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) 120px; }
@media (max-width: 900px) { .rooms-box { grid-column: 1 / -1; } }
`;