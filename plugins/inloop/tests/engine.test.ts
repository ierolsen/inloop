// The engine through the events Claude Code raises: a session, turns, notes, edits and commands,
// over a project held in memory (world.ts).
import { expect, test } from 'claude-code/testing'
import { worldOf, ROOT, SESSION_ID, LOG, START, COMPOSE, command, turnDone, note, type Git } from './world.ts'
import { fileId } from '../hooks/review/explorer.ts'

const edits = (w: { records: () => any[] }) => w.records().filter((r) => r.kind === 'edit')
const DESCRIBE = { tool: 'mcp__inloop__note', description: 'Record a note.', provider: { plugin: 'inloop', tier: 'user' } } as any

test('a session writes nothing until it records something; then .inloop/ keeps itself out of git', async ($, on) => {
  const w = worldOf(on)
  expect(await $.session.start(START)).toEqual({ cwd: ROOT })
  expect(w.tools).toEqual(['note', 'recap'])
  expect(w.commands).toEqual([expect.objectContaining({ name: 'inloop', immediate: true })])
  // a session that only talks leaves no trace
  await $.turn.start({ text: 'what does this repo do?', turnId: 't1' })
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('Done.')
  expect([...w.files.keys()]).toEqual([])
  await $.tool.call(note({ title: 'First', files: ['a.py'], what: 'w', why: 'y' }))
  expect(w.files.get(ROOT + '/.inloop/.gitignore')).toBe('*\n')
  expect(w.records().map((r) => r.kind)).toEqual(['session', 'baseline', 'note'])
  expect(w.records()[0]).toMatchObject({ v: 1, session: SESSION_ID, root: ROOT, language: 'English', language_code: 'en', tags: ['review'], version: '0.1.0' })
  expect(w.records()[1]).toMatchObject({ git: false, head: null, dirty: [] })
})

test('the instructions reach the system prompt once, in the language chosen for all projects', async ($, on) => {
  worldOf(on, { store: { settings: { language: 'tr' } } })
  await $.session.start(START)
  const { sections } = await $.prompt.compose(COMPOSE as any)
  expect(sections.map((s) => s.id)).toEqual(['core:intro', 'inloop:instructions'])
  expect(sections[1].scope).toBe('session')
  expect(sections[1].text).toContain('Turkish (Türkçe)')
  expect(await $.tool.describe(DESCRIBE)).toEqual({ description: 'Record a note.', isDeferred: false })
})

