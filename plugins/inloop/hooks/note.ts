// What Claude sends to the note and recap tools, cleaned up, and which note each edit belongs to.
// Plain module: no mods API calls here.

export type Parameter = { name: string; meaning: string; default: string | null; why_this_value: string | null; doc_url: string | null }
export type SymbolKind = 'class' | 'function' | 'method' | 'endpoint' | 'module' | 'type' | 'other'
export type Symbol = { name: string; kind: SymbolKind; file: string | null; why_exists: string; why_this_shape: string | null; called_by: string | null }
// Something the change brings in from another file or a library, and why
export type Use = { name: string; from: string; why: string; doc_url: string | null }
// A comment on one line of the new code, found again by a piece of that line's text; for a line the
// change deletes, the text is quoted from the code as it was
export type LineNote = { anchor: string; says: string }
// A technical term kept as developers say it, with what it means
export type Term = { term: string; means: string }

export type Note = {
  title: string
  tldr: string
  files: string[]
  what: string
  why: string
  basis: 'verified' | 'judgment' | null
  uses: Use[]
  alternatives: string[]
  parameters: Parameter[]
  symbols: Symbol[]
  lines: LineNote[]
  removed: LineNote[] // why lines the change deletes go
  terms: Term[]
  impact: string[]
  risks: string[]
  commit: string | null // the commit a reconstructed note explains
}

export type Recap = {
  overview: string
  reading_order: { file: string; why: string }[]
  groups: { role: string; files: string[] }[]
  check_by_hand: string[]
  outcomes: { note: number; says: string }[] // what was learned after a note's change: a test, a measurement
}

const TEXT_MAX = 4000
const LIST_MAX = 40
const KINDS: SymbolKind[] = ['class', 'function', 'method', 'endpoint', 'module', 'type', 'other']

function str(value: unknown, max = TEXT_MAX): string {
  if (typeof value === 'number' || typeof value === 'boolean') value = String(value)
  if (typeof value !== 'string') return ''
  const text = value.trim()
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}

const opt = (value: unknown, max = TEXT_MAX) => str(value, max) || null

function arr(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.slice(0, LIST_MAX)
  // a model sometimes sends one item where the schema asks for a list
  return value === undefined || value === null || value === '' ? [] : [value]
}

const strings = (value: unknown) => arr(value).map((x) => str(x)).filter(Boolean)
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {})

function url(value: unknown): string | null {
  const text = str(value, 2000)
  return /^https?:\/\/[^\s]+$/i.test(text) ? text : null
}

// The note as inloop keeps it, with what was missing or malformed in `problems` (said back to Claude).
export function cleanNote(input: Record<string, unknown>): { note: Note; problems: string[] } {
  const problems: string[] = []
  const note: Note = {
    title: str(input.title, 200),
    tldr: str(input.tldr, 400),
    files: strings(input.files),
    what: str(input.what),
    why: str(input.why),
    basis: input.basis === 'verified' || input.basis === 'judgment' ? input.basis : null,
    uses: arr(input.uses).map(obj).filter((u) => str(u.name)).map((u) => ({
      name: str(u.name, 200),
      from: str(u.from, 500),
      why: str(u.why),
      doc_url: url(u.doc_url),
    })),
    alternatives: strings(input.alternatives),
    parameters: arr(input.parameters).map(obj).filter((p) => str(p.name)).map((p) => ({
      name: str(p.name, 200),
      meaning: str(p.meaning),
      default: opt(p.default, 500),
      why_this_value: opt(p.why_this_value),
      doc_url: url(p.doc_url),
    })),
    symbols: arr(input.symbols).map(obj).filter((s) => str(s.name)).map((s) => ({
      name: str(s.name, 200),
      kind: (KINDS as unknown[]).includes(s.kind) ? (s.kind as SymbolKind) : 'other',
      file: opt(s.file, 500),
      why_exists: str(s.why_exists),
      why_this_shape: opt(s.why_this_shape),
      called_by: opt(s.called_by),
    })),
    lines: arr(input.lines).map(obj).filter((x) => str(x.anchor) && str(x.says)).map((x) => ({ anchor: str(x.anchor, 300), says: str(x.says) })),
    removed: arr(input.removed).map(obj).filter((x) => str(x.anchor) && str(x.says)).map((x) => ({ anchor: str(x.anchor, 300), says: str(x.says) })),
    terms: arr(input.terms).map(obj).filter((x) => str(x.term) && str(x.means)).map((x) => ({ term: str(x.term, 200), means: str(x.means) })),
    impact: strings(input.impact),
    risks: strings(input.risks),
    commit: /^[0-9a-f]{4,40}$/i.test(str(input.commit, 40)) ? str(input.commit, 40).toLowerCase() : null,
  }
  for (const key of ['title', 'tldr', 'what', 'why'] as const) if (!note[key]) problems.push(key + ' is empty')
  if (!note.files.length) problems.push('files is empty')
  return { note, problems }
}

