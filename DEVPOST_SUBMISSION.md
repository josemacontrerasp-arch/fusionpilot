# FusionPilot Devpost Submission Packet

This file is the judge-ready written Devpost copy for FusionPilot. It includes
the required written fields from the hackathon brief. Screenshots and video are
uploaded directly on Devpost and are intentionally not stored in this repo.

## Project Title

**FusionPilot**

## Short Tagline

Can you keep a simulated fusion plasma alive longer than an AI?

## Project Description

### Problem Statement

Fusion energy could become one of the most important clean-energy technologies
of the future, but the control problem is hard for most people to see, feel, or
understand. Plasma stability, heating, fueling, disruptions, and AI control are
usually hidden inside research papers, expensive machines, or highly technical
simulations.

That creates a public understanding gap. Fusion is often described as "clean
energy from the future," but people rarely get to experience why it is difficult
or why intelligent control systems matter.

### Solution Overview

FusionPilot turns the plasma-control problem into a playable browser prototype.
The user adjusts heating and fueling to keep a simplified fusion plasma stable
while disturbances push it toward disruption. Then they can race against an AI
policy under the same conditions.

The project combines a small 0D plasma simulator, a reinforcement-learning SAC
agent, scenario presets, difficulty settings, and a clean particle-based reactor
visual. It is not claiming to control a real tokamak. It is an educational
prototype that makes the core idea intuitive: fusion plasmas need constant
balancing, and AI can help reason about fast unstable systems.

### Key Features

- **Learn Mode:** experiment with heating and fueling sliders and immediately
  see how the plasma responds.
- **Operator Challenge:** survive random actuator drift, ELM-like heat-loss
  events, density pumpouts, and stability limits.
- **AI vs You Race:** human and AI receive mirrored disturbances and actuator
  bumps so the comparison feels fair and understandable.
- **Trained SAC Agent:** a real Stable-Baselines3 SAC policy was trained and
  exported into browser-readable JSON for live race mode.
- **Policy Choices:** compare trained SAC, rule-based, constant, and random
  policies.
- **Difficulty Settings:** Easy, Normal, and Hard tune the size and intensity of
  control disturbances.
- **Reactor Scenarios:** Standard, Compact, Heavy, Storm, and Precision change
  the reactor feel, stability margins, disturbance weather, and round pacing.
- **Failure Theory:** after a disruption, the app explains what likely failed
  using plasma pressure, temperature, density, and stability logic.
- **Premium Plasma Visual:** a clean Three.js particle torus with cyan, violet,
  magenta, and electric-blue particles.
- **Hackathon-Friendly Demo Flow:** three clear panels show learning, manual
  control, and AI-vs-human comparison without needing a backend server.

### Technologies Used

- Python
- NumPy
- Gymnasium
- Stable-Baselines3 SAC
- Vanilla JavaScript
- Three.js
- GLSL-style particle shader material
- HTML / CSS
- JSON model and trajectory exports
- Node.js / npm scripts
- VS Code
- OpenAI Codex
- Claude Code

### Target Users

- Students learning about fusion energy or AI control
- Educators and science communicators explaining why fusion is hard
- Hackathon judges evaluating practical AI-for-science prototypes
- Developers curious about reinforcement learning and simulation
- General users who want an interactive way to understand clean-energy research

### Positive Social Impact

FusionPilot supports clean-energy education. It makes a complex scientific
problem approachable, visual, and interactive instead of abstract. By helping
non-experts understand plasma instability and AI-assisted control, it can
increase curiosity around fusion energy, AI-for-science, and the engineering
needed for future low-carbon power systems.

## Project Link / Repository

Repository:

https://github.com/josemacontrerasp-arch/fusionpilot

Live demo:

No hosted deployment yet. The project runs locally from the repository.

Local demo command:

```bash
npm install
npm run dev
```

Then open:

```text
http://localhost:5173/web/
```

Alternative static server:

```bash
python scripts/serve.py
```

Then open:

```text
http://localhost:8000/web/
```

## Team Details

Solo submission:

**Jose Maria Contreras Prada** - concept, simulation, frontend, reinforcement
learning training, visual design, documentation, and demo preparation.

## AI Usage

FusionPilot uses two kinds of AI:

- **In the product:** a SAC reinforcement-learning policy trained with
  Stable-Baselines3 to control heating and fueling in the toy plasma simulator.
- **During development:** OpenAI Codex and Claude Code supported coding,
  debugging, documentation, implementation planning, and design iteration. The
  project direction, testing choices, final scope, and hackathon decisions were
  made by the developer.

## Honest Scope Notes For Judges

- FusionPilot is an educational 0D toy plasma simulator, not a real tokamak
  controller.
- The trained SAC agent survives the standard benchmark, but a tuned heuristic
  still slightly beats it on mean reward in the current evaluation.
- Scenario modes are built for demo clarity and intuition; they are not
  calibrated reactor designs.
- The current prototype is strongest as an interactive learning tool for
  AI-assisted scientific control.

## Submission Checklist

- [x] Project title is clear and memorable.
- [x] Problem statement is included.
- [x] Solution overview is included.
- [x] Key features are included.
- [x] Technologies used are included.
- [x] Target users are included.
- [x] Positive social impact is explained.
- [x] Repository link is included.
- [x] Team details are included.
- [x] Local run instructions are included.
- [x] Screenshots and video are uploaded directly on Devpost.
