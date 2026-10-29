// The review page's own style and script, inlined into every page: the page loads nothing.
// Light and dark follow the reader's system setting.

export const CSS = `
:root {
  --bg: #f6f5f1; --panel: #ffffff; --ink: #1f1d1a; --muted: #67625a; --faint: #8f897f;
  --line: #e3dfd6; --accent: #2c6a5a; --accent-soft: #e2eee8;
  --why: #fff5d9; --why-line: #e3c25f;
  --add: #e6f4e9; --add-ink: #1b6630; --del: #fbeae7; --del-ink: #962a1d;
  --warn: #fcf0e1; --warn-ink: #7f4508; --code: #f1efe9;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #151412; --panel: #1d1c19; --ink: #ebe7df; --muted: #a8a297; --faint: #78736a;
    --line: #312f2a; --accent: #8ccab5; --accent-soft: #1d2e28;
    --why: #2b2516; --why-line: #7d682b;
    --add: #142a1a; --add-ink: #8fdaa2; --del: #341918; --del-ink: #f0a196;
    --warn: #2d2215; --warn-ink: #efc287; --code: #252320;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
.wrap { max-width: 1060px; margin: 0 auto; padding: 36px 20px 72px; }
code, .diff, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace; font-size: 13px; }
a { color: var(--accent); text-underline-offset: 2px; }
p { margin: 0 0 10px; }
h1 { font-size: 32px; line-height: 1.15; margin: 4px 0 10px; letter-spacing: -0.015em; text-wrap: balance; }
h2 { font-size: 23px; line-height: 1.25; margin: 0 0 6px; text-wrap: balance; }
h3 { font-size: 12.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin: 26px 0 10px; }
h4 { font-size: 18px; line-height: 1.3; margin: 0; text-wrap: balance; }

.masthead { border-bottom: 1px solid var(--line); padding-bottom: 22px; margin-bottom: 30px; }
.kicker { margin: 0; color: var(--muted); font-size: 14px; }
.logo { font-weight: 750; color: var(--accent); letter-spacing: .02em; margin-right: 8px; }
.meta { color: var(--muted); margin: 0 0 4px; }
.counts { margin: 0; font-variant-numeric: tabular-nums; }
.counts .warn { color: var(--warn-ink); }
.toc { display: flex; flex-wrap: wrap; gap: 6px 16px; margin: 16px 0 0; padding: 0; list-style: none; font-size: 14.5px; }
.bar { display: none; gap: 8px; margin-top: 16px; }
.js .bar { display: flex; }
.bar button { font: inherit; font-size: 13.5px; color: var(--ink); background: var(--panel); border: 1px solid var(--line); border-radius: 6px; padding: 4px 10px; cursor: pointer; }
.bar button:hover { border-color: var(--accent); }
.back { font-size: 14px; display: inline-block; margin-bottom: 14px; }

.task { margin: 0 0 48px; }
.task > .eyebrow { color: var(--accent); font-weight: 650; font-size: 14px; margin: 0 0 4px; }
.summary { font-size: 17.5px; line-height: 1.6; max-width: 68ch; }
.pending { color: var(--muted); font-style: italic; }
.cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 0 36px; }
.cols > * { min-width: 0; }
ol.read { margin: 0; padding-left: 22px; }
ol.read li { margin: 0 0 8px; padding-left: 2px; }
ol.read .why { color: var(--muted); display: block; font-size: 15px; }
.role { display: inline-block; font-size: 12px; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: 0 7px; margin-left: 6px; vertical-align: 1px; }
.hint { color: var(--muted); font-size: 14.5px; max-width: 72ch; }
ul.check { list-style: none; margin: 0; padding: 0; }
ul.check li { display: flex; gap: 10px; align-items: flex-start; margin: 0 0 8px; }
ul.check input { margin-top: 5px; accent-color: var(--accent); flex: none; }
dl.groups { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
dl.groups dt { color: var(--muted); }
dl.groups dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
.agent-recap { border-left: 3px solid var(--line); padding: 2px 0 2px 14px; margin: 12px 0; }

.note { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 20px 22px; margin: 0 0 18px; }
.note > header { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; margin-bottom: 10px; }
.num { color: var(--faint); font-variant-numeric: tabular-nums; font-weight: 600; }
.badge { font-size: 12px; border-radius: 999px; padding: 1px 8px; border: 1px solid var(--line); color: var(--muted); white-space: nowrap; }
.badge.ok { border-color: transparent; background: var(--accent-soft); color: var(--accent); }
.badge.warn { border-color: transparent; background: var(--warn); color: var(--warn-ink); }
ul.files { list-style: none; display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; padding: 0; }
ul.files code, code.path { background: var(--code); border-radius: 5px; padding: 1px 6px; overflow-wrap: anywhere; }
dl.explain { display: grid; grid-template-columns: 64px 1fr; gap: 8px 14px; margin: 0; }
dl.explain dt { color: var(--muted); font-size: 14px; padding-top: 2px; }
dl.explain dd { margin: 0; min-width: 0; max-width: 72ch; }
dl.explain dd.why { background: var(--why); border-left: 3px solid var(--why-line); padding: 6px 10px; border-radius: 0 6px 6px 0; }
.missing { color: var(--warn-ink); font-size: 14px; margin-top: 10px; }
.tablewrap { overflow-x: auto; }
table.params { border-collapse: collapse; width: 100%; font-size: 14.5px; }
table.params th { text-align: left; font-weight: 600; color: var(--muted); font-size: 13px; border-bottom: 1px solid var(--line); padding: 6px 10px 6px 0; }
table.params td { border-bottom: 1px solid var(--line); padding: 7px 10px 7px 0; vertical-align: top; }
table.params td:first-child { white-space: nowrap; }
.symbols { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.symbol { border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; min-width: 0; }
.symbol .head { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; margin-bottom: 4px; }
.symbol code.name { font-weight: 650; font-size: 14px; overflow-wrap: anywhere; }
.symbol .where { color: var(--muted); font-size: 13px; }
.symbol p { margin: 4px 0 0; font-size: 14.5px; }
.symbol p b { color: var(--muted); font-weight: 600; }
ul.plain { margin: 0; padding-left: 20px; }
ul.plain li { margin: 0 0 4px; }
ul.risks li::marker { color: var(--warn-ink); }

.edits { margin-top: 18px; display: grid; gap: 10px; }
details.edit { border: 1px solid var(--line); border-radius: 8px; background: var(--panel); min-width: 0; }
details.edit > summary { list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; padding: 8px 12px; }
details.edit > summary::-webkit-details-marker { display: none; }
details.edit > summary::before { content: "\\25B8"; color: var(--faint); font-size: 12px; }
details.edit[open] > summary::before { content: "\\25BE"; }
details.edit[open] > summary { border-bottom: 1px solid var(--line); }
.tool { color: var(--muted); font-size: 13px; }
.delta { font-size: 13px; font-variant-numeric: tabular-nums; }
.plus { color: var(--add-ink); }
.minus { color: var(--del-ink); }
.say { padding: 10px 12px; margin: 0; color: var(--muted); font-size: 14.5px; }
.diff { overflow-x: auto; }
.diff table { border-collapse: collapse; width: 100%; }
.diff td { padding: 0 8px; white-space: pre; vertical-align: top; line-height: 1.5; }
.diff td.o, .diff td.n { color: var(--faint); text-align: right; width: 1%; user-select: none; font-variant-numeric: tabular-nums; }
.diff td.m { width: 1%; user-select: none; color: var(--faint); }
.diff tr.a td { background: var(--add); }
.diff tr.a td.c, .diff tr.a td.m { color: var(--add-ink); }
.diff tr.d td { background: var(--del); }
.diff tr.d td.c, .diff tr.d td.m { color: var(--del-ink); }
.diff tr.h td { color: var(--muted); background: var(--code); padding-top: 3px; padding-bottom: 3px; }
.diff tr.x td { color: var(--faint); }
.switch { color: var(--muted); font-size: 14.5px; border-top: 1px dashed var(--line); border-bottom: 1px dashed var(--line); padding: 8px 0; margin: 0 0 18px; }
.unexplained, .outside { background: var(--warn); border-radius: 10px; padding: 16px 20px 18px; margin: 8px 0 18px; }
.unexplained > h3, .outside > h3 { color: var(--warn-ink); margin-top: 0; }
.outside.calm { background: transparent; border: 1px solid var(--line); }
.outside.calm > h3 { color: var(--muted); }

table.index { border-collapse: collapse; width: 100%; font-size: 14.5px; }
table.index th { text-align: left; color: var(--muted); font-weight: 600; font-size: 13px; border-bottom: 1px solid var(--line); padding: 6px 12px 6px 0; }
table.index td { border-bottom: 1px solid var(--line); padding: 8px 12px 8px 0; vertical-align: top; }
table.index td.nowrap { white-space: nowrap; }
table.sessions td.counts { white-space: nowrap; color: var(--muted); font-variant-numeric: tabular-nums; }
footer { color: var(--faint); font-size: 13.5px; border-top: 1px solid var(--line); margin-top: 48px; padding-top: 16px; }

@media (max-width: 600px) {
  .wrap { padding: 24px 16px 56px; }
  h1 { font-size: 26px; }
  .note { padding: 16px; }
  dl.explain { grid-template-columns: 1fr; gap: 2px; }
  dl.explain dd { margin-bottom: 8px; }
  table.params thead, table.index thead { display: none; }
  table.params, table.params tbody, table.params tr, table.params td,
  table.index, table.index tbody, table.index tr, table.index td { display: block; width: 100%; }
  table.params tr, table.index tr { border-bottom: 1px solid var(--line); padding: 8px 0; }
  table.params td, table.index td { border: 0; padding: 2px 0; white-space: normal !important; overflow-wrap: anywhere; }
  table.params td[data-label]:not(:first-child)::before, table.index td[data-label]:not(:first-child)::before { content: attr(data-label) ": "; color: var(--muted); font-weight: 600; }
  table.params td:empty, table.index td:empty { display: none; }
}
@media print {
  .bar { display: none !important; }
  details.edit { break-inside: avoid; }
}
`

// Folding every diff at once. Without JavaScript the page still reads; the buttons stay hidden.
export const SCRIPT = `
document.documentElement.classList.add('js');
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('button[data-act]');
  if (!b) return;
  var open = b.getAttribute('data-act') === 'expand';
  document.querySelectorAll('details.edit').forEach(function (d) { d.open = open; });
});
`
