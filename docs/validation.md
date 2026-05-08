# Validation

The simulator is validated with focused unit tests, offline trajectory
plots, and a multi-seed survival/reward bar chart.

## Run unit tests

```bash
python -m unittest discover -s tests
```

Expected: **13 tests pass** on a base install. The 3 env smoke tests
auto-skip unless Gymnasium is installed (`pip install -e .[rl]`).

## Generate validation plots

```bash
python -m sim.validation_plots
```

Default output directory is `docs/`. Generates:

- `validation_constant.svg`           — constant control, no disturbance
- `validation_constant_disturbed.svg` — constant control, full disturbance schedule
- `validation_rule_based_disturbed.svg` — proportional feedback, disturbed
- `validation_tuned_disturbed.svg`    — tuned heuristic baseline, disturbed
- `survival_comparison.svg`           — dual-panel bar chart (survival, reward) over multiple seeds

The plotting script uses Matplotlib when available and falls back to
dependency-free SVG output when it is not.

## Export demo trajectories

```bash
python -m rl.export_trajectories
```

Writes the JSON files the frontend replays:

- `trajectories/random_agent.json`
- `trajectories/constant_agent.json`
- `trajectories/rule_based_agent.json`
- `trajectories/trained_agent.json` *(placeholder — see below)*

To replace the placeholder with a real SAC checkpoint:

```bash
python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip
python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip
```

## Multi-seed evaluation table

```bash
python -m rl.evaluate --seeds 0 1 2 3 4 5 6 7 8 9
```

Prints a per-policy survival/reward/disruption table and writes
`docs/eval_results.json`. Adding `--sac-checkpoint <path>` includes the
trained agent in the comparison.

## Honest framing

The simulator is a **0D toy model**. Validation here means "the dynamics
are well-behaved and the control story is visible" — it does **not** mean
the model predicts real-tokamak behavior.
