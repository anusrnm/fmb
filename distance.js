export function calculateDistance(pointA, pointB) {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  return Math.hypot(dx, dy);
}
