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
import { render, fit, pinsHtml } from '../hooks/review/page.ts'
import { explore, parseBlame, slug, fileId, dirId, folders } from '../hooks/review/explorer.ts'
import { markdown, md, MARKER, COMMENT_MAX } from '../hooks/review/markdown.ts'
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
  expect(span('the **`MedHouseVal`** column')).toBe('the <strong><code>MedHouseVal</code></strong> column')
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
  expect(roleOf('housing/model.py')).toBe('logic') // a machine learning model is logic, Django's models.py is data
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
  // several names in one entry: the first that is found places it
  const n3 = noteOf({ files: ['app.py'], uses: [{ name: 'main, largest', from: 'shapes.py', why: 'both' }], symbols: [{ name: 'nothing / Rectangle', kind: 'class', file: 'shapes.py', why_exists: 'x' }] })
  expect(place('app.py', appLines, [{ id: 'n3', note: n3 }]).map((p) => [p.at, p.mark.kind])).toEqual([[0, 'use']])
  expect(place('shapes.py', shapeLines, [{ id: 'n3', note: n3 }]).map((p) => [p.at, p.mark.kind])).toEqual([[0, 'symbol']])
})

// A small history: a commit with a note, a commit explained afterwards, an amended commit, a commit
// with no note, work not committed yet, and a file explained as it stands.
const base = { v: 1, session: 's1', agent: null, turn: 't1' }
const rec = (kind: string, fields: Record<string, unknown>) => ({ ...base, kind, ts: 1, ...fields }) as any
const noteRec = (id: string, fields: Record<string, unknown>, source = 'live') => rec('note', { id, n: 0, source, problems: [], note: noteOf(fields) })
const editRec = (id: string, path: string, note: string) => rec('edit', { id, tool: 'Write', path, note, listed: true, status: 'ok', created: true, diff: null, added: 1, removed: 0, truncated: false, skipped: null, redactions: 0 })
const RECORDS = [
  rec('session', { root: '/work/shop', language: 'Turkish', language_code: 'tr', detail: 'standard', version: '0.1.0' }),
  noteRec('n1', { title: 'Shapes', files: ['shapes.py'], symbols: [{ name: 'Rectangle', kind: 'class', file: 'shapes.py', why_exists: 'holds sizes' }], lines: [{ anchor: 'def largest', says: 'picks the **biggest**' }], terms: [{ term: 'random seed', means: 'the start of a random sequence' }], impact: ['app.py relies on largest()'] }),
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
  // the session was written before levels had their names: "standard" is "guided"
  expect(r.written).toBe('guided')
})

// The files of that history as they stand, and which commit last wrote each line: a later change
// not committed yet rewrote the line of shapes.py that a note was about.
const SHAPES_NOW = 'class Rectangle:\n    def area(self):\n        return self.w * self.h\n\ndef largest(rects, key=None):\n'
const APP_NOW = 'from shapes import Rectangle, largest\ndef main():\n    print(largest([Rectangle()]).area())\nmain()\n'
const P = '0000000000000000000000000000000000000000'
const stateOf = (path: string, text: string | null, blame: string[] | null, hidden: any = null) => ({ path, text, hidden, blame })
const STATES = [
  stateOf('shapes.py', SHAPES_NOW, ['b2b2b2b2', 'b2b2b2b2', 'b2b2b2b2', 'b2b2b2b2', P]),
  stateOf('other.py', 'x = 1', ['c3c3c3c3']),
  stateOf('fix.py', 'y = 2', ['d4d4d4d4']),
  stateOf('README.md', 'hi', ['f6f6f6f6']),
  stateOf('app.py', APP_NOW, [P, 'a1a1a1a1', P, 'a1a1a1a1']),
  stateOf('.env', null, null, 'sensitive'),
  stateOf('util.py', 'def helper():\n    return 1\n', ['a1a1a1a1', 'a1a1a1a1']),
  stateOf('docs/old/notes.md', null, null, 'deleted'),
]
const INFO = new Map([['a1a1a1a1', { summary: 'chore: start', time: 1_600_000_000_000 }]])
const OPTIONS = { code: 'tr', theme: 'auto' as const, version: '0.1.0', level: 'guided' as const, written: true, mode: 'review' as const, start: null, command: '/inloop review', made: 1_700_000_000_000 }

