"""Generate simulator validation plots.

Outputs (under ``--out``, default ``docs/``):

- ``validation_constant.svg``           — clean (no disturbance) constant control
- ``validation_constant_disturbed.svg`` — constant control vs ELM/pumpout
- ``validation_rule_based_disturbed.svg`` — rule-based feedback vs disturbances
- ``validation_tuned_disturbed.svg``    — tuned heuristic baseline
- ``survival_comparison.svg``           — bar chart over multiple seeds

If Matplotlib is available it is used; otherwise we emit dependency-free SVG.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from statistics import mean, stdev

from .controllers import (
    constant_controller,
    random_controller,
    rule_based_controller,
    run_episode,
    tuned_controller,
)


def plot_records(records: list[dict], output_stem: Path, title: str) -> Path:
    try:
        import matplotlib.pyplot as plt
    except ImportError:
        output_path = output_stem.with_suffix(".svg")
        plot_records_svg(records, output_path, title)
        return output_path

    t = [row["t"] for row in records]

    fig, axes = plt.subplots(4, 2, figsize=(12, 11), sharex=True)
    axes = axes.ravel()
    series = [
        ("T_keV", "Temperature (keV)"),
        ("n", "Density (m^-3)"),
        ("P_fusion", "Fusion power (W)"),
        ("tau_E", "Confinement time (s)"),
        ("beta_ratio", "Beta-like ratio"),
        ("greenwald_ratio", "Density-limit ratio"),
        ("P_ext", "Heating (W)"),
        ("S_fuel", "Fueling (m^-3 s^-1)"),
    ]

    for ax, (key, label) in zip(axes, series, strict=True):
        ax.plot(t, [row[key] for row in records], lw=1.8)
        ax.set_ylabel(label)
        ax.grid(True, alpha=0.25)
        for row in records:
            if row["disturbance"] is not None:
                ax.axvline(row["t"], color="tab:red", alpha=0.15, lw=0.8)

    axes[-1].set_xlabel("Time (s)")
    axes[-2].set_xlabel("Time (s)")
    fig.suptitle(title)
    fig.tight_layout()
    output_path = output_stem.with_suffix(".png")
    fig.savefig(output_path, dpi=160)
    plt.close(fig)
    return output_path


def plot_records_svg(records: list[dict], output_path: Path, title: str) -> None:
    width = 1200
    height = 1000
    margin_left = 86
    margin_right = 34
    margin_top = 72
    margin_bottom = 42
    gap_x = 58
    gap_y = 54
    chart_w = (width - margin_left - margin_right - gap_x) / 2
    chart_h = (height - margin_top - margin_bottom - 3 * gap_y) / 4
    t = [float(row["t"]) for row in records]
    t_min = min(t)
    t_max = max(t)
    series = [
        ("T_keV", "Temperature (keV)"),
        ("n", "Density (m^-3)"),
        ("P_fusion", "Fusion power (W)"),
        ("tau_E", "Confinement time (s)"),
        ("beta_ratio", "Beta-like ratio"),
        ("greenwald_ratio", "Density-limit ratio"),
        ("P_ext", "Heating (W)"),
        ("S_fuel", "Fueling (m^-3 s^-1)"),
    ]

    def esc(text: str) -> str:
        return (
            text.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
        )

    def fmt(value: float) -> str:
        if abs(value) >= 1.0e4 or (0 < abs(value) < 0.01):
            return f"{value:.2e}"
        return f"{value:.2f}"

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#101319"/>',
        f'<text x="{width / 2}" y="34" text-anchor="middle" fill="#f2f5ff" font-family="Arial" font-size="22">{esc(title)}</text>',
    ]

    disturbance_times = [float(row["t"]) for row in records if row["disturbance"] is not None]

    for index, (key, label) in enumerate(series):
        col = index % 2
        row = index // 2
        x0 = margin_left + col * (chart_w + gap_x)
        y0 = margin_top + row * (chart_h + gap_y)
        values = [float(item[key]) for item in records]
        v_min = min(values)
        v_max = max(values)
        if v_min == v_max:
            pad = abs(v_min) * 0.05 or 1.0
            v_min -= pad
            v_max += pad
        else:
            pad = (v_max - v_min) * 0.08
            v_min -= pad
            v_max += pad

        def sx(time_s: float) -> float:
            if t_max == t_min:
                return x0
            return x0 + (time_s - t_min) / (t_max - t_min) * chart_w

        def sy(value: float) -> float:
            return y0 + chart_h - (value - v_min) / (v_max - v_min) * chart_h

        points = " ".join(f"{sx(time_s):.2f},{sy(value):.2f}" for time_s, value in zip(t, values, strict=True))

        parts.extend(
            [
                f'<rect x="{x0:.2f}" y="{y0:.2f}" width="{chart_w:.2f}" height="{chart_h:.2f}" fill="#161b24" stroke="#31394a"/>',
                f'<text x="{x0:.2f}" y="{y0 - 12:.2f}" fill="#d9e1f2" font-family="Arial" font-size="14">{esc(label)}</text>',
                f'<text x="{x0 - 10:.2f}" y="{y0 + 5:.2f}" text-anchor="end" fill="#8f9bb2" font-family="Arial" font-size="11">{fmt(v_max)}</text>',
                f'<text x="{x0 - 10:.2f}" y="{y0 + chart_h:.2f}" text-anchor="end" fill="#8f9bb2" font-family="Arial" font-size="11">{fmt(v_min)}</text>',
            ]
        )
        for disturbance_t in disturbance_times:
            x = sx(disturbance_t)
            parts.append(
                f'<line x1="{x:.2f}" y1="{y0:.2f}" x2="{x:.2f}" y2="{y0 + chart_h:.2f}" stroke="#ff6b6b" stroke-opacity="0.22"/>'
            )
        parts.append(f'<polyline fill="none" stroke="#70d6ff" stroke-width="2" points="{points}"/>')

    parts.append("</svg>")
    output_path.write_text("\n".join(parts), encoding="utf-8")


def _bar_panel(
    rows: list[dict],
    value_key: str,
    label: str,
    x0: float,
    y0: float,
    w: float,
    h: float,
    palette: list[str],
    *,
    show_disrupt: bool = False,
    err_key: str | None = None,
) -> list[str]:
    parts: list[str] = []
    values = [row[value_key] for row in rows]
    err = [row.get(err_key, 0.0) for row in rows] if err_key else [0.0] * len(rows)
    max_value = max((v + e for v, e in zip(values, err)), default=1.0)
    max_value = max(max_value, 1.0) * 1.1

    parts.extend(
        [
            f'<text x="{x0:.1f}" y="{y0 - 12:.1f}" fill="#d9e1f2" font-family="Arial" font-size="14">{label}</text>',
            f'<line x1="{x0:.1f}" y1="{y0 + h:.1f}" x2="{x0 + w:.1f}" y2="{y0 + h:.1f}" stroke="#3a4257"/>',
            f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{x0:.1f}" y2="{y0 + h:.1f}" stroke="#3a4257"/>',
        ]
    )
    for i in range(5):
        v = max_value * (i / 4.0)
        y = y0 + h - (v / max_value) * h
        parts.append(
            f'<line x1="{x0:.1f}" y1="{y:.1f}" x2="{x0 + w:.1f}" y2="{y:.1f}" '
            f'stroke="#262d3a" stroke-dasharray="3,3"/>'
        )
        parts.append(
            f'<text x="{x0 - 8:.1f}" y="{y + 4:.1f}" text-anchor="end" fill="#8f9bb2" '
            f'font-family="Arial" font-size="11">{v:.1f}</text>'
        )

    bar_gap = 14
    bar_w = (w - bar_gap * (len(rows) - 1)) / max(1, len(rows))
    for idx, row in enumerate(rows):
        x = x0 + idx * (bar_w + bar_gap)
        bh = (row[value_key] / max_value) * h
        y = y0 + h - bh
        color = palette[idx % len(palette)]
        parts.append(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_w:.1f}" height="{bh:.1f}" '
            f'fill="{color}" fill-opacity="0.85"/>'
        )
        if err_key and row.get(err_key, 0.0) > 0.0:
            err_h = (row[err_key] / max_value) * h
            cx = x + bar_w / 2
            parts.extend(
                [
                    f'<line x1="{cx:.1f}" y1="{y - err_h:.1f}" x2="{cx:.1f}" y2="{y + err_h:.1f}" stroke="#f2f5ff" stroke-width="1.5"/>',
                    f'<line x1="{cx - 6:.1f}" y1="{y - err_h:.1f}" x2="{cx + 6:.1f}" y2="{y - err_h:.1f}" stroke="#f2f5ff" stroke-width="1.5"/>',
                    f'<line x1="{cx - 6:.1f}" y1="{y + err_h:.1f}" x2="{cx + 6:.1f}" y2="{y + err_h:.1f}" stroke="#f2f5ff" stroke-width="1.5"/>',
                ]
            )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{y0 + h + 18:.1f}" '
            f'text-anchor="middle" fill="#d9e1f2" font-family="Arial" font-size="12">{row["name"]}</text>'
        )
        if show_disrupt:
            parts.append(
                f'<text x="{x + bar_w / 2:.1f}" y="{y0 + h + 34:.1f}" '
                f'text-anchor="middle" fill="#8f9bb2" font-family="Arial" font-size="10">'
                f'{row["disruption_rate"] * 100:.0f}% disrupt</text>'
            )
    return parts


def plot_survival_bar_svg(
    rows: list[dict],
    output_path: Path,
    title: str = "Policy comparison across disturbance seeds",
) -> None:
    """Dual-panel SVG: mean survival (with stdev) and mean episode reward."""

    width = 1100
    height = 480
    margin_left = 70
    margin_right = 40
    margin_top = 80
    margin_bottom = 70
    panel_gap = 70
    chart_w = (width - margin_left - margin_right - panel_gap) / 2
    chart_h = height - margin_top - margin_bottom

    palette = ["#ff6b6b", "#ffb347", "#70d6ff", "#9d8df1", "#5be39d"]

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#101319"/>',
        f'<text x="{width / 2}" y="34" text-anchor="middle" fill="#f2f5ff" font-family="Arial" font-size="20">{title}</text>',
        f'<text x="{width / 2}" y="56" text-anchor="middle" fill="#8f9bb2" font-family="Arial" font-size="12">left: survival time (s) — right: mean episode reward</text>',
    ]
    parts.extend(
        _bar_panel(
            rows,
            value_key="mean_s",
            label="Mean survival (s)",
            x0=margin_left,
            y0=margin_top,
            w=chart_w,
            h=chart_h,
            palette=palette,
            show_disrupt=True,
            err_key="std_s",
        )
    )
    parts.extend(
        _bar_panel(
            rows,
            value_key="mean_reward",
            label="Mean reward",
            x0=margin_left + chart_w + panel_gap,
            y0=margin_top,
            w=chart_w,
            h=chart_h,
            palette=palette,
        )
    )
    parts.append("</svg>")
    output_path.write_text("\n".join(parts), encoding="utf-8")


def survival_comparison(out_dir: Path, seeds: list[int], seconds: float) -> Path:
    policies = [
        ("random", lambda s: random_controller(seed=s)),
        ("constant", lambda _s: constant_controller()),
        ("rule_based", lambda _s: rule_based_controller()),
        ("tuned", lambda _s: tuned_controller()),
    ]
    rows = []
    for name, factory in policies:
        survivals = []
        rewards = []
        disrupted = 0
        for seed in seeds:
            _, m = run_episode(factory(seed), seed=seed, disturbances=True, seconds=seconds)
            survivals.append(m.survival_time_s)
            rewards.append(m.total_reward)
            if m.disrupted:
                disrupted += 1
        rows.append(
            {
                "name": name,
                "mean_s": float(mean(survivals)),
                "std_s": float(stdev(survivals)) if len(survivals) > 1 else 0.0,
                "mean_reward": float(mean(rewards)),
                "disruption_rate": disrupted / len(seeds),
            }
        )
    out_path = out_dir / "survival_comparison.svg"
    plot_survival_bar_svg(rows, out_path)
    print("\nPolicy comparison:")
    print(f"  {'policy':<12} {'mean_s':>8} {'std_s':>7} {'reward':>10} {'disrupt%':>9}")
    for r in rows:
        print(
            f"  {r['name']:<12} "
            f"{r['mean_s']:>8.2f} "
            f"{r['std_s']:>7.2f} "
            f"{r['mean_reward']:>10.1f} "
            f"{r['disruption_rate'] * 100:>8.0f}%"
        )
    print(f"wrote {out_path}")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="docs", help="Output directory for plots.")
    parser.add_argument(
        "--seeds",
        type=int,
        nargs="+",
        default=[0, 1, 2, 3, 4, 5, 6, 7],
        help="Seeds for the survival-comparison bar chart.",
    )
    parser.add_argument("--seconds", type=float, default=20.0)
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    scenarios = [
        ("constant", constant_controller(), False),
        ("constant_disturbed", constant_controller(), True),
        ("rule_based_disturbed", rule_based_controller(), True),
        ("tuned_disturbed", tuned_controller(), True),
    ]
    for name, controller, disturbances in scenarios:
        records, metrics = run_episode(
            controller, seed=7, disturbances=disturbances, seconds=args.seconds
        )
        output_path = plot_records(
            records,
            out_dir / f"validation_{name}",
            f"{name}: survived {metrics.survival_time_s:.2f}s "
            f"(disrupted={metrics.disrupted})",
        )
        print(f"{name}: {metrics}")
        print(f"wrote {output_path}")

    survival_comparison(out_dir, list(args.seeds), float(args.seconds))


if __name__ == "__main__":
    main()
