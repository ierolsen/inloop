// The system-prompt section inloop adds while it is on, and the tools it gives Claude.
// The text depends only on the settings, so the prompt cache stays valid between requests.

import { type Tag, type Language, languageName } from './config.ts'
import { example } from './jargon.ts'
import { partsOf, PARTS, RECAP_PARTS, type Part, type RecapPart } from './parts.ts'

export const NOTE_TOOL = 'note'
export const RECAP_TOOL = 'recap'

// What each tag asks Claude to focus on. The parts each tag adds to a note are in parts.ts; these
// sentences say how to write them.
export const TAG_RULES: Record<Tag, string> = {
  summary: 'Tag "summary": keep each note to `tldr`, `what` and `why`, one or two sentences each.',
  review: 'Tag "review": write what a reviewer needs to accept the change: why each new class or function exists, the reason for every deleted line, the options you rejected, what else the change touches and what could break. Add `lines` comments only for the lines a reviewer would stop at.',
  learn: 'Tag "learn": write for someone learning this code. Add `lines` comments for the lines that carry the logic (a tricky expression, a magic number, a call whose effect is not obvious), name the pattern the code follows, explain in `terms` the terms such a reader may not know, and in `parameters` every argument whose meaning or value is not obvious.',
  decisions: 'Tag "decisions": focus `why` on the decision and its trade-offs, list in `alternatives` the options you weighed and why you rejected them, and fill `impact` with what the change affects, depends on or makes harder to change.',
  architecture: 'Tag "architecture": keep to the architectural meaning of the change: how it fits the system, what it commits the project to, long-term consequences and risks.',
  onboarding: 'Tag "onboarding": write for a developer who just joined and is learning this codebase. Do everything the learn tag asks, and also say where the change sits in the codebase: the module or layer, the flow it is part of from its entry point to here, the conventions it follows, and the files to read next.',
  all: 'Tag "all": explain the change line by line: a `lines` comment for nearly every line you change and a `removed` comment for every line or block you delete; every technical term, abbreviation and formula in `terms`; every argument of each call you add or change in `parameters`, with its meaning, default and why it has this value; every field of each symbol; the alternatives you considered.',
}

// What a part of the note asks for, for the parts the chosen tags name
const PART_RULES: Record<Part, string> = {
  symbols: 'Whenever the change adds a class, function, method, endpoint, module or type, add it to `symbols`: why it exists, why it has this shape (for example a class rather than a function), and what calls it.',
  uses: 'Whenever the change brings in something defined elsewhere (an import, a call to a function or class from another file, a library), add it to `uses`: its `name` as it appears in the code, `from` where (a file path in the project, or the package), and `why` this change uses it here. For a library, also say why this library or class rather than another.',
  lines: '`lines` are comments on single lines: `anchor` is text copied exactly from one line of the code you are about to write, long enough to find that line, and `says` explains that line.',
  removed: '`removed` comments on lines you delete: `anchor` is copied from a line of the code as it is now, and `says` gives the reason that line goes: what made it unnecessary, wrong or replaceable, who still used it, and the evidence you have. The reader sees that the line is deleted, so never write only that it is deleted or that nothing replaces it: not "The function is deleted, nothing replaces it" but "Its column is Population / AveOccup, two columns the model already sees, so it only repeats them; add_features and one test were its only callers".',
  parameters: '`parameters` explains arguments and settings: what each controls, its default, and why the code uses this value.',
  terms: '`terms` explains technical terms: the term as developers say it, and what it means.',
  alternatives: '`alternatives` lists the options you rejected, each with the reason.',
  impact: '`impact` names other parts of the system the change affects, depends on or makes harder to change.',
  risks: '`risks` says what the user should check by hand after this change.',
}

