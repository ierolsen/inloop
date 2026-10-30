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

## What it runs and what it sends

- It records notes, edits and recaps in `.inloop/` in your project, which keeps itself out of
  git with its own `.gitignore`. Secrets are redacted before anything is written.
- It runs `git` to read commits and diffs, and `gh` only for the pull request commands. The only
  command that posts anything is `/inloop share pr --yes`, typed by you: a comment on your pull
  request, through your own `gh` login.
- It opens pages with `open` (macOS), `xdg-open` (Linux) or `start` (Windows). On a Mac,
  `/inloop share mail` reads which app opens `mailto:` links (`plutil` on macOS's Launch
  Services settings) and hands the page to that app with `open -b`, and `/inloop share copy`
  puts the page on the clipboard with `osascript`. You choose who gets it and send it.
- It makes no network requests and no model calls of its own. Claude writes the notes in your
  session, so they cost output tokens; `/inloop tags summary` keeps them short.

The details are in [docs/privacy.md](https://github.com/ierolsen/inloop/blob/main/docs/privacy.md).

## License

MIT
