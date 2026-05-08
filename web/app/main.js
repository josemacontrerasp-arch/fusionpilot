// Entry point for the FusionPilot static demo.
// Three modes share a common JS sim. Mode 3 also drives a recorded
// trajectory side-by-side for the AI-vs-You race.
//
// Visuals: Three.js plasma particle field per canvas, hand-rolled additive
// shader. See app/plasma3d.js. State signals fed in every frame:
// - temperature  -> shader color ramp (cyan -> violet -> magenta)
// - density      -> field density / glow size
// - stability    -> chaos amount in the curl-noise term
// - disturbance  -> outward pulse on the frame the event fires
// - disrupted    -> red latch + chaotic dispersion

import {
  initialState, step, reward, statusFor,
  DEFAULT_CONFIG, DISTURBANCE_HARD, DISTURBANCE_GENTLE,
  DisturbanceGenerator,
} from "../sim/plasma.js";
import { makeRng } from "../sim/rng.js";
import { PlasmaScene } from "./plasma3d.js";
import { buildGauges, updateGauges } from "./gauges.js";
import {
  SCENARIOS, SCENARIO_ORDER, DEFAULT_SCENARIO_ID,
  getScenario, resolveSimConfig, resolveDisturbance,
  resolveInitialStateArgs, resolvePressureScenario, resolveDurationS,
} from "./scenarios.js";

// ---------------- mode switcher ----------------
const modeButtons = document.querySelectorAll(".modes button");
const modeSections = document.querySelectorAll(".mode");
modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    modeButtons.forEach((b) => b.classList.toggle("active", b === btn));
    const mode = btn.dataset.mode;
    modeSections.forEach((s) => s.classList.toggle("active", s.id === `mode-${mode}`));
  });
});

const settingsToggle = document.querySelector('[data-action="settings-toggle"]');
const settingsPanel = document.querySelector("[data-settings-panel]");
function setSettingsOpen(open) {
  if (!settingsToggle || !settingsPanel) return;
  settingsPanel.hidden = !open;
  settingsToggle.setAttribute("aria-expanded", open ? "true" : "false");
}
settingsToggle?.addEventListener("click", (event) => {
  event.stopPropagation();
  setSettingsOpen(settingsPanel?.hidden ?? true);
});
settingsPanel?.addEventListener("click", (event) => event.stopPropagation());
document.addEventListener("click", () => setSettingsOpen(false));
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setSettingsOpen(false);
});

// ---------------- scenario state (set once we have all drivers wired) ----------------
let currentScenarioId = DEFAULT_SCENARIO_ID;
function activeScenario() { return getScenario(currentScenarioId); }
let raceSimConfig = resolveSimConfig(activeScenario());
let raceInitialStateArgs = resolveInitialStateArgs(activeScenario());

// ---------------- generic action helpers ----------------
function physicalAction(heatSliderVal, fuelSliderVal) {
  return {
    P_ext_W: parseFloat(heatSliderVal) * 1e6,
    S_fuel: parseFloat(fuelSliderVal) * 1e18,
  };
}

function clampValue(x, lo, hi) {
  return Math.min(Math.max(x, lo), hi);
}

function dispatchSliderInput(slider) {
  slider.dispatchEvent?.(new Event("input"));
}

function randomSeed() {
  return Math.floor(Math.random() * 1_000_000_000);
}

function setLoadMessage(el, tone, message) {
  if (!el) return;
  el.classList.remove("hot", "done");
  if (tone) el.classList.add(tone);
  const strong = el.querySelector("strong");
  if (strong) strong.textContent = message;
}

const PRESSURE_DIFFICULTY = {
  easy: {
    name: "easy",
    kickScale: 0.52,
    intervalScale: 1.55,
    bothChanceDelta: -0.22,
    slideDurationScale: 1.0,
    recoveryScale: 1.45,
  },
  normal: {
    name: "normal",
    kickScale: 0.84,
    intervalScale: 1.2,
    bothChanceDelta: -0.08,
    slideDurationScale: 0.95,
    recoveryScale: 1.08,
  },
  hard: {
    name: "hard",
    kickScale: 1.14,
    intervalScale: 1.0,
    bothChanceDelta: 0.08,
    slideDurationScale: 0.86,
    recoveryScale: 0.92,
  },
};

function scaleRange(range, scale) {
  return range.map((value) => value * scale);
}

function pressureSettingsFor(base, difficulty, scenarioPressure = {}) {
  const preset = PRESSURE_DIFFICULTY[difficulty] ?? PRESSURE_DIFFICULTY.normal;
  const sc = scenarioPressure ?? {};
  const kickScale = preset.kickScale * (sc.kickScale ?? 1);
  const intervalScale = preset.intervalScale * (sc.intervalScale ?? 1);
  const slideScale = preset.slideDurationScale * (sc.slideDurationScale ?? 1);
  const recoveryScale = preset.recoveryScale * (sc.recoveryScale ?? 1);
  const firstEventScale = sc.firstEventScale ?? 1;
  return {
    ...base,
    durationS: sc.durationS ?? base.durationS,
    firstEventS: base.firstEventS * firstEventScale,
    interval: scaleRange(base.interval, intervalScale),
    heatKick: scaleRange(base.heatKick, kickScale),
    fuelKick: scaleRange(base.fuelKick, kickScale),
    bothChance: clampValue(base.bothChance + preset.bothChanceDelta, 0.08, 0.9),
    slideDuration: scaleRange(base.slideDuration, slideScale),
    recoveryGap: scaleRange(base.recoveryGap, recoveryScale),
  };
}

