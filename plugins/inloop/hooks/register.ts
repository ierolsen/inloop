// inloop's hooks module: the only file that calls the mods API. Every other module under hooks/ is
// plain code that takes values and returns values (see CLAUDE.md).

import { resolve, language as parseLanguage, detail as parseDetail, languageName, type Settings } from './config.ts'
import { instructions, NOTE_SPEC, RECAP_SPEC } from './instructions.ts'
import { cleanNote, cleanRecap, relative, inside, Pairing } from './note.ts'
import { diff, isBinary } from './diff.ts'
import { redact, redactDeep, sensitive } from './redact.ts'
import { SCHEMA, DIR, CONFIG, PART_BYTES, line, parse, partPath, bytes, type LogRecord, type OutsideEntry, type Skipped } from './log.ts'
import { nul, porcelain, unaccounted, state, hunks, counts, inloopOwn, OUTSIDE_MAX } from './outside.ts'
import { labels, hasLabels, say, count } from './i18n/index.ts'

const PLUGIN = 'inloop'
const VERSION = '0.1.0'
const SECTION = PLUGIN + ':instructions'
const READ_MAX = 1_000_000 // bytes of a file read for a diff; larger files are logged without one
const DIFF_LINES = 400
const NOTHING_OUTSIDE = '[[],0]' // fingerprint() of an empty list: where every baseline starts

type Snapshot = { text: string; exists: boolean; skipped: Skipped | null }

// What this session holds. register() clears it, and session.start builds it again from the log,
// so a reload of the plugin (a changed setting, or a developer's reload) carries on where it was.
let options: Record<string, unknown> = {}
let ready = false
let enabled = true
let session = ''
let root = ''
let settings: Settings = resolve({})
let prompt = ''
let records: LogRecord[] = [] // the log part being written
let part = 1
let partSize = 0
let writing: Promise<unknown> = Promise.resolve()
let pairing = new Pairing()
let turn: string | null = null
let git = false
let head: string | null = null
let dirty = new Set<string>()
let logged = new Set<string>() // files with an edit in this session's log
let lastOutside = NOTHING_OUTSIDE
let tally = { notes: 0, edits: 0, unexplained: 0, outside: 0 }
let turnTally = { notes: 0, edits: 0, unexplained: 0 }

function reset() {
  ready = false
  enabled = true
  session = ''
  root = ''
  settings = resolve({})
  prompt = ''
  records = []
  part = 1
  partSize = 0
  writing = Promise.resolve()
  pairing = new Pairing()
  turn = null
  git = false
  head = null
  dirty = new Set()
  logged = new Set()
  lastOutside = NOTHING_OUTSIDE
  tally = { notes: 0, edits: 0, unexplained: 0, outside: 0 }
  turnTally = { notes: 0, edits: 0, unexplained: 0 }
}

const agentOf = (e: any): string | null => (typeof e.agentId === 'string' && e.agentId ? e.agentId : null)
const now = () => Date.now()

// ---- the log ----------------------------------------------------------------------------------

// Adds one record and writes the session's current part whole, one write at a time.
async function append($: any, record: LogRecord) {
  const size = bytes(line(record))
  if (records.length && partSize + size > PART_BYTES) {
    part += 1
    records = []
    partSize = 0
  }
  records.push(record)
  partSize += size
  const path = partPath(root, session, part)
  const content = records.map(line).join('')
  writing = writing.then(() => $.fs.write(path, content)).catch(() => undefined)
  await writing
}

// A reload of the plugin mid-session continues the log it had instead of starting it over.
async function loadLog($: any) {
  records = []
  part = 1
  partSize = 0
  tally = { notes: 0, edits: 0, unexplained: 0, outside: 0 }
  for (let p = 1; p < 1000; p++) {
    const path = partPath(root, session, p)
    if (!(await $.fs.exists(path))) break
    const text = await $.fs.read(path)
    const parsed = parse(text)
    part = p
    records = parsed
    partSize = bytes(text)
    for (const r of parsed) {
      if (r.kind === 'note') tally.notes = Math.max(tally.notes, r.n)
      if (r.kind === 'edit' && r.status === 'ok') { tally.edits++; logged.add(r.path); if (!r.note) tally.unexplained++ }
      if (r.kind === 'baseline') { git = r.git; head = r.head; dirty = new Set(r.dirty); tally.outside = 0; lastOutside = NOTHING_OUTSIDE }
      if (r.kind === 'switch') enabled = r.on
      if (r.kind === 'outside') { tally.outside = r.entries.length + r.more; lastOutside = fingerprint(r.entries, r.more) }
    }
  }
  return records.some((r) => r.kind === 'baseline')
}

