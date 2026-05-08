"""Gymnasium wrapper for the FusionPilot 0D simulator.

The env is intentionally minimal:

- 8-dimensional normalized observation
- 2-dimensional continuous action in [-1, 1]^2 mapped to physical heating
  power and fueling rate
- Reward is delegated to :mod:`sim.reward` (single source of truth shared
  with the non-RL episode runner)
- Episode terminates on disruption or after ``episode_seconds``

Importing this module does not require Gymnasium. The class is only
instantiated lazily; if Gymnasium is missing we raise a clear ImportError at
construction time and the rest of the project still imports cleanly.
"""

from __future__ import annotations

from typing import Any

import numpy as np

from sim.disturbances import DisturbanceGenerator
from sim.plasma0d import PlasmaAction, PlasmaConfig, PlasmaState, initial_state, map_range, step
from sim.reward import compute_reward

try:  # pragma: no cover - optional dep
    import gymnasium as gym
except ImportError:
    gym = None  # type: ignore[assignment]


def observation_from_state(state: PlasmaState) -> np.ndarray:
    """Normalized 8-D observation expected by the SAC policy."""

    obs = np.array(
        [
            state.T_keV / 20.0,
            state.n / 1.0e20,
            state.dTdt_keV_per_s / 10.0,
            state.dndt_per_s / 1.0e20,
            state.beta_ratio,
            state.greenwald_ratio,
            state.P_fusion_W / 500.0e6,
            state.time_since_disturbance_s / 5.0,
        ],
        dtype=np.float32,
    )
    return np.clip(obs, -5.0, 5.0)


if gym is not None:
    _BaseEnv: type = gym.Env  # type: ignore[assignment]
else:
    _BaseEnv = object  # type: ignore[assignment]


class FusionPlasma0DEnv(_BaseEnv):
    """Single-agent continuous-control env wrapping the 0D plasma simulator."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        *,
        config: PlasmaConfig | None = None,
        episode_seconds: float = 20.0,
        disturbance_seed: int | None = None,
        disturbances: bool = True,
    ) -> None:
        if gym is None:
            raise ImportError(
                "Gymnasium is required for FusionPlasma0DEnv. "
                "Install with: pip install -e .[rl]"
            )

        self.config = config or PlasmaConfig()
        self.episode_seconds = episode_seconds
        self.max_steps = int(episode_seconds / self.config.dt_s)
        self.disturbance_seed = disturbance_seed
        self.disturbances_enabled = disturbances

        self.action_space = gym.spaces.Box(
            low=np.array([-1.0, -1.0], dtype=np.float32),
            high=np.array([1.0, 1.0], dtype=np.float32),
            dtype=np.float32,
        )
        self.observation_space = gym.spaces.Box(
            low=np.full(8, -5.0, dtype=np.float32),
            high=np.full(8, 5.0, dtype=np.float32),
            dtype=np.float32,
        )

        self.state: PlasmaState = initial_state(config=self.config)
        self.disturbances: DisturbanceGenerator | None = (
            DisturbanceGenerator(seed=disturbance_seed) if disturbances else None
        )
        self.steps = 0
        self.prev_action = np.zeros(2, dtype=np.float32)

    def reset(self, *, seed: int | None = None, options: dict[str, Any] | None = None):
        super().reset(seed=seed)
        actual_seed = self.disturbance_seed if seed is None else seed
        self.state = initial_state(config=self.config)
        self.disturbances = (
            DisturbanceGenerator(seed=actual_seed) if self.disturbances_enabled else None
        )
        self.steps = 0
        self.prev_action = np.zeros(2, dtype=np.float32)
        return observation_from_state(self.state), {}

    def _physical_action(self, action: np.ndarray) -> PlasmaAction:
        clipped = np.clip(action, -1.0, 1.0)
        return PlasmaAction(
            P_ext_W=float(map_range(clipped[0], -1.0, 1.0, self.config.P_ext_min_W, self.config.P_ext_max_W)),
            S_fuel=float(map_range(clipped[1], -1.0, 1.0, self.config.S_fuel_min, self.config.S_fuel_max)),
        )

    def step(self, action: np.ndarray):
        action = np.asarray(action, dtype=np.float32)
        clipped = np.clip(action, -1.0, 1.0)
        result = step(
            self.state,
            self._physical_action(clipped),
            config=self.config,
            disturbance_model=self.disturbances,
        )
        self.state = result.state
        self.steps += 1
        terminated = self.state.disrupted
        truncated = self.steps >= self.max_steps
        reward = compute_reward(self.state, clipped, self.prev_action)
        self.prev_action = clipped
        return observation_from_state(self.state), reward, terminated, truncated, result.info
