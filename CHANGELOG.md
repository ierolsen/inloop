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
- `/inloop share`: the page and its Markdown in `.inloop/share/`, shown in the file manager to
  attach to an email.
- `/inloop share pr [n]`: a comment for the pull request, commit by commit, previewed first;
  `--yes` posts it or updates inloop's earlier comment, through your own `gh`.
- `/inloop:annotate`: explanations of existing code and of past commits.
- Five levels of explanation (`/inloop level`), from `full` to `big-picture`; the page can hide
  detail down to the big picture.
- Technical words kept as developers say them in every language (names, verbs and properties),
  with a glossary in each note; for Turkish, German and Dutch, a note with a word-for-word
  translation is sent back once to be reworded.
- The page's footer is one line: the inloop version, the command that wrote it, and when.
- Notes in any language; inloop's own labels in English, Turkish, German and Dutch.
- `/inloop adhd`: an ADHD-friendly form for the notes.
- Secrets redacted before anything is written; nothing leaves the computer.