// ---- settings ---------------------------------------------------------------------------------

async function readProject($: any): Promise<Record<string, unknown>> {
  try {
    const path = root + '/' + CONFIG
    if (!(await $.fs.exists(path))) return {}
    const value = JSON.parse(await $.fs.read(path))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch {
    return {}
  }
}

async function readUser($: any): Promise<Record<string, unknown>> {
  try {
    const value = await $.store.get('settings')
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

async function loadSettings($: any) {
  settings = resolve({ project: await readProject($), user: await readUser($), plugin: options })
  prompt = instructions(PLUGIN, settings.language, settings.detail.value)
}

// Sets (or, with null, removes) one setting for this project or across projects, then reloads them.
async function setSetting($: any, key: 'language' | 'detail', value: string | null, project: boolean) {
  if (project) {
    const current = await readProject($)
    if (value === null && !(key in current)) return loadSettings($)
    if (value === null) delete current[key]
    else current[key] = value
    await $.fs.write(root + '/' + CONFIG, JSON.stringify(current, null, 2) + '\n')
  } else {
    const current = await readUser($)
    if (value === null) delete current[key]
    else current[key] = value
    await $.store.set('settings', current)
  }
  await loadSettings($)
}

// ---- git: the baseline and the changes outside the edit tools ---------------------------------

async function gitRun($: any, argv: string[]): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await $.process.run(argv, { cwd: root, timeoutMs: 15000 })
    return { ok: r.exitCode === 0, out: r.stdout }
  } catch {
    return { ok: false, out: '' }
  }
}

async function takeBaseline($: any) {
  git = (await gitRun($, ['git', 'rev-parse', '--show-toplevel'])).ok
  head = null
  dirty = new Set()
  if (git) {
    const h = await gitRun($, ['git', 'rev-parse', '--verify', '--quiet', 'HEAD'])
    head = h.ok ? h.out.trim() || null : null
    const s = await gitRun($, ['git', 'status', '--porcelain=v1', '-z', '--untracked-files=all'])
    dirty = new Set(porcelain(s.out).filter((p) => p !== DIR && !p.startsWith(DIR + '/')))
  }
  await append($, { v: SCHEMA, kind: 'baseline', ts: now(), session, agent: null, turn, git, head, dirty: [...dirty] })
  tally.outside = 0
  lastOutside = NOTHING_OUTSIDE
}

function fingerprint(entries: OutsideEntry[], more: number): string {
  return JSON.stringify([entries.map((x) => [x.path, x.state, x.added, x.removed]), more])
}

// Records the files changed since the baseline that have no logged edit, when that list changed.
// True when it recorded a list that is not empty.
async function checkOutside($: any): Promise<boolean> {
  if (!git) return false
  const changed = head ? nul((await gitRun($, ['git', 'diff', '--name-only', '-z', head])).out) : porcelain((await gitRun($, ['git', 'status', '--porcelain=v1', '-z', '--untracked-files=no'])).out)
  const untrackedList = nul((await gitRun($, ['git', 'ls-files', '--others', '--exclude-standard', '-z'])).out)
  const deleted = new Set(head ? nul((await gitRun($, ['git', 'diff', '--name-only', '--diff-filter=D', '-z', head])).out) : [])
  const untracked = new Set(untrackedList)
  const paths = unaccounted(changed, untrackedList, logged, dirty)
  const entries: OutsideEntry[] = []
  for (const path of paths.slice(0, OUTSIDE_MAX)) {
    const kind = state(path, untracked, deleted)
    const entry: OutsideEntry = { path, state: kind, diff: null, added: 0, removed: 0, truncated: false, skipped: null, redactions: 0 }
    if (sensitive(path)) entry.skipped = 'sensitive'
    else if (kind === 'added') {
      const snap = await snapshot($, root + '/' + path)
      if (snap.skipped) entry.skipped = snap.skipped
      else Object.assign(entry, diffed('', snap.text))
    } else if (head) {
      const text = hunks((await gitRun($, ['git', 'diff', '--no-color', '--no-ext-diff', head, '--', path])).out)
      if (text.indexOf('Binary files') === 0) entry.skipped = 'binary'
      else {
        const r = redact(text.split('\n').slice(0, DIFF_LINES).join('\n'))
        Object.assign(entry, { diff: r.text, redactions: r.count, truncated: text.split('\n').length > DIFF_LINES }, counts(text))
      }
    }
    entries.push(entry)
  }
  const more = Math.max(0, paths.length - OUTSIDE_MAX)
  tally.outside = paths.length
  const print = fingerprint(entries, more)
  if (print === lastOutside) return false
  lastOutside = print
  await append($, { v: SCHEMA, kind: 'outside', ts: now(), session, agent: null, turn, entries, more })
  return paths.length > 0
}

// ---- edits ------------------------------------------------------------------------------------

// The file as it is now, or why inloop does not read it.
async function snapshot($: any, path: string): Promise<Snapshot> {
  if (!path) return { text: '', exists: false, skipped: 'unreadable' }
  if (sensitive(path)) return { text: '', exists: true, skipped: 'sensitive' }
  try {
    if (!(await $.fs.exists(path))) return { text: '', exists: false, skipped: null }
    const info = await $.fs.stat(path)
    if (info.kind !== 'file') return { text: '', exists: true, skipped: 'unreadable' }
    if (info.size > READ_MAX) return { text: '', exists: true, skipped: 'too-large' }
    const text = await $.fs.read(path)
    return isBinary(text) ? { text: '', exists: true, skipped: 'binary' } : { text, exists: true, skipped: null }
  } catch {
    return { text: '', exists: false, skipped: 'unreadable' }
  }
}

function diffed(before: string, after: string) {
  const d = diff(before, after, DIFF_LINES)
  const r = redact(d.text)
  return { diff: d.text ? r.text : null, added: d.added, removed: d.removed, truncated: d.truncated, redactions: r.count, skipped: (d.added || d.removed ? null : 'unchanged') as Skipped | null }
}

async function recordEdit($: any, e: any, path: string, before: Snapshot, result: any) {
  const status = result && result.deny ? 'denied' : result && result.isError ? 'failed' : 'ok'
  const rel = relative(path, root)
  const agent = agentOf(e)
  const match = status === 'ok' ? pairing.match(agent ?? 'main', rel) : null
  let content = { diff: null as string | null, added: 0, removed: 0, truncated: false, redactions: 0, skipped: before.skipped as Skipped | null }
  if (status === 'ok') {
    const after = await snapshot($, path)
    if (!before.skipped && !after.skipped) content = diffed(before.text, after.text)
    else content.skipped = before.skipped ?? after.skipped
    tally.edits++
    turnTally.edits++
    logged.add(rel)
    if (!match) { tally.unexplained++; turnTally.unexplained++ }
  }
  await append($, {
    v: SCHEMA, kind: 'edit', ts: now(), session, agent, turn,
    id: String(e.tool_use_id ?? ''), tool: String(e.tool), path: rel,
    note: match ? match.id : null, listed: match ? match.listed : false,
    status, created: !before.exists && status === 'ok', ...content,
  })
}

// ---- the session ------------------------------------------------------------------------------

async function start($: any) {
  session = await $.session.id()
  let repoRoot: string | null = null
  try {
    const repo = await $.session.repo()
    repoRoot = repo && typeof repo.root === 'string' ? repo.root : null
  } catch {
    repoRoot = null
  }
  root = (repoRoot ?? (await $.session.root())).replace(/\\/g, '/').replace(/\/+$/, '')
  // .inloop/ keeps itself out of git, so nothing it writes is committed by accident
  try {
    if (!(await $.fs.exists(root + '/' + DIR + '/.gitignore'))) await $.fs.write(root + '/' + DIR + '/.gitignore', '*\n')
  } catch {
    // a read-only project still gets its notes in this session's memory
  }
  await loadSettings($)
  // A log that is already there is continued: the plugin was reloaded, or the session resumed.
  // Either way the outside-changes check starts again from how the project is now, so work
  // done by hand while the session was closed is not put down to it.
  const continued = await loadLog($)
  if (!continued) {
    await append($, {
      v: SCHEMA, kind: 'session', ts: now(), session, agent: null, turn: null, root,
      language: languageName(settings.language), language_code: settings.language.code, detail: settings.detail.value, version: VERSION,
    })
  }
  await takeBaseline($)
  ready = true
}

function statusText(): string {
  const code = settings.language.code
  const l = labels(code)
  return say(l.status, {
    state: enabled ? l.state_on : l.state_off,
    language: languageName(settings.language), language_source: l[('source_' + settings.language.source) as 'source_user'],
    detail: settings.detail.value, detail_source: l[('source_' + settings.detail.source) as 'source_user'],
    notes: count(code, l.notes, tally.notes), edits: count(code, l.edits, tally.edits),
    unexplained: tally.unexplained, files: count(code, l.files, tally.outside),
    log: partPath(root, session, part),
  })
}

export function register(on: any, pluginOptions: any) {
  reset()
  options = pluginOptions && typeof pluginOptions === 'object' ? pluginOptions : {}

  on('session.start', async ($: any, e: any, next: any) => {
    try {
      await start($)
      await $.tool.register(NOTE_SPEC)
      await $.tool.register(RECAP_SPEC)
      await $.command.register({
        name: PLUGIN,
        description: 'inloop: the language and detail of notes, what was recorded, on and off',
        argumentHint: '[status | lang <language> | detail <level> | on | off | help]',
        immediate: true,
      })
    } catch (err) {
      try {
        await $.ui.log('inloop could not start: ' + String(err))
      } catch {
        // nowhere left to say it
      }
    }
    return next(e)
  })

  // The instructions, while inloop is on and started (its tools exist). Their text changes only
  // with the settings.
  on('prompt.compose', async ($: any, e: any, next: any) => {
    const composed = await next(e)
    if (!ready || !enabled || !prompt || !composed || !Array.isArray(composed.sections)) return composed
    return { ...composed, sections: [...composed.sections.filter((s: any) => s.id !== SECTION), { id: SECTION, text: prompt, scope: 'session' }] }
  })

  // inloop's tools stay in Claude's tool list rather than behind tool search, while inloop is on
  on('tool.describe', { tool: ['mcp__inloop__note', 'mcp__inloop__recap'] }, async ($: any, e: any, next: any) => {
    const described = await next(e)
    return { ...described, isDeferred: !enabled }
  })

  on('turn.start', async ($: any, e: any, next: any) => {
    if (!agentOf(e)) {
      turn = typeof e.turnId === 'string' ? e.turnId : null
      pairing.newTurn()
      turnTally = { notes: 0, edits: 0, unexplained: 0 }
    }
    return next(e)
  })

  // The note is answered here, never passed on, so it needs no permission and runs nothing.
  on('tool.call', { tool: 'mcp__inloop__note' }, async ($: any, e: any) => {
    const { note, problems } = cleanNote(e)
    const clean = redactDeep(note).value
    tally.notes += 1
    turnTally.notes += 1
    const id = String(e.tool_use_id ?? 'note-' + tally.notes)
    pairing.addNote(agentOf(e) ?? 'main', id, clean.files.map((f) => relative(f, root)))
    try {
      await append($, { v: SCHEMA, kind: 'note', ts: now(), session, agent: agentOf(e), turn, id, n: tally.notes, source: e.source === 'reconstructed' ? 'reconstructed' : 'live', note: clean, problems })
    } catch {
      // the note still pairs with the edits in this session
    }
    const fix = problems.length ? ' Missing: ' + problems.join(', ') + '. Include them in the next note.' : ''
    return { result: 'inloop: note ' + tally.notes + ' saved.' + fix }
  }).catch(async () => ({ result: 'inloop: the note could not be saved; carry on with the change.' }))

  on('tool.call', { tool: 'mcp__inloop__recap' }, async ($: any, e: any) => {
    const { recap, problems } = cleanRecap(e)
    try {
      await append($, { v: SCHEMA, kind: 'recap', ts: now(), session, agent: agentOf(e), turn, id: String(e.tool_use_id ?? 'recap'), recap: redactDeep(recap).value })
    } catch {
      // nothing to undo: the recap only feeds the review page
    }
    return { result: 'inloop: recap saved.' + (problems.length ? ' Missing: ' + problems.join(', ') + '.' : '') }
  }).catch(async () => ({ result: 'inloop: the recap could not be saved.' }))

  // Every edit is captured around the tool call. Whatever happens, the call goes on: every path
  // below ends in next(e), and a capture that fails is skipped.
  on('tool.call', { tool: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'] }, async ($: any, e: any, next: any) => {
    const path = String(e.file_path ?? e.notebook_path ?? '')
    if (!enabled || !ready || !inside(path, root) || inloopOwn(relative(path, root))) return next(e)
    let before: Snapshot = { text: '', exists: false, skipped: 'unreadable' }
    try {
      before = await snapshot($, path)
    } catch {
      // read nothing; the edit is still logged after it runs
    }
    const result = await next(e)
    try {
      await recordEdit($, e, path, before, result)
    } catch {
      // the edit happened; only its record is lost
    }
    return result
  }).catch(async ($: any, e: any, next: any) => next(e)) // if capture itself fails, the edit still runs (or keeps its result)

  on('turn.complete', async ($: any, e: any, next: any) => {
    const result = await next(e)
    if (agentOf(e) || e.isAborted || !ready || !enabled) return result
    let outside = false
    try {
      outside = await checkOutside($)
    } catch {
      // the next turn checks again
    }
    if (!turnTally.notes && !turnTally.edits && !outside) return result
    const code = settings.language.code
    const l = labels(code)
    const extra = (turnTally.unexplained ? say(l.turn_unexplained, { count: turnTally.unexplained }) : '') +
      (tally.outside ? say(l.turn_outside, { files: count(code, l.files, tally.outside) }) : '')
    return { ...(result ?? {}), text: say(l.turn_summary, { notes: count(code, l.notes, turnTally.notes), edits: count(code, l.edits, turnTally.edits), extra }) }
  })

  on('command.run', { command: PLUGIN }, async ($: any, e: any) => {
    const l = labels(settings.language.code)
    if (!ready) return { text: l.not_ready }
    const words = String(e.args ?? '').trim().split(/\s+/).filter(Boolean)
    const project = words.includes('--project')
    const [command = 'status', ...rest] = words.filter((w) => w !== '--project')
    const value = rest.join(' ')
    if (command === 'help') return { text: l.help }
    if (command === 'status') return { text: statusText() }
    if (command === 'on' || command === 'off') {
      enabled = command === 'on'
      await append($, { v: SCHEMA, kind: 'switch', ts: now(), session, agent: null, turn, on: enabled })
      try {
        await $.ui.invalidate('tool.describe')
      } catch {
        // the tool list catches up at its next refresh
      }
      return { text: enabled ? l.on : l.off }
    }
    if (command === 'lang' || command === 'language') {
      if (value === 'reset') {
        if (!project) await setSetting($, 'language', null, false)
        await setSetting($, 'language', null, true)
        const after = labels(settings.language.code)
        return { text: say(after.lang_reset, { language: languageName(settings.language), source: after[('source_' + settings.language.source) as 'source_user'] }) }
      }
      const lang = parseLanguage(value)
      if (!lang) return { text: l.lang_missing }
      await setSetting($, 'language', lang.code ?? lang.english, project)
      const after = labels(settings.language.code)
      const said = [say(project ? after.lang_project : after.lang_user, { language: languageName(lang) })]
      if (!project && settings.language.source === 'project') said.push(say(after.lang_project_wins, { language: languageName(settings.language) }))
      if (!hasLabels(lang.code)) said.push(say(after.lang_no_labels, { language: languageName(lang) }))
      return { text: said.join('\n') }
    }
    if (command === 'detail') {
      if (value === 'reset') {
        if (!project) await setSetting($, 'detail', null, false)
        await setSetting($, 'detail', null, true)
        return { text: say(l.detail_reset, { detail: settings.detail.value, source: l[('source_' + settings.detail.source) as 'source_user'] }) }
      }
      const level = parseDetail(value)
      if (!level) return { text: l.detail_bad }
      await setSetting($, 'detail', level, project)
      const said = [say(project ? l.detail_project : l.detail_user, { detail: level })]
      if (!project && settings.detail.source === 'project') said.push(say(l.detail_project_wins, { detail: settings.detail.value }))
      return { text: said.join('\n') }
    }
    return { text: say(l.unknown, { command }) + '\n' + l.help }
  }).catch(async () => ({ text: 'inloop could not run that command.' }))
}
