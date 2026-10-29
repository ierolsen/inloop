// Unit tests of inloop's plain modules: no events, no mods API.
import { expect, test } from 'claude-code/testing'
import { language, resolve, detail, languageName, fold } from '../hooks/config.ts'
import { instructions } from '../hooks/instructions.ts'
import { cleanNote, cleanRecap, relative, inside, sameFile, Pairing } from '../hooks/note.ts'
import { diff, lines, isBinary, fitDiff } from '../hooks/diff.ts'
import { redact, redactDeep, sensitive, REDACTED } from '../hooks/redact.ts'
import { parse, line, sessionsOf, partPath } from '../hooks/log.ts'
import { porcelain, nul, unaccounted, hunks, counts, state } from '../hooks/outside.ts'
import { labels, say, hasLabels, count } from '../hooks/i18n/index.ts'

test('a language is found by code, English name, native name or another spelling', async () => {
  for (const typed of ['tr', 'TR', 'Turkish', 'Türkçe', 'TÜRKÇE', 'turkce']) expect(language(typed)?.code).toBe('tr')
  for (const typed of ['nl', 'Dutch', 'Nederlands', 'nederlands']) expect(language(typed)?.code).toBe('nl')
  for (const typed of ['de', 'German', 'Deutsch']) expect(language(typed)?.code).toBe('de')
  expect(language('pt-BR')?.code).toBe('pt')
  expect(language('zh_TW')?.code).toBe('zh')
  expect(language('Klingon')).toEqual({ code: null, english: 'Klingon', native: 'Klingon' })
  expect(language('  ')).toBe(null)
  expect(fold('İngilizce')).toBe('ingilizce')
})

test('settings come from the project, then the user, then the plugin, then the default', async () => {
  expect(resolve({})).toEqual({ language: { code: 'en', english: 'English', native: 'English', source: 'default' }, detail: { value: 'standard', source: 'default' }, adhd: { value: false, source: 'default' } })
  expect(resolve({ project: { adhd: 'on' }, user: { adhd: false } }).adhd).toEqual({ value: true, source: 'project' })
  expect(resolve({ user: { adhd: false }, plugin: { adhd: 'on' } }).adhd).toEqual({ value: false, source: 'user' })
  const s = resolve({ project: { detail: 'deep' }, user: { language: 'tr', detail: 'brief' }, plugin: { language: 'German', detail: 'standard' } })
  expect(s.language.code).toBe('tr')
  expect(s.language.source).toBe('user')
  expect(s.detail).toEqual({ value: 'deep', source: 'project' })
  expect(resolve({ project: { language: 'nl' }, user: { language: 'tr' } }).language.source).toBe('project')
  expect(resolve({ plugin: { language: '', detail: 'loud' } })).toEqual(resolve({}))
  expect(detail('DEEP')).toBe('deep')
  expect(languageName(language('tr')!)).toBe('Turkish (Türkçe)')
  expect(languageName(language('en')!)).toBe('English')
})

test('the instructions name the language and the detail rule, and depend only on them', async () => {
  const tr = instructions('inloop', language('tr')!, 'deep')
  expect(tr).toContain('mcp__inloop__note')
  expect(tr).toContain('mcp__inloop__recap')
  expect(tr).toContain('Turkish (Türkçe)')
  expect(tr).toContain('never guess a URL')
  expect(instructions('inloop', language('tr')!, 'deep')).toBe(tr)
  expect(instructions('inloop', language('de')!, 'brief')).toContain('one sentence each')
  expect(tr).not.toContain('\u2014')
})

test('a note is cleaned: strings trimmed, lists coerced, bad URLs dropped, gaps named', async () => {
  const { note, problems } = cleanNote({
    title: '  Add a greeter ', tldr: 'greet() says hello.', files: 'greet.py', what: 'Adds greet()', why: '',
    uses: [{ name: 'format', from: 'string', why: 'pads the name' }, { from: 'no name' }], lines: [{ anchor: 'def greet', says: 'the entry' }, { anchor: 'x' }], commit: 'ABC1234',
    basis: 'maybe', alternatives: ['a dict', 7],
    parameters: [{ name: 'timeout', meaning: 'seconds', doc_url: 'javascript:alert(1)' }, { meaning: 'no name' }],
    symbols: [{ name: 'Greeter', kind: 'class', why_exists: 'holds the name' }, { name: 'x', kind: 'gizmo', why_exists: 'y' }],
  })
  expect(note.title).toBe('Add a greeter')
  expect(note.files).toEqual(['greet.py'])
  expect(note.basis).toBe(null)
  expect(note.alternatives).toEqual(['a dict', '7'])
  expect(note.parameters).toEqual([{ name: 'timeout', meaning: 'seconds', default: null, why_this_value: null, doc_url: null }])
  expect(note.symbols.map((s) => s.kind)).toEqual(['class', 'other'])
  expect(note.uses).toEqual([{ name: 'format', from: 'string', why: 'pads the name', doc_url: null }])
  expect(note.lines).toEqual([{ anchor: 'def greet', says: 'the entry' }])
  expect(note.commit).toBe('abc1234')
  expect(cleanNote({ commit: 'HEAD~1' }).note.commit).toBe(null)
  expect(problems).toEqual(['why is empty'])
  expect(cleanNote({}).problems).toEqual(['title is empty', 'tldr is empty', 'what is empty', 'why is empty', 'files is empty'])
  expect(cleanRecap({ overview: 'Done', reading_order: [{ file: 'a.py', why: 'start' }, { why: 'no file' }] }).recap.reading_order).toEqual([{ file: 'a.py', why: 'start' }])
})

