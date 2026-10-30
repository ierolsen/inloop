# inloop

Stay in the loop with the code your agent writes. Before each change, Claude explains it in a
short, structured note: the point in one line, what the change does, why, why each new class or
function exists, and the parameters that matter. You read the notes live while Claude works, and
afterwards on a review page that browses the code like a repository, with every explanation next
to the line it explains, in the language you choose.

The full guide, a screenshot and what inloop costs are in the repository:
https://github.com/ierolsen/inloop

## Install

In Claude Code:

```
/plugin install inloop --marketplace ierolsen/inloop
```

inloop is a Claude Code plugin built as a mod (a hooks module). It works in Claude Code 2.1.287
or later, in the terminal and the desktop app; it does not load on claude.ai or in Cowork.

## Examples

1. **Follow a change while Claude makes it.** Ask Claude, for example: "Add an
   `income_per_room` feature to `housing/features.py`, with a test." Before each edit a note
   card appears in the transcript: what the change does, why, and why the new function exists.
   When the task is done, `/inloop review` opens the work in your browser, each explanation
   beside the line it explains.
2. **Review a pull request.** `/inloop review pr 12` fetches pull request 12 and opens it commit
   by commit. `/inloop share pr 12` shows the comment it would post; `/inloop share pr 12 --yes`
   posts it through your own `gh` login.
3. **Learn a codebase you just joined.** `/inloop:onboard` has Claude read the project without
   changing it and write a tour: the main flows, the files to read in order, setup, conventions,
   questions to check your understanding and first tasks. `/inloop explain` opens it.
4. **Understand code you did not watch being written.** `/inloop:annotate housing/model.py`
   explains an existing file; `/inloop explain housing/model.py` shows the explanations beside
   the code.

## Commands

| Command | What it does |
|---|---|
| `/inloop` | What inloop does now, each setting with the command that changes it |
| `/inloop review [range]` | The work of this session, or of any commits, in your browser |
| `/inloop explain [path]` | The code as it stands, with every explanation inloop has |
| `/inloop share` | Asks where a review goes: e-mail, Slack or Teams, a pull request, or a file |
| `/inloop tags <tag,...>` | What the notes hold: `summary`, `review` (the default), `learn`, `decisions`, `architecture`, `onboarding`, `all` |
| `/inloop lang <language>` | The language of the notes and pages |
| `/inloop adhd on` | Notes in an ADHD-friendly form |
| `/inloop on`, `/inloop off` | Ask Claude for notes in this session, or stop |
| `/inloop:annotate <target>` | Claude explains code that already exists |
| `/inloop:onboard [folder]` | Claude walks someone new through the codebase |

## What inloop does on your computer

### Files it writes

Notes and diffs are copies of your code changes, so if your code holds personal data such as
names or e-mail addresses, the copies do too. They stay on your computer.

Only inside `.inloop/` in your project: the session logs (`.inloop/log/`), the review pages
(`.inloop/review/`), what you share (`.inloop/share/`), the project's own settings
(`.inloop/config.json`) and `.inloop/.gitignore`, which keeps the folder out of git. The paths are
built from the project's root, which is why they are not fixed text in the code. inloop never
writes build, start-up, settings or instruction files. Your settings for all projects are kept in
Claude Code's plugin store.

### Programs it runs, and why

| Program | When | Why |
|---|---|---|
| `git` (`rev-parse`, `status`, `diff`, `show`, `log`, `rev-list`, `diff-tree`, `ls-files`, `blame`) | While you work, and for the review pages | To see what changed, in which commit, and which commit wrote each line |
| `git fetch <remote> +refs/pull/<n>/head:refs/inloop/pr-<n>` | `/inloop review pr` | To review a pull request; it writes only that one reference |
| `gh` (`--version`, `pr view`, `api`) | `/inloop review pr`, `/inloop share pr` | To read the pull request and inloop's earlier comment on it; with `--yes`, to post or update that comment |
| `uname -s` | Before opening a page | To tell a Mac from Linux |
| `open`, `xdg-open`, `cmd /c start`, `explorer` | `/inloop review`, `explain`, `share` | To show a page in your browser, or a file in your file manager |
| `defaults export com.apple.LaunchServices/com.apple.launchservices.secure -` | `/inloop share mail`, on a Mac | To read which app you chose for `mailto:` links (Apple Mail when none) |
| `open -b <mail app> <page>` | `/inloop share mail`, on a Mac | To start a new message in your mail app with the page attached |

The file names and arguments in these commands come from your project, which is why they are not
fixed text in the code. inloop runs no shell, no script interpreter and no downloader, and `git`
and `gh` run with their password prompts turned off.

### What leaves your computer

Nothing, unless you ask for it:

- `/inloop review pr` and `/inloop share pr` read a pull request from GitHub through your own
  `gh` and `git`.
- `/inloop share pr --yes`, typed by you at Claude Code's prompt, posts the review as a comment
  on your pull request, through your own `gh` login.
- `/inloop share mail` and `share copy` only hand the page to your mail app or show it in your
  file manager; you choose who gets it and send it.

inloop reads no credentials and no environment variables; `gh` and `git` use their own logins.
It sends nothing from the conversation anywhere: it reads Claude's tool calls to record what
changed, counts the notes and edits when a turn ends, and keeps all of it on your disk. Secrets
are redacted before anything is written.

### Hooks, and what each one changes

- `session.start`: finds the project, reads the settings, and registers inloop's two tools and
  its `/inloop` command.
- `prompt.compose`: adds one section, inloop's instructions, to the system prompt.
- `tool.describe`: keeps inloop's two tools loaded rather than behind tool search.
- `tool.call` on `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Bash` and `PowerShell`: records
  the change, then lets the tool run as it would without inloop.
- `tool.call` on `mcp__inloop__note` and `mcp__inloop__recap`: inloop answers its own two tools,
  which have no other implementation: it saves the note or recap and replies that it did. It
  never answers in place of any other tool.
- `ui.render` on those two tools: draws the notes and recaps as cards in the transcript.
- `turn.start`, `turn.complete`: count what a turn recorded and show one line when it ends.
- `command.run`: the `/inloop` command.

## License

MIT