// Every anchor once, and every link inside the page lands on one: a link to nothing would quietly
// show the overview instead.
function linksHold(page: string) {
  const html = page.replace(/<script>[\s\S]*?<\/script>/g, '')
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])
  expect(ids.filter((id, i) => ids.indexOf(id) !== i), 'anchors used twice').toEqual([])
  const known = new Set(ids)
  expect([...html.matchAll(/href="#([^"]*)"/g)].map((m) => m[1]).filter((h) => !known.has(h)), 'links to nothing').toEqual([])
}

test('blame says which commit wrote each line; explanations sit only on lines no later commit rewrote', async () => {
  const porcelain = [
    'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2 1 1 2', 'author E', 'committer-time 1700000000', 'summary feat: add shapes', 'filename shapes.py', '\tclass Rectangle:',
    'b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2 2 2', '\t    def area(self):',
    '0000000000000000000000000000000000000000 3 3 1', 'author Not Committed Yet', 'committer-time 1700000500', 'summary Version of shapes.py from shapes.py', 'filename shapes.py', '\tsummary of the area',
  ].join('\n')
  const parsed = parseBlame(porcelain)
  expect(parsed.lines).toEqual(['b2'.repeat(20), 'b2'.repeat(20), P])
  expect(parsed.info.get('b2'.repeat(20))).toEqual({ summary: 'feat: add shapes', time: 1_700_000_000_000 })
  expect(slug('src/a b/Ünï.py')).toMatch(/^src-a-b-n-py-[0-9a-z]+$/)
  expect(fileId('x.py')).not.toBe(fileId('x-py'))

  const r = build(source())
  const x = explore(r, STATES as any, INFO)
  const shapes = x.byPath.get('shapes.py')!
  // the class is on its line; the comment about "def largest" lost its line to the change not committed
  expect([...shapes.pins.keys()]).toEqual(['n1:symbol:0'])
  expect(shapes.moved.map((m) => [m.mark.kind, m.group.id, m.href])).toEqual([['line', 'c-b2b2b2b2', '#c-b2b2b2b2-f0-2']])
  expect(shapes.why.map((w) => [w.from, w.to, w.title, w.href, w.mine])).toEqual([[0, 3, 'Shapes', '#c-b2b2b2b2', true], [4, 4, '', '#pending', true]])
  // the borrowed name sits on the import, a line the work not committed wrote
  const app = x.byPath.get('app.py')!
  expect([...app.pinAt]).toEqual([[0, [1]]])
  expect(app.why.map((w) => [w.from, w.to, w.title, w.mine])).toEqual([[0, 0, '', true], [1, 1, 'chore: start', false], [2, 2, '', true], [3, 3, 'chore: start', false]])
  expect(x.byPath.get('util.py')!.pins.get('n4:symbol:0')).toBe(1)
  // the tree: folders first, a file's status, the notes that explain it, and its last change
  expect(x.root.children.map((n) => [n.name, n.kind, n.status, n.notes])).toEqual([
    ['docs', 'dir', null, 0], ['.env', 'file', 'added', 0], ['app.py', 'file', 'modified', 1], ['fix.py', 'file', 'added', 1], ['other.py', 'file', 'added', 1],
    ['README.md', 'file', 'added', 0], ['shapes.py', 'file', 'added', 1], ['util.py', 'file', null, 1],
  ])
  expect(x.root.children[0].children[0].children[0]).toMatchObject({ path: 'docs/old/notes.md', status: 'deleted' })
  expect(x.root.last?.href).toBe('#pending')
  expect(folders(x.root).map((n) => dirId(n.path))).toEqual(['d-root', dirId('docs'), dirId('docs/old')])
})

