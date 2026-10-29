// The system-prompt section inloop adds while it is on, and the tools it gives Claude.
// The text depends only on the settings, so the prompt cache stays valid between requests.

import { type Detail, type Language, languageName } from './config.ts'

export const NOTE_TOOL = 'note'
export const RECAP_TOOL = 'recap'

const DETAIL_RULES: Record<Detail, string> = {
  brief: 'Keep `what` and `why` to one sentence each. Give each symbol one line, in `why_exists`. Leave `parameters` and `alternatives` empty unless a value would surprise a reader.',
  standard: 'Add to `parameters` every argument or setting whose meaning or value is not obvious, with its meaning and why it has this value. Add `alternatives` when you rejected a real option. Fill every field of each symbol.',
  deep: 'Add to `parameters` every argument of each call you add or change, and the other important parameters of that function, each with its meaning, its default and why it has this value. Give `doc_url` only when you know the official documentation page for it; never guess a URL. Fill every field of each symbol, and list the alternatives you considered.',
}

export function instructions(plugin: string, lang: Language, detail: Detail): string {
  const note = 'mcp__' + plugin + '__' + NOTE_TOOL
  const recap = 'mcp__' + plugin + '__' + RECAP_TOOL
  return [
    '# inloop',
    '',
    'The user follows your work through inloop, so explain every change you make to files.',
    '',
    '1. Before each logical change to files, call `' + note + '` once. A logical change is one idea, such as a new function and the call that uses it, and it may cover several files. List every file it will touch in `files`.',
    '2. Write every text field of the note in ' + languageName(lang) + ', even when the conversation is in another language. Keep code identifiers, file paths, commands and quoted code exactly as they are.',
    '3. `what` says what the change does, in plain words for a reader who did not write the code. `why` gives the reason for this approach. Set `basis` to "verified" when a test, a measurement or documentation you read supports the reason, and to "judgment" when it is your own choice.',
    '4. Whenever the change adds a class, function, method, endpoint, module or type, add it to `symbols`: why it exists, why it has this shape (for example a class rather than a function), and what calls it.',
    '5. ' + DETAIL_RULES[detail],
    '6. When you finish a task that changed files, call `' + recap + '` once: an overview, the order to read the changed files in and why, the files grouped by role, and what the user should check by hand. Write it in the same language as the notes.',
    '7. Prefer the Edit and Write tools for changing files. When you must change files with a shell command, call `' + note + '` before that command too.',
    '8. Never put secrets, tokens or passwords in a note or a recap.',
  ].join('\n')
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
      files: list('Every file this change will create, edit or delete, as paths relative to the project.', { type: 'string' }),
      what: text('What the change does, in plain words for a reader who did not write the code.'),
      why: text('Why this approach: the reason the change is made this way.'),
      basis: { type: 'string', enum: ['verified', 'judgment'], description: '"verified" when a test, a measurement or documentation you read supports the reason; "judgment" when it is your own choice.' },
      alternatives: list('Options you rejected, each with the reason.', { type: 'string' }),
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
      risks: list('What the user should check by hand after this change.', { type: 'string' }),
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
