import assert from "node:assert/strict";
import test from "node:test";
import {
  addPointLockConstraint,
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
  isPointLocked,
  polygonArea,
  polygonPerimeter,
  rebuildPointIndex,
  removePointLockConstraint,
  removePoint,
  serializeCoreState,
  togglePointLockConstraint,
} from "../../core.js";

function squareState() {
  const state = createState();
  const a = addPoint(state, 0, 0);
  const b = addPoint(state, 4, 0);
  const c = addPoint(state, 4, 4);
  const d = addPoint(state, 0, 4);
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

test("addPoint rounds coordinates and assigns an integer id", () => {
  const state = createState();
  const point = addPoint(state, 1.239, -2.005);
  assert.deepEqual({ x: point.x, y: point.y }, { x: 1.24, y: -2 });
  assert.equal(point.id, 1);
  assert.equal("label" in point, false, "points must not carry a label property");
  const second = addPoint(state, 0, 0);
  assert.equal(second.id, 2);
});

test("pointIndex is populated by addPoint and cleared by removePoint", () => {
  const state = createState();
  const p = addPoint(state, 1, 2);
  assert.equal(state.pointIndex.get(p.id), p, "addPoint must insert into pointIndex");
  assert.equal(getPointById(state, p.id), p, "getPointById must use the index");
  removePoint(state, p.id);
  assert.equal(state.pointIndex.has(p.id), false, "removePoint must delete from pointIndex");
  assert.equal(getPointById(state, p.id), null);
});

test("rebuildPointIndex restores lookup after direct state mutation", () => {
  const state = createState();
  const p = addPoint(state, 0, 0);
  state.points = []; // bypass addPoint/removePoint
  state.pointIndex.clear = state.pointIndex.clear.bind(state.pointIndex);
  rebuildPointIndex(state);
  assert.equal(state.pointIndex.has(p.id), false, "index reflects mutated state.points");
});

test("normalizeGeometry keeps pointIndex consistent after pruning", () => {
  const { state, a, b, c, d } = squareState();
  // Force-remove a point from the array without going through removePoint.
  state.points = state.points.filter((pt) => pt.id !== a.id);
  normalizeGeometry(state);
  assert.equal(state.pointIndex.has(a.id), false);
  assert.ok(state.pointIndex.has(b.id));
  assert.ok(state.pointIndex.has(c.id));
  assert.ok(state.pointIndex.has(d.id));
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

test("addText applies defaults, rounds coordinates, and returns the entity", () => {
  const state = createState();
  const text = addText(state, { x: 1.111, y: 2.222 });
  assert.ok(text, "addText must return the created entity");
  assert.equal(text.id, 1);
  assert.deepEqual({ x: text.x, y: text.y, content: text.content, size: text.size }, {
    x: 1.11,
    y: 2.22,
    content: "Text",
    size: 16,
  });
  const second = addText(state, { x: 0, y: 0 }, "Label", 24);
  assert.equal(getTextById(state, second.id).size, 24);
});

test("removePoint cascades to segments, polygons, and selection", () => {
  const { state, a, b, c, d, polygon } = squareState();
  addSegment(state, a.id, c.id, "segment");
  addPointLockConstraint(state, a.id);
  state.selection.points.add(a.id);
  removePoint(state, a.id);
  assert.equal(getPointById(state, a.id), null);
  assert.equal(state.segments.length, 0);
  // Square drops to three vertices (B, C, D) and survives.
  assert.deepEqual(getPolygonById(state, polygon.id).pointIds, [b.id, c.id, d.id]);
  assert.ok(!state.selection.points.has(a.id));
  assert.equal(state.constraints.length, 0);
});

test("point-lock constraints can be added, removed, and toggled", () => {
  const state = createState();
  const point = addPoint(state, 1, 2);

  assert.equal(isPointLocked(state, point.id), false);
  assert.ok(addPointLockConstraint(state, point.id));
  assert.equal(isPointLocked(state, point.id), true);
  assert.equal(addPointLockConstraint(state, point.id), null);

  assert.equal(removePointLockConstraint(state, point.id), true);
  assert.equal(removePointLockConstraint(state, point.id), false);
  assert.equal(isPointLocked(state, point.id), false);

  assert.equal(togglePointLockConstraint(state, point.id), true);
  assert.equal(isPointLocked(state, point.id), true);
  assert.equal(togglePointLockConstraint(state, point.id), false);
  assert.equal(isPointLocked(state, point.id), false);
});

test("normalizeGeometry drops stale and duplicate point-lock constraints", () => {
  const state = createState();
  const a = addPoint(state, 0, 0);
  const b = addPoint(state, 1, 0);
  state.constraints = [
    { id: 90, type: "point-lock", pointId: a.id },
    { id: 91, type: "point-lock", pointId: a.id },
    { id: 92, type: "point-lock", pointId: 9999 },
    { id: 93, type: "unsupported", pointId: b.id },
  ];

  normalizeGeometry(state);
  assert.equal(state.constraints.length, 1);
  assert.deepEqual(state.constraints[0], { id: 90, type: "point-lock", pointId: a.id });
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
  addPointLockConstraint(state, state.points[0].id);
  const snapshot = serializeCoreState(state, "9.9.9");
  assert.equal(snapshot.version, "9.9.9");
  assert.equal(snapshot.points.length, 4);
  assert.equal(snapshot.polygons.length, 1);
  assert.equal(snapshot.constraints.length, 1);
});

test("serializeCoreState preserves nextId so gaps after deletion are maintained", () => {
  const state = createState();
  const p = addPoint(state, 0, 0);
  addPoint(state, 1, 0);
  // Remove second point; nextId stays at 3 — not 2.
  state.points = state.points.filter((pt) => pt.id !== p.id);
  state.nextId = 3;
  const snapshot = serializeCoreState(state, "1.0.0");
  assert.equal(snapshot.nextId, 3);
  // A fresh state restored from snapshot should start IDs at 3, not 2.
  const restored = createState();
  restored.points = snapshot.points.map((pt) => ({ ...pt }));
  const maxId = restored.points.reduce((m, pt) => Math.max(m, pt.id), 0);
  const savedNextId =
    Number.isInteger(Number(snapshot.nextId)) && Number(snapshot.nextId) > 0
      ? Number(snapshot.nextId)
      : 1;
  restored.nextId = Math.max(maxId + 1, savedNextId);
  assert.equal(restored.nextId, 3);
});