test('the explorer: a tree of files, each with its code, its changes and why each line is there', async () => {
  const r = build(source())
  const x = explore(r, STATES as any, INFO)
  const html = render(r, x, labels('tr'), OPTIONS)
  linksHold(html)
  expect(html).toContain('<html lang="tr" data-level="guided" data-start="overview">')
  expect(html).toContain("default-src 'none'")
  expect(html.split('<script>').length).toBe(3) // the theme boot and the page's script, nothing else
  expect(html).toContain('body:not(:has(:target)) #overview { display: block; }')
  expect(html).toContain('[data-level="essentials"] .lv-param')
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  for (const word of ['Review: Claude neyi değiştirdi, neden', 'Commit 1 / 4', 'Henüz commitlenmedi', 'Sonradan açıklanan kod', 'Class&#39;lar ve fonksiyonlar', 'Otomatik', 'PDF olarak kaydet',
    'Dosyaya git', 'Genel bakış', 'Değişiklikler', 'Neden', 'Son değişiklik', 'Hepsini PDF yap', 'tam anlatım', 'büyük resim', 'bu review&#39;da yok', 'Açıklanmış ama satırları sonradan değişmiş',
    'kaynak: shapes.py', 'picks the <strong>biggest</strong>', 'Bu commit&#39;in notu yok', '<code>/inloop:annotate f6f6f6f</code>', 'içerik kaydedilmedi', '1 secret gizlendi',
    'Elle kontrol edilecekler', 'Added <strong>shapes</strong>.', 'Terimler', '<dt>random seed</dt>', 'Etkisi', 'app.py relies on largest()', '<code>/inloop:annotate README.md</code>']) {
    expect(html, word).toContain(word)
  }
  const shapes = fileId('shapes.py')
  // the tree, a folder holding one folder on one line, and the views of a file
  expect(html).toContain('<li class="leaf" data-path="shapes.py"><a href="#' + shapes + '">')
  expect(html).toContain('<a href="#' + dirId('docs/old') + '">docs/old</a>')
  for (const id of [shapes, shapes + '_changes', shapes + '_why', dirId('docs/old'), 'd-root', 'c-b2b2b2b2', 'pending', 'explained', 'index']) expect(html, id).toContain('<section class="view" id="' + id + '"')
  // the code as it stands: one line number, the pin beside it, and links to the definition in it
  expect(html).toContain('<tr id="' + shapes + '_L1"><td class="n">1</td><td class="p"><span class="pin lv-symbol">1</span></td><td class="c"><span class="t-k">class</span> <span class="t-f">Rectangle</span>:</td></tr>')
  expect(html).toContain('<a class="xref" href="#' + shapes + '_1" title="holds sizes">Rectangle</a>')
  // the diff in its commit keeps two numbers and the mark of each line
  expect(html).toContain('<td class="o"></td><td class="n">1</td><td class="p"><span class="pin lv-symbol">1</span></td><td class="m">+</td>')
  const en = render(build(source()), explore(build(source()), STATES as any, INFO), labels('en'), { ...OPTIONS, code: 'en', theme: 'dark', level: 'big-picture', mode: 'explain', start: fileId('app.py') })
  linksHold(en)
  expect(en).toContain('<html lang="en" data-theme="dark" data-fixed data-level="big-picture" data-start="' + fileId('app.py') + '">')
  expect(en).toContain('body:not(:has(:target)) #' + fileId('app.py') + ' { display: block; }')
  for (const word of ['Explain: the code as it stands', 'Commit 1 of 4', '2 older commits in this range are not shown.', 'not in this review', 'Go to file']) expect(en, word).toContain(word)
  expect(html).toContain('<footer>inloop 0.1.0 &middot; <code>/inloop review</code> &middot; ')
  expect(html).not.toContain('internet')
  expect(html + en).not.toContain('\u2014')
  // a start that is not on the page falls back to the overview
  expect(render(r, x, labels('en'), { ...OPTIONS, start: 'f-nowhere' })).toContain('data-start="overview"')
})

