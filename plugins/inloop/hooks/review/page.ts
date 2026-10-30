// The review as HTML: commits one by one, each with the notes that explain it and its files' code,
// every explanation numbered beside its line. One self-contained file. Plain module.

import type { Labels } from '../i18n/en.ts'
import { count, say } from '../i18n/index.ts'
import { bytes } from '../log.ts'
import { esc, span, rich, when, shell, type Theme } from './html.ts'
import { highlight, languageOf } from './highlight.ts'
import { CSS, SCRIPT } from './style.ts'
import { markKey, type Review, type Group, type FileView, type NoteRef } from './review.ts'
import type { Mark } from './anchor.ts'
import type { Line } from './patch.ts'

export const PAGE_BYTES = 3_800_000 // under the 4 MiB a mod may write in one file
export type Options = { code: string | null; theme: Theme; version: string }

const badge = (text: string, kind = '', hint = '') => '<span class="badge' + (kind ? ' ' + kind : '') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' + esc(text) + '</span>'
const delta = (a: number, r: number) => '<span class="delta"><span class="plus">+' + a + '</span> <span class="minus">&minus;' + r + '</span></span>'
const sum = (g: Group) => g.files.reduce((t, f) => [t[0] + f.data.patch.added, t[1] + f.data.patch.removed], [0, 0])
const short = (sha: string | null) => (sha ?? '').slice(0, 7)

function heading(g: Group, l: Labels): string {
  if (g.kind === 'pending') return l.r_pending
  if (g.kind === 'session') return l.r_session
  if (g.kind === 'explained') return l.r_explained
  return g.notes.length === 1 ? g.notes[0].record.note.title || g.subject || '' : g.subject || ''
}

// ---- one explanation, beside its line ---------------------------------------------------------

function markHtml(m: Mark, ref: NoteRef, pin: number | null, l: Labels): string {
  const n = ref.record.note
  const pinHtml = pin ? '<span class="pin">' + pin + '</span>' : ''
  const head = (name: string, kind: string) => '<div class="head">' + pinHtml + '<span><b>' + esc(name) + '</b> <span class="kind">' + esc(kind) + '</span></span></div>'
  const docs = (url: string | null) => (url ? ' <a href="' + esc(url) + '" rel="noreferrer noopener" target="_blank">' + esc(l.page_param_docs) + '</a>' : '')
  if (m.kind === 'symbol') {
    const s = n.symbols[m.item]
    return head(s.name, l[('page_kind_' + s.kind) as 'page_kind_class']) + '<div class="lead rich">' + rich(s.why_exists) + '</div>' +
      (s.why_this_shape ? '<p><b>' + esc(l.page_why_shape) + ':</b> ' + span(s.why_this_shape) + '</p>' : '') +
      (s.called_by ? '<p><b>' + esc(l.page_called_by) + ':</b> ' + span(s.called_by) + '</p>' : '')
  }
  if (m.kind === 'use') {
    const u = n.uses[m.item]
    return head(u.name, say(l.r_from, { from: u.from })) + '<div class="lead rich">' + rich(u.why) + '</div>' + (u.doc_url ? '<p>' + docs(u.doc_url) + '</p>' : '')
  }
  if (m.kind === 'param') {
    const p = n.parameters[m.item]
    return head(p.name, l.r_param) + '<div class="lead rich">' + rich(p.meaning) + '</div>' +
      (p.why_this_value ? '<p><b>' + esc(l.page_param_why) + ':</b> ' + span(p.why_this_value) + '</p>' : '') +
      (p.default ? '<p><b>' + esc(l.page_param_default) + ':</b> <code>' + esc(p.default) + '</code></p>' : '') + (p.doc_url ? '<p>' + docs(p.doc_url) + '</p>' : '')
  }
  const x = n.lines[m.item]
  return '<div class="head">' + pinHtml + '<div class="lead rich">' + rich(x.says) + '</div></div>'
}

// ---- a file -----------------------------------------------------------------------------------

