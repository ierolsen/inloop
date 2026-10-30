// The review as a file explorer, in one self-contained HTML file. The files the review covers sit
// in a tree beside one view at a time: the overview, a folder, a file's code with its explanations,
// the file's changes commit by commit, why each block of its lines is there, or one commit with its
// notes. Every view is drawn in advance and shown by the address's #anchor, so the page works
// without its script; the script adds search, keys, and the level and theme switches. Plain module.

import type { Labels } from '../i18n/en.ts'
import { count, say } from '../i18n/index.ts'
import { bytes } from '../log.ts'
import { LEVELS, type Level } from '../config.ts'
import { sameFile } from '../note.ts'
import { esc, span, rich, when, shell, type Theme } from './html.ts'
import { highlight, languageOf } from './highlight.ts'
import { CSS, SCRIPT, startCss } from './style.ts'
import { roleOf } from './roles.ts'
import { markKey, linkName, type Review, type Group, type FileView, type NoteRef } from './review.ts'
import type { Mark, MarkKind, Segment } from './anchor.ts'
import type { Line } from './patch.ts'
import { folders, fileId, dirId, covers, UNCOMMITTED, type Explorer, type FilePage, type Node, type Status } from './explorer.ts'

export const PAGE_BYTES = 3_800_000 // under the 4 MiB a mod may write in one file
export type Mode = 'review' | 'explain'
// level: the level the page opens at; written: whether the logs say the notes were written at it;
// command and made: the command that wrote the page and when, for its footer
export type Options = { code: string | null; theme: Theme; version: string; level: Level; written: boolean; mode: Mode; start: string | null; command: string; made: number }
// What fit() has left out so far: the diffs under each file's Changes tab, then the code beside
// the why view's commits. Both stay on the page elsewhere.
export type Trim = { changes: boolean; why: boolean }

type Ctx = {
  r: Review
  x: Explorer
  l: Labels
  o: Options
  code: string | null
  trim: Trim
  shown: Map<string, Group> // the groups on the page, by id
  nodes: Map<string, Node> // the tree's files, by path
  markOf: Map<string, { mark: Mark; ref: NoteRef }> // every explanation of every note on the page
  hrefOf: (key: string) => string | null // where an explanation sits: the code view first, else its commit
  link: (name: string) => { href: string; title: string } | null // a defined name to its definition
}

const ICON_DIR = '<svg class="ico dir" viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 3.5a1 1 0 0 1 1-1h3.6l1.6 1.8h5.8a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z"/></svg>'
const ICON_FILE = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.6h5.1l3.4 3.4v9.4H4zM9 1.6V5h3.5" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
const ICON_MENU = '<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4h12M2 8h12M2 12h12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
const CHEV = '<svg class="chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const LETTER: Record<Status, string> = { added: 'A', modified: 'M', deleted: 'D', renamed: 'R' }

const badge = (text: string, kind = '', hint = '') => '<span class="badge' + (kind ? ' ' + kind : '') + '"' + (hint ? ' title="' + esc(hint) + '"' : '') + '>' + esc(text) + '</span>'
const delta = (a: number, r: number) => '<span class="delta"><span class="plus">+' + a + '</span> <span class="minus">&minus;' + r + '</span></span>'
const sum = (g: Group) => g.files.reduce((t, f) => [t[0] + f.data.patch.added, t[1] + f.data.patch.removed], [0, 0])
const short = (sha: string | null) => (sha ?? '').slice(0, 7)
const hint = (text: string) => '<p class="hint">' + span(text) + '</p>'
const levelName = (l: Labels, v: Level) => l[('level_' + v.replace('-', '_')) as 'level_full']
const lv = (kind: MarkKind) => 'lv-' + (kind === 'symbol' ? 'symbol' : kind === 'use' ? 'use' : kind === 'param' ? 'param' : 'line')
const kindOfKey = (key: string) => key.split(':').slice(-2)[0] as MarkKind
const statusMark = (s: Status | null, l: Labels) => (s ? '<span class="st st-' + s + '" title="' + esc(l[('x_status_' + s) as 'x_status_added']) + '">' + LETTER[s] + '</span>' : '')
const notesPill = (n: number, c: Ctx) => '<span class="nn" title="' + esc(count(c.code, c.l.notes, n)) + '">' + n + '</span>'

function heading(g: Group, l: Labels): string {
  if (g.kind === 'pending') return l.r_pending
  if (g.kind === 'session') return l.r_session
  if (g.kind === 'explained') return l.r_explained
  return g.notes.length === 1 ? g.notes[0].record.note.title || g.subject || '' : g.subject || ''
}

// Newest first, as a history reads: what is not committed, the commits, then code explained
const newestFirst = (groups: Group[]) => [...groups.filter((g) => g.kind !== 'explained').reverse(), ...groups.filter((g) => g.kind === 'explained')]