test('a page over its budget leaves out what it shows twice first, then the longest code, and its links still hold', async () => {
  const text = Array.from({ length: 600 }, (_, i) => 'v' + i + ' = ' + 'x'.repeat(80)).join('\n')
  const big = added('big.py', text)
  const src = source({ commits: [...COMMITS, { sha: 'a7a7a7a7', parents: [], author: 'E', time: 1, subject: 'big', body: '', files: [{ patch: big, redactions: 0, hidden: null, cut: false }] }] })
  const states = [...STATES, stateOf('big.py', text, new Array(600).fill('a7a7a7a7'))]
  const full = bytes(render(build(src), explore(build(src), states as any, INFO), labels('en'), { ...OPTIONS, code: 'en' }))
  for (const budget of [full - 1000, Math.round(full / 3)]) {
    const r = build(src)
    const page = fit(r, explore(r, states as any, INFO), labels('en'), { ...OPTIONS, code: 'en' }, budget)
    expect(page.cut, String(budget)).toBeGreaterThan(0)
    expect(bytes(page.html), String(budget)).toBeLessThanOrEqual(budget)
    linksHold(page.html)
  }
  // a budget nothing fits: the oldest commits go too, down to one, and no link is left dangling
  const tiny = build(src)
  linksHold(fit(tiny, explore(tiny, states as any, INFO), labels('en'), { ...OPTIONS, code: 'en' }, 1000).html)
  expect(tiny.groups.length).toBe(1)
  const r = build(src)
  const small = fit(r, explore(r, states as any, INFO), labels('en'), { ...OPTIONS, code: 'en' }, Math.round(full / 3)).html
  expect(small).toContain('Code left out to keep the page under its size limit')
  expect(small).toContain('See this change in its commit')
})

test('the Markdown of a review: no HTML and no mentions from a note, levels as on the page, and within its limit', async () => {
  expect(md('a <b> `x<y> @a` @erol & @team-x')).toBe('a &lt;b&gt; `x<y> @a` @⁠erol &amp; @⁠team-x')
  const O = { code: 'en', level: 'full' as const, version: '0.1.0', marker: true, max: COMMENT_MAX, command: '/inloop share pr 7', made: 1_700_000_000_000 }
  const full = markdown(build(source()), labels('en'), O)
  expect(full.text.startsWith(MARKER + '\n\n## Review: what Claude changed, and why\n\n<sub>4 commits \u00b7 7 files \u00b7 5 notes</sub>\n')).toBe(true)
  expect(full.cut).toBe(false)
  for (const word of ['### `b2b2b2b` Shapes', '> p', 'Line by line (2)', '- `shapes.py:1` `Rectangle` (class): holds sizes', '- `shapes.py:5` picks the **biggest**',
    '- **random seed**: the start of a random sequence', '- [ ] Run `pytest`.', '&lt;script&gt;alert(1)&lt;/script&gt;', '**Impact**\n\n- app.py relies on largest()', '2 older commits in this range are not shown.']) {
    expect(full.text, word).toContain(word)
  }
  // a higher level leaves out what the page would hide
  const big = markdown(build(source()), labels('en'), { ...O, level: 'big-picture' }).text
  for (const gone of ['Line by line', 'random seed', '**What**']) expect(big, gone).not.toContain(gone)
  expect(big).toContain('app.py relies on largest()')
  // over the limit: detail goes first, then the oldest commits, and the text says so
  for (const max of [full.text.length - 100, Math.round(full.text.length / 2), 400]) {
    const tight = markdown(build(source()), labels('en'), { ...O, max })
    expect(tight.text.length, String(max)).toBeLessThanOrEqual(max)
    expect(tight.cut, String(max)).toBe(true)
    expect(tight.text, String(max)).toContain('Shortened to fit GitHub\'s comment limit')
  }
  // the line-by-line part goes first
  const less = markdown(build(source()), labels('en'), { ...O, max: full.text.length - 100 }).text
  expect(less).not.toContain('Line by line')
  expect(less).toContain('random seed')
  expect(markdown(build(source()), labels('tr'), { ...O, code: 'tr' }).text).toContain('Satır satır (2)')
})

