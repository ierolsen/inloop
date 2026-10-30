// The review: labels in every language, the pieces it is built from, the model and the HTML.
import { expect, test } from 'claude-code/testing'
import { en } from '../hooks/i18n/en.ts'
import { tr } from '../hooks/i18n/tr.ts'
import { de } from '../hooks/i18n/de.ts'
import { nl } from '../hooks/i18n/nl.ts'
import { labels, count, nameOf } from '../hooks/i18n/index.ts'
import { language } from '../hooks/config.ts'
import { cleanNote } from '../hooks/note.ts'
import { span, rich } from '../hooks/review/html.ts'
import { parsePatch, added, current, clip, flat, lineCount } from '../hooks/review/patch.ts'
import { highlight, languageOf } from '../hooks/review/highlight.ts'
import { place, segments } from '../hooks/review/anchor.ts'
import { build } from '../hooks/review/review.ts'
import { render, fit } from '../hooks/review/page.ts'
import { roleOf, fixedOrder } from '../hooks/review/roles.ts'
import { bytes } from '../hooks/log.ts'

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',')

test('every language has every label, with the same placeholders and both plural forms', async () => {
  for (const [name, lang] of Object.entries({ tr, de, nl })) {
    expect(Object.keys(lang).sort(), name).toEqual(Object.keys(en).sort())
    for (const [key, value] of Object.entries(en)) {
      const theirs = (lang as any)[key]
      if (typeof value === 'string') expect(placeholders(theirs), name + '.' + key).toBe(placeholders(value))
      else {
        expect(Object.keys(theirs).sort(), name + '.' + key).toEqual(['one', 'other'])
        expect(placeholders(theirs.one), name + '.' + key).toBe(placeholders(value.one))
        expect(placeholders(theirs.other), name + '.' + key).toBe(placeholders(value.other))
      }
      expect(JSON.stringify(theirs), name + '.' + key).not.toContain('\u2014')
    }
  }
})

test('counts and language names follow the reader\'s language', async () => {
  expect([1, 2].map((n) => count('de', labels('de').notes, n))).toEqual(['1 Notiz', '2 Notizen'])
  expect([1, 3].map((n) => count('tr', labels('tr').files, n))).toEqual(['1 dosya', '3 dosya'])
  expect(nameOf(language('tr')!, 'tr')).toBe('Türkçe')
  expect(nameOf(language('de')!, 'tr')).toBe('Almanca (Deutsch)')
  expect(nameOf(language('tr')!, 'en')).toBe('Turkish (Türkçe)')
})

test('note text: escaped first, then code spans, bold, bullets and steps', async () => {
  expect(span('a **b** `c **d**` <e>')).toBe('a <strong>b</strong> <code>c **d**</code> &lt;e&gt;')
  expect(rich('Lead line\n- one **x**\n- two\n\n1. first\n2. second')).toBe('<p>Lead line</p><ul><li>one <strong>x</strong></li><li>two</li></ul><ol><li>first</li><li>second</li></ol>')
  expect(rich('<script>')).toBe('<p>&lt;script&gt;</p>')
})

const PATCH = [
  'diff --git a/shapes.py b/shapes.py', 'new file mode 100644', 'index 0000000..1111111', '--- /dev/null', '+++ b/shapes.py',
  '@@ -0,0 +1,5 @@', '+class Rectangle:', '+    def area(self):', '+        return self.w * self.h', '+', '+def largest(rects):',
  'diff --git a/app.py b/app.py', 'index 2222222..3333333 100644', '--- a/app.py', '+++ b/app.py',
  '@@ -1,3 +1,4 @@', '+from shapes import Rectangle, largest', ' def main():', '-    print("hello")', '+    print(largest([Rectangle()]).area())', ' main()',
  '@@ -10,2 +11,2 @@ def other():', '-x = 1', '+x = 2', ' y = 3',
  'diff --git a/old.txt b/new.txt', 'similarity index 90%', 'rename from old.txt', 'rename to new.txt',
  'diff --git a/gone.py b/gone.py', 'deleted file mode 100644', 'index 4444444..0000000', '--- a/gone.py', '+++ /dev/null', '@@ -1 +0,0 @@', '-print("bye")',
  'diff --git a/img.png b/img.png', 'index 5555555..6666666 100644', 'Binary files a/img.png and b/img.png differ',
  'diff --git "a/na\\303\\257ve.py" "b/na\\303\\257ve.py"', 'index 7777777..8888888 100644', '--- "a/na\\303\\257ve.py"', '+++ "b/na\\303\\257ve.py"', '@@ -1 +1 @@', '-a', '+b',
].join('\n')

