// The review page: labels in every language, the page model, and the HTML.
import { expect, test } from 'claude-code/testing'
import { labels, count, nameOf } from '../hooks/i18n/index.ts'
import { language } from '../hooks/config.ts'
import { build, roleOf, fixedOrder, titleOf, diffs } from '../hooks/review/model.ts'
import { render, fit, diffTable, sessions, inline } from '../hooks/review/render.ts'
import { bytes } from '../hooks/log.ts'

test('counts and language names follow the reader\'s language', async () => {
  expect([1, 2].map((n) => count('en', labels('en').notes, n))).toEqual(['1 note', '2 notes'])
  expect(nameOf(language('tr')!, 'en')).toBe('Turkish (Türkçe)')
  expect(nameOf(language('en')!, 'en')).toBe('English')
  expect(nameOf(language('Klingon')!, 'en')).toBe('Klingon')
})

// A small session: two tasks, a subagent, an unexplained edit, a change made by a shell command.
const base = { v: 1, session: 's1', agent: null as string | null, turn: 't1' }
const note = (id: string, n: number, files: string[], extra: Record<string, unknown> = {}) => ({
  ...base, kind: 'note', ts: 10 + n, id, n, source: 'live', problems: [],
  note: { title: 'Note ' + n, files, what: 'What ' + n, why: 'Why ' + n, basis: 'judgment', alternatives: [], parameters: [], symbols: [], risks: [], ...extra },
})
const edit = (id: string, path: string, noteId: string | null, extra: Record<string, unknown> = {}) => ({
  ...base, kind: 'edit', ts: 20, id, tool: 'Edit', path, note: noteId, listed: !!noteId, status: 'ok', created: false,
  diff: '@@ -1 +1 @@\n-old\n+new', added: 1, removed: 1, truncated: false, skipped: null, redactions: 0, ...extra,
})
const recap = (overview: string, extra: Record<string, unknown> = {}) => ({
  ...base, kind: 'recap', ts: 30, id: 'r', recap: { overview, reading_order: [], groups: [], check_by_hand: [], ...extra },
})
const RECORDS: any[] = [
  { ...base, kind: 'session', ts: 1, turn: null, root: '/work/shop', language: 'English', language_code: 'en', detail: 'standard', version: '0.1.0' },
  { ...base, kind: 'baseline', ts: 1, turn: null, git: true, head: 'abc', dirty: [] },
  note('n1', 1, ['src/cart.py'], { symbols: [{ name: 'Cart', kind: 'class', file: 'src/cart.py', why_exists: 'Holds the items.', why_this_shape: null, called_by: null }] }),
  edit('e1', 'src/cart.py', 'n1'),
  { ...base, kind: 'note', ts: 12, id: 'n2', n: 2, agent: 'sub-1', source: 'live', problems: ['why is empty'], note: { title: 'Tests', files: ['tests/test_cart.py', 'run.sh'], what: 'w', why: '', basis: null, alternatives: [], parameters: [], symbols: [], risks: [] } },
  edit('e2', 'tests/test_cart.py', 'n2', { agent: 'sub-1', created: true }),
  { ...recap('Sub summary.'), agent: 'sub-1' },
  edit('e3', 'README.md', null),
  edit('e4', 'src/denied.py', null, { status: 'denied' }),
  recap('Added a cart. It holds items.', { reading_order: [{ file: 'src/cart.py', why: 'the core' }], check_by_hand: ['Run `pytest`.'] }),
  note('n3', 3, ['web/cart.html']),
  edit('e5', 'web/cart.html', 'n3'),
  edit('e6', 'src/models.py', 'n3', { listed: false }),
  { ...base, kind: 'switch', ts: 40, on: false },
  { ...base, kind: 'outside', ts: 50, entries: [
    { path: 'run.sh', state: 'modified', diff: '@@ -1 +1 @@\n-a\n+b', added: 1, removed: 1, truncated: false, skipped: null, redactions: 0 },
    { path: 'gen.txt', state: 'added', diff: '@@ -0,0 +1 @@\n+x', added: 1, removed: 0, truncated: false, skipped: null, redactions: 0 },
  ], more: 2 },
]

test('a session splits into tasks at the main loop\'s recaps; edits and outside changes find their notes', async () => {
  const page = build(RECORDS)
  expect(page.project).toBe('shop')
  expect(page.tasks.map((t) => [t.n, !!t.recap, t.items.length])).toEqual([[1, true, 2], [2, false, 2]])
  const [one, two] = page.tasks
  expect(one.agentRecaps).toEqual([{ agent: 'sub-1', recap: expect.objectContaining({ overview: 'Sub summary.' }) }])
  expect(one.unexplained.map((e) => e.path)).toEqual(['README.md'])
  expect(one.reading.map((r) => r.file)).toEqual(['src/cart.py'])
  expect(one.unlisted).toEqual(['tests/test_cart.py', 'README.md', 'run.sh'])
  // the shell's change to run.sh goes with the note that names it; gen.txt has none
  const n2 = one.items[1]
  expect(n2.kind === 'note' && n2.note.outside.map((x) => x.path)).toEqual(['run.sh'])
  expect(page.outside.map((x) => x.path)).toEqual(['gen.txt'])
  expect(page.outsideMore).toBe(2)
  // the task with no recap is read in the fixed order: data before interface
  expect(two.fixed).toBe(true)
  expect(two.reading.map((r) => [r.file, r.role])).toEqual([['src/models.py', 'data'], ['web/cart.html', 'ui']])
  expect(two.items[1]).toMatchObject({ kind: 'switch', on: false })
  expect(page.counts).toEqual({ notes: 3, edits: 5, unexplained: 1, files: 7, outside: 4 })
  expect(page.symbols).toEqual([{ name: 'Cart', kind: 'class', file: 'src/cart.py', why_exists: 'Holds the items.', note: 1 }])
  expect(page.agents).toEqual(['sub-1'])
  expect(titleOf(page)).toBe('Added a cart.')
  expect(build([]).tasks).toHaveLength(1)
})

