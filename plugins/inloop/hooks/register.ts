// inloop's hooks module: the only file that calls the mods API. Every other module under hooks/ is
// plain code that takes values and returns values (see CLAUDE.md).

import { resolve, language as parseLanguage, detail as parseDetail, adhd as parseAdhd, languageName, type Settings } from './config.ts'
import { instructions, NOTE_SPEC, RECAP_SPEC } from './instructions.ts'
import { cleanNote, cleanRecap, relative, inside, sameFile, Pairing } from './note.ts'
import { diff, isBinary } from './diff.ts'
import { redact, redactDeep, sensitive } from './redact.ts'
import { SCHEMA, DIR, LOG_DIR, REVIEW_DIR, CONFIG, PART_BYTES, line, parse, partPath, bytes, sessionsOf, type LogRecord, type OutsideEntry, type Skipped } from './log.ts'
import { nul, porcelain, unaccounted, state, hunks, counts, inloopOwn, OUTSIDE_MAX } from './outside.ts'
import { labels, hasLabels, say, count, nameOf, shownIn } from './i18n/index.ts'
import type { Labels } from './i18n/en.ts'
import { build as buildReview, type GitCommit, type FileData } from './review/review.ts'
import { fit as fitReview } from './review/page.ts'
import { parsePatch, added, clip, lineCount } from './review/patch.ts'
import type { Theme } from './review/html.ts'
import { noteCard, recapCard } from './live/card.ts'

const PLUGIN = 'inloop'
const VERSION = '0.1.0'
const SECTION = PLUGIN + ':instructions'
const READ_MAX = 1_000_000 // bytes of a file read for a diff; larger files are logged without one
const DIFF_LINES = 400
const REVIEW_COMMITS = 30 // commits on one review page; older ones in the range are counted, not shown
const FILE_LINES = 400 // a file's diff past this many lines is fetched again with less context
const UNTRACKED_MAX = 30 // files not in git yet that a review reads
const COMMITS_MAX = 50 // commits recorded from one move of HEAD
const NOTHING_OUTSIDE = '[[],0]' // fingerprint() of an empty list: where every baseline starts

type Snapshot = { text: string; exists: boolean; skipped: Skipped | null }

// What this session holds. register() clears it, and session.start builds it again from the log,
// so a reload of the plugin (a changed setting, or a developer's reload) carries on where it was.
let options: Record<string, unknown> = {}
let ready = false
let enabled = true
let interactive = true // a person at a screen, who can be shown a page
let session = ''
let root = ''
let settings: Settings = resolve({})
let prompt = ''
let records: LogRecord[] = [] // the log part being written
let part = 1
let partSize = 0
let writing: Promise<unknown> = Promise.resolve()
let stored = false // the log is on disk; a session that records nothing writes nothing
let ignored = false // .inloop/.gitignore is in place
let pairing = new Pairing()
let turn: string | null = null
let git = false
let head: string | null = null
let dirty = new Set<string>()
let firstHead: string | null = null // HEAD when the session began: where its own commits start
let knownHead: string | null = null // HEAD as last seen; a move means new commits
let waiting: { id: string; path: string }[] = [] // edits not in a commit yet
let waitingNotes: { id: string; files: string[] }[] = [] // live notes not in a commit yet
let logged = new Set<string>() // files with an edit in this session's log
let lastOutside = NOTHING_OUTSIDE
let tally = { notes: 0, edits: 0, unexplained: 0, outside: 0 }
let turnTally = { notes: 0, edits: 0, unexplained: 0 }
let numbers = new Map<string, number>() // a note's tool_use_id to its number, for its card

function reset() {
  ready = false
  enabled = true
  interactive = true
  session = ''
  root = ''
  settings = resolve({})
  prompt = ''
  records = []
  part = 1
  partSize = 0
  writing = Promise.resolve()
  stored = false
  ignored = false
  pairing = new Pairing()
  turn = null
  git = false
  head = null
  dirty = new Set()
  firstHead = null
  knownHead = null
  waiting = []
  waitingNotes = []
  logged = new Set()
  lastOutside = NOTHING_OUTSIDE
  tally = { notes: 0, edits: 0, unexplained: 0, outside: 0 }
  turnTally = { notes: 0, edits: 0, unexplained: 0 }
  numbers = new Map()
}

const agentOf = (e: any): string | null => (typeof e.agentId === 'string' && e.agentId ? e.agentId : null)
const now = () => Date.now()

