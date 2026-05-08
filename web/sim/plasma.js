// JavaScript port of sim/plasma0d.py and sim/disturbances.py.
//
// Mirrors the Python implementation so the live manual mode in the browser
// produces qualitatively the same dynamics as the recorded trajectories
// (same time step, same balance equations, same disruption thresholds).
// Reward shaping is intentionally a subset: alive bonus + tracking + fusion
// bonus + limit penalties + disruption cliff. The action-jerk penalty is
// dropped because it doesn't add to the visualization.

import { makeRng } from "./rng.js";

// ---------- physical constants ----------
export const CONSTANTS = {
  e_charge: 1.602176634e-19,
  volume_m3: 800.0,
  tau_E0_s: 2.0,
  tau_p0_s: 2.0,
  greenwald_limit: 1.2e20,
  pressure_limit: 1.8e21,
};
CONSTANTS.keV_to_J = 1000 * CONSTANTS.e_charge;
CONSTANTS.MeV_to_J = 1e6 * CONSTANTS.e_charge;
CONSTANTS.E_fusion_J = 17.6 * CONSTANTS.MeV_to_J;
CONSTANTS.E_alpha_J = 3.5 * CONSTANTS.MeV_to_J;

export const DEFAULT_CONFIG = {
  dt_s: 0.02,
  P_ext_min_W: 0.0,
  P_ext_max_W: 220e6,
  S_fuel_min: 0.0,
  S_fuel_max: 1.5e20,
  dP_ext_max_per_s: 600e6,
  dS_fuel_max_per_s: 4e20,
  W_min_J: 1e3,
  n_min: 1e17,
  T_min_disrupt_keV: 1.0,
  T_max_disrupt_keV: 50.0,
  beta_disrupt_ratio: 1.10,
  greenwald_disrupt_ratio: 1.10,
  confinement_soft_start: 0.80,
  confinement_k: 8.0,
};

export const DISTURBANCE_HARD = {
  enabled: true,
  elm_interval_s: [0.12, 0.40],
  elm_loss_fraction: [0.18, 0.38],
  pumpout_interval_s: [0.9, 2.2],
  pumpout_fraction: [0.14, 0.28],
  heating_noise_std: 0.06,
};

export const DISTURBANCE_GENTLE = {
  enabled: true,
  elm_interval_s: [0.4, 1.1],
  elm_loss_fraction: [0.05, 0.12],
  pumpout_interval_s: [2.5, 5.0],
  pumpout_fraction: [0.04, 0.10],
  heating_noise_std: 0.02,
};

// ---------- helpers ----------
function clamp(x, lo, hi) { return Math.min(Math.max(x, lo), hi); }
function mapRange(v, a, b, c, d) { return c + ((v - a) / (b - a)) * (d - c); }

function dtReactivityToy(T_keV) {
  const T = clamp(T_keV, 0.1, 50.0);
  return 1.1e-24 * (T * T) / (1.0 + (T / 50.0) ** 2);
}

function fusionPowers(T_keV, n) {
  const r = dtReactivityToy(T_keV);
  return {
    P_fusion_W: 0.25 * n * n * r * CONSTANTS.E_fusion_J * CONSTANTS.volume_m3,
    P_alpha_W: 0.25 * n * n * r * CONSTANTS.E_alpha_J * CONSTANTS.volume_m3,
  };
}

function temperatureKeV(W_J, n) {
  const nSafe = Math.max(n, 1e-30);
  return W_J / (3.0 * nSafe * CONSTANTS.volume_m3 * CONSTANTS.keV_to_J);
}

function storedEnergy(T_keV, n) {
  return 3.0 * n * CONSTANTS.volume_m3 * T_keV * CONSTANTS.keV_to_J;
}

function confinementFactor(ratio, start = 0.80, k = 8.0) {
  const excess = Math.max(0, ratio - start);
  return Math.exp(-k * excess * excess);
}

function limitRatios(T_keV, n) {
  return {
    beta_ratio: (n * T_keV) / CONSTANTS.pressure_limit,
    greenwald_ratio: n / CONSTANTS.greenwald_limit,
  };
}

