# FusionPilot

> **Can you keep a simulated fusion plasma alive longer than an AI can?**
> FusionPilot is an educational, browser-playable 0D plasma-control demo
> with three modes: learn, control, race-against-AI.

It is **not** a real tokamak controller. It is a small, honest toy model
inspired by RL-for-fusion research (Degrave 2022, Seo 2024, Tracey 2024)
that makes the *control* trade-offs intuitive — so a non-physicist can
feel them in 30 seconds.

---

## One-sentence idea

A 0D plasma simulator + reinforcement-learning agent + side-by-side
human-vs-AI browser demo, designed so a viewer instantly understands why
RL-for-plasma-control is interesting.

## Problem

Real fusion-control research is hard to demo. The papers show graphs,
tokamaks are inaccessible, and the human intuition gap is enormous.
FusionPilot compresses the problem down to two sliders, three minutes,
and one disruption screen — and makes the “you fail, the AI doesn't” moment
feel real instead of abstract.

## Why this matters

If you let a person grab the heating slider for 20 seconds against
realistic-feeling disturbances, they almost always disrupt. Then they
watch a learned policy survive on the same disturbance schedule. That
emotional contrast is the whole pitch for RL-for-fusion in one demo.

## Current proof of concept

| Layer | Status |
|---|---|
| 0D physics simulator (energy, particle, fusion power, confinement, disruption) | ✅ implemented + tested |
| Disturbance generator (ELMs, density pumpouts, heating noise) | ✅ implemented |
| Baseline controllers (random, constant, rule-based, tuned) | ✅ implemented |
| Centralized reward shaping (shared between Python sim & Gym env) | ✅ implemented |
| Gymnasium environment (continuous control, normalized obs/action) | ✅ implemented + smoke-tested |
| SAC training script (Stable-Baselines3) | ✅ implemented (run with `pip install -e .[rl]`) |
| Multi-seed evaluation + survival/reward bar chart | ✅ implemented |
| JSON trajectory export (random / constant / rule_based / trained) | ✅ implemented |
| **Browser frontend** (vanilla JS, Three.js particles, optional npm scripts) | ✅ implemented |
| JS port of simulator for live manual control | ✅ implemented |
| AI-vs-You side-by-side race with same disturbance seed | ✅ implemented |
| **Trained SAC export** | ✅ trained locally; browser actor JSON + trained trajectory metadata included |

## What works now

- Every Python module imports and runs on a base install (NumPy only).
- `python -m unittest discover -s tests` → 13 tests pass (3 env tests skip
  unless `[rl]` extras are installed).
- `python -m sim.validation_plots` regenerates all SVG plots and prints a
  per-policy survival/reward comparison.
- `python -m rl.export_trajectories` regenerates the four JSON reference
  trajectories and trained-agent metadata used by the frontend.
- `python scripts/serve.py` boots the static demo at
  `http://localhost:8000/web/`.
- `npm install`, `npm run test`, `npm run build`, and `npm run smoke` are
  available for teams that expect a Node-style demo path.
- All three browser modes render and animate; the AI-vs-You race now runs
  the selected browser policy live against the same disturbance seed and
  mirrored actuator-bump schedule as the human side.
- Race mode includes a compact reference summary strip loaded from the JSON
  trajectory metadata, so judges can see baseline survival/reward hierarchy
  at a glance.
- Operator and Race include a compact top-bar settings menu for Easy /
  Normal / Hard difficulty. The challenge system uses fast random actuator
  bumps; harder modes change the sliders farther, not just more opaquely.
- The same settings popover exposes a Reactor Scenario picker (Standard,
  Compact, Heavy, Storm, Precision). Scenario controls the reactor and
  weather (initial state, sim limits, ramp rates, disturbance schedule,
  actuator-bump shape, round duration); difficulty still controls challenge
  intensity. Scenario and difficulty compose. The active scenario is shown
  as a chip on each mode panel.

## What is still experimental

- **The "trained" agent now has a 50k-step SAC checkpoint.** Regenerate it
  after future training runs with:
  ```
  pip install -e .[rl]
  python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip
  python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip
  python scripts/export_sac_actor.py --checkpoint checkpoints/sac.zip
  ```
