// The review page as data, built from one session's log. Plain module: records in, a page out.
//
// A session is split into tasks: each recap Claude writes on the main loop closes one, and the
// work after the last recap is a task of its own, read in a fixed order instead of Claude's.
// Edits stay with the note they were paired with when they were made; a file changed outside
// the edit tools goes with the latest note that names it, when one does.

import type { LogRecord, NoteRecord, EditRecord, OutsideEntry } from '../log.ts'
import { sameFile, type Recap, type SymbolKind } from '../note.ts'

export type Role = 'data' | 'logic' | 'ui' | 'tests' | 'config' | 'docs' | 'other'
export const ROLES: Role[] = ['data', 'logic', 'ui', 'tests', 'config', 'docs', 'other']

export type EditView = EditRecord & { trimmed: boolean }
export type OutsideView = OutsideEntry & { trimmed: boolean }
export type NoteView = { record: NoteRecord; edits: EditView[]; outside: OutsideView[] }
export type Item = { kind: 'note'; note: NoteView } | { kind: 'switch'; on: boolean; ts: number }
export type Reading = { file: string; why: string | null; role: Role }

export type Task = {
  n: number
  recap: Recap | null
  agentRecaps: { agent: string; recap: Recap }[]
  items: Item[]
  unexplained: EditView[]
  files: string[] // every file the task changed, in the order it first changed
  reading: Reading[] // Claude's reading order, or the fixed one
  fixed: boolean // true when the reading order is the fixed one
  unlisted: string[] // files the task changed that Claude's reading order leaves out
  dropped: boolean // left off the page to keep it small
}

export type IndexedSymbol = { name: string; kind: SymbolKind; file: string | null; why_exists: string; note: number }

export type Page = {
  session: string
  root: string
  project: string
  started: number | null
  version: string
  git: boolean
  tasks: Task[]
  outside: OutsideView[] // changed outside the edit tools, with no note naming them
  outsideMore: number
  symbols: IndexedSymbol[]
  agents: string[]
  counts: { notes: number; edits: number; unexplained: number; files: number; outside: number }
}

