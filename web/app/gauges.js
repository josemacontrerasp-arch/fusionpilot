// Lightweight numeric gauges. Each gauge is a div the renderer mutates.

const GAUGE_SPECS = [
  { key: "T_keV",            label: "Temperature",   unit: "keV",  warn: 18, danger: 25, fmt: (v) => v.toFixed(1) },
  { key: "n",                label: "Density",       unit: "m⁻³",  warn: 1.0e20, danger: 1.15e20, fmt: (v) => (v / 1e20).toFixed(2) + "e20" },
  { key: "P_fusion_W",       label: "Fusion power",  unit: "MW",   warn: 0, danger: 0, fmt: (v) => (v / 1e6).toFixed(1) },
  { key: "beta_ratio",       label: "β ratio",       unit: "",     warn: 0.85, danger: 1.0, fmt: (v) => v.toFixed(2) },
  { key: "greenwald_ratio",  label: "n / n_GW",      unit: "",     warn: 0.85, danger: 1.0, fmt: (v) => v.toFixed(2) },
  { key: "stability",        label: "Stability",     unit: "%",    warn: 0,    danger: 0,   fmt: (v) => (v * 100).toFixed(0) },
];

export function buildGauges(container) {
  container.innerHTML = "";
  for (const spec of GAUGE_SPECS) {
    const div = document.createElement("div");
    div.className = "gauge";
    div.dataset.key = spec.key;
    div.innerHTML = `
      <div class="label">${spec.label}</div>
      <div class="value">— <span class="unit">${spec.unit}</span></div>
    `;
    container.appendChild(div);
  }
}

export function updateGauges(container, state) {
  for (const spec of GAUGE_SPECS) {
    const el = container.querySelector(`[data-key="${spec.key}"]`);
    if (!el) continue;
    const value = state[spec.key];
    el.querySelector(".value").innerHTML = `${spec.fmt(value)} <span class="unit">${spec.unit}</span>`;
    el.classList.remove("warn", "danger");
    if (spec.key === "stability") {
      // Inverted: low stability is bad
      if (value < 0.15) el.classList.add("danger");
      else if (value < 0.35) el.classList.add("warn");
      continue;
    }
    if (spec.danger > 0 && value > spec.danger) el.classList.add("danger");
    else if (spec.warn > 0 && value > spec.warn) el.classList.add("warn");
  }
}
