// The review as Markdown: the comment inloop writes on a pull request, and the text beside the page
// a person shares. GitHub renders it. Note text keeps its own Markdown, but no HTML from a note
// gets through and "@name" in a note never notifies anyone. Plain module.

import type { Labels } from '../i18n/en.ts'
import { count, say } from '../i18n/index.ts'
import type { Level } from '../config.ts'
import { HIDDEN_AT } from './style.ts'
import { when } from './html.ts'
import { markKey, type Review, type Group, type NoteRef } from './review.ts'
import type { Mark, MarkKind } from './anchor.ts'

export const MARKER = '<!-- inloop -->' // finds inloop's own comment again, to update it in place
export const COMMENT_MAX = 60_000 // characters; GitHub takes up to 65,536 in a comment


// Text from a note, safe in a comment: HTML outside code spans shows as text, and "@" before a name
// gets an invisible joiner so GitHub does not take it for a mention.
export function md(text: unknown): string {
  return String(text ?? '').replace(/\r\n/g, '\n').split(/(`[^`\n]*`)/).map((part, i) => (i % 2 ? part : part
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/@(?=[\w-])/g, '@⁠'))).join('').trim()
}
// One line: paragraphs and bullets folded into it
const line = (text: unknown) => md(text).replace(/\s*\n+\s*/g, ' ')
const code = (text: string) => '`' + text.replace(/`/g, "'") + '`'
const short = (sha: string | null) => (sha ?? '').slice(0, 7)

// command and made: the command that wrote the text and when, for its last line
export type MdOptions = { code: string | null; level: Level; version: string; marker: boolean; max: number; command: string; made: number }
type Keep = { marks: boolean; terms: boolean; what: boolean }

function heading(g: Group, l: Labels): string {
  if (g.kind === 'pending') return l.r_pending
  if (g.kind === 'session') return l.r_session
  if (g.kind === 'explained') return l.r_explained
  return g.notes.length === 1 ? g.notes[0].record.note.title || g.subject || '' : g.subject || ''
}

// Where each explanation sits in a group's diffs: the file and the line number
function places(g: Group): Map<string, { path: string; at: number | null }> {
  const out = new Map<string, { path: string; at: number | null }>()
  for (const f of g.files) {
    const keyOf = new Map([...f.pins].map(([key, pin]) => [pin, key]))
    for (const [i, pins] of f.pinAt) {
      const ln = f.lines[i]
      for (const pin of pins) {
        const key = keyOf.get(pin)
        if (key && !out.has(key)) out.set(key, { path: f.data.patch.path, at: ln ? ln.new ?? ln.old : null })
      }
    }
  }
  return out
}

function markLine(m: Mark, ref: NoteRef, where: { path: string; at: number | null } | undefined, l: Labels): string {
  const n = ref.record.note
  const at = where ? code(where.path + (where.at ? ':' + where.at : '')) + ' ' : ''
  if (m.kind === 'symbol') {
    const s = n.symbols[m.item]
    return '- ' + at + code(s.name) + ' (' + l[('page_kind_' + s.kind) as 'page_kind_class'] + '): ' + line(s.why_exists) + (s.why_this_shape ? ' ' + line(s.why_this_shape) : '')
  }
  if (m.kind === 'use') {
    const u = n.uses[m.item]
    return '- ' + at + code(u.name) + ' (' + md(say(l.r_from, { from: u.from })) + '): ' + line(u.why)
  }
  if (m.kind === 'param') {
    const p = n.parameters[m.item]
    return '- ' + at + code(p.name) + ' (' + l.r_param + '): ' + line(p.meaning) + (p.why_this_value ? ' ' + l.page_param_why + ': ' + line(p.why_this_value) : '')
  }
  if (m.kind === 'removed') {
    const x = n.removed[m.item]
    return '- ' + at + '~~' + code(x.anchor) + '~~ (' + l.r_removed + '): ' + line(x.says)
  }
  return '- ' + at + line(n.lines[m.item].says)
}

function noteMd(ref: NoteRef, g: Group, where: Map<string, { path: string; at: number | null }>, o: MdOptions, keep: Keep, l: Labels, titled: boolean): string {
  const n = ref.record.note
  const out: string[] = []
  if (titled) out.push('**' + line(n.title) + '**')
  if (n.tldr) out.push('> ' + line(n.tldr))
  const field = (name: string, text: string) => (text.trim() ? out.push('**' + name + '**\n\n' + md(text)) : 0)
  const list = (name: string, items: string[]) => (items.length ? out.push('**' + name + '**\n\n' + items.map((x) => '- ' + line(x)).join('\n')) : 0)
  if (keep.what && o.level !== 'big-picture') field(l.page_what, n.what)
  field(l.page_why, n.why)
  list(l.r_instead, n.alternatives)
  list(l.r_impact, n.impact)
  list(l.page_risks, n.risks)
  if (keep.marks) {
    const hidden = HIDDEN_AT[o.level] // what the level leaves out, as on the page
    const marks: Mark[] = []
    // a deleted line's comment shows and hides with the comments on lines
    const add = (kind: MarkKind, size: number) => { if (!hidden.includes(kind === 'removed' ? 'line' : kind)) for (let item = 0; item < size; item++) marks.push({ kind, note: ref.id, item }) }
    add('symbol', n.symbols.length)
    add('use', n.uses.length)
    add('param', n.parameters.length)
    add('line', n.lines.length)
    add('removed', n.removed.length)
    // in the order of the code: by file, then line; what found no line comes last
    const sorted = marks.map((m) => ({ m, w: where.get(markKey(m)) })).sort((a, b) =>
      (a.w ? 0 : 1) - (b.w ? 0 : 1) || (a.w?.path ?? '').localeCompare(b.w?.path ?? '') || (a.w?.at ?? 0) - (b.w?.at ?? 0))
    if (sorted.length) out.push('<details><summary>' + l.md_lines + ' (' + sorted.length + ')</summary>\n\n' + sorted.map((x) => markLine(x.m, ref, x.w, l)).join('\n') + '\n\n</details>')
  }
  if (keep.terms && !HIDDEN_AT[o.level].includes('terms') && n.terms.length) {
    out.push('<details><summary>' + l.r_terms + ' (' + n.terms.length + ')</summary>\n\n' + n.terms.map((t) => '- **' + line(t.term) + '**: ' + line(t.means)).join('\n') + '\n\n</details>')
  }
  return out.join('\n\n')
}

function groupMd(g: Group, r: Review, o: MdOptions, keep: Keep, l: Labels): string {
  const out: string[] = []
  const title = heading(g, l)
  const [a, d] = g.files.reduce((t, f) => [t[0] + f.data.patch.added, t[1] + f.data.patch.removed], [0, 0])
  out.push('### ' + (g.kind === 'commit' ? code(short(g.sha)) + ' ' : '') + line(title))
  const files = g.files.map((f) => code(f.data.patch.path))
  const meta = [g.kind === 'explained' ? '' : '+' + a + ' −' + d, files.length > 6 ? count(o.code, l.files, files.length) : files.join(', ')].filter(Boolean)
  if (meta.length) out.push('<sub>' + meta.join(' · ') + '</sub>')
  if (g.kind === 'commit' && g.subject && g.subject !== title) out.push(code(g.subject))
  if (!g.notes.length) out.push('_' + md(say(l.r_no_notes, { sha: short(g.sha) })) + '_')
  const where = places(g)
  for (const ref of g.notes) out.push(noteMd(ref, g, where, o, keep, l, g.notes.length > 1 || g.kind !== 'commit'))
  return out.join('\n\n')
}

// The review as one Markdown text under o.max characters: detail goes first (line by line, then
// terms, then "what"), then the oldest commits, each step said in the text.
export function markdown(r: Review, l: Labels, o: MdOptions): { text: string; cut: boolean } {
  const groups = [...r.groups, ...(r.explained ? [r.explained] : [])]
  const write = (keep: Keep, from: number) => {
    const out: string[] = []
    if (o.marker) out.push(MARKER)
    out.push('## ' + l.r_kicker)
    const meta = [count(o.code, l.r_commits, r.counts.commits), count(o.code, l.files, r.counts.files), count(o.code, l.notes, r.counts.notes)]
    out.push('<sub>' + meta.join(' · ') + '</sub>')
    for (const x of r.recaps) out.push(md(x.overview))
    if (r.checks.length) out.push('**' + l.page_check + '**\n\n' + r.checks.map((c) => '- [ ] ' + line(c)).join('\n'))
    const left = from + r.more
    if (left) out.push('_' + md(count(o.code, l.r_more, left)) + '_')
    for (const g of groups.slice(from)) out.push('---\n\n' + groupMd(g, r, o, keep, l))
    const cut = !keep.marks || !keep.terms || !keep.what || from > 0
    if (cut) out.push('_' + md(l.md_cut) + '_')
    out.push('---\n\n<sub>inloop ' + md(o.version) + ' \u00b7 ' + code(o.command) + ' \u00b7 ' + md(when(o.made, o.code)) + '</sub>')
    return out.join('\n\n') + '\n'
  }
  const steps: Keep[] = [{ marks: true, terms: true, what: true }, { marks: false, terms: true, what: true }, { marks: false, terms: false, what: true }, { marks: false, terms: false, what: false }]
  for (const keep of steps) {
    const text = write(keep, 0)
    if (text.length <= o.max) return { text, cut: keep !== steps[0] }
  }
  // still too long: the oldest commits go, newest kept
  const keep = steps[steps.length - 1]
  for (let from = 1; from < groups.length; from++) {
    const text = write(keep, from)
    if (text.length <= o.max) return { text, cut: true }
  }
  const text = write(keep, Math.max(0, groups.length - 1))
  if (text.length <= o.max) return { text, cut: true }
  // one commit alone is too long: its end goes, and the text says so
  const tail = '\n\n_' + md(l.md_cut) + '_\n'
  return { text: text.slice(0, Math.max(0, o.max - tail.length)) + tail, cut: true }
}