test('more than two pins on a line become one, so the gutter keeps its width and the code its indentation', async () => {
  const kinds = new Map<number, any>([[6, 'param'], [7, 'param'], [8, 'param'], [9, 'param'], [3, 'line']])
  expect(pinsHtml([6, 7], kinds)).toBe('<span class="pin lv-param">6</span><span class="pin lv-param">7</span>')
  expect(pinsHtml([6, 7, 8, 9], kinds)).toBe('<span class="pin wide lv-param" title="6, 7, 8, 9">6-9</span>')
  expect(pinsHtml([3, 7, 8], kinds)).toBe('<span class="pin wide" title="3, 7, 8">3+2</span>')
})

test('a deleted line is explained beside it in the diff, and the code as it stands points there', async () => {
  // shapes.py loses its largest() and its print: the note says why, quoting the lines it deletes
  const CUT = [
    'diff --git a/shapes.py b/shapes.py', 'index 1111111..2222222 100644', '--- a/shapes.py', '+++ b/shapes.py',
    '@@ -1,6 +1,4 @@', ' class Rectangle:', '     def area(self):', '         return self.w * self.h', '-', '-def largest(rects):', '-    return max(rects, key=lambda r: r.area())',
  ].join('\n')
  const [cut] = parsePatch(CUT)
  const n9 = noteOf({ title: 'Drop largest', files: ['shapes.py'], removed: [{ anchor: 'def largest(rects):', says: 'Nobody calls it **any more**.' }, { anchor: 'return self.w', says: 'never found: the line stays' }, { anchor: 'nowhere at all', says: 'lost' }] })
  // only a deleted line takes the comment: "return self.w" still stands, so that one finds no line
  expect(place('shapes.py', flat(cut), [{ id: 'n9', note: n9 }]).map((p) => [p.at, p.mark.kind, p.mark.item])).toEqual([[4, 'removed', 0]])
  const src = source({
    records: [...RECORDS, noteRec('n9', { title: 'Drop largest', files: ['shapes.py'], removed: n9.removed }), rec('commit', { sha: 'a8a8a8a8', parents: ['f6f6f6f6'], subject: 'refactor: drop largest', files: ['shapes.py'], edits: [], notes: ['n9'] })],
    commits: [...COMMITS, { sha: 'a8a8a8a8', parents: ['f6f6f6f6'], author: 'E', time: 1_700_000_400_000, subject: 'refactor: drop largest', body: '', files: [{ patch: cut, redactions: 0, hidden: null, cut: false }] }],
  })
  const r = build(src)
  const states = STATES.map((s) => (s.path === 'shapes.py' ? stateOf('shapes.py', 'class Rectangle:\n    def area(self):\n        return self.w * self.h\n', ['b2b2b2b2', 'b2b2b2b2', 'b2b2b2b2']) : s))
  const x = explore(r, states as any, INFO)
  const shapes = x.byPath.get('shapes.py')!
  expect(shapes.gone).toBe(1)
  expect(shapes.moved.map((m) => m.mark.kind)).not.toContain('removed')
  const html = render(r, x, labels('tr'), OPTIONS)
  linksHold(html)
  // in the commit: the pin on the red line, the comment marked as a deleted line
  expect(html).toContain('<td class="p"><span class="pin lv-line">1</span></td><td class="m">-</td><td class="c"><span class="t-k">def</span> <span class="t-f">largest</span>(rects):</td>')
  expect(html).toContain('<span class="kind gone">silinen satır</span></div><div class="lead rich"><p>Nobody calls it <strong>any more</strong>.</p></div>')
  // what found no deleted line is listed with the code it quoted
  expect(html).toContain('<code class="gone">nowhere at all</code>')
  // the code as it stands says where the explanation went
  expect(html).toContain('<p class="hint"><a href="#' + fileId('shapes.py') + '_changes">Silinen 1 satırın açıklaması Değişiklikler sekmesinde.</a></p>')
  // in Markdown, the deleted line is struck through, with its old line number
  const text = markdown(build(src), labels('en'), { code: 'en', level: 'full', version: '0.1.0', marker: false, max: COMMENT_MAX, command: '/inloop share', made: 1 }).text
  expect(text).toContain('- `shapes.py:5` ~~`def largest(rects):`~~ (deleted line): Nobody calls it **any more**.')
  expect(markdown(build(src), labels('en'), { code: 'en', level: 'design', version: '0.1.0', marker: false, max: COMMENT_MAX, command: '/inloop share', made: 1 }).text).not.toContain('deleted line')
})