function scopeName(c: Ctx): string {
  const { r, l } = c
  if (r.pr) return say(l.r_scope_pr, { number: r.pr.number, title: r.pr.title })
  return r.scope === 'session' ? l.r_scope_session : r.scope === 'all' ? l.r_scope_all : say(l.r_scope_range, { range: r.range ?? '' })
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
  if (m.kind === 'removed') {
    // beside its line the deleted code is in view; elsewhere (in the list of what found no line) it is quoted
    const x = n.removed[m.item]
    return '<div class="head">' + pinHtml + '<span class="kind gone">' + esc(l.r_removed) + '</span></div>' +
      (pin ? '' : '<p><code class="gone">' + esc(x.anchor) + '</code></p>') + '<div class="lead rich">' + rich(x.says) + '</div>'
  }
  const x = n.lines[m.item]
  return '<div class="head">' + pinHtml + '<div class="lead rich">' + rich(x.says) + '</div></div>'
}

// ---- code with its explanations beside it -----------------------------------------------------

type Block = {
  pinId: ((pin: number) => string) | null // null for a copy, which carries no anchors
  lines: (Line | null)[]
  rows: Segment[]
  pins: Map<string, number>
  pinAt: Map<number, number[]>
  numbers: 1 | 2 // one line number for code as it stands, old and new for a diff
  path: string
  lineIds?: Map<number, string> // anchors on lines, where the why view jumps to
}

// The pins beside one line. More than two would widen the gutter and push this line's code to the
// right of the lines around it, which reads as indentation, so they become one pin with their range
// ("6-9", or "6+3" when they are not consecutive); the explanations beside the code list them all.
export function pinsHtml(at: number[], kindOf: Map<number, MarkKind>): string {
  const one = (n: number) => '<span class="pin ' + lv(kindOf.get(n) ?? 'line') + '">' + n + '</span>'
  if (at.length <= 2) return at.map(one).join('')
  const kinds = new Set(at.map((n) => kindOf.get(n) ?? 'line'))
  const run = at.every((n, i) => i === 0 || n === at[i - 1] + 1)
  const label = run ? at[0] + '-' + at[at.length - 1] : at[0] + '+' + (at.length - 1)
  return '<span class="pin wide' + (kinds.size === 1 ? ' ' + lv([...kinds][0]) : '') + '" title="' + at.join(', ') + '">' + label + '</span>'
}

function blockHtml(b: Block, c: Ctx): string {
  const lang = languageOf(b.path)
  const kindOf = new Map<number, MarkKind>()
  for (const [key, pin] of b.pins) kindOf.set(pin, kindOfKey(key))
  const row = (line: Line | null, i: number) => {
    if (!line) return '<tr class="gap"><td colspan="' + (b.numbers === 2 ? 5 : 3) + '">&#8943;</td></tr>'
    const at = b.pinAt.get(i) ?? []
    const pins = pinsHtml(at, kindOf)
    const cls = line.kind === '+' && b.numbers === 2 ? ' class="a"' : line.kind === '-' ? ' class="d"' : ''
    const id = b.lineIds?.get(i)
    const nums = b.numbers === 2 ? '<td class="o">' + (line.old ?? '') + '</td><td class="n">' + (line.new ?? '') + '</td>' : '<td class="n">' + (line.new ?? '') + '</td>'
    const here = new Set(b.pinId ? at.map((n) => '#' + b.pinId!(n)) : [])
    const linker = (name: string) => { const to = c.link(name); return to && !here.has(to.href) ? to : null }
    const mark = b.numbers === 2 ? '<td class="m">' + (line.kind === ' ' ? '' : line.kind) + '</td>' : ''
    return '<tr' + cls + (id ? ' id="' + id + '"' : '') + '>' + nums + '<td class="p">' + pins + '</td>' + mark + '<td class="c">' + highlight(line.text, lang, linker) + '</td></tr>'
  }
  return b.rows.map((seg) => {
    const marks = seg.marks.map((m) => {
      const key = markKey(m)
      const pin = b.pins.get(key) ?? null
      const ref = c.markOf.get(key)?.ref
      return ref ? '<div class="mark ' + lv(m.kind) + '"' + (b.pinId && pin ? ' id="' + b.pinId(pin) + '"' : '') + '>' + markHtml(m, ref, pin, c.l) + '</div>' : ''
    }).join('')
    const code = b.lines.slice(seg.from, seg.to + 1).map((line, k) => row(line, seg.from + k)).join('')
    return '<div class="gloss' + (marks ? '' : ' empty') + '">' + marks + '</div><div class="src"><table>' + code + '</table></div>'
  }).join('')
}

// One file of a commit: its diff with the commit's explanations. A copy (under a file's Changes
// tab) carries no anchors, so every anchor on the page is unique.
function fileHtml(g: Group, f: FileView, c: Ctx, copy: boolean): string {
  const { l, code } = c
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
  const page = c.x.byPath.get(p.path)
  const path = copy ? '' : page ? '<a class="path" href="#' + page.id + '"><code>' + esc(p.path) + '</code></a>' : '<code class="path">' + esc(p.path) + '</code>'
  const head = '<div class="file-head">' + path + tags.join('') + (g.kind === 'explained' ? '' : delta(p.added, p.removed)) + (copy ? '' : badge(l[('page_role_' + f.role) as 'page_role_data'])) + '</div>'
  const open = '<div class="file"' + (copy ? '' : ' id="' + f.anchor + '"') + '>' + head
  if (f.data.hidden === 'sensitive') return open + '<p class="say">' + esc(l.page_skipped_sensitive) + '</p></div>'
  if (f.data.hidden === 'binary') return open + '<p class="say">' + esc(l.page_skipped_binary) + '</p></div>'
  if (f.tooBig) return open + '<p class="say">' + esc(l.r_too_big) + '</p></div>'
  if (!f.lines.length) return open + '</div>'
  const block: Block = { pinId: copy ? null : (n) => f.anchor + '-' + n, lines: f.lines, rows: f.rows, pins: f.pins, pinAt: f.pinAt, numbers: g.kind === 'explained' ? 1 : 2, path: p.path }
  return open + '<div class="rows">' + blockHtml(block, c) + '</div></div>'
}

