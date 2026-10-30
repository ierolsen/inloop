// The review page's own style and script, inlined into every page: it loads nothing. Light is the
// base; dark follows the system unless the reader picks a theme, and a page written with a fixed
// theme keeps it.

import { PARTS } from '../parts.ts'

const LIGHT = `
  --bg: #f6f5f1; --panel: #ffffff; --ink: #1f1d1a; --muted: #67625a; --faint: #8f897f;
  --line: #e3dfd6; --accent: #2c6a5a; --accent-soft: #e2eee8; --on-accent: #ffffff;
  --why: #fff5d9; --why-line: #e3c25f; --shadow: rgba(31, 29, 26, .12); --scrim: rgba(31, 29, 26, .38);
  --outcome: #e8f1fb; --outcome-line: #7ea6d8;
  --add: #e9f6ec; --add-ink: #1b6630; --add-gutter: #d3ecd9; --del: #fcecea; --del-ink: #962a1d; --del-gutter: #f6d6d1;
  --warn: #fcf0e1; --warn-ink: #7f4508; --code: #fbfaf7; --code-line: #efece5;
  --k: #8a3fa0; --s: #1f6f3a; --n: #b0531b; --f: #1d5aa6; --c: #8f897f;
  color-scheme: light;`
const DARK = `
  --bg: #151412; --panel: #1d1c19; --ink: #ebe7df; --muted: #a8a297; --faint: #78736a;
  --line: #312f2a; --accent: #8ccab5; --accent-soft: #1d2e28; --on-accent: #10201b;
  --why: #2b2516; --why-line: #7d682b; --shadow: rgba(0, 0, 0, .5); --scrim: rgba(0, 0, 0, .6);
  --outcome: #172231; --outcome-line: #4f74a3;
  --add: #15291b; --add-ink: #9be0ae; --add-gutter: #1c3524; --del: #331a19; --del-ink: #f2a79d; --del-gutter: #43211f;
  --warn: #2d2215; --warn-ink: #efc287; --code: #191816; --code-line: #262420;
  --k: #d39be6; --s: #9bd5a8; --n: #f0ad7e; --f: #8fb8f0; --c: #8a847a;
  color-scheme: dark;`

// The parts the reader's tags leave out, hidden by the html element's data-hide: the page can leave
// parts out, never add what the notes do not hold. Each part is a class on explanations, their pins
// and the fields of a note.
const hiding = PARTS.map((p) => '[data-hide~="' + p + '"] .lv-' + p + ' { display: none; }').join('\n')
// when nothing beside the code is left, the code takes the whole width
const MARK_PARTS = ['lines', 'removed', 'symbols', 'uses', 'parameters']
const noGloss = MARK_PARTS.map((p) => '[data-hide~="' + p + '"]').join('')

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

