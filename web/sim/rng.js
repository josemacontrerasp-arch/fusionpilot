// Tiny seeded RNG (mulberry32). Deterministic so AI-vs-You uses identical
// disturbance schedules on both sides.
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  return {
    uniform(lo, hi) { return lo + (hi - lo) * next(); },
    normal() {
      // Box-Muller; cached pair would be faster but unnecessary here.
      const u1 = Math.max(next(), 1e-9);
      const u2 = next();
      return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    },
  };
}