// ---- the notes of a commit --------------------------------------------------------------------

function notesHtml(g: Group, c: Ctx): string {
  const { l } = c
  const several = g.notes.length > 1
  return g.notes.map((ref) => {
    const n = ref.record.note
    const out: string[] = ['<article class="note">']
    if (several || g.kind !== 'commit') out.push('<h3 class="title"><span class="num">#' + ref.n + '</span>' + esc(n.title) + '</h3>')
    if (n.tldr) out.push('<p class="tldr">' + span(n.tldr) + '</p>')
    const basis = n.basis === 'verified' ? ' ' + badge(l.page_basis_verified, 'new', l.page_basis_verified_hint) : n.basis === 'judgment' ? ' ' + badge(l.page_basis_judgment, '', l.page_basis_judgment_hint) : ''
    const tags = (ref.record.source === 'reconstructed' ? ' ' + badge(l.page_reconstructed) : '') + (ref.record.agent ? ' ' + badge(say(l.page_subagent, { agent: ref.record.agent })) : '')
    const list = (items: string[]) => '<ul>' + items.map((a) => '<li>' + span(a) + '</li>').join('') + '</ul>'
    out.push('<dl class="story">')
    if (n.what) out.push('<dt>' + esc(l.page_what) + '</dt><dd class="rich">' + rich(n.what) + '</dd>')
    if (n.why) out.push('<dt>' + esc(l.page_why) + '</dt><dd class="why rich">' + rich(n.why) + basis + tags + '</dd>')
    if (n.alternatives.length) out.push('<dt>' + esc(l.r_instead) + '</dt><dd class="rich">' + list(n.alternatives) + '</dd>')
    if (n.impact.length) out.push('<dt>' + esc(l.r_impact) + '</dt><dd class="rich">' + list(n.impact) + '</dd>')
    if (n.risks.length) out.push('<dt>' + esc(l.page_risks) + '</dt><dd class="risk rich">' + list(n.risks) + '</dd>')
    if (n.terms.length) {
      out.push('<dt class="lv-terms">' + esc(l.r_terms) + '</dt><dd class="lv-terms"><dl class="terms">' + n.terms.map((t) => '<dt>' + esc(t.term) + '</dt><dd class="rich">' + rich(t.means) + '</dd>').join('') + '</dl></dd>')
    }
    out.push('</dl>')
    const missed = g.missed.filter((m) => m.note === ref.id)
    if (missed.length) {
      out.push('<div class="missed"><h3>' + esc(l.r_missed) + '</h3><ul>' + missed.map((m) => '<li class="' + lv(m.kind) + '">' + markHtml(m, ref, null, l) + '</li>').join('') + '</ul></div>')
    }
    return out.join('') + '</article>'
  }).join('')
}

// ---- views ------------------------------------------------------------------------------------

function crumbs(path: string, c: Ctx): string {
  const parts = path ? path.split('/') : []
  const out = [parts.length ? '<a href="#d-root">' + esc(c.r.project) + '</a>' : '<b>' + esc(c.r.project) + '</b>']
  parts.forEach((p, i) => out.push(i === parts.length - 1 ? '<b>' + esc(p) + '</b>' : '<a href="#' + dirId(parts.slice(0, i + 1).join('/')) + '">' + esc(p) + '</a>'))
  return '<nav class="crumbs">' + out.join(' / ') + '</nav>'
}

const lastLink = (last: Node['last'], c: Ctx) => (!last ? '' : c.shown.has(last.href.slice(1)) ? '<a href="' + esc(last.href) + '">' + esc(last.title) + '</a>' : esc(last.title))

function entryRow(n: Node, c: Ctx): string {
  const href = '#' + (n.kind === 'dir' ? dirId(n.path) : fileId(n.path))
  return '<tr><td class="name"><span><a href="' + href + '">' + (n.kind === 'dir' ? ICON_DIR : ICON_FILE) + '<span class="nm">' + esc(n.name) + '</span></a>' +
    statusMark(n.status, c.l) + (n.notes ? notesPill(n.notes, c) : '') + '</span></td><td class="last">' + lastLink(n.last, c) + '</td><td class="when">' + esc(when(n.last?.time, c.code)) + '</td></tr>'
}

