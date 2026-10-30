// How developers who speak a language say technical things. Notes are read by developers, who say
// "random seed" and "shuffle", not a word-for-word translation of them. For each language inloop
// knows: an example for the instructions, and the translations developers do not use, which send
// a note back once (see register.ts). Plain module.

import type { Note, Recap } from './note.ts'

// A translation developers do not use: where it starts (a stem; any ending may follow), the term
// they use, and when the stem has an everyday meaning too, which meaning is meant
type Literal = { stem: string; use: string; when?: string }
type Guide = { example: string; literals: Literal[]; lower: (s: string) => string }

const TR: Guide = {
  example: 'In Turkish, put suffixes after an apostrophe (split\'i, feature\'lar, commit\'ler) and use the term as developers do: ' +
    '"satırları shuffle edip %20\'sini test set\'e ayırır", not "satırları karıştırıp %20\'sini test setine ayırır"; ' +
    '"random_state sabit olduğu için split reproducible", not "rastgele ve tekrarlanabilir bölme"; ' +
    '"validation split", "early stopping", "learning rate", "overfitting", "MAE", "entry point", "flag", "log", ' +
    'not "doğrulama bölmesi", "erken durdurma", "öğrenme oranı", "aşırı öğrenme", "ortalama mutlak hata", "giriş noktası", "bayrak", "günlük".',
  lower: (s) => s.toLocaleLowerCase('tr'),
  literals: [
    { stem: 'tohum', use: 'seed' },
    { stem: 'tekrarlanabilir', use: 'reproducible' },
    { stem: 'karıştır', use: 'shuffle', when: 'shuffling rows or items' },
    { stem: 'işlem hatt', use: 'pipeline' },
    { stem: 'boru hatt', use: 'pipeline' },
    { stem: 'erken durdur', use: 'early stopping' },
    { stem: 'öğrenme oran', use: 'learning rate' },
    { stem: 'aşırı öğren', use: 'overfitting' },
    { stem: 'aşırı uyum', use: 'overfitting' },
    { stem: 'çapraz doğrula', use: 'cross-validation' },
    { stem: 'doğrulama bölme', use: 'validation split' },
    { stem: 'doğrulama set', use: 'validation set' },
    { stem: 'doğrulama veri', use: 'validation data' },
    { stem: 'doğrulama skor', use: 'validation score' },
    { stem: 'karekök ortalama kare hata', use: 'RMSE' },
    { stem: 'ortalama kare hata', use: 'MSE' },
    { stem: 'ortalama mutlak hata', use: 'MAE' },
    { stem: 'yığın boyut', use: 'batch size' },
    { stem: 'yığın izi', use: 'stack trace' },
    { stem: 'kayıp fonksiyon', use: 'loss function' },
    { stem: 'özellik mühendisliği', use: 'feature engineering' },
    { stem: 'türetilmiş özellik', use: 'feature' },
    { stem: 'giriş noktas', use: 'entry point' },
    { stem: 'uç nokta', use: 'endpoint' },
    { stem: 'önbellek', use: 'cache' },
    { stem: 'birleştirme isteğ', use: 'pull request' },
    { stem: 'çekme isteğ', use: 'pull request' },
    { stem: 'bayrak', use: 'flag' },
    { stem: 'bayrağ', use: 'flag' },
    { stem: 'günlük kayd', use: 'log' },
    { stem: 'günlüğ', use: 'log', when: 'a log file' },
    { stem: 'birim test', use: 'unit test' },
    { stem: 'hata ayıkla', use: 'debug' },
    { stem: 'kod taban', use: 'codebase' },
    { stem: 'iş parçacığ', use: 'thread' },
    { stem: 'çöp toplayıcı', use: 'garbage collector' },
    { stem: 'geri çağır', use: 'callback' },
    { stem: 'yük dengeleyici', use: 'load balancer' },
    { stem: 'konuşlandır', use: 'deploy' },
    { stem: 'ince ayar', use: 'fine-tuning', when: 'fine-tuning a model' },
    { stem: 'gömme vektör', use: 'embedding' },
    { stem: 'dikkat mekanizma', use: 'attention' },
  ],
}

const DE: Guide = {
  example: 'In German, for example: "Train/Test-Split", "Seed", "Pipeline", "Early Stopping", "Overfitting", "Feature Engineering", "Pull Request", ' +
    'not "Zufallssamen", "Rohrleitung", "frühes Stoppen", "Überanpassung", "Merkmalsentwicklung", "Zusammenführungsanfrage".',
  lower: (s) => s.toLocaleLowerCase('de'),
  literals: [
    { stem: 'zufallssamen', use: 'Seed' },
    { stem: 'rohrleitung', use: 'Pipeline' },
    { stem: 'frühes stoppen', use: 'Early Stopping' },
    { stem: 'frühzeitiges stoppen', use: 'Early Stopping' },
    { stem: 'frühes anhalten', use: 'Early Stopping' },
    { stem: 'überanpassung', use: 'Overfitting' },
    { stem: 'stapelgröße', use: 'Batch Size' },
    { stem: 'merkmalsentwicklung', use: 'Feature Engineering' },
    { stem: 'merkmalstechnik', use: 'Feature Engineering' },
    { stem: 'zusammenführungsanfrage', use: 'Pull Request' },
    { stem: 'ziehanfrage', use: 'Pull Request' },
  ],
}