function wireDifficultyControl(group, pressure) {
  const root = document.querySelector(`[data-difficulty-group="${group}"]`);
  if (!root) return null;
  const buttons = Array.from(root.querySelectorAll("[data-difficulty]"));

  function setDifficulty(level) {
    pressure.setDifficulty(level);
    buttons.forEach((button) => {
      const active = button.dataset.difficulty === pressure.getDifficulty();
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => setDifficulty(button.dataset.difficulty));
  });
  setDifficulty(root.dataset.defaultDifficulty || "normal");
  return { setDifficulty };
}

function explainPlasmaOutcome(state) {
  const heatMW = state.P_ext_W / 1e6;
  const fuel = state.S_fuel / 1e19;
  const betaPct = state.beta_ratio * 100;
  const densityPct = state.greenwald_ratio * 100;
  const T = state.T_keV;
  const n = state.n / 1e20;
  const disturbance = state.disturbance ? ` A recent ${state.disturbance} disturbance made the recovery harder.` : "";

  if (!state.disrupted) {
    return {
      tone: "success",
      title: "Stable round: you kept margin from the limits.",
      body: `Final state: ${T.toFixed(1)} keV, density ${n.toFixed(2)} x10^20 m^-3, beta ${betaPct.toFixed(0)}%, density limit ${densityPct.toFixed(0)}%. Heating and fueling stayed inside the controllable band.`,
    };
  }

  if (state.disruption_reason === "temperature collapsed") {
    return {
      tone: "active",
      title: "Temperature collapse: confinement losses beat heating.",
      body: `The plasma fell to ${T.toFixed(1)} keV while heating was ${heatMW.toFixed(0)} MW. In the toy power balance, stored energy drains through confinement losses; after an ELM-like heat dump or low heating, fusion self-heating fades and the plasma quenches.${disturbance}`,
    };
  }

  if (state.disruption_reason === "density limit exceeded") {
    return {
      tone: "active",
      title: "Density-limit disruption: too much fuel choked stability.",
      body: `Density reached ${n.toFixed(2)} x10^20 m^-3, about ${densityPct.toFixed(0)}% of the toy Greenwald limit, while fueling was ${fuel.toFixed(1)} x10^19. Fusion likes density, but too much density degrades confinement and trips the disruption threshold.${disturbance}`,
    };
  }

  if (state.disruption_reason === "pressure limit exceeded") {
    return {
      tone: "active",
      title: "Pressure-limit disruption: heat and density pushed beta too high.",
      body: `The beta-like pressure ratio hit ${betaPct.toFixed(0)}%. In this 0D model, pressure scales with density times temperature, so aggressive heating/fueling can raise fusion power briefly but erodes stability margin until the plasma disrupts.${disturbance}`,
    };
  }

  if (state.disruption_reason === "temperature runaway") {
    return {
      tone: "active",
      title: "Thermal runaway: heating overshot the safe operating window.",
      body: `Temperature climbed to ${T.toFixed(1)} keV with ${heatMW.toFixed(0)} MW applied. The toy model treats extreme temperature as unstable because pressure and actuator lag leave no recovery margin.`,
    };
  }

  return {
    tone: "active",
    title: "Disruption: the plasma left the safe operating envelope.",
    body: `Final state: ${T.toFixed(1)} keV, density ${n.toFixed(2)} x10^20 m^-3, beta ${betaPct.toFixed(0)}%, density limit ${densityPct.toFixed(0)}%. Cause: ${state.disruption_reason ?? "unknown"}.`,
  };
}

function updateAnalysis(el, state, { force = false } = {}) {
  if (!el || !state) return;
  if (!force && !state.disrupted) return;
  const explanation = explainPlasmaOutcome(state);
  el.classList.remove("active", "success");
  el.classList.add(explanation.tone);
  const title = el.querySelector("strong");
  const body = el.querySelector("p");
  if (title) title.textContent = explanation.title;
  if (body) body.textContent = explanation.body;
}

function setStatus(el, state) {
  if (!el) return;
  const s = statusFor(state);
  el.classList.remove("good", "warn", "danger");
  el.classList.add(s.tone);
  el.textContent = s.text;
}

function updateHUD(hudEl, state) {
  if (!hudEl) return;
  const set = (key, val) => {
    const el = hudEl.querySelector(`[data-hud-key="${key}"]`);
    if (el) el.textContent = val;
  };
  set("T", state.T_keV.toFixed(1));
  set("n", (state.n / 1e20).toFixed(2));
  set("P", (state.P_fusion_W / 1e6).toFixed(0));
  set("S", (state.stability * 100).toFixed(0));
}

