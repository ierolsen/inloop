// The live view: the cards that replace the note and recap rows, and the pane.
import { expect, test } from 'claude-code/testing'
import { worldOf, ROOT, START, command, note, turnDone } from './world.ts'

const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const
const NOTE = {
  title: 'Add a Rectangle class', files: ['shapes.py'], what: 'Adds `Rectangle` with `area()`.', why: 'The CLI compares rectangles by area.',
  basis: 'judgment', symbols: [{ name: 'Rectangle', kind: 'class', why_exists: 'Holds width and height.' }],
  parameters: [{ name: 'default', meaning: 'value for an empty list', default: 'None', why_this_value: 'An empty list must not raise.' }],
  risks: ['Negative sizes are not checked.'],
}
const row = (tool: string, input: unknown, id = 'toolu_1') => ({
  plugin: 'inloop', component: 'ToolUse' as const, requestId: id,
  props: { tool_use_id: id, tool, input, isRunning: false, isErrored: false, isInterrupted: false },
})
const PANE_PROPS = { title: 'inloop', isFocused: true, bodyColumns: 80, placement: 'inline', scroll: { offset: 0, bodyRows: 30 }, view: {} }

test('a note\'s row is drawn as a card on every surface, numbered once the note is saved', async ($, on) => {
  worldOf(on)
  await $.session.start(START)
  await $.tool.call({ ...note(NOTE), tool_use_id: 'toolu_1' })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...row('mcp__inloop__note', NOTE), surface } as any)
    expect((await ui.find({ text: 'note 1' }))?.text, surface).toContain('Claude\'s choice')
    expect(await ui.find({ text: 'Add a Rectangle class' }), surface).toBeDefined()
    expect((await ui.find({ type: 'Markdown', text: /The CLI compares/ }))?.text, surface).toBe('**Why:** The CLI compares rectangles by area.')
    expect(await ui.find({ type: 'Markdown', text: /`Rectangle` \(class\): Holds width and height\./ }), surface).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /`default` = `None`: An empty list must not raise\./ }), surface).toBeDefined()
    await ui.unmount()
  }
})

test('a card speaks the reader\'s language, draws a half-streamed note, and hides secrets', async ($, on) => {
  worldOf(on, { store: { settings: { language: 'tr' } } })
  await $.session.start(START)
  const half = await $.ui.mount({ ...row('mcp__inloop__note', { title: 'Yarım' }, 'toolu_9'), surface: 'terminal' } as any)
  expect(await half.find({ text: 'Yarım' })).toBeDefined()
  expect(await half.find({ type: 'Markdown' })).toBeUndefined()
  const key = 'sk-ant-' + 'k'.repeat(32)
  const ui = await $.ui.mount({ ...row('mcp__inloop__note', { ...NOTE, why: 'Uses ' + key }), surface: 'terminal' } as any)
  expect((await ui.find({ type: 'Markdown', text: /Neden/ }))?.text).toBe('**Neden:** Uses [redacted]')
  expect(await ui.find({ text: /Sınıflar ve fonksiyonlar/ })).toBeDefined()
})

test('the recap\'s row is drawn as a summary card; other tools keep their own rows', async ($, on) => {
  worldOf(on)
  await $.session.start(START)
  const recap = { overview: 'Added shapes.', reading_order: [{ file: 'shapes.py', why: 'the class' }], check_by_hand: ['Run `python3 app.py`.'] }
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...row('mcp__inloop__recap', recap), surface } as any)
    expect(await ui.find({ type: 'Markdown', text: 'Added shapes.' }), surface).toBeDefined()
    expect((await ui.find({ type: 'Markdown', text: /Start here/ }))?.text, surface).toBe('**Start here**\n1. `shapes.py`: the class')
    await ui.unmount()
  }
})

