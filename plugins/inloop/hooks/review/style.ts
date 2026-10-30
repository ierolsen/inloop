// The review page's own style and script, inlined into every page: it loads nothing. Light is the
// base; dark follows the system unless the reader picks a theme, and a page written with a fixed
// theme keeps it.

const LIGHT = `
  --bg: #f6f5f1; --panel: #ffffff; --ink: #1f1d1a; --muted: #67625a; --faint: #8f897f;
  --line: #e3dfd6; --accent: #2c6a5a; --accent-soft: #e2eee8; --on-accent: #ffffff;
  --why: #fff5d9; --why-line: #e3c25f;
  --add: #e9f6ec; --add-ink: #1b6630; --add-gutter: #d3ecd9; --del: #fcecea; --del-ink: #962a1d; --del-gutter: #f6d6d1;
  --warn: #fcf0e1; --warn-ink: #7f4508; --code: #fbfaf7; --code-line: #efece5;
  --k: #8a3fa0; --s: #1f6f3a; --n: #b0531b; --f: #1d5aa6; --c: #8f897f;
  color-scheme: light;`
const DARK = `
  --bg: #151412; --panel: #1d1c19; --ink: #ebe7df; --muted: #a8a297; --faint: #78736a;
  --line: #312f2a; --accent: #8ccab5; --accent-soft: #1d2e28; --on-accent: #10201b;
  --why: #2b2516; --why-line: #7d682b;
  --add: #15291b; --add-ink: #9be0ae; --add-gutter: #1c3524; --del: #331a19; --del-ink: #f2a79d; --del-gutter: #43211f;
  --warn: #2d2215; --warn-ink: #efc287; --code: #191816; --code-line: #262420;
  --k: #d39be6; --s: #9bd5a8; --n: #f0ad7e; --f: #8fb8f0; --c: #8a847a;
  color-scheme: dark;`

