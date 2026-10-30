# Security

inloop runs inside Claude Code on your computer. It writes only to `.inloop/` in your project,
makes no network requests of its own, and posts only when you type `/inloop share pr --yes` (a
comment on your pull request, through your own `gh` login). [docs/privacy.md](docs/privacy.md)
says what it records, what it runs and what it redacts.

## Reporting a vulnerability

Please report a security issue privately: on GitHub, open the repository's Security tab and
choose "Report a vulnerability". Please do not open a public issue for it. Reports are answered
as soon as possible, and a fix comes as a new version, noted in the changelog.

Only the latest version gets security fixes.