- The 0D physics is intentionally simplified: no MHD, no radial profiles,
  no real Bosch-Hale reactivity, no magnetic coils. The toy fit is good
  enough to make policy differences visible.
- The AI-vs-You race runs browser-side policy logic live. The `trained`
  option uses an exported deterministic SAC actor JSON; ONNX Runtime Web is
  still a future path for richer model formats.
- Reward shaping has not been tuned against trained-agent behavior yet.

## Demo flow

1. **Open `python scripts/serve.py`** or `npm run dev` -> go to
   `localhost:8000/web/` or `localhost:5173/web/`.
2. **Mode 1 — Learn the Plasma.** Drag sliders. Watch the clean particle
   torus heat (color), breathe (density), and become turbulent
   (instability). Toggle disturbances off to see the underlying physics
   relax to steady state.
3. **Mode 2 — Can You Control It?** Disturbances and random actuator
   bumps are aggressive. Use `W/S` heat, `A/D` fuel, `R` reset. Open the
   settings button in the top bar to switch Easy / Normal / Hard, or pick a
   different reactor scenario (Compact, Heavy, Storm, Precision).
4. **Mode 3 — AI vs You.** Same disturbance schedule on both sides.
   - Pick `random` → AI disrupts in ~1.7 s.
   - Pick `rule_based` → AI matches a competent operator.
   - Pick `trained SAC` → the exported SAC actor runs live in the browser
     and survives the standard benchmark; the tuned heuristic still slightly
     beats it on mean reward, which is documented below.
   Click *Start race*, tune difficulty from the settings button, and try
   to outlast the AI side.

See [`docs/demo.md`](docs/demo.md) for the full 2-minute presenter script.

## How to run

```bash
# Base install (sim + frontend only, no RL)
pip install -e .

# Run the unit tests
python -m unittest discover -s tests

# Regenerate validation plots & survival comparison
python -m sim.validation_plots

# Regenerate the four reference trajectories used by the frontend summary
python -m rl.export_trajectories

# Boot the browser demo at http://localhost:8000/web/
python scripts/serve.py
```

Node-style frontend commands are also provided. They do not install any
runtime dependencies; Three.js is loaded by browser importmap from a CDN.

```bash
npm install
npm run test      # static frontend structure check
npm run build     # copies web/ + trajectories/ into dist/
npm run smoke     # starts the dev server, fetches /web/, exits
npm run dev       # serves http://localhost:5173/web/
```

To train the actual SAC agent:

```bash
pip install -e .[rl]
python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip
python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip
python scripts/export_sac_actor.py --checkpoint checkpoints/sac.zip
python -m rl.evaluate --sac-checkpoint checkpoints/sac.zip --seeds 0 1 2 3 4 5 6 7 8 9
```

## Example output

After running `python -m sim.validation_plots --seeds 0 1 2 3 4 5 6 7 8 9`:

```
Policy comparison:
  policy         mean_s   std_s     reward  disrupt%
  random           4.84    3.08       52.7      100%
  constant        20.00    0.00      648.3        0%
  rule_based      20.00    0.00      729.4        0%
  tuned           20.00    0.00      774.9        0%
  sac             20.00    0.00      765.1        0%
```

Random control disrupts on **every** seed. Smarter controllers all
survive but vary in reward. The current 50k-step SAC run survives all eval
seeds and now powers the browser's live `trained SAC` policy; reward tuning
and longer training remain useful next steps.

## Architecture

