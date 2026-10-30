// The review as data: commits one by one, each with the notes that explain it and its files' code
// with every explanation placed on its line; then what is not committed yet, and code explained
// after the fact. Built from the logs and from what git says. Plain module.

import type { LogRecord, NoteRecord, EditRecord, CommitRecord, RecapRecord } from '../log.ts'
import type { Recap } from '../note.ts'
import { sameFile } from '../note.ts'
import { parseHunks, flat, current, type FilePatch, type Line } from './patch.ts'
import { place, segments, marks, markKey, type Mark, type Segment } from './anchor.ts'
import { roleOf, type Role } from './roles.ts'
import { LEVELS, level as parseLevel, type Level } from '../config.ts'

export type GitCommit = { sha: string; parents: string[]; author: string; time: number; subject: string; body: string; files: FileData[] }
// A file's patch with what was hidden on the way: secret values, the content of a secret file, or
// context cut short because the file was long.
export type FileData = { patch: FilePatch; redactions: number; hidden: 'sensitive' | 'binary' | null; cut: boolean }

export type Source = {
  records: LogRecord[]
  commits: GitCommit[]
  more: number // commits in the range that are left out
  pending: FileData[] | null // the working tree against HEAD; null outside git
  explained: { path: string; text: string }[] // files as they stand, for notes that explain existing code
  git: boolean
  scope: 'session' | 'range' | 'all'
  range: string | null
  pr?: { number: number; title: string } | null // the pull request a range stands for
  project: string
}

export type NoteRef = { id: string; n: number; record: NoteRecord }
export type Tag = 'added' | 'deleted' | 'renamed' | 'unexplained' | 'outside' | 'sensitive' | 'binary' | 'cut' | 'redacted'
export type FileView = { data: FileData; role: Role; tags: Tag[]; lines: (Line | null)[]; rows: Segment[]; pins: Map<string, number>; pinAt: Map<number, number[]>; anchor: string; tooBig: boolean }
export type Group = {
  kind: 'commit' | 'pending' | 'session' | 'explained'
  id: string
  sha: string | null
  subject: string | null
  body: string | null
  author: string | null
  time: number | null
  index: number
  notes: NoteRef[]
  files: FileView[]
  missed: Mark[]
}
export type IndexEntry = { name: string; kind: string; file: string | null; why: string; href: string | null; group: string }
export type Review = {
  project: string
  scope: Source['scope']
  range: string | null
  pr: { number: number; title: string } | null
  git: boolean
  started: number | null
  groups: Group[] // commits, oldest first, then what is not committed
  explained: Group | null
  more: number
  recaps: Recap[]
  checks: string[]
  index: IndexEntry[]
  links: Map<string, { href: string; title: string }> // a defined name to its place, for links from other lines
  counts: { commits: number; files: number; notes: number; unexplained: number }
  written: Level | null // the most detailed level the notes on the page were written at, when the logs say
}

export { markKey }