test('edits pair with the note before them; after a new prompt, an edit with no note is unexplained', async ($, on) => {
  const w = worldOf(on, { files: { [ROOT + '/util.py']: 'x = 1\n' } })
  await $.session.start(START)
  await $.turn.start({ text: 'add a greeter', turnId: 't1' })
  expect(await $.tool.call(note({ tool_use_id: 'n1', title: 'Add greet()', files: ['greet.py'], what: 'A function that greets.', why: 'The CLI needs it.' }))).toEqual({ result: 'inloop: note 1 saved.' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w1', file_path: ROOT + '/greet.py', content: 'def greet(name):\n    return "hi " + name\n' } as any)
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e1', file_path: ROOT + '/util.py', old_string: 'x = 1', new_string: 'x = 2' } as any)
  // a subagent's note pairs with that subagent's edits only
  await $.tool.call(note({ tool_use_id: 'n2', agentId: 'sub-1', title: 'Tidy util', files: ['util.py'], what: 'w', why: 'y' }))
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e2', agentId: 'sub-1', file_path: ROOT + '/util.py', old_string: 'x = 2', new_string: 'x = 3' } as any)
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('inloop: 2 notes, 3 edits. /inloop review shows them.')

  await $.turn.start({ text: 'say hello instead', turnId: 't2' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e3', file_path: ROOT + '/greet.py', old_string: 'hi', new_string: 'hello' } as any)
  expect((await $.turn.complete(turnDone('t2'))).text).toBe('inloop: 0 notes, 1 edit, 1 without a note. /inloop review shows them.')

  expect(edits(w).map((r) => [r.id, r.note, r.listed, r.agent, r.turn])).toEqual([
    ['w1', 'n1', true, null, 't1'],
    ['e1', 'n1', false, null, 't1'],
    ['e2', 'n2', true, 'sub-1', 't1'],
    ['e3', null, false, null, 't2'],
  ])
  expect(edits(w)[0]).toMatchObject({ tool: 'Write', path: 'greet.py', status: 'ok', created: true, added: 2, removed: 0, skipped: null })
  expect(edits(w)[0].diff).toContain('+def greet(name):\n+    return "hi " + name')
  expect(edits(w)[1]).toMatchObject({ path: 'util.py', created: false, added: 1, removed: 1 })
  expect(edits(w)[1].diff).toContain('-x = 1\n+x = 2')
  const notes = w.records().filter((r) => r.kind === 'note')
  expect(notes.map((r) => [r.n, r.agent, r.source, r.note.title])).toEqual([[1, null, 'live', 'Add greet()'], [2, 'sub-1', 'live', 'Tidy util']])
})

test('a note with a gap is saved and says what is missing; a recap is saved', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  expect(await $.tool.call(note({ title: 'Rename', files: ['a.py'], what: 'Renames x.' }))).toEqual({ result: 'inloop: note 1 saved. Missing: why is empty. Include them in the next note.' })
  expect(await $.tool.call({ tool: 'mcp__inloop__recap', overview: 'Renamed x.', reading_order: [{ file: 'a.py', why: 'the only change' }] } as any)).toEqual({ result: 'inloop: recap saved.' })
  expect(w.records().find((r) => r.kind === 'recap').recap).toMatchObject({ overview: 'Renamed x.', reading_order: [{ file: 'a.py', why: 'the only change' }] })
})

test('secrets never reach the log: tokens are redacted and a .env file is logged by path only', async ($, on) => {
  const w = worldOf(on)
  const key = 'sk-ant-' + 'k'.repeat(32)
  await $.session.start(START)
  await $.turn.start({ text: 'add the client config', turnId: 't1' })
  await $.tool.call(note({ title: 'Config', files: ['config.py', '.env'], what: 'Reads ' + key, why: 'The client needs a key.' }))
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/config.py', content: 'API_KEY = "' + key + '"\nTIMEOUT = 30\n' } as any)
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/.env', content: 'TOKEN=' + key + '\n' } as any)
  expect(w.files.get(LOG)).not.toContain(key)
  const [config, env] = edits(w)
  expect(config.diff).toContain('+API_KEY = "[redacted]"')
  expect(config.diff).toContain('+TIMEOUT = 30')
  expect(config.redactions).toBe(1)
  expect(env).toMatchObject({ path: '.env', skipped: 'sensitive', diff: null, status: 'ok' })
  expect(w.records().find((r) => r.kind === 'note').note.what).toBe('Reads [redacted]')
  // the files themselves are written as Claude asked
  expect(w.files.get(ROOT + '/.env')).toBe('TOKEN=' + key + '\n')
})

test('a refused edit is logged as refused and counts for nothing', async ($, on) => {
  const w = worldOf(on)
  w.refused.add(ROOT + '/a.py')
  await $.session.start(START)
  await $.turn.start({ text: 'go', turnId: 't1' })
  expect(await $.tool.call({ tool: 'Write', file_path: ROOT + '/a.py', content: 'a\n' } as any)).toEqual({ deny: 'The user refused this edit.' })
  expect(edits(w)).toEqual([expect.objectContaining({ path: 'a.py', status: 'denied', created: false, diff: null })])
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('Done.')
})

test('/inloop lang and tags change the next instructions, for all projects or for this one', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  const written = async () => (await $.prompt.compose(COMPOSE as any)).sections.find((s) => s.id === 'inloop:instructions')?.text ?? ''
  expect(await written()).toContain('English')

  // the reply comes in the new language, which has labels of its own
  expect((await $.command.run(command('lang Türkçe'))).text).toBe('inloop notlarının dili bundan sonra tüm projelerde: Türkçe.')
  expect(await written()).toContain('Turkish (Türkçe)')

  expect((await $.command.run(command('lang de --project'))).text).toBe('Sprache der inloop-Notizen ab jetzt, in diesem Projekt: Deutsch.')
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/config.json') ?? '{}')).toEqual({ language: 'de' })
  expect(await written()).toContain('German (Deutsch)')

  // the project's own choice comes first, and the command says so
  expect((await $.command.run(command('lang nl'))).text).toBe('Sprache der inloop-Notizen ab jetzt, in allen Projekten: Niederländisch (Nederlands).\n' +
    'Dieses Projekt hat eine eigene Wahl, Deutsch, die hier Vorrang hat; /inloop lang reset --project entfernt sie.')
  expect((await $.command.run(command('lang reset --project'))).text).toBe('De inloop-notities zijn weer in Nederlands (je instelling voor alle projecten).')
  // the plugin's own setting (its default, English, as /config shows it) is what reset goes back to
  expect((await $.command.run(command('lang reset'))).text).toBe('inloop notes are in English again (the plugin setting).')
  expect((await $.command.run(command('lang'))).text).toBe('Name a language, as in /inloop lang Turkish or /inloop lang de.')
  // a language with no labels: the notes are in it, inloop's own messages stay English
  expect((await $.command.run(command('lang Japanese'))).text).toBe('From now on inloop notes are in Japanese (日本語), in all your projects.\n' +
    'inloop has no labels in Japanese (日本語) yet, so its own messages stay in English; the notes themselves are in Japanese (日本語).')
  expect(await written()).toContain('Japanese (日本語)')
  await $.command.run(command('lang reset'))

  // by default the notes hold what a reviewer needs; the note tool offers those fields in full
  expect(await written()).toContain('The user chose the tags review for these notes. Tag "review"')
  expect(w.tools.filter((t) => t === 'note').length).toBe(1)
  expect((await $.command.run(command('tags learn, review'))).text).toBe('From now on inloop notes hold: review, learn, in all your projects.')
  expect(await written()).toContain('The user chose the tags review, learn for these notes.')
  // a change of tags registers the tools again, with the fields the tags name
  expect(w.tools.filter((t) => t === 'note').length).toBe(2)
  expect((await $.command.run(command('tags summary'))).text).toBe('From now on inloop notes hold: summary, in all your projects.')
  const rules = await written()
  expect(rules).toContain('Tag "summary": keep each note to `tldr`, `what` and `why`')
  expect(rules).not.toContain('`lines` are comments on single lines')
  expect((await $.command.run(command('tags loud'))).text).toStartWith('That is no tag inloop knows. Tags combine, as in /inloop tags review,learn:\n  summary       The point, what changed and why')
  expect((await $.command.run(command('status'))).text).toContain('Notes are in English (the plugin setting), notes hold summary (your setting for all projects), ADHD-friendly off (the plugin setting).')
  expect((await $.command.run(command('tags'))).text).toStartWith('inloop notes hold: summary (your setting for all projects).')
  // the commands and values of earlier versions still work
  expect((await $.command.run(command('level full'))).text).toBe('From now on inloop notes hold: all, in all your projects.')
  expect((await $.command.run(command('detail standard'))).text).toBe('From now on inloop notes hold: review, learn, in all your projects.')
  expect((await $.command.run(command('tags reset'))).text).toBe('inloop notes hold review again (the plugin setting).')
  expect((await $.command.run(command('fly'))).text).toStartWith('inloop has no command "fly".\ninloop commands:')
})

test('/inloop off stops the instructions and the capture for this session; on brings them back', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  expect((await $.command.run(command('off'))).text).toStartWith('inloop is off for this session')
  expect(w.invalidated).toEqual(['tool.describe'])
  expect((await $.prompt.compose(COMPOSE as any)).sections.map((s) => s.id)).toEqual(['core:intro'])
  expect((await $.tool.describe(DESCRIBE)).isDeferred).toBe(true)
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/a.py', content: 'a\n' } as any)
  expect(w.files.get(ROOT + '/a.py')).toBe('a\n')
  expect(edits(w)).toEqual([])

  expect((await $.command.run(command('on'))).text).toBe('inloop is on: Claude writes a note before each change.')
  expect((await $.tool.describe(DESCRIBE)).isDeferred).toBe(false)
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/b.py', content: 'b\n' } as any)
  expect(edits(w).map((r) => r.path)).toEqual(['b.py'])
  expect(w.records().filter((r) => r.kind === 'switch').map((r) => r.on)).toEqual([false, true])
})

test('files changed outside the edit tools are listed when the turn ends, once', async ($, on) => {
  const HEAD = 'abc123'
  const git: Git = {
    'git rev-parse --show-toplevel': ROOT + '\n',
    'git rev-parse --verify --quiet HEAD': HEAD + '\n',
    'git status --porcelain=v1 -z --untracked-files=all': ' M notes.txt\0',
  }
  const w = worldOf(on, { git, files: { [ROOT + '/greet.py']: 'def greet():\n    pass\n' } })
  await $.session.start(START)
  await $.turn.start({ text: 'greet', turnId: 't1' })
  await $.tool.call(note({ title: 'Greeting', files: ['greet.py'], what: 'w', why: 'y' }))
  expect(w.records()[1]).toMatchObject({ kind: 'baseline', git: true, head: HEAD, dirty: ['notes.txt'] })
  await $.tool.call({ tool: 'Edit', file_path: ROOT + '/greet.py', old_string: 'pass', new_string: 'return "hi"' } as any)
  // meanwhile a shell command rewrote run.sh and made gen.py; notes.txt was dirty before the session
  w.files.set(ROOT + '/gen.py', 'print("generated")\n')
  Object.assign(git, {
    ['git diff --name-only -z ' + HEAD]: 'greet.py\0notes.txt\0run.sh\0',
    'git ls-files --others --exclude-standard -z': 'gen.py\0.inloop/log/sess-1.jsonl\0',
    ['git diff --name-only --diff-filter=D -z ' + HEAD]: '',
    ['git diff --no-color --no-ext-diff ' + HEAD + ' -- run.sh']: 'diff --git a/run.sh b/run.sh\nindex 1..2 100644\n--- a/run.sh\n+++ b/run.sh\n@@ -1 +1 @@\n-echo old\n+echo new\n',
  })
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('inloop: 1 note, 1 edit, 2 files changed outside the edit tools. /inloop review shows them.')
  const outside = w.records().filter((r) => r.kind === 'outside')
  expect(outside).toHaveLength(1)
  expect(outside[0].more).toBe(0)
  expect(outside[0].entries.map((x: any) => [x.path, x.state, x.added, x.removed])).toEqual([['gen.py', 'added', 1, 0], ['run.sh', 'modified', 1, 1]])
  expect(outside[0].entries[0].diff).toContain('+print("generated")')
  expect(outside[0].entries[1].diff).toBe('@@ -1 +1 @@\n-echo old\n+echo new')

  // nothing new: no second record, and no line under the answer
  await $.turn.start({ text: 'thanks', turnId: 't2' })
  expect((await $.turn.complete(turnDone('t2'))).text).toBe('Done.')
  expect(w.records().filter((r) => r.kind === 'outside')).toHaveLength(1)
  // a subagent's turn and an interrupted turn are left alone
  expect((await $.turn.complete(turnDone('t3', { agentId: 'sub-1' }))).text).toBe('Done.')
  expect((await $.turn.complete(turnDone('t4', { isAborted: true, reason: 'aborted' }))).text).toBe('Done.')
})

test('an edit goes on when inloop can no longer read or write anything', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  w.broken.fs = true
  expect(await $.tool.call({ tool: 'Write', file_path: ROOT + '/a.py', content: 'a\n' } as any)).toMatchObject({ result: 'ok' })
  expect(w.files.get(ROOT + '/a.py')).toBe('a\n')
  expect(await $.tool.call(note({ title: 't', files: ['a.py'], what: 'w', why: 'y' }))).toEqual({ result: 'inloop: note 1 saved.' })
})

