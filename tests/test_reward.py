"""Tests for the centralized reward shaping in sim.reward."""

from __future__ import annotations

import unittest

import numpy as np

from sim.plasma0d import initial_state
from sim.reward import compute_reward


class RewardTests(unittest.TestCase):
    def test_disruption_dominates(self):
        state_alive = initial_state(T_keV=15.0, n=0.8e20)
        state_dead = initial_state(T_keV=15.0, n=0.8e20)
        from dataclasses import replace

        state_dead = replace(state_dead, disrupted=True)
        a = np.zeros(2)
        self.assertGreater(compute_reward(state_alive, a), compute_reward(state_dead, a))

    def test_action_jerk_penalized(self):
        state = initial_state(T_keV=15.0, n=0.8e20)
        a = np.array([1.0, 1.0])
        prev_smooth = np.array([0.95, 0.95])
        prev_jerky = np.array([-1.0, -1.0])
        self.assertGreater(
            compute_reward(state, a, prev_smooth),
            compute_reward(state, a, prev_jerky),
        )

    def test_target_operation_rewarded(self):
        on_target = initial_state(T_keV=15.0, n=0.80e20)
        off_target = initial_state(T_keV=8.0, n=0.30e20)
        a = np.zeros(2)
        self.assertGreater(compute_reward(on_target, a), compute_reward(off_target, a))


if __name__ == "__main__":
    unittest.main()