// Short names and everyday words are never linked, so code does not turn into a sea of links.
const NO_LINK = new Set(['main', 'init', 'self', 'data', 'value', 'values', 'result', 'name', 'type', 'list', 'item', 'items', 'test', 'run', 'get', 'set', 'add', 'new', 'path', 'file', 'text', 'args', 'config', 'index', 'model', 'train'])
// The name other lines link by: the last part of a dotted name, or null when it is too common
export function linkName(name: string): string | null {
  const short = name.split(/[.:#]+/).pop() || name
  return short.length >= 4 && !NO_LINK.has(short.toLowerCase()) ? short : null
}

export function build(src: Source): Review {
  const notes = new Map<string, NoteRef>()
  const edits = new Map<string, EditRecord>()
  const commits: CommitRecord[] = []
  const recaps: RecapRecord[] = []
  const outside = new Set<string>()
  const levelOf = new Map<string, Level>() // each session's level, from its first record
  let started: number | null = null
  let n = 0
  for (const r of src.records) {
    if (r.kind === 'session' && started === null) started = r.ts
    if (r.kind === 'session' && !levelOf.has(r.session)) {
      const l = parseLevel(r.level ?? r.detail)
      if (l) levelOf.set(r.session, l)
    }
    if (r.kind === 'note') notes.set(r.id, { id: r.id, n: ++n, record: r })
    if (r.kind === 'edit' && r.status === 'ok') edits.set(r.id, r)
    if (r.kind === 'commit') commits.push(r)
    if (r.kind === 'recap' && !r.agent) recaps.push(r)
    if (r.kind === 'outside') for (const e of r.entries) outside.add(e.path)
  }
  const byNote = new Map<string, EditRecord[]>()
  for (const e of edits.values()) if (e.note) byNote.set(e.note, [...(byNote.get(e.note) ?? []), e])

  // which record goes with which git commit: by hash, else by subject for amended or rebased commits
  const shas = new Set(src.commits.map((c) => c.sha))
  const recordOf = new Map<string, CommitRecord>()
  for (const r of commits) if (shas.has(r.sha)) recordOf.set(r.sha, r)
  const orphans = commits.filter((r) => !shas.has(r.sha))
  for (const c of src.commits) {
    if (recordOf.has(c.sha)) continue
    const i = orphans.findIndex((r) => r.subject === c.subject)
    if (i >= 0) recordOf.set(c.sha, orphans.splice(i, 1)[0])
  }
  const inCommit = new Set<string>() // notes and edits some commit took in
  for (const r of commits) {
    r.edits.forEach((id) => inCommit.add(id))
    r.notes.forEach((id) => inCommit.add(id))
  }

  const ordered = (ids: Iterable<string>) => [...new Set(ids)].map((id) => notes.get(id)).filter((x): x is NoteRef => !!x).sort((a, b) => a.n - b.n)
  const groups: Group[] = []
  src.commits.forEach((c, i) => {
    const record = recordOf.get(c.sha)
    const ids: string[] = []
    if (record) {
      for (const id of record.edits) { const e = edits.get(id); if (e?.note) ids.push(e.note) }
      ids.push(...record.notes)
    }
    for (const ref of notes.values()) {
      const at = ref.record.note.commit
      if (at && (c.sha.startsWith(at) || at.startsWith(c.sha))) ids.push(ref.id)
    }
    const editedHere = new Set((record?.edits ?? []).map((id) => edits.get(id)?.path).filter(Boolean) as string[])
    groups.push(group('commit', 'c-' + c.sha.slice(0, 12), c, i + 1, ordered(ids), c.files, outside, editedHere))
  })
  if (src.pending && src.pending.length) {
    const paths = src.pending.map((f) => f.patch.path)
    const touches = (files: string[]) => files.some((f) => paths.some((p) => sameFile(f, p) || sameFile(p, f)))
    const ids: string[] = []
    for (const e of edits.values()) if (!inCommit.has(e.id) && e.note && paths.includes(e.path)) ids.push(e.note)
    for (const ref of notes.values()) {
      const r = ref.record
      if (r.source === 'live' && !inCommit.has(r.id) && !byNote.has(r.id) && touches(r.note.files)) ids.push(r.id)
    }
    const editedHere = new Set([...edits.values()].filter((e) => !inCommit.has(e.id)).map((e) => e.path))
    groups.push(group('pending', 'pending', null, 0, ordered(ids), src.pending, outside, editedHere))
  }
  if (!src.git) {
    // no git: the session's own diffs, file by file in the order they were made
    const files: FileData[] = [...edits.values()].filter((e) => e.diff || e.skipped).map((e) => ({
      patch: { path: e.path, oldPath: null, status: e.created ? 'added' : 'modified', binary: e.skipped === 'binary', hunks: e.diff ? parseHunks(e.diff) : [], added: e.added, removed: e.removed },
      redactions: e.redactions, hidden: e.skipped === 'sensitive' ? 'sensitive' : e.skipped === 'binary' ? 'binary' : null, cut: e.truncated,
    }))
    const ids = [...notes.values()].filter((x) => x.record.source === 'live').map((x) => x.id)
    groups.push(group('session', 'session', null, 0, ordered(ids), files, outside, new Set(files.map((f) => f.patch.path))))
  }

  // explanations of code as it stands, not tied to a commit or an edit
  let explained: Group | null = null
  const loose = [...notes.values()].filter((x) => x.record.source === 'reconstructed' && !x.record.note.commit)
  if (loose.length && src.explained.length) {
    const files: FileData[] = src.explained.map((f) => ({ patch: current(f.path, f.text, [], Infinity), redactions: 0, hidden: null, cut: false }))
    explained = group('explained', 'explained', null, 0, loose, files, outside, new Set())
    // a long file keeps only the lines around its explanations
    explained.files = explained.files.map((fv) => {
      const text = src.explained.find((f) => f.path === fv.data.patch.path)!.text
      if (text.split('\n').length <= 400) return fv
      const focus = fv.rows.flatMap((r) => (r.marks.length ? [fv.lines[r.from]?.new ?? 0] : [])).map((x) => x - 1)
      return view({ patch: current(fv.data.patch.path, text, focus), redactions: 0, hidden: null, cut: true }, loose, outside, new Set(), fv.anchor, new Set())
    })
  }

  // the names this review defines, for the index and for links from other lines
  const index: IndexEntry[] = []
  const links = new Map<string, { href: string; title: string }>()
  for (const g of [...groups, ...(explained ? [explained] : [])]) {
    for (const ref of g.notes) {
      ref.record.note.symbols.forEach((s, item) => {
        const key = markKey({ kind: 'symbol', note: ref.id, item })
        const fv = g.files.find((f) => f.pins.has(key))
        const href = fv ? '#' + fv.anchor + '-' + fv.pins.get(key) : null
        index.push({ name: s.name, kind: s.kind, file: s.file, why: s.why_exists, href, group: g.id })
        const short = linkName(s.name)
        if (href && short && !links.has(short)) links.set(short, { href, title: s.why_exists })
      })
    }
  }

  const all = [...groups, ...(explained ? [explained] : [])]
  const seen = new Set<string>()
  for (const g of all) for (const f of g.files) seen.add(f.data.patch.path)
  const used = new Set(all.flatMap((g) => g.notes.map((x) => x.id)))
  const sessions = new Set([...used].map((id) => notes.get(id)!.record.session))
  const relevant = recaps.filter((r) => sessions.has(r.session) || src.scope === 'session')
  const levels = [...sessions].map((s) => levelOf.get(s)).filter((l): l is Level => !!l)
  return {
    project: src.project, scope: src.scope, range: src.range, pr: src.pr ?? null, git: src.git, started, groups, explained, more: src.more,
    recaps: relevant.map((r) => r.recap),
    checks: [...new Set(relevant.flatMap((r) => r.recap.check_by_hand))],
    index, links,
    counts: { commits: src.commits.length, files: seen.size, notes: used.size, unexplained: all.reduce((k, g) => k + g.files.filter((f) => f.tags.includes('unexplained')).length, 0) },
    written: levels.length ? LEVELS[Math.min(...levels.map((l) => LEVELS.indexOf(l)))] : null,
  }

  function group(kind: Group['kind'], id: string, c: GitCommit | null, index: number, refs: NoteRef[], files: FileData[], outsidePaths: Set<string>, edited: Set<string>): Group {
    const taken = new Set<string>()
    const views = files.map((f, i) => view(f, refs, outsidePaths, edited, id + '-f' + i, taken))
    const left = marks(refs.map((x) => ({ id: x.id, note: x.record.note }))).filter((m) => !taken.has(markKey(m)))
    return {
      kind, id, sha: c?.sha ?? null, subject: c?.subject ?? null, body: c?.body ?? null, author: c?.author ?? null, time: c?.time ?? null,
      index, notes: refs, files: views, missed: left,
    }
  }
}

function view(data: FileData, refs: NoteRef[], outside: Set<string>, edited: Set<string>, anchor: string, taken: Set<string>): FileView {
  const p = data.patch
  const lines = data.hidden ? [] : flat(p)
  const covering = refs.filter((x) => x.record.note.files.some((f) => sameFile(f, p.path) || sameFile(p.path, f)) || x.record.note.symbols.some((s) => s.file && (sameFile(s.file, p.path) || sameFile(p.path, s.file))))
  const placed = place(p.path, lines, refs.map((x) => ({ id: x.id, note: x.record.note })), taken)
  const pins = new Map<string, number>()
  const pinAt = new Map<number, number[]>()
  placed.forEach((x, i) => {
    pins.set(markKey(x.mark), i + 1)
    pinAt.set(x.at, [...(pinAt.get(x.at) ?? []), i + 1])
  })
  const tags: Tag[] = []
  if (p.status === 'added') tags.push('added')
  if (p.status === 'deleted') tags.push('deleted')
  if (p.status === 'renamed') tags.push('renamed')
  if (data.hidden) tags.push(data.hidden)
  if (data.redactions) tags.push('redacted')
  if (data.cut) tags.push('cut')
  if (outside.has(p.path) && !edited.has(p.path)) tags.push('outside')
  if (!covering.length && !placed.length) tags.push('unexplained')
  return { data, role: roleOf(p.path), tags, lines, rows: segments(lines.length, placed), pins, pinAt, anchor, tooBig: false }
}