test('a session that could not start says so, adds no instructions and leaves edits alone', async ($, on) => {
  const w = worldOf(on)
  w.broken.fs = true
  await $.session.start(START)
  expect(w.lines.join('\n')).toContain('inloop could not start')
  expect(w.tools).toEqual([])
  expect((await $.prompt.compose(COMPOSE as any)).sections.map((s) => s.id)).toEqual(['core:intro'])
  expect(await $.tool.call({ tool: 'Write', file_path: ROOT + '/a.py', content: 'a\n' } as any)).toMatchObject({ result: 'ok' })
})

test('a reloaded plugin continues the session log it finds', async ($, on) => {
  const base = { v: 1, session: SESSION_ID, agent: null }
  const earlier = [
    { ...base, kind: 'session', ts: 1, turn: null, root: ROOT, language: 'English', language_code: 'en', detail: 'standard', version: '0.1.0' },
    { ...base, kind: 'baseline', ts: 1, turn: null, git: false, head: null, dirty: [] },
    { ...base, kind: 'note', ts: 2, turn: 't1', id: 'n1', n: 2, source: 'live', note: { title: 'x' }, problems: [] },
    { ...base, kind: 'edit', ts: 3, turn: 't1', id: 'e1', tool: 'Write', path: 'a.py', note: null, listed: false, status: 'ok', created: true, diff: '+a', added: 1, removed: 0, truncated: false, skipped: null, redactions: 0 },
  ]
  const w = worldOf(on, { files: { [LOG]: earlier.map((r) => JSON.stringify(r) + '\n').join('') } })
  await $.session.start(START)
  // no second session record; a new baseline, so the outside check starts from the project as it is now
  expect(w.records().map((r) => r.kind)).toEqual(['session', 'baseline', 'note', 'edit', 'baseline'])
  expect((await $.command.run(command('status'))).text).toContain('This session: 2 notes, 1 edit (1 without a note), 0 files changed outside the edit tools.')
  expect(await $.tool.call(note({ title: 't', files: ['a.py'], what: 'w', why: 'y' }))).toEqual({ result: 'inloop: note 3 saved.' })
  expect(w.records().map((r) => r.kind)).toEqual(['session', 'baseline', 'note', 'edit', 'baseline', 'note'])
})