const RECAP_RULES: Record<RecapPart, string> = {
  reading_order: 'the order to read the changed files in and why (`reading_order`)',
  groups: 'the files grouped by role (`groups`)',
  check_by_hand: 'what the user should check by hand (`check_by_hand`)',
  outcomes: 'what you learned after a note\'s change, such as a test result, a measurement or a surprise, with the number inloop gave the note ("note 3 saved") (`outcomes`)',
  setup: 'how to install, run, test and debug the project (`setup`)',
  conventions: 'the conventions the code follows (`conventions`)',
  questions: 'questions to check understanding, with answers (`questions`)',
  first_tasks: 'small first tasks (`first_tasks`)',
}

// The written form for readers who take in short, ordered text more easily. It changes how the
// notes are written, never what they hold: that is the tags' job.
function adhdRules(parts: Part[]): string {
  return [
    '## How to write for this user',
    '',
    'The user reads text written this way more easily. Follow it in every text field of the notes and the recap.',
    '- `tldr` first: the one thing to remember, in one short sentence.',
    '- One idea per sentence, sentences under 20 words. In `what` and `why`, prefer short lines that start with "- " to paragraphs.',
    '- Put the one or two words a skimming reader must not miss in **bold**.',
    '- Keep the same order every time: what it does, why, what to watch out for.',
    parts.includes('terms')
      ? '- Keep technical words as developers say them, in every field. Explain each term the first time it appears, in `terms`: what it means, with a small example from this code. A formula: each symbol one by one, then what it says.'
      : '- Keep technical words as developers say them, in every field, and explain one in a few words the first time it appears.',
    ...(parts.includes('parameters') ? ['- For each parameter you mention: what it controls, the value used and why, its default, and when you would change it.'] : []),
    '- Give a concrete example before an abstract rule.',
    '- No filler, no repetition, no em-dashes.',
  ].join('\n')
}

export function instructions(plugin: string, lang: Language, tags: Tag[], adhd = false): string {
  const note = 'mcp__' + plugin + '__' + NOTE_TOOL
  const recap = 'mcp__' + plugin + '__' + RECAP_TOOL
  const name = languageName(lang)
  const { note: parts, recap: recapParts } = partsOf(tags)
  const termsHint = parts.includes('terms') ? 'explain the term in `terms` instead.' : 'explain the term in a few words instead.'
  const rules = [
    '# inloop',
    '',
    'The user follows your work through inloop, so explain every change you make to files.',
    '',
    '- Before each logical change to files, call `' + note + '` once. A logical change is one idea, such as a new function and the call that uses it, and it may cover several files. List every file it will touch in `files`.',
    '- Write every text field of the note in ' + name + ', even when the conversation is in another language. Keep code identifiers, file paths, commands and quoted code exactly as they are.',
    '- Write like a developer who speaks ' + lang.english + ' explaining code to a colleague: ' + lang.english + ' sentences, with every technical word in the form developers use, which is usually English. This holds in every field and for every kind of technical word: what things are (seed, split, pipeline, cache, endpoint), what code does (shuffle, fit, deploy, merge, retry) and how it behaves (reproducible, deterministic, idempotent). Never replace a technical word with an everyday ' + lang.english + ' paraphrase or a word-for-word translation, not even to make a sentence easier; ' + termsHint + (example(lang.code) ? ' ' + example(lang.code) : ''),
    '- `tldr` is the one thing to remember about the change, in one short sentence that says what changes and why (for example: "households goes: the model already sees Population and AveOccup, and the column only repeats them"). `what` says what the change does, for a reader who did not write the code, and names everything it removes. `why` gives the reason for this approach in your own words: when the user asked for the change, say so, and still give the technical reason it is right, or your doubt. Set `basis` to "verified" when a test, a measurement or documentation you read supports the reason, and to "judgment" when it is your own choice.',
    ...parts.map((p) => '- ' + PART_RULES[p]),
    '- The user chose the tags ' + tags.join(', ') + ' for these notes. ' + tags.map((t) => TAG_RULES[t]).join(' ') + ' Write only the fields the note tool offers: the others are left out on purpose, to keep notes short and cheap.',
    '- When you finish a task that changed files, call `' + recap + '` once: an overview' + recapParts.map((r) => ', ' + RECAP_RULES[r]).join('') + '. Write it in the same language as the notes.',
    '- Prefer the Edit and Write tools for changing files. When you must change files with a shell command, call `' + note + '` before that command too.',
    '- Never put secrets, tokens or passwords in a note or a recap.',
  ]
  return (adhd ? [...rules, '', adhdRules(parts)] : rules).join('\n')
}

