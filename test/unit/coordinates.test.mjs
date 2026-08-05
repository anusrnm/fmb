import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeCoordinateLoop,
  parseCoordinatesText,
} from "../../coordinates.js";

test("parseCoordinatesText reads labelled rows", () => {
  const parsed = parseCoordinatesText("A, 0, 0\nB, 5, 0\nC, 4, 3");
  assert.deepEqual(parsed, [
    { label: "A", x: 0, y: 0 },
    { label: "B", x: 5, y: 0 },
    { label: "C", x: 4, y: 3 },
  ]);
});

test("parseCoordinatesText reads two-column and whitespace rows", () => {
  assert.deepEqual(parseCoordinatesText("1, 2"), [{ label: "", x: 1, y: 2 }]);
  assert.deepEqual(parseCoordinatesText("  3   -4 "), [{ label: "", x: 3, y: -4 }]);
  assert.deepEqual(parseCoordinatesText("2.5 6.75"), [{ label: "", x: 2.5, y: 6.75 }]);
});

test("parseCoordinatesText ignores blank lines", () => {
  const parsed = parseCoordinatesText("\n1,2\n\n3,4\n");
  assert.equal(parsed.length, 2);
});

test("parseCoordinatesText throws on unreadable or non-numeric input", () => {
  assert.throws(() => parseCoordinatesText("hello"), /Could not read coordinates/);
  assert.throws(() => parseCoordinatesText("A, x, y"), /Invalid numeric coordinates/);
});

test("normalizeCoordinateLoop drops a duplicated closing vertex", () => {
  const closed = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 0 },
  ];
  assert.deepEqual(normalizeCoordinateLoop(closed), [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
  ]);
});

test("normalizeCoordinateLoop leaves open or short paths untouched", () => {
  const open = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 1, y: 5 },
  ];
  assert.deepEqual(normalizeCoordinateLoop(open), open);

  const short = [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 0 },
  ];
  assert.deepEqual(normalizeCoordinateLoop(short), short);
});