test('a reload keeps inloop off when the log says it was turned off', async ($, on) => {
  const base = { v: 1, session: SESSION_ID, agent: null, turn: null }
  const earlier = [
    { ...base, kind: 'session', ts: 1, root: ROOT, language: 'English', language_code: 'en', detail: 'standard', version: '0.1.0' },
    { ...base, kind: 'baseline', ts: 1, git: false, head: null, dirty: [] },
    { ...base, kind: 'switch', ts: 2, on: false },
  ]
  const w = worldOf(on, { files: { [LOG]: earlier.map((r) => JSON.stringify(r) + '\n').join('') } })
  await $.session.start(START)
  expect((await $.prompt.compose(COMPOSE as any)).sections.map((s) => s.id)).toEqual(['core:intro'])
  expect((await $.command.run(command('status'))).text).toStartWith('inloop is off.')
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/a.py', content: 'a\n' } as any)
  expect(edits(w)).toEqual([])
})

test('files outside the project and inloop\'s own files are not recorded as edits', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  await $.turn.start({ text: 'plan it', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/home/me/.claude/plans/plan.md', content: '# Plan\n' } as any)
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/.inloop/config.json', content: '{}\n' } as any)
  expect(w.files.get('/home/me/.claude/plans/plan.md')).toBe('# Plan\n')
  expect(edits(w)).toEqual([])
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('Done.')
})

test('a project setting writes .inloop/ with its .gitignore', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  await $.command.run(command('tags decisions --project'))
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/config.json') ?? '{}')).toEqual({ tags: 'decisions' })
  expect(w.files.get(ROOT + '/.inloop/.gitignore')).toBe('*\n')
  expect(w.files.has(LOG)).toBe(false)
})

test('/inloop adhd changes how the next notes are written, not how much they say', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  const written = async () => (await $.prompt.compose(COMPOSE as any)).sections.find((s) => s.id === 'inloop:instructions')?.text ?? ''
  expect(await written()).not.toContain('How to write for this user')
  expect((await $.command.run(command('adhd on'))).text).toStartWith('From now on inloop notes are written for easy reading, in all your projects')
  const rules = await written()
  expect(rules).toContain('How to write for this user')
  // with the review tag there is no glossary, so terms are explained where they first appear
  expect(rules).toContain('Keep technical words as developers say them, in every field, and explain one in a few words the first time it appears.')
  expect(rules).toContain('The user chose the tags review') // the tags are unchanged
  await $.command.run(command('tags learn'))
  expect(await written()).toContain('Explain each term the first time it appears, in `terms`')
  await $.command.run(command('tags reset'))
  expect((await $.command.run(command('adhd off --project'))).text).toBe('From now on inloop notes are written in the usual form, in this project.')
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/config.json') ?? '{}')).toEqual({ adhd: 'off' })
  expect(await written()).not.toContain('How to write for this user')
  expect((await $.command.run(command('adhd on'))).text).toContain('This project has its own choice, off, which comes first here')
  expect((await $.command.run(command('adhd maybe'))).text).toBe('Use /inloop adhd on or /inloop adhd off.')
  expect((await $.command.run(command('adhd reset'))).text).toBe('ADHD-friendly notes are off again (the plugin setting).')
})