// A folder's entries as GitHub lists them: name, the last change in the review, when
function filesBox(n: Node, c: Ctx): string {
  const { l } = c
  const rows: string[] = []
  if (n.path) {
    const parent = n.path.includes('/') ? n.path.slice(0, n.path.lastIndexOf('/')) : ''
    rows.push('<tr class="up"><td class="name"><span><a href="#' + dirId(parent) + '" title="' + esc(l.x_up) + '">' + ICON_DIR + '<span class="nm">..</span></a></span></td><td class="last"></td><td class="when"></td></tr>')
  }
  for (const child of n.children) rows.push(entryRow(child, c))
  const head = n.last ? '<div class="box-head"><span>' + esc(l.x_last_change) + ':</span> ' + lastLink(n.last, c) + '<span class="when">' + esc(when(n.last.time, c.code)) + '</span></div>' : ''
  return '<div class="box">' + head + '<div class="tablewrap"><table class="files"><thead><tr><th class="name">' + esc(l.page_param_name) + '</th><th class="last">' + esc(l.x_last_change) +
    '</th><th class="when">' + esc(l.x_when) + '</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div></div>'
}

const folderView = (n: Node, c: Ctx) => '<section class="view" id="' + dirId(n.path) + '">' + crumbs(n.path, c) + filesBox(n, c) + '</section>'

function overview(c: Ctx): string {
  const { r, x, l, o, code } = c
  const meta = [scopeName(c), r.started && r.scope === 'session' ? say(l.r_started, { time: when(r.started, code) }) : '', count(code, l.r_commits, r.counts.commits),
    count(code, l.files, x.files.length), count(code, l.notes, r.counts.notes)].filter(Boolean)
  const main: string[] = []
  const side: string[] = []
  if (x.files.length) main.push(filesBox(x.root, c))
  else main.push(hint(o.mode === 'explain' ? l.x_explain_empty : l.r_empty))
  if (r.recaps.length) main.push('<section class="box"><div class="box-head">' + esc(l.page_summary) + '</div><div class="box-body overview">' + r.recaps.map((x) => '<div class="rich">' + rich(x.overview) + '</div>').join('') + '</div></section>')
  const reading = new Map<string, string>()
  for (const recap of r.recaps) for (const item of recap.reading_order) if (!reading.has(item.file)) reading.set(item.file, item.why)
  if (reading.size) {
    const pageOf = (file: string) => x.files.find((p) => sameFile(file, p.path) || sameFile(p.path, file))
    main.push('<section><h3>' + esc(l.page_start_here) + '</h3><ol class="reading">' + [...reading].map(([file, why]) => {
      const page = pageOf(file)
      return '<li>' + (page ? '<a href="#' + page.id + '"><code>' + esc(page.path) + '</code></a>' : '<code>' + esc(file) + '</code>') + ' ' + span(why) + '</li>'
    }).join('') + '</ol></section>')
  }
  if (r.checks.length) {
    side.push('<section><h3>' + esc(l.page_check) + '</h3><ul class="check">' + r.checks.map((k, i) =>
      '<li><input type="checkbox" id="k' + i + '"><label for="k' + i + '">' + span(k) + '</label></li>').join('') + '</ul></section>')
  }
  const groups = [...c.shown.values()]
  if (groups.length) {
    const items = newestFirst(groups).map((g) => {
      const [a, d] = sum(g)
      const sub = g.kind === 'commit' ? '<span class="sha">' + short(g.sha) + '</span>' + (g.time ? ' &middot; ' + esc(when(g.time, code)) : '') : esc(count(code, l.files, g.files.length))
      return '<li' + (g.kind === 'commit' ? '' : ' class="pending"') + '><a href="#' + g.id + '"><span class="t">' + esc(heading(g, l)) + '</span>' + (g.kind === 'explained' ? '<span></span>' : delta(a, d)) + '<span class="sub">' + sub + '</span></a></li>'
    })
    side.push('<section><h3>' + esc(l.x_history) + '</h3><ol class="history">' + items.join('') + '</ol>' + (r.more ? hint(count(code, l.r_more, r.more)) : '') + '</section>')
  }
  if (hasIndex(c)) side.push('<section><h3>' + esc(l.page_index) + '</h3><p><a href="#index">' + esc(l.page_index_hint) + '</a></p></section>')
  return '<section class="view" id="overview" data-in-print><header class="repo-head"><p class="kicker">' + esc(o.mode === 'explain' ? l.x_kicker_explain : l.r_kicker) + '</p><h1>' + esc(r.project) +
    '</h1><p class="meta">' + meta.map(esc).join(' &middot; ') + '</p></header><div class="ov"><div class="ov-main">' + main.join('') + '</div><div class="ov-side">' + side.join('') + '</div></div></section>'
}

// ---- a file: its code, its changes and why each block of lines is there -----------------------

