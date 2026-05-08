"""Smoke tests for rl.env.

These tests are skipped automatically when Gymnasium is not installed so
``python -m unittest discover -s tests`` works on a base install.
"""

from __future__ import annotations

import unittest

try:
    import gymnasium  # noqa: F401

    GYM_AVAILABLE = True
except ImportError:
    GYM_AVAILABLE = False


@unittest.skipUnless(GYM_AVAILABLE, "Gymnasium not installed; install with .[rl]")
class EnvSmokeTests(unittest.TestCase):
    def test_reset_returns_correct_shape(self):
        from rl.env import FusionPlasma0DEnv

        env = FusionPlasma0DEnv(disturbance_seed=0)
        obs, info = env.reset()
        self.assertEqual(obs.shape, (8,))
        self.assertEqual(obs.dtype.kind, "f")
        self.assertIsInstance(info, dict)

    def test_step_returns_five_tuple(self):
        from rl.env import FusionPlasma0DEnv
        import numpy as np

        env = FusionPlasma0DEnv(disturbance_seed=0)
        env.reset()
        obs, reward, terminated, truncated, info = env.step(np.array([0.0, 0.0], dtype=np.float32))
        self.assertEqual(obs.shape, (8,))
        self.assertIsInstance(reward, float)
        self.assertIsInstance(terminated, bool)
        self.assertIsInstance(truncated, bool)
        self.assertIsInstance(info, dict)

    def test_episode_truncates_at_max_steps(self):
        from rl.env import FusionPlasma0DEnv
        import numpy as np

        env = FusionPlasma0DEnv(episode_seconds=0.2, disturbance_seed=0, disturbances=False)
        env.reset()
        terminated = truncated = False
        steps = 0
        while not (terminated or truncated):
            _, _, terminated, truncated, _ = env.step(np.array([-0.5, -0.5], dtype=np.float32))
            steps += 1
            if steps > 1000:
                self.fail("Episode did not terminate")
        # 0.2s / 0.02s dt = 10 steps max
        self.assertLessEqual(steps, 11)


if __name__ == "__main__":
    unittest.main()
