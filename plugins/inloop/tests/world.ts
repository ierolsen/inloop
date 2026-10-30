// A project held in memory for the engine tests: its files, its git, the store and the session,
// answered beneath the plugin, so every call inloop makes on `$` lands here.
import type { On } from 'claude-code'
import { mock } from 'claude-code/testing'

export const ROOT = '/work'
export const SESSION_ID = 'sess-1'
export const LOG = ROOT + '/.inloop/log/' + SESSION_ID + '.jsonl'
export const START = { cwd: ROOT, surface: 'terminal', isInteractive: true } as const
export const COMPOSE = { model: 'claude-opus-5-5', promptModel: 'claude-opus-5-5', surfaces: ['terminal'], tools: [], outputStyle: null, traits: [] } as const

// A command line inloop runs (git, uname, open), to what it prints; a line not listed fails.
export type Git = Record<string, string>

export type World = {
  files: Map<string, string>
  tools: string[]
  commands: Record<string, unknown>[]
  lines: string[]
  invalidated: string[]
  git: Git | null
  broken: { fs: boolean }
  refused: Set<string> // paths whose edits the person refuses
  ran: string[] // command lines inloop ran, git's and others'
  panes: Map<string, boolean> // open panes, and whether each found room
  room: boolean // whether a pane that opens finds room
  toasts: string[]
  shell: ((command: string) => void) | null // what a Bash call does in this world, such as making a commit
  asked: any[] // the questions put to the person in Claude Code's dialog
  answer: string | null // what the person picks there; null dismisses the question
  // the log of this session as inloop wrote it, line by line
  records: () => any[]
}

export function worldOf(on: On, given: { files?: Record<string, string>; git?: Git | null; store?: Record<string, unknown>; repo?: boolean } = {}): World {
  const world: World = {
    files: new Map(Object.entries(given.files ?? {})),
    tools: [],
    commands: [],
    lines: [],
    invalidated: [],
    git: given.git ?? null,
    broken: { fs: false },
    refused: new Set(),
    ran: [],
    panes: new Map(),
    room: true,
    toasts: [],
    shell: null,
    asked: [],
    answer: null,
    records: () => (world.files.get(LOG) ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
  }
  const files = world.files
  const fs = () => {
    if (world.broken.fs) throw new Error('disk on fire')
  }

  on('fs.exists', ($: any, e: any) => { fs(); return { value: files.has(e.path) } })
  on('fs.read', ($: any, e: any) => {
    fs()
    if (!files.has(e.path)) throw new Error('ENOENT: ' + e.path)
    return { value: files.get(e.path) }
  })
  on('fs.write', ($: any, e: any) => { fs(); files.set(e.path, e.text); return { value: undefined } })
  on('fs.stat', ($: any, e: any) => {
    fs()
    if (!files.has(e.path)) throw new Error('ENOENT: ' + e.path)
    return { value: { kind: 'file', size: (files.get(e.path) ?? '').length, mtimeMs: 0, isLink: false } }
  })
  mock.store(on, given.store ?? {})
  on('fs.list', ($: any, e: any) => {
    fs()
    const dir = String(e.path).replace(/\/+$/, '') + '/'
    const names = [...files.keys()].filter((k) => k.startsWith(dir) && !k.slice(dir.length).includes('/')).map((k) => k.slice(dir.length))
    return { value: names.sort().map((name) => ({ name, kind: 'file', size: (files.get(dir + name) ?? '').length, isLink: false })) }
  })
  on('process.run', ($: any, e: any) => {
    const command = e.argv.join(' ')
    world.ran.push(command)
    const out = world.git ? world.git[command] : undefined
    return { value: out === undefined ? { exitCode: 128, stdout: '', stderr: 'fatal: ' + command } : { exitCode: 0, stdout: out, stderr: '' } }
  })
  on('session.id', () => ({ value: SESSION_ID }))
  on('session.root', () => ({ value: ROOT }))
  on('session.repo', () => ({ value: given.repo === false ? null : { root: ROOT, remote: null, internal: false, name: 'work' } }))
  on('tool.register', ($: any, e: any) => { world.tools.push(e.name); return { value: { tool: 'mcp__inloop__' + e.name } } })
  on('command.register', ($: any, e: any) => { world.commands.push(e); return { value: { command: e.name } } })
  on('ui.log', ($: any, e: any) => { world.lines.push(e.text); return { value: undefined } })
  // invalidations are noted and passed on, so a mounted drawing follows them
  on('ui.invalidate', ($: any, e: any, next: any) => { world.invalidated.push(e.event); return next(e) })
  on('ui.open', ($: any, e: any) => { world.panes.set(e.id, world.room); return { value: undefined } })
  on('ui.close', ($: any, e: any) => { world.panes.delete(e.id); return { value: undefined } })
  on('ui.panes', () => ({ value: [...world.panes].map(([id, placed]) => ({ id, title: id, isShown: true, isFocused: true, isPlaced: placed })) }))
  on('ui.toast', ($: any, e: any) => { world.toasts.push(e.text); return { value: undefined } })

  // the engine's own answers, beneath every plugin
  on('session.start', ($: any, e: any) => ({ cwd: e.cwd }))
  on('prompt.compose', () => ({ sections: [{ id: 'core:intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  on('tool.describe', ($: any, e: any) => ({ description: e.description }))
  on('turn.start', ($: any, e: any) => ({ turnId: e.turnId }))
  on('turn.complete', ($: any, e: any) => ({ text: e.answer }))
  // the built-in edit tools, run against the files above
  on('tool.call', ($: any, e: any) => {
    // $.ui.ask reaches the engine as a call to AskUserQuestion
    if (e.tool === 'AskUserQuestion') {
      world.asked.push(e.questions[0])
      if (world.answer === null) return { deny: 'The person dismissed the question.' }
      return { result: { answers: { [e.questions[0].question]: world.answer } } }
    }
    if (e.tool === 'Bash') {
      world.shell?.(String(e.command))
      return { result: { stdout: '', stderr: '', interrupted: false } }
    }
    const path = String(e.file_path)
    if (world.refused.has(path)) return { deny: 'The user refused this edit.' }
    if (e.tool === 'Write') files.set(path, String(e.content))
    else if (e.tool === 'Edit') {
      const text = files.get(path) ?? ''
      files.set(path, e.replace_all ? text.split(e.old_string).join(e.new_string) : text.replace(e.old_string, e.new_string))
    } else throw new Error('no tool ' + e.tool + ' in this world')
    return { result: 'ok' }
  })
  return world
}

// The calls a test makes most, with the fields the engine always sends
export const command = (args: string) => ({ command: 'inloop', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } }) as any
export const turnDone = (turnId: string, more: Record<string, unknown> = {}) => ({ answer: 'Done.', durationMs: 5, isAborted: false, turnId, reason: 'answer', ...more }) as any
export const note = (fields: Record<string, unknown>) => ({ tool: 'mcp__inloop__note', tldr: 'The point.', ...fields }) as any
