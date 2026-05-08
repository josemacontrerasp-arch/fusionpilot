# FusionPilot — Implementation Log

## 2026-05-07 Reactor scenario / level system

Added a selectable scenario layer on top of the existing demo so the
Operator and Race rounds tell different control stories without changing
the simulator core or the SAC actor pathway.

Changes made:

- Added `web/app/scenarios.js` with five named presets:
  - **Standard Tokamak** — current default, balanced reactor.
  - **Compact Reactor** — smaller and twitchier; tighter beta/Greenwald
    disrupt thresholds (`1.04` / `1.05`), faster confinement softening
    (`confinement_k=11`), faster actuator ramp limits, shorter event
    interval and slide times.
  - **Heavy Reactor** — large, inertial; looser disrupt thresholds
    (`1.18` / `1.16`), softer confinement curve, slower actuator ramps,
    longer slide times, 22 s round duration.
  - **Storm Scenario** — standard reactor under harsher ELM/pumpout
    weather: faster ELM intervals (0.08–0.26 s), bigger heat losses,
    faster pumpouts, higher heating noise.
  - **Precision Burn** — tighter operating window (disrupt at `1.05`
    on both limits), milder ELM weather, smaller actuator bumps
    (`kickScale: 0.55`), 22 s duration. Smooth control wins over big
    corrections.
- Centralized scenario constants in one frozen dictionary in
  `web/app/scenarios.js`; `web/app/main.js` no longer holds scattered
  scenario magic numbers, only the difficulty multipliers it already had.
- Threaded the scenario through the existing systems instead of
  rewriting them:
  - `makeDriver` now accepts `simConfig` and `initialStateArgs` and
    exposes `setSimConfig` / `setInitialStateArgs`.
  - `makeActuatorPressure` now accepts `scenarioPressure` multipliers
    and a `setScenarioPressure` setter; difficulty and scenario compose
    via `pressureSettingsFor(base, difficulty, scenarioPressure)`.
  - `tickLiveAi` and `startRace` now use the active scenario's sim
    config, initial state, and disturbance config; the AI race ends at
    the scenario's duration (20–22 s) instead of a hardcoded 20 s.
- Added a Reactor Scenario picker to the existing top-bar settings
  popover (3-col segmented control) with a one-line description below.
- Added a small `data-scenario-chip` chip to each of Learn / Operator /
  Race so the active scenario stays visible in the simulator UI without
  cluttering the canvas-first layout.
- Difficulty controls (Easy / Normal / Hard) and scenario presets
  compose: switching scenarios preserves the current difficulty;
  switching difficulty preserves the current scenario.
- Learn mode previews the scenario passively (initial state, sim
  config, disturbance flavor) without adding an actuator-pressure
  system. The disturbance toggle still works and now reads gentle
  weather from the active scenario.
- Updated `scripts/check-web.mjs` to require `web/app/scenarios.js`,
  the scenario picker, the scenario chip, and the `applyScenario`
  orchestrator.

Verified the current web path:

- `node --check web/app/main.js`
- `node --check web/app/scenarios.js`
- `npm run test`
- `npm run build`
- `npm run smoke -- --port=5174`

Honest caveats:

- Scenario sim-config tweaks change disrupt thresholds, confinement
  softening, and actuator ramp limits. They do **not** rewrite the
  underlying 0D physics or change `tau_E0` / `tau_p0` (those live in
  `CONSTANTS` in `web/sim/plasma.js` and would require a wider edit to
  expose). "Compact" and "Heavy" therefore feel different mostly via
  limit margins, ramp speed, and confinement curvature, not via
  reactor-size scaling.
- The trained SAC actor and all baselines were trained against the
  Standard scenario only. They are run as-is in every scenario and
  may underperform in Storm/Precision/Compact compared to a scenario-
  specific training run. The Race metrics strip is labeled as a
  Standard reference so the UI does not imply scenario-specific metrics.
- Race uses the same disturbance and pressure seeds for human and AI
  for a given scenario; the AI side runs the same scenario sim config
  as the human side.

Files touched in this pass:

- `web/index.html`
- `web/style.css`
- `web/app/main.js`
- `web/app/scenarios.js` (new)
- `scripts/check-web.mjs`
- `README.md`
- `CHANGELOG.md`

## 2026-05-07 Codex interactive demo polish