test('paths become relative to the project, and a note names a file by any suffix of its path', async () => {
  expect(relative('/repo/src/a.ts', '/repo')).toBe('src/a.ts')
  expect(relative('/repo/src/a.ts', '/repo/')).toBe('src/a.ts')
  expect(relative('./src/a.ts', '/repo')).toBe('src/a.ts')
  expect(relative('C:\\repo\\src\\a.ts', 'C:\\repo')).toBe('src/a.ts')
  expect(relative('/elsewhere/a.ts', '/repo')).toBe('/elsewhere/a.ts')
  expect(inside('/repo/src/a.ts', '/repo')).toBe(true)
  expect(inside('src/a.ts', '/repo')).toBe(true)
  expect(inside('/repo2/a.ts', '/repo')).toBe(false)
  expect(inside('/home/me/.claude/plans/plan.md', '/repo')).toBe(false)
  expect(inside('../a.ts', '/repo')).toBe(false)
  expect(inside('c:\\Repo\\a.ts', 'C:/repo')).toBe(true)
  expect(sameFile('a.ts', 'src/a.ts')).toBe(true)
  expect(sameFile('src/a.ts', 'src/a.ts')).toBe(true)
  expect(sameFile('ba.ts', 'src/a.ts')).toBe(false)
})

test('an edit pairs with the agent\'s note that lists its file, else its latest note, else none', async () => {
  const p = new Pairing()
  expect(p.match('main', 'a.py')).toBe(null)
  p.addNote('main', 'n1', ['a.py', 'b.py'])
  p.addNote('main', 'n2', ['c.py'])
  p.addNote('sub-1', 'n3', ['a.py'])
  expect(p.match('main', 'a.py')).toEqual({ id: 'n1', listed: true })
  expect(p.match('main', 'c.py')).toEqual({ id: 'n2', listed: true })
  expect(p.match('main', 'z.py')).toEqual({ id: 'n2', listed: false })
  expect(p.match('sub-1', 'a.py')).toEqual({ id: 'n3', listed: true })
  expect(p.match('sub-2', 'a.py')).toBe(null)
  p.newTurn()
  expect(p.match('main', 'a.py')).toBe(null)
})

