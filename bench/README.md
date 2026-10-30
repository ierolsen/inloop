# What inloop costs

inloop asks Claude to write a note before each change. Those notes are text the model writes, so
they cost tokens and time. This folder measures how much, so the number can be stated plainly.

## Where the cost comes from

| Part | What it is | How it is billed |
|---|---|---|
| Instructions | inloop's section of the system prompt: about 700 tokens with `summary`, 1,000 with `review`, 1,300 with `all` | Sent with every request, read from the prompt cache after the first one |
| Tool definitions | the `note` and `recap` tools: about 1,300 tokens with `summary`, 1,500 with `review`, 1,900 with `all` | The same as the instructions |
| Notes and recaps | what Claude writes into them | Output tokens, the most expensive kind; grows with the size of the change |
| Behavior | with notes to write, Claude may read or check a little more | Included in the totals below |
| Send-backs | a note with a word-for-word translation of a term goes back once | Output tokens |

The review page, sharing, blame and the explorer are built on your computer without the model, so
they cost nothing.

Live notes cost by how much code changes, not by how large the codebase is. `/inloop:onboard` and
`/inloop:annotate` are different: they read code, so their cost grows with how much of the codebase
they read.

## How it is measured

`run.py` runs the same task from the same code with inloop off (not loaded) and with each tag, and
records:

- from Claude Code (`claude -p --output-format json`): the cost at list price, input, cache and
  output tokens, the number of turns, the time;
- from git: the lines the task changed;
- from the project: whether its tests pass, so that a cheaper run that broke something is seen;
- from inloop's log: the notes written and how much text they hold.

Each run starts from a fresh copy of a fixture project in a new git repository. The report compares
every run with inloop on against the runs of the same task with inloop off.

```bash
python3 bench/run.py --data <folder with cal_housing_py3.pkz> --venv <venv with pandas, scikit-learn, joblib, pytest> \
  --modes off,summary,review,all --repeats 3 --name <name>
```

Running it again with the same name resumes: runs that succeeded are kept. A run cut short by the
account's usage limit or an API error is left out of the report.

## Tasks

| Task | Kind | What Claude is asked |
|---|---|---|
| `add-feature` | adds code | add a feature to the model, with a test |
| `fix-bug` | debugging | the tests fail; find and fix the cause (a one-line bug) |
| `remove-feature` | removes code | remove a feature, its test and every use of it |
| `prune-features` | measures | measure each feature and remove the ones that do not help; on this fixture every feature helps, so nothing changes, which shows what inloop costs when no code changes |

All of them run on `fixtures/house-prices`, a small Python project (about 250 lines). The suite
should grow to other languages and larger projects before its numbers stand for codebases in
general.

## Reading the numbers

- A relative overhead (+X%) depends on what the session already costs, which depends on the other
  plugins and instructions installed. The absolute numbers (tokens and dollars per task) carry over
  better from one setup to another.
- The agent takes a different path on each run, so a single run per task is noisy. Results meant
  for publishing use at least three runs per task and mode and report medians.
- Costs are list prices as Claude Code reports them. On a subscription the same tokens count
  against the plan's usage limits instead.

Results are in `results/`, one folder per run of the suite, with every run in `runs.json` and the
tables in `report.md`. The `summary` and `review` runs in `results/2026-10-30-pilot` were measured
before the tools kept the item fields of the parts a tag leaves out, which added about 340 tokens
per request with `summary` and 200 with `review`, read from the cache.
