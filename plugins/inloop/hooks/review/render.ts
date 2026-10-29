// The review page as HTML. Plain module: a page model and labels in, one self-contained HTML
// file out. Everything taken from the log is escaped; the page carries a policy that stops it
// from loading anything, and it reads the same without JavaScript.

import type { Labels } from '../i18n/en.ts'
import { count, say } from '../i18n/index.ts'
import { bytes } from '../log.ts'
import { sameFile } from '../note.ts'
import { diffs, type Page, type Task, type NoteView, type EditView, type OutsideView, type Reading } from './model.ts'
import { CSS, SCRIPT } from './style.ts'

export const PAGE_BYTES = 3_800_000 // under the 4 MiB a mod may write in one file
const OPEN_LINES = 80 // diffs longer than this start folded

export type Meta = {
  code: string | null // the labels' language, for plural rules and dates
  log: string // where the log is, as shown in the footer
  back?: string // link to the list of sessions
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])

// A date and time in the reader's language, or ISO when the runtime has no Intl
export function when(ts: number | null, code: string | null): string {
  if (!ts) return ''
  try {
    return new Intl.DateTimeFormat(code ?? 'en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts))
  } catch {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
  }
}

// Escaped text with `code spans` set as code, as Claude writes them in notes
export const inline = (text: unknown) => esc(text).replace(/`([^`\n]+)`/g, '<code>$1</code>')
const paragraphs = (text: string) => text.split(/\n\s*\n/).map((p) => '<p>' + inline(p.trim()).replace(/\n/g, '<br>') + '</p>').join('')

function shell(title: string, code: string | null, body: string): string {
  return '<!doctype html>\n<html lang="' + esc(code ?? 'en') + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">\n' +
    '<meta name="generator" content="inloop">\n<title>' + esc(title) + '</title>\n<style>' + CSS + '</style>\n</head>\n<body>\n<div class="wrap">\n' +
    body + '\n</div>\n<script>' + SCRIPT + '</script>\n</body>\n</html>\n'
}

// ---- diffs ------------------------------------------------------------------------------------

// A unified diff as a table: old and new line numbers, the marker, the line.
export function diffTable(text: string): string {
  let o = 0
  let n = 0
  const rows: string[] = []
  for (const raw of text.split('\n')) {
    if (!raw) continue
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (h) {
      o = Number(h[1])
      n = Number(h[2])
      rows.push('<tr class="h"><td colspan="4">' + esc(raw) + '</td></tr>')
      continue
    }
    const mark = raw[0]
    const line = esc(raw.slice(1))
    if (mark === '+') rows.push('<tr class="a"><td class="o"></td><td class="n">' + n++ + '</td><td class="m">+</td><td class="c">' + line + '</td></tr>')
    else if (mark === '-') rows.push('<tr class="d"><td class="o">' + o++ + '</td><td class="n"></td><td class="m">-</td><td class="c">' + line + '</td></tr>')
    else if (mark === '\\') rows.push('<tr class="x"><td colspan="4">' + esc(raw) + '</td></tr>')
    else rows.push('<tr><td class="o">' + o++ + '</td><td class="n">' + n++ + '</td><td class="m"></td><td class="c">' + line + '</td></tr>')
  }
  return '<div class="diff"><table>' + rows.join('') + '</table></div>'
}

function change(x: EditView | OutsideView, l: Labels, code: string | null, id: string | null, badges: string[]): string {
  const lines = x.added + x.removed
  const open = lines <= OPEN_LINES ? ' open' : ''
  const tag = 'tool' in x ? x.tool : l[('page_state_' + x.state) as 'page_state_added']
  const delta = x.diff || x.added || x.removed ? '<span class="delta"><b class="plus">+' + x.added + '</b> <b class="minus">&minus;' + x.removed + '</b></span>' : ''
  let body = ''
  if (x.trimmed) body = '<p class="say">' + esc(l.page_trimmed) + '</p>'
  else if (x.skipped) body = '<p class="say">' + esc(l[('page_skipped_' + x.skipped.replace('-', '_')) as 'page_skipped_binary']) + '</p>'
  else if (x.diff) body = diffTable(x.diff)
  if (!x.trimmed && x.truncated) body += '<p class="say">' + esc(l.page_truncated) + '</p>'
  if (x.redactions) body += '<p class="say">' + esc(count(code, l.page_redacted, x.redactions)) + '</p>'
  return '<details class="edit"' + open + (id ? ' id="' + id + '"' : '') + '><summary><code class="path">' + esc(x.path) + '</code>' +
    '<span class="tool">' + esc(tag) + '</span>' + delta + badges.join('') + '</summary>' + body + '</details>'
}

// A table cell that carries its column's name: narrow screens show each row as a labelled block.
const cell = (label: string, html: string, cls = '') => '<td' + (cls ? ' class="' + cls + '"' : '') + ' data-label="' + esc(label) + '">' + html + '</td>'

const badge = (text: string, kind = '', hint = '') => '<span class="badge' + (kind ? ' ' + kind : '') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' + esc(text) + '</span>'

function editBadges(e: EditView, l: Labels): string[] {
  const out: string[] = []
  if (e.created) out.push(badge(l.page_new_file, 'ok'))
  if (e.agent) out.push(badge(say(l.page_subagent, { agent: e.agent })))
  if (e.note && !e.listed) out.push(badge(l.page_not_listed, 'warn', l.page_not_listed_hint))
  return out
}

// ---- notes ------------------------------------------------------------------------------------

const FIELD: Record<string, keyof Labels> = { title: 'page_field_title', files: 'page_field_files', what: 'page_what', why: 'page_why' }

function card(v: NoteView, l: Labels, code: string | null, anchors: Map<string, string>): string {
  const r = v.record
  const n = r.note
  const head: string[] = ['<span class="num">#' + r.n + '</span>', '<h4>' + esc(n.title) + '</h4>']
  if (n.basis === 'verified') head.push(badge(l.page_basis_verified, 'ok', l.page_basis_verified_hint))
  if (n.basis === 'judgment') head.push(badge(l.page_basis_judgment, '', l.page_basis_judgment_hint))
  if (r.agent) head.push(badge(say(l.page_subagent, { agent: r.agent })))
  if (r.source === 'reconstructed') head.push(badge(l.page_reconstructed))
  const out: string[] = ['<article class="note" id="note-' + r.n + '"><header>' + head.join('') + '</header>']
  if (n.files.length) out.push('<ul class="files">' + n.files.map((f) => '<li><code>' + esc(f) + '</code></li>').join('') + '</ul>')
  out.push('<dl class="explain"><dt>' + esc(l.page_what) + '</dt><dd>' + paragraphs(n.what) + '</dd><dt>' + esc(l.page_why) + '</dt><dd class="why">' + paragraphs(n.why) + '</dd></dl>')
  if (n.parameters.length) {
    out.push('<h3>' + esc(l.page_parameters) + '</h3><div class="tablewrap"><table class="params"><thead><tr><th>' + esc(l.page_param_name) + '</th><th>' + esc(l.page_param_meaning) +
      '</th><th>' + esc(l.page_param_default) + '</th><th>' + esc(l.page_param_why) + '</th></tr></thead><tbody>' +
      n.parameters.map((p) => '<tr>' +
        cell(l.page_param_name, '<code>' + esc(p.name) + '</code>' + (p.doc_url ? ' <a href="' + esc(p.doc_url) + '" rel="noreferrer noopener" target="_blank">' + esc(l.page_param_docs) + '</a>' : '')) +
        cell(l.page_param_meaning, inline(p.meaning)) + cell(l.page_param_default, p.default ? '<code>' + esc(p.default) + '</code>' : '') +
        cell(l.page_param_why, inline(p.why_this_value ?? '')) + '</tr>').join('') +
      '</tbody></table></div>')
  }
  if (n.symbols.length) {
    out.push('<h3>' + esc(l.page_symbols) + '</h3><div class="symbols">' + n.symbols.map((s) =>
      '<div class="symbol"><div class="head"><code class="name">' + esc(s.name) + '</code>' + badge(l[('page_kind_' + s.kind) as 'page_kind_class']) +
      (s.file ? '<span class="where">' + esc(s.file) + '</span>' : '') + '</div>' +
      '<p><b>' + esc(l.page_why_exists) + ':</b> ' + inline(s.why_exists) + '</p>' +
      (s.why_this_shape ? '<p><b>' + esc(l.page_why_shape) + ':</b> ' + inline(s.why_this_shape) + '</p>' : '') +
      (s.called_by ? '<p><b>' + esc(l.page_called_by) + ':</b> ' + inline(s.called_by) + '</p>' : '') + '</div>').join('') + '</div>')
  }
  if (n.alternatives.length) out.push('<h3>' + esc(l.page_alternatives) + '</h3><ul class="plain">' + n.alternatives.map((a) => '<li>' + inline(a) + '</li>').join('') + '</ul>')
  if (n.risks.length) out.push('<h3>' + esc(l.page_risks) + '</h3><ul class="plain risks">' + n.risks.map((a) => '<li>' + inline(a) + '</li>').join('') + '</ul>')
  const gaps = r.problems.map((p) => p.split(' ')[0]).filter((f) => FIELD[f]).map((f) => l[FIELD[f]] as string)
  if (gaps.length) out.push('<p class="missing">' + esc(say(l.page_missing, { fields: gaps.join(', ') })) + '</p>')
  if (v.edits.length) out.push('<div class="edits">' + v.edits.map((e) => change(e, l, code, take(anchors, e.path), editBadges(e, l))).join('') + '</div>')
  if (v.outside.length) out.push('<h3>' + esc(l.page_outside) + '</h3><div class="edits">' + v.outside.map((x) => change(x, l, code, take(anchors, x.path), [])).join('') + '</div>')
  return out.join('') + '</article>'
}

// The first block of each file gets the anchor the reading order links to.
function take(anchors: Map<string, string>, path: string): string | null {
  const id = anchors.get(path)
  if (!id || id.startsWith('!')) return null
  anchors.set(path, '!' + id)
  return id
}

// ---- tasks ------------------------------------------------------------------------------------

function reading(t: Task, l: Labels, anchors: Map<string, string>): string {
  const item = (x: Reading) => {
    const key = [...anchors.keys()].find((k) => k === x.file || sameFile(x.file, k) || sameFile(k, x.file))
    const id = key ? anchors.get(key)?.replace(/^!/, '') : undefined
    const name = '<code class="path">' + esc(x.file) + '</code>'
    return '<li>' + (id ? '<a href="#' + id + '">' + name + '</a>' : name) +
      (x.why ? '<span class="why">' + inline(x.why) + '</span>' : '<span class="role">' + esc(l[('page_role_' + x.role) as 'page_role_data']) + '</span>') + '</li>'
  }
  let out = '<ol class="read">' + t.reading.map(item).join('') + '</ol>'
  if (t.fixed) out += '<p class="hint">' + esc(l.page_fixed_order) + '</p>'
  if (t.unlisted.length) out += '<p class="hint">' + esc(l.page_also_changed) + ': ' + t.unlisted.map((f) => '<code class="path">' + esc(f) + '</code>').join(', ') + '</p>'
  return out
}

function section(t: Task, page: Page, l: Labels, code: string | null): string {
  // anchors for the files of this task, in the order their blocks appear
  const anchors = new Map<string, string>()
  const mark = (path: string) => { if (!anchors.has(path)) anchors.set(path, 't' + t.n + '-f' + anchors.size) }
  for (const item of t.items) if (item.kind === 'note') { item.note.edits.forEach((e) => mark(e.path)); item.note.outside.forEach((x) => mark(x.path)) }
  t.unexplained.forEach((e) => mark(e.path))

  const several = page.tasks.length > 1
  const out: string[] = ['<section class="task" id="task-' + t.n + '">']
  if (several) out.push('<p class="eyebrow">' + esc(say(l.page_task, { n: t.n })) + '</p>')
  if (t.recap) out.push('<h2>' + esc(l.page_summary) + '</h2><div class="summary">' + paragraphs(t.recap.overview) + '</div>')
  else if (several || t.items.length || t.unexplained.length) out.push('<h2>' + esc(l.page_no_summary) + '</h2>')
  for (const a of t.agentRecaps) out.push('<div class="agent-recap"><h3>' + esc(say(l.page_subagent_summary, { agent: a.agent })) + '</h3>' + paragraphs(a.recap.overview) + '</div>')

  const side: string[] = []
  if (t.reading.length) side.push('<div><h3>' + esc(l.page_start_here) + '</h3>' + reading(t, l, anchors) + '</div>')
  if (t.recap && t.recap.check_by_hand.length) {
    side.push('<div><h3>' + esc(l.page_check) + '</h3><ul class="check">' + t.recap.check_by_hand.map((c, i) =>
      '<li><input type="checkbox" id="c' + t.n + '-' + i + '"><label for="c' + t.n + '-' + i + '">' + inline(c) + '</label></li>').join('') + '</ul></div>')
  }
  if (side.length) out.push('<div class="cols">' + side.join('') + '</div>')
  if (t.recap && t.recap.groups.length) {
    out.push('<h3>' + esc(l.page_groups) + '</h3><dl class="groups">' + t.recap.groups.map((g) =>
      '<dt>' + esc(g.role) + '</dt><dd>' + g.files.map((f) => '<code class="path">' + esc(f) + '</code>').join(' ') + '</dd>').join('') + '</dl>')
  }

  if (t.items.some((i) => i.kind === 'note')) out.push('<h3>' + esc(l.page_changes) + '</h3>')
  for (const item of t.items) {
    if (item.kind === 'note') out.push(card(item.note, l, code, anchors))
    else out.push('<p class="switch">' + esc(say(item.on ? l.page_switch_on : l.page_switch_off, { time: when(item.ts, code) })) + '</p>')
  }
  if (t.unexplained.length) {
    out.push('<div class="unexplained"><h3>' + esc(l.page_unexplained) + '</h3><p class="hint">' + esc(l.page_unexplained_hint) + '</p><div class="edits">' +
      t.unexplained.map((e) => change(e, l, code, take(anchors, e.path), editBadges(e, l))).join('') + '</div></div>')
  }
  return out.join('\n') + '</section>'
}

// ---- the page ---------------------------------------------------------------------------------

export function render(page: Page, l: Labels, meta: Meta): string {
  const code = meta.code
  const c = page.counts
  const counts = [esc(say(l.page_counts, { notes: count(code, l.notes, c.notes), edits: count(code, l.edits, c.edits), files: count(code, l.files, c.files) }))]
  if (c.unexplained) counts.push('<span class="warn">' + esc(say(l.page_count_unexplained, { count: c.unexplained })) + '</span>')
  if (c.outside) counts.push('<span class="warn">' + esc(say(l.page_count_outside, { files: count(code, l.files, c.outside) })) + '</span>')

  const shown = page.tasks.filter((t) => !t.dropped)
  const dropped = page.tasks.length - shown.length
  const toc: string[] = []
  if (shown.length > 1) for (const t of shown) toc.push('<li><a href="#task-' + t.n + '">' + esc(say(l.page_task, { n: t.n })) + '</a></li>')
  const outsideShown = page.outside.length || page.outsideMore || !page.git
  if (outsideShown && toc.length) toc.push('<li><a href="#outside">' + esc(l.page_outside) + '</a></li>')
  if (page.symbols.length) toc.push('<li><a href="#index">' + esc(l.page_index) + '</a></li>')

  const head = [
    '<header class="masthead">',
    meta.back ? '<a class="back" href="' + esc(meta.back) + '">' + esc(l.page_sessions) + '</a>' : '',
    '<p class="kicker"><span class="logo">inloop</span>' + esc(l.page_kicker) + '</p>',
    '<h1>' + esc(page.project || page.root) + '</h1>',
    '<p class="meta">' + esc(say(l.page_meta, { time: when(page.started, code) })) + '</p>',
    '<p class="counts">' + counts.join(' &middot; ') + '</p>',
    toc.length ? '<ul class="toc">' + toc.join('') + '</ul>' : '',
    c.edits + c.outside ? '<div class="bar"><button type="button" data-act="collapse">' + esc(l.page_collapse) + '</button><button type="button" data-act="expand">' + esc(l.page_expand) + '</button></div>' : '',
    '</header>',
  ]

  const body: string[] = []
  if (!c.notes && !c.edits && !c.outside) body.push('<p class="hint">' + esc(l.page_empty) + '</p>')
  else {
    if (dropped) body.push('<p class="hint">' + esc(count(code, l.page_dropped, dropped)) + '</p>')
    for (const t of shown) body.push(section(t, page, l, code))
  }
  if (!page.git && (c.notes || c.edits)) {
    body.push('<section class="outside calm" id="outside"><h3>' + esc(l.page_outside) + '</h3><p class="hint">' + esc(l.page_outside_off) + '</p></section>')
  } else if (page.outside.length || page.outsideMore) {
    body.push('<section class="outside" id="outside"><h3>' + esc(l.page_outside) + '</h3><p class="hint">' + esc(l.page_outside_hint) + '</p><div class="edits">' +
      page.outside.map((x) => change(x, l, code, null, [])).join('') + '</div>' +
      (page.outsideMore ? '<p class="hint">' + esc(count(code, l.page_outside_more, page.outsideMore)) + '</p>' : '') + '</section>')
  }
  if (page.symbols.length) {
    body.push('<section id="index"><h2>' + esc(l.page_index) + '</h2><p class="hint">' + esc(l.page_index_hint) + '</p><div class="tablewrap"><table class="index"><thead><tr><th>' +
      esc(l.page_param_name) + '</th><th>' + esc(l.page_field_files) + '</th><th>' + esc(l.page_why_exists) + '</th><th></th></tr></thead><tbody>' +
      page.symbols.map((s) => '<tr>' + cell(l.page_param_name, '<code>' + esc(s.name) + '</code> ' + badge(l[('page_kind_' + s.kind) as 'page_kind_class']), 'nowrap') +
        cell(l.page_field_files, s.file ? '<code class="path">' + esc(s.file) + '</code>' : '') + cell(l.page_why_exists, inline(s.why_exists)) +
        '<td class="nowrap"><a href="#note-' + s.note + '">' + esc(say(l.page_in_note, { n: s.note })) + '</a></td></tr>').join('') + '</tbody></table></div></section>')
  }
  const foot = '<footer>' + esc(say(l.page_footer, { version: page.version || '', log: meta.log })) + '</footer>'
  return shell(say(l.page_title, { project: page.project || 'inloop' }), code, head.join('\n') + '\n<main>\n' + body.join('\n') + '\n</main>\n' + foot)
}

// The page within the size a mod may write: the largest diffs go first, then the oldest tasks.
export function fit(page: Page, l: Labels, meta: Meta, budget = PAGE_BYTES): { html: string; trimmed: number; dropped: number } {
  let html = render(page, l, meta)
  let size = bytes(html)
  let trimmed = 0
  let dropped = 0
  if (size > budget) {
    let over = size - budget
    for (const x of diffs(page).sort((a, b) => (b.diff?.length ?? 0) - (a.diff?.length ?? 0))) {
      if (over <= 0) break
      over -= bytes(diffTable(x.diff ?? ''))
      x.trimmed = true
      trimmed++
    }
    html = render(page, l, meta)
    size = bytes(html)
  }
  for (const t of page.tasks.slice(0, -1)) {
    if (size <= budget) break
    t.dropped = true
    dropped++
    html = render(page, l, meta)
    size = bytes(html)
  }
  return { html, trimmed, dropped }
}

// ---- the list of sessions ---------------------------------------------------------------------

export type SessionRow = { href: string; started: number | null; title: string; notes: number; edits: number; unexplained: number }

export function sessions(project: string, rows: SessionRow[], more: number, l: Labels, code: string | null, version: string): string {
  const body = [
    '<header class="masthead"><p class="kicker"><span class="logo">inloop</span>' + esc(l.page_kicker) + '</p><h1>' + esc(project) + '</h1>',
    '<p class="meta">' + esc(l.page_sessions) + '</p></header><main>',
    rows.length ? '<div class="tablewrap"><table class="index sessions"><tbody>' + rows.map((r) =>
      '<tr><td class="nowrap">' + esc(when(r.started, code)) + '</td><td><a href="' + esc(r.href) + '">' + esc(r.title || l.page_untitled) + '</a></td><td class="counts">' +
      esc(count(code, l.notes, r.notes) + ', ' + count(code, l.edits, r.edits)) + (r.unexplained ? ' &middot; <span class="warn">' + esc(say(l.page_count_unexplained, { count: r.unexplained })) + '</span>' : '') +
      '</td></tr>').join('') + '</tbody></table></div>' : '<p class="hint">' + esc(l.page_empty) + '</p>',
    more ? '<p class="hint">' + esc(count(code, l.page_sessions_more, more)) + '</p>' : '',
    '</main><footer>' + esc(say(l.page_footer_list, { version })) + '</footer>',
  ]
  return shell(say(l.page_sessions_title, { project }), code, body.join('\n'))
}