test('commits made through the shell are recorded with the edits and notes that went into them', async ($, on) => {
  const git: Git = {
    'git rev-parse --show-toplevel': ROOT + '\n',
    'git rev-parse --verify --quiet HEAD': 'aaa\n',
    'git status --porcelain=v1 -z --untracked-files=all': '',
  }
  const w = worldOf(on, { git })
  const commit = (sha: string, parent: string, subject: string, files: string[]) => () => {
    git['git rev-parse --verify --quiet HEAD'] = sha + '\n'
    git['git rev-list --reverse --max-count=50 ' + parent + '..' + sha] = sha + '\n'
    git['git show -s --format=%P%x00%s ' + sha] = parent + '\u0000' + subject + '\n'
    git['git diff-tree --no-commit-id --name-only -r -z --root ' + sha] = files.join('\u0000') + '\u0000'
  }
  await $.session.start(START)
  await $.turn.start({ text: 'build it', turnId: 't1' })
  await $.tool.call({ ...note({ title: 'a', files: ['a.py'], what: 'w', why: 'y' }), tool_use_id: 'n1' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w1', file_path: ROOT + '/a.py', content: 'a\n' } as any)
  await $.tool.call({ ...note({ title: 'b', files: ['b.py'], what: 'w', why: 'y' }), tool_use_id: 'n2' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w2', file_path: ROOT + '/b.py', content: 'b\n' } as any)
  await $.tool.call({ ...note({ title: 'notes.txt by printf', files: ['notes.txt'], what: 'w', why: 'y' }), tool_use_id: 'n3' })
  // a command that makes no commit records nothing
  await $.tool.call({ tool: 'Bash', command: 'ls' } as any)
  w.shell = commit('bbb', 'aaa', 'feat: add a', ['a.py', 'notes.txt'])
  await $.tool.call({ tool: 'Bash', command: 'git commit -am a' } as any)
  w.shell = commit('ccc', 'bbb', 'feat: add b', ['b.py'])
  await $.tool.call({ tool: 'Bash', command: 'git commit -am b' } as any)
  const commits = w.records().filter((r) => r.kind === 'commit')
  expect(commits.map((c) => [c.sha, c.parents, c.subject, c.files, c.edits, c.notes])).toEqual([
    ['bbb', ['aaa'], 'feat: add a', ['a.py', 'notes.txt'], ['w1'], ['n1', 'n3']],
    ['ccc', ['bbb'], 'feat: add b', ['b.py'], ['w2'], ['n2']],
  ])
  // nothing new at the end of the turn
  await $.turn.complete(turnDone('t1'))
  expect(w.records().filter((r) => r.kind === 'commit')).toHaveLength(2)
})

test('a commit with none of Claude\'s work, made in a session that recorded nothing, writes nothing', async ($, on) => {
  const git: Git = { 'git rev-parse --show-toplevel': ROOT + '\n', 'git rev-parse --verify --quiet HEAD': 'aaa\n', 'git status --porcelain=v1 -z --untracked-files=all': '' }
  const w = worldOf(on, { git })
  await $.session.start(START)
  Object.assign(git, {
    'git rev-parse --verify --quiet HEAD': 'bbb\n',
    'git rev-list --reverse --max-count=50 aaa..bbb': 'bbb\n',
    'git show -s --format=%P%x00%s bbb': 'aaa\u0000docs: by hand\n',
    'git diff-tree --no-commit-id --name-only -r -z --root bbb': 'README.md\u0000',
  })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete(turnDone('t1'))
  expect([...w.files.keys()]).toEqual([])
})

test('/inloop review writes the session\'s commits and what is not committed yet, explained beside the code', async ($, on) => {
  const A = 'a1'.repeat(20)
  const B = 'b2'.repeat(20)
  const SHAPES = 'class Rectangle:\n    def area(self):\n        return self.w * self.h\n'
  const git: Git = { 'git rev-parse --show-toplevel': ROOT + '\n', 'git rev-parse --verify --quiet HEAD': A + '\n', 'git status --porcelain=v1 -z --untracked-files=all': '' }
  const w = worldOf(on, { git })
  await $.session.start(START)
  await $.turn.start({ text: 'build', turnId: 't1' })
  await $.tool.call({ ...note({ title: 'Shapes', files: ['shapes.py'], symbols: [{ name: 'Rectangle', kind: 'class', why_exists: 'holds sizes' }], lines: [{ anchor: 'return self.w * self.h', says: 'area is width times height' }] }), tool_use_id: 'n1' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w1', file_path: ROOT + '/shapes.py', content: SHAPES } as any)
  w.shell = () => Object.assign(git, {
    'git rev-parse --verify --quiet HEAD': B + '\n',
    ['git rev-list --reverse --max-count=50 ' + A + '..' + B]: B + '\n',
    ['git show -s --format=%P%x00%s ' + B]: A + '\u0000feat: add shapes\n',
    ['git diff-tree --no-commit-id --name-only -r -z --root ' + B]: 'shapes.py\u0000',
  })
  await $.tool.call({ tool: 'Bash', command: 'git commit -am shapes' } as any)
  await $.tool.call({ ...note({ title: 'Use it', files: ['app.py'], uses: [{ name: 'largest', from: 'shapes.py', why: 'picks the biggest' }] }), tool_use_id: 'n2' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w2', file_path: ROOT + '/app.py', content: 'from shapes import Rectangle, largest\n' } as any)
  // what git says when the review asks
  Object.assign(git, {
    ['git rev-list --count ' + A + '..HEAD --']: '1\n',
    ['git log --reverse --max-count=30 --format=%H%x00%P%x00%an%x00%at%x00%s%x00%b%x1e ' + A + '..HEAD --']: B + '\u0000' + A + '\u0000Erol\u00001700000000\u0000feat: add shapes\u0000\u001e\n',
    ['git -c core.quotePath=false show --format= --no-color --no-ext-diff ' + B + ' -W']: 'diff --git a/shapes.py b/shapes.py\nnew file mode 100644\n--- /dev/null\n+++ b/shapes.py\n@@ -0,0 +1,3 @@\n' + SHAPES.trimEnd().split('\n').map((l) => '+' + l).join('\n') + '\n',
    'git -c core.quotePath=false diff --no-color --no-ext-diff HEAD -W': '',
    'git ls-files --others --exclude-standard -z': 'app.py\u0000',
    // who wrote each line of shapes.py; app.py is not tracked, so git has no blame for it
    'git blame --porcelain -- shapes.py': SHAPES.trimEnd().split('\n').map((l, i) => B + ' ' + (i + 1) + ' ' + (i + 1) + (i ? '' : ' 3\nsummary feat: add shapes\ncommitter-time 1700000000') + '\n\t' + l).join('\n') + '\n',
  })
  const page = ROOT + '/.inloop/review/review.html'
  expect((await $.command.run(command('review'))).text).toBe('The review is at ' + page)
  const html = w.files.get(page) ?? ''
  for (const word of ['Commit 1 of 1', 'feat: add shapes', 'Not committed yet', 'area is width times height', 'from shapes.py', 'picks the biggest']) expect(html, word).toContain(word)
  // the class named in the uncommitted file links to where shapes.py defines it, as the file stands
  const shapes = fileId('shapes.py')
  expect(html).toContain('<a class="xref" href="#' + shapes + '_1" title="holds sizes">Rectangle</a>')
  expect(html).toContain('<section class="view" id="' + shapes + '_why"')
  expect(html).toContain('<a class="t" href="#c-' + B.slice(0, 12) + '">Shapes</a>')
  // the explanation of the code as it stands opens on the file it names
  expect((await $.command.run(command('explain shapes.py'))).text).toBe('The explanation is at ' + ROOT + '/.inloop/review/explain-shapes.py.html')
  expect(w.files.get(ROOT + '/.inloop/review/explain-shapes.py.html')).toContain('data-start="' + shapes + '"')
  expect((await $.command.run(command('explain nowhere.py'))).text).toBe('"nowhere.py" is not a file in this project.')
  // with no path it opens on the overview, where an onboarding guide is
  await $.command.run(command('explain'))
  expect(w.files.get(ROOT + '/.inloop/review/explain.html')).toContain('data-start="overview"')
  await $.command.run(command('review --theme dark'))
  expect(w.files.get(ROOT + '/.inloop/review/review-dark.html')).toContain('data-theme="dark" data-fixed')
  expect((await $.command.run(command('review nosuch..'))).text).toBe('git does not know "nosuch..". Try a range such as main.. or HEAD~5.., or a commit hash.')
  expect((await $.command.run(command('review --output=x'))).text).toStartWith('git does not know')
})

test('/inloop explain shows the code of the file asked for, even in a project with more explained files than a page holds', async ($, on) => {
  const HEAD = 'c3'.repeat(20)
  const git: Git = { 'git rev-parse --show-toplevel': ROOT + '\n', 'git rev-parse --verify --quiet HEAD': HEAD + '\n', 'git status --porcelain=v1 -z --untracked-files=all': '' }
  const files: Record<string, string> = { [ROOT + '/asked.py']: 'x = 1\n' }
  const diffs: string[] = []
  for (let i = 0; i < 41; i++) {
    files[ROOT + '/m' + i + '.py'] = 'v = ' + i + '\n'
    diffs.push('diff --git a/m' + i + '.py b/m' + i + '.py\nindex 1111111..2222222 100644\n--- a/m' + i + '.py\n+++ b/m' + i + '.py\n@@ -1 +1 @@\n-v = 0\n+v = ' + i)
  }
  const w = worldOf(on, { git, files })
  await $.session.start(START)
  await $.turn.start({ text: 'go', turnId: 't1' })
  for (let i = 0; i < 41; i++) await $.tool.call({ ...note({ title: 'M' + i, files: ['m' + i + '.py'] }), tool_use_id: 'n' + i })
  git['git -c core.quotePath=false diff --no-color --no-ext-diff HEAD -W'] = diffs.join('\n') + '\n'
  const page = ROOT + '/.inloop/review/explain-asked.py.html'
  expect((await $.command.run(command('explain asked.py'))).text).toBe('The explanation is at ' + page)
  const html = w.files.get(page) ?? ''
  const asked = html.split('<section class="view" id="' + fileId('asked.py') + '"')[1].split('</section>')[0]
  expect(asked).toContain('<td class="c">x = <span class="t-n">1</span></td>')
  // the page holds the code of 40 files: the one asked for, then the explained ones in order
  expect(html).toContain('<code>/inloop explain m40.py</code>')
  expect(html).not.toContain('<code>/inloop explain m38.py</code>')
})

// A session that wrote shapes.py and committed it as B on top of A, for the sharing tests
async function committedShapes($: any, on: any, more: Record<string, unknown> = {}) {
  const A = 'a1'.repeat(20)
  const B = 'b2'.repeat(20)
  const SHAPES = 'class Rectangle:\n    def area(self):\n        return self.w * self.h\n'
  const git: Git = { 'git rev-parse --show-toplevel': ROOT + '\n', 'git rev-parse --verify --quiet HEAD': A + '\n', 'git status --porcelain=v1 -z --untracked-files=all': '' }
  const w = worldOf(on, { git })
  await $.session.start(START)
  await $.turn.start({ text: 'build', turnId: 't1' })
  await $.tool.call({ ...note({ title: 'Shapes', files: ['shapes.py'], symbols: [{ name: 'Rectangle', kind: 'class', why_exists: 'holds sizes' }], lines: [{ anchor: 'return self.w * self.h', says: 'area is width times height, ask @erol' }], ...more }), tool_use_id: 'n1' })
  await $.tool.call({ tool: 'Write', tool_use_id: 'w1', file_path: ROOT + '/shapes.py', content: SHAPES } as any)
  w.shell = () => Object.assign(git, {
    'git rev-parse --verify --quiet HEAD': B + '\n',
    ['git rev-list --reverse --max-count=50 ' + A + '..' + B]: B + '\n',
    ['git show -s --format=%P%x00%s ' + B]: A + '\u0000feat: add shapes\n',
    ['git diff-tree --no-commit-id --name-only -r -z --root ' + B]: 'shapes.py\u0000',
  })
  await $.tool.call({ tool: 'Bash', command: 'git commit -am shapes' } as any)
  const FORMAT = '--format=%H%x00%P%x00%an%x00%at%x00%s%x00%b%x1e'
  const LOGGED = B + '\u0000' + A + '\u0000Erol\u00001700000000\u0000feat: add shapes\u0000\u001e\n'
  Object.assign(git, {
    ['git log --no-walk=sorted --ignore-missing ' + FORMAT + ' ' + B]: LOGGED,
    ['git rev-list --count ' + A + '..HEAD --']: '1\n',
    ['git log --reverse --max-count=30 ' + FORMAT + ' ' + A + '..HEAD --']: LOGGED,
    ['git -c core.quotePath=false show --format= --no-color --no-ext-diff ' + B + ' -W']: 'diff --git a/shapes.py b/shapes.py\nnew file mode 100644\n--- /dev/null\n+++ b/shapes.py\n@@ -0,0 +1,3 @@\n' + SHAPES.trimEnd().split('\n').map((l) => '+' + l).join('\n') + '\n',
    'git -c core.quotePath=false diff --no-color --no-ext-diff HEAD -W': '',
    'git ls-files --others --exclude-standard -z': '',
  })
  return { w, git, A, B, SHAPES }
}
const PR_VIEW = 'gh pr view --json number,title,url,headRefOid,commits'
const prJson = (head: string, commits: string[]) => JSON.stringify({ number: 7, title: 'Add shapes', url: 'https://github.com/erol/shop/pull/7', headRefOid: head, commits: commits.map((oid) => ({ oid })) })
const COMMENTS = 'gh api --paginate repos/erol/shop/issues/7/comments --jq .[] | select(.user.login == "erol" and (.body | startswith("<!-- inloop -->"))) | .id'

test('/inloop share writes a light page and its Markdown to attach to an email, and sends nothing', async ($, on) => {
  const { w } = await committedShapes($, on)
  const text = (await $.command.run(command('share'))).text
  expect(text).toStartWith('Page: ' + ROOT + '/.inloop/share/inloop-work.html\nMarkdown: ' + ROOT + '/.inloop/share/inloop-work.md\n')
  expect(text).toContain('share it only with people who may see that code')
  expect(w.files.get(ROOT + '/.inloop/share/inloop-work.html')).toContain('data-theme="light" data-fixed')
  const md = w.files.get(ROOT + '/.inloop/share/inloop-work.md') ?? ''
  expect(md).toStartWith('## Review: what Claude changed, and why')
  expect(md).toContain('area is width times height, ask @⁠erol')
  expect(w.ran).toContain('xdg-open ' + ROOT + '/.inloop/share')
  expect(w.ran.filter((c) => c.startsWith('gh '))).toEqual([])
  expect((await $.command.run(command('share link'))).text).toStartWith('Sharing by link (a secret gist) comes in a later version.')
})

test('parts a skill wrote beyond the tags are on the page and in its Markdown', async ($, on) => {
  // /inloop:onboard or /inloop:annotate under the default review tag fills terms, which learn names
  const { w } = await committedShapes($, on, { terms: [{ term: 'dunder method', means: 'a method Python calls for an operator' }] })
  await $.command.run(command('share'))
  const html = w.files.get(ROOT + '/.inloop/share/inloop-work.html') ?? ''
  expect(html).toContain('data-tags="review,learn"')
  // the dialog marks only the session's own tag as written
  expect(html).toContain('<span class="n">review</span><span class="badge new">written</span>')
  expect(html).toContain('<span class="n">learn</span><span class="d">')
  expect(w.files.get(ROOT + '/.inloop/share/inloop-work.md')).toContain('dunder method')
})

test('/inloop share pr shows a preview first, posts only with --yes typed by a person, and updates its own comment in place', async ($, on) => {
  const { w, git, B } = await committedShapes($, on)
  const posted = () => w.ran.filter((c) => c.startsWith('gh api -X'))
  // no gh: said plainly
  expect((await $.command.run(command('share pr'))).text).toBe('This needs the GitHub CLI (`gh`), signed in with `gh auth login`: https://cli.github.com')
  Object.assign(git, { 'gh --version': 'gh version 2.82.0\n', [PR_VIEW]: prJson(B, [B]), [PR_VIEW.replace('view', 'view 7')]: prJson(B, [B]), 'gh api user --jq .login': 'erol\n', [COMMENTS]: '' })
  const preview = (await $.command.run(command('share pr'))).text
  expect(preview).toBe('Preview, nothing sent: PR #7 Add shapes\nhttps://github.com/erol/shop/pull/7\nComment: ' + ROOT + '/.inloop/share/pr-7.md (' +
    (w.files.get(ROOT + '/.inloop/share/pr-7.md') ?? '').length + ' characters, 1 commit)\nTo send it: `/inloop share pr 7 --yes` (a new comment)')
  const comment = w.files.get(ROOT + '/.inloop/share/pr-7.md') ?? ''
  expect(comment).toStartWith('<!-- inloop -->\n')
  expect(comment).toContain('area is width times height')
  expect(posted()).toEqual([])
  // only a person may send: a command from another plugin is refused before gh is asked anything
  const asked = w.ran.length
  const REFUSED = 'Not sent: `--yes` works only when you type the command at Claude Code\'s prompt.'
  expect((await $.command.run({ ...command('share pr --yes'), origin: { kind: 'plugin', name: 'other' } })).text).toBe(REFUSED)
  // nor from `claude -p`, which Claude itself could run from a shell
  expect((await $.command.run({ ...command('share pr --yes'), origin: { kind: 'sdk' } })).text).toBe(REFUSED)
  expect(w.ran.length).toBe(asked)
  // --yes posts the previewed text as a new comment
  const POST = 'gh api -X POST repos/erol/shop/issues/7/comments --input ' + ROOT + '/.inloop/share/pr-7.body.json --jq .html_url'
  git[POST] = 'https://github.com/erol/shop/pull/7#issuecomment-1\n'
  expect((await $.command.run(command('share pr --yes'))).text).toBe('Comment posted on PR #7: https://github.com/erol/shop/pull/7#issuecomment-1')
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/share/pr-7.body.json') ?? '{}').body).toBe(comment)
  expect(posted()).toEqual([POST])
  // the next time, inloop's own comment is found (by its marker and the person's login) and replaced
  git[COMMENTS] = '555\n'
  expect((await $.command.run(command('share pr 7'))).text).toContain('`/inloop share pr 7 --yes` (updates inloop\'s earlier comment)')
  const PATCH = 'gh api -X PATCH repos/erol/shop/issues/comments/555 --input ' + ROOT + '/.inloop/share/pr-7.body.json --jq .html_url'
  git[PATCH] = 'https://github.com/erol/shop/pull/7#issuecomment-555\n'
  expect((await $.command.run(command('share pr 7 --yes'))).text).toBe('Comment updated on PR #7: https://github.com/erol/shop/pull/7#issuecomment-555')
  expect(posted()).toEqual([POST, PATCH])
  // a pull request that moved since its preview gets a new preview, not a post
  git[PR_VIEW] = prJson('c3'.repeat(20), [B])
  expect((await $.command.run(command('share pr --yes'))).text).toStartWith('Not sent: no preview for PR #7, or the PR changed since. New preview:\nPreview, nothing sent:')
  expect(posted()).toEqual([POST, PATCH])
  expect((await $.command.run(command('share pr seven'))).text).toStartWith('Use `/inloop share`')
})

test('/inloop review pr fetches the pull request into its own ref and reviews it as it stands there', async ($, on) => {
  const { w, git, B, SHAPES } = await committedShapes($, on)
  const REF = 'refs/inloop/pr-7'
  Object.assign(git, {
    'gh --version': 'gh version 2.82.0\n', [PR_VIEW + '']: prJson(B, [B]), ['gh pr view 7 --json number,title,url,headRefOid,commits']: prJson(B, [B]),
    // a remote whose path only ends like the pull request's repository is not it
    'git remote -v': 'fork\thttps://github.com/noterol/shop.git (fetch)\nfork\thttps://github.com/noterol/shop.git (push)\norigin\tgit@github.com:erol/shop.git (fetch)\norigin\tgit@github.com:erol/shop.git (push)\n',
    ['git fetch --no-tags --quiet origin +refs/pull/7/head:' + REF]: '',
    ['git cat-file -s ' + REF + ':shapes.py']: SHAPES.length + '\n',
    ['git show ' + REF + ':shapes.py']: SHAPES,
  })
  const page = ROOT + '/.inloop/review/review-pr-7.html'
  expect((await $.command.run(command('review pr 7'))).text).toBe('The review is at ' + page)
  expect(w.ran).toContain('git fetch --no-tags --quiet origin +refs/pull/7/head:' + REF)
  expect(w.ran.filter((c) => c.startsWith('git fetch'))).toEqual(['git fetch --no-tags --quiet origin +refs/pull/7/head:' + REF])
  const html = w.files.get(page) ?? ''
  expect(html).toContain('Pull request #7: Add shapes')
  expect(html).toContain('<footer>inloop 0.1.0 &middot; <code>/inloop review pr 7</code> &middot; ')
  expect(html).toContain('area is width times height')
  expect(html).toContain('<section class="view" id="' + fileId('shapes.py') + '"')
  expect((await $.command.run(command('review pr x'))).text).toStartWith('Use `/inloop share`')
})

test('a note that translates technical terms word for word goes back once; the reworded note is saved', async ($, on) => {
  const w = worldOf(on, { store: { settings: { language: 'tr' } } })
  await $.session.start(START)
  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await $.tool.call({ ...note({ title: 'Split', files: ['data.py'], what: 'Satırları karıştırıp böler.', why: 'Tekrarlanabilir sonuç için.' }), tool_use_id: 'n1' })
  expect(first.result).toStartWith('inloop: the note is not saved yet. Developers who write Turkish (Türkçe) use the technical term for these words: "karıştırıp" -> shuffle')
  expect(w.records().filter((r) => r.kind === 'note')).toEqual([])
  // its row is one line, not a card
  const row = await $.ui.mount({ plugin: 'inloop', component: 'ToolUse', requestId: 'n1', surface: 'terminal', props: { tool_use_id: 'n1', tool: 'mcp__inloop__note', input: { title: 'Split' }, isRunning: false, isErrored: false, isInterrupted: false } } as any)
  expect(await row.find({ text: /karıştırıp, tekrarlanabilir teknik terimiyle yazılsın diye bir kez geri gönderildi/ })).toBeDefined()
  // the reworded note is saved
  const second = await $.tool.call({ ...note({ title: 'Split', files: ['data.py'], what: 'Satırları shuffle edip split eder.', why: 'Sonuç reproducible olsun diye.' }), tool_use_id: 'n2' })
  expect(second.result).toBe('inloop: note 1 saved.')
  // a second try that still translates is saved too, with the words named: never a loop
  await $.tool.call({ ...note({ title: 'Model', files: ['model.py'], what: 'Erken durdurma kullanır.', why: 'w' }), tool_use_id: 'n3' })
  const again = await $.tool.call({ ...note({ title: 'Model', files: ['model.py'], what: 'Erken durdurma kullanır.', why: 'w' }), tool_use_id: 'n4' })
  expect(again.result).toContain('saved')
  expect(w.records().filter((r) => r.kind === 'note').map((r) => r.problems)).toEqual([[], ['technical words written as translations: erken durdurma -> early stopping']])
  // English notes are never sent back
  await $.command.run(command('lang en'))
  expect((await $.tool.call({ ...note({ title: 'X', files: ['x.py'], what: 'Erken durdurma.', why: 'w' }), tool_use_id: 'n5' })).result).toBe('inloop: note 3 saved.')
})

test('/inloop onboard explains later changes for someone new here, and the recap is checked for its wording like a note', async ($, on) => {
  const w = worldOf(on, { store: { settings: { language: 'tr' } } })
  await $.session.start(START)
  const said = (await $.command.run(command('onboard'))).text
  expect(said).toStartWith('Bu projede notlar artık onboarding tag\'iyle yazılıyor')
  expect(said).toContain('/inloop:onboard')
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/config.json') ?? '{}').tags).toBe('onboarding')
  const compose = await $.prompt.compose(COMPOSE as any)
  const rules = compose.sections.find((s: any) => s.id === 'inloop:instructions').text
  expect(rules).toContain('Tag "onboarding": write for a developer who just joined')
  expect((await $.command.run(command('status'))).text).toContain('onboarding (bu proje)')
  // a recap with a word-for-word translation goes back once, then the reworded one is saved
  await $.turn.start({ text: 'go', turnId: 't1' })
  const first = await $.tool.call({ tool: 'mcp__inloop__recap', tool_use_id: 'r1', overview: 'Veri tekrarlanabilir biçimde bölünür.', reading_order: [] } as any)
  expect(first.result).toStartWith('inloop: the recap is not saved yet.')
  expect(w.records().filter((r) => r.kind === 'recap')).toEqual([])
  const second = await $.tool.call({ tool: 'mcp__inloop__recap', tool_use_id: 'r2', overview: 'Veri reproducible şekilde split edilir.', reading_order: [], outcomes: [{ note: 1, says: 'Testler geçti.' }] } as any)
  expect(second.result).toBe('inloop: recap saved.')
  expect(w.records().filter((r) => r.kind === 'recap').map((r) => r.recap.outcomes)).toEqual([[{ note: 1, says: 'Testler geçti.' }]])
})