export const CSS = `
:root {${LIGHT} }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {${DARK} } }
:root[data-theme="dark"] {${DARK} }
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.wrap { max-width: 1240px; margin: 0 auto; padding: 32px 24px 80px; }
code, .src, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; }
a { color: var(--accent); text-underline-offset: 2px; }
p { margin: 0 0 10px; }
h1 { font-size: 34px; line-height: 1.15; margin: 4px 0 10px; letter-spacing: -0.015em; overflow-wrap: anywhere; }
h2 { font-size: 26px; line-height: 1.25; margin: 2px 0 10px; letter-spacing: -0.01em; text-wrap: balance; }
h3 { font-size: 12.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 0 0 10px; }
.rich p { margin: 0 0 8px; } .rich p:last-child { margin-bottom: 0; }
.rich ul, .rich ol { margin: 4px 0 8px; padding-left: 20px; } .rich li { margin: 2px 0; }
.rich code, .gloss code, ul.check code, .hint code { background: var(--code-line); border-radius: 4px; padding: 0 4px; font-size: .9em; }
strong { font-weight: 650; }

/* the top */
.masthead { border-bottom: 1px solid var(--line); padding-bottom: 26px; margin-bottom: 36px; }
.topline { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 10px 16px; }
.kicker { margin: 0; color: var(--muted); font-size: 14px; }
.logo { font-weight: 750; color: var(--accent); letter-spacing: .02em; margin-right: 8px; }
.meta { color: var(--muted); margin: 0 0 18px; }
.bar { display: none; gap: 8px; align-items: center; flex-wrap: wrap; }
.js .bar { display: flex; }
.seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel); }
.seg button, .bar > button { font: inherit; font-size: 13px; color: var(--ink); background: transparent; border: 0; padding: 5px 10px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button[aria-pressed="true"] { background: var(--accent); color: var(--on-accent); }
.bar > button { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); }
.bar > button:hover, .seg button:hover { outline: 1px solid var(--accent); outline-offset: -1px; }
.top { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 32px; align-items: start; }
.overview { font-size: 18px; line-height: 1.6; max-width: 66ch; }
.overview .rich + .rich { margin-top: 10px; padding-top: 10px; border-top: 1px dashed var(--line); }
ol.toc { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
ol.toc li + li { border-top: 1px solid var(--line); }
ol.toc a { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 10px; align-items: baseline; padding: 10px 14px; color: var(--ink); text-decoration: none; }
ol.toc a:hover { background: var(--accent-soft); }
ol.toc .pending a { color: var(--warn-ink); }
.sha { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; color: var(--muted); }
.delta { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12.5px; white-space: nowrap; }
.plus { color: var(--add-ink); } .minus { color: var(--del-ink); }
.check { margin-top: 18px; }
ul.check { list-style: none; margin: 0; padding: 0; }
ul.check li { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 8px; font-size: 15px; }
ul.check input { margin-top: 5px; accent-color: var(--accent); flex: none; }
.hint { color: var(--muted); font-size: 14.5px; max-width: 72ch; }

/* a commit */
.group { margin: 0 0 64px; }
.eyebrow { color: var(--accent); font-weight: 650; font-size: 14px; margin: 0 0 4px; }
.eyebrow .sha { color: var(--accent); }
.subject { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 14px; color: var(--muted); margin: 0 0 14px; overflow-wrap: anywhere; }
.body { color: var(--muted); font-size: 14.5px; border-left: 3px solid var(--line); padding: 2px 0 2px 12px; margin: 0 0 18px; max-width: 80ch; }
.pending-head { background: var(--warn); border-radius: 12px; padding: 16px 20px; margin-bottom: 22px; }
.pending-head h2 { color: var(--warn-ink); margin-bottom: 4px; }
.pending-head p { margin: 0; color: var(--warn-ink); }
.note { max-width: 900px; margin-bottom: 26px; }
.note h3.title { text-transform: none; letter-spacing: 0; font-size: 17px; color: var(--ink); margin: 0 0 6px; }
.note h3.title .num { color: var(--faint); font-weight: 600; margin-right: 6px; }
.tldr { font-size: 18px; line-height: 1.5; margin: 0 0 12px; }
.story { display: grid; grid-template-columns: 70px minmax(0, 1fr); gap: 10px 16px; }
.story dt { color: var(--muted); font-size: 14px; padding-top: 3px; }
.story dd { margin: 0; min-width: 0; }
.story dd.why { background: var(--why); border-left: 3px solid var(--why-line); padding: 6px 12px; border-radius: 0 6px 6px 0; }
.story dd.risk { color: var(--warn-ink); }
.badge { font-size: 12px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; display: inline-block; vertical-align: 1px; }
.badge.new { border-color: transparent; background: var(--accent-soft); color: var(--accent); }
.badge.warn { border-color: transparent; background: var(--warn); color: var(--warn-ink); }
.missed { margin-top: 12px; font-size: 15px; }
.missed ul { margin: 6px 0 0; padding-left: 20px; }
.missed li .head { display: flex; gap: 8px; align-items: baseline; }
.missed li .kind { color: var(--muted); font-size: 13px; }
.missed li p, .missed li .lead { margin: 2px 0 0; }
.missed li + li { margin-top: 8px; }

/* a file: the explanations beside the code */
.file { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); margin: 0 0 22px; overflow: hidden; }
.file-head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
.file-head code.path { font-weight: 650; font-size: 14.5px; overflow-wrap: anywhere; }
.file .say { padding: 12px 16px; color: var(--muted); margin: 0; }
.rows { display: grid; grid-template-columns: minmax(0, 380px) minmax(0, 1fr); }
.rows > .gloss, .rows > .src { border-top: 1px solid var(--line); }
.rows > .gloss:first-child, .rows > .gloss:first-child + .src { border-top: 0; }
.gloss { padding: 12px 16px 14px; border-right: 1px solid var(--line); font-size: 15px; line-height: 1.5; min-width: 0; }
.gloss .mark + .mark { margin-top: 14px; }
.gloss .head { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.gloss .head b { overflow-wrap: anywhere; }
.gloss .kind { color: var(--muted); font-size: 13px; }
.gloss p { margin: 4px 0 0; }
.gloss .lead { margin: 0; }
.pin { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: var(--accent); color: var(--on-accent); font-size: 12px; font-weight: 700; font-family: system-ui, sans-serif; }
.src { background: var(--code); overflow-x: auto; font-size: 13px; line-height: 1.65; padding: 8px 0; min-width: 0; }
.src table { border-collapse: collapse; width: 100%; }
.src td { padding: 0 10px; white-space: pre; vertical-align: top; }
.src td.o, .src td.n { width: 1%; text-align: right; color: var(--faint); user-select: none; font-variant-numeric: tabular-nums; }
.src td.m { width: 1%; padding: 0 2px; color: var(--faint); user-select: none; }
.src td.p { width: 1%; padding: 0 4px; user-select: none; }
.src td.p .pin { width: 18px; height: 18px; font-size: 10.5px; margin-right: 2px; }
.src tr.a td { background: var(--add); }
.src tr.a td.o, .src tr.a td.n { background: var(--add-gutter); color: var(--add-ink); }
.src tr.a td.m { color: var(--add-ink); }
.src tr.d td { background: var(--del); }
.src tr.d td.o, .src tr.d td.n { background: var(--del-gutter); color: var(--del-ink); }
.src tr.d td.m { color: var(--del-ink); }
.src tr.gap td { color: var(--faint); text-align: center; padding: 2px; user-select: none; }
.t-k { color: var(--k); } .t-s { color: var(--s); } .t-n { color: var(--n); } .t-f { color: var(--f); font-weight: 600; } .t-c { color: var(--c); font-style: italic; }
a.xref { color: inherit; text-decoration: underline dotted var(--accent); text-underline-offset: 3px; }
a.xref:hover { color: var(--accent); }
:target .pin, .gloss:target { outline: 2px solid var(--accent); outline-offset: 2px; }

.tablewrap { overflow-x: auto; }
table.index { border-collapse: collapse; width: 100%; font-size: 15px; table-layout: fixed; }
table.index th:nth-child(1) { width: 30%; } table.index th:nth-child(2) { width: 20%; } table.index th:nth-child(4) { width: 9%; }
table.index td { overflow-wrap: anywhere; }
table.index th { text-align: left; color: var(--muted); font-weight: 600; font-size: 13px; border-bottom: 1px solid var(--line); padding: 6px 12px 6px 0; }
table.index td { border-bottom: 1px solid var(--line); padding: 8px 12px 8px 0; vertical-align: top; }
footer { color: var(--faint); font-size: 13.5px; border-top: 1px solid var(--line); margin-top: 48px; padding-top: 16px; }

@media (max-width: 900px) {
  .top { grid-template-columns: 1fr; }
  .rows { grid-template-columns: 1fr; }
  .gloss { border-right: 0; }
  .rows > .src { border-top: 0; }
  .gloss.empty { display: none; }
}
@media (max-width: 600px) {
  .wrap { padding: 24px 16px 56px; }
  h1 { font-size: 27px; }
  h2 { font-size: 22px; }
  .story { grid-template-columns: 1fr; gap: 2px; }
  .story dd { margin-bottom: 8px; }
  table.index thead { display: none; }
  table.index, table.index tbody, table.index tr, table.index td { display: block; width: 100% !important; }
  table.index tr { border-bottom: 1px solid var(--line); padding: 8px 0; }
  table.index td { border: 0; padding: 2px 0; white-space: normal !important; }
}
@media print {
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bar { display: none !important; }
  .wrap { max-width: none; padding: 0; }
  .group + .group { break-before: page; }
  .file, .note { break-inside: avoid-page; }
  .src { overflow: visible; }
  .src td.c { white-space: pre-wrap; overflow-wrap: anywhere; }
}
`

// The theme switch and the print button. The page reads the same without them.
export const SCRIPT = `
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var fixed = d.hasAttribute('data-fixed');
  function mark() {
    var now = d.getAttribute('data-theme') || 'auto';
    document.querySelectorAll('[data-theme-choice]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === now)); });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-theme-choice]');
    if (t) {
      var v = t.getAttribute('data-theme-choice');
      if (v === 'auto') d.removeAttribute('data-theme'); else d.setAttribute('data-theme', v);
      if (!fixed) { try { if (v === 'auto') localStorage.removeItem('inloop.theme'); else localStorage.setItem('inloop.theme', v); } catch (err) {} }
      mark();
      return;
    }
    if (e.target.closest && e.target.closest('[data-print]')) window.print();
  });
  mark();
})();
`
