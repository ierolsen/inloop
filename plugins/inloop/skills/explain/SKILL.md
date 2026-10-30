---
name: explain
description: Explain code that already exists as inloop notes, so it shows on the review page beside the notes Claude writes while changing code. For older code, a project someone else built, a commit range, or edits the review page lists without a note.
argument-hint: <file, folder, function, class or commit range>
disable-model-invocation: true
---

# Explain existing code with inloop

The user wants to understand this code, which already exists: $ARGUMENTS

If nothing is named, ask what to explain: a file, a folder, a function or class, a commit range,
or the edits the review page lists without a note.

Write what you find as inloop notes with the `mcp__inloop__note` tool, each with
`"source": "reconstructed"`, so they appear on the review page (`/inloop review`) and in the
transcript as cards. Do not change any file while explaining.

## Language

Write the notes in the language the inloop instructions in your system prompt name. When there
are no inloop instructions (inloop is off in this session), write them in ${user_config.language}.
Keep code, names and paths as they are in the code.

## What to explain

- **A file:** one note on the file as a whole (what it is for, where it sits in the project), then
  one note per class or function a reader needs to know.
- **A folder or a whole project:** first one note on the structure (the parts and how they talk
  to each other), then the entry points, then the files a newcomer should read first. Leave out
  generated code, vendored code and small helpers. Stop at about 15 notes and say in the recap
  what you left out, so the user can ask for it.
- **A function or class:** one note, with every parameter worth explaining and what calls it.
- **A commit range** (for example `HEAD~5..HEAD`, or a branch name): read `git log` and `git show`
  for the range and write one note per commit, oldest first, with `commit` set to that commit's
  hash, so the review shows the note beside that commit's code (`/inloop review HEAD~5..`).
- **Edits without a note:** read them from the newest log in `.inloop/log/`, and write one note
  per edit from its diff and the code around it.

Read before you write: open the code, search for callers, read the tests and the docs that
mention it. A note that guesses where it could have looked is worse than no note.

## How to fill each note

- `title`: what the code is, in a few words.
- `tldr`: the one thing to remember about it, in one short sentence.
- `files`: the files the note covers, relative to the project.
- `what`: what the code does, for a reader who did not write it.
- `why`: why it is built this way. For code you did not write, the reason is usually an
  inference: say so ("likely", "probably") and name the evidence you see.
- `basis`: `verified` only when a commit message, a comment, a document or a test states the
  reason, and then name that source in `why` (for example "the message of commit a1b2c3d says
  ..."). Everything else is `judgment`.
- `symbols`: each class, function, method, endpoint or type the note covers, with `why_exists`,
  `why_this_shape`, and `called_by` from a search of the code, never from a guess.
- `uses`: what the code brings in from other files or libraries: `name`, `from` (the file or the
  package) and `why` it is used here; for a library, why this one.
- `parameters`: arguments and settings whose meaning or value is not obvious. Give `doc_url` only
  for an official documentation page you know.
- `lines`: comments on the lines a reader would stop at, each with `anchor` (text copied exactly
  from that line) and `says`. The review shows them numbered beside the code.
- `risks`: what looks fragile or surprising, or is worth checking by hand.
- `source`: always `"reconstructed"`.

Never put secrets, tokens or passwords in a note, even when the code holds them.

## Finish

Call `mcp__inloop__recap` once: an overview, the order to read the files in and why, the files
grouped by role, and what the user should check by hand. Then tell the user that `/inloop review`
shows the notes beside the code (`/inloop review <range>` for the commits you explained).