const text = (description: string) => ({ type: 'string', description })
const list = (description: string, items: Record<string, unknown>) => ({ type: 'array', description, items })

// Every field the note tool can have; a session offers the core fields and the parts its tags name
const NOTE_FULL = {
  name: NOTE_TOOL,
  description: 'inloop: record a short, structured explanation of the change you are about to make to files, before you make it. The user reads these notes to understand your work. One call per logical change, in the language the inloop instructions name.',
  inputSchema: {
    type: 'object',
    properties: {
      title: text('The change in a few words, like a commit subject.'),
      tldr: text('The one thing to remember about this change, in one short sentence: what changes and why.'),
      files: list('Every file this change will create, edit or delete, as paths relative to the project.', { type: 'string' }),
      what: text('What the change does, for a reader who did not write the code.'),
      why: text('Why this approach: the reason the change is made this way.'),
      basis: { type: 'string', enum: ['verified', 'judgment'], description: '"verified" when a test, a measurement or documentation you read supports the reason; "judgment" when it is your own choice.' },
      uses: list('Things this change uses that are defined somewhere else: in another file of the project or in a library.', {
        type: 'object',
        properties: {
          name: text('The name as it appears in the code: a function, class, module or package.'),
          from: text('Where it comes from: a file path relative to the project, or the package name.'),
          why: text('Why this change uses it here; for a library, why this library or class rather than another.'),
          doc_url: text('Its official documentation page. Leave it out unless you know the page.'),
        },
        required: ['name', 'from', 'why'],
      }),
      symbols: list('Every class, function, method, endpoint, module or type this change adds.', {
        type: 'object',
        properties: {
          name: text('The name as it appears in the code.'),
          kind: { type: 'string', enum: ['class', 'function', 'method', 'endpoint', 'module', 'type', 'other'] },
          file: text('The file it is in, relative to the project.'),
          why_exists: text('Why it is needed.'),
          why_this_shape: text('Why it has this form, for example a class rather than a function.'),
          called_by: text('What uses it.'),
        },
        required: ['name', 'kind', 'why_exists'],
      }),
      parameters: list('Arguments and settings worth explaining.', {
        type: 'object',
        properties: {
          name: text('The parameter as it appears in the code.'),
          meaning: text('What it controls.'),
          default: text('Its default value, when it has one.'),
          why_this_value: text('Why the code uses this value.'),
          doc_url: text('The official documentation page for it. Leave it out unless you know the page.'),
        },
        required: ['name', 'meaning'],
      }),
      lines: list('Comments on single lines of the code this change writes.', {
        type: 'object',
        properties: {
          anchor: text('Text copied exactly from one line of the new code, long enough to find that line.'),
          says: text('What that line does and why.'),
        },
        required: ['anchor', 'says'],
      }),
      removed: list('Comments on lines of the current code that this change deletes.', {
        type: 'object',
        properties: {
          anchor: text('Text copied exactly from one line that is being deleted, as it is in the code now, long enough to find that line.'),
          says: text('The reason this line goes: what made it unnecessary, wrong or replaceable, who still used it, and the evidence. Not merely that it is deleted.'),
        },
        required: ['anchor', 'says'],
      }),
      terms: list('Technical terms the reader may not know, kept as developers say them, each with what it means.', {
        type: 'object',
        properties: {
          term: text('The term as developers say it, usually in English: random seed, pipeline, overfitting.'),
          means: text('What it means, in plain words, with a small example from this code when it helps.'),
        },
        required: ['term', 'means'],
      }),
      impact: list('Other parts of the system this change affects, depends on or makes harder to change.', { type: 'string' }),
      alternatives: list('Options you rejected, each with the reason.', { type: 'string' }),
      risks: list('What the user should check by hand after this change.', { type: 'string' }),
      source: { type: 'string', enum: ['live', 'reconstructed'], description: '"reconstructed" when the note explains code that already exists (as /inloop:annotate asks) rather than a change you are about to make. Leave it out otherwise.' },
      commit: text('Only for a reconstructed note that explains one commit: that commit\'s hash.'),
    },
    required: ['title', 'files', 'what', 'why'],
  },
}

