// Diffs as lines with their old and new numbers: from git's patches, from inloop's own diffs, from
// a new file's text, and from a file as it stands for code that is explained rather than changed.
// Plain module.

export type Line = { kind: '+' | '-' | ' '; text: string; old: number | null; new: number | null }
export type Hunk = { oldStart: number; newStart: number; lines: Line[] }
export type Status = 'added' | 'modified' | 'deleted' | 'renamed'
export type FilePatch = {
  path: string
  oldPath: string | null
  status: Status
  binary: boolean
  hunks: Hunk[]
  added: number
  removed: number
}

const count = (p: FilePatch) => {
  p.added = 0
  p.removed = 0
  for (const h of p.hunks) for (const l of h.lines) l.kind === '+' ? p.added++ : l.kind === '-' ? p.removed++ : 0
  return p
}

// git's quoted paths ("a/na\303\257ve.py") back to text; plain paths stay as they are
function unquote(path: string): string {
  if (!path.startsWith('"')) return path
  const bytes: number[] = []
  const body = path.slice(1, -1)
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\') {
      const next = body[i + 1]
      if (/[0-7]/.test(next)) { bytes.push(parseInt(body.slice(i + 1, i + 4), 8)); i += 3; continue }
      bytes.push(({ n: 10, t: 9, '"': 34, '\\': 92 } as Record<string, number>)[next] ?? next.charCodeAt(0))
      i += 1
      continue
    }
    bytes.push(...new TextEncoder().encode(body[i]))
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

const strip = (path: string) => unquote(path.trim()).replace(/^[ab]\//, '')

// The hunks of one file's diff text: "@@ -a,b +c,d @@" headers and the lines under them.
export function parseHunks(text: string): Hunk[] {
  const hunks: Hunk[] = []
  let hunk: Hunk | null = null
  let o = 0
  let n = 0
  for (const raw of text.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (h) {
      o = Number(h[1])
      n = Number(h[2])
      hunk = { oldStart: o, newStart: n, lines: [] }
      hunks.push(hunk)
      continue
    }
    if (!hunk) continue
    const mark = raw[0]
    if (mark === '+') hunk.lines.push({ kind: '+', text: raw.slice(1), old: null, new: n++ })
    else if (mark === '-') hunk.lines.push({ kind: '-', text: raw.slice(1), old: o++, new: null })
    else if (mark === ' ') hunk.lines.push({ kind: ' ', text: raw.slice(1), old: o++, new: n++ })
    // "\ No newline at end of file" and anything else is left out
  }
  return hunks.filter((x) => x.lines.length)
}

// A whole patch from git (git diff, git show, git diff-tree -p), one entry per file.
export function parsePatch(text: string): FilePatch[] {
  const files: FilePatch[] = []
  let file: FilePatch | null = null
  let body: string[] = []
  const finish = () => {
    if (!file) return
    file.hunks = parseHunks(body.join('\n'))
    files.push(count(file))
    file = null
    body = []
  }
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      finish()
      const m = /^diff --git (".*?"|\S+) (".*?"|\S+)$/.exec(raw)
      const path = m ? strip(m[2]) : raw.slice(11)
      file = { path, oldPath: null, status: 'modified', binary: false, hunks: [], added: 0, removed: 0 }
      continue
    }
    if (!file) continue
    const f: FilePatch = file
    if (raw.startsWith('@@') || body.length) { body.push(raw); continue }
    if (raw.startsWith('new file mode')) f.status = 'added'
    else if (raw.startsWith('deleted file mode')) f.status = 'deleted'
    else if (raw.startsWith('rename from ')) { f.status = 'renamed'; f.oldPath = unquote(raw.slice(12)) }
    else if (raw.startsWith('rename to ')) f.path = unquote(raw.slice(10))
    else if (raw.startsWith('Binary files ') || raw === 'GIT binary patch') f.binary = true
    else if (raw.startsWith('+++ ') && !raw.startsWith('+++ /dev/null')) f.path = strip(raw.slice(4))
    else if (raw.startsWith('--- ') && f.status === 'deleted') f.path = strip(raw.slice(4))
  }
  finish()
  return files
}

// A file that did not exist before: all its lines added
export function added(path: string, text: string): FilePatch {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  const hunk: Hunk = { oldStart: 0, newStart: 1, lines: lines.map((t, i) => ({ kind: '+' as const, text: t, old: null, new: i + 1 })) }
  return count({ path, oldPath: null, status: 'added', binary: false, hunks: text ? [hunk] : [], added: 0, removed: 0 })
}

// A file as it stands, for code that is explained rather than changed: around the given lines when
// the file is long (window lines on each side), whole when it is short.
export function current(path: string, text: string, focus: number[] = [], whole = 400, window = 12): FilePatch {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
  const keep = new Set<number>()
  if (lines.length <= whole || !focus.length) for (let i = 0; i < Math.min(lines.length, whole); i++) keep.add(i)
  else for (const f of focus) for (let i = Math.max(0, f - window); i <= Math.min(lines.length - 1, f + window); i++) keep.add(i)
  const hunks: Hunk[] = []
  let hunk: Hunk | null = null
  for (let i = 0; i < lines.length; i++) {
    if (!keep.has(i)) { hunk = null; continue }
    if (!hunk) { hunk = { oldStart: i + 1, newStart: i + 1, lines: [] }; hunks.push(hunk) }
    hunk.lines.push({ kind: ' ', text: lines[i], old: i + 1, new: i + 1 })
  }
  return { path, oldPath: null, status: 'modified', binary: false, hunks, added: 0, removed: 0 }
}

// Every line of a patch in order, with null between hunks where lines are left out
export function flat(p: FilePatch): (Line | null)[] {
  const out: (Line | null)[] = []
  p.hunks.forEach((h, i) => {
    if (i > 0) out.push(null)
    out.push(...h.lines)
  })
  return out
}

export const lineCount = (p: FilePatch) => p.hunks.reduce((sum, h) => sum + h.lines.length, 0)

// The patch cut after max lines. The counts of added and removed lines stay those of the whole
// change, which is what the file's header reports.
export function clip(p: FilePatch, max: number): FilePatch {
  const hunks: Hunk[] = []
  let left = max
  for (const h of p.hunks) {
    if (left <= 0) break
    const lines = h.lines.slice(0, left)
    left -= lines.length
    hunks.push({ ...h, lines })
  }
  return { ...p, hunks }
}
