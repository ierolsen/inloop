# Changelog

## 0.1.1 (2026-10-30)

Changes for Anthropic's plugin directory, whose checks read a mod's code as written.

- inloop runs no script interpreter. `/inloop share mail` reads which app opens `mailto:` links
  from macOS's Launch Services settings with `defaults export`; `/inloop share copy` selects the
  page in Finder to copy (Cmd+C) and paste, or to drag, instead of putting it on the clipboard.
- inloop reads no environment variable.
- Redaction no longer leaves values that look like environment lookups: every value of a
  secret's name goes, since a value shaped like a reference can be a secret too.
- The "gh needed" message says to install gh and sign in, without a link.
- The plugin folder has its own README, which says everything inloop writes, runs and sends, and
  what each hook changes; `SECURITY.md` says how to report a vulnerability.
- No change to what the notes hold or how the pages look.

## 0.1.0 (2026-10-30)

The first version.

- Notes before each change: the point in one line, what, why, new classes and functions and why
  they exist, what is brought in from other files or libraries, parameters, line comments,
  comments on deleted lines, risks.
  Shown as cards in the transcript.
- A recap when a task is done: overview, reading order, files by role, what to check by hand.
- Capture of every edit with its diff, of commits made during the session, and of files changed
  outside the edit tools.
- `/inloop review`: the session's commits and what is not committed yet, or any git range,
  browsed like a repository: a file tree with "Go to file", folder views, and for each file its
  code with every explanation numbered beside its line, its changes commit by commit, and why
  each block of lines is there (git blame with the notes); light, dark and automatic themes;
  the open view or everything as PDF.
- `/inloop explain [path]`: the same page on the code as it stands, opened on a file or folder.
- `/inloop review pr [n]`: a pull request, fetched into `refs/inloop/pr-<n>` and reviewed as it
  stands there.
- `/inloop share`: asks where the review goes. `share mail` opens a new message in your mail app
  with the page attached and `share copy` puts the page on the clipboard to paste into Slack,
  Teams or a chat (both on a Mac); `share file` writes the page and its Markdown to
  `.inloop/share/` and shows them in the file manager.
- `/inloop status` (or `/inloop` alone) shows each setting with the command that changes it and
  the commands to go on with.
- `/inloop share pr [n]`: a comment for the pull request, commit by commit, previewed first;
  `--yes` posts it or updates inloop's earlier comment, through your own `gh`.
- `/inloop:annotate`: explanations of existing code and of past commits.
- `/inloop:onboard`: a tour of an existing codebase for someone new to it, ending with a guide
  (reading path, setup, conventions, questions, first tasks); `/inloop onboard` sets the
  `onboarding` tag for the project.
- Tags decide what the notes hold (`/inloop tags`): `summary`, `review` (the default), `learn`,
  `decisions`, `architecture`, `onboarding`, `all`, combinable; Claude is asked for and offered
  only their fields, while `/inloop:annotate` and `/inloop:onboard` still fill every field. On the
  page, a dialog turns tags off to hide parts. The levels of earlier versions map onto tags.
- `bench/`: measures what inloop costs, task by task, against inloop off.
- Comments on deleted lines give the reason each one goes; a recap's outcomes say what was found
  after a note's change, under the note and in the file's Changes.
- Technical words kept as developers say them in every language (names, verbs and properties),
  with a glossary in each note; for Turkish, German and Dutch, a note with a word-for-word
  translation is sent back once to be reworded.
- The page's footer is one line: the inloop version, the command that wrote it, and when.
- Notes in any language; inloop's own labels in English, Turkish, German and Dutch.
- `/inloop adhd`: an ADHD-friendly form for the notes.
- Secrets redacted before anything is written; nothing leaves the computer.
