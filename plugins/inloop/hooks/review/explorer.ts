// The review as a file explorer: a tree of the files the review covers, and for each file its code
// as it stands with the explanations placed on its lines, the commits that wrote each block of its
// lines ("why"), and its changes commit by commit. Plain module: values in, values out.

import { sameFile } from '../note.ts'
import { current, flat, type Line } from './patch.ts'
import { place, segments, markKey, type Mark, type Placed, type Segment } from './anchor.ts'
import type { Review, Group, FileView, NoteRef } from './review.ts'

// blame's hash for lines that are not committed yet
export const UNCOMMITTED = '0000000000000000000000000000000000000000'

// One file as it stands at the end of the review, with who wrote which line
export type FileState = {
  path: string
  text: string | null // null for a deleted file, a secret file, a binary, one too large to show, or one past the page's count
  hidden: 'sensitive' | 'binary' | 'deleted' | 'too-large' | 'not-shown' | null
  blame: string[] | null // the commit that last changed each line, by line; null without git
}
// What blame says about a commit, for commits the review itself does not cover
export type BlameInfo = { summary: string; time: number }

export type Status = 'added' | 'modified' | 'deleted' | 'renamed'
export type Node = {
  name: string
  path: string // '' for the root
  kind: 'dir' | 'file'
  children: Node[]
  status: Status | null
  notes: number // notes that explain this file, or every file below this folder
  last: { title: string; time: number | null; href: string; order: number } | null // the latest change in the review
}
// A run of lines last changed by one commit, with the note that explains that commit
export type BlameGroup = { from: number; to: number; sha: string; title: string; tldr: string; time: number | null; href: string | null; mine: boolean }
// An explanation that had a line when its commit was written, on no line of the code as it stands:
// a later commit rewrote that line. `href` is where its commit shows it.
export type Moved = { mark: Mark; ref: NoteRef; group: Group; href: string }
export type FilePage = {
  path: string
  id: string // the code view's anchor
  state: FileState
  lines: (Line | null)[] // the file as it stands, numbered
  rows: Segment[] // the code cut into rows at its explanations
  pins: Map<string, number> // markKey to pin number
  pinAt: Map<number, number[]> // line index to pins
  refs: Map<string, NoteRef> // the notes placed on this file
  moved: Moved[]
  why: BlameGroup[]
  changes: { group: Group; file: FileView }[] // the file's diffs, commit by commit
  tooBig: boolean
}
export type Explorer = { root: Node; files: FilePage[]; byPath: Map<string, FilePage> }

// An anchor for a path that stays the same between runs: letters, digits and dashes. Anchors
// inside a view add "_" and a suffix, which no slug contains.
export function slug(path: string): string {
  let h = 0
  for (const c of path) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return path.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) + '-' + h.toString(36)
}
export const fileId = (path: string) => 'f-' + slug(path)
export const dirId = (path: string) => (path ? 'd-' + slug(path) : 'd-root')

// Parses `git blame --porcelain`: the commit of each line, and each commit's summary and time.
// Every line starts with its commit's header; the summary and time come once per commit.
export function parseBlame(text: string): { lines: string[]; info: Map<string, BlameInfo> } {
  const lines: string[] = []
  const info = new Map<string, BlameInfo>()
  let sha = ''
  let at = 0
  for (const raw of text.split('\n')) {
    if (raw.startsWith('\t')) {
      if (sha && at > 0) lines[at - 1] = sha
      continue
    }
    const head = /^([0-9a-f]{40}) \d+ (\d+)/.exec(raw)
    if (head) {
      sha = head[1]
      at = Number(head[2])
      if (!info.has(sha)) info.set(sha, { summary: '', time: 0 })
      continue
    }
    if (raw.startsWith('summary ')) info.get(sha)!.summary = raw.slice(8)
    else if (raw.startsWith('committer-time ')) info.get(sha)!.time = Number(raw.slice(15)) * 1000
  }
  return { lines, info }
}

// The commit a group stands for in blame's terms
const shaOf = (g: Group): string | null => (g.kind === 'commit' ? g.sha : g.kind === 'pending' ? UNCOMMITTED : null)
// Whether a note explains this file: it names the file, or a class or function in it
export const covers = (ref: NoteRef, path: string) => ref.record.note.files.some((f) => sameFile(f, path) || sameFile(path, f)) ||
  ref.record.note.symbols.some((s) => !!s.file && (sameFile(s.file, path) || sameFile(path, s.file)))

