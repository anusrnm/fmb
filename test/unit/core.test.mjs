import assert from "node:assert/strict";
import test from "node:test";
import {
  addPoint,
  addPolygon,
  addSegment,
  addText,
  createId,
  createState,
  getAllEdges,
  getAngleCandidates,
  getPointById,
  getPolygonById,
  getSegmentById,
  getTextById,
  isSegmentInsidePolygon,
  normalizeGeometry,
  polygonArea,
  polygonPerimeter,
  removePoint,
  serializeCoreState,
} from "../../core.js";

function squareState() {
  const state = createState();
  const a = addPoint(state, 0, 0, { label: "A" });
  const b = addPoint(state, 4, 0, { label: "B" });
  const c = addPoint(state, 4, 4, { label: "C" });
  const d = addPoint(state, 0, 4, { label: "D" });
  const polygon = addPolygon(state, [a.id, b.id, c.id, d.id]);
  return { state, a, b, c, d, polygon };
}

test("createState returns a fresh, independent state each call", () => {
  const first = createState();
  const second = createState();
  first.points.push({ id: 1 });
  assert.equal(second.points.length, 0);
  assert.equal(first.nextId, 1);
  assert.notEqual(first.selection.points, second.selection.points);
});

test("createId increments the sequence", () => {
  const state = createState();
  assert.equal(createId(state), 1);
  assert.equal(createId(state), 2);
  assert.equal(state.nextId, 3);
});

test("addPoint rounds coordinates and auto-labels", () => {
  const state = createState();
  const point = addPoint(state, 1.239, -2.005);
  assert.deepEqual({ x: point.x, y: point.y }, { x: 1.24, y: -2 });
  assert.equal(point.label, "P1");
  assert.equal(addPoint(state, 0, 0, { label: "Origin" }).label, "Origin");
});

test("addSegment rejects self-loops and duplicates regardless of order", () => {
  const state = createState();
  const p1 = addPoint(state, 0, 0);
  const p2 = addPoint(state, 1, 0);
  assert.ok(addSegment(state, p1.id, p2.id));
  assert.equal(addSegment(state, p1.id, p1.id), null);
  assert.equal(addSegment(state, p2.id, p1.id), null);
  assert.equal(state.segments.length, 1);
  assert.equal(addSegment(state, p1.id, p2.id, "parallel"), null);
});

test("addPolygon requires at least three point ids", () => {
  const state = createState();
  assert.equal(addPolygon(state, [1, 2]), null);
  assert.equal(addPolygon(state, "nope"), null);
  const polygon = addPolygon(state, [1, 2, 3]);
  assert.deepEqual(polygon.labelOffset, { x: 0, y: 0 });
});

test("addText applies defaults and rounding", () => {
  const state = createState();
  addText(state, { x: 1.111, y: 2.222 });
  const [text] = state.texts;
  assert.deepEqual({ x: text.x, y: text.y, content: text.content, size: text.size }, {
    x: 1.11,
    y: 2.22,
    content: "Text",
    size: 16,
  });
  addText(state, { x: 0, y: 0 }, "Label", 24);
  assert.equal(getTextById(state, state.texts[1].id).size, 24);
});

test("removePoint cascades to segments, polygons, and selection", () => {
  const { state, a, b, c, d, polygon } = squareState();
  addSegment(state, a.id, c.id, "segment");
  state.selection.points.add(a.id);
  removePoint(state, a.id);
  assert.equal(getPointById(state, a.id), null);
  assert.equal(state.segments.length, 0);
  // Square drops to three vertices (B, C, D) and survives.
  assert.deepEqual(getPolygonById(state, polygon.id).pointIds, [b.id, c.id, d.id]);
  assert.ok(!state.selection.points.has(a.id));
});

test("normalizeGeometry drops references to missing points and stale selections", () => {
  const { state, a, b, polygon } = squareState();
  const segment = addSegment(state, a.id, b.id, "segment");
  state.selection.segments.add(segment.id);
  state.selection.segments.add(999);
  state.selection.polygons.add(polygon.id);
  // Remove two vertices so the polygon falls below the 3-vertex minimum.
  state.points = state.points.filter((point) => point.id !== a.id && point.id !== b.id);
  normalizeGeometry(state);
  assert.equal(getSegmentById(state, segment.id), null);
  assert.ok(!state.selection.segments.has(999));
  assert.ok(!state.selection.segments.has(segment.id));
  assert.equal(state.polygons.length, 0);
  assert.ok(!state.selection.polygons.has(polygon.id));
});

test("polygonArea and polygonPerimeter measure the square", () => {
  const { state, polygon } = squareState();
  assert.equal(polygonArea(state, polygon.pointIds), 16);
  assert.equal(polygonPerimeter(state, polygon.pointIds), 16);
  assert.equal(polygonArea(state, [polygon.pointIds[0]]), 0);
  assert.equal(polygonPerimeter(state, [polygon.pointIds[0]]), 0);
});

test("getAllEdges lists segments and polygon edges", () => {
  const { state, a, b, polygon } = squareState();
  addSegment(state, a.id, b.id, "segment");
  const edges = getAllEdges(state);
  assert.equal(edges.filter((e) => e.edgeType === "segment").length, 1);
  assert.equal(edges.filter((e) => e.edgeType === "polygon-edge").length, polygon.pointIds.length);
});

test("isSegmentInsidePolygon distinguishes diagonals from edges", () => {
  const { state, a, b, c } = squareState();
  assert.equal(isSegmentInsidePolygon(state, a.id, c.id), true); // diagonal
  assert.equal(isSegmentInsidePolygon(state, a.id, b.id), false); // polygon edge
  assert.equal(isSegmentInsidePolygon(state, 111, 222), false); // unrelated
  assert.equal(isSegmentInsidePolygon(state, a.id, 9999), false); // one endpoint missing
});

test("polygon metrics skip pairs with a missing point", () => {
  const state = createState();
  const p1 = addPoint(state, 0, 0);
  const p2 = addPoint(state, 4, 0);
  const p3 = addPoint(state, 4, 4);
  const ids = [p1.id, p2.id, p3.id, 9999];
  assert.ok(Number.isFinite(polygonArea(state, ids)));
  assert.ok(Number.isFinite(polygonPerimeter(state, ids)));
});

test("getAngleCandidates finds the square's right angles", () => {
  const { state } = squareState();
  const candidates = getAngleCandidates(state);
  assert.ok(candidates.length >= 4);
  for (const candidate of candidates) {
    assert.ok(Math.abs(candidate.angleDeg - 90) < 1e-6);
  }
});

test("getAngleCandidates skips zero-length arms from coincident points", () => {
  const state = createState();
  const vertex = addPoint(state, 0, 0);
  const coincident = addPoint(state, 0, 0); // same position, zero-length arm
  const other = addPoint(state, 1, 0);
  addSegment(state, vertex.id, coincident.id);
  addSegment(state, vertex.id, other.id);
  const candidates = getAngleCandidates(state);
  assert.ok(candidates.every((candidate) => candidate.vertexId !== vertex.id));
});

test("serializeCoreState captures the version and core arrays", () => {
  const { state } = squareState();
  const snapshot = serializeCoreState(state, "9.9.9");
  assert.equal(snapshot.version, "9.9.9");
  assert.equal(snapshot.points.length, 4);
  assert.equal(snapshot.polygons.length, 1);
});
