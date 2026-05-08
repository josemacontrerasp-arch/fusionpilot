"""Baseline controllers, episode runner, and trajectory helpers.

Three handcrafted policies are provided:

- ``random_controller`` — uniform actions, held for ``hold_steps`` to avoid
  unrealistically jittery exploration. Mostly disrupts.
- ``constant_controller`` — fixed mid-range heating and fueling. Survives
  quiet episodes, fails under disturbances.
- ``rule_based_controller`` — proportional-with-soft-clamps feedback on the
  temperature and density targets. The strongest non-RL baseline.
- ``tuned_controller`` — same shape as rule-based but with anticipative
  damping after disturbances; intended as a stand-in "skilled operator"
  baseline that the SAC agent should beat.

Reward shaping is imported from :mod:`sim.reward` so the rule-based runner and
the Gym env stay in sync.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np

from .disturbances import DisturbanceGenerator
from .plasma0d import PlasmaAction, PlasmaConfig, PlasmaState, initial_state, step
from .reward import compute_reward, physical_action_to_normalized

Controller = Callable[[PlasmaState], PlasmaAction]


@dataclass(frozen=True)
class EpisodeMetrics:
    survival_time_s: float
    disrupted: bool
    mean_fusion_power_W: float
    mean_action_magnitude: float
    total_reward: float
    steps: int


class _RandomPolicy:
    """Stateful random policy that holds an action for ``hold_steps`` ticks."""

    def __init__(
        self,
        config: PlasmaConfig,
        seed: int | None,
        hold_steps: int,
    ) -> None:
        self.cfg = config
        self.rng = np.random.default_rng(seed)
        self.hold_steps = max(1, int(hold_steps))
        self.counter = 0
        self.current = PlasmaAction(P_ext_W=0.0, S_fuel=0.0)

    def __call__(self, _: PlasmaState) -> PlasmaAction:
        if self.counter % self.hold_steps == 0:
            self.current = PlasmaAction(
                P_ext_W=float(self.rng.uniform(self.cfg.P_ext_min_W, self.cfg.P_ext_max_W)),
                S_fuel=float(self.rng.uniform(self.cfg.S_fuel_min, self.cfg.S_fuel_max)),
            )
        self.counter += 1
        return self.current


def random_controller(
    seed: int | None = None,
    config: PlasmaConfig | None = None,
    hold_steps: int = 25,
) -> Controller:
    return _RandomPolicy(config or PlasmaConfig(), seed, hold_steps)


def constant_controller(P_ext_W: float = 95.0e6, S_fuel: float = 4.0e19) -> Controller:
    def policy(_: PlasmaState) -> PlasmaAction:
        return PlasmaAction(P_ext_W=P_ext_W, S_fuel=S_fuel)

    return policy


def rule_based_controller(
    T_target_keV: float = 15.0,
    n_target: float = 0.80e20,
    config: PlasmaConfig | None = None,
) -> Controller:
    """Proportional feedback with conditional clamps near operational limits."""

    cfg = config or PlasmaConfig()

    def policy(state: PlasmaState) -> PlasmaAction:
        T_error = (T_target_keV - state.T_keV) / T_target_keV
        n_error = (n_target - state.n) / n_target

        P_ext = 92.0e6 + 75.0e6 * T_error
        S_fuel = 4.0e19 + 5.0e19 * n_error

        if state.beta_ratio > 0.86:
            P_ext *= 0.65
        if state.greenwald_ratio > 0.86:
            S_fuel *= 0.60
        if state.T_keV < 6.0:
            P_ext = max(P_ext, 120.0e6)
        if state.n < 0.50e20:
            S_fuel = max(S_fuel, 5.5e19)

        return PlasmaAction(
            P_ext_W=float(np.clip(P_ext, cfg.P_ext_min_W, cfg.P_ext_max_W)),
            S_fuel=float(np.clip(S_fuel, cfg.S_fuel_min, cfg.S_fuel_max)),
        )

    return policy


def tuned_controller(
    T_target_keV: float = 14.0,
    n_target: float = 0.72e20,
    config: PlasmaConfig | None = None,
) -> Controller:
    """Slightly conservative target + post-disturbance recovery boost.

    Acts as the strongest hand-coded baseline. By targeting a lower temperature
    and density we leave more headroom against the soft confinement penalty,
    which empirically extends survival under repeated ELMs.
    """

    cfg = config or PlasmaConfig()

    def policy(state: PlasmaState) -> PlasmaAction:
        T_error = (T_target_keV - state.T_keV) / T_target_keV
        n_error = (n_target - state.n) / n_target

        P_ext = 80.0e6 + 95.0e6 * T_error
        S_fuel = 3.5e19 + 6.0e19 * n_error

        # Boost recovery for ~0.4s after a disturbance event.
        if state.time_since_disturbance_s < 0.4:
            if state.T_keV < T_target_keV:
                P_ext += 35.0e6
            if state.n < n_target:
                S_fuel += 1.5e19

        # Soft pre-emptive cuts approaching limits.
        if state.beta_ratio > 0.78:
            P_ext *= 0.7
        if state.greenwald_ratio > 0.78:
            S_fuel *= 0.55

        # Floor against temperature collapse.
        if state.T_keV < 5.5:
            P_ext = max(P_ext, 140.0e6)
        if state.n < 0.45e20:
            S_fuel = max(S_fuel, 6.0e19)

        return PlasmaAction(
            P_ext_W=float(np.clip(P_ext, cfg.P_ext_min_W, cfg.P_ext_max_W)),
            S_fuel=float(np.clip(S_fuel, cfg.S_fuel_min, cfg.S_fuel_max)),
        )

    return policy


def state_to_record(state: PlasmaState, reward: float | None = None) -> dict[str, Any]:
    record: dict[str, Any] = {
        "t": state.time_s,
        "T_keV": state.T_keV,
        "n": state.n,
        "W": state.W_J,
        "tau_E": state.tau_E_s,
        "P_fusion": state.P_fusion_W,
        "P_alpha": state.P_alpha_W,
        "P_ext": state.P_ext_W,
        "S_fuel": state.S_fuel,
        "beta_ratio": state.beta_ratio,
        "greenwald_ratio": state.greenwald_ratio,
        "stability": state.stability,
        "disturbance": state.disturbance,
        "disrupted": state.disrupted,
        "disruption_reason": state.disruption_reason,
    }
    if reward is not None:
        record["reward"] = reward
    return record


def run_episode(
    controller: Controller,
    *,
    config: PlasmaConfig | None = None,
    seed: int | None = None,
    seconds: float = 20.0,
    disturbances: bool = True,
) -> tuple[list[dict[str, Any]], EpisodeMetrics]:
    """Run a single episode and return (trajectory_records, metrics)."""

    cfg = config or PlasmaConfig()
    disturbance_model = DisturbanceGenerator(seed=seed) if disturbances else None
    state = initial_state(config=cfg)
    records: list[dict[str, Any]] = [state_to_record(state, reward=0.0)]
    action_norms: list[float] = []
    fusion_values: list[float] = []
    rewards: list[float] = []
    max_steps = int(seconds / cfg.dt_s)

    prev_norm = np.zeros(2, dtype=np.float64)
    for _ in range(max_steps):
        action = controller(state)
        result = step(state, action, config=cfg, disturbance_model=disturbance_model)
        state = result.state
        applied = result.applied_action
        a_norm = physical_action_to_normalized(
            applied.P_ext_W,
            applied.S_fuel,
            cfg.P_ext_min_W,
            cfg.P_ext_max_W,
            cfg.S_fuel_min,
            cfg.S_fuel_max,
        )
        reward = compute_reward(state, a_norm, prev_norm)
        prev_norm = a_norm
        records.append(state_to_record(state, reward=reward))
        rewards.append(reward)
        action_norms.append(
            abs(applied.P_ext_W) / cfg.P_ext_max_W
            + abs(applied.S_fuel) / cfg.S_fuel_max
        )
        fusion_values.append(state.P_fusion_W)
        if state.disrupted:
            break

    metrics = EpisodeMetrics(
        survival_time_s=state.time_s,
        disrupted=state.disrupted,
        mean_fusion_power_W=float(np.mean(fusion_values)) if fusion_values else 0.0,
        mean_action_magnitude=float(np.mean(action_norms)) if action_norms else 0.0,
        total_reward=float(np.sum(rewards)) if rewards else 0.0,
        steps=len(records) - 1,
    )
    return records, metrics
