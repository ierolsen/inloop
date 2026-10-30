# inloop plan

## Changes since this plan (30 Oct 2026)

The first look at the review page (29 Oct) showed that it was organized around inloop's own units,
sessions and tasks, with the code folded away. These changes followed:

- **The review is commit by commit** (`/inloop review [range | all]`): each commit's reason, then
  each file's code from git with the explanations numbered beside their lines. It replaces the
  session pages and `/inloop open`.
- **Notes say more about the code:** `tldr` (the point in one line), `uses` (what is brought in
  from other files or libraries, from where and why), `lines` (comments anchored by a piece of the
  line they explain) and `commit` (for explanations written afterwards).
- **Commits are tracked** after every shell command and at the end of each turn.
- **ADHD-friendly notes** (`/inloop adhd on`): a writing form, separate from the detail level.
- **Theme and export:** an automatic, light or dark page, `--theme` for a fixed one, print to PDF.
- **The pane is dropped:** the cards and Claude Code's own edit rows cover watching live, and the
  review covers reading calmly.

The sections below are the plan as it was approved on 29 Oct.

## Why

Coding agents write code faster than people can follow. It is hard to say what a change does line
by line, why a class or function was created, or why a parameter has the value it has, and the
"why" exists only at the moment the agent decides. Asked later, the agent can only reconstruct it.

inloop keeps the human in the loop. While Claude writes code, it records a short, structured
explanation of every change in the language the user picks, shows it live, and turns it into a
review page the user can open at any time. A later phase extends it to large and unfamiliar
codebases.

## v0.1

**Flow:**
1. Claude decides on a change and calls the `note` tool with a structured explanation.
2. Claude edits files. inloop captures each edit with its diff and attaches it to the note.
3. The note shows live: as a card in the transcript and in a pane.
4. Everything is appended to the session's log in `.inloop/`.
5. When a task is done, Claude calls `recap`.
6. `/inloop open` renders a self-contained HTML review page and opens it in the browser.

| Part | What it does |
|---|---|
| Instructions | While inloop is on, a system-prompt section tells Claude to call `note` before each logical change and `recap` when a task is done, in the chosen language and detail level, and to prefer the edit tools over shell commands for file changes. The text depends only on the settings, so the prompt cache stays valid |
| `note` tool | `title`, `files`, `what`, `why`, `basis` (`verified` or `judgment`), `alternatives`, `parameters` (`name`, `meaning`, `default`, `why_this_value`, `doc_url`), `symbols` (`name`, `kind`, `file`, `why_exists`, `why_this_shape`, `called_by`), `risks`. Keys are English; values are in the user's language, code identifiers unchanged |
| `recap` tool | `overview`, `reading_order` (file and why to read it at that point), `groups` (files by role), `check_by_hand` |
| Edit capture | Edit, Write, MultiEdit and NotebookEdit calls, with the file's content before and after, as a unified diff attached to the right note; edits without a note are listed as unexplained. Never blocks or loses an edit |
| Outside changes | A git baseline at session start; working-tree changes the log does not account for (shell commands, other tools) are listed with their diffs |
| Live view | Each note as a card in the transcript; `/inloop pane` steps through notes and diffs |
| `/inloop` command | `open`, `pane`, `on`, `off`, `lang`, `detail`, `status`, `help`. Runs without a model turn |
| Review page | Summary and reading order from `recap` (or a fixed order when there is none); each note beside the code it covers; new classes and functions with why each exists; unexplained and outside changes; subagent work grouped; things to check by hand. Labels in the user's language |
| `/inloop:explain` | For code without live notes: Claude explains files, functions or a commit range through the same `note` tool, marked `reconstructed` |

**Detail levels:**
- `brief`: what and why.
- `standard`: also non-obvious parameters and why each new class or function exists.
- `deep`: also every parameter, with an official documentation link for each, never invented.

**Language:**
- Precedence: project override in `.inloop/config.json`, then the user's choice across projects,
  then the plugin setting, then English.
- Names and codes are both accepted.
- Notes can be in any language.
- Page labels ship in English, Turkish, German and Dutch. Other languages fall back to English
  labels.

**Privacy:**
- Everything stays in `.inloop/`, which ignores itself in git.
- Secrets are redacted before anything is written.
- No network and no model calls.

## Milestones

1. Scaffold, and checks of the mod API calls inloop depends on (`docs/design.md`).
2. Engine: settings, instructions, `note`, `recap`, edit capture, outside changes, redaction, log.
3. Review page, languages, `/inloop` commands.
4. Live card and pane; `/inloop:explain`.
5. Docs, validation, end-to-end checks, `v0.1.0`.

## Later

- **`/inloop map`:** a zoomable map of a codebase. A one-page overview, modules, key flows traced
  through the code, and single symbols on demand. Ranked by entry points, references and git
  churn, and cached per file.
- **`/inloop why <symbol>`:** why a piece of code exists. It searches inloop notes, shared agent
  transcripts, git history and pull request discussions, docs and tests, and labels every answer
  as recorded (with its source) or inferred.
- **`/inloop share`:** commit curated notes so teammates inherit the reasons.
- **Also:** capture of shell-made changes, Windows checks, more languages.
