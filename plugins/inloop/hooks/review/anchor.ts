// Where each part of a note sits in the code: a line comment by the text it quotes, a new class or
// function by the line that defines it, a parameter or a borrowed name by the first line that uses
// it. What finds no line stays with its note. Plain module.

import type { Line } from './patch.ts'
import type { Note } from '../note.ts'
import { sameFile } from '../note.ts'

export type MarkKind = 'symbol' | 'use' | 'param' | 'line'
export type Mark = { kind: MarkKind; note: string; item: number } // the note's id, the item's index in its list
export type Placed = { at: number; mark: Mark } // at: index into the file's lines (null gaps included)
export type Segment = { from: number; to: number; marks: Mark[] } // lines from..to, inclusive

// Quoted code is compared without any whitespace: Claude may copy a line with other spacing
const bare = (text: string) => text.replace(/\s+/g, '')
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const word = (name: string) => new RegExp('(^|[^\\w$])' + escapeRe(name) + '($|[^\\w$])')
const DEF = 'class|def|function|func|fn|interface|type|struct|enum|trait|impl|module|object|record|const|let|var|async\\s+def|async\\s+function|export\\s+(?:default\\s+)?(?:async\\s+)?function|export\\s+(?:const|class|interface|type|enum)'

// The order lines are searched in: new lines first, then the ones around them, then removed ones.
function order(lines: (Line | null)[]): number[] {
  const rank = (l: Line) => (l.kind === '+' ? 0 : l.kind === ' ' ? 1 : 2)
  return lines.map((l, i) => i).filter((i) => lines[i]).sort((a, b) => rank(lines[a]!) - rank(lines[b]!) || a - b)
}

function find(lines: (Line | null)[], used: Set<number>, test: (text: string) => boolean): number | null {
  for (const i of order(lines)) if (!used.has(i) && test(lines[i]!.text)) return i
  return null
}

// The line that defines a symbol: "def area", "class Rectangle", "function largest", "area = (".
function definition(lines: (Line | null)[], used: Set<number>, name: string): number | null {
  const last = name.split(/[.:#]+/).pop() || name
  const defines = new RegExp('(^|\\s)(?:' + DEF + ')\\s+\\*?' + escapeRe(last) + '\\b|(^|\\s)' + escapeRe(last) + '\\s*(?::\\s*[^=]+)?=\\s*(?:async\\s*)?(?:function|\\(|[A-Za-z_$][\\w$]*\\s*=>|lambda)')
  return find(lines, used, (t) => defines.test(t)) ?? find(lines, used, (t) => word(last).test(t))
}

export const markKey = (m: Mark) => m.note + ':' + m.kind + ':' + m.item

// Places the notes' symbols, borrowed names, parameters and line comments on one file's lines.
// `taken` holds the marks placed in other files already: each mark goes in one place only.
export function place(path: string, lines: (Line | null)[], notes: { id: string; note: Note }[], taken = new Set<string>()): Placed[] {
  const used = new Set<number>()
  const placed: Placed[] = []
  const put = (mark: Mark, at: number | null) => {
    if (taken.has(markKey(mark)) || at === null) return
    used.add(at)
    taken.add(markKey(mark))
    placed.push({ at, mark })
  }
  for (const { id, note } of notes) {
    const here = note.files.length === 0 || note.files.some((f) => sameFile(f, path) || sameFile(path, f))
    note.symbols.forEach((s, item) => {
      if (s.file ? !(sameFile(s.file, path) || sameFile(path, s.file)) : !here) return
      put({ kind: 'symbol', note: id, item }, definition(lines, used, s.name))
    })
    if (!here) continue
    note.uses.forEach((u, item) => {
      // a borrowed name is explained where it is used, never in the file it comes from
      if (u.from && (sameFile(u.from, path) || sameFile(path, u.from))) return
      put({ kind: 'use', note: id, item }, find(lines, used, (t) => word(u.name).test(t)))
    })
    note.parameters.forEach((p, item) => {
      const test = /^[A-Za-z_$][\w$]*$/.test(p.name) ? (t: string) => word(p.name).test(t) : (t: string) => bare(t).includes(bare(p.name))
      put({ kind: 'param', note: id, item }, find(lines, used, test))
    })
    note.lines.forEach((x, item) => {
      const anchor = bare(x.anchor)
      put({ kind: 'line', note: id, item }, anchor ? find(lines, used, (t) => bare(t).includes(anchor)) : null)
    })
  }
  return placed.sort((a, b) => a.at - b.at)
}

// Every mark a set of notes could place, in order: what is left unplaced is shown with its note.
export function marks(notes: { id: string; note: Note }[]): Mark[] {
  const out: Mark[] = []
  for (const { id, note } of notes) {
    note.symbols.forEach((_, item) => out.push({ kind: 'symbol', note: id, item }))
    note.uses.forEach((_, item) => out.push({ kind: 'use', note: id, item }))
    note.parameters.forEach((_, item) => out.push({ kind: 'param', note: id, item }))
    note.lines.forEach((_, item) => out.push({ kind: 'line', note: id, item }))
  }
  return out
}

// The file cut into rows: each row starts at a placed mark and runs to the next one; marks a line
// or two apart share a row, so short methods do not each get a row of their own.
export function segments(total: number, placed: Placed[], join = 2): Segment[] {
  if (!total) return []
  const rows: Segment[] = []
  if (!placed.length || placed[0].at > 0) rows.push({ from: 0, to: (placed[0]?.at ?? total) - 1, marks: [] })
  for (const p of placed) {
    const last = rows[rows.length - 1]
    if (last && last.marks.length && p.at - last.from <= join) last.marks.push(p.mark)
    else rows.push({ from: p.at, to: total - 1, marks: [p.mark] })
  }
  for (let i = 0; i < rows.length - 1; i++) rows[i].to = Math.max(rows[i].from, rows[i + 1].from - 1)
  rows[rows.length - 1].to = total - 1
  return rows.filter((r) => r.to >= r.from)
}
