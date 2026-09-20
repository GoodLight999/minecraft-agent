export function isDecisionFresh(before, after, { maxAgeMs = 5000, maxDisplacement = 0.8 } = {}) {
  if (!before || !after) return false;
  if (Date.now() - before.capturedAt > maxAgeMs) return false;
  if (before.dimension !== after.dimension) return false;
  if (!before.position || !after.position) return true;
  const dx = before.position.x - after.position.x;
  const dy = before.position.y - after.position.y;
  const dz = before.position.z - after.position.z;
  return Math.hypot(dx, dy, dz) < maxDisplacement;
}
