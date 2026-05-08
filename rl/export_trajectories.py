"""Export demo trajectories as JSON for frontend replay.

Always produces:

- ``random_agent.json``      — random uniform policy
- ``constant_agent.json``    — fixed mid-range heating + fueling
- ``rule_based_agent.json``  — proportional feedback (renamed from the
  earlier misleading ``pid_controller.json``; the file produced by this
  script is *not* PID)
- ``trained_agent.json``     — best available agent

If a trained SAC checkpoint is available (``--sac-checkpoint``) it is loaded
and its trajectory is exported as ``trained_agent.json``. Otherwise we fall
back to ``tuned_controller``, the strongest hand-coded baseline, and mark
``metadata.placeholder = true`` so the frontend can label it honestly.

This means the demo always works, even before SAC is trained.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np

from sim.controllers import (
    Controller,
    constant_controller,
    random_controller,
    rule_based_controller,
    run_episode,
    tuned_controller,
)
from sim.plasma0d import PlasmaAction, PlasmaConfig


def _record_dt(records: list[dict[str, Any]]) -> float:
    if len(records) < 2:
        return 0.02
    return float(records[1]["t"] - records[0]["t"])


def export_policy(
    name: str,
    controller: Controller,
    output_dir: Path,
    seed: int,
    seconds: float,
    *,
    extra_metadata: dict[str, Any] | None = None,
) -> Path:
    records, metrics = run_episode(controller, seed=seed, disturbances=True, seconds=seconds)
    payload = {
        "metadata": {
            "policy": name,
            "seed": seed,
            "dt": _record_dt(records),
            "survival_time_s": metrics.survival_time_s,
            "disrupted": metrics.disrupted,
            "mean_fusion_power_W": metrics.mean_fusion_power_W,
            "total_reward": metrics.total_reward,
            **(extra_metadata or {}),
        },
        "steps": records,
    }
    output_path = output_dir / f"{name}.json"
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(
        f"[{name}] survived {metrics.survival_time_s:.2f}s, "
        f"disrupted={metrics.disrupted}, reward={metrics.total_reward:.1f} -> {output_path}"
    )
    return output_path


def _sac_controller(checkpoint: Path, config: PlasmaConfig) -> Controller:
    """Wrap a Stable-Baselines3 SAC model as a sim.Controller.

    Imports are local so the rest of the script works without SB3 installed.
    """

    try:
        from stable_baselines3 import SAC  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ImportError(
            "stable-baselines3 is required to load a trained checkpoint. "
            "Install with: pip install -e .[rl]"
        ) from exc

    from rl.env import observation_from_state
    from sim.plasma0d import map_range as _map_range

    model = SAC.load(str(checkpoint))

    def policy(state) -> PlasmaAction:
        obs = observation_from_state(state)
        action, _ = model.predict(obs, deterministic=True)
        a = np.clip(np.asarray(action, dtype=np.float32), -1.0, 1.0)
        return PlasmaAction(
            P_ext_W=float(_map_range(a[0], -1.0, 1.0, config.P_ext_min_W, config.P_ext_max_W)),
            S_fuel=float(_map_range(a[1], -1.0, 1.0, config.S_fuel_min, config.S_fuel_max)),
        )

    return policy


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="trajectories", help="Output directory.")
    parser.add_argument("--seed", type=int, default=7, help="Disturbance seed (shared across exports).")
    parser.add_argument("--seconds", type=float, default=20.0, help="Episode length.")
    parser.add_argument(
        "--sac-checkpoint",
        type=str,
        default=None,
        help="Path to a Stable-Baselines3 SAC .zip. If omitted, the trained agent "
        "trajectory falls back to the tuned-heuristic controller (placeholder).",
    )
    args = parser.parse_args()

    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)

    cfg = PlasmaConfig()
    seed = int(args.seed)
    seconds = float(args.seconds)

    export_policy("random_agent", random_controller(seed=seed), output_dir, seed, seconds)
    export_policy("constant_agent", constant_controller(), output_dir, seed, seconds)
    export_policy("rule_based_agent", rule_based_controller(), output_dir, seed, seconds)

    if args.sac_checkpoint is not None:
        ckpt = Path(args.sac_checkpoint)
        if not ckpt.exists():
            raise SystemExit(f"SAC checkpoint not found: {ckpt}")
        controller = _sac_controller(ckpt, cfg)
        export_policy(
            "trained_agent",
            controller,
            output_dir,
            seed,
            seconds,
            extra_metadata={
                "source": f"SAC checkpoint: {ckpt.name}",
                "placeholder": False,
            },
        )
    else:
        export_policy(
            "trained_agent",
            tuned_controller(),
            output_dir,
            seed,
            seconds,
            extra_metadata={
                "source": "tuned heuristic (SAC checkpoint not yet trained)",
                "placeholder": True,
            },
        )


if __name__ == "__main__":
    main()
