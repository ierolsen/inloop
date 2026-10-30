# Changelog

## 0.1.0 (unreleased)

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