This follow-up pass focused on making the browser prototype feel stronger
in a live hackathon demo, especially after hands-on tuning in the in-app
browser.

Changes made:

- Updated the visual identity from the supplied FusionPilot lockup/reference
  HTML files:
  - Replaced the old glowing blob logo with a crisp cyan/ice monoline torus
    mark.
  - Added a matching inline SVG favicon and dark `theme-color`.
  - Retuned the global UI palette toward deep navy, cyan, ice-white, and
    muted technical text.
  - Cleaned up the top bar, mode tabs, HUD glow, sliders, buttons, and
    responsive header behavior.
- Improved the plasma presentation after live visual review:
  - Raised particle visibility with more/brighter points, slightly larger
    points, stronger but controlled glow, and a tighter reactor-ring read.
  - Preserved the clean particle-art direction instead of returning to the
    old cloudy/smoky blob style.
- Made Operator Challenge and AI-vs-You more interactive:
  - Added independent random actuator pressure events for heat and fuel.
  - Events can now hit either slider or both, move either up or down, and use
    randomized travel distance and timing.
  - Removed the predictable "both sliders drift upward together" behavior.
  - Changed Race mode so the selected AI policy now runs live in the browser
    rather than simply replaying a pre-recorded trajectory.
  - Mirrored the same actuator-bump schedule onto the AI command channels, so
    the AI has to correct the same kind of load changes as the human side.
  - Added browser-side versions of the random, constant, rule-based, and
    tuned/"trained best available" policies.
  - Updated the policy picker text to explain how each policy behaves.
  - Renamed the Race policy strip to "Reference summary" because those values
    come from exported JSON runs, while the actual race now runs live.
  - Added post-failure theory explanations based on final plasma state
    (temperature collapse, density limit, pressure/beta limit, runaway, or
    stable round).
- Iterated challenge balance from browser feedback:
  - Initial random drift was too hard, then too easy, then retuned so
    difficulty is mostly about slider travel distance rather than slow motion.
  - Current tuning: Easy = fast small bumps, Normal = fast medium bumps,
    Hard = fast large bumps.
  - Added a recovery gap so new actuator events do not stack while the
    previous slider motion is still active.
- Added a compact top-bar settings popover:
  - Small settings button beside the mode tabs.
  - Operator and Race each have Easy / Normal / Hard difficulty controls.
  - The panel closes on outside click or Escape.
  - Difficulty updates the actuator-pressure system live.
- Kept the main demo surface cleaner by moving difficulty controls out of
  the Operator/Race panels.
- Verified the current web path:
  - `node --check web/app/main.js`
  - `node --check web/app/plasma3d.js`
  - `npm run test`
  - `npm run build`
  - `npm run smoke -- --port=5174`
  - Confirmed the local dev server responds at `http://127.0.0.1:5173/web/`.
- After the 50k-step SAC run completed:
  - Exported `checkpoints/sac.zip` into `trajectories/trained_agent.json`
    with `metadata.placeholder = false`.
  - Ran multi-seed evaluation: SAC survived all 10 seeds with mean reward
    `765.1`; tuned heuristic survived all 10 with mean reward `774.9`.
  - Added `scripts/export_sac_actor.py` to export the Stable-Baselines3 actor
    as deterministic browser JSON.
  - Generated `web/policies/sac_actor.json`.
  - Updated Race mode so `trained SAC` uses the exported SAC actor live in the
    browser, while retaining the tuned policy as fallback if the actor JSON is
    missing.

Files touched in this pass:

- `web/index.html`
- `web/style.css`
- `web/app/main.js`
- `web/app/plasma3d.js`
- `web/policies/sac_actor.json`
- `scripts/export_sac_actor.py`
- `scripts/check-web.mjs`
- `CHANGELOG.md`
- `README.md`

## 2026-05-07 Codex audit + particle visual pass

Follow-up audit found the broad Claude handoff mostly matched the code, but
three important details were stale or weak:

- `README.md` still referenced the deleted `web/app/canvas.js` renderer.
- `pyproject.toml` still made Matplotlib a required dependency even though
  the validation script has an SVG fallback.
- The particle shader used oversized point sprites plus a strong halo term,
  which made the plasma read as a smeared cloud instead of clean premium
  particle art.

Changes made in this pass:

