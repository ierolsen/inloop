---
name: onboard
description: Onboard a developer who is new to this codebase. Claude reads the project, without changing it, and walks the person through it as inloop notes and a guide - what the system does, its parts, its main flows from entry point to end, the files to read in order, how to run and test it, its conventions, its domain terms, questions to check understanding and first tasks - shown with /inloop explain.
argument-hint: [folder or file to focus on]
disable-model-invocation: true
---

# Onboard onto this codebase with inloop

The user has just joined the team that owns this code and has to work in it. Your job is to take
them from knowing nothing about it to being able to make a first change safely. Focus: $ARGUMENTS
(when nothing is named, the whole project).

Write everything as inloop notes (`mcp__inloop__note`, each with `"source": "reconstructed"`) and
end with one guide (`mcp__inloop__recap`). They appear in the transcript as cards and in
`/inloop explain`, where each note sits beside the code it explains. Do not change any file.

## Language

Write in the language the inloop instructions in your system prompt name; when there are none,
in ${user_config.language}. Write like a developer who speaks that language explaining code to a
new colleague: its sentences, every technical word in the form developers use, which is usually
English, and the domain's own words explained in `terms`. Keep code, names and paths exactly as
they are.

## 1. Read before you write

Read in this order, and keep reading until you could explain the project to someone else:

1. The README and the docs folder, if any.
2. The files that define how the project is built and run: package manifests (`package.json`,
   `pyproject.toml`, `go.mod`, `Cargo.toml`, ...), `Makefile`, `Dockerfile`, compose files, CI
   workflows, environment examples (`.env.example`; never open a real `.env`).
3. The folder structure, two or three levels deep, leaving out dependencies, build output and
   generated code.
4. The entry points: the main module, the server start, the CLI, the job runner, the routes.
5. From each entry point, the flow through the code to where the work is done: follow the calls.
6. The tests: they show what the code is supposed to do and how it is used.
7. `git log --oneline -30` and the authors' commit messages, for how the team works.

A note that guesses where it could have looked is worse than no note. When a reason is your
inference, say so and name what you saw.

## 2. Notes, in the order a newcomer needs them

Write at most 20 notes; on a large project, cover the parts that matter most and name the rest in
the guide. When a folder or file is named, stay inside it and say how it connects to the rest.

1. **The project as a whole** (one note, `files` the entry points): what the system does and for
   whom, its main parts, and how they talk to each other. Put the parts and what depends on what
   in `impact`.
2. **Each main flow** (one note each, three to six in all): a request, a job, a command, a message,
   traced from its entry point to its end. `files` lists every file it passes through, `uses` names
   each hop (what is called, from where, why), `lines` marks the line where each step happens.
3. **Each key module or file** a newcomer must know: what it is for, its classes and functions
   (`symbols`, with `called_by` from a search, never a guess), its settings (`parameters`), the
   conventions it shows, and what to watch out for (`risks`).

In every note, `terms` explains the words a newcomer will not know: the domain's words (business
terms, abbreviations the team uses) as well as technical ones. `basis` is `verified` only when a
document, a comment, a commit message or a test states the reason.

## 3. The guide

Call `mcp__inloop__recap` once, at the end, with:

- `overview`: the project in a few sentences, as you would say it on someone's first day.
- `reading_order`: the learning path, file by file, each with why to read it at that point. Start
  from the entry point, follow the main flow, end with the parts a newcomer will touch first.
- `groups`: the files grouped by the part of the system they belong to.
- `setup`: how to install, configure, run, test and debug the project, one step each with its
  command, as the repository shows it (do not invent commands; say where you found each one).
- `conventions`: the rules the code follows: naming, structure, error handling, logging, tests,
  commit messages, branches.
- `questions`: five to ten questions a newcomer answers to check they understood, each with its
  answer pointing to the files (for example "What happens when X fails?").
- `first_tasks`: three to five small, safe changes to make first, each touching a main part of the
  code, with the files to change.
- `check_by_hand`: what you could not find out from the code and the person should ask the team.

Never put secrets, tokens or passwords in a note or the guide, even when the code holds them.

## Finish

Tell the user, in one or two sentences, that `/inloop explain` opens the guide: the overview, the
reading path, setup, conventions, the questions and first tasks, and every note beside its code;
and that `/inloop onboard` makes inloop explain each later change for someone new to the codebase.
