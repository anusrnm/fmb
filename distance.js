export function calculateDistance(pointA, pointB) {
  const dx = pointB.x - pointA.x;
  const dy = pointB.y - pointA.y;
  return Math.hypot(dx, dy);
}

export function calculatePerimeter(points) {
  if (!Array.isArray(points) || points.length < 2) {
    return 0;
  }

  let perimeter = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    perimeter += calculateDistance(points[index], points[index + 1]);
  }

  if (points.length >= 3) {
    perimeter += calculateDistance(points[points.length - 1], points[0]);
  }

  return perimeter;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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

    const dotProduct = vectorA.x * vectorB.x + vectorA.y * vectorB.y;
    const cosine = clamp(dotProduct / (magnitudeA * magnitudeB), -1, 1);
    const angleDegrees = Math.acos(cosine) * (180 / Math.PI);
    angles.push(angleDegrees);
  }

  return angles;
}

function orientation(pointA, pointB, pointC) {
  const value =
    (pointB.y - pointA.y) * (pointC.x - pointB.x) -
    (pointB.x - pointA.x) * (pointC.y - pointB.y);
  const epsilon = 1e-9;

  if (Math.abs(value) < epsilon) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function onSegment(pointA, pointB, pointC) {
  const epsilon = 1e-9;
  return (
    pointB.x <= Math.max(pointA.x, pointC.x) + epsilon &&
    pointB.x >= Math.min(pointA.x, pointC.x) - epsilon &&
    pointB.y <= Math.max(pointA.y, pointC.y) + epsilon &&
    pointB.y >= Math.min(pointA.y, pointC.y) - epsilon
  );
}

function segmentsIntersect(segmentA, segmentB) {
  const { start: p1, end: q1 } = segmentA;
  const { start: p2, end: q2 } = segmentB;

  const o1 = orientation(p1, q1, p2);
  const o2 = orientation(p1, q1, q2);
  const o3 = orientation(p2, q2, p1);
  const o4 = orientation(p2, q2, q1);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(p1, p2, q1)) {
    return true;
  }
  if (o2 === 0 && onSegment(p1, q2, q1)) {
    return true;
  }
  if (o3 === 0 && onSegment(p2, p1, q2)) {
    return true;
  }
  if (o4 === 0 && onSegment(p2, q1, q2)) {
    return true;
  }

  return false;
}

function areAdjacentSegments(segmentA, segmentB, pointCount) {
  const first = segmentA.index;
  const second = segmentB.index;

  if (Math.abs(first - second) === 1) {
    return true;
  }

  return (first === 0 && second === pointCount - 1) || (second === 0 && first === pointCount - 1);
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

  const intersections = [];

  for (let firstIndex = 0; firstIndex < segments.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < segments.length; secondIndex += 1) {
      const segmentA = segments[firstIndex];
      const segmentB = segments[secondIndex];

      if (areAdjacentSegments(segmentA, segmentB, points.length)) {
        continue;
      }

      if (segmentsIntersect(segmentA, segmentB)) {
        intersections.push({
          segmentA: segmentA.index,
          segmentB: segmentB.index,
        });
      }
    }
  }

  return intersections;
}
