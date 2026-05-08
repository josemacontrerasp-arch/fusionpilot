import { access, readFile } from "node:fs/promises";

const required = [
  "web/index.html",
  "web/style.css",
  "web/app/main.js",
  "web/app/plasma3d.js",
  "web/app/gauges.js",
  "web/app/scenarios.js",
  "web/policies/sac_actor.json",
  "web/sim/plasma.js",
  "web/sim/rng.js",
  "trajectories/random_agent.json",
  "trajectories/constant_agent.json",
  "trajectories/rule_based_agent.json",
  "trajectories/trained_agent.json",
];

for (const file of required) {
  await access(file);
}

const html = await readFile("web/index.html", "utf8");
const main = await readFile("web/app/main.js", "utf8");
const plasma = await readFile("web/app/plasma3d.js", "utf8");
const scenarios = await readFile("web/app/scenarios.js", "utf8");

const checks = [
  [html.includes("three@0.165.0"), "Three.js importmap is present"],
  [html.includes('data-canvas="learn"'), "Learn canvas exists"],
  [html.includes('data-canvas="race-ai"'), "Race AI canvas exists"],
  [html.includes("data-policy-summary"), "Race policy summary strip exists"],
  [html.includes('data-scenario="standard"'), "Scenario picker exists"],
  [html.includes("data-scenario-chip"), "Scenario chip is wired into mode panels"],
  [main.includes("tickLiveAi"), "Race AI runs a live browser policy"],
  [main.includes("sacActorPolicy"), "Exported SAC actor is used by browser"],
  [main.includes("racePressureControl"), "Race pressure is mirrored to human and AI"],
  [main.includes("currentDisturbanceConfig"), "Driver preserves disturbance config"],
  [main.includes("loadPolicySummary"), "Policy summary loader exists"],
  [main.includes("applyScenario"), "Scenario orchestrator is wired"],
  [scenarios.includes("SCENARIOS"), "Scenario constants are centralized"],
  [scenarios.includes("compact") && scenarios.includes("storm") && scenarios.includes("precision"), "All scenario presets are defined"],
  [plasma.includes("PLASMA_VISUALS"), "Particle constants are centralized"],
  [plasma.includes("coreSharpness"), "Sharp particle shader controls exist"],
];

const failed = checks.filter(([ok]) => !ok);
if (failed.length) {
  for (const [, message] of failed) console.error(`Missing: ${message}`);
  process.exit(1);
}

console.log("Web structure check passed.");