function confinementTimes(beta, greenwald, cfg) {
  const fb = confinementFactor(beta, cfg.confinement_soft_start, cfg.confinement_k);
  const fn = confinementFactor(greenwald, cfg.confinement_soft_start, cfg.confinement_k);
  const tau_E = clamp(CONSTANTS.tau_E0_s * fb * fn, 0.05, CONSTANTS.tau_E0_s);
  const tau_p = clamp(CONSTANTS.tau_p0_s * fn, 0.05, CONSTANTS.tau_p0_s);
  return { tau_E, tau_p };
}

function stabilityMargin(beta, greenwald) {
  return clamp(1.0 - Math.max(beta, greenwald) / 1.10, 0.0, 1.0);
}

function disruptionReason(T_keV, beta, greenwald, cfg) {
  if (!Number.isFinite(T_keV) || !Number.isFinite(beta) || !Number.isFinite(greenwald)) {
    return "non-finite numerical state";
  }
  if (beta > cfg.beta_disrupt_ratio) return "pressure limit exceeded";
  if (greenwald > cfg.greenwald_disrupt_ratio) return "density limit exceeded";
  if (T_keV < cfg.T_min_disrupt_keV) return "temperature collapsed";
  if (T_keV > cfg.T_max_disrupt_keV) return "temperature runaway";
  return null;
}

// ---------- public state factory ----------
export function initialState({ T_keV = 10.0, n = 0.65e20 } = {}) {
  const W_J = storedEnergy(T_keV, n);
  const { beta_ratio, greenwald_ratio } = limitRatios(T_keV, n);
  const { tau_E, tau_p } = confinementTimes(beta_ratio, greenwald_ratio, DEFAULT_CONFIG);
  const { P_fusion_W, P_alpha_W } = fusionPowers(T_keV, n);
  return {
    time_s: 0,
    T_keV, n, W_J,
    tau_E_s: tau_E, tau_p_s: tau_p,
    P_fusion_W, P_alpha_W,
    beta_ratio, greenwald_ratio,
    stability: stabilityMargin(beta_ratio, greenwald_ratio),
    P_ext_W: 0.0, S_fuel: 0.0,
    disrupted: false,
    disruption_reason: null,
    disturbance: null,
    dTdt_keV_per_s: 0.0,
    dndt_per_s: 0.0,
    time_since_disturbance_s: 999,
  };
}

// ---------- disturbance generator ----------
export class DisturbanceGenerator {
  constructor(seed = 1, config = DISTURBANCE_HARD) {
    this.config = config;
    this.rng = makeRng(seed);
    this.next_elm_s = this._sampleInterval(this.config.elm_interval_s);
    this.next_pumpout_s = this._sampleInterval(this.config.pumpout_interval_s);
  }
  _sampleInterval([a, b]) { return this.rng.uniform(a, b); }
  _sampleFraction([a, b]) { return this.rng.uniform(a, b); }
  apply(time_s, W_J, n, P_ext_W) {
    if (!this.config.enabled) return { W_J, n, P_ext_actual_W: P_ext_W, kind: null };
    const kinds = [];
    let W_next = W_J;
    let n_next = n;
    if (time_s >= this.next_elm_s) {
      W_next *= 1.0 - this._sampleFraction(this.config.elm_loss_fraction);
      kinds.push("elm");
      this.next_elm_s = time_s + this._sampleInterval(this.config.elm_interval_s);
    }
    if (time_s >= this.next_pumpout_s) {
      n_next *= 1.0 - this._sampleFraction(this.config.pumpout_fraction);
      kinds.push("pumpout");
      this.next_pumpout_s = time_s + this._sampleInterval(this.config.pumpout_interval_s);
    }
    const noise = 1.0 + this.config.heating_noise_std * this.rng.normal();
    return {
      W_J: W_next, n: n_next,
      P_ext_actual_W: Math.max(0, P_ext_W * noise),
      kind: kinds.length ? kinds.join("+") : null,
    };
  }
}