function fileHtml(g: Group, f: FileView, refs: Map<string, NoteRef>, r: Review, l: Labels, code: string | null): string {
  const p = f.data.patch
  const tags: string[] = []
  for (const t of f.tags) {
    if (t === 'added') tags.push(badge(l.page_new_file, 'new'))
    else if (t === 'deleted') tags.push(badge(l.page_state_deleted, 'warn'))
    else if (t === 'renamed') tags.push(badge(say(l.r_tag_renamed, { from: p.oldPath ?? '' })))
    else if (t === 'unexplained') tags.push(badge(l.r_tag_unexplained, 'warn'))
    else if (t === 'outside') tags.push(badge(l.r_tag_outside))
    else if (t === 'sensitive') tags.push(badge(l.r_tag_sensitive, 'warn', l.page_skipped_sensitive))
    else if (t === 'binary') tags.push(badge(l.r_tag_binary))
    else if (t === 'cut') tags.push(badge(l.r_tag_cut))
    else if (t === 'redacted') tags.push(badge(count(code, l.page_redacted, f.data.redactions).replace(/\.$/, ''), 'warn'))
  }
  const head = '<div class="file-head"><code class="path">' + esc(p.path) + '</code>' + tags.join('') +
    (g.kind === 'explained' ? '' : delta(p.added, p.removed)) + badge(l[('page_role_' + f.role) as 'page_role_data']) + '</div>'
  if (f.data.hidden === 'sensitive') return '<div class="file" id="' + f.anchor + '">' + head + '<p class="say">' + esc(l.page_skipped_sensitive) + '</p></div>'
  if (f.data.hidden === 'binary') return '<div class="file" id="' + f.anchor + '">' + head + '<p class="say">' + esc(l.page_skipped_binary) + '</p></div>'
  if (f.tooBig) return '<div class="file" id="' + f.anchor + '">' + head + '<p class="say">' + esc(l.r_too_big) + '</p></div>'
  if (!f.lines.length) return '<div class="file" id="' + f.anchor + '">' + head + '</div>'

  const lang = languageOf(p.path)
  const twoNumbers = g.kind !== 'explained'
  // the marks on each row, and the names defined on each line (never linked to themselves)
  const markOf = new Map<string, { mark: Mark; ref: NoteRef }>()
  for (const ref of refs.values()) for (const k of ['symbol', 'use', 'param', 'line'] as const) {
    const list = k === 'symbol' ? ref.record.note.symbols : k === 'use' ? ref.record.note.uses : k === 'param' ? ref.record.note.parameters : ref.record.note.lines
    list.forEach((_, item) => markOf.set(markKey({ kind: k, note: ref.id, item }), { mark: { kind: k, note: ref.id, item }, ref }))
  }
  const link = (name: string) => r.links.get(name) ?? null
  const row = (line: Line | null, i: number) => {
    if (!line) return '<tr class="gap"><td colspan="' + (twoNumbers ? 5 : 4) + '">&#8943;</td></tr>'
    const pins = (f.pinAt.get(i) ?? []).map((n) => '<span class="pin">' + n + '</span>').join('')
    const cls = line.kind === '+' ? ' class="a"' : line.kind === '-' ? ' class="d"' : ''
    const nums = twoNumbers ? '<td class="o">' + (line.old ?? '') + '</td><td class="n">' + (line.new ?? '') + '</td>' : '<td class="n">' + (line.new ?? '') + '</td>'
    const here = new Set((f.pinAt.get(i) ?? []).map((n) => '#' + f.anchor + '-' + n))
    const linker = (name: string) => { const to = link(name); return to && !here.has(to.href) ? to : null }
    return '<tr' + cls + '>' + nums + '<td class="p">' + pins + '</td><td class="m">' + (line.kind === ' ' ? '' : line.kind) + '</td><td class="c">' + highlight(line.text, lang, linker) + '</td></tr>'
  }
  const rows = f.rows.map((seg) => {
    const marks = seg.marks.map((m) => {
      const key = markKey(m)
      const pin = f.pins.get(key) ?? null
      const ref = markOf.get(key)?.ref
      return ref ? '<div class="mark" id="' + f.anchor + '-' + pin + '">' + markHtml(m, ref, pin, l) + '</div>' : ''
    }).join('')
    const code = f.lines.slice(seg.from, seg.to + 1).map((line, k) => row(line, seg.from + k)).join('')
    return '<div class="gloss' + (marks ? '' : ' empty') + '">' + marks + '</div><div class="src"><table>' + code + '</table></div>'
  }).join('')
  return '<div class="file" id="' + f.anchor + '">' + head + '<div class="rows">' + rows + '</div></div>'
}

// ---- the notes of a group ---------------------------------------------------------------------

