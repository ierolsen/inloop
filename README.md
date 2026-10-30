# inloop

Stay in the loop with the code your agent writes.

inloop is a Claude Code plugin. Before each change, Claude explains it in a short, structured
note: the point in one line, what the change does, why, why each new class or function exists,
what it brings in from other files or libraries, and the parameters that matter. You read the
notes live while Claude works, and afterwards as a review of your commits with every explanation
next to the line of code it explains. In your language, and in an ADHD-friendly form if you want.

![A review: each commit's code with the explanations beside it](docs/review.png)

## What you get

- **Notes while Claude works.** Each note appears in the transcript as a card, right above the
  edit it explains.
- **A review, commit by commit.** `/inloop review` opens a page in your browser: the commits of
  this session, then what is not committed yet. For each commit, the reason first, then each
  file's code with numbered explanations beside the lines they are about.
- **Line by line.** Comments on the lines a reader would stop at, the class and function cards at
  the line that defines them, and what was imported from elsewhere at the import, with links
  between files.
- **Any commits, any time.** `/inloop review main..` for a branch, `/inloop review HEAD~10..` for
  the last ten commits, `/inloop review a1b2c3d` for one.
- **Code you did not watch being written.** `/inloop:explain` explains existing code, a folder, or
  a range of commits after the fact, in the same format, marked as explained afterwards.
- **In your language.** Notes are written in the language you choose, whatever language you chat
  in. inloop's own labels are in English, Turkish, German and Dutch.
- **ADHD-friendly, on request.** `/inloop adhd on`: the point first, short lines, bold key words,
  and every term, symbol and parameter explained with an example from the code.

## Install

Requires Claude Code 2.1.287 or later.

In Claude Code:

```
/plugin install inloop --marketplace ierolsen/inloop
```

Or from a shell:

```bash
claude plugin marketplace add ierolsen/inloop
claude plugin install inloop@inloop
```

To try it in one session without installing, clone this repository and run
`claude --plugin-dir path/to/inloop/plugins/inloop`.

## Commands

| Command | What it does |
|---|---|
| `/inloop review` | The review of this session: its commits, then what is not committed yet |
| `/inloop review <range>` | Any commits: `main..`, `HEAD~5..`, `a1b2c3d`; `all` for every commit inloop recorded |
| `/inloop review ... --theme light` | The page with a fixed theme, to share or print (`dark` also works) |
| `/inloop:explain <target>` | Claude explains existing code: a file, a folder, a function, a commit range |
| `/inloop lang <language>` | The language of the notes, for all your projects (`--project` for this one) |
| `/inloop detail <level>` | `brief`, `standard` or `deep`: how much the notes explain |
| `/inloop adhd on` | The ADHD-friendly form; `off` to go back |
| `/inloop on`, `/inloop off` | Ask Claude for notes in this session, or stop |
| `/inloop status` | What was recorded, and which settings are in effect |

The language, the detail level and the ADHD form can also be set in `/config`. A project's own
choice comes first, then yours across projects, then the plugin setting.

## How it works

inloop is a mod: TypeScript that runs inside Claude Code. It adds a short section to Claude's
instructions and gives Claude two tools, `note` and `recap`, which inloop answers itself, so they
never ask for permission. It records every edit Claude makes with its diff, watches `HEAD` after
shell commands to see which commits took which edits, and builds the review from that record and
from git.

Everything stays in your project's `.inloop/` folder, which keeps itself out of git. A session
that changes nothing writes nothing.

## Privacy

inloop makes no network requests and no model calls of its own. The notes are written by Claude
in your session, so they cost output tokens; `/inloop detail brief` or `/inloop off` keep that
down. Secrets are redacted before anything is written, and files that usually hold secrets, such
as `.env` files and keys, are recorded by name only. The review page is a single file that loads
nothing from the internet. See [docs/privacy.md](docs/privacy.md).

## Limits

- Claude Code only. The live cards, the capture and the review rely on Claude Code's plugin
  hooks; other Claude apps load skills only. Organizations can turn plugin mods off.
- Notes depend on Claude following inloop's instructions. Edits made without a note are marked as
  such, and files changed by shell commands are caught through git.
- A review shows up to 30 commits and counts the rest. A page over 3.8 MB leaves out the code of
  its longest files and says so.

## Development

See [CLAUDE.md](CLAUDE.md) for the rules and [docs/design.md](docs/design.md) for the design and the
checks behind it. Adding a language is one file: [docs/i18n.md](docs/i18n.md).

```bash
claude plugin test plugins/inloop
claude plugin validate --strict plugins/inloop
```

## License

MIT