// note n1 (number 1 in session s1) is the Shapes note of commit b2b2b2b2; a recap names it
const OUTCOME_RECORDS = () => RECORDS.map((r: any) => (r.kind === 'note' && r.id === 'n1' ? { ...r, n: 1 } : r))

test('what was found after a change shows under its note, with the reason, in the file\'s Changes and in Markdown', async () => {
  const after = rec('recap', { id: 'r2', recap: { overview: 'Checked.', reading_order: [], groups: [], check_by_hand: [], outcomes: [{ note: 1, says: 'The tests pass: **4 of 4**.' }] } })
  const r = build(source({ records: [...OUTCOME_RECORDS(), after] }))
  expect(r.groups[0].notes[0].outcomes).toEqual(['The tests pass: **4 of 4**.'])
  const html = render(r, explore(r, STATES as any, INFO), labels('tr'), OPTIONS)
  linksHold(html)
  expect(html).toContain('<dt>Sonuç</dt><dd class="outcome rich"><ul><li>The tests pass: <strong>4 of 4</strong>.</li></ul></dd>')
  const changes = html.split('<section class="view" id="' + fileId('shapes.py') + '_changes"')[1].split('</section>')[0]
  expect(changes).toContain('<div class="why-box rich"><b>Neden</b>')
  expect(changes).toContain('<div class="outcome-box rich"><b>Sonuç</b><ul><li>The tests pass: <strong>4 of 4</strong>.</li></ul></div>')
  expect(markdown(build(source({ records: [...OUTCOME_RECORDS(), after] })), labels('en'), { code: 'en', level: 'full', version: '0.1.0', marker: false, max: COMMENT_MAX, command: '/inloop share', made: 1 }).text)
    .toContain('**Outcome**\n\n- The tests pass: **4 of 4**.')
})

test('a dialog chooses the level: every level with what it shows, the notes\' own level marked', async () => {
  const r = build(source())
  const html = render(r, explore(r, STATES as any, INFO), labels('tr'), OPTIONS)
  expect(html).toContain('<button type="button" class="lvl-btn" data-level-open aria-haspopup="dialog"><span class="k">Seviye:</span> <span class="v" data-level-name>rehberli</span>')
  expect(html).toContain('<dialog class="lvl-modal" id="levels" aria-labelledby="levels-title">')
  expect(html.split('<dialog')[1].split('</dialog>')[0].match(/data-level-choice="/g)?.length).toBe(6)
  expect(html).toContain('<button type="button" data-level-choice="guided" aria-pressed="true"><span class="n">rehberli</span><span class="badge new">notların seviyesi</span>')
  expect(html).toContain('<button type="button" data-level-choice="onboarding" aria-pressed="false"><span class="n">onboarding</span><span class="d">Projeye yeni katılan için')
  expect(html).not.toContain('<select')
})
