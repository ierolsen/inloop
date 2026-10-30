// inloop's hooks module: the only file that calls the mods API. Every other module under hooks/ is
// plain code that takes values and returns values (see CLAUDE.md).

import { resolve, language as parseLanguage, level as parseLevel, adhd as parseAdhd, languageName, type Settings } from './config.ts'
import { instructions, NOTE_SPEC, RECAP_SPEC } from './instructions.ts'
import { cleanNote, cleanRecap, relative, inside, sameFile, Pairing } from './note.ts'
import { diff, isBinary } from './diff.ts'
import { redact, redactDeep, sensitive } from './redact.ts'
import { SCHEMA, DIR, LOG_DIR, REVIEW_DIR, SHARE_DIR, CONFIG, PART_BYTES, line, parse, partPath, bytes, sessionsOf, type LogRecord, type OutsideEntry, type Skipped } from './log.ts'
import { nul, porcelain, unaccounted, state, hunks, counts, inloopOwn, OUTSIDE_MAX } from './outside.ts'
import { labels, hasLabels, say, count, nameOf, shownIn } from './i18n/index.ts'
import type { Labels } from './i18n/en.ts'
import { build as buildReview, type GitCommit, type FileData, type Review } from './review/review.ts'
import { fit as fitReview, type Mode } from './review/page.ts'
import { explore, parseBlame, covers, fileId, dirId, UNCOMMITTED, type FileState, type BlameInfo } from './review/explorer.ts'
import { markdown, MARKER, COMMENT_MAX } from './review/markdown.ts'
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
const EXPLORE_FILES = 40 // files a page shows the code of, with who wrote each line
const EXPLORE_LINES = 2000 // a longer file is shown by its changes only
const SHARE_MD_MAX = 1_000_000 // characters of the Markdown beside a shared page
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
  prompt = instructions(PLUGIN, settings.language, settings.level.value, settings.adhd.value)
}

// Sets (or, with null, removes) one setting for this project or across projects, then reloads them.
// The level replaced the first builds' "detail": setting or clearing the level clears that too.
async function setSetting($: any, key: 'language' | 'level' | 'adhd', value: string | null, project: boolean) {
  const keys = key === 'level' ? ['level', 'detail'] : [key]
  if (project) {
    const current = await readProject($)
    if (value === null && !keys.some((k) => k in current)) return loadSettings($)
    for (const k of keys) delete current[k]
    if (value !== null) current[key] = value
    await keepOutOfGit($)
    await $.fs.write(root + '/' + CONFIG, JSON.stringify(current, null, 2) + '\n')
  } else {
    const current = await readUser($)
    for (const k of keys) delete current[k]
    if (value !== null) current[key] = value
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
      language: languageName(settings.language), language_code: settings.language.code, level: settings.level.value, adhd: settings.adhd.value, version: VERSION,
    })
  }
  await takeBaseline($)
  ready = true
}

const levelName = (l: Labels, value: string) => l[('level_' + value.replace('-', '_')) as 'level_full'] ?? value
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

// Whether this computer is a Mac, where `open` shows pages and folders
async function onMac($: any): Promise<boolean> {
  try {
    return (await $.process.run(['uname', '-s'], { cwd: root, timeoutMs: 5000 })).stdout.trim() === 'Darwin'
  } catch {
    return false // no uname: not a Mac
  }
}