test('a diff counts lines and writes unified hunks with three lines of context', async () => {
  expect(diff('a\nb\n', 'a\nb\n')).toEqual({ text: '', added: 0, removed: 0, truncated: false })
  expect(diff('', 'x\ny\n')).toEqual({ text: '@@ -0,0 +1,2 @@\n+x\n+y', added: 2, removed: 0, truncated: false })
  expect(diff('x\ny\n', '').text).toBe('@@ -1,2 +0,0 @@\n-x\n-y')
  const before = Array.from({ length: 20 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n'
  const after = before.replace('line 10\n', 'line ten\n')
  const d = diff(before, after)
  expect(d.added).toBe(1)
  expect(d.removed).toBe(1)
  expect(d.text.split('\n')).toEqual(['@@ -7,7 +7,7 @@', ' line 7', ' line 8', ' line 9', '-line 10', '+line ten', ' line 11', ' line 12', ' line 13'])
  // two changes far apart make two hunks; close ones share one
  const two = diff(before, before.replace('line 2\n', 'two\n').replace('line 19\n', 'nineteen\n'))
  expect(two.text.split('\n').filter((l) => l.startsWith('@@')).length).toBe(2)
  const one = diff(before, before.replace('line 2\n', 'two\n').replace('line 6\n', 'six\n'))
  expect(one.text.split('\n').filter((l) => l.startsWith('@@')).length).toBe(1)
  const big = diff('', Array.from({ length: 50 }, (_, i) => String(i)).join('\n'), 10)
  expect(big.truncated).toBe(true)
  expect(big.added).toBe(50)
  expect(big.text.split('\n').length).toBe(10)
  expect(lines('a\r\nb\r\n')).toEqual(['a', 'b'])
  expect(isBinary('PNG\u0000\u0001')).toBe(true)
})

test('secrets are redacted and secret files are named only', async () => {
  const text = 'token = "ghp_' + 'a'.repeat(36) + '"\nkey: sk-ant-' + 'b'.repeat(30) + '\nAWS AKIA' + 'ABCDEFGHIJKLMNOP' + '\npassword = "hunter2-hunter2"\nport = 8080'
  const r = redact(text)
  expect(r.text).not.toContain('ghp_')
  expect(r.text).not.toContain('sk-ant-')
  expect(r.text).not.toContain('AKIA')
  expect(r.text).not.toContain('hunter2')
  expect(r.text).toContain('password = "' + REDACTED + '"')
  expect(r.text).toContain('port = 8080')
  expect(r.count).toBe(4)
  expect(redact('api_key = process.env.API_KEY').count).toBe(0)
  expect(redact('-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----').text).toBe(REDACTED)
  expect(redactDeep({ a: ['sk-' + 'c'.repeat(30)], b: 2 })).toEqual({ value: { a: [REDACTED], b: 2 }, count: 1 })
  for (const p of ['.env', 'app/.env.local', 'id_rsa', 'server.pem', 'secrets.json', '.npmrc']) expect(sensitive(p)).toBe(true)
  for (const p of ['.env.example', 'main.py', 'keys.ts', 'environment.ts']) expect(sensitive(p)).toBe(false)
})

test('a log reads back its records and skips broken or foreign lines', async () => {
  const rec = { v: 1, kind: 'note', ts: 1, session: 's', agent: null, turn: null, id: 'n', n: 1, source: 'live', note: {}, problems: [] } as any
  expect(parse(line(rec) + '{"v":2,"kind":"note"}\nnot json\n\n' + line(rec))).toEqual([rec, rec])
  expect(partPath('/r', 'abc', 1)).toBe('/r/.inloop/log/abc.jsonl')
  expect(partPath('/r', 'abc', 3)).toBe('/r/.inloop/log/abc.3.jsonl')
  expect([...sessionsOf(['b.jsonl', 'a.2.jsonl', 'a.jsonl', 'notes.txt'])]).toEqual([['a', ['a.jsonl', 'a.2.jsonl']], ['b', ['b.jsonl']]])
})

test('git output: renames, NUL lists, and the files no edit accounts for', async () => {
  expect(porcelain(' M a.py\u0000R  new.py\u0000old.py\u0000?? c.py\u0000')).toEqual(['a.py', 'new.py', 'c.py'])
  expect(nul('a\u0000b\u0000')).toEqual(['a', 'b'])
  expect(unaccounted(['a.py', 'b.py', '.inloop/log/x.jsonl'], ['c.py'], new Set(['a.py']), new Set(['b.py']))).toEqual(['c.py'])
  const gitDiff = 'diff --git a/a.py b/a.py\nindex 1..2 100644\n--- a/a.py\n+++ b/a.py\n@@ -1 +1 @@\n-x\n+y\n'
  expect(hunks(gitDiff)).toBe('@@ -1 +1 @@\n-x\n+y')
  expect(counts(hunks(gitDiff))).toEqual({ added: 1, removed: 1 })
  expect(state('a', new Set(['a']), new Set())).toBe('added')
  expect(state('a', new Set(), new Set(['a']))).toBe('deleted')
})

test('labels fall back to English and fill their placeholders', async () => {
  expect(hasLabels('en')).toBe(true)
  expect(hasLabels(null)).toBe(false)
  expect(labels('xx').state_on).toBe('on')
  expect(say('{a} and {b}', { a: 1 })).toBe('1 and {b}')
  const en = labels('en')
  expect([0, 1, 2].map((n) => count('en', en.notes, n))).toEqual(['0 notes', '1 note', '2 notes'])
  // a language without labels of its own counts in English, whatever its own rules say
  expect(count('fr', en.notes, 0)).toBe('0 notes')
})

test('a diff for the pane has every hunk header counted again and stops within its size', async () => {
  // a stored diff cut at its line limit: the header still says 10 lines
  const cut = '@@ -1,10 +1,10 @@\n a\n-b\n+c\n d'
  expect(fitDiff(cut, 1000)).toEqual({ text: '@@ -1,3 +1,3 @@\n a\n-b\n+c\n d', cut: false })
  expect(fitDiff('@@ -0,0 +1,2 @@\n+x\n+y\n\\ No newline at end of file', 1000).text).toBe('@@ -0,0 +1,2 @@\n+x\n+y')
  const long = '@@ -1,3 +1,3 @@\n-' + 'a'.repeat(50) + '\n+' + 'b'.repeat(50) + '\n c\n@@ -20 +20 @@\n-x\n+y'
  const fitted = fitDiff(long, 100)
  expect(fitted.cut).toBe(true)
  expect(fitted.text).toBe('@@ -1,1 +1,0 @@\n-' + 'a'.repeat(50))
  expect(fitDiff('', 100)).toEqual({ text: '', cut: false })
})
