import {
  calculateDistance,
  calculateInteriorAngles,
  calculatePerimeter,
  findSelfIntersections,
} from './distance.js';

const cases = [
  { a: { x: 0, y: 0 }, b: { x: 3, y: 4 }, expected: 5 },
  { a: { x: 10, y: 5 }, b: { x: 10, y: 15 }, expected: 10 },
];

for (const { a, b, expected } of cases) {
  const actual = calculateDistance(a, b);
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`Expected ${expected}, got ${actual}`);
  }
}

const perimeterPoints = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 3 },
  { x: 0, y: 3 },
];
const perimeter = calculatePerimeter(perimeterPoints);
if (Math.abs(perimeter - 14) > 1e-9) {
  throw new Error(`Expected perimeter 14, got ${perimeter}`);
}

const squareAngles = calculateInteriorAngles(perimeterPoints);
if (squareAngles.length !== 4) {
  throw new Error(`Expected 4 interior angles, got ${squareAngles.length}`);
}

for (const angle of squareAngles) {
  if (angle === null || Math.abs(angle - 90) > 1e-6) {
    throw new Error(`Expected interior angle near 90, got ${angle}`);
  }
}

const simplePolygon = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];
if (findSelfIntersections(simplePolygon).length !== 0) {
  throw new Error("Expected no self-intersections for simple polygon");
}

const bowTiePolygon = [
  { x: 0, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
  { x: 4, y: 0 },
];
if (findSelfIntersections(bowTiePolygon).length === 0) {
  throw new Error("Expected self-intersection for bow-tie polygon");
}

console.log('Distance and geometry tests passed');