test('git patches become files of numbered lines', async () => {
  const files = parsePatch(PATCH)
  expect(files.map((f) => [f.path, f.status, f.added, f.removed, f.binary, f.oldPath])).toEqual([
    ['shapes.py', 'added', 5, 0, false, null], ['app.py', 'modified', 3, 2, false, null], ['new.txt', 'renamed', 0, 0, false, 'old.txt'],
    ['gone.py', 'deleted', 0, 1, false, null], ['img.png', 'modified', 0, 0, true, null], ['naïve.py', 'modified', 1, 1, false, null],
  ])
  const app = flat(files[1])
  expect(app.map((l) => (l ? [l.kind, l.old, l.new] : null))).toEqual([['+', null, 1], [' ', 1, 2], ['-', 2, null], ['+', null, 3], [' ', 3, 4], null, ['-', 10, null], ['+', null, 11], [' ', 11, 12]])
  expect(added('n.py', 'a\nb\n').hunks[0].lines.map((l) => [l.kind, l.new])).toEqual([['+', 1], ['+', 2]])
  const long = Array.from({ length: 100 }, (_, i) => 'line ' + (i + 1)).join('\n')
  expect(lineCount(current('x.py', long))).toBe(100)
  expect(current('x.py', long, [49], 50, 2).hunks.map((h) => [h.newStart, h.lines.length])).toEqual([[48, 5]])
  const cut = clip(files[1], 3)
  expect([lineCount(cut), cut.added, cut.removed]).toEqual([3, 3, 2])
  expect(roleOf('src/models.py')).toBe('data')
  expect(fixedOrder(['README.md', 'app.py', 'models.py']).map((x) => x.file)).toEqual(['models.py', 'app.py', 'README.md'])
})

test('code is highlighted in the languages people use, and defined names can link', async () => {
  expect(languageOf('a/b.py')).toBe('py')
  expect(languageOf('Dockerfile')).toBe('sh')
  expect(highlight('def area(self):  # the size', 'py')).toBe('<span class="t-k">def</span> <span class="t-f">area</span>(<span class="t-k">self</span>):  <span class="t-c"># the size</span>')
  expect(highlight('x = "a # b"', 'py')).toBe('x = <span class="t-s">&quot;a # b&quot;</span>')
  expect(highlight('const n = 0x1F /* c */ + 2', 'ts')).toBe('<span class="t-k">const</span> n = <span class="t-n">0x1F</span> <span class="t-c">/* c */</span> + <span class="t-n">2</span>')
  expect(highlight('largest(r)', 'py', (n) => (n === 'largest' ? { href: '#x', title: 'why' } : null))).toBe('<a class="xref" href="#x" title="why">largest</a>(r)')
  expect(highlight('<b>hi</b>', null)).toBe('&lt;b&gt;hi&lt;/b&gt;')
})

const noteOf = (fields: Record<string, unknown>) => cleanNote({ title: 't', tldr: 'p', what: 'w', why: 'y', ...fields }).note

test('each explanation finds its line once: definitions, borrowed names, parameters and quoted lines', async () => {
  const [shapes, app] = parsePatch(PATCH)
  const shapeLines = flat(shapes)
  const appLines = flat(app)
  const n1 = noteOf({ files: ['shapes.py', 'app.py'], symbols: [{ name: 'Rectangle', kind: 'class', why_exists: 'holds sizes' }, { name: 'Rectangle.area', kind: 'method', why_exists: 'w * h' }, { name: 'largest', kind: 'function', file: 'shapes.py', why_exists: 'picks one' }] })
  const n2 = noteOf({ files: ['app.py'], uses: [{ name: 'largest', from: 'shapes.py', why: 'to pick' }], parameters: [{ name: 'x', meaning: 'the x' }], lines: [{ anchor: 'print(largest(  [Rectangle', says: 'prints the area' }, { anchor: 'nowhere', says: 'lost' }] })
  const taken = new Set<string>()
  const inShapes = place('shapes.py', shapeLines, [{ id: 'n1', note: n1 }, { id: 'n2', note: n2 }], taken)
  expect(inShapes.map((p) => [p.at, p.mark.kind, p.mark.item])).toEqual([[0, 'symbol', 0], [1, 'symbol', 1], [4, 'symbol', 2]])
  const inApp = place('app.py', appLines, [{ id: 'n1', note: n1 }, { id: 'n2', note: n2 }], taken)
  // the borrowed name lands on the import, never in shapes.py where it is defined
  expect(inApp.map((p) => [p.at, p.mark.note, p.mark.kind, p.mark.item])).toEqual([[0, 'n2', 'use', 0], [3, 'n2', 'line', 0], [7, 'n2', 'param', 0]])
  expect(taken.has('n2:line:1')).toBe(false)
  expect(segments(shapeLines.length, inShapes)).toEqual([{ from: 0, to: 3, marks: [inShapes[0].mark, inShapes[1].mark] }, { from: 4, to: 4, marks: [inShapes[2].mark] }])
  expect(segments(4, [])).toEqual([{ from: 0, to: 3, marks: [] }])
})

