"""Evaluate baseline controllers (and optionally a trained SAC agent) on a
fixed set of disturbance seeds, then print and save a comparison table.

Run:

    python -m rl.evaluate --seeds 0 1 2 3 4 5 6 7 8 9
    python -m rl.evaluate --seeds 0 1 2 3 4 --sac-checkpoint checkpoints/sac.zip

The output JSON is consumed by :func:`sim.validation_plots.plot_survival_bar`
to render ``docs/survival_comparison.svg``.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean, stdev
from typing import Any

from sim.controllers import (
    Controller,
    constant_controller,
    random_controller,
    rule_based_controller,
    run_episode,
    tuned_controller,
)
from sim.plasma0d import PlasmaConfig


def _eval_one(name: str, controller_factory, seeds: list[int], seconds: float) -> dict[str, Any]:
    survivals: list[float] = []
    rewards: list[float] = []
    disrupted_count = 0
    for seed in seeds:
        controller = controller_factory(seed)
        _, metrics = run_episode(controller, seed=seed, disturbances=True, seconds=seconds)
        survivals.append(metrics.survival_time_s)
        rewards.append(metrics.total_reward)
        if metrics.disrupted:
            disrupted_count += 1
    return {
        "name": name,
        "seeds": seeds,
        "mean_survival_s": float(mean(survivals)),
        "std_survival_s": float(stdev(survivals)) if len(survivals) > 1 else 0.0,
        "mean_reward": float(mean(rewards)),
        "disruption_rate": disrupted_count / len(seeds),
        "per_seed_survival_s": survivals,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seeds", type=int, nargs="+", default=list(range(10)))
    parser.add_argument("--seconds", type=float, default=20.0)
    parser.add_argument("--out", default="docs/eval_results.json")
    parser.add_argument("--sac-checkpoint", default=None)
    args = parser.parse_args()

    cfg = PlasmaConfig()
    seeds = list(args.seeds)
    seconds = float(args.seconds)

    results = [
        _eval_one("random", lambda s: random_controller(seed=s), seeds, seconds),
        _eval_one("constant", lambda _s: constant_controller(), seeds, seconds),
        _eval_one("rule_based", lambda _s: rule_based_controller(), seeds, seconds),
        _eval_one("tuned", lambda _s: tuned_controller(), seeds, seconds),
    ]

    if args.sac_checkpoint:
        from rl.export_trajectories import _sac_controller

        ckpt = Path(args.sac_checkpoint)
        if not ckpt.exists():
            raise SystemExit(f"SAC checkpoint not found: {ckpt}")
        sac_policy: Controller = _sac_controller(ckpt, cfg)
        results.append(
            _eval_one("sac", lambda _s, _p=sac_policy: _p, seeds, seconds)
        )

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps({"results": results}, indent=2), encoding="utf-8")

    print(f"\nSurvival comparison over seeds {seeds}:")
    print(f"  {'policy':<14} {'mean_s':>8} {'std_s':>7} {'reward':>10} {'disrupt%':>9}")
    for row in results:
        print(
            f"  {row['name']:<14} "
            f"{row['mean_survival_s']:>8.2f} "
            f"{row['std_survival_s']:>7.2f} "
            f"{row['mean_reward']:>10.1f} "
            f"{row['disruption_rate'] * 100:>8.0f}%"
        )
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