export function explore(review: Review, states: FileState[], blameInfo: Map<string, BlameInfo>): Explorer {
  const groups = [...review.groups, ...(review.explained ? [review.explained] : [])]
  // which notes explain which commit (or what is not committed), and where each commit stands in
  // the review: an explanation may sit on a line its own commit wrote or on an older line, never
  // on a line a later commit rewrote
  const owners = new Map<string | null, NoteRef[]>()
  const order = new Map<string, number>()
  groups.forEach((g, i) => {
    const sha = shaOf(g)
    owners.set(sha, [...(owners.get(sha) ?? []), ...g.notes])
    if (sha) order.set(sha, i)
  })
  const groupOfSha = new Map(groups.filter((g) => g.kind === 'commit').map((g) => [g.sha!, g]))
  const taken = new Set<string>() // each explanation in one place, across files

  const files: FilePage[] = states.map((state) => {
    const page: FilePage = {
      path: state.path, id: fileId(state.path), state, lines: [], rows: [], pins: new Map(), pinAt: new Map(), refs: new Map(),
      moved: [], why: [], changes: [], tooBig: false,
    }
    for (const g of groups) for (const f of g.files) if (f.data.patch.path === state.path) page.changes.push({ group: g, file: f })
    if (state.text === null) return page
    page.lines = flat(current(state.path, state.text, [], Infinity))
    const total = page.lines.length
    const placed: Placed[] = []
    for (const [sha, refs] of owners) {
      const covering = refs.filter((r) => covers(r, state.path))
      if (!covering.length) continue
      let own = page.lines
      if (state.blame && sha !== null) {
        // the commit's own lines are searched first (as new lines are in a diff), older ones next
        const mine = order.get(sha) ?? -1
        own = page.lines.map((l, i) => {
          if (!l) return l
          const by = state.blame![i]
          if (by === sha) return { ...l, kind: '+' as const }
          const at = order.get(by)
          return at !== undefined && at > mine ? null : l
        })
      }
      placed.push(...place(state.path, own, covering.map((r) => ({ id: r.id, note: r.record.note })), taken))
      covering.forEach((r) => page.refs.set(r.id, r))
    }
    placed.sort((a, b) => a.at - b.at)
    placed.forEach((p, i) => {
      page.pins.set(markKey(p.mark), i + 1)
      page.pinAt.set(p.at, [...(page.pinAt.get(p.at) ?? []), i + 1])
    })
    page.rows = segments(total, placed)
    // the why view: runs of lines written by the same commit
    if (state.blame) {
      let start = 0
      for (let i = 1; i <= total; i++) {
        if (i < total && state.blame[i] === state.blame[start]) continue
        const sha = state.blame[start] ?? ''
        const g = groupOfSha.get(sha)
        const refs = owners.get(sha) ?? []
        const note = (refs.find((r) => covers(r, state.path)) ?? refs[0])?.record.note
        const pending = sha === UNCOMMITTED
        page.why.push({
          from: start, to: i - 1, sha, title: pending ? '' : note?.title || g?.subject || blameInfo.get(sha)?.summary || '', tldr: note?.tldr ?? '',
          time: g?.time ?? blameInfo.get(sha)?.time ?? null,
          href: g ? '#' + g.id : pending && groups.some((x) => x.kind === 'pending') ? '#pending' : null, mine: !!g || pending,
        })
        start = i
      }
    }
    return page
  })
  const byPath = new Map(files.map((f) => [f.path, f]))

  // explanations that found a line in their commit's diff but none in the code as it stands
  const onPage = new Set(files.flatMap((p) => [...p.pins.keys()]))
  const seen = new Set<string>()
  for (const g of groups) {
    const refOf = new Map(g.notes.map((r) => [r.id, r]))
    for (const f of g.files) {
      const page = byPath.get(f.data.patch.path)
      if (!page || page.state.text === null) continue
      for (const [key, pin] of f.pins) {
        if (onPage.has(key) || seen.has(key)) continue
        const [kind, item] = key.split(':').slice(-2)
        const note = key.slice(0, key.length - kind.length - item.length - 2)
        const ref = refOf.get(note)
        if (!ref) continue
        seen.add(key)
        page.moved.push({ mark: { kind: kind as Mark['kind'], note, item: Number(item) }, ref, group: g, href: '#' + f.anchor + '-' + pin })
      }
    }
  }

  // the tree of folders down to the files
  const root: Node = { name: '', path: '', kind: 'dir', children: [], status: null, notes: 0, last: null }
  // the latest change by its place in the review: what is not committed comes after every commit
  const latest = (a: Node['last'], b: Node['last']) => (!a ? b : !b ? a : b.order >= a.order ? b : a)
  for (const page of files) {
    const parts = page.path.split('/')
    let dir = root
    for (let i = 0; i < parts.length - 1; i++) {
      const path = parts.slice(0, i + 1).join('/')
      let next = dir.children.find((c) => c.kind === 'dir' && c.path === path)
      if (!next) {
        next = { name: parts[i], path, kind: 'dir', children: [], status: null, notes: 0, last: null }
        dir.children.push(next)
      }
      dir = next
    }
    // code explained as it stands is not a change: it gives the file no status, and is its last
    // change only when nothing changed it
    const changed = page.changes.filter((c) => c.group.kind !== 'explained')
    const lastChange = changed[changed.length - 1] ?? page.changes[page.changes.length - 1]
    const status = page.state.hidden === 'deleted' ? 'deleted' : changed[changed.length - 1]?.file.data.patch.status ?? null
    const notes = new Set([...page.refs.keys(), ...page.changes.flatMap((c) => c.group.notes.filter((r) => covers(r, page.path)).map((r) => r.id))])
    const last = lastChange ? {
      title: lastChange.group.notes.find((r) => covers(r, page.path))?.record.note.title || lastChange.group.subject || '', time: lastChange.group.time,
      href: '#' + lastChange.group.id, order: lastChange.group.kind === 'explained' ? -1 : groups.indexOf(lastChange.group),
    } : null
    dir.children.push({ name: parts[parts.length - 1], path: page.path, kind: 'file', children: [], status, notes: notes.size, last })
  }
  const roll = (n: Node): Node => {
    if (n.kind === 'file') return n
    n.children.forEach(roll)
    n.children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1))
    n.notes = n.children.reduce((k, c) => k + c.notes, 0)
    n.last = n.children.reduce((a: Node['last'], c) => latest(a, c.last), null)
    return n
  }
  roll(root)
  return { root, files, byPath }
}

// Every folder, the root first, for the folder views
export function folders(root: Node): Node[] {
  const out: Node[] = []
  const walk = (n: Node) => {
    if (n.kind !== 'dir') return
    out.push(n)
    n.children.forEach(walk)
  }
  walk(root)
  return out
}
