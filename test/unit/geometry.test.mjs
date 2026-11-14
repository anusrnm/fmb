import assert from "node:assert/strict";
import test from "node:test";
import {
  angleCandidateKey,
  areaConversions,
  calculateInteriorAngles,
  calculatePerimeter,
  clamp,
  distancePointToSegmentScreen,
  distanceScreen,
  distanceWorld,
  findSelfIntersections,
  normalizeAngleRadians,
  polygonFromSideLengths,
  projectPointToSegment,
  round2,
  round3,
  triangleAreaFromSides,
  transformPoint,
} from "../../geometry.js";

test("transformPoint moves, rotates and mirrors about a non-origin pivot", () => {
  const pivot = { x: 2, y: 3 };
  const point = { x: 6, y: 5 };
  assert.deepEqual(transformPoint(point, pivot, { type: "move", dx: 0.12345, dy: -2 }),
    { x: 6.12345, y: 3 });
  assert.deepEqual(transformPoint(point, pivot, { type: "rotate", degrees: 90 }), { x: 0, y: 7 });
  assert.deepEqual(transformPoint(point, pivot, { type: "rotate", degrees: -90 }), { x: 4, y: -1 });
  assert.deepEqual(transformPoint(point, pivot, { type: "rotate", degrees: 180 }), { x: -2, y: 1 });
  assert.deepEqual(transformPoint(point, pivot, { type: "rotate", degrees: 720 }), point);
  assert.deepEqual(transformPoint(pivot, pivot, { type: "rotate", degrees: 37 }), pivot);
  assert.deepEqual(transformPoint(point, pivot, { type: "mirror", axis: "horizontal" }), { x: -2, y: 5 });
  assert.deepEqual(transformPoint(point, pivot, { type: "mirror", axis: "vertical" }), { x: 6, y: 1 });
});

test("rigid transformations preserve side lengths and area magnitude", () => {
  const points = [{ x: 2, y: 3 }, { x: 5.12345, y: 3 }, { x: 5.12345, y: 7.23456 }];
  const area = (vertices) => Math.abs(vertices.reduce((sum, point, index) => {
    const next = vertices[(index + 1) % vertices.length];
    return sum + point.x * next.y - point.y * next.x;
  }, 0)) / 2;
  for (const operation of [
    { type: "rotate", degrees: 37 },
    { type: "move", dx: 8.12345, dy: -7.54321 },
    { type: "mirror", axis: "horizontal" },
    { type: "mirror", axis: "vertical" },
  ]) {
    const transformed = points.map((point) => transformPoint(point, points[0], operation));
    assert.ok(Math.abs(area(transformed) - area(points)) < 1e-10);
    points.forEach((point, index) => {
      const next = (index + 1) % points.length;
      assert.ok(Math.abs(distanceWorld(point, points[next]) -
        distanceWorld(transformed[index], transformed[next])) < 1e-10);
    });
  }
});

test("transformPoint rejects invalid inputs and overflowing output", () => {
  const point = { x: 1, y: 2 };
  for (const operation of [
    null, { type: "scale" }, { type: "move", dx: NaN, dy: 1 },
    { type: "rotate", degrees: Infinity }, { type: "mirror", axis: "diagonal" },
  ]) {
    assert.throws(() => transformPoint(point, point, operation));
  }
  assert.throws(() => transformPoint({ x: Infinity, y: 2 }, point, { type: "rotate", degrees: 0 }));
  assert.throws(() => transformPoint({ x: 1e308, y: 0 }, point, { type: "move", dx: 1e308, dy: 0 }));
});

test("clamp constrains a value to the inclusive range", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
});

test("round2 and round3 round to fixed decimal places", () => {
  assert.equal(round2(1.23456), 1.23);
  assert.equal(round2(1.235), 1.24);
  assert.equal(round3(1.23456), 1.235);
  assert.equal(round3(2), 2);
});