// ---------------- shared per-mode driver ----------------
function makeDriver({ canvasKey, gaugesKey, statusKey, heatKey, fuelKey, timerKey, hudKey, disturbanceConfig, seed, particleCount, simConfig = DEFAULT_CONFIG, initialStateArgs = {} }) {
  const canvas = document.querySelector(`[data-canvas="${canvasKey}"]`);
  const status = document.querySelector(`[data-status="${statusKey}"]`);
  const heatSlider = document.querySelector(`[data-slider="${heatKey}"]`);
  const fuelSlider = document.querySelector(`[data-slider="${fuelKey}"]`);
  const heatReadout = document.querySelector(`[data-readout="${heatKey}"]`);
  const fuelReadout = document.querySelector(`[data-readout="${fuelKey}"]`);
  const timerEl = timerKey ? document.querySelector(`[data-timer="${timerKey}"]`) : null;
  const hudEl = hudKey ? document.querySelector(`[data-hud="${hudKey}"]`) : null;
  const gaugesEl = gaugesKey ? document.querySelector(`[data-gauges="${gaugesKey}"]`) : null;
  if (gaugesEl) buildGauges(gaugesEl);

  const scene = new PlasmaScene(canvas, { particleCount: particleCount ?? 12000 });

  let currentSimConfig = simConfig;
  let currentInitialStateArgs = initialStateArgs;
  let state = initialState(currentInitialStateArgs);
  let currentSeed = seed;
  let currentDisturbanceConfig = disturbanceConfig;
  let disturbances = currentDisturbanceConfig
    ? new DisturbanceGenerator(currentSeed, currentDisturbanceConfig)
    : null;
  let totalReward = 0;
  let running = true;
  let lastFrame = performance.now() / 1000;

  const updateReadouts = () => {
    heatReadout.textContent = `${parseFloat(heatSlider.value).toFixed(0)} MW`;
    fuelReadout.textContent = `${(parseFloat(fuelSlider.value) * 1e18).toExponential(1)}`;
  };
  heatSlider.addEventListener("input", updateReadouts);
  fuelSlider.addEventListener("input", updateReadouts);
  updateReadouts();

  function reset(newSeed) {
    if (newSeed !== undefined) currentSeed = newSeed;
    state = initialState(currentInitialStateArgs);
    if (currentDisturbanceConfig) {
      disturbances = new DisturbanceGenerator(currentSeed, currentDisturbanceConfig);
    }
    totalReward = 0;
    running = true;
  }

  function tick() {
    const now = performance.now() / 1000;
    const dt = now - lastFrame;
    lastFrame = now;

    if (running && !state.disrupted) {
      const action = physicalAction(heatSlider.value, fuelSlider.value);
      state = step(state, action, currentSimConfig, disturbances);
      totalReward += reward(state);
    }
    scene.update(state, dt);
    setStatus(status, state);
    updateHUD(hudEl, state);
    if (gaugesEl) updateGauges(gaugesEl, state);
    if (timerEl) timerEl.textContent = `${state.time_s.toFixed(2)} s`;
    if (state.disrupted) running = false;
  }

  return {
    tick,
    reset,
    setHeatFuel(h, f) { heatSlider.value = h; fuelSlider.value = f; updateReadouts(); },
    setDisturbances(cfg, newSeed) {
      currentDisturbanceConfig = cfg;
      if (newSeed !== undefined) currentSeed = newSeed;
      disturbances = cfg ? new DisturbanceGenerator(currentSeed, cfg) : null;
    },
    setSimConfig(cfg) { currentSimConfig = cfg ?? DEFAULT_CONFIG; },
    setInitialStateArgs(args) { currentInitialStateArgs = args ?? {}; },
    getState: () => state,
    getTotalReward: () => totalReward,
    isRunning: () => running,
    stop() { running = false; },
    scene,
  };
}

