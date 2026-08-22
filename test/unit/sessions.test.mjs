import test from "node:test";
import assert from "node:assert/strict";

import {
  addSession,
  createSessionId,
  findSession,
  makeUniqueName,
  normalizeIndex,
  removeSession,
  renameSession,
  sanitizeSessionName,
  sessionStorageKey,
  setActiveSession,
  slugifySessionName,
  touchSession,
} from "../../sessions.js";

function indexOf(...names) {
  let index = { activeId: "", sessions: [] };
  for (const name of names) {
    index = addSession(index, name).index;
  }
  return index;
}

test("sessionStorageKey namespaces the id", () => {
  assert.equal(sessionStorageKey("abc"), "fmb-session-abc");
});

test("createSessionId avoids collisions with existing ids", () => {
  const first = createSessionId([]);
  const second = createSessionId([first]);
  assert.notEqual(first, second);
  assert.match(first, /^s[a-z0-9]+$/);
});

test("sanitizeSessionName trims, collapses whitespace and falls back", () => {
  assert.equal(sanitizeSessionName("  Plot   A  "), "Plot A");
  assert.equal(sanitizeSessionName("   "), "Untitled diagram");
  assert.equal(sanitizeSessionName(42), "Untitled diagram");
  assert.equal(sanitizeSessionName("", "Fallback"), "Fallback");
  assert.equal(sanitizeSessionName("x".repeat(120)).length, 60);
});

test("makeUniqueName suffixes duplicates case-insensitively", () => {
  assert.equal(makeUniqueName("Plot", []), "Plot");
  assert.equal(makeUniqueName("Plot", ["plot"]), "Plot (2)");
  assert.equal(makeUniqueName("Plot", ["Plot", "Plot (2)"]), "Plot (3)");
});

test("normalizeIndex creates a default session from garbage input", () => {
  const index = normalizeIndex(null);
  assert.equal(index.sessions.length, 1);
  assert.equal(index.sessions[0].name, "Untitled diagram");
  assert.equal(index.activeId, index.sessions[0].id);
});

test("normalizeIndex drops malformed entries and duplicate ids", () => {
  const index = normalizeIndex({
    activeId: "b",
    sessions: [
      null,
      "nope",
      { id: "", name: "empty id" },
      { id: "a", name: "Alpha", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "a", name: "Duplicate" },
      { id: "b", name: 7 },
    ],
  });

  assert.deepEqual(
    index.sessions.map((entry) => entry.id),
    ["a", "b"]
  );
  assert.equal(index.sessions[0].updatedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(index.sessions[1].name, "Untitled diagram");
  assert.equal(index.sessions[1].updatedAt, "");
  assert.equal(index.activeId, "b");
});

test("normalizeIndex de-duplicates names and repairs a dangling activeId", () => {
  const index = normalizeIndex({
    activeId: "missing",
    sessions: [
      { id: "a", name: "Plot" },
      { id: "b", name: "Plot" },
    ],
  });

  assert.deepEqual(
    index.sessions.map((entry) => entry.name),
    ["Plot", "Plot (2)"]
  );
  assert.equal(index.activeId, "a");
});

test("addSession appends and activates the new session", () => {
  const base = normalizeIndex({ sessions: [{ id: "a", name: "Alpha" }] });
  const { index, session } = addSession(base, "Beta", "b");

  assert.equal(session.id, "b");
  assert.equal(session.name, "Beta");
  assert.equal(index.activeId, "b");
  assert.equal(index.sessions.length, 2);
  assert.equal(base.sessions.length, 1, "input index is not mutated");
});

test("addSession generates an id when none is supplied", () => {
  const { session } = addSession({ activeId: "", sessions: [] }, "Solo");
  assert.ok(session.id);
});

test("renameSession keeps names unique against the other sessions", () => {
  const base = indexOf("Alpha", "Beta");
  const target = base.sessions[1].id;

  const same = renameSession(base, target, "Beta");
  assert.equal(same.name, "Beta", "renaming to its own name does not add a suffix");

  const clash = renameSession(base, target, "Alpha");
  assert.equal(clash.name, "Alpha (2)");
  assert.equal(findSession(clash.index, target).name, "Alpha (2)");
});

test("touchSession updates only the matching entry", () => {
  const base = indexOf("Alpha", "Beta");
  const id = base.sessions[0].id;
  const next = touchSession(base, id, "2026-08-22T00:00:00.000Z");

  assert.equal(findSession(next, id).updatedAt, "2026-08-22T00:00:00.000Z");
  assert.equal(next.sessions[1].updatedAt, "");
});

test("setActiveSession ignores unknown ids", () => {
  const base = indexOf("Alpha", "Beta");
  assert.equal(setActiveSession(base, base.sessions[0].id).activeId, base.sessions[0].id);
  assert.equal(setActiveSession(base, "nope"), base);
});

test("removeSession picks a neighbouring session as active", () => {
  const base = indexOf("Alpha", "Beta", "Gamma");
  const removedId = base.sessions[2].id;
  const result = removeSession({ ...base, activeId: removedId }, removedId);

  assert.equal(result.removed, true);
  assert.equal(result.index.sessions.length, 2);
  assert.equal(result.activeId, base.sessions[1].id);
});

test("removeSession keeps the active session when a different one is removed", () => {
  const base = indexOf("Alpha", "Beta");
  const result = removeSession({ ...base, activeId: base.sessions[1].id }, base.sessions[0].id);
  assert.equal(result.activeId, base.sessions[1].id);
});

test("removeSession refuses unknown ids and the last remaining session", () => {
  const base = indexOf("Alpha", "Beta");
  assert.equal(removeSession(base, "nope").removed, false);

  const single = indexOf("Only");
  assert.equal(removeSession(single, single.sessions[0].id).removed, false);
  assert.equal(removeSession(single, single.sessions[0].id).index, single);
});

test("slugifySessionName produces filename-safe slugs", () => {
  assert.equal(slugifySessionName("Plot A / rev 2"), "plot-a-rev-2");
  assert.equal(slugifySessionName("  ***  "), "fmb-studio-diagram");
  assert.equal(slugifySessionName("Grundstück"), "grundst-ck");
  assert.equal(slugifySessionName(null, "fallback"), "fallback");
  assert.ok(slugifySessionName("a".repeat(200)).length <= 64);
  assert.equal(slugifySessionName(`${"a".repeat(63)} b`), "a".repeat(63));
});
