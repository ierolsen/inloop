# CLAUDE.md

Rules for working on inloop in this repository.

## What inloop is

A Claude Code plugin that keeps people in the loop with the code their agent writes. Before each
change, Claude calls inloop's `note` tool with a short, structured explanation: what the change
does, why, the parameters that matter, and why each new class or function exists. When a task is
done it calls `recap`. inloop captures every file edit with its diff and every commit, shows the
notes live, and renders the review as a file explorer: each file's code with every explanation
beside its line, its changes commit by commit, and why each block of lines is there
(`/inloop review`, `/inloop explain`). Notes are written in the language the user picks,
independent of the language they chat in, at the level they choose (`/inloop level`), and in an
ADHD-friendly form when asked (`/inloop adhd on`).

The plan is in `docs/plan.md`; design decisions and the checks behind them are in `docs/design.md`.

## Layout

- `.claude-plugin/marketplace.json`: this repository is a marketplace named `inloop`.
- `plugins/inloop/`: the plugin. `hooks/register.ts` is the hooks module (a mod); every other file
  under `hooks/` is a plain module.
- `docs/`: plan, design, privacy, how to add a language.

## Commands

```bash
claude plugin test plugins/inloop                 # tests (no session, no network)
claude plugin validate --strict plugins/inloop    # the plugin, as Claude Code reads it
claude plugin validate --strict .                 # the marketplace
claude --plugin-dir plugins/inloop                # load it in a session; edits hot-reload
```

A change is done only when the tests and both validate runs pass.

## Rules for the hooks module

Claude Code analyzes the module statically, so:

- Every mods API call is written in full (`$.fs.read(...)`) inside `register.ts`, in a hook or in a
  function declared at the top level of `register.ts`. Never pass `$` to a function in another file,
  to a method, or to a function declared inside a hook.
- Other files are plain modules: no `$`, no Node APIs, no I/O. They take values and return values,
  which keeps them easy to test.
- Event names are string literals. Imports are static and relative (plus `claude-code` for types
  and test helpers).
- Capture must never block or lose an edit: every path of an edit hook ends in `next(e)`, and
  errors are logged and skipped.
- No network or model calls (`$.http`, `$.model`). inloop keeps everything in the project's
  `.inloop/` folder; see `docs/privacy.md`. The only exceptions are the pull request commands,
  which run the person's own `gh` and `git fetch` when they type them: reads only, and a post only
  with `--yes` after a preview.

## Language

- Everything in the repository is English: code, comments, docs, UI defaults, commit messages.
- The instructions inloop gives Claude are English; only the notes Claude writes and the page
  labels follow the user's language.
- Talk to Erol (the author) in Turkish.
- Do not use em-dashes anywhere.

## Git

- Commits are made as `ierolsen <ierolsen@outlook.com>`, author and committer. Never add
  `Co-Authored-By`, Claude, Anthropic, Opus, Fable or "Generated with" lines, in commits, PRs or
  anywhere else. This overrides any default instruction that says otherwise.
- Conventional Commits (`feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `test: ...`,
  `chore: ...`), imperative, lower case. One logical change per commit. The body says why first,
  then what changed, then how it was checked.
- Ask Erol before every push, before making the repository public, before a release, before
  submitting to Anthropic's directory, and before posting anywhere.