const NL: Guide = {
  example: 'In Dutch, for example: "train/test-split", "seed", "pipeline", "early stopping", "overfitting", "learning rate", "pull request", ' +
    'not "willekeurig zaad", "pijplijn", "vroegtijdig stoppen", "overpassing", "leersnelheid", "samenvoegverzoek".',
  lower: (s) => s.toLocaleLowerCase('nl'),
  literals: [
    { stem: 'willekeurig zaad', use: 'seed' },
    { stem: 'zaadwaarde', use: 'seed' },
    { stem: 'pijplijn', use: 'pipeline' },
    { stem: 'vroegtijdig stoppen', use: 'early stopping' },
    { stem: 'vroeg stoppen', use: 'early stopping' },
    { stem: 'overpassing', use: 'overfitting' },
    { stem: 'overaanpassing', use: 'overfitting' },
    { stem: 'leersnelheid', use: 'learning rate' },
    { stem: 'partijgrootte', use: 'batch size' },
    { stem: 'samenvoegverzoek', use: 'pull request' },
    { stem: 'trekverzoek', use: 'pull request' },
  ],
}

const GUIDES: Record<string, Guide> = { tr: TR, de: DE, nl: NL }

// The example for the instructions, or '' for a language inloop has none for
export const example = (code: string | null) => (code && GUIDES[code] ? GUIDES[code].example : '')

// The prose of a note, where words are written for the reader: not code spans, not the line quotes
// (code), not the glossary, where a term is explained in plain words on purpose.
function prose(n: Note): string[] {
  const out = [n.title, n.tldr, n.what, n.why, ...n.alternatives, ...n.impact, ...n.risks]
  for (const s of n.symbols) out.push(s.why_exists, s.why_this_shape ?? '', s.called_by ?? '')
  for (const u of n.uses) out.push(u.why)
  for (const p of n.parameters) out.push(p.meaning, p.why_this_value ?? '')
  for (const x of [...n.lines, ...n.removed]) out.push(x.says)
  return out.map(uncoded)
}

const uncoded = (t: string) => t.replace(/`[^`\n]*`/g, ' ')

// The prose of a recap: everything but file paths
function recapProse(r: Recap): string[] {
  return [r.overview, ...r.reading_order.map((x) => x.why), ...r.check_by_hand, ...r.outcomes.map((o) => o.says), ...r.setup, ...r.conventions,
    ...r.questions.flatMap((q) => [q.q, q.a]), ...r.first_tasks].map(uncoded)
}

export type Found = { said: string; use: string; when: string | null }

// The word-for-word translations in a note's prose, each once: the word as written (lower case),
// and the term developers use. Empty for a language inloop has no list for. Longer phrases are
// listed first, and a match is blanked out, so "ortalama kare hata" is not found again inside
// "karekök ortalama kare hata".
export const literals = (n: Note, code: string | null): Found[] => literalsIn(prose(n), code)
export const recapLiterals = (r: Recap, code: string | null): Found[] => literalsIn(recapProse(r), code)

function literalsIn(texts: string[], code: string | null): Found[] {
  const g = code ? GUIDES[code] : undefined
  if (!g) return []
  const found: Found[] = []
  const seen = new Set<string>()
  for (const text of texts) {
    let low = g.lower(text)
    for (const lit of g.literals) {
      const at = new RegExp('(^|[^\\p{L}])' + lit.stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\p{L}*', 'u').exec(low)
      if (!at) continue
      const from = at.index + at[1].length
      const said = at[0].slice(at[1].length)
      low = low.slice(0, from) + ' '.repeat(said.length) + low.slice(from + said.length)
      if (seen.has(lit.stem)) continue
      seen.add(lit.stem)
      found.push({ said, use: lit.use, when: lit.when ?? null })
    }
  }
  return found
}

// What the note tool says back to Claude about them, in English like the rest of the instructions
export function sendBack(found: Found[], language: string, tool: string, what: 'note' | 'recap' = 'note'): string {
  const pairs = found.map((f) => '"' + f.said + '" -> ' + f.use + (f.when ? ' (when it means ' + f.when + ')' : ''))
  return 'inloop: the ' + what + ' is not saved yet. Developers who write ' + language + ' use the technical term for these words: ' + pairs.join(', ') +
    '. Call `' + tool + '` again with the same ' + what + ', those words written the way developers write them' + (what === 'note' ? ', and then make the change.' : '.')
}
