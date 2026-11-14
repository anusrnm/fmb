// Pure state model: a `createState` factory plus entity operations that take the
// state as an explicit parameter, so they can be unit-tested without a DOM.
// app.js holds a single live state built here and delegates to these functions.

import { clamp, round2, distanceWorld, triangleAreaFromSides, transformPoint } from "./geometry.js";

export function createState() {
  return {
    mode: "select",
    snapToPoints: true,
    snapToGrid: false,
    snapToMidpoints: false,
    snapToIntersections: false,
    snapAngleStep: false,
    snapAngleStepDegrees: 15,
    points: [],
    segments: [],
    polygons: [],
    texts: [],
    angleAnnotations: [],
    constraints: [],
    // { src, x, y, width, height, opacity } with x/y as the world-space top-left corner.
    backgroundImage: null,
    nextId: 1,
    scale: 32,
    panX: 0,
    panY: 0,
    hoverWorld: null,
    hoverScreen: null,
    hoverTarget: null,
    mouseDownScreen: null,
    drag: null,
    boxSelect: null,
    polygonDraft: [],
    polygonDraftCreatedPointIds: new Set(),
    midpointHoverWorld: null,
    construction: null,
    textEdit: null,
    selection: {
      points: new Set(),
      segments: new Set(),
      polygons: new Set(),
      polygonEdges: new Set(),
      texts: new Set(),
    },
    history: [],
    historyIndex: -1,
    display: {
      showPoints: true,
      showLabels: true,
      showSegments: true,
      showSegmentLengths: true,
      showText: true,
      showPolygons: true,
      showAngles: true,
      showMajorGrid: true,
      showMinorGrid: true,
      showGridValues: true,
      showBackgroundImage: true,
    },
    pointIndex: new Map(),
  };
}

