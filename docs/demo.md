# FusionPilot — 2-minute presenter script

Use this for a hackathon demo, video, or live walk-through. Total
runtime: ~110 seconds. The numbers in parentheses are wall-clock cues.

---

## Setup (do this before the demo)

```bash
pip install -e .                     # one-time
python -m sim.validation_plots       # regenerates SVGs
python -m rl.export_trajectories     # regenerates the four JSON trajectories
python scripts/serve.py              # opens browser to localhost:8000/web/
```

If you have time and a GPU/CPU minute or two:

```bash
pip install -e .[rl]
python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip
python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip
```

This replaces the `trained_agent.json` placeholder with a real SAC
agent's trajectory, and the agent-picker in the browser picks it up
automatically.

---

## Script

### 0–10 s — The hook

> "Real fusion reactors fall over for fun reasons. The plasma is unstable
> on a millisecond scale, and human operators can't keep up. Researchers
> at DeepMind, KAIST, and others trained reinforcement-learning agents to
> stabilize them. FusionPilot is a 30-second taste of *why that matters.*"

(Open browser, you should be on Mode 1 — Learn the Plasma.)

### 10–25 s — Mode 1: Learn

> "This is a 0D toy plasma. Two sliders: heating power and fueling rate.
> Watch the reactor ring: color is temperature, particle spread is density,
> and the motion gets turbulent as stability falls. Drag heating up. T
> rises. Density rises. Fusion power rises. Push too far and the particle
> field fragments."

(Drag the heating slider to max for 5 seconds. The particle ring heats.)

### 25–55 s — Mode 2: Operator Challenge

> "Same plasma, harder disturbances — ELMs and pumpouts firing every
> second. Your job: keep it alive for 20 seconds."

(Click the *2. Operator* tab. Try to control with W/S/A/D. Most users
disrupt within 8–15 s, often by either letting temperature collapse
after a heat dump or chasing it too hard and tripping the pressure limit.)

> "I just disrupted in 12 seconds. I was actively watching the gauges
> and I still couldn't react fast enough. Now watch what a learned
> policy does."

### 55–95 s — Mode 3: AI vs You — the headline

(Click *3. AI vs You*.)

> "Same disturbance schedule on both sides. Pick the random policy first
> — the dropdown."

(Switch to *random*. Click *Start race*.)

> "Random control disrupts at 1.7 seconds, every time."

(The right side immediately turns red.)

> "Now switch to the trained agent."

(Switch the dropdown to *trained (best available)*. Click *Start race*.)

> "Same disturbances. The agent — currently a tuned heuristic placeholder
> until I finish SAC training — survives the full 20 seconds with high
> reward. The reward gap on the right of the screen is the headroom a
> better-trained agent gets to push further."

### 95–110 s — Honest framing

> "FusionPilot is *not* a real tokamak controller. It's a 0D toy model
> with two sliders and a disruption screen. But it makes the gap between
> human reaction time and learned control *intuitive* — which is the
> hardest part of the AI-for-fusion pitch. Code's open source, takes
> two commands to reproduce. Thanks."

---

## What the viewer should remember

1. Plasmas fail in seconds.
2. Random control fails *immediately*.
3. A learned policy survives.
4. The pitch is honesty + intuition, not a fusion-control claim.

## What NOT to claim during the demo

- "We trained an agent that controls a real reactor." — false.
- "Our model predicts ITER plasmas." — false.
- "This is faster than DeepMind's controller." — meaningless comparison.

The framing in the README and the page footer is the same framing to use
out loud. Stick to it.

## Troubleshooting

- **Frontend opens, plasma particles don't move.** Check the browser console.
  Most likely the trajectories didn't fetch — make sure you're hitting
  `localhost:8000/web/`, not `file://`.
- **`trained_agent` shows "placeholder" forever.** That's by design until
  you train SAC end-to-end. Run `python -m rl.train_sac` then
  `python -m rl.export_trajectories --sac-checkpoint ...`.
- **Mode 2 is too easy / too hard.** Tune `DisturbanceConfig` in
  `sim/disturbances.py`.

---

> Inspired by Degrave et al. 2022, Seo et al. 2024, Tracey et al. 2024.
