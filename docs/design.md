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
cache boundary. Its text depends only on the settings (language, level, ADHD form, on or off). The prompt
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

At session start inloop records `HEAD` and the files already changed. On `/inloop review` and at
the end of each turn, every file that changed since then without a logged edit is listed with its
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

### Commits

Claude commits through the shell, so after every Bash or PowerShell call (and at the end of each
turn, for commits made by hand) inloop reads `HEAD`. When it has moved, each new commit gets a
`commit` record: its hash, parents, subject, files, and the edits and notes that went into it. An
edit goes with the first commit that contains its file; a note without edits, such as the one
Claude writes before a shell command, with the first commit that contains a file it names. The
command itself is never touched: the hook calls `next(e)` first, and its `.catch` replays the
result instead of running the command again. A commit that holds none of Claude's work never
creates a log.

### The review

`/inloop review` writes `.inloop/review/review.html` and opens it in an interactive session
(`open` on macOS, `xdg-open` elsewhere, `cmd /c start` on Windows); otherwise, and whenever that
fails, it prints the path. `/inloop explain [path]` writes the same page as
`.inloop/review/explain[-path].html`, covering every commit inloop recorded and the files as they
stand, and opens it on the file or folder named.

- **What it covers.** By default the session's work: its commits (from where `HEAD` stood when it
  began) and then what is not committed yet. `/inloop review <range>` takes any git range or commit
  (`main..`, `HEAD~5..`, `a1b2c3d`); `/inloop review all` every commit inloop recorded. The newest
  30 commits are shown and older ones counted.
- **Code comes from git.** Each commit's files come from `git show -W`, which shows whole functions
  around a change; a file past 400 lines is fetched again with eight lines of context, and past 800
  it is cut. What is not committed comes from `git diff -W HEAD` and from reading new files. Every
  patch goes through redaction, and files that usually hold secrets show their name only. Outside
  git the page falls back to the diffs inloop captured itself.
- **Notes find their commit** by the commit records; a commit that was amended or rebased since is
  found again by its subject; a reconstructed note names its commit itself.
- **Explanations sit beside the code.** Each note's class and function cards go to the line that
  defines them, `uses` to the first line naming what is brought in (the import, else the call),
  parameters to the first line using them, and `lines` comments to the line whose text they quote
  (compared without whitespace). Every mark is placed once per commit and numbered; what finds no
  line is listed under its note. A name the review defines links to its definition from other
  lines.
- **A file explorer.** People browse code on GitHub, so the page is laid out the same way: the
  files the review covers in a tree (a folder holding one folder on one line, status letters,
  note counts), "Go to file" on `t`, and one view at a time. Folder views list each entry with its
  last change and when. Each file has three views: Code (the file as it stands at the end of the
  review, from `git show <end>:<path>` for a range and the working folder otherwise), Changes (its
  diff in each commit) and Why (`git blame --porcelain`: each block of lines with the commit that
  last changed it and that commit's note). The tree covers the review's files, not the whole
  repository, so the page stays small; the code of up to 40 files is shown, the files asked for
  first, then the explained ones.
- **An explanation sits only where it still holds.** In the Code view a note is placed on the
  lines its own commit wrote, then on older lines, never on lines a later commit rewrote; the
  ones left without a line are listed under the code with a link to their commit.
- **Views without a script.** Every view is drawn in advance and shown by the address's `#anchor`
  (CSS `:target` and `:has()`), so the page works as a mail attachment or with scripts off. The
  view the page opens on is written into its CSS. A small script adds the search, the keys, the
  level switch and the theme switch.
- **The level switch** opens at the most detailed level the notes on the page were written at and
  hides detail above it: parameters, borrowed names and terms at `essentials`, line comments too
  at `design`, every mark at `big-picture`. It cannot add what Claude did not write.
- **The page** is one file with no network: inline CSS, a small built-in highlighter, a theme switch
  (auto, light, dark), "Save as PDF" for the open view and "Everything as PDF" for every commit
  (or every file, for `/inloop explain`). `--theme light|dark` writes it with a fixed theme, to
  share. A page over 3.8 MB leaves out what it shows twice first (the diffs under Changes, then
  the code beside the Why view), then the code of its longest files, then its oldest commits.
- Narrow screens stack the explanations above their code and turn the tree into a drawer; only
  code scrolls sideways at 390 px. The gutter columns keep one width in every row, so an indent
  is never a gutter wider than the row above.

### Sharing

People share a review in three ways, and each has a command that uses what they already have; a
hosted service would mean storing other people's code, and sending mail through an API key would
mean shipping a key in a plugin.

- **A file** (`/inloop share [range]`): the page with a fixed light theme and the same review as
  Markdown, in `.inloop/share/`, shown in the file manager (`open -R`, `xdg-open`, `explorer
  /select,`). It is a single offline file, so it travels as a mail attachment and prints to PDF.
- **A pull request comment** (`/inloop share pr [n]`): the notes of the pull request's commits as
  Markdown (`review/markdown.ts`), under 60,000 characters (GitHub takes 65,536): line by line
  goes first, then terms, then "what", then the oldest commits, and the text says what was left
  out. Note text keeps its Markdown, but HTML in it shows as text and `@name` gets an invisible
  joiner so nobody is notified. The level hides what the page would hide.
  - A plain run writes the comment to `.inloop/share/pr-<n>.md`, with the pull request's head in
    `pr-<n>.json`, and only reads from GitHub. `--yes` posts that file's text only when the head
    is unchanged and the command was typed at Claude Code's prompt (origin `composer`, or
    `bridge` for the remote prompt). `claude -p` (origin `sdk`) is refused: Claude could run it
    from its shell tool, after a preview of its own. A plugin command cannot be run by Claude
    through its tools (checked with a probe command on 2.1.310).
  - The comment starts with `<!-- inloop -->`. inloop's earlier comment is the one by the same
    login that starts with it (`gh api ... --jq`), and is replaced (PATCH) rather than joined by
    another; `gh pr comment --edit-last` would edit whatever the person wrote last.
  - The repository comes from the pull request's URL, never from `{owner}/{repo}`, which a fork
    with an upstream remote can resolve differently. The body goes as a JSON file (`--input`), so
    gh never reads it as a number or a boolean.