// The part a file plays, from its path alone: the fixed reading order goes data, logic,
// interface, tests, configuration, documentation, then the rest.
export function roleOf(path: string): Role {
  const p = path.toLowerCase().replace(/\\/g, '/')
  const name = p.split('/').pop() ?? p
  if (/(^|\/)(tests?|specs?|__tests__|e2e)\//.test(p) || /^test_|_test\.|\.test\.|\.spec\.|_spec\./.test(name)) return 'tests'
  if (/\.(md|mdx|rst|adoc)$/.test(name) || /(^|\/)docs?\//.test(p) || /^(readme|changelog|license|contributing)\b/.test(name)) return 'docs'
  if (/\.(json|ya?ml|toml|ini|cfg|conf|lock)$/.test(name) || /^(dockerfile|makefile|procfile|\.gitignore|\.editorconfig|\.env\.example)$/.test(name) ||
    /\.config\.[a-z]+$/.test(name) || /(^|\/)\.github\//.test(p) || /^requirements.*\.txt$/.test(name)) return 'config'
  if (/(^|\/)(models?|schemas?|entities|migrations|types|db)\//.test(p) || /\.(sql|proto|prisma|graphql|gql|avsc)$/.test(name) ||
    /\.d\.ts$/.test(name) || /^(models?|schemas?|types|entities)\.[a-z]+$/.test(name)) return 'data'
  if (/(^|\/)(components?|views?|pages|templates|ui|screens|layouts|styles|static|public)\//.test(p) ||
    /\.(css|scss|sass|less|html?|vue|svelte|jsx|tsx|astro|erb|hbs|njk|jinja2?)$/.test(name)) return 'ui'
  if (/\.(py|js|mjs|cjs|ts|go|rs|rb|java|kt|swift|c|cc|cpp|h|hpp|cs|php|scala|ex|exs|clj|lua|sh|ps1|r|jl|dart|m|mm|zig)$/.test(name)) return 'logic'
  return 'other'
}

// The fixed reading order: by role, then by when each file first changed.
export function fixedOrder(files: string[]): Reading[] {
  return files
    .map((file, i) => ({ file, i, role: roleOf(file) }))
    .sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.i - b.i)
    .map(({ file, role }) => ({ file, why: null, role }))
}

const named = (files: string[], path: string) => files.some((f) => sameFile(f, path) || sameFile(path, f))

function newTask(n: number): Task {
  return { n, recap: null, agentRecaps: [], items: [], unexplained: [], files: [], reading: [], fixed: false, unlisted: [], dropped: false }
}

export function build(records: LogRecord[]): Page {
  const page: Page = {
    session: '', root: '', project: '', started: null, version: '', git: false,
    tasks: [], outside: [], outsideMore: 0, symbols: [], agents: [],
    counts: { notes: 0, edits: 0, unexplained: 0, files: 0, outside: 0 },
  }
  const notes = new Map<string, { view: NoteView; task: Task }>()
  const order: NoteView[] = []
  const agents = new Set<string>()
  // the last outside list of each baseline: each list is complete for its baseline
  const lists: { entries: OutsideEntry[]; more: number }[] = []
  let task = newTask(1)
  const touch = (t: Task, path: string) => { if (!t.files.includes(path)) t.files.push(path) }

  for (const r of records) {
    if (r.agent) agents.add(r.agent)
    if (r.kind === 'session') {
      page.session = r.session
      page.root = r.root
      page.project = r.root.replace(/\/+$/, '').split('/').pop() || r.root
      page.started = page.started ?? r.ts
      page.version = r.version
    } else if (r.kind === 'baseline') {
      page.git = r.git
      lists.push({ entries: [], more: 0 })
    } else if (r.kind === 'outside') {
      if (!lists.length) lists.push({ entries: [], more: 0 })
      lists[lists.length - 1] = { entries: r.entries, more: r.more }
    } else if (r.kind === 'switch') {
      task.items.push({ kind: 'switch', on: r.on, ts: r.ts })
    } else if (r.kind === 'note') {
      const view: NoteView = { record: r, edits: [], outside: [] }
      notes.set(r.id, { view, task })
      order.push(view)
      task.items.push({ kind: 'note', note: view })
      page.counts.notes++
    } else if (r.kind === 'edit') {
      if (r.status !== 'ok') continue
      const edit: EditView = { ...r, trimmed: false }
      const owner = r.note ? notes.get(r.note) : undefined
      if (owner) {
        owner.view.edits.push(edit)
        touch(owner.task, r.path)
      } else {
        task.unexplained.push(edit)
        touch(task, r.path)
        page.counts.unexplained++
      }
      page.counts.edits++
    } else if (r.kind === 'recap') {
      if (r.agent) task.agentRecaps.push({ agent: r.agent, recap: r.recap })
      else {
        task.recap = r.recap
        page.tasks.push(task)
        task = newTask(task.n + 1)
      }
    }
  }
  if (task.items.length || task.unexplained.length || task.agentRecaps.length || !page.tasks.length) page.tasks.push(task)

  // files changed outside the edit tools: the latest list of each baseline, later lists first
  const seen = new Set<string>()
  for (const list of [...lists].reverse()) {
    for (const entry of list.entries) {
      if (seen.has(entry.path)) continue
      seen.add(entry.path)
      const view: OutsideView = { ...entry, trimmed: false }
      const owner = [...order].reverse().find((n) => named(n.record.note.files, entry.path))
      if (owner) {
        owner.outside.push(view)
        touch(notes.get(owner.record.id)!.task, entry.path)
      } else page.outside.push(view)
    }
    page.outsideMore += list.more
  }
  page.outside.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  page.counts.outside = seen.size + page.outsideMore

  for (const t of page.tasks) {
    const given = t.recap ? t.recap.reading_order : []
    if (given.length) {
      t.reading = given.map((x) => ({ file: x.file, why: x.why || null, role: roleOf(x.file) }))
      t.unlisted = t.files.filter((f) => !named(given.map((x) => x.file), f))
    } else {
      t.reading = fixedOrder(t.files)
      t.fixed = t.files.length > 0
    }
  }

  const files = new Set<string>(seen)
  for (const t of page.tasks) for (const f of t.files) files.add(f)
  page.counts.files = files.size
  page.agents = [...agents]
  page.symbols = order
    .flatMap((n) => n.record.note.symbols.map((s) => ({ name: s.name, kind: s.kind, file: s.file, why_exists: s.why_exists, note: n.record.n })))
    .sort((a, b) => (a.file ?? '').localeCompare(b.file ?? '') || a.name.localeCompare(b.name))
  return page
}

// Every diff on the page, for trimming the largest first when the page would be too big.
export function diffs(page: Page): { diff: string | null; trimmed: boolean }[] {
  const out: { diff: string | null; trimmed: boolean }[] = []
  for (const t of page.tasks) {
    for (const item of t.items) if (item.kind === 'note') out.push(...item.note.edits, ...item.note.outside)
    out.push(...t.unexplained)
  }
  out.push(...page.outside)
  return out.filter((x) => x.diff)
}

// A line that tells sessions apart on the list: the start of Claude's first summary, else the
// title of its first note.
export function titleOf(page: Page): string {
  const recap = page.tasks.find((t) => t.recap)?.recap
  let first = ''
  for (const t of page.tasks) for (const i of t.items) if (!first && i.kind === 'note') first = i.note.record.note.title
  const text = (recap ? recap.overview : first).trim().split(/(?<=[.!?])\s/)[0] ?? ''
  return text.length > 140 ? text.slice(0, 137) + '...' : text
}
