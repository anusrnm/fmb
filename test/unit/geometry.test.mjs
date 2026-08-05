import assert from "node:assert/strict";
import test from "node:test";
import {
  angleCandidateKey,
  areaConversions,
  clamp,
  distancePointToSegmentScreen,
  distanceScreen,
  distanceWorld,
  normalizeAngleRadians,
  projectPointToSegment,
  round2,
  round3,
} from "../../geometry.js";

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
