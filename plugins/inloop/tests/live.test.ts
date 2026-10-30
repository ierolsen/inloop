// The live view: the cards that replace the note and recap rows, and the pane.
import { expect, test } from 'claude-code/testing'
import { worldOf, ROOT, START, note } from './world.ts'

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
  expect(await ui.find({ text: /Class'lar ve fonksiyonlar/ })).toBeDefined()
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

test('an explanation of existing code is marked and never pairs with an edit', async ($, on) => {
  const w = worldOf(on)
  await $.session.start(START)
  await $.turn.start({ text: 'explain util.py', turnId: 't1' })
  await $.tool.call(note({ title: 'What util.py is for', files: ['util.py'], what: 'w', why: 'Likely a helper.', source: 'reconstructed' }))
  await $.tool.call({ tool: 'Write', file_path: ROOT + '/util.py', content: 'x = 1\n' } as any)
  const records = w.records()
  expect(records.find((r) => r.kind === 'note').source).toBe('reconstructed')
  expect(records.find((r) => r.kind === 'edit').note).toBe(null)
  const ui = await $.ui.mount({ ...row('mcp__inloop__note', { title: 'What util.py is for', what: 'w', why: 'y', source: 'reconstructed' }), surface: 'terminal' } as any)
  expect((await ui.find({ type: 'Text', text: /explained afterwards/ }))).toBeDefined()
})
