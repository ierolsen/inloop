// The system-prompt section inloop adds while it is on, and the tools it gives Claude.
// The text depends only on the settings, so the prompt cache stays valid between requests.

import { type Level, type Language, languageName } from './config.ts'
import { example } from './jargon.ts'

export const NOTE_TOOL = 'note'
export const RECAP_TOOL = 'recap'

// What each level asks Claude to write. A level changes the focus, not only the length: the deeper
// levels explain the code line by line and every term, the higher ones the decisions behind it.
export const LEVEL_RULES: Record<Level, string> = {
  'full': 'Level "full explanation": write for a reader new to this code or to this kind of code. Add a `lines` comment for nearly every line you change, so the change reads line by line. Add to `terms` every technical term, abbreviation, formula and library concept the change relies on. Add to `parameters` every argument of each call you add or change, and the other important parameters of that function, each with its meaning, its default and why it has this value. Fill every field of each symbol, and list the alternatives you considered.',
  'guided': 'Level "guided": write for a developer who knows the language but not this code. Add `lines` comments for the lines that carry the logic: a tricky expression, a magic number, a call whose effect is not obvious. Name the pattern when the code follows one (for example a factory, a pipeline, a retry with backoff). Add to `terms` the terms such a developer may not know, and to `parameters` every argument whose meaning or value is not obvious. Fill every field of each symbol.',
  'essentials': 'Level "key points": write for an experienced developer. Keep `what` and `why` short and add only what the code does not show by itself: surprising values, edge cases, risks. Keep `lines` to the few lines a reviewer would stop at; leave `terms` empty.',
  'design': 'Level "design decisions": write for someone who reviews design. Focus `why` on the decision and its trade-offs, list in `alternatives` the options you weighed and why you rejected them, and fill `impact` with the other parts of the system this change affects, depends on or makes harder to change. Add a `lines` comment only where a line carries a decision.',
  'big-picture': 'Level "big picture": write for someone who looks at the whole system. Keep each note to the architectural meaning of the change: how it fits the system, what it commits the project to, long-term consequences and risks, in `why`, `impact` and `risks`. Keep `what` to one sentence and leave `lines`, `parameters` and `terms` empty.',
}

// The written form for readers who take in short, ordered text more easily. It changes how the
// notes are written, never how much they explain: that is the level's job.
const ADHD_RULES = [
  '## How to write for this user',
  '',
  'The user reads text written this way more easily. Follow it in every text field of the notes and the recap.',
  '- `tldr` first: the one thing to remember, in one short sentence.',
  '- One idea per sentence, sentences under 20 words. In `what` and `why`, prefer short lines that start with "- " to paragraphs.',
  '- Put the one or two words a skimming reader must not miss in **bold**.',
  '- Keep the same order every time: what it does, why, what to watch out for.',
  '- Keep technical words as developers say them, in every field. Explain each term the first time it appears, in `terms`: what it means, with a small example from this code. A formula: each symbol one by one, then what it says.',
  '- For each parameter you mention: what it controls, the value used and why, its default, and when you would change it.',
  '- Give a concrete example before an abstract rule.',
  '- No filler, no repetition, no em-dashes.',
].join('\n')

export function instructions(plugin: string, lang: Language, level: Level, adhd = false): string {
  const note = 'mcp__' + plugin + '__' + NOTE_TOOL
  const recap = 'mcp__' + plugin + '__' + RECAP_TOOL
  const name = languageName(lang)
  const rules = [
    '# inloop',
    '',
    'The user follows your work through inloop, so explain every change you make to files.',
    '',
    '1. Before each logical change to files, call `' + note + '` once. A logical change is one idea, such as a new function and the call that uses it, and it may cover several files. List every file it will touch in `files`.',
    '2. Write every text field of the note in ' + name + ', even when the conversation is in another language. Keep code identifiers, file paths, commands and quoted code exactly as they are.',
    '3. Write like a developer who speaks ' + lang.english + ' explaining code to a colleague: ' + lang.english + ' sentences, with every technical word in the form developers use, which is usually English. This holds in every field and for every kind of technical word: what things are (seed, split, pipeline, cache, endpoint), what code does (shuffle, fit, deploy, merge, retry) and how it behaves (reproducible, deterministic, idempotent). Never replace a technical word with an everyday ' + lang.english + ' paraphrase or a word-for-word translation, not even to make a sentence easier; explain the term in `terms` instead.' + (example(lang.code) ? ' ' + example(lang.code) : ''),
    '4. `tldr` is the one thing to remember about the change, in one short sentence. `what` says what the change does, for a reader who did not write the code. `why` gives the reason for this approach. Set `basis` to "verified" when a test, a measurement or documentation you read supports the reason, and to "judgment" when it is your own choice.',
    '5. Whenever the change adds a class, function, method, endpoint, module or type, add it to `symbols`: why it exists, why it has this shape (for example a class rather than a function), and what calls it.',
    '6. Whenever the change brings in something defined elsewhere (an import, a call to a function or class from another file, a library), add it to `uses`: its `name` as it appears in the code, `from` where (a file path in the project, or the package), and `why` this change uses it here. For a library, also say why this library or class rather than another.',
    '7. `lines` are comments on single lines: `anchor` is text copied exactly from one line of the code you are about to write, long enough to find that line, and `says` explains that line. `terms` explains technical terms: the term as developers say it, and what it means. `impact` names other parts of the system the change affects or depends on.',
    '8. ' + LEVEL_RULES[level],
    '9. When you finish a task that changed files, call `' + recap + '` once: an overview, the order to read the changed files in and why, the files grouped by role, and what the user should check by hand. Write it in the same language as the notes.',
    '10. Prefer the Edit and Write tools for changing files. When you must change files with a shell command, call `' + note + '` before that command too.',
    '11. Never put secrets, tokens or passwords in a note or a recap.',
  ]
  return (adhd ? [...rules, '', ADHD_RULES] : rules).join('\n')
}

const text = (description: string) => ({ type: 'string', description })
const list = (description: string, items: Record<string, unknown>) => ({ type: 'array', description, items })

export const NOTE_SPEC = {
  name: NOTE_TOOL,
  description: 'inloop: record a short, structured explanation of the change you are about to make to files, before you make it. The user reads these notes to understand your work. One call per logical change, in the language the inloop instructions name.',
  inputSchema: {
    type: 'object',
    properties: {
      title: text('The change in a few words, like a commit subject.'),
      tldr: text('The one thing to remember about this change, in one short sentence.'),
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

export const RECAP_SPEC = {
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
    },
    required: ['overview', 'reading_order'],
  },
}