test('the pane steps through the notes, follows the newest, and closes', async ($, on) => {
  const w = worldOf(on, { files: { [ROOT + '/util.py']: 'x = 1\n' } })
  await $.session.start(START)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ ...note({ title: 'First change', files: ['util.py'], what: 'w1', why: 'y1' }), tool_use_id: 'n1' })
  await $.tool.call({ tool: 'Edit', file_path: ROOT + '/util.py', old_string: 'x = 1', new_string: 'x = 2' } as any)
  expect((await $.command.run(command('pane'))).text).toStartWith('The inloop pane is open')
  expect([...w.panes.keys()]).toEqual(['inloop'])
  await $.tool.call({ ...note({ title: 'Second change', files: ['b.py'], what: 'w2', why: 'y2' }), tool_use_id: 'n2' })
  expect(w.invalidated).toContain('ui.render')

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ plugin: 'inloop', surface, component: 'Pane', requestId: 'inloop', props: PANE_PROPS } as any)
    expect((await ui.find({ type: 'Text', text: /2 of 2/ }))?.text, surface).toContain('following Claude')
    expect(await ui.find({ text: '#2 Second change' }), surface).toBeDefined()
    await ui.unmount()
  }
  const ui = await $.ui.mount({ plugin: 'inloop', surface: 'terminal', component: 'Pane', requestId: 'inloop', props: PANE_PROPS } as any)
  await ui.press({ key: 'prev' })
  expect((await ui.find({ type: 'Text', text: /1 of 2/ }))?.text).not.toContain('following')
  expect(await ui.find({ text: '#1 First change' })).toBeDefined()
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ format: 'diff', source: '@@ -1,1 +1,1 @@\n-x = 1\n+x = 2' })
  await ui.press({ key: 'next' })
  expect((await ui.find({ type: 'Text', text: /2 of 2/ }))?.text).toContain('following Claude')
  await ui.press({ key: 'close' })
  expect([...w.panes.keys()]).toEqual([])
  // closed: new notes no longer redraw anything
  const drawn = w.invalidated.length
  await $.tool.call(note({ title: 'Third', files: ['c.py'], what: 'w', why: 'y' }))
  expect(w.invalidated.length).toBe(drawn)
  await $.turn.complete(turnDone('t1'))
})

test('a diff cut short in the log still draws in the pane', async ($, on) => {
  const base = { v: 1, session: 'sess-1', agent: null, turn: 't1' }
  const records = [
    { ...base, kind: 'session', ts: 1, turn: null, root: ROOT, language: 'English', language_code: 'en', detail: 'standard', version: '0.1.0' },
    { ...base, kind: 'baseline', ts: 1, turn: null, git: false, head: null, dirty: [] },
    { ...base, kind: 'note', ts: 2, id: 'n1', n: 1, source: 'live', problems: [], note: { title: 'Big', files: ['big.py'], what: 'w', why: 'y', basis: null, alternatives: [], parameters: [], symbols: [], risks: [] } },
    { ...base, kind: 'edit', ts: 3, id: 'e1', tool: 'Write', path: 'big.py', note: 'n1', listed: true, status: 'ok', created: true, diff: '@@ -0,0 +1,500 @@\n+a\n+b', added: 500, removed: 0, truncated: true, skipped: null, redactions: 0 },
  ]
  const w = worldOf(on, { files: { [ROOT + '/.inloop/log/sess-1.jsonl']: records.map((r) => JSON.stringify(r) + '\n').join('') } })
  await $.session.start(START)
  await $.command.run(command('pane'))
  const ui = await $.ui.mount({ plugin: 'inloop', surface: 'terminal', component: 'Pane', requestId: 'inloop', props: PANE_PROPS } as any)
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: '@@ -0,0 +1,2 @@\n+a\n+b' })
  expect(await ui.find({ text: /The diff goes on/ })).toBeDefined()
  expect(w.panes.size).toBe(1)
})

test('a pane that finds no room says so and stays closed', async ($, on) => {
  const w = worldOf(on)
  w.room = false
  await $.session.start(START)
  expect((await $.command.run(command('pane'))).text).toBe('The pane cannot open here; /inloop open shows the review page instead.')
  expect(w.panes.size).toBe(0)
})
