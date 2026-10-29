// The system-prompt section inloop adds while it is on, and the tools it gives Claude.
// The text depends only on the settings, so the prompt cache stays valid between requests.

import { type Detail, type Language, languageName } from './config.ts'

export const NOTE_TOOL = 'note'
export const RECAP_TOOL = 'recap'

const DETAIL_RULES: Record<Detail, string> = {
  brief: 'Keep `tldr`, `what` and `why` to one sentence each. Give each symbol one line, in `why_exists`. Leave `parameters`, `lines` and `alternatives` empty unless something would surprise a reader.',
  standard: 'Add to `parameters` every argument or setting whose meaning or value is not obvious, with its meaning and why it has this value. Add `lines` comments for the lines a reader would stop at: a tricky expression, a magic number, a call whose effect is not obvious. Add `alternatives` when you rejected a real option. Fill every field of each symbol.',
  deep: 'Add to `parameters` every argument of each call you add or change, and the other important parameters of that function, each with its meaning, its default and why it has this value. Add a `lines` comment for most lines you change, so the change reads line by line. Give `doc_url` only when you know the official documentation page for it; never guess a URL. Fill every field of each symbol, and list the alternatives you considered.',
}

// The written form for readers who take in short, ordered text more easily. It changes how the
// notes are written, never how much they explain: that is the detail level's job.
const ADHD_RULES = [
  '## How to write for this user',
  '',
  'The user reads text written this way more easily. Follow it in every text field of the notes and the recap.',
  '- `tldr` first: the one thing to remember, in one short sentence.',
  '- One idea per sentence, sentences under 20 words. In `what` and `why`, prefer short lines that start with "- " to paragraphs.',
  '- Put the one or two words a skimming reader must not miss in **bold**.',
  '- Keep the same order every time: what it does, why, what to watch out for.',
  '- Explain every term, abbreviation, symbol and formula the first time it appears: each symbol one by one, then what it means in plain words, with a small example from this code, such as the numbers it produces.',
  '- For each parameter you mention: what it controls, the value used and why, its default, and when you would change it.',
  '- Give a concrete example before an abstract rule.',
  '- No filler, no repetition, no em-dashes.',
].join('\n')

export function instructions(plugin: string, lang: Language, detail: Detail, adhd = false): string {
  const note = 'mcp__' + plugin + '__' + NOTE_TOOL
  const recap = 'mcp__' + plugin + '__' + RECAP_TOOL
  const rules = [
    '# inloop',
    '',
    'The user follows your work through inloop, so explain every change you make to files.',
    '',
    '1. Before each logical change to files, call `' + note + '` once. A logical change is one idea, such as a new function and the call that uses it, and it may cover several files. List every file it will touch in `files`.',
    '2. Write every text field of the note in ' + languageName(lang) + ', even when the conversation is in another language. Keep code identifiers, file paths, commands and quoted code exactly as they are.',
    '3. `tldr` is the one thing to remember about the change, in one short sentence. `what` says what the change does, in plain words for a reader who did not write the code. `why` gives the reason for this approach. Set `basis` to "verified" when a test, a measurement or documentation you read supports the reason, and to "judgment" when it is your own choice.',
    '4. Whenever the change adds a class, function, method, endpoint, module or type, add it to `symbols`: why it exists, why it has this shape (for example a class rather than a function), and what calls it.',
    '5. Whenever the change brings in something defined elsewhere (an import, a call to a function or class from another file, a library), add it to `uses`: its `name` as it appears in the code, `from` where (a file path in the project, or the package), and `why` this change uses it here. For a library, also say why this library or class rather than another.',
    '6. `lines` are comments on single lines: `anchor` is text copied exactly from one line of the code you are about to write, long enough to find that line, and `says` explains that line.',
    '7. ' + DETAIL_RULES[detail],
    '8. When you finish a task that changed files, call `' + recap + '` once: an overview, the order to read the changed files in and why, the files grouped by role, and what the user should check by hand. Write it in the same language as the notes.',
    '9. Prefer the Edit and Write tools for changing files. When you must change files with a shell command, call `' + note + '` before that command too.',
    '10. Never put secrets, tokens or passwords in a note or a recap.',
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
      what: text('What the change does, in plain words for a reader who did not write the code.'),
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
          says: text('What that line does and why, in plain words.'),
        },
        required: ['anchor', 'says'],
      }),
      alternatives: list('Options you rejected, each with the reason.', { type: 'string' }),
      risks: list('What the user should check by hand after this change.', { type: 'string' }),
      source: { type: 'string', enum: ['live', 'reconstructed'], description: '"reconstructed" when the note explains code that already exists (as /inloop:explain asks) rather than a change you are about to make. Leave it out otherwise.' },
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
