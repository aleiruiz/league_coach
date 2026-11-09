# Coach quality evaluation

Checks that the harness (coach prompt, web search and, in the `draft` variant, the
structured draft with patch data) gives better advice than the same model without
the harness.

The app answers in **English by default** and switches to Spanish only when the
player asks. The cases, the rubric and the judge expect English; the
`lang-01-spanish-requested` case checks the switch to Spanish.

- `cases.json`: 30 cases (situational builds, matchups, in-game moments, tutorials,
  honesty traps, 4 screenshot cases and 1 language case). Each case has criteria,
  serious errors and, where verifiable, reference `hechos` (facts). Build and matchup
  cases also have a structured `draft`.
- `rubric.md`: substance dimensions, constraints, statistics and known limits.
- `run_eval.py`: runs each case in each variant with the Claude Code CLI, isolated
  from your configuration (no CLAUDE.md, memories, hooks or MCP), and asks a judge to
  score each pair in both orders.
- `draft_prompt.py`: Python replica of `recommend_build` (`src-tauri/src/recommend.rs`):
  `analysis_prompt`, `card_prompt`, validation and missing fields. When the Rust
  prompt changes, update it. It follows #8 (English prompts plus an answer-language line).
- `baselines/`: reference reports saved by hand (the older ones are in Spanish). Full
  runs go to `eval/results/` (ignored by git).

## Usage

Requirements: Python 3.10+ and Claude Code signed in (`claude auth login`). A full
harness vs baseline run makes about 100 queries (answers plus 2 judgments per case)
and uses your subscription.

**Windows** (PowerShell, from the repo folder):

```powershell
py eval\run_eval.py
py eval\run_eval.py --variants harness,baseline,baseline_web
py eval\run_eval.py --only ingame-01-behind,trap-02-live-data
py eval\run_eval.py --variants draft,baseline --fetch-ddragon
```

Use `py`, not `python3`: on Windows `python3` often opens the Microsoft Store. The
script finds `claude.cmd` on its own.

**macOS / Linux**: the same with `python3 eval/run_eval.py ...`.

Useful options:

- `--judge-model <model>`: use a judge different from the answering model (recommended).
- `--judge-repeats 2`: 4 judgments per pair instead of 2; less noise, twice the cost.
- `--patch 26.22`: tells the judge the patch. With `--fetch-ddragon` it comes from Data Dragon.
- `--locale es_MX`: Data Dragon language for `--fetch-ddragon` (default `en_US`).
- `--lang es`: simulates the app's language setting in Spanish (answer-language line in the
  coach and draft prompts). Use it with es_MX Data Dragon and the `lang-01-spanish-requested`
  case; the other cases expect English.

The report goes to `eval/results/<date>/report.md`. Each case is saved to
`results.jsonl` as soon as it finishes, along with `meta.json` (commit, prompt hash,
CLI version, models and patch). If a case fails, the rest continue and you can rerun
it with `--only`.

## `draft` variant (Game screen)

Reproduces "Recommend build" in two steps, like the app: first a free-form analysis
with web search (patch, allies and enemies listed separately, enemy damage profile and
notes), then the conversion to a card with the patch's lists of items, summoner
spells, runes and shards. The app runs step 2 in the same session; here the analysis
is pasted into the request, which is the app's other branch. It runs one correction
round like the app (unreadable JSON, names not in the patch or in the wrong slot, or
empty fields). The card is turned into text for the judge, the analysis is kept in
`results.jsonl`, and the report lists what was still wrong after the correction.

Needs Data Dragon: `--fetch-ddragon` downloads the latest patch to
`eval/ddragon/<locale>/<version>/`, or use `--ddragon <folder>` with a folder that has
`champion.json`, `item.json`, `runesReforged.json` and `summoner.json` and whose name
is the version, for example `eval/ddragon/en_US/16.22.1`. The app keeps the same cache
in its data folder.

## Screenshots

The `shot-*` cases need real screenshots, which are not committed. Put them in
`eval/images/` named after the case id with any extension (`shot-01-shop.jpg`), or
pass them with `--image shot-01-shop=C:\path\screenshot.png`, and add `--with-images`.

On Windows:

- `Win+Shift+S` copies to the clipboard without saving a file. Paste into Paint and save it.
- `Win+PrtScn` saves to `Pictures\Screenshots`.
- The in-game screenshot key (`F12` by default) saves to the `Screenshots` folder of the
  League of Legends install.

If an image is over 3.5 MB, the script warns: save it as JPG or crop it.

## When the harness changes

Rerun when `prompts.rs`, `recommend.rs`, the model's tools or the injected context
change. Compare with `baselines/` and save the new report there if you want to keep it
as a reference.
