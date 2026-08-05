import assert from "node:assert/strict";
import test from "node:test";
import {
  pushSnapshot,
  canUndo,
  canRedo,
  undoIndex,
  redoIndex,
} from "../../history.js";

test("pushSnapshot appends and advances the index", () => {
  const r1 = pushSnapshot([], -1, "a");
  assert.deepEqual(r1, { history: ["a"], historyIndex: 0, changed: true });
  const r2 = pushSnapshot(r1.history, r1.historyIndex, "b");
  assert.deepEqual(r2, { history: ["a", "b"], historyIndex: 1, changed: true });
});

test("pushSnapshot dedupes an identical current snapshot", () => {
  const result = pushSnapshot(["a", "b"], 1, "b");
  assert.equal(result.changed, false);
  assert.deepEqual(result.history, ["a", "b"]);
  assert.equal(result.historyIndex, 1);
});

test("pushSnapshot discards the redo tail before pushing", () => {
  const result = pushSnapshot(["a", "b", "c"], 0, "x");
  assert.deepEqual(result.history, ["a", "x"]);
  assert.equal(result.historyIndex, 1);
});

test("pushSnapshot caps the stack at the limit and drops the oldest", () => {
  const result = pushSnapshot(["a", "b", "c"], 2, "d", 3);
  assert.deepEqual(result.history, ["b", "c", "d"]);
  assert.equal(result.historyIndex, 2);
});

test("canUndo and canRedo reflect the index bounds", () => {
  assert.equal(canUndo(0), false);
  assert.equal(canUndo(1), true);
  assert.equal(canRedo(["a", "b"], 1), false);
  assert.equal(canRedo(["a", "b"], 0), true);
});

test("undoIndex and redoIndex clamp at the ends", () => {
  assert.equal(undoIndex(0), 0);
  assert.equal(undoIndex(2), 1);
  assert.equal(redoIndex(["a", "b"], 1), 1);
  assert.equal(redoIndex(["a", "b"], 0), 1);
});