test("distanceWorld and distanceScreen compute Euclidean distance", () => {
  assert.equal(distanceWorld({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(distanceScreen({ x: 1, y: 1 }, { x: 4, y: 5 }), 5);
});

test("areaConversions converts square metres to all supported units", () => {
  const result = areaConversions(10000);
  assert.equal(result.sqm, 10000);
  assert.equal(result.hectares, 1);
  assert.equal(result.ares, 100);
  assert.ok(Math.abs(result.acres - 2.4710538147) < 1e-6);
  assert.ok(Math.abs(result.cents - 247.10538147) < 1e-6);
  assert.ok(Math.abs(result.sqft - 107639.1041671) < 1e-3);
});

test("triangleAreaFromSides calculates area with Heron's formula", () => {
  assert.ok(Math.abs(triangleAreaFromSides(10, 10.41, 10.31) - 45.3655615638) < 1e-9);
  assert.equal(triangleAreaFromSides(3, 4, 5), 6);
  assert.equal(triangleAreaFromSides(1, 1, 2.1), 0);
  assert.equal(triangleAreaFromSides(0, 4, 5), 0);
});

test("polygonFromSideLengths preserves ordered lengths for minor and major arcs", () => {
  for (const sides of [[3, 4, 5], [2, 3, 4, 5], [5, 2, 2, 2], [1, 1, 1, 1, 1]]) {
    const points = polygonFromSideLengths(sides);
    assert.equal(points.length, sides.length);
    assert.deepEqual(findSelfIntersections(points), []);
    sides.forEach((side, index) => {
      assert.ok(Math.abs(distanceWorld(points[index], points[(index + 1) % points.length]) - side) < 1e-8);
    });
  }
});

test("polygonFromSideLengths rejects invalid and impossible polygons", () => {
  for (const sides of [[], [1, 2], [1, 1, 2], [1, 2, 4], [0, 1, 1], [1, NaN, 1]]) {
    assert.throws(() => polygonFromSideLengths(sides));
  }
});

test("projectPointToSegment clamps the projection to the segment", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  const mid = projectPointToSegment({ x: 5, y: 3 }, a, b);
  assert.deepEqual(mid.point, { x: 5, y: 0 });
  assert.equal(mid.t, 0.5);

  const before = projectPointToSegment({ x: -4, y: 2 }, a, b);
  assert.deepEqual(before.point, { x: 0, y: 0 });
  assert.equal(before.t, 0);

  const degenerate = projectPointToSegment({ x: 1, y: 1 }, a, { ...a });
  assert.deepEqual(degenerate.point, { x: 0, y: 0 });
  assert.equal(degenerate.t, 0);
});

test("distancePointToSegmentScreen measures distance to nearest segment point", () => {
  const a = { x: 0, y: 0 };
  const b = { x: 10, y: 0 };
  assert.equal(distancePointToSegmentScreen({ x: 5, y: 4 }, a, b), 4);
  assert.equal(distancePointToSegmentScreen({ x: -3, y: 4 }, a, b), 5);
  assert.equal(distancePointToSegmentScreen({ x: 3, y: 4 }, a, { ...a }), 5);
});

test("normalizeAngleRadians wraps into (-PI, PI]", () => {
  assert.equal(normalizeAngleRadians(0), 0);
  assert.ok(Math.abs(normalizeAngleRadians(3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(normalizeAngleRadians(-3 * Math.PI) - Math.PI) < 1e-9);
  assert.ok(Math.abs(normalizeAngleRadians(2.5 * Math.PI) - 0.5 * Math.PI) < 1e-9);
});

test("angleCandidateKey is stable regardless of arm order", () => {
  assert.equal(
    angleCandidateKey({ vertexId: 1, aId: 3, bId: 2 }),
    angleCandidateKey({ vertexId: 1, aId: 2, bId: 3 })
  );
  assert.equal(angleCandidateKey({ vertexId: 1, aId: 2, bId: 3 }), "1:2:3");
});

test("calculatePerimeter closes polygon and rejects degenerate input", () => {
  const rect = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  assert.equal(calculatePerimeter(rect), 14);
  assert.equal(calculatePerimeter([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
  assert.equal(calculatePerimeter([{ x: 0, y: 0 }]), 0);
  assert.equal(calculatePerimeter(null), 0);
});

test("calculateInteriorAngles returns angles and handles zero-length vectors", () => {
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  assert.deepEqual(calculateInteriorAngles(square), [90, 90, 90, 90]);
  assert.deepEqual(calculateInteriorAngles([{ x: 0, y: 0 }]), []);
  const dup = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 4, y: 0 }];
  assert.equal(calculateInteriorAngles(dup)[0], null);
});

test("findSelfIntersections detects crossings and ignores adjacent edges", () => {
  const square = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
  const bowTie = [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }, { x: 4, y: 0 }];
  assert.deepEqual(findSelfIntersections(square), []);
  assert.deepEqual(findSelfIntersections(bowTie), [{ segmentA: 0, segmentB: 2 }]);
  assert.deepEqual(findSelfIntersections([{ x: 0, y: 0 }]), []);
});