- Rebuilt `web/app/plasma3d.js` around a centralized `PLASMA_VISUALS` block.
  Particle count, particle size, halo strength, opacity, turbulence, swirl,
  density scaling, disruption scatter, and palette are now tunable in one
  place.
- Shifted stable plasma toward a sharper toroidal reactor-ring field: more
  particles, smaller dots, less halo, more negative space, and coherent
  orbital/poloidal flow.
- Shifted unstable/disrupted plasma toward fragmented sparks and broken
  clusters instead of a full-screen red fog.
- Reduced CSS glow/backdrop blur so the UI supports the sharper particle
  field instead of adding extra haze.
- Fixed browser demo glue: Learn-mode disturbance settings persist through
  reset, and AI trajectory replay advances by exported trajectory `dt` rather
  than one JSON step per animation frame.
- Added a Race-mode policy summary strip sourced from trajectory metadata so
  survival/reward hierarchy is visible during the demo.
- Added npm-friendly commands (`package.json`, `scripts/dev-server.mjs`,
  `scripts/build.mjs`, `scripts/check-web.mjs`) without adding runtime npm
  dependencies.
- Moved Matplotlib to optional extras in `pyproject.toml`.
- Updated README/demo docs and added `ROADMAP.md`.

---

> Build / handoff doc for the work done in this session. Captures *what
> changed*, *why*, *how to run it*, and *what's next*. Companion to the
> project [README.md](./README.md).

---

## TL;DR — what this session delivered

