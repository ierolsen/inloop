// The records inloop keeps, one JSON object per line in .inloop/log/<session>.jsonl.
// Every record carries `v`, the schema version, so later versions can read older logs.
// Plain module: no mods API calls here.

import type { Note, Recap } from './note.ts'

export const SCHEMA = 1
export const DIR = '.inloop'
export const LOG_DIR = DIR + '/log'
export const REVIEW_DIR = DIR + '/review'
export const CONFIG = DIR + '/config.json'
// $.fs.write replaces a file and takes at most 4 MiB, so a session's log moves to a new part first
export const PART_BYTES = 3_500_000

type Base = { v: number; ts: number; session: string; agent: string | null; turn: string | null }

export type Skipped = 'binary' | 'too-large' | 'sensitive' | 'unreadable' | 'unchanged'

export type SessionRecord = Base & { kind: 'session'; root: string; language: string; language_code: string | null; detail: string; version: string }
export type NoteRecord = Base & { kind: 'note'; id: string; n: number; source: 'live' | 'reconstructed'; note: Note; problems: string[] }
export type RecapRecord = Base & { kind: 'recap'; id: string; recap: Recap }
export type EditRecord = Base & {
  kind: 'edit'
  id: string
  tool: string
  path: string
  note: string | null // the id of the note this edit belongs to, null when no note explains it
  listed: boolean // the note named this file
  status: 'ok' | 'failed' | 'denied'
  created: boolean
  diff: string | null
  added: number
  removed: number
  truncated: boolean
  skipped: Skipped | null
  redactions: number
}
export type BaselineRecord = Base & { kind: 'baseline'; git: boolean; head: string | null; dirty: string[] }
export type OutsideEntry = { path: string; state: 'added' | 'modified' | 'deleted'; diff: string | null; added: number; removed: number; truncated: boolean; skipped: Skipped | null; redactions: number }
export type OutsideRecord = Base & { kind: 'outside'; entries: OutsideEntry[]; more: number }

export type LogRecord = SessionRecord | NoteRecord | RecapRecord | EditRecord | BaselineRecord | OutsideRecord

export function line(record: LogRecord): string {
  return JSON.stringify(record) + '\n'
}

// Records of a log file; lines that are not JSON, or from another schema version, are left out.
export function parse(text: string): LogRecord[] {
  const out: LogRecord[] = []
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue
    try {
      const r = JSON.parse(raw)
      if (r && r.v === SCHEMA && typeof r.kind === 'string') out.push(r)
    } catch {
      // a line cut by a crash; the rest of the file still counts
    }
  }
  return out
}

export function partPath(root: string, session: string, part: number): string {
  return root + '/' + LOG_DIR + '/' + session + (part > 1 ? '.' + part : '') + '.jsonl'
}

export function bytes(text: string): number {
  return new TextEncoder().encode(text).length
}

// Log file names in .inloop/log, grouped by session, parts in order.
export function sessionsOf(names: string[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const parts = names
    .map((name) => /^(.+?)(?:\.(\d+))?\.jsonl$/.exec(name))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ name: m[0], session: m[1], part: m[2] ? Number(m[2]) : 1 }))
    .sort((x, y) => (x.session === y.session ? x.part - y.part : x.session < y.session ? -1 : 1))
  for (const p of parts) out.set(p.session, [...(out.get(p.session) ?? []), p.name])
  return out
}
