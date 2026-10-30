#!/usr/bin/env python3
"""What inloop costs: the same task, from the same code, with inloop off and at each level.

Each run copies a fixture project into a fresh git repository, runs one task with `claude -p`,
then records what Claude Code reports (cost, tokens, time, turns), what changed in git, whether the
project's tests pass, and the notes inloop logged. The report compares every run with inloop on
against the run of the same task with inloop off.

Usage:
  python3 bench/run.py --data DIR --venv DIR [--tasks add-feature,fix-bug] [--modes off,guided,full]
                       [--repeats 1] [--concurrency 3] [--max-cost 4] [--name pilot] [--model MODEL]

--data is a folder holding scikit-learn's California housing cache (cal_housing_py3.pkz), and
--venv a Python virtual environment with pandas, scikit-learn, joblib and pytest. Standard library
only.
"""

import argparse
import concurrent.futures
import datetime
import json
import os
import shutil
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN = HERE.parent / 'plugins' / 'inloop'
LIMIT_WORDS = ('hit your session limit', 'usage limit', 'rate limit', 'credit balance is too low')
stop = threading.Event()  # set when the account runs out: the runs not started yet are skipped


def run(argv, cwd, timeout=120, check=False):
    return subprocess.run(argv, cwd=cwd, capture_output=True, text=True, timeout=timeout, check=check, stdin=subprocess.DEVNULL)


def last_json(text):
    """The JSON object claude -p prints last (its result), or None."""
    end = text.rfind('}')
    while end > 0:
        start = text.rfind('\n{', 0, end)
        start = 0 if start < 0 else start + 1
        try:
            return json.loads(text[start:end + 1])
        except ValueError:
            end = text.rfind('}', 0, start)
    return None


def prepare(task, fixture, mode, args):
    """A fresh git repository with the fixture, the task's setup committed, and inloop's level set."""
    work = Path(tempfile.mkdtemp(prefix='inloop-bench-'))
    shutil.copytree(HERE / 'fixtures' / task['fixture'], work, dirs_exist_ok=True)
    os.symlink(args.venv, work / '.venv')
    os.symlink(args.data, work / 'data')
    run(['git', 'init', '-q', '-b', 'main'], work, check=True)
    (work / '.git' / 'info' / 'exclude').write_text('.venv\ndata\nmodels\n')
    for key, value in (('user.name', 'bench'), ('user.email', 'bench@example.invalid'), ('commit.gpgsign', 'false')):
        run(['git', 'config', key, value], work, check=True)
    run(['git', 'add', '-A'], work, check=True)
    run(['git', 'commit', '-q', '-m', 'chore: fixture'], work, check=True)
    for step in task.get('setup', []):
        run(step, work, check=True)
    if run(['git', 'status', '--porcelain'], work).stdout.strip():
        run(['git', 'commit', '-q', '-am', 'chore: task setup'], work, check=True)
    base = run(['git', 'rev-parse', 'HEAD'], work, check=True).stdout.strip()
    if mode != 'off':
        (work / '.inloop').mkdir()
        (work / '.inloop' / '.gitignore').write_text('*\n')
        (work / '.inloop' / 'config.json').write_text(json.dumps({'language': 'en', 'level': mode}) + '\n')
    return work, base


def logged(work):
    """What inloop recorded: notes and recaps, and how much text Claude wrote into them."""
    out = {'notes': 0, 'note_chars': 0, 'recaps': 0, 'recap_chars': 0, 'edits': 0, 'unexplained': 0}
    for log in (work / '.inloop' / 'log').glob('*.jsonl') if (work / '.inloop' / 'log').exists() else []:
        for line in log.read_text().splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get('kind') == 'note':
                out['notes'] += 1
                out['note_chars'] += len(json.dumps(r.get('note', {}), ensure_ascii=False))
            elif r.get('kind') == 'recap':
                out['recaps'] += 1
                out['recap_chars'] += len(json.dumps(r.get('recap', {}), ensure_ascii=False))
            elif r.get('kind') == 'edit' and r.get('status') == 'ok':
                out['edits'] += 1
                out['unexplained'] += 0 if r.get('note') else 1
    return out


