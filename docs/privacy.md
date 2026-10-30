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
session, the review pages in `.inloop/review/`, and what you share in `.inloop/share/`. The folder holds its own `.gitignore` with
`*`, so nothing in it is committed unless you change that. Deleting the folder deletes everything
inloop recorded. A session that records nothing writes nothing.

Your choice of language, tags and form across projects is kept in the plugin's own store in
Claude Code (`/inloop lang`, `/inloop tags`, `/inloop adhd`); a project's choice is kept in
`.inloop/config.json`.

## What leaves your computer, and when

inloop's own code makes no network requests and calls no model. The mods API lists every call a
plugin makes, and `claude plugin validate plugins/inloop` prints inloop's: files, processes (`git`,
`gh`, the command that opens a page or a folder, and on a Mac `defaults` for `/inloop share
mail`), the session, the plugin store and the user interface. inloop reads no environment
variables and runs no script or shell.

Only the pull request commands use the network, through your own `gh` and `git`:

- **`/inloop review pr [n]`** asks `gh` about the pull request and fetches it with `git fetch`
  into one reference of its own, `refs/inloop/pr-<n>`. It only reads.
- **`/inloop share pr [n]`** asks `gh` about the pull request and about inloop's earlier comment
  there, writes the comment it would post to `.inloop/share/pr-<n>.md`, and sends nothing.
  **`/inloop share pr [n] --yes`** posts that file's text as a comment, or replaces inloop's
  earlier comment, as you, with your `gh` login. It posts only when the pull request has not
  moved since the preview, so what you read is what is sent, and only when you typed the command
  at Claude Code's prompt: the same command from another plugin, a channel, a scheduled task or
  `claude -p` (which Claude itself could run from a shell) is refused.

Neither command ever waits for a password: `gh` and `git` run with their prompts turned off and
fail with a message instead.

`/inloop share` writes files on your computer and sends nothing itself. On a Mac,
`/inloop share mail` reads which app you chose for `mailto:` links from macOS's Launch Services
settings (`defaults export com.apple.LaunchServices/com.apple.launchservices.secure -`, Apple Mail
when you chose none) and hands the page to that app with `open -b`, as if you had dropped the file
on it: the app opens a new message with the page attached, and you choose who gets it and send it.
When that app is a browser (web mail), inloop only shows the file. `/inloop share copy` selects
the page in Finder, so you can copy it (Cmd+C) and paste it into Slack, Teams or a chat. Elsewhere
both show the file in your file manager instead. The review page is a single HTML file. It
loads no fonts, scripts, images or styles from anywhere, and its Content-Security-Policy forbids
it to. It holds the code of the files the review covers (up to 40), redacted as below, so send it
only to people who may see that code.

The notes themselves are written by Claude in your session, as part of the conversation you are
already having, so they go wherever that conversation goes.

## Secrets

- Before anything is written, inloop redacts values that look like secrets: private key blocks,
  GitHub, GitLab, Slack, Stripe, AWS, Google, npm and Hugging Face tokens, `sk-` style API keys,
  JSON web tokens, and assignments such as `password = "..."` or `API_KEY=...`. The name stays;
  the value becomes `[redacted]`, even when it only says where the secret is kept (such as
  `settings.API_KEY`), since a value of that shape can be a secret too.
- Files that usually hold secrets (`.env` and its variants except examples, `*.pem`, `*.key`,
  `id_rsa` and friends, `credentials`, `secrets.*`, `.npmrc`, `.netrc`) are recorded by name only:
  their content is never read into the record or onto the page.
- Diffs read from git for the review go through the same redaction.

Redaction works by pattern, so it can miss a secret in an unusual shape. Keep secrets out of the
code Claude edits, as you would anyway.
