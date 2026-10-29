// English labels: the reference every other language follows key for key.
// {name} marks a value filled in at run time. A counted label has a form per plural category of
// the language (one and other in English); count() in index.ts picks the form.

export const en = {
  // the line under Claude's answer when a turn changed something
  turn_summary: 'inloop: {notes}, {edits}{extra}.',
  turn_unexplained: ', {count} without a note',
  turn_outside: ', {files} changed outside the edit tools',
  notes: { one: '{count} note', other: '{count} notes' },
  edits: { one: '{count} edit', other: '{count} edits' },
  files: { one: '{count} file', other: '{count} files' },

  // /inloop
  help: [
    'inloop commands:',
    '  /inloop status                what inloop recorded and which settings are in effect',
    '  /inloop lang <language>       the language of notes, for all your projects',
    '  /inloop lang <language> --project    the same, for this project only',
    '  /inloop lang reset [--project]    back to the plugin setting (with --project, only this project\'s choice goes)',
    '  /inloop detail <brief|standard|deep> [--project]    how much the notes explain',
    '  /inloop detail reset [--project]  back to the plugin setting (with --project, only this project\'s choice goes)',
    '  /inloop on | off              ask Claude for notes, or stop asking, in this session',
  ].join('\n'),
  status: [
    'inloop is {state}. Notes are in {language} ({language_source}), detail {detail} ({detail_source}).',
    'This session: {notes}, {edits} ({unexplained} without a note), {files} changed outside the edit tools.',
    'Log: {log}',
  ].join('\n'),
  state_on: 'on',
  state_off: 'off',
  source_project: 'this project',
  source_user: 'your setting for all projects',
  source_plugin: 'the plugin setting',
  source_default: 'the default',
  on: 'inloop is on: Claude writes a note before each change.',
  off: 'inloop is off for this session: Claude is no longer asked for notes, and edits are not recorded. /inloop on turns it back on.',
  lang_user: 'From now on inloop notes are in {language}, in all your projects.',
  lang_project: 'From now on inloop notes are in {language}, in this project.',
  lang_reset: 'inloop notes are in {language} again ({source}).',
  lang_missing: 'Name a language, as in /inloop lang Turkish or /inloop lang de.',
  lang_project_wins: 'This project has its own choice, {language}, which comes first here; /inloop lang reset --project removes it.',
  lang_no_labels: 'inloop has no labels in {language} yet, so its own messages stay in English; the notes themselves are in {language}.',
  detail_user: 'From now on inloop notes are {detail}, in all your projects.',
  detail_project: 'From now on inloop notes are {detail}, in this project.',
  detail_reset: 'inloop notes are {detail} again ({source}).',
  detail_project_wins: 'This project has its own choice, {detail}, which comes first here; /inloop detail reset --project removes it.',
  detail_bad: 'Detail is brief, standard or deep.',
  unknown: 'inloop has no command "{command}".',
  not_ready: 'inloop has not started in this session yet.',
}

export type Labels = typeof en