function makeActuatorPressure({
  driver,
  heatSlider,
  fuelSlider,
  eventEl,
  seed,
  label,
  durationS = 20,
  firstEventS = 1.0,
  interval = [1.15, 2.2],
  heatKick = [28, 58],
  fuelKick = [18, 42],
  bothChance = 0.42,
  slideDuration = [0.28, 0.95],
  recoveryGap = [0.65, 1.15],
  difficulty = "normal",
  scenarioPressure = {},
}) {
  const baseSettings = {
    durationS,
    firstEventS,
    interval,
    heatKick,
    fuelKick,
    bothChance,
    slideDuration,
    recoveryGap,
  };
  let currentDifficulty = difficulty;
  let currentScenarioPressure = scenarioPressure ?? {};
  let settings = pressureSettingsFor(baseSettings, currentDifficulty, currentScenarioPressure);
  let rng = makeRng(seed);
  let nextEventS = settings.firstEventS;
  let count = 0;
  let active = false;
  let activeMoves = [];
  let lastStateTimeS = null;

  function chooseDirection(slider, min, max) {
    const current = Number(slider.value);
    const roomDown = current - min;
    const roomUp = max - current;
    if (roomDown < 8 && roomUp > roomDown) return 1;
    if (roomUp < 8 && roomDown > roomUp) return -1;
    return rng.uniform(0, 1) < 0.5 ? -1 : 1;
  }

  function queueMove(slider, min, max, amount, labelText) {
    const current = Number(slider.value);
    let dir = chooseDirection(slider, min, max);
    let target = clampValue(current + dir * amount, min, max);
    let delta = target - current;

    if (Math.abs(delta) < amount * 0.35) {
      dir *= -1;
      target = clampValue(current + dir * amount, min, max);
      delta = target - current;
    }

    if (Math.abs(delta) < 1) return null;

    const duration = rng.uniform(settings.slideDuration[0], settings.slideDuration[1]);
    activeMoves.push({
      slider,
      min,
      max,
      delta,
      applied: 0,
      remaining: duration,
      velocity: delta / duration,
    });

    return `${labelText} ${delta > 0 ? "up" : "down"}`;
  }

  function applyMoves(dt) {
    if (!activeMoves.length || dt <= 0) return;

    const nextMoves = [];
    for (const move of activeMoves) {
      const elapsed = Math.min(dt, move.remaining);
      const stepDelta = move.velocity * elapsed;
      move.remaining -= elapsed;
      move.applied += stepDelta;

      const current = Number(move.slider.value);
      const remaining = move.delta - move.applied;
      const finalStep = move.remaining <= 0 || Math.abs(remaining) <= 0.5;
      const targetValue = finalStep
        ? current + remaining
        : current + stepDelta;

      move.slider.value = String(Math.round(clampValue(targetValue, move.min, move.max)));
      dispatchSliderInput(move.slider);

      if (!finalStep) nextMoves.push(move);
    }
    activeMoves = nextMoves;
  }

  function reset(newSeed = seed) {
    rng = makeRng(newSeed);
    nextEventS = settings.firstEventS;
    count = 0;
    active = true;
    activeMoves = [];
    lastStateTimeS = null;
    setLoadMessage(eventEl, null, `${label} ${currentDifficulty} armed`);
  }

  function refreshSettings() {
    settings = pressureSettingsFor(baseSettings, currentDifficulty, currentScenarioPressure);
  }

  function setDifficulty(level) {
    currentDifficulty = PRESSURE_DIFFICULTY[level] ? level : "normal";
    refreshSettings();

    if (active) {
      const state = driver.getState();
      if (state && state.time_s < nextEventS) {
        nextEventS = state.time_s
          + rng.uniform(settings.interval[0], settings.interval[1])
          + rng.uniform(settings.recoveryGap[0], settings.recoveryGap[1]);
      }
      setLoadMessage(eventEl, null, `${label} ${currentDifficulty}`);
    }
  }

  function setScenarioPressure(sc) {
    currentScenarioPressure = sc ?? {};
    refreshSettings();
  }

  function getDurationS() {
    return settings.durationS;
  }

  function tick() {
    if (!active) return;
    const state = driver.getState();
    if (!state || state.disrupted || !driver.isRunning()) {
      active = false;
      activeMoves = [];
      return;
    }

    const dt = lastStateTimeS === null ? 0 : Math.max(0, Math.min(0.12, state.time_s - lastStateTimeS));
    lastStateTimeS = state.time_s;
    applyMoves(dt);

    if (state.time_s >= settings.durationS) {
      active = false;
      activeMoves = [];
      driver.stop();
      setLoadMessage(eventEl, "done", "round complete");
      if (eventEl?.dataset.raceEvent !== undefined) {
        updateAnalysis(raceHumanAnalysis, state, { force: true });
      } else if (eventEl?.dataset.operatorEvent !== undefined) {
        updateAnalysis(operatorAnalysis, state, { force: true });
      }
      return;
    }
    if (state.time_s < nextEventS) return;
    if (activeMoves.length) {
      nextEventS = state.time_s + rng.uniform(settings.recoveryGap[0], settings.recoveryGap[1]);
      return;
    }

    count += 1;
    const hitBoth = rng.uniform(0, 1) < settings.bothChance;
    let hitHeat = hitBoth || rng.uniform(0, 1) < 0.58;
    let hitFuel = hitBoth || rng.uniform(0, 1) < 0.58;
    if (!hitHeat && !hitFuel) {
      hitHeat = rng.uniform(0, 1) < 0.5;
      hitFuel = !hitHeat;
    }
    const messages = [];

    if (hitHeat) {
      const amount = rng.uniform(settings.heatKick[0], settings.heatKick[1]) * (1 + Math.min(count, 5) * 0.06);
      const msg = queueMove(heatSlider, 0, 220, amount, "heat");
      if (msg) messages.push(msg);
    }
    if (hitFuel) {
      const amount = rng.uniform(settings.fuelKick[0], settings.fuelKick[1]) * (1 + Math.min(count, 5) * 0.06);
      const msg = queueMove(fuelSlider, 0, 150, amount, "fuel");
      if (msg) messages.push(msg);
    }

    if (!messages.length) {
      const amount = rng.uniform(settings.heatKick[0], settings.heatKick[1]);
      const fallback = queueMove(heatSlider, 0, 220, amount, "heat");
      if (fallback) messages.push(fallback);
    }

    setLoadMessage(eventEl, "hot", `${messages.join(" + ")} - correct it`);
    nextEventS = state.time_s
      + rng.uniform(settings.interval[0], settings.interval[1])
      + rng.uniform(settings.recoveryGap[0], settings.recoveryGap[1]);
  }

  return {
    reset,
    tick,
    setDifficulty,
    getDifficulty: () => currentDifficulty,
    setScenarioPressure,
    getDurationS,
  };
}

const POLICY_EXPLANATIONS = {
  random_agent: "Random: samples heat/fuel targets and holds them briefly. It explores, but it does not read the plasma state, so it usually loses.",
  constant_agent: "Constant: keeps heat and fuel near the starting values. It can survive easy moments, but it cannot correct disturbances or actuator bumps.",
  rule_based_agent: "Rule-based: feedback controller. If temperature or density falls below target, it pushes heat/fuel up; near pressure or density limits, it backs off.",
  trained_agent: "Trained SAC: uses the exported SAC actor when available. If the actor JSON is missing, the browser falls back to the tuned recovery policy.",
};
let sacActor = null;
let sacActorLoadStatus = "loading";

function vectorMatmul(input, weight, bias) {
  return weight.map((row, i) => row.reduce((sum, value, j) => sum + value * input[j], bias[i]));
}

function relu(values) {
  return values.map((value) => Math.max(0, value));
}

function observationFromStateForSac(state) {
  return [
    state.T_keV / 20.0,
    state.n / 1.0e20,
    state.dTdt_keV_per_s / 10.0,
    state.dndt_per_s / 1.0e20,
    state.beta_ratio,
    state.greenwald_ratio,
    state.P_fusion_W / 500.0e6,
    state.time_since_disturbance_s / 5.0,
  ].map((value) => clampValue(value, -5, 5));
}

function sacActorPolicy(state) {
  if (!sacActor) return tunedAiPolicy(state);
  const layers = sacActor.layers;
  let x = observationFromStateForSac(state);
  x = relu(vectorMatmul(x, layers.latent0.weight, layers.latent0.bias));
  x = relu(vectorMatmul(x, layers.latent2.weight, layers.latent2.bias));
  const mu = vectorMatmul(x, layers.mu.weight, layers.mu.bias).map((value) => Math.tanh(value));
  return {
    P_ext_W: ((mu[0] + 1) / 2) * DEFAULT_CONFIG.P_ext_max_W,
    S_fuel: ((mu[1] + 1) / 2) * DEFAULT_CONFIG.S_fuel_max,
  };
}