def one(task, fixture, mode, repeat, tools, args):
    if stop.is_set():
        return None
    work, base = prepare(task, fixture, mode, args)
    argv = ['claude', '-p', task['prompt'], '--output-format', 'json', '--permission-mode', 'acceptEdits',
            '--max-budget-usd', str(args.max_cost), '--allowedTools', *tools]
    if mode != 'off':
        argv += ['--plugin-dir', str(PLUGIN)]
    if args.model:
        argv += ['--model', args.model]
    started = time.time()
    try:
        done = run(argv, work, timeout=args.timeout)
        text = done.stdout + done.stderr
    except subprocess.TimeoutExpired as err:
        text = (err.stdout or '') if isinstance(err.stdout, str) else ''
    wall = time.time() - started
    result = last_json(text) or {}
    limited = any(w in text.lower() for w in LIMIT_WORDS)
    if limited:
        stop.set()
    usage = result.get('usage', {})
    tests = run(fixture['check'], work, timeout=300)
    shortstat = run(['git', 'diff', '--shortstat', base, 'HEAD'], work).stdout.strip()
    numbers = [int(w) for w in shortstat.replace(',', ' ').split() if w.isdigit()]
    commits = run(['git', 'rev-list', '--count', base + '..HEAD'], work).stdout.strip()
    row = {
        'task': task['id'], 'kind': task.get('kind', ''), 'mode': mode, 'repeat': repeat,
        'ok': bool(result) and not result.get('is_error') and not limited, 'stopped': 'usage limit' if limited else result.get('terminal_reason') or result.get('subtype'),
        'cost_usd': result.get('total_cost_usd'),
        'output_tokens': usage.get('output_tokens'), 'thinking_tokens': (usage.get('output_tokens_details') or {}).get('thinking_tokens'),
        'input_tokens': usage.get('input_tokens'), 'cache_write_tokens': usage.get('cache_creation_input_tokens'), 'cache_read_tokens': usage.get('cache_read_input_tokens'),
        'turns': result.get('num_turns'), 'seconds': round((result.get('duration_ms') or wall * 1000) / 1000, 1),
        'model': next(iter(result.get('modelUsage') or {}), None),
        'files_changed': numbers[0] if numbers else 0, 'lines_added': numbers[1] if len(numbers) > 1 else 0,
        'lines_removed': numbers[2] if len(numbers) > 2 else 0, 'commits': int(commits or 0),
        'tests_pass': tests.returncode == 0,
        **logged(work),
        # Claude's last answer, without the work folder's path, to read why a run went as it did
        'answer': (result.get('result') or text[-400:]).replace(str(work), '<work>')[:800],
    }
    if not args.keep:
        shutil.rmtree(work, ignore_errors=True)
    print(f"  {task['id']:<16} {mode:<9} #{repeat}  ${row['cost_usd'] or 0:.3f}  out {row['output_tokens'] or 0:>6}  "
          f"{row['seconds']:>6}s  notes {row['notes']}  tests {'pass' if row['tests_pass'] else 'FAIL'}", flush=True)
    return row


def pct(on, off):
    return None if not off else (on - off) / off * 100


def fmt_delta(on, off, unit=''):
    if on is None or off is None:
        return 'n/a'
    p = pct(on, off)
    d = on - off
    sign = '+' if d >= 0 else '-'
    absolute = (sign + '$' + f'{abs(d):.2f}') if unit == '$' else (sign + f'{abs(d):,.0f}' + unit)
    return (f'{p:+.0f}%' if p is not None else 'n/a') + ' (' + absolute + ')'