// A small history: a commit with a note, a commit explained afterwards, an amended commit, a commit
// with no note, work not committed yet, and a file explained as it stands.
const base = { v: 1, session: 's1', agent: null, turn: 't1' }
const rec = (kind: string, fields: Record<string, unknown>) => ({ ...base, kind, ts: 1, ...fields }) as any
const noteRec = (id: string, fields: Record<string, unknown>, source = 'live') => rec('note', { id, n: 0, source, problems: [], note: noteOf(fields) })
const editRec = (id: string, path: string, note: string) => rec('edit', { id, tool: 'Write', path, note, listed: true, status: 'ok', created: true, diff: null, added: 1, removed: 0, truncated: false, skipped: null, redactions: 0 })
const RECORDS = [
  rec('session', { root: '/work/shop', language: 'Turkish', language_code: 'tr', detail: 'standard', version: '0.1.0' }),
  noteRec('n1', { title: 'Shapes', files: ['shapes.py'], symbols: [{ name: 'Rectangle', kind: 'class', file: 'shapes.py', why_exists: 'holds sizes' }], lines: [{ anchor: 'def largest', says: 'picks the **biggest**' }] }),
  editRec('w1', 'shapes.py', 'n1'),
  rec('commit', { sha: 'b2b2b2b2', parents: ['a1a1a1a1'], subject: 'feat: add shapes', files: ['shapes.py'], edits: ['w1'], notes: ['n1'] }),
  noteRec('n2', { title: 'Use it', files: ['app.py'], uses: [{ name: 'largest', from: 'shapes.py', why: 'to pick the biggest' }] }),
  editRec('w2', 'app.py', 'n2'),
  noteRec('n3', { title: 'Explained commit', files: ['other.py'], commit: 'c3c3c3' }, 'reconstructed'),
  noteRec('n5', { title: '<script>alert(1)</script>', files: ['fix.py'] }),
  rec('commit', { sha: 'e5e5e5e5', parents: ['c3c3c3c3'], subject: 'fix: amended', files: ['fix.py'], edits: [], notes: ['n5'] }),
  noteRec('n4', { title: 'What util is', files: ['util.py'], symbols: [{ name: 'helper', kind: 'function', why_exists: 'shared code' }] }, 'reconstructed'),
  rec('recap', { id: 'r1', recap: { overview: 'Added **shapes**.', reading_order: [], groups: [], check_by_hand: ['Run `pytest`.'] } }),
]
const [SHAPES, APP] = parsePatch(PATCH)
const COMMITS = [
  { sha: 'b2b2b2b2', parents: ['a1a1a1a1'], author: 'Erol', time: 1_700_000_000_000, subject: 'feat: add shapes', body: '', files: [{ patch: SHAPES, redactions: 0, hidden: null, cut: false }] },
  { sha: 'c3c3c3c3', parents: ['b2b2b2b2'], author: 'Erol', time: 1_700_000_100_000, subject: 'chore: other', body: 'Why: tidy.', files: [{ patch: added('other.py', 'x = 1'), redactions: 0, hidden: null, cut: false }] },
  { sha: 'd4d4d4d4', parents: ['c3c3c3c3'], author: 'Erol', time: 1_700_000_200_000, subject: 'fix: amended', body: '', files: [{ patch: added('fix.py', 'y = 2'), redactions: 0, hidden: null, cut: false }] },
  { sha: 'f6f6f6f6', parents: ['d4d4d4d4'], author: 'Erol', time: 1_700_000_300_000, subject: 'docs: by hand', body: '', files: [{ patch: added('README.md', 'hi'), redactions: 0, hidden: null, cut: false }] },
]
const source = (extra: Record<string, unknown> = {}) => ({
  records: RECORDS, commits: COMMITS, more: 2, git: true, scope: 'session' as const, range: null, project: 'shop',
  pending: [{ patch: APP, redactions: 1, hidden: null, cut: false }, { patch: added('.env', ''), redactions: 0, hidden: 'sensitive' as const, cut: false }],
  explained: [{ path: 'util.py', text: 'def helper():\n    return 1\n' }], ...extra,
}) as any

