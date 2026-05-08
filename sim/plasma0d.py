"""Toy 0D fusion-plasma simulator.

The model is deliberately simple: it tracks volume-averaged temperature,
density, stored thermal energy, confinement, fusion power, and two toy
operational limits. It is useful for education and RL experimentation, not
for tokamak prediction.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from math import exp, isfinite
from typing import Any

import numpy as np


@dataclass(frozen=True)
class PlasmaConstants:
    e_charge: float = 1.602176634e-19
    volume_m3: float = 800.0
    tau_E0_s: float = 2.0
    tau_p0_s: float = 2.0
    greenwald_limit: float = 1.2e20
    pressure_limit: float = 1.8e21

    @property
    def keV_to_J(self) -> float:
        return 1000.0 * self.e_charge

    @property
    def MeV_to_J(self) -> float:
        return 1.0e6 * self.e_charge

    @property
    def E_fusion_J(self) -> float:
        return 17.6 * self.MeV_to_J

    @property
    def E_alpha_J(self) -> float:
        return 3.5 * self.MeV_to_J


@dataclass(frozen=True)
class PlasmaConfig:
    constants: PlasmaConstants = PlasmaConstants()
    dt_s: float = 0.02
    P_ext_min_W: float = 0.0
    P_ext_max_W: float = 220.0e6
    S_fuel_min: float = 0.0
    S_fuel_max: float = 1.5e20
    dP_ext_max_per_s: float = 600.0e6
    dS_fuel_max_per_s: float = 4.0e20
    W_min_J: float = 1.0e3
    n_min: float = 1.0e17
    T_min_disrupt_keV: float = 1.0
    T_max_disrupt_keV: float = 50.0
    beta_disrupt_ratio: float = 1.10
    greenwald_disrupt_ratio: float = 1.10
    confinement_soft_start: float = 0.80
    confinement_k: float = 8.0


@dataclass(frozen=True)
class PlasmaAction:
    P_ext_W: float
    S_fuel: float


@dataclass(frozen=True)
class PlasmaState:
    time_s: float
    T_keV: float
    n: float
    W_J: float
    tau_E_s: float
    tau_p_s: float
    P_fusion_W: float
    P_alpha_W: float
    beta_ratio: float
    greenwald_ratio: float
    stability: float
    P_ext_W: float = 0.0
    S_fuel: float = 0.0
    disrupted: bool = False
    disruption_reason: str | None = None
    disturbance: str | None = None
    dTdt_keV_per_s: float = 0.0
    dndt_per_s: float = 0.0
    time_since_disturbance_s: float = 999.0


@dataclass(frozen=True)
class StepResult:
    state: PlasmaState
    requested_action: PlasmaAction
    applied_action: PlasmaAction
    info: dict[str, Any]


def clamp(value: float, lo: float, hi: float) -> float:
    return min(max(value, lo), hi)


def map_range(value: float, in_min: float, in_max: float, out_min: float, out_max: float) -> float:
    fraction = (value - in_min) / (in_max - in_min)
    return out_min + fraction * (out_max - out_min)


def stored_energy_J(T_keV: float, n: float, constants: PlasmaConstants | None = None) -> float:
    c = constants or PlasmaConstants()
    return 3.0 * n * c.volume_m3 * T_keV * c.keV_to_J


def temperature_keV(W_J: float, n: float, constants: PlasmaConstants | None = None) -> float:
    c = constants or PlasmaConstants()
    n_safe = max(n, 1.0e-30)
    return W_J / (3.0 * n_safe * c.volume_m3 * c.keV_to_J)


def dt_reactivity_toy(T_keV: float) -> float:
    """Smooth toy D-T reactivity fit over the demo range."""

    T = float(np.clip(T_keV, 0.1, 50.0))
    return 1.1e-24 * T**2 / (1.0 + (T / 50.0) ** 2)


def fusion_powers_W(T_keV: float, n: float, constants: PlasmaConstants | None = None) -> tuple[float, float]:
    c = constants or PlasmaConstants()
    reactivity = dt_reactivity_toy(T_keV)
    P_fusion = 0.25 * n**2 * reactivity * c.E_fusion_J * c.volume_m3
    P_alpha = 0.25 * n**2 * reactivity * c.E_alpha_J * c.volume_m3
    return P_fusion, P_alpha


def confinement_factor(ratio: float, start: float = 0.80, k: float = 8.0) -> float:
    excess = max(0.0, ratio - start)
    return exp(-k * excess**2)


def limit_ratios(T_keV: float, n: float, constants: PlasmaConstants | None = None) -> tuple[float, float]:
    c = constants or PlasmaConstants()
    beta_ratio = n * T_keV / c.pressure_limit
    greenwald_ratio = n / c.greenwald_limit
    return beta_ratio, greenwald_ratio


def confinement_times_s(
    beta_ratio: float,
    greenwald_ratio: float,
    config: PlasmaConfig | None = None,
) -> tuple[float, float]:
    cfg = config or PlasmaConfig()
    c = cfg.constants
    f_beta = confinement_factor(beta_ratio, cfg.confinement_soft_start, cfg.confinement_k)
    f_n = confinement_factor(greenwald_ratio, cfg.confinement_soft_start, cfg.confinement_k)
    tau_E = float(np.clip(c.tau_E0_s * f_beta * f_n, 0.05, c.tau_E0_s))
    tau_p = float(np.clip(c.tau_p0_s * f_n, 0.05, c.tau_p0_s))
    return tau_E, tau_p


def stability_margin(beta_ratio: float, greenwald_ratio: float) -> float:
    return float(np.clip(1.0 - max(beta_ratio, greenwald_ratio) / 1.10, 0.0, 1.0))


def compute_state(
    *,
    time_s: float,
    W_J: float,
    n: float,
    P_ext_W: float = 0.0,
    S_fuel: float = 0.0,
    disrupted: bool = False,
    disruption_reason: str | None = None,
    disturbance: str | None = None,
    dTdt_keV_per_s: float = 0.0,
    dndt_per_s: float = 0.0,
    time_since_disturbance_s: float = 999.0,
    config: PlasmaConfig | None = None,
) -> PlasmaState:
    cfg = config or PlasmaConfig()
    W_safe = max(float(W_J), cfg.W_min_J)
    n_safe = max(float(n), cfg.n_min)
    T = temperature_keV(W_safe, n_safe, cfg.constants)
    beta, greenwald = limit_ratios(T, n_safe, cfg.constants)
    tau_E, tau_p = confinement_times_s(beta, greenwald, cfg)
    P_fusion, P_alpha = fusion_powers_W(T, n_safe, cfg.constants)
    return PlasmaState(
        time_s=float(time_s),
        T_keV=float(T),
        n=float(n_safe),
        W_J=float(W_safe),
        tau_E_s=float(tau_E),
        tau_p_s=float(tau_p),
        P_fusion_W=float(P_fusion),
        P_alpha_W=float(P_alpha),
        beta_ratio=float(beta),
        greenwald_ratio=float(greenwald),
        stability=stability_margin(beta, greenwald),
        P_ext_W=float(P_ext_W),
        S_fuel=float(S_fuel),
        disrupted=disrupted,
        disruption_reason=disruption_reason,
        disturbance=disturbance,
        dTdt_keV_per_s=float(dTdt_keV_per_s),
        dndt_per_s=float(dndt_per_s),
        time_since_disturbance_s=float(time_since_disturbance_s),
    )


def initial_state(
    T_keV: float = 10.0,
    n: float = 0.65e20,
    config: PlasmaConfig | None = None,
) -> PlasmaState:
    cfg = config or PlasmaConfig()
    W = stored_energy_J(T_keV, n, cfg.constants)
    return compute_state(time_s=0.0, W_J=W, n=n, config=cfg)


def requested_to_applied_action(
    state: PlasmaState,
    requested: PlasmaAction,
    config: PlasmaConfig,
) -> PlasmaAction:
    P_target = clamp(requested.P_ext_W, config.P_ext_min_W, config.P_ext_max_W)
    S_target = clamp(requested.S_fuel, config.S_fuel_min, config.S_fuel_max)

    max_dP = config.dP_ext_max_per_s * config.dt_s
    max_dS = config.dS_fuel_max_per_s * config.dt_s
    P_next = state.P_ext_W + clamp(P_target - state.P_ext_W, -max_dP, max_dP)
    S_next = state.S_fuel + clamp(S_target - state.S_fuel, -max_dS, max_dS)
    return PlasmaAction(P_ext_W=P_next, S_fuel=S_next)


def disruption_reason(state: PlasmaState, config: PlasmaConfig) -> str | None:
    values = [
        state.T_keV,
        state.n,
        state.W_J,
        state.tau_E_s,
        state.tau_p_s,
        state.P_fusion_W,
        state.P_alpha_W,
        state.beta_ratio,
        state.greenwald_ratio,
    ]
    if any(not isfinite(v) for v in values):
        return "non-finite numerical state"
    if state.beta_ratio > config.beta_disrupt_ratio:
        return "pressure limit exceeded"
    if state.greenwald_ratio > config.greenwald_disrupt_ratio:
        return "density limit exceeded"
    if state.T_keV < config.T_min_disrupt_keV:
        return "temperature collapsed"
    if state.T_keV > config.T_max_disrupt_keV:
        return "temperature runaway"
    return None


def step(
    state: PlasmaState,
    requested_action: PlasmaAction,
    *,
    config: PlasmaConfig | None = None,
    disturbance_model: Any | None = None,
) -> StepResult:
    """Advance the plasma by one time step."""

    cfg = config or PlasmaConfig()
    if state.disrupted:
        return StepResult(
            state=state,
            requested_action=requested_action,
            applied_action=PlasmaAction(state.P_ext_W, state.S_fuel),
            info={"already_disrupted": True},
        )

    applied = requested_to_applied_action(state, requested_action, cfg)
    P_ext_actual = applied.P_ext_W
    W = state.W_J
    n = state.n
    disturbance = None

    if disturbance_model is not None:
        event = disturbance_model.apply(state.time_s, W, n, P_ext_actual)
        W = max(event.W_J, cfg.W_min_J)
        n = max(event.n, cfg.n_min)
        P_ext_actual = event.P_ext_actual_W
        disturbance = event.kind

    disturbed_T = temperature_keV(W, n, cfg.constants)
    beta, greenwald = limit_ratios(disturbed_T, n, cfg.constants)
    tau_E, tau_p = confinement_times_s(beta, greenwald, cfg)
    P_fusion, P_alpha = fusion_powers_W(disturbed_T, n, cfg.constants)

    dWdt = P_ext_actual + P_alpha - W / tau_E
    dndt = applied.S_fuel - n / tau_p

    W_next = max(W + cfg.dt_s * dWdt, cfg.W_min_J)
    n_next = max(n + cfg.dt_s * dndt, cfg.n_min)

    next_base = compute_state(
        time_s=state.time_s + cfg.dt_s,
        W_J=W_next,
        n=n_next,
        P_ext_W=applied.P_ext_W,
        S_fuel=applied.S_fuel,
        disturbance=disturbance,
        time_since_disturbance_s=0.0
        if disturbance is not None
        else state.time_since_disturbance_s + cfg.dt_s,
        config=cfg,
    )

    reason = disruption_reason(next_base, cfg)
    next_state = replace(
        next_base,
        disrupted=reason is not None,
        disruption_reason=reason,
        dTdt_keV_per_s=(next_base.T_keV - state.T_keV) / cfg.dt_s,
        dndt_per_s=(next_base.n - state.n) / cfg.dt_s,
    )

    return StepResult(
        state=next_state,
        requested_action=requested_action,
        applied_action=applied,
        info={
            "P_ext_actual_W": P_ext_actual,
            "dWdt_W": dWdt,
            "dndt_per_s": dndt,
            "disturbance": disturbance,
        },
    )