export const CSS = `
:root {${LIGHT} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${DARK} } }
:root[data-theme="dark"] {${DARK} }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
code, .src, .mono, .sha, .delta, kbd { font-family: ${MONO}; }
a { color: var(--accent); text-underline-offset: 2px; }
p { margin: 0 0 10px; }
h1 { font-size: 28px; line-height: 1.2; margin: 0 0 6px; letter-spacing: -0.01em; overflow-wrap: anywhere; text-wrap: balance; }
h2 { font-size: 23px; line-height: 1.25; margin: 2px 0 10px; letter-spacing: -0.01em; text-wrap: balance; overflow-wrap: anywhere; }
h3 { font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 0 0 10px; }
.rich p { margin: 0 0 8px; } .rich p:last-child { margin-bottom: 0; }
.rich ul, .rich ol { margin: 4px 0 8px; padding-left: 20px; } .rich li { margin: 2px 0; }
.rich code, .gloss code, ul.check code, .hint code, .tldr code { background: var(--code-line); border-radius: 4px; padding: 0 4px; font-size: .9em; }
strong { font-weight: 650; }
[hidden] { display: none !important; }
.ico { width: 16px; height: 16px; flex: none; fill: currentColor; color: var(--faint); }
.ico.dir { color: var(--accent); }

/* the bar on top */
.appbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 10px 20px; background: var(--panel); border-bottom: 1px solid var(--line); }
.brand { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex-wrap: wrap; }
.logo { font-weight: 750; color: var(--accent); text-decoration: none; letter-spacing: .02em; }
.mode { font-size: 11.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 1px 8px; }
.proj { font-weight: 650; overflow-wrap: anywhere; min-width: 0; }
.tools { margin-left: auto; display: none; gap: 8px; align-items: center; flex-wrap: wrap; }
.js .tools { display: flex; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel); }
.seg button, .tools > button, .tools select { font: inherit; font-size: 13px; color: var(--ink); background: transparent; border: 0; padding: 5px 10px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
.tools > button, .tools select { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.tools > button:hover, .seg button:hover, .tools select:hover { outline: 1px solid var(--accent); outline-offset: -1px; }
.tags-btn { display: inline-flex; align-items: center; gap: 6px; font: inherit; font-size: 13px; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; cursor: pointer; }
.tags-btn:hover { outline: 1px solid var(--accent); outline-offset: -1px; }
.tags-btn .k { color: var(--muted); }
.tags-btn .v { font-weight: 600; }
.tags-btn .chev { width: 12px; height: 12px; color: var(--muted); }
/* the tag chooser: a dialog over the page, a sheet from the bottom on a phone */
.tags-modal { border: 1px solid var(--line); border-radius: 14px; padding: 0; width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); background: var(--panel); color: var(--ink); box-shadow: 0 24px 64px var(--shadow); }
.tags-modal::backdrop { background: var(--scrim, rgba(0, 0, 0, .4)); }
.tags-in { padding: 18px 20px 20px; }
.tags-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 0 6px; }
.tags-head h2 { font-size: 19px; margin: 0; }
.tags-head .x { font: inherit; font-size: 22px; line-height: 1; color: var(--muted); background: transparent; border: 0; cursor: pointer; padding: 4px 8px; border-radius: 8px; }
.tags-head .x:hover { background: var(--accent-soft); color: var(--ink); }
.tags-modal .hint { margin: 0 0 14px; font-size: 13.5px; }
ul.tags-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
ul.tags-list button { width: 100%; text-align: left; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; cursor: pointer; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; align-items: baseline; }
ul.tags-list button:hover { border-color: var(--accent); }
ul.tags-list button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
ul.tags-list button[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 3px 0 var(--accent); }
ul.tags-list .n { font-weight: 650; }
ul.tags-list .badge { justify-self: end; }
ul.tags-list .d { grid-column: 1 / -1; color: var(--muted); font-size: 13.5px; }
ul.tags-list .g { grid-column: 1 / -1; color: var(--muted); font-size: 12.5px; }
ul.tags-list .g code { font-family: ${MONO}; font-size: 12px; background: var(--code-line); border-radius: 4px; padding: 1px 5px; color: var(--ink); }
ul.tags-list .n { font-family: ${MONO}; font-size: 14px; }
ul.tags-list button[aria-pressed="true"] .n::before { content: "\\2713  "; color: var(--accent); }
.drawer-btn, .drawer-close { display: none; align-items: center; gap: 6px; font-size: 14px; font-weight: 600; cursor: pointer; color: var(--ink); border: 1px solid var(--line); border-radius: 8px; padding: 4px 10px; background: var(--panel); }
.drawer-toggle { position: absolute; opacity: 0; pointer-events: none; width: 1px; height: 1px; }
.scrim { display: none; }

/* the files beside the view */
.app { display: grid; grid-template-columns: 300px minmax(0, 1fr); align-items: start; }
.side { border-right: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; max-height: 100vh; overflow: auto; align-self: stretch; }
.side-in { padding: 14px 12px 28px; }
.views { min-width: 0; padding: 26px 32px 72px; overflow-wrap: break-word; }
/* a view starts at the top of the page, so going to one shows the bar above it too */
.view { display: none; }
.views > .view { scroll-margin-top: 400px; }
.view:target { display: block; }
.view:has(:target) { display: block; }
.js .view.current { display: block; }
[id] { scroll-margin-top: 16px; }
.scope { position: relative; margin: 0 0 10px; }
.scope > summary { list-style: none; cursor: pointer; display: flex; gap: 6px; align-items: center; border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; font-size: 14px; background: var(--bg); }
.scope > summary::-webkit-details-marker { display: none; }
.scope > summary::after { content: ""; margin-left: auto; border: 5px solid transparent; border-top-color: var(--muted); transform: translateY(3px); }
.scope > summary .k { color: var(--muted); }
.scope > summary .v { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
ul.menu { list-style: none; margin: 6px 0 0; padding: 4px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); box-shadow: 0 10px 28px var(--shadow); position: absolute; left: 0; right: 0; z-index: 5; max-height: 60vh; overflow: auto; }
ul.menu a { display: flex; gap: 8px; align-items: baseline; padding: 6px 8px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 14px; }
ul.menu a:hover { background: var(--accent-soft); }
ul.menu .t { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.findrow { position: relative; display: none; margin: 0 0 10px; }
.js .findrow { display: block; }
.find { width: 100%; font: inherit; font-size: 14px; padding: 6px 34px 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--ink); }
.find:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.findrow kbd { position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; background: var(--panel); }
.no-match { color: var(--muted); font-size: 13.5px; margin: 6px 4px; }
ul.tree, ul.tree ul { list-style: none; margin: 0; padding: 0; }
ul.tree ul { padding-left: 14px; }
ul.tree summary { list-style: none; cursor: pointer; display: flex; gap: 6px; align-items: center; padding: 3px 6px; border-radius: 6px; font-size: 14px; }
ul.tree summary::-webkit-details-marker { display: none; }
ul.tree summary .chev { width: 12px; height: 12px; flex: none; color: var(--muted); transition: transform .12s; }
ul.tree details[open] > summary .chev { transform: rotate(90deg); }
ul.tree summary a { color: var(--ink); text-decoration: none; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
ul.tree summary a:hover { text-decoration: underline; }
ul.tree li.leaf > a { display: flex; gap: 6px; align-items: center; padding: 3px 6px 3px 24px; border-radius: 6px; color: var(--ink); text-decoration: none; font-size: 14px; min-width: 0; }
ul.tree > li.leaf > a { padding-left: 6px; }
ul.tree li.leaf > a:hover, ul.tree summary:hover { background: var(--accent-soft); }
ul.tree li.leaf > a[aria-current] { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
ul.tree li.unx > a { color: var(--muted); }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.st { margin-left: auto; font-family: ${MONO}; font-size: 11px; font-weight: 700; flex: none; }
.st-added { color: var(--add-ink); } .st-modified { color: var(--warn-ink); } .st-deleted { color: var(--del-ink); } .st-renamed { color: var(--f); }
.nn { font-size: 11px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 6px; flex: none; font-variant-numeric: tabular-nums; }
.st + .nn { margin-left: 4px; }
a > .nm + .nn { margin-left: auto; }

/* where a view sits */
.crumbs { font-size: 16px; margin: 0 0 14px; color: var(--muted); overflow-wrap: anywhere; }
.crumbs a { color: var(--accent); text-decoration: none; font-weight: 600; }
.crumbs a:hover { text-decoration: underline; }
.crumbs b { color: var(--ink); font-weight: 650; }
.box { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); overflow: hidden; margin: 0 0 22px; }
.box-head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; padding: 10px 16px; background: var(--code); border-bottom: 1px solid var(--line); font-size: 14px; color: var(--muted); }
.box-head a { color: var(--ink); text-decoration: none; font-weight: 600; overflow-wrap: anywhere; }
.box-head a:hover { color: var(--accent); text-decoration: underline; }
.box-head .when { margin-left: auto; white-space: nowrap; }
.box-body { padding: 16px 20px; }
table.files { width: 100%; border-collapse: collapse; font-size: 14px; table-layout: fixed; }
table.files td { padding: 8px 16px; border-top: 1px solid var(--line); vertical-align: middle; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
table.files th { text-align: left; font-size: 12.5px; font-weight: 600; color: var(--muted); padding: 7px 16px; border-bottom: 1px solid var(--line); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
table.files th.name { width: 32%; }
table.files th.when { width: 150px; text-align: right; }
table.files tbody tr:first-child td { border-top: 0; }
table.files td.name > span { display: flex; gap: 8px; align-items: center; min-width: 0; }
table.files td.name a { display: inline-flex; gap: 8px; align-items: center; color: var(--ink); text-decoration: none; font-weight: 550; min-width: 0; }
table.files td.name a:hover .nm { text-decoration: underline; color: var(--accent); }
table.files td.last a { color: var(--muted); text-decoration: none; }
table.files td.last a:hover { color: var(--accent); text-decoration: underline; }
table.files td.when { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
table.files tr.up td { color: var(--muted); }

/* the overview */
.repo-head { margin: 0 0 18px; }
.kicker { margin: 0 0 4px; color: var(--muted); font-size: 14px; }
.meta { color: var(--muted); margin: 0; }
.ov { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 28px; align-items: start; }
.ov-side > section + section { margin-top: 24px; }
.overview { font-size: 17px; line-height: 1.6; max-width: 70ch; }
.overview .rich + .rich { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
ol.reading { margin: 0; padding-left: 22px; }
ol.reading li { margin: 0 0 8px; }
ol.reading li a { font-weight: 600; }
ol.history { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
ol.history li + li { border-top: 1px solid var(--line); }
ol.history a { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 10px; padding: 9px 12px; color: var(--ink); text-decoration: none; font-size: 14px; }
ol.history a:hover { background: var(--accent-soft); }
ol.history .t { font-weight: 600; overflow-wrap: anywhere; }
ol.history .sub { grid-column: 1 / -1; color: var(--muted); font-size: 12.5px; }
ol.history .pending .t { color: var(--warn-ink); }
ul.check { list-style: none; margin: 0; padding: 0; }
ul.check li { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 8px; font-size: 14.5px; }
ul.check input { margin-top: 5px; accent-color: var(--accent); flex: none; }
.hint { color: var(--muted); font-size: 14.5px; max-width: 76ch; }
.sha { font-size: 12.5px; color: var(--muted); }
.delta { font-size: 12.5px; white-space: nowrap; }
.plus { color: var(--add-ink); } .minus { color: var(--del-ink); }

/* a file */
.fhead { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; margin: 0 0 12px; }
nav.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); margin: 0 0 18px; overflow-x: auto; }
nav.tabs a { padding: 8px 14px; color: var(--muted); text-decoration: none; border-bottom: 2px solid transparent; margin-bottom: -1px; white-space: nowrap; font-weight: 550; }
nav.tabs a:hover { color: var(--ink); }
nav.tabs a[aria-current="page"] { color: var(--ink); border-bottom-color: var(--accent); }
nav.tabs .count { font-size: 12px; background: var(--code-line); border-radius: 999px; padding: 0 7px; margin-left: 6px; font-variant-numeric: tabular-nums; }
.change { margin: 0 0 30px; }
.change-head { margin: 0 0 10px; }
.change-head h3.title { text-transform: none; letter-spacing: 0; font-size: 17px; color: var(--ink); margin: 0 0 4px; }
.change-head h3.title a { color: var(--ink); text-decoration: none; }
.change-head h3.title a:hover { color: var(--accent); text-decoration: underline; }
.moved { margin-top: 26px; }
.moved .gloss { border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
.moved .mark + .mark { margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--line); }
.moved .from { font-size: 13px; margin-top: 6px; }
.blame { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: var(--panel); }
.bl { display: grid; grid-template-columns: minmax(0, 330px) minmax(0, 1fr); border-top: 1px solid var(--line); }
.bl:first-child { border-top: 0; }
.bl-meta { padding: 9px 14px; font-size: 13.5px; border-right: 1px solid var(--line); min-width: 0; box-shadow: inset 3px 0 var(--line); position: sticky; top: 0; align-self: start; }
.bl.mine .bl-meta { box-shadow: inset 3px 0 var(--accent); }
.bl.pending .bl-meta { box-shadow: inset 3px 0 var(--warn-ink); }
.bl-meta .t { display: block; color: var(--ink); text-decoration: none; font-weight: 600; overflow-wrap: anywhere; }
.bl-meta a.t:hover { color: var(--accent); text-decoration: underline; }
.bl-meta .tl { display: block; color: var(--ink); margin-top: 2px; }
.bl-meta .sub { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; color: var(--muted); font-size: 12.5px; margin-top: 4px; }
.bl-meta .jump { font-size: 12.5px; }
.bl.compact { grid-template-columns: minmax(0, 1fr); }
.bl.compact .bl-meta { border-right: 0; }

/* a commit */
.cnav { display: flex; justify-content: space-between; gap: 8px; margin: 0 0 16px; font-size: 14px; }
.eyebrow { color: var(--accent); font-weight: 650; font-size: 14px; margin: 0 0 4px; }
.eyebrow .sha { color: var(--accent); }
.subject { font-family: ${MONO}; font-size: 14px; color: var(--muted); margin: 0 0 14px; overflow-wrap: anywhere; }
.body { color: var(--muted); font-size: 14.5px; border-left: 3px solid var(--line); padding: 2px 0 2px 12px; margin: 0 0 18px; max-width: 80ch; }
.pending-head { background: var(--warn); border-radius: 12px; padding: 16px 20px; margin-bottom: 22px; }
.pending-head h2 { color: var(--warn-ink); margin-bottom: 4px; }
.pending-head p { margin: 0; color: var(--warn-ink); }
ul.changed { list-style: none; margin: 0 0 26px; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); font-size: 14px; }
ul.changed li { display: flex; gap: 10px; align-items: center; padding: 7px 14px; }
ul.changed li + li { border-top: 1px solid var(--line); }
ul.changed a { min-width: 0; overflow-wrap: anywhere; }
ul.changed .delta { margin-left: auto; }
ul.changed .st { margin-left: 0; width: 12px; }
.note { max-width: 900px; margin-bottom: 26px; }
.note h3.title { text-transform: none; letter-spacing: 0; font-size: 17px; color: var(--ink); margin: 0 0 6px; }
.note h3.title .num { color: var(--faint); font-weight: 600; margin-right: 6px; }
.tldr { font-size: 17px; line-height: 1.5; margin: 0 0 12px; }
.change .tldr { font-size: 15px; margin: 0 0 4px; color: var(--muted); }
.story { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 10px 16px; margin: 0; }
.story dt { color: var(--muted); font-size: 14px; padding-top: 3px; }
.story dd { margin: 0; min-width: 0; }
.story dd.why { background: var(--why); border-left: 3px solid var(--why-line); padding: 6px 12px; border-radius: 0 6px 6px 0; }
.story dd.risk { color: var(--warn-ink); }
.badge { font-size: 12px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; display: inline-block; vertical-align: 1px; }
.badge.new { border-color: transparent; background: var(--accent-soft); color: var(--accent); }
.badge.warn { border-color: transparent; background: var(--warn); color: var(--warn-ink); }
dl.terms { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 12px; margin: 0; font-size: 15px; }
dl.terms dt { font-weight: 650; font-family: ${MONO}; font-size: 13.5px; padding-top: 2px; color: var(--ink); overflow-wrap: anywhere; }
dl.terms dd { margin: 0; min-width: 0; }
.story dd.outcome { background: var(--outcome); border-left: 3px solid var(--outcome-line); padding: 6px 12px; border-radius: 0 6px 6px 0; }
.why-box, .outcome-box { font-size: 14.5px; border-radius: 0 6px 6px 0; padding: 6px 12px; margin: 0 0 8px; max-width: 900px; }
.why-box { background: var(--why); border-left: 3px solid var(--why-line); }
.outcome-box { background: var(--outcome); border-left: 3px solid var(--outcome-line); }
.why-box > b, .outcome-box > b { display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 2px; }
.outcome-box ul { margin: 0; padding-left: 18px; }
section.guide { margin: 0 0 22px; max-width: 900px; }
ol.steps { margin: 0; padding-left: 22px; }
ol.steps li { margin: 0 0 6px; }
ol.quiz { margin: 0; padding-left: 22px; }
ol.quiz li { margin: 0 0 12px; }
ol.quiz .q { margin: 0 0 4px; font-weight: 600; }
ol.quiz details summary { cursor: pointer; color: var(--accent); font-size: 14px; }
ol.quiz details .rich { margin-top: 6px; padding: 8px 12px; border-left: 3px solid var(--line); }
dl.glossary { grid-template-columns: minmax(0, 220px) minmax(0, 1fr); gap: 10px 18px; max-width: 980px; }
dl.glossary .where { margin: 4px 0 0; font-size: 13px; color: var(--muted); }
.missed { margin-top: 12px; font-size: 15px; }
.missed ul { margin: 6px 0 0; padding-left: 20px; }
.missed li .head { display: flex; gap: 8px; align-items: baseline; }
.missed li .kind { color: var(--muted); font-size: 13px; }
.missed li p, .missed li .lead { margin: 2px 0 0; }
.missed li + li { margin-top: 8px; }

/* code with its explanations beside it */
.file { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); margin: 0 0 22px; overflow: hidden; }
.file-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.file-head .path { font-weight: 650; font-size: 14.5px; overflow-wrap: anywhere; }
.file-head a.path { text-decoration: none; }
.file-head a.path:hover { text-decoration: underline; }
.file .say { padding: 12px 16px; color: var(--muted); margin: 0; }
.rows { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); }
.rows > .gloss, .rows > .src { border-top: 1px solid var(--line); }
.rows > .gloss:first-child, .rows > .gloss:first-child + .src { border-top: 0; }
.gloss { padding: 12px 16px 14px; border-right: 1px solid var(--line); font-size: 15px; line-height: 1.5; min-width: 0; }
.gloss .mark + .mark { margin-top: 14px; }
.gloss .head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.gloss .head b { overflow-wrap: anywhere; }
.gloss .kind { color: var(--muted); font-size: 13px; }
.kind.gone { color: var(--del-ink); }
code.gone { text-decoration: line-through; color: var(--del-ink); }
.gloss p { margin: 4px 0 0; }
.gloss .lead { margin: 0; }
.pin { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; }
.src { background: var(--code); overflow-x: auto; font-size: 13px; line-height: 1.65; padding: 8px 0; min-width: 0; }
.src table { border-collapse: collapse; width: max-content; min-width: 100%; }
.src td { padding: 0 10px; white-space: pre; vertical-align: top; }
/* the gutter columns keep one width in every row of a file, so code in one row lines up with the
   next: an indent is never a gutter wider than the one above */
.src td.o, .src td.n { width: calc(4ch + 20px); text-align: right; color: var(--faint); user-select: none; font-variant-numeric: tabular-nums; }
.src td.m { width: calc(1ch + 4px); padding: 0 2px; color: var(--faint); user-select: none; }
.src td.p { width: 50px; padding: 0 4px; user-select: none; white-space: nowrap; }
.src td.p .pin { width: 18px; height: 18px; font-size: 10.5px; margin-right: 2px; }
.src td.p .pin.wide { width: auto; min-width: 18px; padding: 0 5px; border-radius: 9px; letter-spacing: -0.02em; }
.src tr.a td { background: var(--add); }
.src tr.a td.o, .src tr.a td.n { background: var(--add-gutter); color: var(--add-ink); }
.src tr.a td.m { color: var(--add-ink); }
.src tr.d td { background: var(--del); }
.src tr.d td.o, .src tr.d td.n { background: var(--del-gutter); color: var(--del-ink); }
.src tr.d td.m { color: var(--del-ink); }
.src tr.gap td { color: var(--faint); text-align: center; padding: 2px; user-select: none; }
.src tr:target td { background: var(--why); }
.t-k { color: var(--k); } .t-s { color: var(--s); } .t-n { color: var(--n); } .t-f { color: var(--f); font-weight: 600; } .t-c { color: var(--c); font-style: italic; }
a.xref { color: inherit; text-decoration: underline dotted var(--accent); text-underline-offset: 3px; }
a.xref:hover { color: var(--accent); }
.mark:target .pin, .gloss:target { outline: 2px solid var(--accent); outline-offset: 2px; }

.tablewrap { overflow-x: auto; }
table.index { border-collapse: collapse; width: 100%; font-size: 15px; table-layout: fixed; }
table.index th:nth-child(1) { width: 30%; } table.index th:nth-child(2) { width: 22%; } table.index th:nth-child(4) { width: 10%; }
table.index td { overflow-wrap: anywhere; }
table.index th { text-align: left; color: var(--muted); font-weight: 600; font-size: 13px; border-bottom: 1px solid var(--line); padding: 6px 12px 6px 0; }
table.index td { border-bottom: 1px solid var(--line); padding: 8px 12px 8px 0; vertical-align: top; }
footer { color: var(--faint); font-size: 13px; border-top: 1px solid var(--line); margin-top: 48px; padding-top: 16px; }

/* the parts the reader's tags leave out; with no explanation beside a line left, the code takes the width */
${hiding}
${noGloss} .rows { grid-template-columns: minmax(0, 1fr); }
${noGloss} .rows > .gloss { display: none; }
${noGloss} .rows > .src { border-top: 0; }

@media (max-width: 1100px) {
  /* minmax(0, ...): a long line of code scrolls inside its block instead of widening the page */
  .ov { grid-template-columns: minmax(0, 1fr); }
  .rows { grid-template-columns: minmax(0, 1fr); }
  .gloss { border-right: 0; }
  .rows > .src { border-top: 0; }
  .gloss.empty { display: none; }
  .bl { grid-template-columns: minmax(0, 1fr); }
  .bl-meta { border-right: 0; border-bottom: 1px dashed var(--line); position: static; }
}
@media (max-width: 900px) {
  .app { display: block; }
  .side { display: none; position: fixed; top: 0; bottom: 0; left: 0; width: min(88vw, 340px); max-height: none; z-index: 30; box-shadow: 0 0 40px var(--shadow); }
  .drawer-toggle:checked ~ .app .side { display: block; }
  .drawer-toggle:checked ~ .scrim { display: block; position: fixed; inset: 0; z-index: 20; background: var(--shadow); cursor: pointer; }
  .drawer-btn, .drawer-close { display: inline-flex; }
  .drawer-close { margin: 0 0 12px; }
  .appbar { padding: 10px 16px; }
  .views { padding: 20px 16px 56px; }
  table.files .when { display: none; }
  table.files th.name { width: 55%; }
}
@media (max-width: 600px) {
  .mode, .tools > button:not(.tags-btn) { display: none; }
  .tags-btn .k { display: none; }
  .tags-modal { width: 100vw; max-width: 100vw; margin: auto 0 0; border-radius: 14px 14px 0 0; max-height: 85vh; }
  dl.glossary { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .drawer-btn { padding: 5px 8px; }
  .drawer-btn .t { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .seg button { padding: 5px 8px; }
  h1 { font-size: 24px; }
  h2 { font-size: 20px; }
  .story { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  dl.terms { grid-template-columns: minmax(0, 1fr); gap: 0; }
  dl.terms dd { margin-bottom: 8px; }
  .story dd { margin-bottom: 8px; }
  table.files td, table.files th { padding: 8px 12px; }
  table.index thead { display: none; }
  table.index, table.index tbody, table.index tr, table.index td { display: block; width: 100% !important; }
  table.index tr { border-bottom: 1px solid var(--line); padding: 8px 0; }
  table.index td { border: 0; padding: 2px 0; white-space: normal !important; }
}
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .appbar, .side, nav.tabs, .cnav, .drawer-toggle, .findrow, .tags-modal { display: none !important; }
  .app { display: block; }
  .views { padding: 0; }
  html.print-all .view[data-in-print] { display: block !important; break-before: page; }
  html.print-all .view:not([data-in-print]) { display: none !important; }
  .file, .note, .bl { break-inside: avoid-page; }
  .src { overflow: visible; }
  .src td.c { white-space: pre-wrap; overflow-wrap: anywhere; }
}
`

