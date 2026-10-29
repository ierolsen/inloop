// A line diff of a file before and after an edit, as a unified diff with three lines of context.
// Plain module: no mods API calls here.

export type Diff = {
  text: string // unified diff hunks, without the ---/+++ header
  added: number
  removed: number
  truncated: boolean // the hunks were cut at `maxLines`
}

type Op = { kind: ' ' | '-' | '+'; line: string; a: number; b: number }

const CONTEXT = 3
const LINE_MAX = 400 // characters of one line kept in the diff
const MYERS_MAX = 4000 // lines left after trimming; longer middles are shown as replaced

export function lines(text: string): string[] {
  if (text === '') return []
  const parts = text.replace(/\r\n/g, '\n').split('\n')
  if (parts[parts.length - 1] === '') parts.pop()
  return parts
}

export function isBinary(text: string): boolean {
  return text.indexOf('\u0000') !== -1
}

// The shortest edit script between a and b (Myers), as one op per line.
function script(a: string[], b: string[]): Op[] {
  const ops: Op[] = []
  // equal lines at both ends need no search
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length, endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  for (let i = 0; i < start; i++) ops.push({ kind: ' ', line: a[i], a: i, b: i })
  const midA = a.slice(start, endA), midB = b.slice(start, endB)
  const middle = midA.length + midB.length > MYERS_MAX ? replaced(midA, midB) : myers(midA, midB)
  for (const op of middle) ops.push({ ...op, a: op.a + start, b: op.b + start })
  for (let i = 0; i < a.length - endA; i++) ops.push({ kind: ' ', line: a[endA + i], a: endA + i, b: endB + i })
  return ops
}

function replaced(a: string[], b: string[]): Op[] {
  return [...a.map((line, i) => ({ kind: '-' as const, line, a: i, b: 0 })), ...b.map((line, i) => ({ kind: '+' as const, line, a: a.length, b: i }))]
}

function myers(a: string[], b: string[]): Op[] {
  const n = a.length, m = b.length, max = n + m
  if (max === 0) return []
  const offset = max + 1
  let v = new Int32Array(2 * max + 3)
  const trace: Int32Array[] = []
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice())
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1
      let y = x - k
      while (x < n && y < m && a[x] === b[y]) { x++; y++ }
      v[offset + k] = x
      if (x >= n && y >= m) return backtrack(trace, a, b, offset)
    }
  }
  return replaced(a, b)
}

function backtrack(trace: Int32Array[], a: string[], b: string[], offset: number): Op[] {
  const ops: Op[] = []
  let x = a.length, y = b.length
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d]
    const k = x - y
    const prevK = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? k + 1 : k - 1
    const prevX = v[offset + prevK]
    const prevY = prevX - prevK
    while (x > prevX && y > prevY) { x--; y--; ops.push({ kind: ' ', line: a[x], a: x, b: y }) }
    if (d > 0) {
      if (x === prevX) { y--; ops.push({ kind: '+', line: b[y], a: x, b: y }) }
      else { x--; ops.push({ kind: '-', line: a[x], a: x, b: y }) }
    }
  }
  return ops.reverse()
}

const clip = (line: string) => (line.length > LINE_MAX ? line.slice(0, LINE_MAX) + '…' : line)

// The unified diff of two texts. `maxLines` caps the hunk lines kept (counts stay exact).
export function diff(before: string, after: string, maxLines = 400): Diff {
  const ops = script(lines(before), lines(after))
  let added = 0, removed = 0
  for (const op of ops) { if (op.kind === '+') added++; else if (op.kind === '-') removed++ }
  if (!added && !removed) return { text: '', added, removed, truncated: false }
  // changes closer than two contexts apart share a hunk; each hunk keeps CONTEXT lines around it
  const changed = ops.map((o, i) => (o.kind === ' ' ? -1 : i)).filter((i) => i >= 0)
  const groups: number[][] = []
  for (const i of changed) {
    const group = groups[groups.length - 1]
    if (group && i - group[group.length - 1] - 1 <= 2 * CONTEXT) group.push(i)
    else groups.push([i])
  }
  const hunks = groups.map((g) => ops.slice(Math.max(0, g[0] - CONTEXT), Math.min(ops.length, g[g.length - 1] + CONTEXT + 1)))
  const out: string[] = []
  let truncated = false
  for (const hunk of hunks) {
    const aLines = hunk.filter((o) => o.kind !== '+').length
    const bLines = hunk.filter((o) => o.kind !== '-').length
    // 1-based first line on each side; with no lines on a side, the line before (as diff does)
    const aStart = hunk[0].a + (aLines ? 1 : 0)
    const bStart = hunk[0].b + (bLines ? 1 : 0)
    const lines = ['@@ -' + aStart + ',' + aLines + ' +' + bStart + ',' + bLines + ' @@', ...hunk.map((o) => o.kind + clip(o.line))]
    if (out.length + lines.length > maxLines) {
      out.push(...lines.slice(0, Math.max(0, maxLines - out.length)))
      truncated = true
      break
    }
    out.push(...lines)
  }
  return { text: out.join('\n'), added, removed, truncated }
}

// A diff a strict hunk reader takes, within max characters. Every hunk header is counted again
// from the lines under it, because a stored diff can end in a hunk cut short whose header still
// counts the lines that were cut; the text stops at a line boundary.
export function fitDiff(text: string, max: number): { text: string; cut: boolean } {
  const out: string[] = []
  let size = 0
  let cut = false
  let hunk: { o: number; n: number; lines: string[] } | null = null
  const flush = () => {
    if (!hunk || !hunk.lines.length) return
    const old = hunk.lines.filter((x) => x[0] !== '+').length
    const now = hunk.lines.filter((x) => x[0] !== '-').length
    out.push('@@ -' + hunk.o + ',' + old + ' +' + hunk.n + ',' + now + ' @@', ...hunk.lines)
  }
  for (const raw of text.split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw)
    if (h) {
      flush()
      hunk = { o: Number(h[1]), n: Number(h[2]), lines: [] }
      size += 40
      continue
    }
    if (!hunk || !/^[ +-]/.test(raw)) continue // "\ No newline at end of file" and stray lines
    if (size + raw.length + 1 > max) {
      cut = true
      break
    }
    hunk.lines.push(raw)
    size += raw.length + 1
  }
  flush()
  return { text: out.join('\n'), cut }
}
