// Settings: which language inloop's notes and page are in, which tags say what the notes hold,
// and whether they are written in the ADHD-friendly form.
// Plain module: no mods API calls here (see CLAUDE.md).

// What the notes are for, which decides what Claude writes into them: a summary costs least, all
// costs most. Tags combine ("review,learn") and are English in every language, like commands.
export type Tag = 'summary' | 'review' | 'learn' | 'decisions' | 'architecture' | 'onboarding' | 'all'
export const TAGS: Tag[] = ['summary', 'review', 'learn', 'decisions', 'architecture', 'onboarding', 'all']
export const DEFAULT_TAGS: Tag[] = ['review']
export type Source = 'project' | 'user' | 'plugin' | 'default'

export type Language = {
  // ISO 639-1 code when the language is known ('tr'), null for one inloop has no entry for
  code: string | null
  // the language's name in English ('Turkish') and in itself ('Türkçe')
  english: string
  native: string
}

export type Settings = {
  language: Language & { source: Source }
  tags: { value: Tag[]; source: Source }
  adhd: { value: boolean; source: Source }
}

// Known languages: code, English name, native name, and other spellings people type.
const LANGUAGES: [string, string, string, string[]][] = [
  ['en', 'English', 'English', ['eng', 'ingilizce', 'englisch', 'engels', 'anglais', 'ingles']],
  ['tr', 'Turkish', 'Türkçe', ['tur', 'turkce', 'turkisch', 'turks', 'turc']],
  ['de', 'German', 'Deutsch', ['deu', 'ger', 'almanca', 'duits', 'allemand', 'aleman']],
  ['nl', 'Dutch', 'Nederlands', ['nld', 'dut', 'flemish', 'vlaams', 'hollandaca', 'felemenkce', 'niederlandisch', 'neerlandais']],
  ['fr', 'French', 'Français', ['fra', 'fre', 'fransizca', 'franzosisch', 'frans', 'frances']],
  ['es', 'Spanish', 'Español', ['spa', 'ispanyolca', 'spanisch', 'spaans', 'espagnol', 'castellano']],
  ['it', 'Italian', 'Italiano', ['ita', 'italyanca', 'italienisch', 'italiaans', 'italien']],
  ['pt', 'Portuguese', 'Português', ['por', 'portekizce', 'portugiesisch', 'portugees', 'portugais']],
  ['ru', 'Russian', 'Русский', ['rus', 'rusca', 'russisch', 'russe']],
  ['uk', 'Ukrainian', 'Українська', ['ukr', 'ukraynaca', 'ukrainisch']],
  ['pl', 'Polish', 'Polski', ['pol', 'lehce', 'polnisch', 'pools']],
  ['sv', 'Swedish', 'Svenska', ['swe', 'isvecce', 'schwedisch', 'zweeds']],
  ['no', 'Norwegian', 'Norsk', ['nor', 'nb', 'nn', 'norvecce', 'norwegisch', 'noors']],
  ['da', 'Danish', 'Dansk', ['dan', 'danca', 'danisch', 'deens']],
  ['fi', 'Finnish', 'Suomi', ['fin', 'fince', 'finnisch', 'fins']],
  ['cs', 'Czech', 'Čeština', ['ces', 'cze', 'cekce', 'tschechisch', 'tsjechisch']],
  ['el', 'Greek', 'Ελληνικά', ['ell', 'gre', 'yunanca', 'griechisch', 'grieks']],
  ['ro', 'Romanian', 'Română', ['ron', 'rum', 'romence', 'rumanisch', 'roemeens']],
  ['hu', 'Hungarian', 'Magyar', ['hun', 'macarca', 'ungarisch', 'hongaars']],
  ['bg', 'Bulgarian', 'Български', ['bul', 'bulgarca', 'bulgarisch']],
  ['ar', 'Arabic', 'العربية', ['ara', 'arapca', 'arabisch', 'arabe']],
  ['he', 'Hebrew', 'עברית', ['heb', 'ibranice', 'hebraisch', 'hebreeuws']],
  ['fa', 'Persian', 'فارسی', ['fas', 'per', 'farsi', 'farsca', 'persisch', 'perzisch']],
  ['hi', 'Hindi', 'हिन्दी', ['hin', 'hintce']],
  ['id', 'Indonesian', 'Bahasa Indonesia', ['ind', 'endonezce', 'indonesisch']],
  ['vi', 'Vietnamese', 'Tiếng Việt', ['vie', 'vietnamca', 'vietnamesisch']],
  ['th', 'Thai', 'ไทย', ['tha', 'tayca']],
  ['ja', 'Japanese', '日本語', ['jpn', 'japonca', 'japanisch', 'japans']],
  ['ko', 'Korean', '한국어', ['kor', 'korece', 'koreanisch', 'koreaans']],
  ['zh', 'Chinese', '中文', ['zho', 'chi', 'cince', 'chinesisch', 'chinees', 'mandarin']],
]

