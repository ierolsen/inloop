# Privacy

inloop keeps a record of the work Claude does in your project, so you can review it. This page
says what is recorded, where it stays, and what never leaves your computer.

## What inloop records

- **Notes and recaps** Claude writes through inloop's `note` and `recap` tools.
- **Edits** Claude makes with its edit tools: the file's path and a diff of the change.
- **Commits** made during the session: hash, parents, subject, files, and which edits and notes
  went into them.
- **Files changed outside the edit tools** since the session began (for example by a shell
  command), found through `git status` and `git diff`, with their diffs.
- **The session's settings**: the language and form of the notes and the plugin version.

## Where it stays

Everything is written to `.inloop/` in the project: the record in `.inloop/log/`, one file per
session, and the review pages in `.inloop/review/`. The folder holds its own `.gitignore` with
`*`, so nothing in it is committed unless you change that. Deleting the folder deletes everything
inloop recorded. A session that records nothing writes nothing.

Your choice of language, detail and form across projects is kept in the plugin's own store in
Claude Code (`/inloop lang`, `/inloop detail`, `/inloop adhd`); a project's choice is kept in
`.inloop/config.json`.

## What never leaves your computer

inloop makes no network requests and calls no model. The mods API lists every call a plugin makes,
and `claude plugin validate plugins/inloop` prints inloop's: files, processes (`git` and the
command that opens a page in your browser), the session, the plugin store and the user interface.

The review page is a single HTML file. It loads no fonts, scripts, images or styles from
anywhere, and its Content-Security-Policy forbids it to.

The notes themselves are written by Claude in your session, as part of the conversation you are
already having, so they go wherever that conversation goes.

## Secrets

- Before anything is written, inloop redacts values that look like secrets: private key blocks,
  GitHub, GitLab, Slack, Stripe, AWS, Google, npm and Hugging Face tokens, `sk-` style API keys,
  JSON web tokens, and assignments such as `password = "..."` or `API_KEY=...`. The name stays;
  the value becomes `[redacted]`.
- Files that usually hold secrets (`.env` and its variants except examples, `*.pem`, `*.key`,
  `id_rsa` and friends, `credentials`, `secrets.*`, `.npmrc`, `.netrc`) are recorded by name only:
  their content is never read into the record or onto the page.
- Diffs read from git for the review go through the same redaction.

Redaction works by pattern, so it can miss a secret in an unusual shape. Keep secrets out of the
code Claude edits, as you would anyway.