const RECAP_FULL = {
  name: RECAP_TOOL,
  description: 'inloop: when you finish a task that changed files, summarize it for the reader once: an overview, the order to read the changed files in, the files grouped by role, and what to check by hand. In the language the inloop instructions name.',
  inputSchema: {
    type: 'object',
    properties: {
      overview: text('What the task changed and why, in a few sentences.'),
      reading_order: list('The changed files in the order a reader should read them.', {
        type: 'object',
        properties: { file: text('A path relative to the project.'), why: text('Why to read it at this point.') },
        required: ['file', 'why'],
      }),
      groups: list('The changed files grouped by role, such as data, logic, interface, tests.', {
        type: 'object',
        properties: { role: text('The role of the files in this group.'), files: list('Paths relative to the project.', { type: 'string' }) },
        required: ['role', 'files'],
      }),
      check_by_hand: list('What the user should check by hand.', { type: 'string' }),
      outcomes: list('What you learned after a note\'s change: a test result, a measurement, a surprise.', {
        type: 'object',
        properties: { note: { type: 'integer', description: 'The number inloop gave the note when it saved it.' }, says: text('What happened, with the numbers.') },
        required: ['note', 'says'],
      }),
      setup: list('How to install, run, test and debug the project, each a step with its command.', { type: 'string' }),
      conventions: list('The rules the code follows, such as naming, structure, error handling, tests, commits.', { type: 'string' }),
      questions: list('Questions a newcomer answers to check they understood the codebase, each with its answer.', {
        type: 'object',
        properties: { q: text('The question.'), a: text('The answer, pointing to the files.') },
        required: ['q', 'a'],
      }),
      first_tasks: list('Small, safe changes a newcomer can make first, each touching a main part of the code.', { type: 'string' }),
    },
    required: ['overview'],
  },
}

// A tool's definition for the session's tags: the fields the tags name keep their full description;
// the others stay in the schema, so /inloop:annotate and /inloop:onboard can still fill them, but
// with one short line and no item fields, so Claude leaves them out and the definition sent with
// every request stays small.
const OFF = 'Only when an inloop skill asks.'
function trim<T extends { inputSchema: { properties: Record<string, any> } }>(spec: T, keep: string[]): T {
  const short = (v: any) => {
    const compact = { type: 'array', description: OFF, items: { type: v.items?.type ?? 'string' } }
    return JSON.stringify(compact).length < JSON.stringify(v).length ? compact : v
  }
  const properties = Object.fromEntries(Object.entries(spec.inputSchema.properties).map(([k, v]) => [k, keep.includes(k) ? v : short(v)]))
  return { ...spec, inputSchema: { ...spec.inputSchema, properties } }
}

const NOTE_CORE = ['title', 'tldr', 'files', 'what', 'why', 'basis', 'source', 'commit']
export const noteSpec = (tags: Tag[]) => trim(NOTE_FULL, [...NOTE_CORE, ...partsOf(tags).note])
export const recapSpec = (tags: Tag[]) => trim(RECAP_FULL, ['overview', ...partsOf(tags).recap])
// The definitions with every field described in full
export const NOTE_SPEC = NOTE_FULL
export const RECAP_SPEC = RECAP_FULL