// The levels and detail values of earlier versions, and other ways people type a tag
const ALIASES: Record<string, Tag[]> = {
  full: ['all'], deep: ['all'], everything: ['all'], guided: ['review', 'learn'], standard: ['review', 'learn'],
  essentials: ['review'], brief: ['review'], key: ['review'], keypoints: ['review'], short: ['summary'],
  design: ['decisions'], decision: ['decisions'], tradeoffs: ['decisions'], bigpicture: ['architecture'], big: ['architecture'], arch: ['architecture'],
  onboard: ['onboarding'], newcomer: ['onboarding'], learning: ['learn'], teach: ['learn'],
}

// "Türkçe" -> "turkce": lower case, accents and separators removed, so any spelling matches
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ı/g, 'i').replace(/[\s_.-]+/g, '')
}

// The language a person typed, by code ("tr", "pt-BR"), English name, native name or another spelling.
// Text inloop has no entry for is kept as the name, so Claude can still write in it.
export function language(input: string): Language | null {
  const text = input.trim()
  if (!text) return null
  const key = fold(text)
  const base = fold(text.split(/[-_]/)[0])
  for (const [code, english, native, other] of LANGUAGES) {
    if ([code, fold(english), fold(native), ...other].includes(key) || (base === code && /^[a-z]{2}[-_][a-z]{2,4}$/i.test(text))) {
      return { code, english, native }
    }
  }
  return { code: null, english: text, native: text }
}

// on/off, true/false, yes/no, 1/0, as typed or as stored
export function adhd(input: unknown): boolean | null {
  if (typeof input === 'boolean') return input
  const text = typeof input === 'string' ? input.trim().toLowerCase() : ''
  if (['on', 'true', 'yes', '1'].includes(text)) return true
  if (['off', 'false', 'no', '0'].includes(text)) return false
  return null
}

// Tags from "review, learn", "review+learn", "review learn" or a list, in their own order; `all`
// covers the rest. Null when one of them is no tag inloop knows, or none is given.
export function tags(input: unknown): Tag[] | null {
  const pieces = (Array.isArray(input) ? input : typeof input === 'string' ? input.split(/[,+]+/) : []).map((w) => String(w).trim().toLowerCase()).filter(Boolean)
  if (!pieces.length) return null
  const one = (w: string): Tag[] | null => {
    const key = w.replace(/[\s_-]+/g, '')
    return (TAGS as string[]).includes(key) ? [key as Tag] : ALIASES[key] ?? null
  }
  const found = new Set<Tag>()
  for (const piece of pieces) {
    // "big picture" is one name; "review learn" is two
    const tag = one(piece) ?? (piece.includes(' ') ? piece.split(/\s+/).map(one) : [null]).reduce<Tag[] | null>((all, t) => (all && t ? [...all, ...t] : null), [])
    if (!tag || !tag.length) return null
    tag.forEach((t) => found.add(t))
  }
  return found.has('all') ? ['all'] : TAGS.filter((t) => found.has(t))
}

// The settings in effect, from the first layer that sets each one: the project's override, the
// person's choice across projects, the plugin's own setting, then the default.
export function resolve(layers: { project?: Record<string, unknown>; user?: Record<string, unknown>; plugin?: Record<string, unknown> }): Settings {
  const order: [Source, Record<string, unknown> | undefined][] = [['project', layers.project], ['user', layers.user], ['plugin', layers.plugin]]
  let lang: Settings['language'] = { code: 'en', english: 'English', native: 'English', source: 'default' }
  for (const [source, layer] of order) {
    const value = layer && typeof layer.language === 'string' ? language(layer.language) : null
    if (value) { lang = { ...value, source }; break }
  }
  // a layer may still hold a "level" or "detail" key of an earlier version; "tags" wins
  let chosen: Settings['tags'] = { value: DEFAULT_TAGS, source: 'default' }
  for (const [source, layer] of order) {
    const value = layer ? tags(layer.tags) ?? tags(layer.level) ?? tags(layer.detail) : null
    if (value) { chosen = { value, source }; break }
  }
  let easy: Settings['adhd'] = { value: false, source: 'default' }
  for (const [source, layer] of order) {
    const value = layer ? adhd(layer.adhd) : null
    if (value !== null) { easy = { value, source }; break }
  }
  return { language: lang, tags: chosen, adhd: easy }
}

// How the language reads in the instructions: "Turkish (Türkçe)", or the name as given
export function languageName(lang: Language): string {
  return lang.native && lang.native !== lang.english ? lang.english + ' (' + lang.native + ')' : lang.english
}
