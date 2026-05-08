"""Export a trained Stable-Baselines3 SAC actor to browser-readable JSON.

The browser demo is static, so this keeps the trained policy usable without
running Python or ONNX in the page. It exports the deterministic actor path:
observation -> latent MLP -> mu -> tanh(action).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def tensor_to_list(tensor):
    return tensor.detach().cpu().numpy().tolist()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", default="checkpoints/sac.zip")
    parser.add_argument("--out", default="web/policies/sac_actor.json")
    args = parser.parse_args()

    try:
        from stable_baselines3 import SAC  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "stable-baselines3 is required. Install with: pip install -e .[rl]"
        ) from exc

    model = SAC.load(args.checkpoint)
    state = model.policy.actor.state_dict()

    payload = {
        "schema": "fusionpilot-sac-actor-v1",
        "source": Path(args.checkpoint).name,
        "observation": [
            "T_keV / 20",
            "n / 1e20",
            "dTdt_keV_per_s / 10",
            "dndt_per_s / 1e20",
            "beta_ratio",
            "greenwald_ratio",
            "P_fusion_W / 500e6",
            "time_since_disturbance_s / 5",
        ],
        "action": [
            "P_ext_W mapped from tanh(mu[0]) in [-1, 1] to [0, 220e6]",
            "S_fuel mapped from tanh(mu[1]) in [-1, 1] to [0, 1.5e20]",
        ],
        "layers": {
            "latent0": {
                "weight": tensor_to_list(state["latent_pi.0.weight"]),
                "bias": tensor_to_list(state["latent_pi.0.bias"]),
                "activation": "relu",
            },
            "latent2": {
                "weight": tensor_to_list(state["latent_pi.2.weight"]),
                "bias": tensor_to_list(state["latent_pi.2.bias"]),
                "activation": "relu",
            },
            "mu": {
                "weight": tensor_to_list(state["mu.weight"]),
                "bias": tensor_to_list(state["mu.bias"]),
                "activation": "tanh",
            },
        },
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"Exported SAC actor to {out}")


if __name__ == "__main__":
    main()