function fileViews(page: FilePage, c: Ctx): string {
  const { l, code } = c
  const node = c.nodes.get(page.path)
  const changes = page.changes.filter((ch) => c.shown.has(ch.group.id))
  const lastPatch = page.changes[page.changes.length - 1]?.file.data.patch
  const badges: string[] = []
  if (node?.status === 'added') badges.push(badge(l.page_new_file, 'new'))
  else if (node?.status === 'deleted') badges.push(badge(l.page_state_deleted, 'warn'))
  else if (node?.status === 'renamed') badges.push(badge(say(l.r_tag_renamed, { from: lastPatch?.oldPath ?? '' })))
  else if (node?.status === 'modified') badges.push(badge(l.x_status_modified))
  badges.push(badge(l[('page_role_' + roleOf(page.path)) as 'page_role_data']))
  badges.push(node?.notes ? badge(count(code, l.notes, node.notes), 'new') : badge(l.r_tag_unexplained, 'warn'))
  if (page.state.text !== null) badges.push(badge(count(code, l.x_lines_count, page.lines.length)))
  const head = crumbs(page.path, c) + '<div class="fhead">' + badges.join('') + '</div>'
  const tabs = (now: string) => '<nav class="tabs">' + ([['code', page.id, l.x_code, ''], ['changes', page.id + '_changes', l.x_changes, String(changes.length)], ['why', page.id + '_why', l.x_why, '']] as const)
    .map(([k, id, name, n]) => '<a href="#' + id + '"' + (k === now ? ' aria-current="page"' : '') + '>' + esc(name) + (n ? '<span class="count">' + n + '</span>' : '') + '</a>').join('') + '</nav>'
  const section = (id: string, inPrint: boolean, body: string) => '<section class="view" id="' + id + '" data-file="' + page.id + '"' + (inPrint ? ' data-in-print' : '') + '>' + body + '</section>'
  return [
    section(page.id, c.o.mode === 'explain', head + tabs('code') + codeHtml(page, c)),
    section(page.id + '_changes', false, head + tabs('changes') + changesHtml(page, changes, c)),
    section(page.id + '_why', false, head + tabs('why') + whyHtml(page, c)),
  ].join('\n')
}

// Why there is no code to show, or null when there is
function absent(page: FilePage, c: Ctx): string | null {
  const { l } = c
  const s = page.state
  if (s.hidden === 'sensitive') return l.page_skipped_sensitive
  if (s.hidden === 'binary') return l.page_skipped_binary
  if (s.hidden === 'deleted') return l.x_deleted
  if (s.hidden === 'not-shown') return say(l.x_not_shown, { path: page.path })
  if (s.hidden === 'too-large' || s.text === null) return l.x_too_large
  if (page.tooBig) return l.r_too_big
  return null
}

function codeHtml(page: FilePage, c: Ctx): string {
  const missing = absent(page, c)
  if (missing) return hint(missing)
  const lead = page.refs.size || page.moved.length || page.gone ? '' : hint(say(c.l.x_annotate_hint, { path: page.path }))
  const gone = page.gone ? '<p class="hint"><a href="#' + page.id + '_changes">' + esc(count(c.code, c.l.x_removed_hint, page.gone)) + '</a></p>' : ''
  const lineIds = new Map(page.why.map((w) => [w.from, page.id + '_L' + (w.from + 1)]))
  const block: Block = { pinId: (n) => page.id + '_' + n, lines: page.lines, rows: page.rows, pins: page.pins, pinAt: page.pinAt, numbers: 1, path: page.path, lineIds }
  return lead + gone + (page.lines.length ? '<div class="file code"><div class="rows">' + blockHtml(block, c) + '</div></div>' : '') + movedHtml(page, c)
}

// Explanations whose lines a later commit rewrote: listed under the code, each with its commit
function movedHtml(page: FilePage, c: Ctx): string {
  const { l } = c
  if (!page.moved.length) return ''
  const items = page.moved.map((m) => {
    const fv = m.group.files.find((f) => m.href.startsWith('#' + f.anchor + '-'))
    const there = c.shown.has(m.group.id) && fv && !fv.tooBig
    const from = esc(say(l.x_moved_from, { commit: heading(m.group, l) + (m.group.sha ? ' (' + short(m.group.sha) + ')' : '') }))
    return '<div class="mark ' + lv(m.mark.kind) + '">' + markHtml(m.mark, m.ref, null, l) + '<p class="from">' + (there ? '<a href="' + m.href + '">' + from + '</a>' : from) + '</p></div>'
  })
  return '<section class="moved"><h3>' + esc(l.x_moved) + '</h3>' + hint(l.x_moved_hint) + '<div class="gloss">' + items.join('') + '</div></section>'
}

function changesHtml(page: FilePage, changes: FilePage['changes'], c: Ctx): string {
  const { l, code } = c
  if (!changes.length) return hint(l.x_no_changes)
  return changes.map(({ group: g, file: f }) => {
    const eyebrow = g.kind === 'commit'
      ? esc(say(l.r_commit_of, { n: g.index, total: c.r.counts.commits })) + ' &middot; <span class="sha">' + short(g.sha) + '</span>' + (g.time ? ' &middot; ' + esc(when(g.time, code)) : '')
      : esc(heading(g, l))
    const title = g.kind === 'commit' ? heading(g, l) : g.notes.find((r) => covers(r, page.path))?.record.note.title || heading(g, l)
    const tldrs = g.notes.filter((r) => covers(r, page.path)).map((r) => r.record.note.tldr).filter(Boolean)
    const head = '<div class="change-head"><p class="eyebrow">' + eyebrow + '</p><h3 class="title"><a href="#' + g.id + '">' + esc(title) + '</a></h3>' + tldrs.map((t) => '<p class="tldr">' + span(t) + '</p>').join('') + '</div>'
    const body = c.trim.changes || f.tooBig ? '<p class="hint"><a href="#' + f.anchor + '">' + esc(l.x_see_commit) + '</a></p>' : fileHtml(g, f, c, true)
    return '<div class="change">' + head + body + '</div>'
  }).join('')
}