async function loadSacActor() {
  try {
    const res = await fetch("./policies/sac_actor.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload.schema !== "fusionpilot-sac-actor-v1") {
      throw new Error("unsupported actor schema");
    }
    sacActor = payload;
    sacActorLoadStatus = `loaded ${payload.source}`;
  } catch (err) {
    sacActor = null;
    sacActorLoadStatus = `fallback (${err.message})`;
  }
  if (agentSelect?.value === "trained_agent") {
    aiPolicy = makeAiPolicy("trained_agent", RACE_SEED + 900);
    loadTrajectory("trained_agent");
  }
}

function policyDisplayName(name) {
  return name.replace("_agent", "").replace("_", " ");
}

function makeVirtualSlider(value) {
  return {
    value: String(value),
    dispatchEvent() {},
  };
}

function physicalActionFromSliderUnits(heatMW, fuelUnits) {
  return {
    P_ext_W: clampValue(heatMW, 0, 220) * 1e6,
    S_fuel: clampValue(fuelUnits, 0, 150) * 1e18,
  };
}

function policyActionToSliderUnits(action) {
  return {
    heatMW: clampValue(action.P_ext_W / 1e6, 0, 220),
    fuelUnits: clampValue(action.S_fuel / 1e18, 0, 150),
  };
}

function pullSliderToward(slider, target, maxStep, max = Number.POSITIVE_INFINITY) {
  const current = Number(slider.value);
  slider.value = String(clampValue(current + clampValue(target - current, -maxStep, maxStep), 0, max));
}

function makeRandomAiPolicy(seed) {
  const rng = makeRng(seed);
  let hold = 0;
  let current = physicalActionFromSliderUnits(95, 40);
  return () => {
    if (hold <= 0) {
      current = physicalActionFromSliderUnits(rng.uniform(0, 220), rng.uniform(0, 150));
      hold = 25;
    }
    hold -= 1;
    return current;
  };
}

function constantAiPolicy() {
  return physicalActionFromSliderUnits(95, 40);
}

function ruleBasedAiPolicy(state) {
  const TTarget = 15.0;
  const nTarget = 0.80e20;
  const TError = (TTarget - state.T_keV) / TTarget;
  const nError = (nTarget - state.n) / nTarget;

  let heatMW = 92 + 75 * TError;
  let fuelUnits = 40 + 50 * nError;

  if (state.beta_ratio > 0.86) heatMW *= 0.65;
  if (state.greenwald_ratio > 0.86) fuelUnits *= 0.60;
  if (state.T_keV < 6.0) heatMW = Math.max(heatMW, 120);
  if (state.n < 0.50e20) fuelUnits = Math.max(fuelUnits, 55);

  return physicalActionFromSliderUnits(heatMW, fuelUnits);
}

function tunedAiPolicy(state) {
  const TTarget = 14.0;
  const nTarget = 0.72e20;
  const TError = (TTarget - state.T_keV) / TTarget;
  const nError = (nTarget - state.n) / nTarget;

  let heatMW = 80 + 95 * TError;
  let fuelUnits = 35 + 60 * nError;

  if (state.time_since_disturbance_s < 0.4) {
    if (state.T_keV < TTarget) heatMW += 35;
    if (state.n < nTarget) fuelUnits += 15;
  }

  if (state.beta_ratio > 0.78) heatMW *= 0.7;
  if (state.greenwald_ratio > 0.78) fuelUnits *= 0.55;
  if (state.T_keV < 5.5) heatMW = Math.max(heatMW, 140);
  if (state.n < 0.45e20) fuelUnits = Math.max(fuelUnits, 60);

  return physicalActionFromSliderUnits(heatMW, fuelUnits);
}

function makeAiPolicy(name, seed) {
  if (name === "random_agent") return makeRandomAiPolicy(seed);
  if (name === "constant_agent") return constantAiPolicy;
  if (name === "rule_based_agent") return ruleBasedAiPolicy;
  return sacActorPolicy;
}

// ---------------- Mode 1: Learn ----------------
const learn = makeDriver({
  canvasKey: "learn", gaugesKey: "learn", statusKey: "learn",
  heatKey: "heat-learn", fuelKey: "fuel-learn", hudKey: "learn",
  disturbanceConfig: resolveDisturbance(activeScenario(), DISTURBANCE_GENTLE),
  seed: 1,
  particleCount: 12000,
  simConfig: resolveSimConfig(activeScenario()),
  initialStateArgs: resolveInitialStateArgs(activeScenario()),
});
const disturbToggle = document.querySelector('[data-toggle="disturb-learn"]');
function currentLearnDisturbance() {
  const gentle = resolveDisturbance(activeScenario(), DISTURBANCE_GENTLE);
  return disturbToggle.checked ? gentle : { ...gentle, enabled: false };
}
disturbToggle.addEventListener("change", () => {
  learn.setDisturbances(currentLearnDisturbance(), randomSeed());
  learn.reset();
});
document.querySelector('[data-action="reset-learn"]').addEventListener("click", () => learn.reset(2));

