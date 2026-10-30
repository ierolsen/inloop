# inloop cost benchmark: pilot

2026-10-30 · Claude Code 2.1.310 · inloop 0.1.0 · model claude-opus-5-5 · 1 run(s) per task and mode, medians shown · costs at list price as Claude Code reports them

| Task | Mode | Cost | Output tokens | Input tokens (with cache) | Time | Turns | Notes | Lines changed | Tests |
|---|---|---|---|---|---|---|---|---|---|
| add-feature | off | $0.44 | 3,292 | 358,079 | 38 s | 15 | 0 | +20 / -2 | 1/1 pass |
| add-feature | guided | $0.45 | 4,033 | 295,274 | 42 s | 13 | 1 | +20 / -2 | 1/1 pass |
| add-feature | full | $0.54 | 5,196 | 552,337 | 62 s | 16 | 1 | +20 / -2 | 1/1 pass |
| add-feature | summary | $0.50 | 2,957 | 325,763 | 32 s | 10 | 1 | +20 / -2 | 1/1 pass |
| add-feature | review | $0.57 | 4,176 | 394,844 | 42 s | 16 | 1 | +20 / -2 | 1/1 pass |
| fix-bug | off | $0.34 | 930 | 168,432 | 13 s | 6 | 0 | +1 / -1 | 1/1 pass |
| fix-bug | guided | $0.50 | 1,923 | 340,957 | 36 s | 8 | 1 | +1 / -1 | 1/1 pass |
| fix-bug | full | $0.49 | 2,198 | 283,225 | 25 s | 7 | 1 | +1 / -1 | 1/1 pass |
| fix-bug | summary | $0.37 | 1,571 | 230,838 | 20 s | 8 | 1 | +1 / -1 | 1/1 pass |
| fix-bug | review | $0.38 | 1,758 | 281,079 | 21 s | 7 | 1 | +1 / -1 | 1/1 pass |
| prune-features | off | $0.43 | 2,894 | 323,447 | 176 s | 9 | 0 | +0 / -0 | 1/1 pass |
| prune-features | guided | $0.45 | 2,675 | 404,789 | 224 s | 9 | 0 | +0 / -0 | 1/1 pass |
| prune-features | full | $0.42 | 2,060 | 344,539 | 172 s | 6 | 0 | +0 / -0 | 1/1 pass |
| remove-feature | off | $0.41 | 2,462 | 274,896 | 30 s | 13 | 0 | +3 / -17 | 1/1 pass |
| remove-feature | guided | $0.50 | 3,691 | 500,802 | 59 s | 16 | 1 | +2 / -13 | 1/1 pass |
| remove-feature | full | $0.46 | 3,949 | 344,720 | 78 s | 13 | 1 | +2 / -13 | 1/1 pass |
| remove-feature | summary | $0.42 | 2,507 | 327,250 | 26 s | 14 | 1 | +2 / -13 | 1/1 pass |
| remove-feature | review | $0.43 | 2,930 | 335,934 | 36 s | 14 | 1 | +2 / -13 | 1/1 pass |

## What inloop adds, against the same task with inloop off

| Task | Mode | Cost | Output tokens | Time | Notes text (about) |
|---|---|---|---|---|---|
| add-feature | guided | +3% (+$0.01) | +23% (+741) | +13% (+5 s) | 928 tokens |
| add-feature | full | +24% (+$0.10) | +58% (+1,904) | +65% (+24 s) | 1,128 tokens |
| add-feature | summary | +15% (+$0.07) | -10% (-335) | -14% (-5 s) | 298 tokens |
| add-feature | review | +30% (+$0.13) | +27% (+884) | +11% (+4 s) | 531 tokens |
| fix-bug | guided | +49% (+$0.16) | +107% (+993) | +173% (+23 s) | 445 tokens |
| fix-bug | full | +46% (+$0.15) | +136% (+1,268) | +89% (+12 s) | 628 tokens |
| fix-bug | summary | +10% (+$0.03) | +69% (+641) | +49% (+6 s) | 285 tokens |
| fix-bug | review | +14% (+$0.05) | +89% (+828) | +61% (+8 s) | 417 tokens |
| prune-features | guided | +7% (+$0.03) | -8% (-219) | +27% (+48 s) | 0 tokens |
| prune-features | full | -2% (-$0.01) | -29% (-834) | -2% (-4 s) | 0 tokens |
| remove-feature | guided | +21% (+$0.09) | +50% (+1,229) | +98% (+29 s) | 710 tokens |
| remove-feature | full | +12% (+$0.05) | +60% (+1,487) | +160% (+48 s) | 1,312 tokens |
| remove-feature | summary | +1% (+$0.00) | +2% (+45) | -11% (-3 s) | 317 tokens |
| remove-feature | review | +5% (+$0.02) | +19% (+468) | +22% (+7 s) | 528 tokens |

## Median over the tasks

| Mode | Cost | Output tokens | Time |
|---|---|---|---|
| guided | +14% | +36% | +63% |
| full | +18% | +59% | +77% |
| summary | +10% | +2% | -11% |
| review | +14% | +27% | +22% |

Notes text is the length of what Claude wrote into the notes and the recap, divided by four, a common estimate of tokens for English text. A single run per task and mode varies with the agent's path; read small differences as noise.