function whyHtml(page: FilePage, c: Ctx): string {
  const { l, code } = c
  const gone = absent(page, c)
  if (gone && !(page.tooBig && page.why.length)) return hint(gone)
  if (!page.state.blame) return hint(c.r.git ? l.x_no_blame : l.x_no_why)
  const lang = languageOf(page.path)
  const told = new Set<string>()
  const rows = page.why.map((w) => {
    const pending = w.sha === UNCOMMITTED
    const href = w.href && c.shown.has(w.href.slice(1)) ? w.href : null
    const title = pending ? l.r_pending : w.title || short(w.sha)
    const t = href ? '<a class="t" href="' + href + '">' + esc(title) + '</a>' : '<span class="t">' + esc(title) + '</span>'
    const tl = w.tldr && !told.has(w.sha) ? '<span class="tl">' + span(w.tldr) + '</span>' : ''
    told.add(w.sha)
    const range = w.from === w.to ? say(l.x_line, { n: w.from + 1 }) : say(l.x_lines, { from: w.from + 1, to: w.to + 1 })
    const jump = page.tooBig ? '<span>' + esc(range) + '</span>' : '<a class="jump" href="#' + page.id + '_L' + (w.from + 1) + '">' + esc(range) + '</a>'
    const sub = '<span class="sub">' + (pending ? '' : '<span class="sha">' + short(w.sha) + '</span>') + (w.time ? '<span>' + esc(when(w.time, code)) + '</span>' : '') +
      (w.mine ? '' : badge(l.x_outside_review)) + jump + '</span>'
    const compact = c.trim.why || page.tooBig
    const lines = compact ? '' : '<div class="src"><table>' + page.lines.slice(w.from, w.to + 1).map((line) => (line ? '<tr><td class="n">' + line.new + '</td><td class="c">' + highlight(line.text, lang) + '</td></tr>' : '')).join('') + '</table></div>'
    return '<div class="bl' + (w.mine ? ' mine' : '') + (pending ? ' pending' : '') + (compact ? ' compact' : '') + '"><div class="bl-meta">' + t + tl + sub + '</div>' + lines + '</div>'
  })
  return hint(l.x_why_hint) + '<div class="blame">' + rows.join('') + '</div>'
}

// ---- a commit, what is not committed, or code explained afterwards ----------------------------

function commitView(g: Group, c: Ctx, older: Group | null, newer: Group | null): string {
  const { l, code } = c
  const out: string[] = ['<section class="view" id="' + g.id + '"' + (c.o.mode === 'review' ? ' data-in-print' : '') + '>']
  if (older || newer) out.push('<div class="cnav">' + (older ? '<a href="#' + older.id + '">&larr; ' + esc(l.x_older) + '</a>' : '<span></span>') + (newer ? '<a href="#' + newer.id + '">' + esc(l.x_newer) + ' &rarr;</a>' : '<span></span>') + '</div>')
  if (g.kind === 'commit') {
    out.push('<p class="eyebrow">' + esc(say(l.r_commit_of, { n: g.index, total: c.r.counts.commits })) + ' &middot; <span class="sha">' + short(g.sha) + '</span>' + (g.time ? ' &middot; ' + esc(when(g.time, code)) : '') + '</p>')
    const title = heading(g, l)
    out.push('<h2>' + esc(title) + '</h2>')
    if (g.subject && g.subject !== title) out.push('<p class="subject">' + esc(g.subject) + '</p>')
    if (g.body && g.body.trim()) out.push('<div class="body rich">' + rich(g.body) + '</div>')
    if (!g.notes.length) out.push(hint(say(l.r_no_notes, { sha: short(g.sha) })))
  } else {
    const lead = g.kind === 'pending' ? l.r_pending_hint : g.kind === 'session' ? l.r_session_hint : l.r_explained_hint
    out.push('<div class="pending-head"><h2>' + esc(heading(g, l)) + '</h2><p>' + span(lead) + '</p></div>')
  }
  out.push(notesHtml(g, c))
  if (g.files.length > 1) {
    out.push('<h3>' + esc(l.x_changed_files) + '</h3><ul class="changed">' + g.files.map((f) => '<li>' + (g.kind === 'explained' ? '' : statusMark(f.data.patch.status, l)) +
      '<a href="#' + f.anchor + '"><code>' + esc(f.data.patch.path) + '</code></a>' + (g.kind === 'explained' ? '' : delta(f.data.patch.added, f.data.patch.removed)) + '</li>').join('') + '</ul>')
  }
  for (const f of g.files) out.push(fileHtml(g, f, c, false))
  return out.join('\n') + '</section>'
}

// ---- the index of classes and functions --------------------------------------------------------

function indexRows(c: Ctx): string[] {
  const { l } = c
  const rows: string[] = []
  const seen = new Set<string>()
  for (const g of c.shown.values()) for (const ref of g.notes) {
    ref.record.note.symbols.forEach((s, item) => {
      const key = markKey({ kind: 'symbol', note: ref.id, item })
      if (seen.has(key)) return
      seen.add(key)
      const href = c.hrefOf(key)
      const where = href ? '<a href="' + href + '">' + esc(href.startsWith('#f-') ? l.x_code : short(g.sha) || l.r_here) + '</a>' : ''
      rows.push('<tr><td><code>' + esc(s.name) + '</code> ' + badge(l[('page_kind_' + s.kind) as 'page_kind_class']) + '</td><td>' + (s.file ? '<code>' + esc(s.file) + '</code>' : '') +
        '</td><td>' + span(s.why_exists) + '</td><td>' + where + '</td></tr>')
    })
  }
  return rows
}
const hasIndex = (c: Ctx) => [...c.shown.values()].some((g) => g.notes.some((r) => r.record.note.symbols.length))