// ---------------- Mode 2: Operator challenge ----------------
const operator = makeDriver({
  canvasKey: "operator", gaugesKey: "operator", statusKey: "operator",
  heatKey: "heat-operator", fuelKey: "fuel-operator", timerKey: "operator", hudKey: "operator",
  disturbanceConfig: resolveDisturbance(activeScenario(), DISTURBANCE_HARD),
  seed: randomSeed(),
  particleCount: 13500,
  simConfig: resolveSimConfig(activeScenario()),
  initialStateArgs: resolveInitialStateArgs(activeScenario()),
});
const operatorAnalysis = document.querySelector('[data-analysis="operator"]');
const operatorPressure = makeActuatorPressure({
  driver: operator,
  heatSlider: document.querySelector('[data-slider="heat-operator"]'),
  fuelSlider: document.querySelector('[data-slider="fuel-operator"]'),
  eventEl: document.querySelector("[data-operator-event]"),
  seed: 802,
  label: "actuator drift",
  firstEventS: 1.35,
  interval: [1.0, 1.8],
  heatKick: [27, 53],
  fuelKick: [19, 38],
  bothChance: 0.48,
  slideDuration: [0.28, 0.9],
  recoveryGap: [0.55, 1.0],
  scenarioPressure: resolvePressureScenario(activeScenario()),
});
wireDifficultyControl("operator", operatorPressure);
operatorPressure.reset(randomSeed());
document.querySelector('[data-action="reset-operator"]').addEventListener("click", () => {
  const seed = randomSeed();
  operator.reset(seed);
  operator.setHeatFuel(95, 40);
  operatorPressure.reset(randomSeed());
  operatorAnalysis.classList.remove("active", "success");
  operatorAnalysis.querySelector("strong").textContent = "Disrupt the plasma to see why it failed.";
  operatorAnalysis.querySelector("p").textContent = "The analysis uses temperature, density, stability limits, disturbances, and actuator settings from the final state.";
});
document.addEventListener("keydown", (e) => {
  if (!document.getElementById("mode-operator").classList.contains("active")) return;
  const heat = document.querySelector('[data-slider="heat-operator"]');
  const fuel = document.querySelector('[data-slider="fuel-operator"]');
  const STEP = 6;
  if (e.key === "w" || e.key === "W") heat.value = Math.min(220, +heat.value + STEP);
  else if (e.key === "s" || e.key === "S") heat.value = Math.max(0, +heat.value - STEP);
  else if (e.key === "d" || e.key === "D") fuel.value = Math.min(150, +fuel.value + STEP);
  else if (e.key === "a" || e.key === "A") fuel.value = Math.max(0, +fuel.value - STEP);
  else if (e.key === "r" || e.key === "R") {
    const seed = randomSeed();
    operator.reset(seed);
    operator.setHeatFuel(95, 40);
    operatorPressure.reset(randomSeed());
    operatorAnalysis.classList.remove("active", "success");
    operatorAnalysis.querySelector("strong").textContent = "Disrupt the plasma to see why it failed.";
    operatorAnalysis.querySelector("p").textContent = "The analysis uses temperature, density, stability limits, disturbances, and actuator settings from the final state.";
  }
  else return;
  heat.dispatchEvent(new Event("input"));
  fuel.dispatchEvent(new Event("input"));
});

// ---------------- Mode 3: AI vs You ----------------
const RACE_SEED = 42;
const human = makeDriver({
  canvasKey: "race-human", statusKey: "race-human",
  heatKey: "heat-race", fuelKey: "fuel-race",
  timerKey: "race-human", hudKey: "race-human",
  disturbanceConfig: resolveDisturbance(activeScenario(), DISTURBANCE_HARD),
  seed: RACE_SEED,
  particleCount: 9500,
  simConfig: resolveSimConfig(activeScenario()),
  initialStateArgs: resolveInitialStateArgs(activeScenario()),
});
const aiCanvas = document.querySelector('[data-canvas="race-ai"]');
const aiHud = document.querySelector('[data-hud="race-ai"]');
const aiStatus = document.querySelector('[data-status="race-ai"]');
const aiTimer = document.querySelector('[data-timer="race-ai"]');
const aiReward = document.querySelector('[data-reward="race-ai"]');
const humanReward = document.querySelector('[data-reward="race-human"]');
const agentSelect = document.querySelector('[data-select="agent"]');
const agentMeta = document.querySelector("[data-agent-meta]");
const policySummary = document.querySelector("[data-policy-summary]");
const raceHumanAnalysis = document.querySelector('[data-analysis="race-human"]');
const POLICY_FILES = ["random_agent", "constant_agent", "rule_based_agent", "trained_agent"];
const RACE_DURATION_DEFAULT_S = 20;
let aiTrajectory = null;
let aiRunning = false;
let aiTotalReward = 0;
let aiLiveState = initialState(raceInitialStateArgs);
let aiLiveDisturbances = new DisturbanceGenerator(RACE_SEED, resolveDisturbance(activeScenario(), DISTURBANCE_HARD));
let aiPolicy = makeAiPolicy(agentSelect.value, RACE_SEED + 900);
let raceActive = false;
let aiLastFrame = performance.now() / 1000;
const aiHeatCommand = makeVirtualSlider(95);
const aiFuelCommand = makeVirtualSlider(40);
const aiDriver = {
  getState: () => aiLiveState,
  isRunning: () => aiRunning,
  stop() { aiRunning = false; },
};
const racePressure = makeActuatorPressure({
  driver: human,
  heatSlider: document.querySelector('[data-slider="heat-race"]'),
  fuelSlider: document.querySelector('[data-slider="fuel-race"]'),
  eventEl: document.querySelector("[data-race-event]"),
  seed: RACE_SEED + 300,
  label: "manual load",
  durationS: RACE_DURATION_DEFAULT_S,
  firstEventS: 1.45,
  interval: [1.05, 2.0],
  heatKick: [24, 50],
  fuelKick: [16, 37],
  bothChance: 0.42,
  slideDuration: [0.28, 0.9],
  recoveryGap: [0.6, 1.05],
  scenarioPressure: resolvePressureScenario(activeScenario()),
});
const aiPressure = makeActuatorPressure({
  driver: aiDriver,
  heatSlider: aiHeatCommand,
  fuelSlider: aiFuelCommand,
  eventEl: null,
  seed: RACE_SEED + 300,
  label: "ai load",
  durationS: RACE_DURATION_DEFAULT_S,
  firstEventS: 1.45,
  interval: [1.05, 2.0],
  heatKick: [24, 50],
  fuelKick: [16, 37],
  bothChance: 0.42,
  slideDuration: [0.28, 0.9],
  recoveryGap: [0.6, 1.05],
  scenarioPressure: resolvePressureScenario(activeScenario()),
});
const racePressureControl = {
  reset(seed) {
    racePressure.reset(seed);
    aiPressure.reset(seed);
  },
  tick() {
    racePressure.tick();
    aiPressure.tick();
  },
  setDifficulty(level) {
    racePressure.setDifficulty(level);
    aiPressure.setDifficulty(level);
  },
  getDifficulty: () => racePressure.getDifficulty(),
  setScenarioPressure(sc) {
    racePressure.setScenarioPressure(sc);
    aiPressure.setScenarioPressure(sc);
  },
  getDurationS: () => racePressure.getDurationS(),
};
wireDifficultyControl("race", racePressureControl);

