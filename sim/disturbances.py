"""Disturbance models for the FusionPilot toy plasma."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class DisturbanceEvent:
    W_J: float
    n: float
    P_ext_actual_W: float
    kind: str | None


@dataclass(frozen=True)
class DisturbanceConfig:
    """Disturbance schedule.

    Defaults are tuned to be ``hard enough that constant/rule-based policies
    sometimes fail`` so the survival-comparison demo has visible structure.
    For a gentler easy mode (used by the manual "Learn the Plasma" UI), use
    :func:`gentle_config`.
    """

    enabled: bool = True
    elm_interval_s: tuple[float, float] = (0.12, 0.40)
    elm_loss_fraction: tuple[float, float] = (0.18, 0.38)
    pumpout_interval_s: tuple[float, float] = (0.9, 2.2)
    pumpout_fraction: tuple[float, float] = (0.14, 0.28)
    heating_noise_std: float = 0.06


def gentle_config() -> "DisturbanceConfig":
    """Light disturbance schedule for the educational manual mode."""

    return DisturbanceConfig(
        elm_interval_s=(0.4, 1.1),
        elm_loss_fraction=(0.05, 0.12),
        pumpout_interval_s=(2.5, 5.0),
        pumpout_fraction=(0.04, 0.10),
        heating_noise_std=0.02,
    )


class DisturbanceGenerator:
    """Schedules ELM-like energy loss, density pumpout, and heating noise."""

    def __init__(self, seed: int | None = None, config: DisturbanceConfig | None = None) -> None:
        self.config = config or DisturbanceConfig()
        self.rng = np.random.default_rng(seed)
        self.next_elm_s = self._sample_interval(self.config.elm_interval_s)
        self.next_pumpout_s = self._sample_interval(self.config.pumpout_interval_s)

    def _sample_interval(self, bounds: tuple[float, float]) -> float:
        return float(self.rng.uniform(bounds[0], bounds[1]))

    def _sample_fraction(self, bounds: tuple[float, float]) -> float:
        return float(self.rng.uniform(bounds[0], bounds[1]))

    def apply(self, time_s: float, W_J: float, n: float, P_ext_W: float) -> DisturbanceEvent:
        if not self.config.enabled:
            return DisturbanceEvent(W_J=W_J, n=n, P_ext_actual_W=P_ext_W, kind=None)

        kinds: list[str] = []
        W_next = float(W_J)
        n_next = float(n)

        if time_s >= self.next_elm_s:
            loss = self._sample_fraction(self.config.elm_loss_fraction)
            W_next *= 1.0 - loss
            kinds.append("elm")
            self.next_elm_s = time_s + self._sample_interval(self.config.elm_interval_s)

        if time_s >= self.next_pumpout_s:
            loss = self._sample_fraction(self.config.pumpout_fraction)
            n_next *= 1.0 - loss
            kinds.append("pumpout")
            self.next_pumpout_s = time_s + self._sample_interval(self.config.pumpout_interval_s)

        noise = 1.0 + self.config.heating_noise_std * float(self.rng.normal())
        P_ext_actual = max(0.0, P_ext_W * noise)
        return DisturbanceEvent(
            W_J=W_next,
            n=n_next,
            P_ext_actual_W=P_ext_actual,
            kind="+".join(kinds) if kinds else None,
        )
