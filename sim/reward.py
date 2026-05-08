"""Single source of truth for FusionPilot reward shaping.

Both the rule-based episode runner (sim.controllers.run_episode) and the
Gymnasium environment (rl.env) import from here so reward tuning stays
consistent.

Reward components (all summed):
- alive bonus
- temperature/density tracking errors against a soft target
- fusion power bonus (saturating)
- limit-avoidance penalties (beta + Greenwald) above 0.80 of the trip line
- action magnitude penalty
- action jerk penalty (only if a previous action is supplied)
- disruption cliff
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .plasma0d import PlasmaState


@dataclass(frozen=True)
class RewardWeights:
    alive_bonus: float = 1.0
    T_target_keV: float = 15.0
    n_target: float = 0.80e20
    T_error_weight: float = 0.5
    n_error_weight: float = 0.5
    fusion_bonus_weight: float = 0.2
    fusion_scale_W: float = 300.0e6
    beta_soft_start: float = 0.80
    n_soft_start: float = 0.80
    limit_penalty_weight: float = 3.0
    action_cost_weight: float = 0.01
    action_jerk_weight: float = 0.02
    disruption_penalty: float = 100.0


DEFAULT_WEIGHTS = RewardWeights()


def compute_reward(
    state: PlasmaState,
    action_norm: np.ndarray,
    prev_action_norm: np.ndarray | None = None,
    weights: RewardWeights = DEFAULT_WEIGHTS,
) -> float:
    """Reward for one transition.

    Both ``action_norm`` and ``prev_action_norm`` are expected in the
    normalized [-1, 1] action space used by the Gym env. The episode runner
    converts physical actions to this scale before calling.
    """

    w = weights
    reward = w.alive_bonus

    T_err = (state.T_keV - w.T_target_keV) / w.T_target_keV
    n_err = (state.n - w.n_target) / w.n_target
    reward -= w.T_error_weight * T_err * T_err
    reward -= w.n_error_weight * n_err * n_err

    reward += w.fusion_bonus_weight * float(np.tanh(state.P_fusion_W / w.fusion_scale_W))

    beta_excess = max(0.0, state.beta_ratio - w.beta_soft_start)
    n_excess = max(0.0, state.greenwald_ratio - w.n_soft_start)
    reward -= w.limit_penalty_weight * beta_excess * beta_excess
    reward -= w.limit_penalty_weight * n_excess * n_excess

    a = np.asarray(action_norm, dtype=np.float64)
    reward -= w.action_cost_weight * float(np.sum(a * a))
    if prev_action_norm is not None:
        d = a - np.asarray(prev_action_norm, dtype=np.float64)
        reward -= w.action_jerk_weight * float(np.sum(d * d))

    if state.disrupted:
        reward -= w.disruption_penalty

    return float(reward)


def physical_action_to_normalized(
    P_ext_W: float,
    S_fuel: float,
    P_min: float,
    P_max: float,
    S_min: float,
    S_max: float,
) -> np.ndarray:
    """Map a physical (P_ext, S_fuel) action into the [-1, 1] policy space."""

    p = (P_ext_W - P_min) / (P_max - P_min) * 2.0 - 1.0
    s = (S_fuel - S_min) / (S_max - S_min) * 2.0 - 1.0
    return np.clip(np.array([p, s], dtype=np.float64), -1.0, 1.0)
