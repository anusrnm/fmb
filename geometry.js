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

export function calculatePerimeter(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }
  let perimeter = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    perimeter += distanceWorld(points[index], points[index + 1]);
  }
  if (points.length >= 3) {
    perimeter += distanceWorld(points[points.length - 1], points[0]);
  }
  return perimeter;
}

export function calculateInteriorAngles(points) {
  if (!Array.isArray(points) || points.length < 3) {
    return [];
  }
  const angles = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const vectorA = { x: previous.x - current.x, y: previous.y - current.y };
    const vectorB = { x: next.x - current.x, y: next.y - current.y };
    const magnitudeA = Math.hypot(vectorA.x, vectorA.y);
    const magnitudeB = Math.hypot(vectorB.x, vectorB.y);
    if (magnitudeA === 0 || magnitudeB === 0) {
      angles.push(null);
      continue;
    }
    const dot = vectorA.x * vectorB.x + vectorA.y * vectorB.y;
    const cosine = clamp(dot / (magnitudeA * magnitudeB), -1, 1);
    angles.push(Math.acos(cosine) * (180 / Math.PI));
  }
  return angles;
}

function _orientation(p, q, r) {
  const value = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(value) < 1e-9) return 0;
  return value > 0 ? 1 : 2;
}

function _onSegment(p, q, r) {
  const e = 1e-9;
  return (
    q.x <= Math.max(p.x, r.x) + e && q.x >= Math.min(p.x, r.x) - e &&
    q.y <= Math.max(p.y, r.y) + e && q.y >= Math.min(p.y, r.y) - e
  );
}

function _segmentsIntersect(s1, s2) {
  const { start: p1, end: q1 } = s1;
  const { start: p2, end: q2 } = s2;
  const o1 = _orientation(p1, q1, p2);
  const o2 = _orientation(p1, q1, q2);
  const o3 = _orientation(p2, q2, p1);
  const o4 = _orientation(p2, q2, q1);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && _onSegment(p1, p2, q1)) return true;
  if (o2 === 0 && _onSegment(p1, q2, q1)) return true;
  if (o3 === 0 && _onSegment(p2, p1, q2)) return true;
  if (o4 === 0 && _onSegment(p2, q1, q2)) return true;
  return false;
}

export function findSelfIntersections(points) {
  if (!Array.isArray(points) || points.length < 4) {
    return [];
  }
  const segments = points.map((point, index) => ({
    index,
    start: point,
    end: points[(index + 1) % points.length],
  }));
  const n = points.length;
  const intersections = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const diff = Math.abs(i - j);
      if (diff === 1 || diff === n - 1) continue; // adjacent edges share a vertex
      if (_segmentsIntersect(segments[i], segments[j])) {
        intersections.push({ segmentA: i, segmentB: j });
      }
    }
  }
  return intersections;
}
