// Pure geometry and math helpers, free of DOM/state dependencies so they can be
// imported and unit-tested in isolation. See app.js for the stateful callers.

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function round3(value) {
  return Math.round(value * 1000) / 1000;
}

export function distanceWorld(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function distanceScreen(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function areaConversions(areaSqm) {
  const acres = areaSqm / 4046.8564224;
  return {
    hectares: areaSqm / 10000,
    ares: areaSqm / 100,
    sqm: areaSqm,
    acres,
    cents: acres * 100,
    sqft: areaSqm * 10.76391041671,
  };
}

export function projectPointToSegment(worldPoint, aWorld, bWorld) {
  const abx = bWorld.x - aWorld.x;
  const aby = bWorld.y - aWorld.y;
  const apx = worldPoint.x - aWorld.x;
  const apy = worldPoint.y - aWorld.y;
  const mag2 = abx * abx + aby * aby;
  if (mag2 === 0) {
    return { point: { ...aWorld }, t: 0 };
  }

  const t = clamp((apx * abx + apy * aby) / mag2, 0, 1);
  return {
    point: {
      x: aWorld.x + t * abx,
      y: aWorld.y + t * aby,
    },
    t,
  };
}

export function distancePointToSegmentScreen(target, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = target.x - a.x;
  const apy = target.y - a.y;
  const mag2 = abx * abx + aby * aby;
  if (mag2 === 0) {
    return distanceScreen(target, a);
  }
  const t = clamp((apx * abx + apy * aby) / mag2, 0, 1);
  const proj = { x: a.x + t * abx, y: a.y + t * aby };
  return distanceScreen(target, proj);
}

export function normalizeAngleRadians(value) {
  let angle = value;
  while (angle <= -Math.PI) {
    angle += 2 * Math.PI;
  }
  while (angle > Math.PI) {
    angle -= 2 * Math.PI;
  }
  return angle;
}

export function angleCandidateKey(candidate) {
  const left = Math.min(candidate.aId, candidate.bId);
  const right = Math.max(candidate.aId, candidate.bId);
  return `${candidate.vertexId}:${left}:${right}`;
}