function indexView(c: Ctx): string {
  const { l } = c
  const rows = indexRows(c)
  if (!rows.length) return ''
  return '<section class="view" id="index" data-in-print><h2>' + esc(l.page_index) + '</h2>' + hint(l.page_index_hint) + '<div class="tablewrap"><table class="index"><thead><tr><th>' +
    esc(l.page_param_name) + '</th><th>' + esc(l.page_field_files) + '</th><th>' + esc(l.page_why_exists) + '</th><th>' + esc(l.r_where) + '</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div></section>'
}

// ---- around the views: the bar on top and the files on the side --------------------------------

function appbar(c: Ctx): string {
  const { r, l, o } = c
  const theme = '<span class="seg" role="group" aria-label="' + esc(l.r_theme) + '">' + (['auto', 'light', 'dark'] as const).map((t) =>
    '<button type="button" data-theme-choice="' + t + '">' + esc(l[('r_theme_' + t) as 'r_theme_auto']) + '</button>').join('') + '</span>'
  const level = '<label class="lvl"><span>' + esc(l.x_level) + '</span><select data-level-choice title="' + esc(say(o.written ? l.x_level_hint : l.x_level_hint_setting, { level: levelName(l, o.level) })) + '">' +
    LEVELS.map((v) => '<option value="' + v + '"' + (v === o.level ? ' selected' : '') + '>' + esc(levelName(l, v)) + '</option>').join('') + '</select></label>'
  return '<header class="appbar"><label class="drawer-btn" for="drawer">' + ICON_MENU + '<span class="t">' + esc(l.x_files) + '</span></label><div class="brand"><a class="logo" href="#overview">inloop</a><span class="mode">' +
    esc(o.mode === 'explain' ? l.x_explain : l.x_review) + '</span><span class="proj">' + esc(r.project) + '</span></div><div class="tools">' + level + theme +
    '<button type="button" data-print>' + esc(l.r_print) + '</button><button type="button" data-print-all>' + esc(l.x_print_all) + '</button></div></header>'
}

// The tree: folders open, a folder holding only one folder shown as one line (as GitHub does)
function treeHtml(n: Node, c: Ctx): string {
  return n.children.map((child) => {
    if (child.kind === 'file') {
      return '<li class="leaf' + (child.notes ? '' : ' unx') + '" data-path="' + esc(child.path) + '"><a href="#' + fileId(child.path) + '"' + (child.notes ? '' : ' title="' + esc(c.l.r_tag_unexplained) + '"') + '>' +
        ICON_FILE + '<span class="nm">' + esc(child.name) + '</span>' + statusMark(child.status, c.l) + (child.notes ? notesPill(child.notes, c) : '') + '</a></li>'
    }
    let dir = child
    let name = child.name
    while (dir.children.length === 1 && dir.children[0].kind === 'dir') {
      dir = dir.children[0]
      name += '/' + dir.name
    }
    return '<li class="branch"><details open><summary>' + CHEV + ICON_DIR + '<a href="#' + dirId(dir.path) + '">' + esc(name) + '</a></summary><ul>' + treeHtml(dir, c) + '</ul></details></li>'
  }).join('')
}

function sidebar(c: Ctx): string {
  const { l } = c
  const items = ['<li><a href="#overview"><span class="t">' + esc(l.x_overview) + '</span></a></li>', '<li><a href="#d-root"><span class="t">' + esc(l.x_files) + '</span></a></li>']
  for (const g of newestFirst([...c.shown.values()])) {
    items.push('<li><a href="#' + g.id + '"><span class="sha">' + (g.kind === 'commit' ? short(g.sha) : '&middot;&middot;&middot;') + '</span><span class="t">' + esc(heading(g, l)) + '</span></a></li>')
  }
  if (hasIndex(c)) items.push('<li><a href="#index"><span class="t">' + esc(l.page_index) + '</span></a></li>')
  const scope = '<details class="scope"><summary><span class="k">' + esc(l.x_scope) + ':</span><span class="v">' + esc(scopeName(c)) + '</span></summary><ul class="menu">' + items.join('') + '</ul></details>'
  const find = '<div class="findrow"><input class="find" type="search" placeholder="' + esc(l.x_go_to_file) + '" aria-label="' + esc(l.x_go_to_file) + '" autocomplete="off" spellcheck="false"><kbd>t</kbd></div>' +
    '<p class="no-match" hidden>' + esc(l.x_no_match) + '</p>'
  return '<aside class="side" aria-label="' + esc(l.x_files) + '"><div class="side-in"><label class="drawer-close" for="drawer">&times; ' + esc(l.x_close) + '</label>' + scope + find +
    '<ul class="tree">' + treeHtml(c.x.root, c) + '</ul></div></aside>'
}

// ---- the page ---------------------------------------------------------------------------------