// ---- the log ----------------------------------------------------------------------------------

// What makes a session worth a log on disk: a note, an edit, a recap, or files changed outside
// the edit tools. Until one comes, the session's records stay in memory, so a session that only
// talks leaves no .inloop/ folder behind.
const recordsSomething = (r: LogRecord) =>
  r.kind === 'note' || r.kind === 'edit' || r.kind === 'recap' || (r.kind === 'outside' && (r.entries.length > 0 || r.more > 0)) ||
  (r.kind === 'commit' && (r.edits.length > 0 || r.notes.length > 0))

// .inloop/ keeps itself out of git, so nothing inloop writes is committed by accident. Runs before
// inloop first writes anything there.
async function keepOutOfGit($: any) {
  if (ignored) return
  try {
    if (!(await $.fs.exists(root + '/' + DIR + '/.gitignore'))) await $.fs.write(root + '/' + DIR + '/.gitignore', '*\n')
  } catch {
    // a read-only project still gets its notes in this session's memory
  }
  ignored = true
}

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
  if (!stored && !recordsSomething(record)) return
  if (!stored) {
    await keepOutOfGit($)
    stored = true
  }
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
    stored = true
    part = p
    records = parsed
    partSize = bytes(text)
    for (const r of parsed) {
      if (r.kind === 'note') tally.notes = Math.max(tally.notes, r.n)
      if (r.kind === 'edit' && r.status === 'ok') { tally.edits++; logged.add(r.path); if (!r.note) tally.unexplained++ }
      if (r.kind === 'baseline') { git = r.git; head = r.head; dirty = new Set(r.dirty); tally.outside = 0; lastOutside = NOTHING_OUTSIDE; knownHead = r.head; if (firstHead === null) firstHead = r.head }
      if (r.kind === 'edit' && r.status === 'ok') waiting.push({ id: r.id, path: r.path })
      if (r.kind === 'note' && r.source === 'live') waitingNotes.push({ id: r.id, files: r.note.files })
      if (r.kind === 'commit') {
        knownHead = r.sha
        waiting = waiting.filter((x) => !r.edits.includes(x.id))
        waitingNotes = waitingNotes.filter((x) => !r.notes.includes(x.id))
      }
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
  prompt = instructions(PLUGIN, settings.language, settings.detail.value, settings.adhd.value)
}