function notesHtml(g: Group, l: Labels): string {
  const several = g.notes.length > 1
  return g.notes.map((ref) => {
    const n = ref.record.note
    const out: string[] = ['<article class="note" id="note-' + esc(ref.id) + '">']
    if (several || g.kind !== 'commit') out.push('<h3 class="title"><span class="num">#' + ref.n + '</span>' + esc(n.title) + '</h3>')
    if (n.tldr) out.push('<p class="tldr">' + span(n.tldr) + '</p>')
    const basis = n.basis === 'verified' ? ' ' + badge(l.page_basis_verified, 'new', l.page_basis_verified_hint) : n.basis === 'judgment' ? ' ' + badge(l.page_basis_judgment, '', l.page_basis_judgment_hint) : ''
    const tags = (ref.record.source === 'reconstructed' ? ' ' + badge(l.page_reconstructed) : '') + (ref.record.agent ? ' ' + badge(say(l.page_subagent, { agent: ref.record.agent })) : '')
    out.push('<dl class="story">')
    if (n.what) out.push('<dt>' + esc(l.page_what) + '</dt><dd class="rich">' + rich(n.what) + '</dd>')
    if (n.why) out.push('<dt>' + esc(l.page_why) + '</dt><dd class="why rich">' + rich(n.why) + basis + tags + '</dd>')
    if (n.alternatives.length) out.push('<dt>' + esc(l.r_instead) + '</dt><dd class="rich"><ul>' + n.alternatives.map((a) => '<li>' + span(a) + '</li>').join('') + '</ul></dd>')
    if (n.risks.length) out.push('<dt>' + esc(l.page_risks) + '</dt><dd class="risk rich"><ul>' + n.risks.map((a) => '<li>' + span(a) + '</li>').join('') + '</ul></dd>')
    out.push('</dl>')
    const missed = g.missed.filter((m) => m.note === ref.id)
    if (missed.length) {
      out.push('<div class="missed"><h3>' + esc(l.r_missed) + '</h3><ul>' + missed.map((m) => '<li class="gloss-inline">' + markHtml(m, ref, null, l) + '</li>').join('') + '</ul></div>')
    }
    return out.join('') + '</article>'
  }).join('')
}

// ---- a group: a commit, what is not committed, or code explained -----------------------------

function groupHtml(g: Group, r: Review, l: Labels, code: string | null, total: number): string {
  const out: string[] = ['<section class="group" id="' + g.id + '">']
  if (g.kind === 'commit') {
    out.push('<p class="eyebrow">' + esc(say(l.r_commit_of, { n: g.index, total })) + ' &middot; <span class="sha">' + short(g.sha) + '</span>' + (g.time ? ' &middot; ' + esc(when(g.time, code)) : '') + '</p>')
    const title = heading(g, l)
    out.push('<h2>' + esc(title) + '</h2>')
    if (g.subject && g.subject !== title) out.push('<p class="subject">' + esc(g.subject) + '</p>')
    if (g.body && g.body.trim()) out.push('<div class="body rich">' + rich(g.body) + '</div>')
    if (!g.notes.length) out.push('<p class="hint">' + span(say(l.r_no_notes, { sha: short(g.sha) })) + '</p>')
  } else {
    const hint = g.kind === 'pending' ? l.r_pending_hint : g.kind === 'session' ? l.r_session_hint : l.r_explained_hint
    out.push('<div class="pending-head"><h2>' + esc(heading(g, l)) + '</h2><p>' + span(hint) + '</p></div>')
  }
  const refs = new Map(g.notes.map((x) => [x.id, x]))
  out.push(notesHtml(g, l))
  for (const f of g.files) out.push(fileHtml(g, f, refs, r, l, code))
  return out.join('\n') + '</section>'
}

// ---- the page ---------------------------------------------------------------------------------