export function render(r: Review, x: Explorer, l: Labels, o: Options, trim: Trim = { changes: false, why: false }): string {
  const groups = [...r.groups, ...(r.explained ? [r.explained] : [])]
  const shown = new Map(groups.map((g) => [g.id, g]))
  const markOf = new Map<string, { mark: Mark; ref: NoteRef }>()
  for (const g of groups) for (const ref of g.notes) {
    const n = ref.record.note
    const add = (kind: MarkKind, size: number) => { for (let item = 0; item < size; item++) markOf.set(markKey({ kind, note: ref.id, item }), { mark: { kind, note: ref.id, item }, ref }) }
    add('symbol', n.symbols.length)
    add('use', n.uses.length)
    add('param', n.parameters.length)
    add('line', n.lines.length)
    add('removed', n.removed.length)
  }
  // an explanation's place: its pin in the code as it stands, else in its commit's diff
  const where = new Map<string, string>()
  for (const p of x.files) if (!p.tooBig && p.state.text !== null) for (const [key, pin] of p.pins) where.set(key, '#' + p.id + '_' + pin)
  for (const g of groups) for (const f of g.files) {
    if (f.tooBig || f.data.hidden || !f.lines.length) continue
    for (const [key, pin] of f.pins) if (!where.has(key)) where.set(key, '#' + f.anchor + '-' + pin)
  }
  const links = new Map<string, { href: string; title: string }>()
  for (const g of groups) for (const ref of g.notes) ref.record.note.symbols.forEach((s, item) => {
    const name = linkName(s.name)
    const href = where.get(markKey({ kind: 'symbol', note: ref.id, item }))
    if (name && href && !links.has(name)) links.set(name, { href, title: s.why_exists })
  })
  const nodes = new Map<string, Node>()
  const walk = (n: Node) => (n.kind === 'file' ? nodes.set(n.path, n) : n.children.forEach(walk))
  walk(x.root)
  const c: Ctx = {
    r, x, l, o, code: o.code, trim, shown, nodes, markOf,
    hrefOf: (key) => where.get(key) ?? null,
    link: (name) => links.get(name) ?? null,
  }

  const views: string[] = [overview(c)]
  for (const n of folders(x.root)) views.push(folderView(n, c))
  for (const p of x.files) views.push(fileViews(p, c))
  // older and newer step through the commits and what is not committed; code explained stands apart
  const timeline = groups.filter((g) => g.kind !== 'explained')
  for (const g of groups) {
    const i = timeline.indexOf(g)
    views.push(commitView(g, c, i > 0 ? timeline[i - 1] : null, i >= 0 ? timeline[i + 1] ?? null : null))
  }
  views.push(indexView(c))
  const known = (id: string) => id === 'overview' || id === 'd-root' || shown.has(id) || x.files.some((p) => p.id === id) || (id.startsWith('d-') && folders(x.root).some((n) => dirId(n.path) === id))
  const start = o.start && known(o.start) ? o.start : 'overview'
  const foot = '<footer>inloop ' + esc(o.version) + ' &middot; <code>' + esc(o.command) + '</code> &middot; ' + esc(when(o.made, o.code)) + '</footer>'
  const body = appbar(c) + '\n<input type="checkbox" id="drawer" class="drawer-toggle" aria-hidden="true" tabindex="-1"><label class="scrim" for="drawer" aria-hidden="true"></label>\n<div class="app">' + sidebar(c) +
    '<main class="views">\n' + views.filter(Boolean).join('\n') + '\n' + foot + '</main></div>'
  return shell(say(l.page_title, { project: r.project || 'inloop' }), o.code, o.theme, CSS + startCss(start), body, SCRIPT, { 'data-level': o.level, 'data-start': start })
}

// The page within the size a mod may write. What goes first is what the page shows twice: the
// diffs under each file's Changes tab, then the code beside the why view. Then the code of the
// longest files (the code views first in a review, the diffs first in an explanation), and last the
// oldest commits.
export function fit(r: Review, x: Explorer, l: Labels, o: Options, budget = PAGE_BYTES): { html: string; cut: number } {
  const trim: Trim = { changes: false, why: false }
  let cut = 0
  let html = render(r, x, l, o, trim)
  const over = () => bytes(html) > budget
  const again = () => { html = render(r, x, l, o, trim) }
  if (!over()) return { html, cut }
  for (const step of ['changes', 'why'] as const) {
    trim[step] = true
    cut++
    again()
    if (!over()) return { html, cut }
  }
  const pages = x.files.filter((p) => p.lines.length).sort((a, b) => b.lines.length - a.lines.length)
  const diffs = [...r.groups, ...(r.explained ? [r.explained] : [])].flatMap((g) => g.files).sort((a, b) => b.lines.length - a.lines.length)
  const shrink = (items: { tooBig: boolean }[]) => {
    for (let i = 0; i < items.length; i++) {
      items[i].tooBig = true
      cut++
      if ((i + 1) % 5 === 0 || i === items.length - 1) {
        again()
        if (!over()) return true
      }
    }
    return false
  }
  if (o.mode === 'explain' ? shrink(diffs) || shrink(pages) : shrink(pages) || shrink(diffs)) return { html, cut }
  while (r.groups.length > 1 && over()) {
    r.groups.shift()
    r.more += 1
    again()
  }
  return { html, cut }
}