// Sets (or, with null, removes) one setting for this project or across projects, then reloads them.
async function setSetting($: any, key: 'language' | 'detail' | 'adhd', value: string | null, project: boolean) {
  if (project) {
    const current = await readProject($)
    if (value === null && !(key in current)) return loadSettings($)
    if (value === null) delete current[key]
    else current[key] = value
    await keepOutOfGit($)
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
  knownHead = head
  if (firstHead === null) firstHead = head
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

// Records the commits made since HEAD was last seen, each with the edits and notes it took in:
// an edit goes with the first commit that contains its file, a note without edits with the first
// commit that contains a file it names. Amended or rebased commits are matched again on the page.
async function checkHead($: any) {
  if (!git) return
  const h = await gitRun($, ['git', 'rev-parse', '--verify', '--quiet', 'HEAD'])
  const current = h.ok ? h.out.trim() : ''
  if (!current || current === knownHead) return
  const range = knownHead ? knownHead + '..' + current : current
  const shas = (await gitRun($, ['git', 'rev-list', '--reverse', '--max-count=' + COMMITS_MAX, range])).out.split('\n').filter(Boolean)
  knownHead = current
  for (const sha of shas) {
    const [parents = '', subject = ''] = (await gitRun($, ['git', 'show', '-s', '--format=%P%x00%s', sha])).out.replace(/\n$/, '').split('\u0000')
    const files = nul((await gitRun($, ['git', 'diff-tree', '--no-commit-id', '--name-only', '-r', '-z', '--root', sha])).out)
    const touched = new Set(files)
    const edits = waiting.filter((x) => touched.has(x.path)).map((x) => x.id)
    waiting = waiting.filter((x) => !touched.has(x.path))
    const notes = waitingNotes.filter((n) => n.files.some((f) => files.some((c) => sameFile(f, c) || sameFile(c, f)))).map((n) => n.id)
    waitingNotes = waitingNotes.filter((n) => !notes.includes(n.id))
    await append($, { v: SCHEMA, kind: 'commit', ts: now(), session, agent: null, turn, sha, parents: parents.split(' ').filter(Boolean), subject, files, edits, notes })
  }
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
    waiting.push({ id: String(e.tool_use_id ?? ''), path: rel })
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
  await loadSettings($)
  // A log that is already there is continued: the plugin was reloaded, or the session resumed.
  // Either way the outside-changes check starts again from how the project is now, so work
  // done by hand while the session was closed is not put down to it.
  const continued = await loadLog($)
  if (!continued) {
    await append($, {
      v: SCHEMA, kind: 'session', ts: now(), session, agent: null, turn: null, root,
      language: languageName(settings.language), language_code: settings.language.code, detail: settings.detail.value, adhd: settings.adhd.value, version: VERSION,
    })
  }
  await takeBaseline($)
  ready = true
}

const detailName = (l: Labels, value: string) => l[('detail_' + value) as 'detail_brief'] ?? value
const sourceName = (l: Labels, source: string) => l[('source_' + source) as 'source_user']

// ---- the review -------------------------------------------------------------------------------

// Every part of one session's log, in order
async function readSession($: any, id: string): Promise<LogRecord[]> {
  const out: LogRecord[] = []
  for (let p = 1; p < 1000; p++) {
    const path = partPath(root, id, p)
    if (!(await $.fs.exists(path))) break
    out.push(...parse(await $.fs.read(path)))
  }
  return out
}

// Every session's log in this project, sessions in the order they began; this session's records
// come from memory while nothing of it is on disk.
async function readAll($: any): Promise<LogRecord[]> {
  await writing
  let names: string[] = []
  try {
    names = (await $.fs.list(root + '/' + LOG_DIR)).filter((x: any) => x.kind === 'file').map((x: any) => x.name)
  } catch {
    names = []
  }
  const all: LogRecord[][] = []
  for (const [id] of sessionsOf(names)) all.push(await readSession($, id))
  if (!stored && records.length) all.push(records)
  return all.sort((a, b) => (a[0]?.ts ?? 0) - (b[0]?.ts ?? 0)).flat()
}

// A patch from git, file by file: secret values redacted, a secret file's content left out, and a
// file whose whole-function context runs long fetched again with eight lines of context.
async function gitFiles($: any, argv: string[]): Promise<FileData[]> {
  const r = await gitRun($, ['git', '-c', 'core.quotePath=false', ...argv, '-W'])
  if (!r.ok) return []
  const out: FileData[] = []
  for (const chunk of r.out.split(/\n(?=diff --git )/)) {
    if (!chunk.startsWith('diff --git ')) continue
    const raw = parsePatch(chunk)[0]
    if (!raw) continue
    if (sensitive(raw.path)) { out.push({ patch: { ...raw, hunks: [] }, redactions: 0, hidden: 'sensitive', cut: false }); continue }
    if (raw.binary) { out.push({ patch: raw, redactions: 0, hidden: 'binary', cut: false }); continue }
    let text = chunk
    let cut = false
    if (lineCount(raw) > FILE_LINES) {
      const narrow = await gitRun($, ['git', '-c', 'core.quotePath=false', ...argv, '-U8', '--', raw.path])
      if (narrow.ok && narrow.out.startsWith('diff --git ')) { text = narrow.out; cut = true }
    }
    const red = redact(text)
    let patch = parsePatch(red.text)[0] ?? raw
    if (lineCount(patch) > FILE_LINES * 2) { patch = clip(patch, FILE_LINES * 2); cut = true }
    out.push({ patch, redactions: red.count, hidden: null, cut })
  }
  return out
}

// The commits git prints with this format, oldest first
const LOG_FORMAT = '--format=%H%x00%P%x00%an%x00%at%x00%s%x00%b%x1e'

async function commitsFrom($: any, out: string): Promise<GitCommit[]> {
  const commits: GitCommit[] = []
  for (const entry of out.split('\u001e')) {
    const [sha, parents = '', author = '', at = '0', subject = '', body = ''] = entry.replace(/^\n/, '').split('\u0000')
    if (!/^[0-9a-f]{7,64}$/.test(sha ?? '')) continue
    const parentList = parents.split(' ').filter(Boolean)
    const files = await gitFiles($, ['show', '--format=', '--no-color', '--no-ext-diff', ...(parentList.length > 1 ? ['--diff-merges=first-parent'] : []), sha])
    commits.push({ sha, parents: parentList, author, time: Number(at) * 1000, subject, body: body.trim(), files })
  }
  return commits
}

// The commits of a range ("main..", "HEAD~5..", or "HEAD" for all of its history) or one commit
// ("a1b2c3d"): the newest REVIEW_COMMITS, oldest first, and how many more the range holds. Null
// when git does not know it.
async function commitsOf($: any, what: string, single = !what.includes('..')): Promise<{ commits: GitCommit[]; more: number } | null> {
  if (single) {
    const one = await gitRun($, ['git', 'log', '--max-count=1', LOG_FORMAT, what, '--'])
    return one.ok ? { commits: await commitsFrom($, one.out), more: 0 } : null
  }
  const total = await gitRun($, ['git', 'rev-list', '--count', what, '--'])
  if (!total.ok) return null
  const r = await gitRun($, ['git', 'log', '--reverse', '--max-count=' + REVIEW_COMMITS, LOG_FORMAT, what, '--'])
  return { commits: await commitsFrom($, r.out), more: Math.max(0, Number(total.out.trim()) - REVIEW_COMMITS) }
}

// The commits inloop recorded in any session that git still has, oldest first
async function recordedCommits($: any, all: LogRecord[]): Promise<{ commits: GitCommit[]; more: number }> {
  const shas = [...new Set(all.flatMap((r) => (r.kind === 'commit' ? [r.sha] : [])))]
  if (!shas.length) return { commits: [], more: 0 }
  const r = await gitRun($, ['git', 'log', '--no-walk=sorted', '--ignore-missing', LOG_FORMAT, ...shas.slice(-REVIEW_COMMITS)])
  const commits = await commitsFrom($, r.out)
  return { commits: commits.reverse(), more: Math.max(0, shas.length - REVIEW_COMMITS) }
}

// What is not committed: changes to tracked files against HEAD, and new files git does not track
async function pendingFiles($: any): Promise<FileData[]> {
  const hasHead = (await gitRun($, ['git', 'rev-parse', '--verify', '--quiet', 'HEAD'])).ok
  const out = await gitFiles($, ['diff', '--no-color', '--no-ext-diff', ...(hasHead ? ['HEAD'] : ['--cached'])])
  const fresh = nul((await gitRun($, ['git', 'ls-files', '--others', '--exclude-standard', '-z'])).out).filter((p) => !inloopOwn(p))
  for (const path of fresh.slice(0, UNTRACKED_MAX)) {
    const empty = added(path, '')
    if (sensitive(path)) { out.push({ patch: empty, redactions: 0, hidden: 'sensitive', cut: false }); continue }
    const snap = await snapshot($, root + '/' + path)
    if (snap.skipped === 'binary') { out.push({ patch: empty, redactions: 0, hidden: 'binary', cut: false }); continue }
    if (snap.skipped) { out.push({ patch: empty, redactions: 0, hidden: null, cut: true }); continue }
    const red = redact(snap.text)
    let patch = added(path, red.text)
    const long = lineCount(patch) > FILE_LINES * 2
    if (long) patch = clip(patch, FILE_LINES * 2)
    out.push({ patch, redactions: red.count, hidden: null, cut: long })
  }
  return out
}

// The files that explanations of existing code point to, as they stand now
async function explainedFiles($: any, all: LogRecord[]): Promise<{ path: string; text: string }[]> {
  const paths = new Set<string>()
  for (const r of all) if (r.kind === 'note' && r.source === 'reconstructed' && !r.note.commit) for (const f of r.note.files) paths.add(relative(f, root))
  const out: { path: string; text: string }[] = []
  for (const path of [...paths].slice(0, 12)) {
    if (sensitive(path) || inloopOwn(path)) continue
    const snap = await snapshot($, root + '/' + path)
    if (snap.exists && !snap.skipped) out.push({ path, text: redact(snap.text).text })
  }
  return out
}

// Opens a page in the browser, where a person can see one. False when it could not.
async function show($: any, path: string): Promise<boolean> {
  if (!interactive) return false
  let argv = ['xdg-open', path]
  if (/^[A-Za-z]:\//.test(path)) argv = ['cmd', '/c', 'start', '', path.replace(/\//g, '\\')]
  else {
    try {
      if ((await $.process.run(['uname', '-s'], { cwd: root, timeoutMs: 5000 })).stdout.trim() === 'Darwin') argv = ['open', path]
    } catch {
      // no uname: try xdg-open
    }
  }
  try {
    return (await $.process.run(argv, { cwd: root, timeoutMs: 15000 })).exitCode === 0
  } catch {
    return false
  }
}

// Writes the review and opens it: this session's work by default, every commit inloop recorded
// with "all", or a git range or commit.
async function review($: any, what: string, theme: Theme, l: Labels): Promise<string> {
  await writing
  try {
    await checkHead($)
    await checkOutside($)
  } catch {
    // the review shows what git shows
  }
  const all = await readAll($)
  const scope: 'session' | 'range' | 'all' = what === 'all' ? 'all' : what ? 'range' : 'session'
  if (scope === 'range' && !/^[\w./~^@{}:+-]+$/.test(what)) return say(l.review_bad_range, { range: what })
  if (scope === 'range' && what.startsWith('-')) return say(l.review_bad_range, { range: what })
  let found: { commits: GitCommit[]; more: number } = { commits: [], more: 0 }
  let pending: FileData[] | null = null
  if (git) {
    if (scope === 'all') found = await recordedCommits($, all)
    else {
      // this session's commits start where HEAD stood when it began; in a repository that had none
      // yet, every commit is the session's
      const got = scope === 'range' ? await commitsOf($, what) : await commitsOf($, firstHead ? firstHead + '..HEAD' : 'HEAD', false)
      if (!got && scope === 'range') return say(l.review_bad_range, { range: what })
      if (got) found = got
    }
    if (scope !== 'range') pending = await pendingFiles($)
  }
  const code = shownIn(settings.language.code)
  const model = buildReview({
    records: all, commits: found.commits, more: found.more, pending, explained: await explainedFiles($, all), git, scope,
    range: scope === 'range' ? what : null, project: root.split('/').pop() || root,
  })
  const { html, cut } = fitReview(model, labels(code), { code, theme, version: VERSION })
  const name = scope === 'session' ? 'review' : scope === 'all' ? 'review-all' : 'review-' + what.replace(/[^\w.-]+/g, '_').slice(0, 60)
  const path = root + '/' + REVIEW_DIR + '/' + name + (theme === 'auto' ? '' : '-' + theme) + '.html'
  await keepOutOfGit($)
  await $.fs.write(path, html)
  return say((await show($, path)) ? l.review_opened : l.review_written, { path }) + (cut ? '\n' + l.review_trimmed : '')
}

function statusText(): string {
  const code = settings.language.code
  const l = labels(code)
  return say(l.status, {
    state: enabled ? l.state_on : l.state_off,
    language: nameOf(settings.language, code), language_source: sourceName(l, settings.language.source),
    detail: detailName(l, settings.detail.value), detail_source: sourceName(l, settings.detail.source),
    adhd: settings.adhd.value ? l.state_on : l.state_off, adhd_source: sourceName(l, settings.adhd.source),
    notes: count(code, l.notes, tally.notes), edits: count(code, l.edits, tally.edits),
    unexplained: tally.unexplained, files: count(code, l.files, tally.outside),
    log: partPath(root, session, part),
  })
}

export function register(on: any, pluginOptions: any) {
  reset()
  options = pluginOptions && typeof pluginOptions === 'object' ? pluginOptions : {}

  on('session.start', async ($: any, e: any, next: any) => {
    interactive = e.isInteractive !== false
    try {
      await start($)
      await $.tool.register(NOTE_SPEC)
      await $.tool.register(RECAP_SPEC)
      await $.command.register({
        name: PLUGIN,
        description: 'inloop: the review of Claude\'s work, the language and form of notes, on and off',
        argumentHint: '[review [range | all] [--theme light|dark] | status | lang <language> | detail <level> | adhd on|off | on | off | help]',
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
    const source = e.source === 'reconstructed' ? 'reconstructed' : 'live'
    // an explanation of code that already exists is not the reason for the next edit
    if (source === 'live') {
      pairing.addNote(agentOf(e) ?? 'main', id, clean.files.map((f) => relative(f, root)))
      waitingNotes.push({ id, files: clean.files.map((f) => relative(f, root)) })
    }
    numbers.set(id, tally.notes)
    try {
      await append($, { v: SCHEMA, kind: 'note', ts: now(), session, agent: agentOf(e), turn, id, n: tally.notes, source, note: clean, problems })
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

  // The note's and the recap's rows in the transcript, drawn as cards in the reader's language.
  // A card is drawn from the call's input alone, cleaned and redacted as the log is.
  on('ui.render', { component: 'ToolUse', props: { tool: ['mcp__inloop__note', 'mcp__inloop__recap'] } }, ($: any, e: any, next: any) => {
    if (e.props.isErrored) return next(e)
    const t = $.ui.resolve(e)
    const l = labels(settings.language.code)
    const input = e.props.input && typeof e.props.input === 'object' ? e.props.input : {}
    if (e.props.tool === 'mcp__inloop__recap') return recapCard(t, redactDeep(cleanRecap(input).recap).value, l)
    return noteCard(t, redactDeep(cleanNote(input).note).value, numbers.get(e.props.tool_use_id) ?? null, input.source === 'reconstructed', l)
  }).catch(($: any, e: any, next: any) => next(e))

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

  // Commits are made through the shell: after each command, a move of HEAD is recorded as the new
  // commits. The command itself is never touched.
  on('tool.call', { tool: ['Bash', 'PowerShell'] }, async ($: any, e: any, next: any) => {
    const result = await next(e)
    if (ready && enabled && git) {
      try {
        await checkHead($)
      } catch {
        // the end of the turn checks again
      }
    }
    return result
  }).catch(async ($: any, e: any, next: any) => next(e)) // replay-safe: a command that ran is not run again

  on('turn.complete', async ($: any, e: any, next: any) => {
    const result = await next(e)
    if (agentOf(e) || e.isAborted || !ready || !enabled) return result
    let outside = false
    try {
      await checkHead($)
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
    if (command === 'review') {
      const at = rest.indexOf('--theme')
      const wanted = at >= 0 ? rest[at + 1] : ''
      const theme: Theme = wanted === 'light' || wanted === 'dark' ? wanted : 'auto'
      const target = rest.filter((_, i) => at < 0 || (i !== at && i !== at + 1))[0] ?? ''
      try {
        return { text: await review($, target, theme, l) }
      } catch (err) {
        return { text: say(l.review_failed, { error: String(err) }) }
      }
    }
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
        return { text: say(after.lang_reset, { language: nameOf(settings.language, settings.language.code), source: sourceName(after, settings.language.source) }) }
      }
      const lang = parseLanguage(value)
      if (!lang) return { text: l.lang_missing }
      await setSetting($, 'language', lang.code ?? lang.english, project)
      const after = labels(settings.language.code)
      const ui = settings.language.code
      const said = [say(project ? after.lang_project : after.lang_user, { language: nameOf(lang, ui) })]
      if (!project && settings.language.source === 'project') said.push(say(after.lang_project_wins, { language: nameOf(settings.language, ui) }))
      if (!hasLabels(lang.code)) said.push(say(after.lang_no_labels, { language: nameOf(lang, ui) }))
      return { text: said.join('\n') }
    }
    if (command === 'detail') {
      if (value === 'reset') {
        if (!project) await setSetting($, 'detail', null, false)
        await setSetting($, 'detail', null, true)
        return { text: say(l.detail_reset, { detail: detailName(l, settings.detail.value), source: sourceName(l, settings.detail.source) }) }
      }
      const level = parseDetail(value)
      if (!level) return { text: l.detail_bad }
      await setSetting($, 'detail', level, project)
      const said = [say(project ? l.detail_project : l.detail_user, { detail: detailName(l, level) })]
      if (!project && settings.detail.source === 'project') said.push(say(l.detail_project_wins, { detail: detailName(l, settings.detail.value) }))
      return { text: said.join('\n') }
    }
    if (command === 'adhd') {
      if (value === 'reset') {
        if (!project) await setSetting($, 'adhd', null, false)
        await setSetting($, 'adhd', null, true)
        const after = labels(settings.language.code)
        return { text: say(after.adhd_reset, { state: settings.adhd.value ? after.state_on : after.state_off, source: sourceName(after, settings.adhd.source) }) }
      }
      const wanted = parseAdhd(value)
      if (wanted === null) return { text: l.adhd_bad }
      await setSetting($, 'adhd', wanted ? 'on' : 'off', project)
      const after = labels(settings.language.code)
      const said = [project ? (wanted ? after.adhd_on_project : after.adhd_off_project) : (wanted ? after.adhd_on_user : after.adhd_off_user)]
      if (!project && settings.adhd.source === 'project') said.push(say(after.adhd_project_wins, { state: settings.adhd.value ? after.state_on : after.state_off }))
      return { text: said.join('\n') }
    }
    return { text: say(l.unknown, { command }) + '\n' + l.help }
  }).catch(async () => ({ text: 'inloop could not run that command.' }))
}