def report(rows, meta):
    rows = [r for r in rows if r['ok']]  # a run the account's limit or an API error cut short says nothing about inloop
    by = {}
    for r in rows:
        by.setdefault((r['task'], r['mode']), []).append(r)
    med = lambda rs, k: statistics.median([r[k] for r in rs if r.get(k) is not None]) if any(r.get(k) is not None for r in rs) else None
    tasks = list(dict.fromkeys(r['task'] for r in rows))
    modes = list(dict.fromkeys(r['mode'] for r in rows))
    out = ['# inloop cost benchmark: ' + meta['name'], '',
           f"{meta['date']} · Claude Code {meta['claude_code']} · inloop {meta['inloop']} · model {meta['model']} · "
           f"{meta['repeats']} run(s) per task and mode, medians shown · costs at list price as Claude Code reports them", '',
           '| Task | Mode | Cost | Output tokens | Input tokens (with cache) | Time | Turns | Notes | Lines changed | Tests |',
           '|---|---|---|---|---|---|---|---|---|---|']
    for t in tasks:
        for m in modes:
            rs = by.get((t, m), [])
            if not rs:
                continue
            inp = med([{'v': (r['input_tokens'] or 0) + (r['cache_write_tokens'] or 0) + (r['cache_read_tokens'] or 0)} for r in rs], 'v')
            out.append(f"| {t} | {m} | ${med(rs, 'cost_usd') or 0:.2f} | {med(rs, 'output_tokens') or 0:,.0f} | {inp or 0:,.0f} | "
                       f"{med(rs, 'seconds') or 0:.0f} s | {med(rs, 'turns') or 0:.0f} | {med(rs, 'notes') or 0:.0f} | "
                       f"+{med(rs, 'lines_added') or 0:.0f} / -{med(rs, 'lines_removed') or 0:.0f} | "
                       f"{sum(r['tests_pass'] for r in rs)}/{len(rs)} pass |")
    out += ['', '## What inloop adds, against the same task with inloop off', '',
            '| Task | Mode | Cost | Output tokens | Time | Notes text (about) |', '|---|---|---|---|---|---|']
    summary = {}
    for t in tasks:
        off = by.get((t, 'off'))
        if not off:
            continue
        for m in modes:
            if m == 'off' or not by.get((t, m)):
                continue
            on = by[(t, m)]
            notes_tokens = (med(on, 'note_chars') or 0) / 4 + (med(on, 'recap_chars') or 0) / 4
            out.append(f"| {t} | {m} | {fmt_delta(med(on, 'cost_usd'), med(off, 'cost_usd'), '$')} | "
                       f"{fmt_delta(med(on, 'output_tokens'), med(off, 'output_tokens'))} | {fmt_delta(med(on, 'seconds'), med(off, 'seconds'), ' s')} | "
                       f"{notes_tokens:,.0f} tokens |")
            for k in ('cost_usd', 'output_tokens', 'seconds'):
                p = pct(med(on, k) or 0, med(off, k) or 0)
                if p is not None:
                    summary.setdefault((m, k), []).append(p)
    if summary:
        out += ['', '## Median over the tasks', '', '| Mode | Cost | Output tokens | Time |', '|---|---|---|---|']
        for m in modes:
            if m == 'off':
                continue
            cells = [f"{statistics.median(summary[(m, k)]):+.0f}%" if summary.get((m, k)) else 'n/a' for k in ('cost_usd', 'output_tokens', 'seconds')]
            out.append(f'| {m} | ' + ' | '.join(cells) + ' |')
    out += ['', 'Notes text is the length of what Claude wrote into the notes and the recap, divided by four, a common estimate '
            'of tokens for English text. A single run per task and mode varies with the agent\'s path; read small differences as noise.', '']
    return '\n'.join(out)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--data', required=True, type=Path)
    p.add_argument('--venv', required=True, type=Path)
    p.add_argument('--tasks', default='')
    p.add_argument('--modes', default='off,guided,full')
    p.add_argument('--repeats', type=int, default=1)
    p.add_argument('--concurrency', type=int, default=3)
    p.add_argument('--max-cost', type=float, default=4.0, help='USD ceiling per run, passed to claude -p')
    p.add_argument('--timeout', type=int, default=1200)
    p.add_argument('--model', default='')
    p.add_argument('--name', default='run')
    p.add_argument('--keep', action='store_true', help='keep the work folders')
    args = p.parse_args()
    args.data, args.venv = args.data.resolve(), args.venv.resolve()
    spec = json.loads((HERE / 'tasks.json').read_text())
    wanted = [t for t in args.tasks.split(',') if t]
    tasks = [t for t in spec['tasks'] if not wanted or t['id'] in wanted]
    modes = [m for m in args.modes.split(',') if m]
    version = json.loads((PLUGIN / '.claude-plugin' / 'plugin.json').read_text())['version']
    claude = run(['claude', '--version'], HERE).stdout.strip().split(' ')[0]
    out_dir = HERE / 'results' / (datetime.date.today().isoformat() + '-' + args.name)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f'{len(tasks)} task(s) x {len(modes)} mode(s) x {args.repeats} repeat(s), {args.concurrency} at a time -> {out_dir.relative_to(HERE.parent)}')
    # the same name resumes: runs that succeeded before are kept, the others run (again)
    saved = out_dir / 'runs.json'
    rows = [r for r in (json.loads(saved.read_text()) if saved.exists() else []) if r.get('ok')]
    done = {(r['task'], r['mode'], r['repeat']) for r in rows}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        for task in tasks:
            fixture = spec['fixtures'][task['fixture']]
            jobs = [pool.submit(one, task, fixture, m, r + 1, spec['tools'], args) for r in range(args.repeats) for m in modes
                    if (task['id'], m, r + 1) not in done]
            rows += [j.result() for j in jobs if j.result()]
            (out_dir / 'runs.json').write_text(json.dumps(rows, indent=1) + '\n')
            if stop.is_set():
                print('The account reached its usage limit; the remaining runs are skipped.')
                break
    models = sorted({r['model'] for r in rows if r.get('model')})
    meta = {'name': args.name, 'date': datetime.date.today().isoformat(), 'claude_code': claude, 'inloop': version,
            'model': ', '.join(models) or 'default', 'repeats': args.repeats}
    (out_dir / 'report.md').write_text(report(rows, meta))
    print((out_dir / 'report.md').read_text())
    return 0 if rows else 1


if __name__ == '__main__':
    sys.exit(main())
