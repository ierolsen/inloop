// Changes made outside the edit tools (shell commands, other tools), found through git: every file
// that changed since the session started and has no logged edit. Plain module: the git commands
// run in register.ts; this file only reads their output.

export const OUTSIDE_MAX = 40 // files shown with a diff; the rest are counted

// `git ... -z` output: NUL-separated paths
export function nul(stdout: string): string[] {
  return stdout.split('\u0000').filter(Boolean)
}

// `git status --porcelain=v1 -z`: "XY path", and for a rename or copy a second field, the old path.
export function porcelain(stdout: string): string[] {
  const fields = stdout.split('\u0000')
  const paths: string[] = []
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]
    if (field.length < 4) continue
    const xy = field.slice(0, 2)
    paths.push(field.slice(3))
    if (xy[0] === 'R' || xy[0] === 'C') i++ // skip the old path
  }
  return paths
}

// inloop's own folder, which no list of changes includes
export const inloopOwn = (path: string) => path === '.inloop' || path.startsWith('.inloop/')

// Files changed since the baseline that inloop has no edit for, in a stable order.
// `changed` and `untracked` come from git now; `dirty` was changed already when the session started.
export function unaccounted(changed: string[], untracked: string[], logged: Set<string>, dirty: Set<string>): string[] {
  const seen = new Set<string>()
  for (const path of [...changed, ...untracked]) {
    if (inloopOwn(path) || logged.has(path) || dirty.has(path)) continue
    seen.add(path)
  }
  return [...seen].sort()
}

// added, modified or deleted, from what git knows of the file
export function state(path: string, untracked: Set<string>, deleted: Set<string>): 'added' | 'modified' | 'deleted' {
  if (deleted.has(path)) return 'deleted'
  if (untracked.has(path)) return 'added'
  return 'modified'
}

// `git diff` output for one file, without its header: from the first hunk on
export function hunks(gitDiff: string): string {
  const at = gitDiff.indexOf('\n@@')
  if (at === -1) return gitDiff.startsWith('@@') ? gitDiff.trimEnd() : ''
  return gitDiff.slice(at + 1).trimEnd()
}

// lines added and removed in a hunk text
export function counts(hunkText: string): { added: number; removed: number } {
  let added = 0, removed = 0
  for (const line of hunkText.split('\n')) {
    if (line.startsWith('+')) added++
    else if (line.startsWith('-')) removed++
  }
  return { added, removed }
}