The repository started as a Day-1-of-8 hackathon prototype: a clean Python
0D plasma simulator with three baseline controllers, validation plots, a
Gymnasium env scaffold, but **no RL agent, no frontend, no demo path,
several false claims (a "PID" controller that wasn't), hardcoded Windows
paths in instructions, and duplicated reward shaping**.

Three implementation passes turned it into a runnable, demo-ready
hackathon project with:

1. A hardened, honestly-framed **Python core** (centralized reward, real
   training script, multi-seed evaluation, placeholder mechanism for the
   trained agent).
2. A **runnable browser demo** (vanilla JS + ES modules, no build step) at
   `python scripts/serve.py` → `localhost:8000/web/`.
3. A **Three.js plasma particle visualization** in the browser — glowing
   toroidal core, additive shader, cyan→violet→magenta temperature ramp,
   disturbance pulses, red latch on disruption.

```
[ before ]                              [ after ]
─────────                              ────────
 6.5 / 10 POC                            ~9 / 10 POC
 No demo path                            python scripts/serve.py
 Headline (AI) was missing               AI-vs-You side-by-side race works
 Plain Canvas2D blob                     Three.js glowing reactor core
 13 tests, gym tests broken              13 tests, env tests skip cleanly
 Hardcoded user-specific paths           Portable everywhere
 4 trajectory exports, 1 misnamed        4 trajectory exports, all honestly named
```

13 unit tests still pass on a base install. `pip install -e .[rl]` adds
the SAC training pathway; without it the demo still runs end-to-end using
a tuned-heuristic placeholder marked as such in JSON metadata.

---

## Session structure — three passes

### Pass 1 — Review

A full senior-engineer review of the existing codebase. Output:

- **POC score: 6.5/10**, idea potential: 8/10, technical foundation: 7.5/10.
- The simulator and tests were unusually solid for Day 1.
- The headline feature (AI agent surviving longer than humans) wasn't
  built; neither was any frontend.
- Concrete punch list: hardcoded `C:\Users\Josem\...` Python path in
  install instructions; misnamed `pid_controller.json`; reward duplicated
  between `sim/controllers.py` and `rl/env.py`; `random_controller`
  closure-state bug; no git repo; trained-agent claim with no checkpoint.

That review became the implementation backlog for pass 2.

### Pass 2 — Hardening + first frontend

Cleared the punch list, built the Python RL infrastructure, and shipped a
runnable vanilla-JS browser demo with three modes.

### Pass 3 — Three.js plasma upgrade

Replaced the Canvas2D blob with a GPU-friendly particle field rendered
via Three.js (loaded from CDN through a native `<script type="importmap">`
— no npm, no build step). Glassmorphism UI, neon palette, HUD overlays.

---

## Pass 2 — every change in detail

### Critical fixes

| Item | Where | What |
|---|---|---|
| Hardcoded Python path | `README.md`, `docs/validation.md` | Replaced `C:\Users\Josem\.cache\codex-runtimes\...\python.exe` with portable `python -m unittest`, `python -m sim.validation_plots`, etc. |
| `pid_controller.json` was not PID | `rl/export_trajectories.py` | Renamed to `rule_based_agent.json`. The exported file used to misclaim PID. |
| Reward duplicated in two places | new `sim/reward.py` | Single source of truth: `compute_reward(state, action_norm, prev_action_norm, weights)`. `sim/controllers.py` and `rl/env.py` both import from it now. Drift impossible. |
| `random_controller` closure bug | `sim/controllers.py` | Replaced with `_RandomPolicy` class so two random policies don't share counter/current state. |
| `gym` import broke `rl/__init__.py` on base installs | `rl/env.py` | Made gymnasium import lazy. The class only requires it at construction time; importing the module is always safe. |
| No env smoke test | new `tests/test_env.py` | 3 tests (reset shape, step 5-tuple, episode truncation). Auto-skip with `unittest.skipUnless(GYM_AVAILABLE, ...)` so they don't break a base install. |
| No reward test | new `tests/test_reward.py` | Confirms disruption dominates reward; jerk penalty works; on-target > off-target. |
| `.gitignore` missing generated artifacts | `.gitignore` | Now ignores `docs/validation_*.svg`, `docs/survival_comparison.*`, `runs/`, `checkpoints/`, `sac_*.zip`. |

### Core POC improvements (RL infrastructure)

| File | Status | Purpose |
|---|---|---|
| `sim/controllers.py` | rewrote | Added `tuned_controller` — a stronger hand-coded baseline that anticipates disturbances and clamps near limits. Fixed random closure. Cleaner episode runner that uses centralized reward. |
| `sim/disturbances.py` | edited | Tuned `DisturbanceConfig` defaults so policy comparison is *visible*: random disrupts 100%, baselines vary in reward 648→775. Added `gentle_config()` for the educational Learn mode. |
| `sim/validation_plots.py` | extended | Dual-panel SVG bar chart (survival + reward). Added a `tuned_disturbed` validation scenario alongside the existing constant/rule-based scenarios. |
| `rl/train_sac.py` | **NEW** | One-shot SAC training script. CLI: `--steps`, `--out`, `--seed`, `--episode-seconds`, `--no-disturbances`. Defaults to 50k steps (~5–15 min on CPU). |
| `rl/evaluate.py` | **NEW** | Multi-seed survival/reward table for any subset of policies (including a SAC checkpoint). Writes `docs/eval_results.json`. |
| `rl/export_trajectories.py` | rewrote | Always emits 4 trajectories (`random_agent`, `constant_agent`, `rule_based_agent`, `trained_agent`). When `--sac-checkpoint <path>` is provided, the trained slot loads it; otherwise falls back to `tuned_controller` and sets `metadata.placeholder = true` so the frontend can label it honestly. |

### Demo plumbing

| File | Status | Purpose |
|---|---|---|
| `scripts/serve.py` | **NEW** | One-command HTTP server (`python scripts/serve.py`). Defaults to port 8000, auto-opens browser to `/web/`, accepts `--port`, `--no-open`. |
| `index.html` (root) | **NEW** | Tiny HTML redirect to `/web/` so the repo root is browse-friendly. |

### Documentation

| File | Status | What |
|---|---|---|
| `README.md` | **rewritten** | Structured around: one-sentence idea → problem → why → current POC table → what works → what's experimental → demo flow → how to run → example output → architecture → tech stack → AI usage → next milestones → long-term vision → limitations → hackathon relevance. Honest, no false claims. |
| `docs/validation.md` | **rewritten** | No hardcoded paths. Lists every artifact regenerable by `validation_plots`/`evaluate`. |
| `docs/demo.md` | **NEW** | 2-minute presenter script with timing cues, the exact words to say in each section, and a "what NOT to claim" guard. |

### Cleanup

- Deleted orphan `trajectories/pid_controller.json` and
  `trajectories/constant_controller.json` (replaced by `*_agent.json`).
- Removed the misleading PID label from anywhere it appeared.

### Pass 2 file count

- 4 new Python files (`sim/reward.py`, `rl/train_sac.py`, `rl/evaluate.py`,
  `tests/test_env.py`, `tests/test_reward.py`, `scripts/serve.py`).
- 4 rewritten Python files (`sim/controllers.py`, `sim/disturbances.py`,
  `sim/validation_plots.py`, `rl/env.py`, `rl/export_trajectories.py`,
  `sim/__init__.py`).
- 7 new web files (`web/index.html`, `web/style.css`,
  `web/sim/plasma.js`, `web/sim/rng.js`, `web/app/main.js`,
  `web/app/canvas.js` (later replaced), `web/app/gauges.js`).
- 3 docs files (`README.md` rewritten, `docs/validation.md` rewritten,
  `docs/demo.md` new).

---

## Pass 3 — Three.js plasma particle visualization

### What changed visually

| Element | Before | After |
|---|---|---|
| Plasma renderer | Canvas2D radial gradient blob with a dashed limit ring | **Three.js** ~2400-particle additive-blended toroidal field with custom GLSL shaders |
| Color | Single hue interpolated across temperature stops | Cyan → violet → magenta ramp on T, with per-particle hue jitter and red latch on disruption |
| Motion | Static blob with shake amplitude on instability | Toroidal current + poloidal twist + curl-noise drift scaled by `(1 − stability)`, slow camera drift |
| Disturbance feedback | Yellow flash ring | Outward pulse wave through the particles, decays over ~1 s |
| Disruption feedback | Red full-canvas tint | Red color latch + chaotic particle dispersion |
| HUD | Plain text in corner | Monospaced glassmorphism overlay (T / n / P_fus / stability) with cyan glow |
| Background | Solid radial CSS gradient | Animated radial-gradient glow halos + faint grid + `backdrop-filter` blur on every panel |
| Controls | Default range inputs | Neon-cyan slider thumbs with glow shadow, animated switch toggle, `01 LEARN` / `02 OPERATOR` / `03 AI VS YOU` style mode tabs |
| Brand | Plain wordmark | `FUSION` + cyan-glow `PILOT`, animated logo (spinning ring + pulsing core) |

### Dependency strategy

**One** runtime dependency — Three.js r165 — loaded via a native ES
importmap from a CDN:

```html
<script type="importmap">
{ "imports": { "three": "https://unpkg.com/three@0.165.0/build/three.module.js" } }
</script>
```

**No npm. No node. No bundler. No build step.** Anyone can clone the repo
and run `python scripts/serve.py` — the demo works.

I deliberately did **not** install `@react-three/fiber` / `drei` / `leva` /
`@react-three/postprocessing` because the project is vanilla JS (no
React) and bringing in npm would break the "clone → serve.py → done"
guarantee. The custom GLSL shader gives an additive-glow look without
needing UnrealBloomPass.

### Pass 3 files

| File | Status | What |
|---|---|---|
| `web/app/plasma3d.js` | **NEW** | The whole renderer. Class `PlasmaScene(canvas, opts)`, exposes `update(state, dt)`. Single `THREE.Points` draw call backed by a typed `Float32Array`. Custom vertex + fragment shaders implement the toroidal current rotation, curl-noise drift, disturbance pulse, disruption tear, and soft additive disc. ~280 lines, no external deps beyond `three`. |
| `web/app/canvas.js` | **DELETED** | Old Canvas2D renderer replaced. |
| `web/index.html` | rewritten | Importmap. Inter + JetBrains Mono via Google Fonts. Mode-card layout with HUD overlays per canvas, status banner, timer overlay, glass control panel, agent-policy picker. |
| `web/style.css` | rewritten | Full futuristic theme. Glassmorphism (`backdrop-filter: blur(14px)`). Neon palette via CSS variables. Animated `bg-glow` + faint `bg-grid` backdrop layers. Custom slider thumb with `box-shadow: 0 0 14px var(--cyan)`. Animated switch toggle. Primary button cyan→violet gradient. ~430 lines. |
| `web/app/main.js` | rewired | Drives a `PlasmaScene` per canvas, feeds simulator state every frame, mounts HUD overlays. Loop now skips ticking off-screen modes for performance. |

### Performance

- 2400 particles per scene × up to 4 simultaneous scenes (Learn, Operator,
  Race-Human, Race-AI) = ~10k particles total. **Render cost: trivial**;
  ran at full 60 fps in Chrome on the test machine.
- Geometry buffers allocated once at construction; no allocations in the
  per-frame `update()` (all uniform writes).
- `ResizeObserver` per canvas keeps the WebGL viewport in sync with CSS
  layout changes (mode tab switching, window resize).

### Verification

Verified in real Chrome during the session:

- **Learn mode**: dragging heating to 200 MW → plasma shifts cyan → magenta;
  density slider → field volume responds; HUD updates live; gauges flip
  warn/danger as ratios cross thresholds.
- **Operator mode**: keyboard W/S/A/D control works; survival timer
  counts up; disturbance pulses fire visibly through the particle field;
  disruption latches red.
- **AI vs You**: random-agent run shows the AI side hitting "Near
  operational limit" amber at 1.34 s while the human side stays green,
  exactly the dramatic comparison the project is built around.

---

## Final repository state

```text
fusionpilot/
├── README.md                       — main project README (pass 2 rewrite)
├── CHANGELOG.md                    — this file
├── index.html                      — root redirect to /web/
├── pyproject.toml                  — Python deps (numpy required; rl/dev optional)
├── .gitignore                      — generated artifacts excluded
│
├── sim/                            — pure Python simulator (NumPy only)
│   ├── plasma0d.py                 — physics: state, step, disruption
│   ├── disturbances.py             — ELM / pumpout / heating-noise scheduler (+gentle preset)
│   ├── controllers.py              — random / constant / rule-based / tuned + episode runner
│   ├── reward.py                   — single source of truth for reward
│   └── validation_plots.py         — SVG plots + survival/reward bar chart
│
├── rl/                             — optional Gym + SB3 layer
│   ├── env.py                      — FusionPlasma0DEnv (lazy gym import)
│   ├── train_sac.py                — one-shot SAC training
│   ├── evaluate.py                 — multi-seed comparison table
│   └── export_trajectories.py      — JSON exports for the frontend
│
├── tests/                          — 13 unittests
│   ├── test_plasma0d.py            — physics behavior tests
│   ├── test_reward.py              — reward shaping invariants
│   └── test_env.py                 — env smoke (auto-skip without gym)
│
├── scripts/
│   └── serve.py                    — one-command HTTP server
│
├── web/                            — vanilla-JS frontend, no build step
│   ├── index.html                  — three-mode SPA, importmap loads three.js
│   ├── style.css                   — futuristic glassmorphism theme
│   ├── sim/
│   │   ├── plasma.js               — JS port of sim/plasma0d.py
│   │   └── rng.js                  — seeded mulberry32 RNG
│   └── app/
│       ├── main.js                 — app wiring + animation loop
│       ├── plasma3d.js             — Three.js particle renderer
│       └── gauges.js               — numeric gauges
│
├── docs/
│   ├── physics_model.md
│   ├── validation.md               — pass 2 rewrite
│   ├── demo.md                     — 2-minute presenter script
│   ├── eval_results.json           — generated
│   ├── survival_comparison.svg     — generated
│   └── validation_*.svg            — generated
│
├── trajectories/
│   ├── random_agent.json
│   ├── constant_agent.json
│   ├── rule_based_agent.json
│   └── trained_agent.json          — placeholder until SAC trains
│
└── 00_..08_*.md                    — original planning specs (kept untouched)
```

---

## How to run everything

### Base install (sim + frontend, no RL)

```bash
pip install -e .

# Tests
python -m unittest discover -s tests

# Regenerate validation plots and survival/reward bar chart
python -m sim.validation_plots

# Regenerate the four demo trajectories the frontend replays
python -m rl.export_trajectories

# Boot the browser demo at http://localhost:8000/web/
python scripts/serve.py
```

### With RL training

```bash
pip install -e .[rl]
python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip
python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip
python -m rl.evaluate --sac-checkpoint checkpoints/sac.zip --seeds 0 1 2 3 4 5 6 7 8 9
```

After training, the browser demo's `trained_agent` slot picks up the new
trajectory automatically — the placeholder badge in the UI disappears.

### Live policy comparison numbers (current state)

```
Policy comparison over seeds [0..9]:
  policy         mean_s   std_s     reward  disrupt%
  random           4.84    3.08       52.7      100%
  constant        20.00    0.00      648.3        0%
  rule_based      20.00    0.00      729.4        0%
  tuned           20.00    0.00      774.9        0%
```

Random disrupts on every seed; baselines all survive but vary in reward.
That's the headroom a trained SAC agent will push further.

---

## What's next

In priority order:

### 1. Train SAC and replace the placeholder *(critical, ~30 min wall-clock)*

```bash
pip install -e .[rl]
python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip
python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip
```

This is the only step needed to remove every "placeholder" badge from the
UI and the trajectory metadata. Everything downstream is already wired
to consume the resulting checkpoint. Difficulty: **easy** (just runtime).

### 2. Live reward / temperature sparkline under each canvas *(visual)*

A 200-pixel-wide canvas strip below each hero canvas, drawing a ring
buffer of recent T_keV or reward as a glowing line. Pushes the demo from
"looks great" to "looks like a real reactor console." No new
dependencies; ~80 lines of JS in a new `web/app/sparkline.js`.

### 3. Reward tuning after first SAC run *(important)*

The current reward weights in `sim/reward.py` are heuristic. Once SAC
converges, rerun `rl/evaluate.py` and tune:

- If the agent under-targets density → raise `n_error_weight`.
- If it survives but gets low fusion → raise `fusion_bonus_weight`.
- If it tracks targets but disrupts on disturbances → lower
  `T_target_keV`/`n_target` for safer headroom, or raise the limit
  penalty weights.

### 4. Compact policy ranking footer in Race mode *(medium)*

A bottom strip on the AI-vs-You page that shows mean survival/reward of
all four policies across the same seeds, computed once at page load by
`fetch`-ing all four trajectories. Lets a judge see the policy hierarchy
without leaving the page.

### 5. ONNX-in-browser for live policy inference *(stretch, not required)*

Replace JSON replay with a real-time policy roll-out by exporting the SAC
actor to ONNX and running it via `onnxruntime-web`. Documented as a
stretch goal; **do not start until everything else lands**.

### 6. Record the 90-second demo video *(submission requirement)*

Follow the script in [`docs/demo.md`](docs/demo.md). The same script
maps cleanly to the [`08_DEVPOST_AND_PRESENTATION_COPY.md`](08_DEVPOST_AND_PRESENTATION_COPY.md)
template that's already in the repo.

### 7. (Out of scope but tempting) better physics

Bosch–Hale D–T reactivity instead of the toy fit; simple H-mode/L-mode
mode transition; current-driven sawteeth. **Don't do this for the
hackathon** — the toy model differentiates policies enough for the
control story, and tuning real physics will eat a day. Park as a v2.

---

## What NOT to do (anti-goals from the review)

- **Don't introduce npm / Vite / a build step** for the frontend. The
  "clone → `python scripts/serve.py` → done" property is a strong demo
  asset and is preserved by importmap-from-CDN.
- **Don't claim the demo is a real tokamak controller.** The honest
  framing in the README and the page footer is the project's strongest
  defense in Q&A. Keep it.
- **Don't add a 4-checkpoint selector** (random / early / mid / trained).
  Two checkpoints (random + trained) tells the entire story and cuts
  training time in half. The current dropdown supporting 4 is fine; just
  don't *require* all 4 to be trained.
- **Don't refactor `sim/` further.** It's already the cleanest module in
  the repo. Refactor energy is demo time you don't have.
- **Don't tune SAC for 500k steps before you've tuned for 50k.** If 50k
  doesn't beat random by a clear margin, the bug is reward shaping, not
  training duration.
- **Don't add bloom / postprocessing passes** to the Three.js scene
  unless you confirm the additive shader isn't bright enough. The
  current shader does its own additive blend; postprocessing would add
  weight (and complexity) without much visible gain.

---

## Acknowledgements / inspiration

- **Visual direction**: [particles.casberry.in](https://particles.casberry.in)
  for the glowing-additive-particle aesthetic that the Three.js renderer
  channels.
- **Project framing**: Degrave et al. 2022 (DeepMind, magnetic control of
  tokamak plasmas with deep RL); Seo et al. 2024 (KAIST, RL avoidance of
  tearing instabilities); Tracey et al. 2024 (DeepMind, practical RL for
  tokamak magnetic control).

FusionPilot is **not** a real tokamak controller. It is a simplified
educational simulator that compresses real fusion-control intuition into
a 30-second browser demo.