test('file roles put data first and tests after logic', async () => {
  expect(['src/models.py', 'db/schema.sql', 'types.ts', 'api.d.ts'].map(roleOf)).toEqual(['data', 'data', 'data', 'data'])
  expect(['src/app.py', 'lib/util.ts'].map(roleOf)).toEqual(['logic', 'logic'])
  expect(['web/index.html', 'src/components/Cart.tsx', 'style.css'].map(roleOf)).toEqual(['ui', 'ui', 'ui'])
  expect(['tests/test_a.py', 'src/a.test.ts', 'a_test.go'].map(roleOf)).toEqual(['tests', 'tests', 'tests'])
  expect(['package.json', '.github/workflows/ci.yml', 'Dockerfile'].map(roleOf)).toEqual(['config', 'config', 'config'])
  expect(['README.md', 'docs/guide.txt'].map(roleOf)).toEqual(['docs', 'docs'])
  expect(fixedOrder(['README.md', 'tests/t.py', 'app.py', 'models.py']).map((r) => r.file)).toEqual(['models.py', 'app.py', 'tests/t.py', 'README.md'])
})

test('the page escapes what it shows and loads nothing', async () => {
  const records = [...RECORDS]
  records[2] = note('n1', 1, ['a.py'], { title: '<script>alert(1)</script>', why: 'Uses `max()` & "quotes"' })
  records[3] = edit('e1', 'a.py', 'n1', { diff: '@@ -1 +1 @@\n-</script><img src=x>\n+ok' })
  const html = render(build(records), labels('en'), { code: 'en', log: '.inloop/log/s1.jsonl' })
  expect(html.split('<script>').length).toBe(2) // only the page's own script
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  expect(html).toContain('&lt;/script&gt;&lt;img src=x&gt;')
  expect(html).toContain('Uses <code>max()</code> &amp; &quot;quotes&quot;')
  expect(html).toContain("default-src 'none'")
  expect(html).not.toMatch(/\ssrc=["']?http/)
  expect(html).not.toContain('\u2014')
})

test('the page names what it shows in its labels\' language', async () => {
  const enHtml = render(build(RECORDS), labels('en'), { code: 'en', log: '.inloop/log/s1.jsonl', back: 'index.html' })
  for (const word of ['<html lang="en">', 'Start here', 'Check by hand', 'Run <code>pytest</code>.', 'not named in the note', 'Claude left this out of the note: Why.', 'subagent sub-1', 'href="index.html"', 'inloop was turned off on', '3 notes, 5 edits in 7 files', '2 more files not listed.']) expect(enHtml).toContain(word)
})

test('a diff shows old and new line numbers', async () => {
  const html = diffTable('@@ -3,2 +3,3 @@\n a\n-b\n+c\n+d')
  expect(html).toContain('<td class="o">3</td><td class="n">3</td><td class="m"></td><td class="c">a</td>')
  expect(html).toContain('<tr class="d"><td class="o">4</td><td class="n"></td>')
  expect(html).toContain('<tr class="a"><td class="o"></td><td class="n">4</td>')
  expect(html).toContain('<tr class="a"><td class="o"></td><td class="n">5</td>')
  expect(inline('a `b` <c>')).toBe('a <code>b</code> &lt;c&gt;')
})

test('a page over its budget leaves out the largest diffs first, then the oldest tasks', async () => {
  const big = Array.from({ length: 300 }, (_, i) => '+line ' + i + ' ' + 'x'.repeat(60)).join('\n')
  const records = RECORDS.map((r: any) => (r.kind === 'edit' && r.id === 'e1' ? { ...r, diff: '@@ -0,0 +1,300 @@\n' + big, added: 300 } : r))
  const meta = { code: 'en', log: 'x' }
  const full = render(build(records), labels('en'), meta)
  const budget = bytes(full) - 1000
  const cut = fit(build(records), labels('en'), meta, budget)
  expect(cut.trimmed).toBe(1)
  expect(cut.dropped).toBe(0)
  expect(bytes(cut.html)).toBeLessThanOrEqual(budget)
  expect(cut.html).toContain('Diff left out to keep this page small; the log has it.')
  // a budget the page meets only without its first task
  const bare = build(records)
  diffs(bare).forEach((x) => { x.trimmed = true })
  const withAll = bytes(render(bare, labels('en'), meta))
  bare.tasks[0].dropped = true
  const withLast = bytes(render(bare, labels('en'), meta))
  const tiny = fit(build(records), labels('en'), meta, Math.floor((withAll + withLast) / 2))
  expect(tiny.dropped).toBe(1)
  expect(tiny.html).toContain('1 earlier task is left out to keep this page small')
})

test('the list of sessions links each page', async () => {
  const html = sessions('shop', [{ href: 's1.html', started: 1, title: 'Added a cart.', notes: 3, edits: 5, unexplained: 1 }, { href: 's2.html', started: 2, title: '', notes: 0, edits: 0, unexplained: 0 }], 4, labels('en'), 'en', '0.1.0')
  expect(html).toContain('<a href="s1.html">Added a cart.</a>')
  expect(html).toContain('<a href="s2.html">Session without notes</a>')
  expect(html).toContain('3 notes, 5 edits')
  expect(html).toContain('4 older sessions are not listed.')
})
