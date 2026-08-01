import { calculateDistance } from './distance.js';

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

console.log('Distance tests passed');