- **A link** (December): a secret gist, previewed first in the same way.

`/inloop review pr [n]` fetches `refs/pull/<n>/head` into `refs/inloop/pr-<n>` (from the remote
that is the pull request's repository, else from its address) and reviews the pull request's
commits with the files as they stand at that reference. `gh` and `git` run with
`GIT_TERMINAL_PROMPT=0` and `GH_PROMPT_DISABLED=1`, so a missing login fails with a message
instead of waiting for a password.

### The live view

- The note tool's row and the recap tool's row in the transcript are drawn as cards
  (`ui.render` on `ToolUse`), from the call's input alone, cleaned and redacted as the log is.
  The card leads with the note's `tldr`. While Claude still streams the call, a card shows the
  fields that have arrived. A call that failed keeps the engine's own row.
- The code itself is in Claude Code's own rows for each edit, right under the card. An earlier
  pane that stepped through notes and diffs was dropped: with the cards and the review it was a
  third place to look.
- `claude plugin test` mounts the cards on all four surfaces (terminal, desktop, VS Code,
  mobile), since `-p` draws nothing.

### ADHD-friendly notes

`/inloop adhd on` (or the plugin's `adhd` setting, or `--project`) adds a writing block to the
instructions: the point first in `tldr`, one idea per sentence, short "- " lines, bold for the
words a skimming reader must not miss, the same order every time, every term, symbol, formula and
parameter explained the first time with an example from the code, no em-dashes. It sets the form;
the level still sets how much is explained. Terms stay as developers say them: the form asks for
a term to be explained, never translated.

### Levels and terms

`/inloop level <level>` sets how the notes explain, as a kind of explanation rather than a reader's
seniority: `full` (nearly every line, every term in `terms`, every parameter), `guided` (the lines
that carry the logic, the patterns named), `essentials` (what the code does not show by itself),
`design` (decisions, trade-offs, alternatives and `impact`) and `big-picture` (architecture and
consequences, no line detail). The levels before this one, `brief`, `standard` and `deep`, still
work as `essentials`, `guided` and `full`.

A note is written the way a developer who speaks its language explains code to a colleague: that
language's sentences, with every technical word in the form developers use, which is usually
English. The first Turkish demo turned `random_state` into a word-for-word "shuffling seed"; after
a rule about terms, the second still wrote "rastgele ve tekrarlanabilir bölme" ("random and
repeatable division") for `train_test_split`, because Claude read "term" as a name and paraphrased
the verbs and properties around it. So:

- The rule covers every word with a technical meaning, in every field: what things are (seed,
  split), what code does (shuffle, fit) and how it behaves (reproducible, deterministic). The
  field descriptions no longer ask for "plain words", which invited paraphrase; a term's meaning
  goes in `terms`.
- For Turkish, German and Dutch the instructions carry examples of the form developers use next
  to the translation they do not (`hooks/jargon.ts`).
- The same file lists word-for-word translations developers do not use. A note whose prose holds
  one is sent back once: the note tool answers that it is not saved yet and names each word with
  the term to use. The next try for the same files is saved whatever it says (with the words in
  its `problems`), and at most three notes are sent back in one turn, so it never loops. Code
  spans, line quotes and the glossary are not checked, and stems with an everyday meaning too
  (Turkish "karıştır") say which meaning is meant. The sent-back call's row shows one line instead
  of a card.

### Explaining code that already exists

`/inloop:annotate <target>` is a skill for code Claude did not just write: older code, a project
someone else built, a commit range, or edits the page lists without a note. Claude reads the code
and writes notes through the same `note` tool with `"source": "reconstructed"`, then a recap, and
changes no file.

- A reconstructed note never pairs with an edit: it explains code, it is not the reason for the
  next change.
- For code Claude did not write, the reason is usually an inference. The skill allows
  `basis: verified` only when a commit message, a comment, a document or a test states the reason,
  and asks Claude to name that source; otherwise the note says the reason is likely.
- The skill runs only when the person calls it (`disable-model-invocation: true`), so a plain
  question about the code does not fill the log.
- It writes in the language the inloop instructions name, and falls back to the plugin's
  `language` setting when inloop is off.

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

`claude -p "/inloop:explain shapes.py"` (the skill's name before it became `/inloop:annotate`) in a scratch repository set to Turkish wrote three Turkish notes
marked `reconstructed`, each reason worded as an inference with the missing evidence named, callers
with line numbers, and a recap; no file changed.

`claude -p` runs inloop's commands (checked with `/inloop open all`, since replaced by `/inloop review`): the reply comes in the project's language, and as
the session is not interactive no browser is started.

Not covered by `-p`, so tested with `claude plugin test` and by hand: the live card, the pane, the
line under an answer, and the `/inloop` command's output in the terminal.

## Limits that shape the code

| Limit | Value |
|---|---|
| A hook's own time | 10 s |
| `$.fs.read` and `$.fs.write` | 4 MiB per file |
| `$.process.run` | 30 s by default, 600 s at most; output cut at 4 MiB (`isStdoutTruncated`) |
| `$.store` | 4 MiB of JSON in total |
| Tree text | 100,000 characters |
