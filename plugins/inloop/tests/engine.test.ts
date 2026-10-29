// The engine through the events Claude Code raises: a session, turns, notes, edits and commands,
// over a project held in memory (world.ts).
import { expect, test } from 'claude-code/testing'
import { worldOf, ROOT, SESSION_ID, LOG, START, COMPOSE, command, turnDone, note, type Git } from './world.ts'

const edits = (w: { records: () => any[] }) => w.records().filter((r) => r.kind === 'edit')
const DESCRIBE = { tool: 'mcp__inloop__note', description: 'Record a note.', provider: { plugin: 'inloop', tier: 'user' } } as any

test('a session starts: tools and command registered, .inloop/ kept out of git, session and baseline logged', async ($, on) => {
  const w = worldOf(on)
  expect(await $.session.start(START)).toEqual({ cwd: ROOT })
  expect(w.tools).toEqual(['note', 'recap'])
  expect(w.commands).toEqual([expect.objectContaining({ name: 'inloop', immediate: true })])
  expect(w.files.get(ROOT + '/.inloop/.gitignore')).toBe('*\n')
  expect(w.records().map((r) => r.kind)).toEqual(['session', 'baseline'])
  expect(w.records()[0]).toMatchObject({ v: 1, session: SESSION_ID, root: ROOT, language: 'English', language_code: 'en', detail: 'standard', version: '0.1.0' })
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
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('inloop: 2 notes, 3 edits. /inloop open shows them.')

  await $.turn.start({ text: 'say hello instead', turnId: 't2' })
  await $.tool.call({ tool: 'Edit', tool_use_id: 'e3', file_path: ROOT + '/greet.py', old_string: 'hi', new_string: 'hello' } as any)
  expect((await $.turn.complete(turnDone('t2'))).text).toBe('inloop: 0 notes, 1 edit, 1 without a note. /inloop open shows them.')

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

test('/inloop lang and detail change the next instructions, for all projects or for this one', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  const written = async () => (await $.prompt.compose(COMPOSE as any)).sections.find((s) => s.id === 'inloop:instructions')?.text ?? ''
  expect(await written()).toContain('English')

  expect((await $.command.run(command('lang Türkçe'))).text).toBe(
    'From now on inloop notes are in Turkish (Türkçe), in all your projects.\n' +
    'inloop has no labels in Turkish (Türkçe) yet, so its own messages stay in English; the notes themselves are in Turkish (Türkçe).')
  expect(await written()).toContain('Turkish (Türkçe)')

  expect((await $.command.run(command('lang de --project'))).text).toContain('From now on inloop notes are in German (Deutsch), in this project.')
  expect(JSON.parse(w.files.get(ROOT + '/.inloop/config.json') ?? '{}')).toEqual({ language: 'de' })
  expect(await written()).toContain('German (Deutsch)')

  // the project's own choice comes first, and the command says so
  expect((await $.command.run(command('lang nl'))).text).toContain('This project has its own choice, German (Deutsch), which comes first here')
  expect((await $.command.run(command('lang reset --project'))).text).toBe('inloop notes are in Dutch (Nederlands) again (your setting for all projects).')
  // the plugin's own setting (its default, English, as /config shows it) is what reset goes back to
  expect((await $.command.run(command('lang reset'))).text).toBe('inloop notes are in English again (the plugin setting).')
  expect((await $.command.run(command('lang'))).text).toBe('Name a language, as in /inloop lang Turkish or /inloop lang de.')
  // a language with no labels: the notes are in it, inloop's own messages stay English
  expect((await $.command.run(command('lang Japanese'))).text).toBe('From now on inloop notes are in Japanese (日本語), in all your projects.\n' +
    'inloop has no labels in Japanese (日本語) yet, so its own messages stay in English; the notes themselves are in Japanese (日本語).')
  expect(await written()).toContain('Japanese (日本語)')
  await $.command.run(command('lang reset'))

  expect(await written()).not.toContain('never guess a URL')
  expect((await $.command.run(command('detail deep'))).text).toBe('From now on inloop notes are deep, in all your projects.')
  expect(await written()).toContain('never guess a URL')
  expect((await $.command.run(command('detail loud'))).text).toBe('Detail is brief, standard or deep.')
  expect((await $.command.run(command('status'))).text).toContain('Notes are in English (the plugin setting), detail deep (your setting for all projects).')
  expect((await $.command.run(command('detail reset'))).text).toBe('inloop notes are standard again (the plugin setting).')
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
  expect(w.records().filter((r) => r.kind === 'switch').map((r) => r.on)).toEqual([false])

  expect((await $.command.run(command('on'))).text).toBe('inloop is on: Claude writes a note before each change.')
  expect((await $.tool.describe(DESCRIBE)).isDeferred).toBe(false)
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/b.py', content: 'b\n' } as any)
  expect(edits(w).map((r) => r.path)).toEqual(['b.py'])
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
  expect(w.records()[1]).toMatchObject({ kind: 'baseline', git: true, head: HEAD, dirty: ['notes.txt'] })

  await $.turn.start({ text: 'greet', turnId: 't1' })
  await $.tool.call(note({ title: 'Greeting', files: ['greet.py'], what: 'w', why: 'y' }))
  await $.tool.call({ tool: 'Edit', file_path: ROOT + '/greet.py', old_string: 'pass', new_string: 'return "hi"' } as any)
  // meanwhile a shell command rewrote run.sh and made gen.py; notes.txt was dirty before the session
  w.files.set(ROOT + '/gen.py', 'print("generated")\n')
  Object.assign(git, {
    ['git diff --name-only -z ' + HEAD]: 'greet.py\0notes.txt\0run.sh\0',
    'git ls-files --others --exclude-standard -z': 'gen.py\0.inloop/log/sess-1.jsonl\0',
    ['git diff --name-only --diff-filter=D -z ' + HEAD]: '',
    ['git diff --no-color --no-ext-diff ' + HEAD + ' -- run.sh']: 'diff --git a/run.sh b/run.sh\nindex 1..2 100644\n--- a/run.sh\n+++ b/run.sh\n@@ -1 +1 @@\n-echo old\n+echo new\n',
  })
  expect((await $.turn.complete(turnDone('t1'))).text).toBe('inloop: 1 note, 1 edit, 2 files changed outside the edit tools. /inloop open shows them.')
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

test('/inloop open writes the review page and says where it is', async ($, on) => {
  const w = worldOf(on, { store: { settings: { language: 'tr' } } })
  await $.session.start(START)
  await $.turn.start({ text: 'greet', turnId: 't1' })
  await $.tool.call(note({ title: 'Selamlama fonksiyonu', files: ['greet.py'], what: 'Ekler.', why: 'CLI istiyor.' }))
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/greet.py', content: 'def greet():\n    pass\n' } as any)
  const page = ROOT + '/.inloop/review/' + SESSION_ID + '.html'
  // no browser could be opened here, so the path is the answer
  expect((await $.command.run(command('open'))).text).toBe('The review page is at ' + page)
  const html = w.files.get(page) ?? ''
  expect(html).toContain('<html lang="en">')
  expect(html).toContain('Selamlama fonksiyonu')
  expect(html).toContain('<td class="m">+</td><td class="c">def greet():</td>')
  expect(html).toContain('.inloop/log/' + SESSION_ID + '.jsonl')
  expect(html).not.toContain(ROOT + '/.inloop/log') // the footer names the log without the absolute path
})

test('/inloop open shows the page in the browser where it can', async ($, on) => {
  const page = ROOT + '/.inloop/review/' + SESSION_ID + '.html'
  const w = worldOf(on, { git: { 'uname -s': 'Darwin\n', ['open ' + page]: '' } })
  await $.session.start(START)
  expect((await $.command.run(command('open'))).text).toBe('Opened the review page: ' + page)
  expect(w.ran).toContain('open ' + page)
})

test('a session with no person at the screen never starts a browser', async ($, on) => {
  const w = worldOf(on, { git: { 'uname -s': 'Darwin\n' } })
  await $.session.start({ ...START, isInteractive: false })
  expect((await $.command.run(command('open'))).text).toStartWith('The review page is at ')
  expect(w.ran.filter((c) => !c.startsWith('git '))).toEqual([])
})

test('/inloop open all writes a page for each session and a list of them', async ($, on) => {
  const old = [
    { v: 1, kind: 'session', ts: 1, session: 'old-1', agent: null, turn: null, root: ROOT, language: 'English', language_code: 'en', detail: 'standard', version: '0.1.0' },
    { v: 1, kind: 'note', ts: 2, session: 'old-1', agent: null, turn: 't1', id: 'n1', n: 1, source: 'live', problems: [], note: { title: 'Set up the project', files: ['a.py'], what: 'w', why: 'y', basis: null, alternatives: [], parameters: [], symbols: [], risks: [] } },
  ]
  const w = worldOf(on, { files: { [ROOT + '/.inloop/log/old-1.jsonl']: old.map((r) => JSON.stringify(r) + '\n').join('') } })
  await $.session.start(START)
  const list = ROOT + '/.inloop/review/index.html'
  expect((await $.command.run(command('open all'))).text).toBe('The list of sessions is at ' + list)
  const html = w.files.get(list) ?? ''
  expect(html).toContain('<a href="old-1.html">Set up the project</a>')
  expect(html).toContain('<a href="' + SESSION_ID + '.html">Session without notes</a>')
  expect(w.files.get(ROOT + '/.inloop/review/old-1.html')).toContain('href="index.html"')
})