// Dedicated PlasmaScene for the AI side - live policy controller, not just playback.
const aiScene = new PlasmaScene(aiCanvas, { particleCount: 9500 });

async function loadTrajectory(name) {
  const url = `../trajectories/${name}.json`;
  try {
    const res = await fetch(url, { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    aiTrajectory = await res.json();
    const meta = aiTrajectory.metadata || {};
    let label = POLICY_EXPLANATIONS[name] ?? "";
    label += ` Reference export: ${meta.survival_time_s?.toFixed(2) ?? "?"}s, reward ${meta.total_reward?.toFixed(0) ?? "?"}.`;
    if (name === "trained_agent") label += ` Browser actor: ${sacActorLoadStatus}.`;
    if (meta.placeholder) label += " Reference export is still the tuned placeholder until SAC trajectories are regenerated.";
    agentMeta.textContent = label;
    aiPolicy = makeAiPolicy(name, RACE_SEED + 900);
    aiStatus.textContent = "Policy loaded - press Start race";
  } catch (err) {
    agentMeta.textContent = `${POLICY_EXPLANATIONS[name] ?? ""} Metadata failed to load (${err.message}).`;
    aiTrajectory = null;
    aiPolicy = makeAiPolicy(name, RACE_SEED + 900);
  }
}
agentSelect.addEventListener("change", () => {
  loadTrajectory(agentSelect.value);
  updatePolicySummaryActive();
});
loadTrajectory(agentSelect.value);
loadSacActor();

async function loadPolicySummary() {
  if (!policySummary) return;
  const rows = [];
  for (const name of POLICY_FILES) {
    try {
      const res = await fetch(`../trajectories/${name}.json`, { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      rows.push({ name, metadata: payload.metadata || {} });
    } catch (err) {
      rows.push({ name, metadata: { error: err.message } });
    }
  }

  policySummary.innerHTML = '<div class="summary-label">Standard reference</div>';
  for (const row of rows) {
    const meta = row.metadata;
    const card = document.createElement("div");
    card.className = `policy-card${meta.placeholder ? " placeholder" : ""}`;
    card.dataset.policy = row.name;
    const displayName = row.name.replace("_agent", "").replace("_", " ");
    if (meta.error) {
      card.innerHTML = `<div class="name">${displayName}</div><div class="metrics">missing</div>`;
    } else {
      card.innerHTML = `
        <div class="name">${displayName}</div>
        <div class="metrics">
          <span><strong>${Number(meta.survival_time_s ?? 0).toFixed(1)}s</strong> survive</span>
          <span><strong>${Number(meta.total_reward ?? 0).toFixed(0)}</strong> reward</span>
        </div>
      `;
    }
    policySummary.appendChild(card);
  }
  updatePolicySummaryActive();
}

function updatePolicySummaryActive() {
  if (!policySummary) return;
  policySummary.querySelectorAll(".policy-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.policy === agentSelect.value);
  });
}

loadPolicySummary();

function aiState() {
  return aiLiveState;
}

function tickLiveAi() {
  if (!aiRunning || aiLiveState.disrupted) return;

  const desired = policyActionToSliderUnits(aiPolicy(aiLiveState));
  const policySkill = {
    random_agent: 0.55,
    constant_agent: 0.65,
    rule_based_agent: 0.9,
    trained_agent: 1.05,
  }[agentSelect.value] ?? 0.9;

  pullSliderToward(aiHeatCommand, desired.heatMW, 8.5 * policySkill, 220);
  pullSliderToward(aiFuelCommand, desired.fuelUnits, 3.8 * policySkill, 150);

  const action = physicalActionFromSliderUnits(Number(aiHeatCommand.value), Number(aiFuelCommand.value));
  aiLiveState = step(aiLiveState, action, raceSimConfig, aiLiveDisturbances);
  aiTotalReward += reward(aiLiveState);

  if (aiLiveState.disrupted || aiLiveState.time_s >= racePressureControl.getDurationS()) {
    aiRunning = false;
  }
}

function startRace() {
  const pressureSeed = randomSeed();
  human.reset(RACE_SEED);
  human.setHeatFuel(95, 40);
  racePressureControl.reset(pressureSeed);
  raceHumanAnalysis.classList.remove("active", "success");
  raceHumanAnalysis.querySelector("strong").textContent = "Race failure analysis will appear here.";
  aiLiveState = initialState(raceInitialStateArgs);
  aiLiveDisturbances = new DisturbanceGenerator(
    RACE_SEED,
    resolveDisturbance(activeScenario(), DISTURBANCE_HARD),
  );
  aiHeatCommand.value = "95";
  aiFuelCommand.value = "40";
  aiPolicy = makeAiPolicy(agentSelect.value, pressureSeed + 17);
  aiTotalReward = 0;
  aiRunning = true;
  raceActive = true;
  aiStatus.textContent = "Live policy running";
}

document.querySelector('[data-action="race-start"]').addEventListener("click", startRace);
document.querySelector('[data-action="race-reset"]').addEventListener("click", startRace);

// ---------------- scenario orchestrator ----------------
const scenarioChips = document.querySelectorAll("[data-scenario-chip]");
const scenarioDescription = document.querySelector("[data-scenario-description]");
const scenarioButtons = Array.from(document.querySelectorAll("[data-scenario]"));

function refreshScenarioUi(scenario) {
  scenarioChips.forEach((chip) => {
    const labelEl = chip.querySelector("strong");
    if (labelEl) labelEl.textContent = scenario.statusCopy ?? scenario.label;
  });
  if (scenarioDescription) scenarioDescription.textContent = scenario.description ?? "";
  scenarioButtons.forEach((btn) => {
    const active = btn.dataset.scenario === scenario.id;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function applyScenario(id) {
  if (!SCENARIOS[id]) id = DEFAULT_SCENARIO_ID;
  currentScenarioId = id;
  const scenario = activeScenario();
  const simCfg = resolveSimConfig(scenario);
  const initArgs = resolveInitialStateArgs(scenario);
  const learnDisturbance = currentLearnDisturbance();
  const hardDisturbance = resolveDisturbance(scenario, DISTURBANCE_HARD);
  const scenarioPressure = resolvePressureScenario(scenario);

  raceSimConfig = simCfg;
  raceInitialStateArgs = initArgs;

  // Learn
  learn.setSimConfig(simCfg);
  learn.setInitialStateArgs(initArgs);
  learn.setDisturbances(learnDisturbance, randomSeed());
  learn.reset();

  // Operator
  operator.setSimConfig(simCfg);
  operator.setInitialStateArgs(initArgs);
  operator.setDisturbances(hardDisturbance, randomSeed());
  operator.reset(randomSeed());
  operator.setHeatFuel(95, 40);
  operatorPressure.setScenarioPressure(scenarioPressure);
  operatorPressure.reset(randomSeed());
  operatorAnalysis.classList.remove("active", "success");
  operatorAnalysis.querySelector("strong").textContent = "Disrupt the plasma to see why it failed.";
  operatorAnalysis.querySelector("p").textContent = "The analysis uses temperature, density, stability limits, disturbances, and actuator settings from the final state.";

  // Race human
  human.setSimConfig(simCfg);
  human.setInitialStateArgs(initArgs);
  human.setDisturbances(hardDisturbance, RACE_SEED);
  human.reset(RACE_SEED);
  human.setHeatFuel(95, 40);

  // Race AI live state
  racePressureControl.setScenarioPressure(scenarioPressure);
  aiLiveState = initialState(initArgs);
  aiLiveDisturbances = new DisturbanceGenerator(RACE_SEED, hardDisturbance);
  aiHeatCommand.value = "95";
  aiFuelCommand.value = "40";
  aiTotalReward = 0;
  aiRunning = false;
  raceActive = false;
  aiStatus.textContent = "Idle";
  raceHumanAnalysis.classList.remove("active", "success");
  raceHumanAnalysis.querySelector("strong").textContent = "Race failure analysis will appear here.";

  refreshScenarioUi(scenario);
}

scenarioButtons.forEach((btn) => {
  btn.addEventListener("click", () => applyScenario(btn.dataset.scenario));
});

applyScenario(currentScenarioId);

// ---------------- main loop ----------------
function loop() {
  const now = performance.now() / 1000;
  const aiDt = Math.max(0.001, Math.min(0.1, now - aiLastFrame));

  // Only tick the visible mode's heavy renderers — and the AI side which
  // sometimes needs to render its idle/loaded preview.
  const learnVisible = document.getElementById("mode-learn").classList.contains("active");
  const operatorVisible = document.getElementById("mode-operator").classList.contains("active");
  const raceVisible = document.getElementById("mode-race").classList.contains("active");

  if (learnVisible) learn.tick();
  if (operatorVisible) {
    operatorPressure.tick();
    operator.tick();
    updateAnalysis(operatorAnalysis, operator.getState());
  }

  if (raceVisible) {
    if (raceActive) {
      racePressureControl.tick();
      human.tick();
      tickLiveAi();
      updateAnalysis(raceHumanAnalysis, human.getState());
      humanReward.textContent = human.getTotalReward().toFixed(1);
    } else {
      human.scene.update(human.getState(), aiDt);
    }

    const s = aiState();
    if (s) {
      aiScene.update(s, aiDt);
      updateHUD(aiHud, s);
      if (s.disrupted) {
        aiStatus.classList.remove("good", "warn"); aiStatus.classList.add("danger");
        aiStatus.textContent = `Disruption: ${s.disruption_reason}`;
        aiRunning = false;
      } else {
        const tone = statusFor(s);
        aiStatus.classList.remove("good", "warn", "danger");
        aiStatus.classList.add(tone.tone);
        aiStatus.textContent = tone.text;
      }
      aiTimer.textContent = `${s.time_s.toFixed(2)} s`;
      aiReward.textContent = aiTotalReward.toFixed(1);
    } else {
      // No trajectory loaded yet — draw an idle plasma so the canvas isn't blank.
      aiScene.update(null, aiDt);
    }
  }

  aiLastFrame = now;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
