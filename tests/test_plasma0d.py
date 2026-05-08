import unittest

from sim.controllers import random_controller, rule_based_controller, run_episode
from sim.plasma0d import (
    PlasmaAction,
    PlasmaConfig,
    confinement_times_s,
    fusion_powers_W,
    initial_state,
    limit_ratios,
    step,
)


class Plasma0DTests(unittest.TestCase):
    def test_initial_state_is_positive(self):
        state = initial_state()
        self.assertGreater(state.T_keV, 0.0)
        self.assertGreater(state.n, 0.0)
        self.assertGreater(state.W_J, 0.0)
        self.assertFalse(state.disrupted)

    def test_fusion_power_scales_strongly_with_density(self):
        p1, _ = fusion_powers_W(15.0, 0.5e20)
        p2, _ = fusion_powers_W(15.0, 1.0e20)
        self.assertGreater(p2, 3.5 * p1)

    def test_more_heating_raises_temperature_initially(self):
        low = initial_state(T_keV=10.0, n=0.65e20)
        high = initial_state(T_keV=10.0, n=0.65e20)
        for _ in range(60):
            low = step(low, PlasmaAction(30e6, 3.5e19)).state
            high = step(high, PlasmaAction(120e6, 3.5e19)).state
        self.assertGreater(high.T_keV, low.T_keV)

    def test_more_fueling_raises_density(self):
        low = initial_state(T_keV=10.0, n=0.60e20)
        high = initial_state(T_keV=10.0, n=0.60e20)
        for _ in range(80):
            low = step(low, PlasmaAction(90e6, 1.0e19)).state
            high = step(high, PlasmaAction(90e6, 7.0e19)).state
        self.assertGreater(high.n, low.n)

    def test_confinement_degrades_near_limits(self):
        cfg = PlasmaConfig()
        beta_safe, greenwald_safe = limit_ratios(12.0, 0.60e20, cfg.constants)
        beta_hot, greenwald_hot = limit_ratios(24.0, 0.95e20, cfg.constants)
        tau_safe, _ = confinement_times_s(beta_safe, greenwald_safe, cfg)
        tau_hot, _ = confinement_times_s(beta_hot, greenwald_hot, cfg)
        self.assertLess(tau_hot, tau_safe)

    def test_extreme_fueling_disrupts_on_density_limit(self):
        state = initial_state(T_keV=12.0, n=1.00e20)
        for _ in range(200):
            state = step(state, PlasmaAction(80e6, 1.5e20)).state
            if state.disrupted:
                break
        self.assertTrue(state.disrupted)
        self.assertEqual(state.disruption_reason, "density limit exceeded")

    def test_rule_based_survives_longer_than_random_on_seed(self):
        _, random_metrics = run_episode(
            random_controller(seed=4),
            seed=3,
            disturbances=True,
            seconds=12.0,
        )
        _, rule_metrics = run_episode(
            rule_based_controller(),
            seed=3,
            disturbances=True,
            seconds=12.0,
        )
        self.assertGreaterEqual(rule_metrics.survival_time_s, random_metrics.survival_time_s)


if __name__ == "__main__":
    unittest.main()