// The view the page opens on when the address names none: drawn by CSS, so it needs no script
export const startCss = (id: string) => `body:not(:has(:target)) #${id} { display: block; }\n`

// Search, keys, the tag and theme switches, printing, and the tree following the view. The page
// reads the same without it: every view opens through its #anchor.
export const SCRIPT = `
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var fixed = d.hasAttribute('data-fixed');
  var start = d.getAttribute('data-start') || 'overview';
  function all(s, root) { return Array.prototype.slice.call((root || document).querySelectorAll(s)); }
  function up(el, s) { return el && el.closest ? el.closest(s) : null; }
  var drawer = document.getElementById('drawer');

  function markTheme() {
    var now = d.getAttribute('data-theme') || 'auto';
    all('[data-theme-choice]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === now)); });
  }

  // the view that holds the address's target, else the one the page opens on
  function show() {
    var id = '';
    try { id = decodeURIComponent(location.hash.slice(1)); } catch (err) { id = location.hash.slice(1); }
    var target = id ? document.getElementById(id) : null;
    var view = up(target, '.view') || document.getElementById(start);
    all('.view.current').forEach(function (v) { if (v !== view) v.classList.remove('current'); });
    if (view) view.classList.add('current');
    all('ul.tree a[aria-current]').forEach(function (a) { a.removeAttribute('aria-current'); });
    var file = view && view.getAttribute('data-file');
    var link = file && document.querySelector('ul.tree a[href="#' + file + '"]');
    if (link) {
      link.setAttribute('aria-current', 'page');
      for (var p = link.parentElement; p; p = p.parentElement) if (p.tagName === 'DETAILS') p.open = true;
    }
    if (drawer) drawer.checked = false;
    all('details.scope[open]').forEach(function (x) { x.open = false; });
    if (view && (!target || target === view)) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', show);

  // the tag chooser: opens over the page; the parts no pressed tag names are hidden. "all" stands
  // alone, any other tag turns it off.
  var chooser = document.getElementById('tags');
  var opener = document.querySelector('[data-tags-open]');
  var partsOf = {};
  try { partsOf = JSON.parse(chooser.getAttribute('data-parts')); } catch (err) {}
  function pressed() { return all('[data-tag-choice][aria-pressed="true"]').map(function (b) { return b.getAttribute('data-tag-choice'); }); }
  function applyTags() {
    var on = pressed();
    var shown = {};
    on.forEach(function (t) { (partsOf[t] || []).forEach(function (p) { shown[p] = true; }); });
    var every = Object.keys(partsOf).reduce(function (a, t) { return a.concat(partsOf[t]); }, []);
    var hide = every.filter(function (p, i) { return every.indexOf(p) === i && !shown[p]; });
    d.setAttribute('data-hide', hide.join(' '));
    var name = document.querySelector('[data-tags-name]');
    if (name) name.textContent = on.join(', ') || 'summary';
  }
  if (chooser && opener && chooser.showModal) {
    opener.addEventListener('click', function () {
      chooser.showModal();
      var first = chooser.querySelector('[aria-pressed="true"]') || chooser.querySelector('[data-tag-choice]');
      if (first) first.focus();
    });
    chooser.addEventListener('click', function (e) {
      if (e.target === chooser || up(e.target, '[data-tags-close]')) { chooser.close(); return; }
      var pick = up(e.target, '[data-tag-choice]');
      if (!pick) return;
      var tag = pick.getAttribute('data-tag-choice');
      var now = pick.getAttribute('aria-pressed') !== 'true';
      if (tag === 'all' && now) all('[data-tag-choice]').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
      if (tag !== 'all' && now) { var a = chooser.querySelector('[data-tag-choice="all"]'); if (a) a.setAttribute('aria-pressed', 'false'); }
      pick.setAttribute('aria-pressed', String(now));
      applyTags();
    });
    chooser.addEventListener('close', function () { opener.focus(); });
  } else if (opener) opener.hidden = true;

  // "Go to file": the tree keeps the files whose path holds the letters typed, in order
  var find = document.querySelector('.find');
  var none = document.querySelector('.no-match');
  function fits(text, q) {
    if (text.indexOf(q) >= 0) return true;
    for (var i = 0, k = 0; k < text.length && i < q.length; k++) if (text.charAt(k) === q.charAt(i)) i++;
    return i === q.length;
  }
  function filter() {
    var q = find.value.trim().toLowerCase();
    var shown = 0;
    all('ul.tree li.leaf').forEach(function (li) {
      var ok = !q || fits((li.getAttribute('data-path') || '').toLowerCase(), q);
      li.hidden = !ok;
      if (ok) shown++;
    });
    all('ul.tree li.branch').reverse().forEach(function (li) {
      var any = li.querySelector('li.leaf:not([hidden])');
      li.hidden = !any;
      if (q && any) li.querySelector('details').open = true;
    });
    if (none) none.hidden = shown > 0;
  }
  if (find) {
    find.addEventListener('input', filter);
    find.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var a = document.querySelector('ul.tree li.leaf:not([hidden]) > a');
        if (a) { location.hash = a.getAttribute('href'); find.blur(); }
        e.preventDefault();
      } else if (e.key === 'Escape') {
        find.value = '';
        filter();
        find.blur();
      }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (e.key !== 't' || e.metaKey || e.ctrlKey || e.altKey || !find || (chooser && chooser.open)) return;
    var t = e.target;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    e.preventDefault();
    if (drawer) drawer.checked = true;
    find.focus();
    find.select();
  });

  document.addEventListener('click', function (e) {
    var choice = up(e.target, '[data-theme-choice]');
    if (choice) {
      var v = choice.getAttribute('data-theme-choice');
      if (v === 'auto') d.removeAttribute('data-theme'); else d.setAttribute('data-theme', v);
      if (!fixed) { try { if (v === 'auto') localStorage.removeItem('inloop.theme'); else localStorage.setItem('inloop.theme', v); } catch (err) {} }
      markTheme();
      return;
    }
    if (up(e.target, '[data-print]')) window.print();
    if (up(e.target, '[data-print-all]')) { d.classList.add('print-all'); window.print(); }
  });
  window.addEventListener('afterprint', function () { d.classList.remove('print-all'); });
  markTheme();
  show();
})();
`
