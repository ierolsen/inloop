# inloop design

## Decisions

### A mod, not settings hooks

inloop is a Claude Code mod: TypeScript that Claude Code runs in its own process (Claude Code
2.1.287 or later). A mod needs no Python or Node on the user's machine, which settings hooks would.
It can:
- register a tool for Claude;
- register a command that runs without a model turn;
- add a section to the system prompt;
- wrap each tool call;
- draw in the interface.

### Notes come from a tool, not from Claude's prose

Claude calls `mcp__inloop__note` with structured fields, so inloop never has to parse free text.
The hook answers the call itself and never passes it on, so the call needs no permission. Field keys
stay English; Claude writes the values in the user's language.

### Instructions as a system-prompt section

A `prompt.compose` hook appends one section, `inloop:instructions`, on the `session` side of the
cache boundary. Its text depends only on the settings (language, detail, on or off). The prompt
cache therefore stays valid between requests and changes once when a setting changes.

### Edits are captured around the tool call

A `tool.call` hook on Edit, Write, MultiEdit and NotebookEdit reads the file before the call,
awaits `next(e)`, and reads it after. The diff of the two is attached to:
1. the open note that lists the file;
2. else the turn's latest note;
3. else nothing, and the edit is listed as unexplained.

Every path ends in `next(e)`. A missing file reads as empty, and a file over the size cap is
logged without a diff.

### Changes outside the edit tools

At session start inloop records `HEAD` and the files already changed. On `/inloop open` and at the
end of each turn, every file that changed since then without a logged edit is listed with its
diff. Most of these come from shell commands. Outside a git repository the page says the check
is off.

### One log file per session

Notes and edits are kept per session in `.inloop/log/<session>.jsonl`, so parallel sessions in
one project never write the same file. The session's records are kept in memory and written whole
after each change, one write at a time. `$.fs.write` replaces a file and allows 4 MiB, so the log
rolls over to a new part before 3.5 MiB. Every line carries `"v": 1`.

Nothing is written until the session records something: a note, an edit, a recap, or files
changed outside the edit tools. Until then the session's first records stay in memory, so a
session that only answers questions leaves no `.inloop/` folder, which matters because a plugin
installed for the user runs in every folder Claude Code opens. The first write into `.inloop/`
(a log, a project setting or a review page) puts `.inloop/.gitignore` in place first.

### Language

The language is taken from the first of these that is set:
1. `.inloop/config.json` (`/inloop lang ... --project`).
2. The user's choice across projects (`/inloop lang ...`, kept in `$.store`).
3. The plugin's `language` setting.
4. English.

Names and codes are both accepted. Page labels exist for `en`, `tr`, `de` and `nl`. Other languages
get English labels, while Claude still writes the notes in them.

### The review page

`/inloop open` writes `.inloop/review/<session>.html` from the session's log. In an interactive
session it opens the page in the browser (`open` on macOS, `xdg-open` elsewhere, `cmd /c start`
on Windows); otherwise, and whenever that fails, it prints the path. `/inloop open all` writes a
page for each of the 20 most recent sessions and `index.html`, which lists them.

- A session splits into tasks at each recap on the main loop. A subagent's recap shows inside the
  task it belongs to. The work after the last recap is read in a fixed order: data and types,
  logic, interface, tests, configuration, documentation, other; within a role, in the order the
  files first changed.
- Edits stay with the note they were paired with when they were made. A file changed outside the
  edit tools goes under the latest note that names it, which is usually the note Claude writes
  before a shell command; otherwise it is listed in a section of its own.
- The page is one file: inline CSS and a few lines of script that fold the diffs. It reads the
  same without the script. Everything taken from the log is escaped, and a Content-Security-Policy
  meta tag stops the page from loading anything.
- `$.fs.write` takes 4 MiB, so a page over 3.8 MB leaves out its largest diffs first, then its
  oldest tasks, and says so on the page.
- Pages are drawn again on every `/inloop open`, so a newer inloop or another language redraws
  the old ones too.
- Narrow screens stack the tables into labelled rows; nothing but a diff scrolls sideways at 390 px.

## Checks on Claude Code 2.1.310 (29 Oct 2026)

A throwaway mod and `claude -p --plugin-dir` runs in a scratch git repository showed:

| Check | Result |
|---|---|
| `$.tool.register` in `session.start`; Claude calls the tool when the instructions ask | Yes. One note covered two edits in one run |
| A `tool.call` hook that answers the note itself | No permission prompt, even in `-p` |
| `prompt.compose` section | Reaches the main conversation and subagents: a general-purpose subagent called `note` before its own edit |
| Fields of an edit's `tool.call` event | Edit: `file_path`, `old_string`, `new_string`, `replace_all`, `tool`, `tool_use_id`. Write: `file_path`, `content`, `tool`, `tool_use_id`. `agentId` is set for a subagent's call and absent for the main conversation. Paths are absolute |
| Reading the file before a Write that creates it | Empty, as expected |
| `register(on, options)` | `options` holds the `userConfig` values with defaults filled in |
| Type declarations | Written into `.claude-plugin/types/` only in interactive sessions. The reference copy is `mods/types/claude-code.d.ts` in the anthropics/claude-code repository |

`claude -p "/inloop open all"` runs the command: the reply comes in the project's language, and as
the session is not interactive no browser is started.

Not covered by `-p`, so tested with `claude plugin test` and by hand: the live card, the pane, the
line under an answer, and the `/inloop` command's output in the terminal.

## Limits that shape the code

| Limit | Value |
|---|---|
| A hook's own time | 10 s |
| `$.fs.read` and `$.fs.write` | 4 MiB per file |
| `$.process.run` | 30 s by default |
| `$.store` | 4 MiB of JSON in total |
| Tree text | 100,000 characters |
