"""Train a SAC agent on the FusionPilot 0D environment.

Run:

    pip install -e .[rl]
    python -m rl.train_sac --steps 50000 --out checkpoints/sac.zip

After training, export the trained-agent trajectory for the frontend:

    python -m rl.export_trajectories --sac-checkpoint checkpoints/sac.zip

Defaults are tuned for "smallest meaningful run that survives longer than the
random baseline on most seeds" — roughly 5–10 minutes on a CPU laptop. For a
better agent, increase ``--steps`` to 200k–500k.

This script is intentionally short. Reward shaping lives in :mod:`sim.reward`
so it stays consistent with the rule-based runner and the survival bench.
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--steps", type=int, default=50_000, help="Total SAC training steps.")
    parser.add_argument(
        "--out",
        type=str,
        default="checkpoints/sac.zip",
        help="Output path for the trained model (.zip).",
    )
    parser.add_argument("--seed", type=int, default=0, help="Training seed.")
    parser.add_argument(
        "--episode-seconds",
        type=float,
        default=20.0,
        help="Episode length in simulated seconds.",
    )
    parser.add_argument(
        "--no-disturbances",
        action="store_true",
        help="Train without disturbances (useful for sanity-checking the env).",
    )
    args = parser.parse_args()

    try:
        from stable_baselines3 import SAC  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "stable-baselines3 is required for training. "
            "Install with: pip install -e .[rl]"
        ) from exc

    from rl.env import FusionPlasma0DEnv

    env = FusionPlasma0DEnv(
        episode_seconds=args.episode_seconds,
        disturbance_seed=args.seed,
        disturbances=not args.no_disturbances,
    )

    model = SAC(
        "MlpPolicy",
        env,
        learning_rate=3e-4,
        buffer_size=100_000,
        learning_starts=2_000,
        batch_size=256,
        tau=0.005,
        gamma=0.99,
        train_freq=1,
        gradient_steps=1,
        seed=args.seed,
        verbose=1,
    )

    print(f"Training SAC for {args.steps} steps...")
    model.learn(total_timesteps=args.steps, progress_bar=False)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    model.save(str(out_path))
    print(f"Saved trained model to {out_path}")


if __name__ == "__main__":
    main()
