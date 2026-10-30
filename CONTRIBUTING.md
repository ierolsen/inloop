# Contributing

Thank you for helping. A few things make a change easy to take in.

- **Open an issue first** for anything larger than a fix, so we can agree on the shape before you
  spend time on it.
- **Run the checks.** A change is ready when these pass:

  ```bash
  claude plugin test plugins/inloop
  claude plugin validate --strict plugins/inloop
  claude plugin validate --strict .
  ```

- **Follow the hooks module's rules** in [CLAUDE.md](CLAUDE.md): every mods API call lives in
  `hooks/register.ts`, every other module is plain code that takes values and returns values, and
  an edit is never blocked or lost.
- **Keep inloop private.** No network requests and no model calls; see
  [docs/privacy.md](docs/privacy.md).
- **Write in English**, without em-dashes. Commit messages follow Conventional Commits:
  `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, with the reason first in the body.
- **Adding a language** is one file; see [docs/i18n.md](docs/i18n.md).