test('commits find their notes by record, by a reconstructed note\'s commit, and by subject when amended', async () => {
  const r = build(source())
  expect(r.groups.map((g) => [g.kind, g.id, g.notes.map((x) => x.id)])).toEqual([
    ['commit', 'c-b2b2b2b2', ['n1']], ['commit', 'c-c3c3c3c3', ['n3']], ['commit', 'c-d4d4d4d4', ['n5']], ['commit', 'c-f6f6f6f6', []], ['pending', 'pending', ['n2']],
  ])
  const shapes = r.groups[0].files[0]
  expect([...shapes.pins]).toEqual([['n1:symbol:0', 1], ['n1:line:0', 2]])
  expect(r.groups[4].files.map((f) => [f.data.patch.path, f.tags])).toEqual([['app.py', ['redacted']], ['.env', ['added', 'sensitive', 'unexplained']]])
  expect(r.groups[3].files[0].tags).toEqual(['added', 'unexplained'])
  expect(r.explained?.notes.map((x) => x.id)).toEqual(['n4'])
  expect(r.explained?.files[0].pins.get('n4:symbol:0')).toBe(1)
  expect(r.index.map((x) => [x.name, x.href])).toEqual([['Rectangle', '#c-b2b2b2b2-f0-1'], ['helper', '#explained-f0-1']])
  expect(r.links.get('Rectangle')).toEqual({ href: '#c-b2b2b2b2-f0-1', title: 'holds sizes' })
  expect(r.checks).toEqual(['Run `pytest`.'])
  expect(r.counts.commits).toBe(4)
})

test('the page puts each explanation beside its line, in the reader\'s language, and loads nothing', async () => {
  const html = render(build(source()), labels('tr'), { code: 'tr', theme: 'auto', version: '0.1.0' })
  expect(html).toContain('<html lang="tr">')
  expect(html).toContain("default-src 'none'")
  expect(html.split('<script>').length).toBe(3) // the theme boot and the page's script, nothing else
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  for (const word of ['İnceleme: Claude neyi değiştirdi, neden', 'Commit 1 / 4', 'Henüz commitlenmedi', 'Sonradan açıklanan kod', 'Sınıf ve fonksiyon dizini', 'Otomatik', 'PDF olarak kaydet',
    'kaynak: shapes.py', 'picks the <strong>biggest</strong>', 'Bu commit için inloop notu yok', '<code>/inloop:explain f6f6f6f</code>', 'içerik kaydedilmedi', '1 gizli değer saklandı', 'Elle kontrol edilecekler', 'Added <strong>shapes</strong>.']) {
    expect(html, word).toContain(word)
  }
  // the numbered pin beside the code, the code highlighted, and the name linked from another file
  expect(html).toContain('<td class="p"><span class="pin">1</span></td><td class="m">+</td><td class="c"><span class="t-k">class</span> <span class="t-f">Rectangle</span>:</td>')
  expect(html).toContain('<a class="xref" href="#c-b2b2b2b2-f0-1" title="holds sizes">Rectangle</a>')
  expect(html).not.toContain('\u2014')
  const dark = render(build(source()), labels('en'), { code: 'en', theme: 'dark', version: '0.1.0' })
  expect(dark).toContain('<html lang="en" data-theme="dark" data-fixed>')
  expect(dark).toContain('Commit 1 of 4')
  expect(dark).toContain('2 older commits in this range are not shown.')
})

test('a page over its budget leaves out the code of its longest files first', async () => {
  const big = added('big.py', Array.from({ length: 600 }, (_, i) => 'v' + i + ' = ' + 'x'.repeat(80)).join('\n'))
  const src = source({ commits: [...COMMITS, { sha: 'a7a7a7a7', parents: [], author: 'E', time: 1, subject: 'big', body: '', files: [{ patch: big, redactions: 0, hidden: null, cut: false }] }] })
  const full = bytes(render(build(src), labels('en'), { code: 'en', theme: 'auto', version: '0.1.0' }))
  const page = fit(build(src), labels('en'), { code: 'en', theme: 'auto', version: '0.1.0' }, full - 1000)
  expect(page.cut).toBeGreaterThan(0)
  expect(bytes(page.html)).toBeLessThanOrEqual(full - 1000)
  expect(page.html).toContain('The code of this file is left out to keep the page small')
})
