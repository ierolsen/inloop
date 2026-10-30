// A small highlighter for the review page: keywords, strings, numbers, comments and the names that
// definitions introduce, line by line, for the languages people use most. No third-party code and no
// network; a line it does not understand is shown plain. Plain module.

import { esc } from './html.ts'

type Lang = { keywords: Set<string>; comment: string[]; block: [string, string] | null; strings: string[]; defs: Set<string> }

const words = (text: string) => new Set(text.split(/\s+/).filter(Boolean))

const C_LIKE = 'if else for while do switch case default break continue return goto sizeof typedef struct union enum static const extern void char short int long float double signed unsigned volatile register inline true false null NULL'
const LANGS: Record<string, Lang> = {
  py: { keywords: words('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self cls'), comment: ['#'], block: null, strings: ['"""', "'''", '"', "'"], defs: words('def class') },
  js: { keywords: words('async await break case catch class const continue debugger default delete do else export extends false finally for from function if import in instanceof let new null of return static super switch this throw true try typeof undefined var void while with yield as get set'), comment: ['//'], block: ['/*', '*/'], strings: ['"', "'", '`'], defs: words('function class') },
  ts: { keywords: words('abstract any as async await boolean break case catch class const constructor continue declare default delete do else enum export extends false finally for from function get if implements import in infer instanceof interface is keyof let namespace never new null number object of private protected public readonly return set static string super switch this throw true try type typeof undefined unique unknown var void while yield'), comment: ['//'], block: ['/*', '*/'], strings: ['"', "'", '`'], defs: words('function class interface type enum') },
  go: { keywords: words('break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota'), comment: ['//'], block: ['/*', '*/'], strings: ['"', '`', "'"], defs: words('func type') },
  rs: { keywords: words('as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while None Some Ok Err'), comment: ['//'], block: ['/*', '*/'], strings: ['"'], defs: words('fn struct enum trait type mod') },
  java: { keywords: words('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new null package private protected public return short static super switch synchronized this throw throws transient true false try void volatile while var record'), comment: ['//'], block: ['/*', '*/'], strings: ['"', "'"], defs: words('class interface enum record') },
  c: { keywords: words(C_LIKE + ' class namespace template typename public private protected virtual override new delete this using nullptr auto include define'), comment: ['//'], block: ['/*', '*/'], strings: ['"', "'"], defs: words('struct class enum union namespace') },
  sh: { keywords: words('if then else elif fi for in do done while until case esac function return local export readonly set unset echo exit'), comment: ['#'], block: null, strings: ['"', "'"], defs: words('function') },
  rb: { keywords: words('alias and begin break case class def defined? do else elsif end ensure false for if in module next nil not or redo rescue retry return self super then true undef unless until when while yield require attr_reader attr_accessor'), comment: ['#'], block: null, strings: ['"', "'"], defs: words('def class module') },
  sql: { keywords: words('select from where and or not insert into values update set delete create table index view drop alter add primary key foreign references join left right inner outer on group by order having limit offset as distinct null is in like between case when then else end union all exists SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE INDEX VIEW DROP ALTER ADD PRIMARY KEY FOREIGN REFERENCES JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AS DISTINCT NULL IS IN LIKE BETWEEN CASE WHEN THEN ELSE END UNION ALL EXISTS'), comment: ['--'], block: ['/*', '*/'], strings: ["'", '"'], defs: words('') },
  data: { keywords: words('true false null yes no on off'), comment: ['#'], block: null, strings: ['"', "'"], defs: words('') },
}
const BY_EXT: Record<string, string> = {
  py: 'py', pyi: 'py', js: 'js', mjs: 'js', cjs: 'js', jsx: 'js', ts: 'ts', tsx: 'ts', mts: 'ts', cts: 'ts', go: 'go', rs: 'rs',
  java: 'java', kt: 'java', kts: 'java', scala: 'java', cs: 'java', swift: 'java', dart: 'java', c: 'c', h: 'c', cc: 'c', cpp: 'c',
  hpp: 'c', cxx: 'c', m: 'c', mm: 'c', sh: 'sh', bash: 'sh', zsh: 'sh', rb: 'rb', sql: 'sql', yml: 'data', yaml: 'data', toml: 'data',
  json: 'data', ini: 'data', cfg: 'data', env: 'data', php: 'js',
}

export function languageOf(path: string): string | null {
  const name = path.toLowerCase().split('/').pop() ?? ''
  if (name === 'dockerfile' || name === 'makefile') return 'sh'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return BY_EXT[ext] ?? null
}

const NUMBER = /^(0x[0-9a-fA-F_]+|\d[\d_]*(\.\d+)?([eE][+-]?\d+)?)/
const IDENT = /^[A-Za-z_$][\w$]*/

// One line of code as HTML. `link` turns a name defined elsewhere on the page into a link.
export function highlight(text: string, lang: string | null, link?: (name: string) => { href: string; title: string } | null): string {
  const spec = lang ? LANGS[lang] : null
  if (!spec) return linkWords(text, link)
  let out = ''
  let i = 0
  let def = false
  while (i < text.length) {
    const rest = text.slice(i)
    const comment = spec.comment.find((c) => rest.startsWith(c))
    if (comment) { out += '<span class="t-c">' + esc(rest) + '</span>'; break }
    if (spec.block && rest.startsWith(spec.block[0])) {
      const end = rest.indexOf(spec.block[1], spec.block[0].length)
      const len = end < 0 ? rest.length : end + spec.block[1].length
      out += '<span class="t-c">' + esc(rest.slice(0, len)) + '</span>'
      i += len
      continue
    }
    const quote = spec.strings.find((q) => rest.startsWith(q))
    if (quote) {
      let j = quote.length
      while (j < rest.length && !rest.startsWith(quote, j)) j += rest[j] === '\\' ? 2 : 1
      const len = Math.min(rest.length, j + quote.length)
      out += '<span class="t-s">' + esc(rest.slice(0, len)) + '</span>'
      i += len
      continue
    }
    const num = NUMBER.exec(rest)
    if (num && !/[\w$]/.test(text[i - 1] ?? '')) { out += '<span class="t-n">' + esc(num[0]) + '</span>'; i += num[0].length; continue }
    const id = IDENT.exec(rest)
    if (id) {
      const name = id[0]
      if (def) { out += '<span class="t-f">' + esc(name) + '</span>'; def = false }
      else if (spec.keywords.has(name)) { out += '<span class="t-k">' + esc(name) + '</span>'; def = spec.defs.has(name) }
      else out += linked(name, link)
      i += name.length
      continue
    }
    out += esc(text[i])
    i += 1
  }
  return out
}

function linked(name: string, link?: (name: string) => { href: string; title: string } | null): string {
  const to = link ? link(name) : null
  return to ? '<a class="xref" href="' + esc(to.href) + '" title="' + esc(to.title) + '">' + esc(name) + '</a>' : esc(name)
}

function linkWords(text: string, link?: (name: string) => { href: string; title: string } | null): string {
  if (!link) return esc(text)
  return text.split(/([A-Za-z_$][\w$]*)/g).map((part, i) => (i % 2 ? linked(part, link) : esc(part))).join('')
}