export function render(r: Review, l: Labels, o: Options): string {
  const code = o.code
  const commits = r.groups.filter((g) => g.kind === 'commit')
  const scope = r.scope === 'session' ? l.r_scope_session : r.scope === 'all' ? l.r_scope_all : say(l.r_scope_range, { range: r.range ?? '' })
  const meta = [scope, r.started && r.scope === 'session' ? say(l.r_started, { time: when(r.started, code) }) : '', count(code, l.r_commits, r.counts.commits)]
  if (r.groups.some((g) => g.kind === 'pending')) meta.push(l.r_pending)
  const toc = r.groups.map((g) => {
    const [a, d] = sum(g)
    const label = g.kind === 'commit' ? '<span class="sha">' + short(g.sha) + '</span>' : '<span class="sha">&middot;&middot;&middot;</span>'
    return '<li' + (g.kind === 'commit' ? '' : ' class="pending"') + '><a href="#' + g.id + '">' + label + '<span>' + esc(heading(g, l)) + '</span>' + delta(a, d) + '</a></li>'
  })
  if (r.explained) toc.push('<li><a href="#explained"><span class="sha">&middot;&middot;&middot;</span><span>' + esc(l.r_explained) + '</span><span></span></a></li>')
  const bar = '<div class="bar"><span class="seg" role="group" aria-label="' + esc(l.r_theme) + '">' +
    (['auto', 'light', 'dark'] as const).map((t) => '<button type="button" data-theme-choice="' + t + '">' + esc(l[('r_theme_' + t) as 'r_theme_auto']) + '</button>').join('') +
    '</span><button type="button" data-print>' + esc(l.r_print) + '</button></div>'
  const top: string[] = []
  if (r.recaps.length) top.push('<div class="overview">' + r.recaps.map((x) => '<div class="rich">' + rich(x.overview) + '</div>').join('') + '</div>')
  if (r.checks.length) {
    top.push('<div class="check"><h3>' + esc(l.page_check) + '</h3><ul class="check">' + r.checks.map((c, i) =>
      '<li><input type="checkbox" id="k' + i + '"><label for="k' + i + '">' + span(c) + '</label></li>').join('') + '</ul></div>')
  }
  const head = [
    '<header class="masthead">',
    '<div class="topline"><p class="kicker"><span class="logo">inloop</span>' + esc(l.r_kicker) + '</p>' + bar + '</div>',
    '<h1>' + esc(r.project) + '</h1>',
    '<p class="meta">' + meta.filter(Boolean).map(esc).join(' &middot; ') + '</p>',
    '<div class="top"><div>' + top.join('') + '</div>' + (toc.length ? '<div><h3>' + esc(l.r_toc) + '</h3><ol class="toc">' + toc.join('') + '</ol></div>' : '') + '</div>',
    '</header>',
  ].join('\n')

  const body: string[] = []
  if (!r.groups.length && !r.explained) body.push('<p class="hint">' + span(l.r_empty) + '</p>')
  if (r.more) body.push('<p class="hint">' + esc(count(code, l.r_more, r.more)) + '</p>')
  for (const g of r.groups) body.push(groupHtml(g, r, l, code, commits.length))
  if (r.explained) body.push(groupHtml(r.explained, r, l, code, commits.length))
  if (r.index.length) {
    body.push('<section id="index"><h2>' + esc(l.page_index) + '</h2><p class="hint">' + esc(l.page_index_hint) + '</p><table class="index"><thead><tr><th>' +
      esc(l.page_param_name) + '</th><th>' + esc(l.page_field_files) + '</th><th>' + esc(l.page_why_exists) + '</th><th>' + esc(l.r_where) + '</th></tr></thead><tbody>' +
      r.index.map((x) => '<tr><td><code>' + esc(x.name) + '</code> ' + badge(l[('page_kind_' + x.kind) as 'page_kind_class']) + '</td><td>' + (x.file ? '<code>' + esc(x.file) + '</code>' : '') +
        '</td><td>' + span(x.why) + '</td><td>' + (x.href ? '<a href="' + esc(x.href) + '">' + esc(short(r.groups.find((g) => g.id === x.group)?.sha ?? null) || l.r_here) + '</a>' : '') + '</td></tr>').join('') +
      '</tbody></table></section>')
  }
  const foot = '<footer>' + esc(say(l.r_footer, { version: o.version })) + '</footer>'
  return shell(say(l.page_title, { project: r.project || 'inloop' }), code, o.theme, CSS, head + '\n<main>\n' + body.join('\n') + '\n</main>\n' + foot, SCRIPT)
}

// The page within the size a mod may write: the code of the longest files goes first, then the
// oldest commits.
export function fit(r: Review, l: Labels, o: Options, budget = PAGE_BYTES): { html: string; cut: number } {
  let html = render(r, l, o)
  let cut = 0
  if (bytes(html) <= budget) return { html, cut }
  const files = r.groups.flatMap((g) => g.files).concat(r.explained?.files ?? []).sort((a, b) => b.lines.length - a.lines.length)
  for (const f of files) {
    f.tooBig = true
    cut++
    if (cut % 5 === 0 || cut === files.length) {
      html = render(r, l, o)
      if (bytes(html) <= budget) return { html, cut }
    }
  }
  while (r.groups.length > 1 && bytes(html) > budget) {
    r.groups.shift()
    r.more += 1
    html = render(r, l, o)
  }
  return { html, cut }
}
