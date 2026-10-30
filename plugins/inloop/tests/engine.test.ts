// The engine through the events Claude Code raises: a session, turns, notes, edits and commands,
// over a project held in memory (world.ts).
import { expect, test } from 'claude-code/testing'
import { worldOf, ROOT, SESSION_ID, LOG, START, COMPOSE, command, turnDone, note, type Git } from './world.ts'

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
  expect(w.records()[0]).toMatchObject({ v: 1, session: SESSION_ID, root: ROOT, language: 'English', language_code: 'en', level: 'guided', version: '0.1.0' })
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

test('/inloop lang and level change the next instructions, for all projects or for this one', async ($, on) => {
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

  expect(await written()).toContain('Level "guided"')
  expect((await $.command.run(command('level full'))).text).toBe('From now on inloop notes explain at the level "full explanation", in all your projects.')
  expect(await written()).toContain('Level "full explanation"')
  expect((await $.command.run(command('level loud'))).text).toBe('The levels are full, guided, essentials, design and big-picture.')
  expect((await $.command.run(command('status'))).text).toContain('Notes are in English (the plugin setting), level full explanation (your setting for all projects), ADHD-friendly off (the plugin setting).')
  // the first builds' command and values still work
  expect((await $.command.run(command('detail brief'))).text).toBe('From now on inloop notes explain at the level "key points", in all your projects.')
  expect((await $.command.run(command('level reset'))).text).toBe('inloop notes explain at the level "guided" again (the plugin setting).')
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
  await $.command.run(command('level design --project'))
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/config.json') ?? '{}')).toEqual({ level: 'design' })
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
  expect(rules).toContain('Keep every technical term as developers say it, and explain it')
  expect(rules).toContain('Level "guided"') // the level is unchanged
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
  const A = 'a1a1a1a1a1'
  const B = 'b2b2b2b2b2'
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
  })
  const page = ROOT + '/.inloop/review/review.html'
  expect((await $.command.run(command('review'))).text).toBe('The review is at ' + page)
  const html = w.files.get(page) ?? ''
  for (const word of ['Commit 1 of 1', 'feat: add shapes', 'Not committed yet', 'area is width times height', 'from shapes.py', 'picks the biggest']) expect(html, word).toContain(word)
  // the class named in the uncommitted file links to where the commit defines it
  expect(html).toContain('<a class="xref" href="#c-' + B + '-f0-1" title="holds sizes">Rectangle</a>')
  await $.command.run(command('review --theme dark'))
  expect(w.files.get(ROOT + '/.inloop/review/review-dark.html')).toContain('data-theme="dark" data-fixed')
  expect((await $.command.run(command('review nosuch..'))).text).toBe('git does not know "nosuch..". Try a range such as main.. or HEAD~5.., or a commit hash.')
  expect((await $.command.run(command('review --output=x'))).text).toStartWith('git does not know')
})
