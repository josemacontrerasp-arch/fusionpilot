# FusionPilot Roadmap

## Next 2 Hours

1. Train a real SAC checkpoint for at least 50k steps.
2. Export `trained_agent.json` from that checkpoint and confirm the placeholder label disappears.
3. Record a short AI-vs-human demo clip with the updated particle renderer.

## Next 1 Day

1. Tune reward weights against real SAC evaluation results.
2. Add a compact race summary strip with survival time, reward delta, and policy ranking.
3. Add a tiny reward/survival sparkline under each race canvas.

## Next 3 Days

1. Add early/mid/trained checkpoint exports for a visible learning progression.
2. Add a lightweight deployment target for the static `dist/` build.
3. Polish the presenter script and record the 90-second Devpost video.

## Stretch

1. Export SAC actor to ONNX and run live policy inference in-browser.
2. Replace the toy D-T reactivity with a better fitted lookup table.
3. Add a second actuator such as impurity/radiation control while keeping the UI simple.