export function createId(state) {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

export function getPointById(state, pointId) {
  return state.pointIndex.get(pointId) ?? null;
}

export function getSegmentById(state, segmentId) {
  return state.segments.find((segment) => segment.id === segmentId) || null;
}

export function getPolygonById(state, polygonId) {
  return state.polygons.find((polygon) => polygon.id === polygonId) || null;
}

export function getTextById(state, textId) {
  return state.texts.find((text) => text.id === textId) || null;
}

export function addPoint(state, x, y) {
  const point = {
    id: createId(state),
    x: round2(x),
    y: round2(y),
  };
  state.points.push(point);
  state.pointIndex.set(point.id, point);
  return point;
}

export function addSegment(state, a, b, kind = "segment") {
  if (a === b) {
    return null;
  }

  const exists = state.segments.some((segment) => {
    return (segment.a === a && segment.b === b) || (segment.a === b && segment.b === a);
  });

  if (exists) {
    return null;
  }

  const segment = { id: createId(state), a, b, kind, lineStyle: "solid" };
  state.segments.push(segment);
  return segment;
}

export function addPolygon(state, pointIds) {
  if (!Array.isArray(pointIds) || pointIds.length < 3) {
    return null;
  }

  const polygon = {
    id: createId(state),
    pointIds: [...pointIds],
    labelOffset: { x: 0, y: 0 },
    edgeStyles: {},
  };
  state.polygons.push(polygon);
  return polygon;
}

export function getPolygonNetwork(state, polygonId) {
  const polygon = getPolygonById(state, polygonId);
  if (!polygon || polygon.pointIds.length < 3) {
    throw new Error("The selected polygon no longer exists.");
  }
  const neighbors = new Map();
  const connect = (a, b) => {
    if (!neighbors.has(a)) neighbors.set(a, []);
    if (!neighbors.has(b)) neighbors.set(b, []);
    neighbors.get(a).push(b);
    neighbors.get(b).push(a);
  };
  for (const shape of state.polygons) {
    for (const id of shape.pointIds.slice(1)) {
      connect(shape.pointIds[0], id);
    }
  }
  for (const segment of state.segments) {
    connect(segment.a, segment.b);
  }
  const pointIds = new Set(polygon.pointIds);
  const pending = [...pointIds];
  for (let index = 0; index < pending.length; index += 1) {
    for (const id of neighbors.get(pending[index]) || []) {
      if (!pointIds.has(id)) {
        pointIds.add(id);
        pending.push(id);
      }
    }
  }
  if ([...pointIds].some((id) => !getPointById(state, id))) {
    throw new Error("The connected network contains missing points.");
  }
  return {
    pointIds,
    polygons: state.polygons.filter((shape) => shape.pointIds.some((id) => pointIds.has(id))),
    segments: state.segments.filter((segment) => pointIds.has(segment.a)),
    pivot: getPointById(state, polygon.pointIds[0]),
  };
}

export function transformPolygonNetwork(state, polygonId, operation) {
  const network = getPolygonNetwork(state, polygonId);
  const proposals = [...network.pointIds].map((id) => {
    const point = getPointById(state, id);
    return { point, next: transformPoint(point, network.pivot, operation) };
  });
  const changed = proposals.filter(({ point, next }) => point.x !== next.x || point.y !== next.y);
  if (changed.some(({ point }) => isPointLocked(state, point.id))) {
    throw new Error("Unlock the connected network's points before moving them.");
  }
  const labels = network.polygons.map((polygon) => {
    const offset = polygon.labelOffset || { x: 0, y: 0 };
    const next = operation.type === "move"
      ? { ...offset }
      : transformPoint(offset, { x: 0, y: 0 }, operation);
    return { polygon, offset, next };
  });
  const labelsChanged = labels.some(({ offset, next }) => offset.x !== next.x || offset.y !== next.y);
  if (changed.length === 0 && !labelsChanged) {
    return { changed: false, network };
  }
  for (const { point, next } of proposals) {
    point.x = next.x;
    point.y = next.y;
  }
  for (const { polygon, next } of labels) {
    polygon.labelOffset = next;
  }
  return { changed: true, network };
}

export function pointIsUsedOutsidePolygon(state, pointId, polygonId) {
  return state.segments.some((segment) => segment.a === pointId || segment.b === pointId) ||
    state.angleAnnotations.some((item) => item.vertexId === pointId || item.aId === pointId || item.bId === pointId) ||
    state.polygons.some((polygon) => polygon.id !== polygonId && polygon.pointIds.includes(pointId));
}

export function rotatePolygon(state, polygonId, pivotId, degrees) {
  const polygon = getPolygonById(state, polygonId);
  const pivot = getPointById(state, pivotId);
  if (!polygon || !pivot) {
    throw new Error("Select one polygon and one point as the rotation pivot.");
  }
  const operation = { type: "rotate", degrees };
  const proposals = [...new Set(polygon.pointIds)].map((id) => {
    const point = getPointById(state, id);
    const next = transformPoint(point, pivot, operation);
    return { point, next, changed: point.x !== next.x || point.y !== next.y };
  });
  if (proposals.some(({ point, changed }) => changed && isPointLocked(state, point.id))) {
    throw new Error("Unlock the polygon's points before rotating them.");
  }
  const offset = polygon.labelOffset || { x: 0, y: 0 };
  const nextOffset = transformPoint(offset, { x: 0, y: 0 }, operation);
  if (!proposals.some(({ changed }) => changed) && offset.x === nextOffset.x && offset.y === nextOffset.y) {
    return { changed: false };
  }
  const replacements = new Map();
  for (const { point, next, changed } of proposals) {
    if (!changed) continue;
    const target = pointIsUsedOutsidePolygon(state, point.id, polygon.id)
      ? addPoint(state, next.x, next.y)
      : point;
    target.x = next.x;
    target.y = next.y;
    replacements.set(point.id, target.id);
  }
  polygon.pointIds = polygon.pointIds.map((id) => replacements.get(id) ?? id);
  polygon.labelOffset = nextOffset;
  return { changed: true };
}

export function addText(state, world, content, size = 16) {
  const text = {
    id: createId(state),
    x: round2(world.x),
    y: round2(world.y),
    content: content || "Text",
    size,
  };
  state.texts.push(text);
  return text;
}

export function removePoint(state, pointId) {
  state.pointIndex.delete(pointId);
  state.points = state.points.filter((point) => point.id !== pointId);
  state.segments = state.segments.filter((segment) => segment.a !== pointId && segment.b !== pointId);
  state.polygons = state.polygons
    .map((polygon) => ({ ...polygon, pointIds: polygon.pointIds.filter((id) => id !== pointId) }))
    .filter((polygon) => polygon.pointIds.length >= 3);
  state.constraints = state.constraints.filter((constraint) => constraint.pointId !== pointId);
  state.selection.points.delete(pointId);
}

export function normalizeConstraints(state) {
  const pointIds = new Set(state.points.map((point) => point.id));
  state.constraints = state.constraints.filter((constraint) => {
    if (!constraint || typeof constraint !== "object") {
      return false;
    }
    if (constraint.type === "point-lock") {
      return Number.isInteger(constraint.pointId) && pointIds.has(constraint.pointId);
    }
    return false;
  });

  const seenPointLocks = new Set();
  state.constraints = state.constraints.filter((constraint) => {
    if (constraint.type !== "point-lock") {
      return true;
    }
    if (seenPointLocks.has(constraint.pointId)) {
      return false;
    }
    seenPointLocks.add(constraint.pointId);
    return true;
  });
}

export function isPointLocked(state, pointId) {
  return state.constraints.some((constraint) => {
    return constraint.type === "point-lock" && constraint.pointId === pointId;
  });
}

export function addPointLockConstraint(state, pointId) {
  if (!getPointById(state, pointId)) {
    return null;
  }
  if (isPointLocked(state, pointId)) {
    return null;
  }
  const constraint = {
    id: createId(state),
    type: "point-lock",
    pointId,
  };
  state.constraints.push(constraint);
  return constraint;
}

export function removePointLockConstraint(state, pointId) {
  const before = state.constraints.length;
  state.constraints = state.constraints.filter((constraint) => {
    return !(constraint.type === "point-lock" && constraint.pointId === pointId);
  });
  return state.constraints.length !== before;
}

export function togglePointLockConstraint(state, pointId) {
  if (isPointLocked(state, pointId)) {
    removePointLockConstraint(state, pointId);
    return false;
  }
  return Boolean(addPointLockConstraint(state, pointId));
}

export function isSegmentInsidePolygon(state, aId, bId) {
  for (const polygon of state.polygons) {
    const ids = polygon.pointIds;
    if (!ids.includes(aId) || !ids.includes(bId)) continue;
    const n = ids.length;
    for (let i = 0; i < n; i += 1) {
      const next = (i + 1) % n;
      if ((ids[i] === aId && ids[next] === bId) || (ids[i] === bId && ids[next] === aId)) {
        return false; // it's a polygon edge, not a diagonal
      }
    }
    return true;
  }
  return false;
}

export function normalizeGeometry(state) {
  const pointIds = new Set(state.points.map((point) => point.id));

  state.segments = state.segments.filter((segment) => {
    return pointIds.has(segment.a) && pointIds.has(segment.b) && segment.a !== segment.b;
  });

  state.polygons = state.polygons
    .map((polygon) => {
      const filteredPointIds = polygon.pointIds.filter((pointId) => pointIds.has(pointId));
      // Edge indices are meaningless once vertices drop out, so reset styling with them.
      const edgeStyles = filteredPointIds.length === polygon.pointIds.length ? polygon.edgeStyles || {} : {};
      return { ...polygon, pointIds: filteredPointIds, edgeStyles };
    })
    .filter((polygon) => polygon.pointIds.length >= 3);

  state.angleAnnotations = state.angleAnnotations.filter((item) => {
    return pointIds.has(item.vertexId) && pointIds.has(item.aId) && pointIds.has(item.bId);
  });

  state.selection.points = new Set([...state.selection.points].filter((id) => pointIds.has(id)));
  const segmentIds = new Set(state.segments.map((segment) => segment.id));
  const polygonIds = new Set(state.polygons.map((polygon) => polygon.id));
  const textIds = new Set(state.texts.map((text) => text.id));
  state.selection.segments = new Set([...state.selection.segments].filter((id) => segmentIds.has(id)));
  state.selection.polygons = new Set([...state.selection.polygons].filter((id) => polygonIds.has(id)));
  state.selection.texts = new Set([...state.selection.texts].filter((id) => textIds.has(id)));
  const validPolygonEdgeKeys = new Set();
  for (const polygon of state.polygons) {
    for (let index = 0; index < polygon.pointIds.length; index += 1) {
      validPolygonEdgeKeys.add(`${polygon.id}:${index}`);
    }
  }
  state.selection.polygonEdges = new Set(
    [...state.selection.polygonEdges].filter((key) => validPolygonEdgeKeys.has(key))
  );
  normalizeConstraints(state);
  rebuildPointIndex(state);
}

export function rebuildPointIndex(state) {
  state.pointIndex = new Map(state.points.map((p) => [p.id, p]));
}

export function getAllEdges(state) {
  const edges = [];

  for (const segment of state.segments) {
    edges.push({
      edgeType: "segment",
      id: segment.id,
      aId: segment.a,
      bId: segment.b,
    });
  }

  for (const polygon of state.polygons) {
    for (let index = 0; index < polygon.pointIds.length; index += 1) {
      const nextIndex = (index + 1) % polygon.pointIds.length;
      edges.push({
        edgeType: "polygon-edge",
        polygonId: polygon.id,
        edgeIndex: index,
        aId: polygon.pointIds[index],
        bId: polygon.pointIds[nextIndex],
      });
    }
  }

  return edges;
}

export function polygonArea(state, pointIds) {
  if (pointIds.length < 3) {
    return 0;
  }

  if (pointIds.length === 3) {
    const points = pointIds.map((pointId) => getPointById(state, pointId)).filter(Boolean);
    if (points.length === 3) {
      const sideA = distanceWorld(points[0], points[1]);
      const sideB = distanceWorld(points[1], points[2]);
      const sideC = distanceWorld(points[2], points[0]);
      return triangleAreaFromSides(sideA, sideB, sideC);
    }
  }

  let sum = 0;
  for (let index = 0; index < pointIds.length; index += 1) {
    const next = (index + 1) % pointIds.length;
    const currentPoint = getPointById(state, pointIds[index]);
    const nextPoint = getPointById(state, pointIds[next]);
    if (!currentPoint || !nextPoint) {
      continue;
    }
    sum += currentPoint.x * nextPoint.y - nextPoint.x * currentPoint.y;
  }

  return Math.abs(sum) * 0.5;
}

export function polygonPerimeter(state, pointIds) {
  if (pointIds.length < 2) {
    return 0;
  }
  let perimeter = 0;
  for (let index = 0; index < pointIds.length; index += 1) {
    const next = (index + 1) % pointIds.length;
    const a = getPointById(state, pointIds[index]);
    const b = getPointById(state, pointIds[next]);
    if (!a || !b) {
      continue;
    }
    perimeter += distanceWorld(a, b);
  }
  return perimeter;
}

export function pointConnections(state) {
  const map = new Map();

  function addNeighbor(aId, bId) {
    if (!map.has(aId)) {
      map.set(aId, new Set());
    }
    map.get(aId).add(bId);
  }

  for (const segment of state.segments) {
    addNeighbor(segment.a, segment.b);
    addNeighbor(segment.b, segment.a);
  }

  for (const polygon of state.polygons) {
    for (let index = 0; index < polygon.pointIds.length; index += 1) {
      const currentId = polygon.pointIds[index];
      const nextId = polygon.pointIds[(index + 1) % polygon.pointIds.length];
      addNeighbor(currentId, nextId);
      addNeighbor(nextId, currentId);
    }
  }

  return map;
}

export function getAngleCandidates(state) {
  const candidates = [];
  const edges = pointConnections(state);

  for (const [vertexId, neighbors] of edges.entries()) {
    const neighborIds = [...neighbors];
    if (neighborIds.length < 2) {
      continue;
    }

    for (let i = 0; i < neighborIds.length - 1; i += 1) {
      for (let j = i + 1; j < neighborIds.length; j += 1) {
        const aId = neighborIds[i];
        const bId = neighborIds[j];
        const vertex = getPointById(state, vertexId);
        const a = getPointById(state, aId);
        const b = getPointById(state, bId);
        if (!vertex || !a || !b) {
          continue;
        }

        const v1x = a.x - vertex.x;
        const v1y = a.y - vertex.y;
        const v2x = b.x - vertex.x;
        const v2y = b.y - vertex.y;
        const m1 = Math.hypot(v1x, v1y);
        const m2 = Math.hypot(v2x, v2y);
        if (m1 === 0 || m2 === 0) {
          continue;
        }

        const dot = (v1x * v2x + v1y * v2y) / (m1 * m2);
        const angleDeg = Math.acos(clamp(dot, -1, 1)) * (180 / Math.PI);
        if (!Number.isFinite(angleDeg)) {
          continue;
        }

        candidates.push({ vertexId, aId, bId, angleDeg });
      }
    }
  }

  return candidates;
}

export function serializeCoreState(state, version) {
  return {
    version,
    nextId: state.nextId,
    scale: state.scale,
    panX: state.panX,
    panY: state.panY,
    points: state.points,
    segments: state.segments,
    polygons: state.polygons,
    texts: state.texts,
    angleAnnotations: state.angleAnnotations,
    constraints: state.constraints,
    backgroundImage: state.backgroundImage,
  };
}