export function cleanRecap(input: Record<string, unknown>): { recap: Recap; problems: string[] } {
  const recap: Recap = {
    overview: str(input.overview),
    reading_order: arr(input.reading_order).map(obj).filter((r) => str(r.file)).map((r) => ({ file: str(r.file, 500), why: str(r.why) })),
    groups: arr(input.groups).map(obj).filter((g) => str(g.role)).map((g) => ({ role: str(g.role, 200), files: strings(g.files) })),
    check_by_hand: strings(input.check_by_hand),
    outcomes: arr(input.outcomes).map(obj).filter((o) => Number.isInteger(Number(o.note)) && Number(o.note) > 0 && str(o.says)).map((o) => ({ note: Number(o.note), says: str(o.says) })),
  }
  const problems = recap.overview ? [] : ['overview is empty']
  return { recap, problems }
}

// Whether a path lies in the project. Claude also writes files elsewhere (a plan, its memory,
// scratch files); those are not the project's code and are left out.
export function inside(path: string, root: string): boolean {
  const p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  if (!/^([A-Za-z]:)?\//.test(p)) return p !== '..' && !p.startsWith('../') // relative: from the project
  return /^[A-Za-z]:/.test(p) ? p.toLowerCase().startsWith(r.toLowerCase() + '/') : p.startsWith(r + '/')
}

// "./src/a.ts", "src\\a.ts" and "/repo/src/a.ts" (with root "/repo") all become "src/a.ts".
export function relative(path: string, root: string): string {
  let p = path.replace(/\\/g, '/')
  const r = root.replace(/\\/g, '/').replace(/\/+$/, '')
  if (r && (p === r || p.startsWith(r + '/'))) p = p.slice(r.length + 1)
  return p.replace(/^\.\//, '').replace(/\/{2,}/g, '/')
}

type Open = { id: string; files: string[] }

// Which note an edit belongs to. Notes are kept per agent (the main conversation and each subagent
// separately) and per turn of the main conversation: a new prompt starts with no open note.
export class Pairing {
  private open = new Map<string, Open[]>()

  newTurn() {
    this.open.clear()
  }

  addNote(agent: string, id: string, files: string[]) {
    const list = this.open.get(agent) ?? []
    list.push({ id, files })
    this.open.set(agent, list)
  }

  // The newest note of this agent that lists the file; else the agent's newest note, with `listed`
  // false because the note did not name the file; else none.
  match(agent: string, file: string): { id: string; listed: boolean } | null {
    const list = this.open.get(agent) ?? []
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].files.some((f) => sameFile(f, file))) return { id: list[i].id, listed: true }
    }
    return list.length ? { id: list[list.length - 1].id, listed: false } : null
  }
}

// A file named in a note matches an edited file when one path ends with the other.
export function sameFile(named: string, edited: string): boolean {
  const a = named.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  const b = edited.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '')
  if (!a || !b) return false
  return a === b || b.endsWith('/' + a) || a.endsWith('/' + b)
}