// Opens a page in the browser, where a person can see one. False when it could not.
async function show($: any, path: string): Promise<boolean> {
  if (!interactive) return false
  let argv = ['xdg-open', path]
  if (/^[A-Za-z]:\//.test(path)) argv = ['cmd', '/c', 'start', '', path.replace(/\//g, '\\')]
  else if (await onMac($)) argv = ['open', path]
  try {
    return (await $.process.run(argv, { cwd: root, timeoutMs: 15000 })).exitCode === 0
  } catch {
    return false
  }
}

// Shows a file in the file manager (Finder on a Mac), ready to attach to an email. False when it
// could not.
async function reveal($: any, path: string): Promise<boolean> {
  if (!interactive) return false
  let argv = ['xdg-open', path.slice(0, path.lastIndexOf('/')) || root]
  if (/^[A-Za-z]:\//.test(path)) argv = ['explorer', '/select,' + path.replace(/\//g, '\\')]
  else if (await onMac($)) argv = ['open', '-R', path]
  try {
    const r = await $.process.run(argv, { cwd: root, timeoutMs: 15000 })
    return r.exitCode === 0 || argv[0] === 'explorer' // explorer answers 1 even when it opened
  } catch {
    return false
  }
}

// The commit a range ends at, in git's terms: the first commit it names that is not excluded
// ("^"). Null when git names none.
async function endOf($: any, what: string): Promise<string | null> {
  const r = await gitRun($, ['git', 'rev-parse', '--revs-only', what])
  if (!r.ok) return null
  return r.out.split('\n').map((x) => x.trim()).find((x) => /^[0-9a-f]{7,64}$/.test(x)) ?? null
}

// The files a page covers, as they stand at its end (a commit, or the working folder when `end` is
// null), with the commit that last changed each line. The files with explanations come first when
// there are more than a page shows the code of.
async function fileStates($: any, model: Review, end: string | null, extra: string[]): Promise<{ states: FileState[]; info: Map<string, BlameInfo> }> {
  const groups = [...model.groups, ...(model.explained ? [model.explained] : [])]
  const paths: string[] = []
  const add = (p: string) => { if (p && !paths.includes(p) && !inloopOwn(p)) paths.push(p) }
  for (const g of groups) for (const f of g.files) add(f.data.patch.path)
  extra.forEach(add)
  // what the reader asked for first, then the files with explanations
  const rank = (p: string) => (extra.includes(p) ? 2 : groups.some((g) => g.notes.some((r) => covers(r, p))) ? 1 : 0)
  const keep = new Set([...paths].sort((a, b) => rank(b) - rank(a)).slice(0, EXPLORE_FILES))
  const info = new Map<string, BlameInfo>()
  const states: FileState[] = []
  for (const path of paths) {
    const state: FileState = { path, text: null, hidden: null, blame: null }
    states.push(state)
    if (sensitive(path)) { state.hidden = 'sensitive'; continue }
    if (!keep.has(path)) { state.hidden = 'not-shown'; continue }
    let text: string | null = null
    if (end) {
      const sized = await gitRun($, ['git', 'cat-file', '-s', end + ':' + path])
      const size = Number(sized.out.trim())
      if (!sized.ok || !Number.isFinite(size)) state.hidden = 'deleted'
      else if (size > READ_MAX) state.hidden = 'too-large'
      else {
        const shown = await gitRun($, ['git', 'show', end + ':' + path])
        if (!shown.ok) state.hidden = 'deleted'
        else if (isBinary(shown.out)) state.hidden = 'binary'
        else if (bytes(shown.out) !== size) state.hidden = 'too-large' // cut short on the way
        else text = shown.out
      }
    } else {
      const snap = await snapshot($, root + '/' + path)
      if (!snap.exists) state.hidden = 'deleted'
      else if (snap.skipped === 'binary') state.hidden = 'binary'
      else if (snap.skipped) state.hidden = 'too-large'
      else text = snap.text
    }
    if (text === null) continue
    const total = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length
    if (total > EXPLORE_LINES) { state.hidden = 'too-large'; continue }
    state.text = redact(text).text
    if (!git) continue
    const blamed = await gitRun($, ['git', 'blame', '--porcelain', ...(end ? [end] : []), '--', path])
    if (blamed.ok) {
      const parsed = parseBlame(blamed.out)
      parsed.info.forEach((v, k) => info.set(k, v))
      // a blame that does not cover every line (cut short, or the text changed) is not used
      if (parsed.lines.length === total && [...parsed.lines].every(Boolean)) state.blame = parsed.lines
    } else if (!end) {
      // a file git does not track yet: every line is not committed
      state.blame = new Array(total).fill(UNCOMMITTED)
    }
  }
  return { states, info }
}

// The log as it stands, after a last look at HEAD and at files changed outside the edit tools
async function fresh($: any): Promise<LogRecord[]> {
  await writing
  try {
    await checkHead($)
    await checkOutside($)
  } catch {
    // the page shows what git shows
  }
  return readAll($)
}

// What a page covers: the commits, what is not committed, and the commit the files stand at (null
// for the working folder)
type Scope = { scope: 'session' | 'range' | 'all'; range: string | null; found: { commits: GitCommit[]; more: number }; pending: FileData[] | null; end: string | null }

// This session's work by default, every commit inloop recorded with "all", or a git range or
// commit. A message instead when git does not know the range.
async function scopeOf($: any, what: string, all: LogRecord[], l: Labels): Promise<Scope | string> {
  const scope: Scope['scope'] = what === 'all' ? 'all' : what ? 'range' : 'session'
  if (scope === 'range' && (!/^[\w./~^@{}:+-]+$/.test(what) || what.startsWith('-'))) return say(l.review_bad_range, { range: what })
  const out: Scope = { scope, range: scope === 'range' ? what : null, found: { commits: [], more: 0 }, pending: null, end: null }
  if (!git) return out
  if (scope === 'all') out.found = await recordedCommits($, all)
  else {
    // this session's commits start where HEAD stood when it began; in a repository that had none
    // yet, every commit is the session's
    const got = scope === 'range' ? await commitsOf($, what) : await commitsOf($, firstHead ? firstHead + '..HEAD' : 'HEAD', false)
    if (!got && scope === 'range') return say(l.review_bad_range, { range: what })
    if (got) out.found = got
  }
  if (scope !== 'range') out.pending = await pendingFiles($)
  else out.end = await endOf($, what)
  return out
}

const project = () => root.split('/').pop() || root

function modelOf(s: Scope, all: LogRecord[], explained: { path: string; text: string }[]): Review {
  return buildReview({ records: all, commits: s.found.commits, more: s.found.more, pending: s.pending, explained, git, scope: s.scope, range: s.range, project: project() })
}

type Page = { theme: Theme; mode: Mode; extra: string[]; start: string | null }

// The explorer page of a model, within the size a mod may write
async function pageOf($: any, model: Review, end: string | null, page: Page): Promise<{ html: string; cut: number }> {
  const code = shownIn(settings.language.code)
  const { states, info } = await fileStates($, model, end, page.extra)
  const explorer = explore(model, states, info)
  return fitReview(model, explorer, labels(code), { code, theme: page.theme, version: VERSION, level: model.written ?? settings.level.value, written: !!model.written, mode: page.mode, start: page.start })
}

// Writes a page under .inloop/review and opens it
async function writeAndShow($: any, name: string, theme: Theme, html: string, cut: number, explaining: boolean, l: Labels): Promise<string> {
  const path = root + '/' + REVIEW_DIR + '/' + name + (theme === 'auto' ? '' : '-' + theme) + '.html'
  await keepOutOfGit($)
  await $.fs.write(path, html)
  const opened = await show($, path)
  const said = explaining ? (opened ? l.explain_opened : l.explain_written) : opened ? l.review_opened : l.review_written
  return say(said, { path }) + (cut ? '\n' + l.review_trimmed : '')
}

const nameOfRange = (what: string) => (!what ? 'review' : what === 'all' ? 'review-all' : 'review-' + what.replace(/[^\w.-]+/g, '_').slice(0, 60))

async function review($: any, what: string, theme: Theme, l: Labels): Promise<string> {
  const all = await fresh($)
  const s = await scopeOf($, what, all, l)
  if (typeof s === 'string') return s
  const model = modelOf(s, all, await explainedFiles($, all))
  const { html, cut } = await pageOf($, model, s.end, { theme, mode: 'review', extra: [], start: null })
  return writeAndShow($, nameOfRange(what), theme, html, cut, false, l)
}

// The code as it stands with every explanation inloop has, opened on one file or folder when one
// is named
async function explain($: any, target: string, theme: Theme, l: Labels): Promise<string> {
  const rel = target ? relative(target, root).replace(/^\.\//, '').replace(/\/+$/, '') : ''
  const extra: string[] = []
  let opening: string | null = null
  if (rel) {
    let kind = ''
    try {
      kind = inside(root + '/' + rel, root) && !inloopOwn(rel) ? (await $.fs.stat(root + '/' + rel)).kind : ''
    } catch {
      kind = ''
    }
    if (kind === 'file') {
      extra.push(rel)
      opening = fileId(rel)
    } else if (kind === 'dir' || kind === 'directory') {
      const listed = git ? nul((await gitRun($, ['git', 'ls-files', '-z', '--', rel])).out) : []
      extra.push(...listed.filter((p) => !inloopOwn(p)).slice(0, EXPLORE_FILES))
      opening = dirId(rel)
    } else return say(l.explain_missing, { path: target })
  }
  const all = await fresh($)
  const s = await scopeOf($, 'all', all, l)
  if (typeof s === 'string') return s
  const model = modelOf(s, all, await explainedFiles($, all))
  const { html, cut } = await pageOf($, model, s.end, { theme, mode: 'explain', extra, start: opening ?? 'd-root' })
  return writeAndShow($, 'explain' + (rel ? '-' + rel.replace(/[^\w.-]+/g, '_').slice(0, 60) : ''), theme, html, cut, true, l)
}

// ---- sharing ----------------------------------------------------------------------------------

// gh and git never stop to ask for a password or a choice: the command fails instead, and says so
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1' }
const firstLine = (text: string) => (text.trim().split('\n').find((x) => x.trim()) ?? '').trim().slice(0, 300)

async function ghRun($: any, argv: string[], timeoutMs = 60000): Promise<{ ok: boolean; out: string; err: string }> {
  try {
    const r = await $.process.run(['gh', ...argv], { cwd: root, timeoutMs, env: NO_PROMPT })
    return { ok: r.exitCode === 0, out: r.stdout, err: r.stderr ?? '' }
  } catch (err) {
    return { ok: false, out: '', err: String(err) }
  }
}

type Pr = { number: number; title: string; url: string; head: string; host: string; owner: string; repo: string; commits: string[] }

// The pull request named (a number), or the one for the current branch, as gh sees it. Read only.
async function prOf($: any, which: string, l: Labels): Promise<Pr | string> {
  if (!(await ghRun($, ['--version'], 15000)).ok) return l.share_needs_gh
  const r = await ghRun($, ['pr', 'view', ...(which ? [which] : []), '--json', 'number,title,url,headRefOid,commits'])
  if (!r.ok) {
    if (/no (open )?pull requests? found|could not find pull request|could not resolve to a pullrequest/i.test(r.err)) return which ? say(l.share_no_pr_named, { number: which }) : l.share_no_pr
    if (/gh auth login|not logged in|authentication/i.test(r.err)) return l.share_needs_gh
    return say(l.share_gh_failed, { error: firstLine(r.err) })
  }
  try {
    const v = JSON.parse(r.out)
    const at = /^https?:\/\/([^/]+)\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(String(v.url))
    if (!at || !/^[0-9a-f]{40}$/.test(String(v.headRefOid))) return say(l.share_gh_failed, { error: 'unexpected answer from gh pr view' })
    const commits = (Array.isArray(v.commits) ? v.commits : []).map((c: any) => String(c?.oid ?? '')).filter((x: string) => /^[0-9a-f]{40}$/.test(x))
    return { number: Number(v.number), title: String(v.title ?? ''), url: String(v.url), head: String(v.headRefOid), host: at[1], owner: at[2], repo: at[3], commits }
  } catch {
    return say(l.share_gh_failed, { error: 'unexpected answer from gh pr view' })
  }
}

// gh api for the pull request's own repository, named in full: a fork with an upstream remote could
// otherwise point gh at another one
const api = (pr: Pr, path: string) => [...(pr.host === 'github.com' ? [] : ['--hostname', pr.host]), 'repos/' + pr.owner + '/' + pr.repo + path]

// inloop's earlier comment on the pull request: the one the person wrote that starts with the
// marker. Null when there is none, or when gh cannot say who the person is.
async function ownComment($: any, pr: Pr): Promise<string | null> {
  const who = await ghRun($, ['api', ...(pr.host === 'github.com' ? [] : ['--hostname', pr.host]), 'user', '--jq', '.login'])
  const login = who.out.trim()
  if (!who.ok || !/^[A-Za-z0-9-]+$/.test(login)) return null
  const filter = '.[] | select(.user.login == "' + login + '" and (.body | startswith("' + MARKER + '"))) | .id'
  const r = await ghRun($, ['api', '--paginate', ...api(pr, '/issues/' + pr.number + '/comments'), '--jq', filter])
  return r.ok ? r.out.split('\n').map((x) => x.trim()).filter((x) => /^\d+$/.test(x)).pop() ?? null : null
}

// The commits of a list, in order, the newest REVIEW_COMMITS of them, and how many of them git does
// not have here
async function commitsByOid($: any, oids: string[]): Promise<{ commits: GitCommit[]; more: number; missing: number }> {
  const want = oids.slice(-REVIEW_COMMITS)
  if (!want.length) return { commits: [], more: 0, missing: 0 }
  const r = await gitRun($, ['git', 'log', '--no-walk=sorted', '--ignore-missing', LOG_FORMAT, ...want])
  const commits = (await commitsFrom($, r.ok ? r.out : '')).reverse()
  return { commits, more: oids.length - want.length, missing: want.length - commits.length }
}

const shareFile = (name: string) => root + '/' + SHARE_DIR + '/' + name

// /inloop share [range | all]: the page with a fixed theme and its Markdown, in .inloop/share,
// shown in the file manager to attach to an email
async function share($: any, what: string, theme: Theme, l: Labels): Promise<string> {
  const all = await fresh($)
  const s = await scopeOf($, what, all, l)
  if (typeof s === 'string') return s
  const model = modelOf(s, all, await explainedFiles($, all))
  const code = shownIn(settings.language.code)
  const text = markdown(model, labels(code), { code, level: model.written ?? settings.level.value, version: VERSION, marker: false, max: SHARE_MD_MAX }).text
  const { html, cut } = await pageOf($, model, s.end, { theme: theme === 'auto' ? 'light' : theme, mode: 'review', extra: [], start: null })
  const name = 'inloop-' + project().replace(/[^\w.-]+/g, '_').slice(0, 40) + (what ? '-' + nameOfRange(what).replace(/^review-?/, '') : '')
  const page = shareFile(name + '.html')
  const md = shareFile(name + '.md')
  await keepOutOfGit($)
  await $.fs.write(page, html)
  await $.fs.write(md, text)
  const shown = await reveal($, page)
  return say(l.share_file, { path: page, md }) + (shown ? '\n' + l.share_file_shown : '') + (cut ? '\n' + l.review_trimmed : '')
}

// Writes the comment for a pull request where the person can read it first, with what it was made
// from, and says what --yes will do
async function preview($: any, pr: Pr, l: Labels): Promise<string> {
  const all = await fresh($)
  const got = await commitsByOid($, pr.commits)
  const s: Scope = { scope: 'range', range: say(l.x_pr_range, { number: pr.number }), found: got, pending: null, end: pr.head }
  const model = modelOf(s, all, [])
  const code = shownIn(settings.language.code)
  const { text, cut } = markdown(model, labels(code), { code, level: model.written ?? settings.level.value, version: VERSION, marker: true, max: COMMENT_MAX })
  const comment = await ownComment($, pr)
  const md = shareFile('pr-' + pr.number + '.md')
  await keepOutOfGit($)
  await $.fs.write(md, text)
  await $.fs.write(shareFile('pr-' + pr.number + '.json'), JSON.stringify({ number: pr.number, head: pr.head, url: pr.url, chars: text.length }) + '\n')
  const said = [say(l.share_pr_preview, {
    number: pr.number, title: pr.title, url: pr.url, path: md, chars: text.length, commits: count(code, l.r_commits, got.commits.length),
    action: comment ? l.share_pr_action_update : l.share_pr_action_new,
  })]
  if (got.missing) said.push(count(code, l.share_pr_missing, got.missing))
  if (cut) said.push(l.share_pr_cut)
  return said.join('\n')
}

// Origins of a command a person typed at Claude Code's prompt, or through the remote bridge to it.
// Not `claude -p` ("sdk"): Claude itself can run that from a shell, after a preview of its own.
const TYPED = new Set(['composer', 'bridge'])

// /inloop share pr [n] [--yes]: a preview by default; with --yes, the previewed comment is posted,
// or inloop's earlier comment there replaced, when the pull request has not moved since
async function sharePr($: any, which: string, yes: boolean, origin: string, l: Labels): Promise<string> {
  if (which && !/^\d{1,9}$/.test(which)) return l.share_bad
  if (yes && !TYPED.has(origin)) return l.share_not_typed
  const pr = await prOf($, which, l)
  if (typeof pr === 'string') return pr
  if (!yes) return preview($, pr, l)
  const md = shareFile('pr-' + pr.number + '.md')
  let saved: any = null
  try {
    saved = JSON.parse(await $.fs.read(shareFile('pr-' + pr.number + '.json')))
  } catch {
    saved = null
  }
  let text = ''
  try {
    text = saved && saved.number === pr.number && saved.head === pr.head ? await $.fs.read(md) : ''
  } catch {
    text = ''
  }
  if (!text.trim()) return say(l.share_pr_stale, { number: pr.number }) + '\n' + (await preview($, pr, l))
  if (text.length > COMMENT_MAX + 5000) return say(l.share_pr_too_long, { path: md })
  const body = shareFile('pr-' + pr.number + '.body.json')
  await $.fs.write(body, JSON.stringify({ body: text }))
  const comment = await ownComment($, pr)
  const r = comment
    ? await ghRun($, ['api', '-X', 'PATCH', ...api(pr, '/issues/comments/' + comment), '--input', body, '--jq', '.html_url'])
    : await ghRun($, ['api', '-X', 'POST', ...api(pr, '/issues/' + pr.number + '/comments'), '--input', body, '--jq', '.html_url'])
  if (!r.ok) return say(l.share_gh_failed, { error: firstLine(r.err) })
  return say(comment ? l.share_pr_updated : l.share_pr_posted, { number: pr.number, url: r.out.trim() || pr.url })
}

// /inloop review pr [n]: the pull request fetched into refs/inloop/pr-<n>, reviewed as it stands on
// GitHub
async function reviewPr($: any, which: string, theme: Theme, l: Labels): Promise<string> {
  if (which && !/^\d{1,9}$/.test(which)) return l.share_bad
  if (!git) return l.review_pr_no_git
  const pr = await prOf($, which, l)
  if (typeof pr === 'string') return pr
  // fetch from the remote that is the pull request's repository, else from its address
  const remotes = (await gitRun($, ['git', 'remote', '-v'])).out.split('\n')
  const slug = (pr.owner + '/' + pr.repo).toLowerCase()
  // the owner and repository must be whole path parts: "noterol/shop" is not "erol/shop"
  const named = remotes.map((x) => x.split(/\s+/)).find(([, url = '']) => {
    const u = url.toLowerCase().replace(/\.git$/, '').replace(/\/+$/, '')
    return u.includes(pr.host.toLowerCase()) && (u.endsWith('/' + slug) || u.endsWith(':' + slug))
  })
  const from = named?.[0] ?? 'https://' + pr.host + '/' + pr.owner + '/' + pr.repo + '.git'
  const ref = 'refs/inloop/pr-' + pr.number
  let fetched: { ok: boolean; err: string }
  try {
    const r = await $.process.run(['git', 'fetch', '--no-tags', '--quiet', from, '+refs/pull/' + pr.number + '/head:' + ref], { cwd: root, timeoutMs: 120000, env: NO_PROMPT })
    fetched = { ok: r.exitCode === 0, err: r.stderr ?? '' }
  } catch (err) {
    fetched = { ok: false, err: String(err) }
  }
  if (!fetched.ok) return say(l.review_pr_fetch_failed, { number: pr.number, error: firstLine(fetched.err) })
  const all = await fresh($)
  const got = await commitsByOid($, pr.commits)
  const s: Scope = { scope: 'range', range: say(l.x_pr_range, { number: pr.number }) + (pr.title ? ': ' + pr.title : ''), found: got, pending: null, end: ref }
  const model = modelOf(s, all, [])
  const { html, cut } = await pageOf($, model, s.end, { theme, mode: 'review', extra: [], start: null })
  return writeAndShow($, 'review-pr-' + pr.number, theme, html, cut, false, l)
}

function statusText(): string {
  const code = settings.language.code
  const l = labels(code)
  return say(l.status, {
    state: enabled ? l.state_on : l.state_off,
    language: nameOf(settings.language, code), language_source: sourceName(l, settings.language.source),
    level: levelName(l, settings.level.value), level_source: sourceName(l, settings.level.source),
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
        description: 'inloop: review Claude\'s work, explain the code as it stands, the language and level of notes, on and off',
        argumentHint: '[review [range | all | pr [n]] | explain [path] | share [range | pr [n] [--yes]] | status | lang <language> | level <level> | adhd on|off | on | off | help]',
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
    if (command === 'review' || command === 'explain' || command === 'share') {
      const at = rest.indexOf('--theme')
      const wanted = at >= 0 ? rest[at + 1] : ''
      const theme: Theme = wanted === 'light' || wanted === 'dark' ? wanted : 'auto'
      const args = rest.filter((_, i) => at < 0 || (i !== at && i !== at + 1))
      try {
        if (command === 'explain') return { text: await explain($, args.join(' '), theme, l) }
        if (command === 'review') return { text: args[0] === 'pr' ? await reviewPr($, args[1] ?? '', theme, l) : await review($, args[0] ?? '', theme, l) }
        const [how = 'file', ...more] = args
        const yes = more.includes('--yes')
        const plain = more.filter((w) => w !== '--yes')
        if (how === 'pr') return { text: plain.length > 1 ? l.share_bad : await sharePr($, plain[0] ?? '', yes, String(e.origin?.kind ?? ''), l) }
        if (how === 'link') return { text: l.share_link_later }
        if (yes) return { text: l.share_bad }
        return { text: await share($, how === 'file' ? plain[0] ?? '' : how, theme, l) }
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
    // "detail" is the first builds' name for the level and still works
    if (command === 'level' || command === 'detail') {
      if (value === 'reset') {
        if (!project) await setSetting($, 'level', null, false)
        await setSetting($, 'level', null, true)
        return { text: say(l.level_reset, { level: levelName(l, settings.level.value), source: sourceName(l, settings.level.source) }) }
      }
      const level = parseLevel(value)
      if (!level) return { text: l.level_bad }
      await setSetting($, 'level', level, project)
      const said = [say(project ? l.level_project : l.level_user, { level: levelName(l, level) })]
      if (!project && settings.level.source === 'project') said.push(say(l.level_project_wins, { level: levelName(l, settings.level.value) }))
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