// ---------- step ----------
export function step(state, requestedAction, cfg = DEFAULT_CONFIG, disturbances = null) {
  if (state.disrupted) return state;

  // Actuator clamp + ramp limit.
  const Pt = clamp(requestedAction.P_ext_W, cfg.P_ext_min_W, cfg.P_ext_max_W);
  const St = clamp(requestedAction.S_fuel, cfg.S_fuel_min, cfg.S_fuel_max);
  const maxdP = cfg.dP_ext_max_per_s * cfg.dt_s;
  const maxdS = cfg.dS_fuel_max_per_s * cfg.dt_s;
  const P_applied = state.P_ext_W + clamp(Pt - state.P_ext_W, -maxdP, maxdP);
  const S_applied = state.S_fuel + clamp(St - state.S_fuel, -maxdS, maxdS);

  let W = state.W_J;
  let n = state.n;
  let P_actual = P_applied;
  let kind = null;
  if (disturbances) {
    const ev = disturbances.apply(state.time_s, W, n, P_applied);
    W = Math.max(ev.W_J, cfg.W_min_J);
    n = Math.max(ev.n, cfg.n_min);
    P_actual = ev.P_ext_actual_W;
    kind = ev.kind;
  }

  const T_dist = temperatureKeV(W, n);
  const { beta_ratio, greenwald_ratio } = limitRatios(T_dist, n);
  const { tau_E, tau_p } = confinementTimes(beta_ratio, greenwald_ratio, cfg);
  const { P_fusion_W, P_alpha_W } = fusionPowers(T_dist, n);

  const dWdt = P_actual + P_alpha_W - W / tau_E;
  const dndt = S_applied - n / tau_p;
  const W_next = Math.max(W + cfg.dt_s * dWdt, cfg.W_min_J);
  const n_next = Math.max(n + cfg.dt_s * dndt, cfg.n_min);
  const T_next = temperatureKeV(W_next, n_next);

  const lim = limitRatios(T_next, n_next);
  const tt = confinementTimes(lim.beta_ratio, lim.greenwald_ratio, cfg);
  const fp = fusionPowers(T_next, n_next);
  const reason = disruptionReason(T_next, lim.beta_ratio, lim.greenwald_ratio, cfg);

  return {
    time_s: state.time_s + cfg.dt_s,
    T_keV: T_next,
    n: n_next,
    W_J: W_next,
    tau_E_s: tt.tau_E,
    tau_p_s: tt.tau_p,
    P_fusion_W: fp.P_fusion_W,
    P_alpha_W: fp.P_alpha_W,
    beta_ratio: lim.beta_ratio,
    greenwald_ratio: lim.greenwald_ratio,
    stability: stabilityMargin(lim.beta_ratio, lim.greenwald_ratio),
    P_ext_W: P_applied,
    S_fuel: S_applied,
    disrupted: reason !== null,
    disruption_reason: reason,
    disturbance: kind,
    dTdt_keV_per_s: (T_next - state.T_keV) / cfg.dt_s,
    dndt_per_s: (n_next - state.n) / cfg.dt_s,
    time_since_disturbance_s: kind !== null ? 0 : state.time_since_disturbance_s + cfg.dt_s,
  };
}

// ---------- reward (mirrors sim/reward.py without the jerk term) ----------
export function reward(state) {
  const T_target = 15.0;
  const n_target = 0.80e20;
  let r = 1.0;
  r -= 0.5 * ((state.T_keV - T_target) / T_target) ** 2;
  r -= 0.5 * ((state.n - n_target) / n_target) ** 2;
  r += 0.2 * Math.tanh(state.P_fusion_W / 300e6);
  r -= 3.0 * Math.max(0, state.beta_ratio - 0.80) ** 2;
  r -= 3.0 * Math.max(0, state.greenwald_ratio - 0.80) ** 2;
  if (state.disrupted) r -= 100;
  return r;
}

export function statusFor(state) {
  if (state.disrupted) return { tone: "danger", text: `Disruption: ${state.disruption_reason}` };
  if (state.beta_ratio > 0.95 || state.greenwald_ratio > 0.95) return { tone: "danger", text: "Approaching disruption" };
  if (state.beta_ratio > 0.80 || state.greenwald_ratio > 0.80) return { tone: "warn", text: "Near operational limit" };
  if (state.disturbance) return { tone: "warn", text: `Disturbance: ${state.disturbance}` };
  return { tone: "good", text: "Stable plasma" };
}
