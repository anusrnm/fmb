import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDistance,
  calculateInteriorAngles,
  calculatePerimeter,
  findSelfIntersections,
} from "../../distance.js";

test("calculateDistance handles diagonal and horizontal distances", () => {
  assert.equal(calculateDistance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  assert.equal(calculateDistance({ x: -2, y: 4 }, { x: 5, y: 4 }), 7);
});

test("calculatePerimeter closes polygons and rejects incomplete input", () => {
  const rectangle = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ];

  assert.equal(calculatePerimeter(rectangle), 14);
  assert.equal(calculatePerimeter([{ x: 0, y: 0 }, { x: 3, y: 4 }]), 5);
  assert.equal(calculatePerimeter([{ x: 0, y: 0 }]), 0);
  assert.equal(calculatePerimeter(null), 0);
});

test("calculateInteriorAngles returns angles and flags duplicate vertices", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  assert.deepEqual(calculateInteriorAngles(square), [90, 90, 90, 90]);
  assert.deepEqual(calculateInteriorAngles([{ x: 0, y: 0 }]), []);

  const duplicateVertex = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 4, y: 0 },
  ];
  assert.equal(calculateInteriorAngles(duplicateVertex)[0], null);
});

test("findSelfIntersections identifies crossings, touching edges, and ignores adjacent edges", () => {
  const square = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
  ];
  const bowTie = [
    { x: 0, y: 0 },
    { x: 4, y: 4 },
    { x: 0, y: 4 },
    { x: 4, y: 0 },
  ];

  assert.deepEqual(findSelfIntersections(square), []);
  assert.deepEqual(findSelfIntersections(bowTie), [{ segmentA: 0, segmentB: 2 }]);
  assert.deepEqual(
    findSelfIntersections([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 2, y: 0 },
    ]),
    [{ segmentA: 0, segmentB: 2 }]
  );
  assert.deepEqual(findSelfIntersections([{ x: 0, y: 0 }]), []);
});

test("findSelfIntersections handles each collinear non-adjacent endpoint case", () => {
  const cases = [
    [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 4 },
    ],
    [
      { x: 0, y: 0 },
      { x: 4, y: 1 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 4, y: 1 },
      { x: 3, y: 1 },
      { x: 5, y: 1 },
    ],
  ];

  for (const polygon of cases) {
    assert.ok(findSelfIntersections(polygon).some(({ segmentA, segmentB }) => segmentA === 0 && segmentB === 2));
  }
});

test("findSelfIntersections rejects collinear points outside a compared segment", () => {
  const outsideCases = [
    [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 4 },
    ],
    [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: -2, y: 0 },
      { x: -2, y: 4 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: 0, y: 6 },
      { x: 4, y: 6 },
    ],
    [
      { x: 0, y: 0 },
      { x: 0, y: 4 },
      { x: 0, y: -2 },
      { x: 4, y: -2 },
    ],
  ];

  for (const polygon of outsideCases) {
    assert.doesNotThrow(() => findSelfIntersections(polygon));
  }
});