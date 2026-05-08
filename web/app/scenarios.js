// Centralized reactor-scenario definitions for the FusionPilot demo.
//
// A scenario controls the *reactor and weather* a player is operating in.
// It composes with the existing Easy / Normal / Hard difficulty controls,
// which scale challenge intensity (actuator-bump amplitude / cadence).
//
// Each scenario can override:
//   - initialState   { T_keV, n }         starting plasma state
//   - simConfig      partial DEFAULT_CONFIG overrides (limits, ramp rates,
//                    confinement softening curve)
//   - disturbanceHard / disturbanceGentle  partial DISTURBANCE_* overrides
//                    used by Operator/Race (hard) and Learn (gentle)
//   - pressure       partial multipliers applied on top of the difficulty
//                    preset in main.js (kick / interval / slide / recovery /
//                    firstEvent / durationS)
//   - statusCopy     short label shown in the scenario chip
//
// Keep the dictionary small and readable — scenarios are demo flavor, not
// physics calibrations.

import {
  DEFAULT_CONFIG,
  DISTURBANCE_HARD,
  DISTURBANCE_GENTLE,
} from "../sim/plasma.js";

export const SCENARIOS = Object.freeze({
  standard: {
    id: "standard",
    label: "Standard Tokamak",
    short: "Standard",
    description:
      "Balanced reactor. Default response time, default disturbance weather.",
    statusCopy: "Standard tokamak — balanced response.",
    initialState: { T_keV: 10.0, n: 0.65e20 },
    simConfig: {},
    disturbanceHard: {},
    disturbanceGentle: {},
    pressure: {
      kickScale: 1.0,
      intervalScale: 1.0,
      slideDurationScale: 1.0,
      recoveryScale: 1.0,
      firstEventScale: 1.0,
    },
    durationS: 20,
  },

  compact: {
    id: "compact",
    label: "Compact Reactor",
    short: "Compact",
    description:
      "Smaller, twitchier reactor. Faster actuators, lower stability margin.",
    statusCopy: "Compact reactor — fast and unforgiving.",
    initialState: { T_keV: 9.0, n: 0.62e20 },
    simConfig: {
      beta_disrupt_ratio: 1.04,
      greenwald_disrupt_ratio: 1.05,
      confinement_soft_start: 0.72,
      confinement_k: 11.0,
      dP_ext_max_per_s: 850e6,
      dS_fuel_max_per_s: 6e20,
    },
    disturbanceHard: {},
    disturbanceGentle: {},
    pressure: {
      kickScale: 1.0,
      intervalScale: 0.78,
      slideDurationScale: 0.72,
      recoveryScale: 0.85,
      firstEventScale: 0.7,
    },
    durationS: 20,
  },

  heavy: {
    id: "heavy",
    label: "Heavy Reactor",
    short: "Heavy",
    description:
      "Large, inertial reactor. More margin to limits but slower to recover.",
    statusCopy: "Heavy reactor — slow, forgiving response.",
    initialState: { T_keV: 11.5, n: 0.70e20 },
    simConfig: {
      beta_disrupt_ratio: 1.18,
      greenwald_disrupt_ratio: 1.16,
      confinement_soft_start: 0.88,
      confinement_k: 6.0,
      dP_ext_max_per_s: 380e6,
      dS_fuel_max_per_s: 2.4e20,
    },
    disturbanceHard: {},
    disturbanceGentle: {},
    pressure: {
      kickScale: 1.05,
      intervalScale: 1.25,
      slideDurationScale: 1.4,
      recoveryScale: 1.15,
      firstEventScale: 1.25,
    },
    durationS: 22,
  },

  storm: {
    id: "storm",
    label: "Storm Scenario",
    short: "Storm",
    description:
      "Standard reactor under harsh ELM/pumpout weather. Disturbances fire much faster.",
    statusCopy: "Storm weather — ELMs and pumpouts firing fast.",
    initialState: { T_keV: 10.0, n: 0.65e20 },
    simConfig: {},
    disturbanceHard: {
      enabled: true,
      elm_interval_s: [0.08, 0.26],
      elm_loss_fraction: [0.22, 0.42],
      pumpout_interval_s: [0.6, 1.4],
      pumpout_fraction: [0.18, 0.32],
      heating_noise_std: 0.10,
    },
    disturbanceGentle: {
      enabled: true,
      elm_interval_s: [0.25, 0.7],
      elm_loss_fraction: [0.10, 0.18],
      pumpout_interval_s: [1.6, 3.2],
      pumpout_fraction: [0.10, 0.18],
      heating_noise_std: 0.05,
    },
    pressure: {
      kickScale: 1.05,
      intervalScale: 0.95,
      slideDurationScale: 0.95,
      recoveryScale: 0.95,
      firstEventScale: 0.95,
    },
    durationS: 20,
  },

  precision: {
    id: "precision",
    label: "Precision Burn",
    short: "Precision",
    description:
      "Tighter operating window. Smaller actuator bumps, smoother control wins.",
    statusCopy: "Precision burn — tight margin, smooth control wins.",
    initialState: { T_keV: 13.0, n: 0.74e20 },
    simConfig: {
      beta_disrupt_ratio: 1.05,
      greenwald_disrupt_ratio: 1.05,
      confinement_soft_start: 0.74,
      confinement_k: 9.0,
    },
    disturbanceHard: {
      enabled: true,
      elm_interval_s: [0.20, 0.55],
      elm_loss_fraction: [0.10, 0.22],
      pumpout_interval_s: [1.2, 2.6],
      pumpout_fraction: [0.08, 0.18],
      heating_noise_std: 0.04,
    },
    disturbanceGentle: {},
    pressure: {
      kickScale: 0.55,
      intervalScale: 1.05,
      slideDurationScale: 0.85,
      recoveryScale: 1.0,
      firstEventScale: 1.0,
    },
    durationS: 22,
  },
});

export const SCENARIO_ORDER = Object.freeze([
  "standard",
  "compact",
  "heavy",
  "storm",
  "precision",
]);

export const DEFAULT_SCENARIO_ID = "standard";

export function getScenario(id) {
  return SCENARIOS[id] ?? SCENARIOS[DEFAULT_SCENARIO_ID];
}

export function resolveSimConfig(scenario) {
  return { ...DEFAULT_CONFIG, ...(scenario?.simConfig ?? {}) };
}

export function resolveDisturbance(scenario, base) {
  const overrides =
    base === DISTURBANCE_GENTLE
      ? scenario?.disturbanceGentle
      : scenario?.disturbanceHard;
  return { ...base, ...(overrides ?? {}) };
}

export function resolveInitialStateArgs(scenario) {
  return scenario?.initialState ?? {};
}

export function resolvePressureScenario(scenario) {
  return scenario?.pressure ?? {};
}

export function resolveDurationS(scenario, fallback) {
  return scenario?.durationS ?? fallback;
}