```text
sim/                       Pure-Python 0D simulator (no RL deps required)
  plasma0d.py              constants, dataclasses, step() function
  disturbances.py          ELM / pumpout / heating-noise scheduler
  controllers.py           baseline policies + episode runner
  reward.py                single source of truth for reward shaping
  validation_plots.py      SVG/PNG validation + survival bar chart

rl/                        Optional Gymnasium + SB3 layer
  env.py                   FusionPlasma0DEnv wrapping sim/
  train_sac.py             one-shot SAC training
  evaluate.py              multi-seed survival/reward table
  export_trajectories.py   write JSON for the frontend

web/                       Static frontend (vanilla JS, optional npm helpers)
  index.html               three-mode SPA
  style.css                premium dark reactor-console theme
  sim/plasma.js            JS port of sim/plasma0d.py
  sim/rng.js               seeded mulberry32 (for matching seeds across modes)
  app/main.js              app wiring + animation loop
  app/plasma3d.js          tunable Three.js particle torus renderer
  app/gauges.js            numeric gauges with warn/danger thresholds
  app/scenarios.js         reactor/scenario presets (Standard, Compact, Heavy, Storm, Precision)
  policies/sac_actor.json  exported SAC actor used by live Race mode

scripts/serve.py           tiny http.server wrapper for the demo
scripts/export_sac_actor.py export Stable-Baselines3 SAC actor to browser JSON
scripts/dev-server.mjs     npm dev/smoke static server
scripts/build.mjs          static dist/ build copier
scripts/check-web.mjs      frontend structure smoke test
docs/                      generated SVGs + design docs
trajectories/              JSON reference trajectories for summaries
tests/                     unittest suite (13 tests)
```

## Tech stack

- **Python 3.10+** — NumPy (required), Matplotlib (optional, SVG fallback
  for plots), Gymnasium + Stable-Baselines3 (optional, for training).
- **Browser** — vanilla ES modules + Three.js via importmap. No React, no
  Vite, no Tailwind, no required build step. Optional npm scripts provide
  familiar `dev`, `test`, `build`, and `smoke` commands.

## AI usage

The "AI" component is a continuous-control RL agent (SAC by default) that
controls heating power and fueling rate against the same disturbance
schedule that trips human operators. The Gym wrapper lives in `rl/env.py`,
shares its reward function with the rule-based runner via `sim/reward.py`,
and trains in 5–15 minutes on a CPU laptop at 50k steps.

The current repo includes the exported result of a 50k-step SAC run:
`trained_agent.json` has `metadata.placeholder = false`, and
`web/policies/sac_actor.json` lets the browser run the deterministic SAC
actor live in Race mode. The local checkpoint file is intentionally kept out
of GitHub because it is a generated training artifact. If the actor JSON is
missing, the browser falls back to the tuned hand-coded policy and says so in
the policy picker.

## Next milestones

1. **Reward tuning** — the current weights are heuristic; an evaluation
   loop with trained-agent feedback should tighten them.
2. **Longer SAC run** — 200k-500k steps may beat the tuned baseline on reward,
   not just survival.
3. **Survival-against-time chart** — overlay all four policies on one
   reward-vs-time plot for the AI-vs-You footer.
4. **(Stretch) ONNX-in-browser** — replace the lightweight JSON actor export
   with a standard browser inference runtime.

## Long-term vision

A polished educational demo + open-source teaching artifact: anyone
curious about RL-for-fusion can clone the repo, run two commands, and
get a feel for *why* learned controllers matter. Future versions could
swap in better physics (Bosch-Hale reactivity, simple radial profiles,
H-mode/L-mode transition) without changing the control story.

## Limitations

- 0D — no spatial structure, no magnetic coils, no MHD.
- Disturbance physics is a hand-tuned schedule, not a calibrated model.
- The browser sim and the Python sim share equations but use different
  runtime paths. The live race mirrors disturbance seeds and actuator-bump
  schedules inside the browser, while JSON metrics remain reference exports.
- The current SAC checkpoint is only a 50k-step proof-of-concept run. It
  survives, but the tuned heuristic still slightly beats it on mean reward.

## Hackathon relevance

FusionPilot is honestly framed as an educational demo. The pitch is
**emotional intuition for AI-driven physics control**, not a research
contribution. It's runnable in 60 seconds, the AI-vs-You moment is the
demo's hook, and the underlying simulator + RL pipeline is small enough
that anyone can read the entire codebase in 30 minutes.

---

> Inspired by Degrave et al. 2022, Seo et al. 2024, Tracey et al. 2024.
> FusionPilot is a simplified educational simulator. It is **not** a
> real tokamak controller.
