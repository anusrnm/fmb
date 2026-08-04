const VERSION = "2.3.1";
const SVG_NS = "http://www.w3.org/2000/svg";
const THEME_STORAGE_KEY = "fmb-theme";
const DISPLAY_SETTINGS_STORAGE_KEY = "fmb-display-settings";

const MODES = [
  "select",
  "box-select",
  "point",
  "midpoint",
  "segment",
  "parallel",
  "perpendicular",
  "polygon",
  "angle",
  "text",
];

const state = {
  mode: "select",
  snapToPoints: true,
  points: [],
  segments: [],
  polygons: [],
  texts: [],
  angleAnnotations: [],
  nextId: 1,
  scale: 32,
  panX: 0,
  panY: 0,
  hoverWorld: null,
  hoverScreen: null,
  mouseDownScreen: null,
  drag: null,
  boxSelect: null,
  polygonDraft: [],
  midpointHoverWorld: null,
  construction: null,
  textEdit: null,
  selection: {
    points: new Set(),
    segments: new Set(),
    polygons: new Set(),
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
  },
};

const ui = {
  graph: document.getElementById("graph"),
  status: document.getElementById("status"),
  versionBadge: document.getElementById("version-badge"),
  modeButtons: Array.from(document.querySelectorAll(".tool-btn[data-mode]")),
  modeSelects: Array.from(document.querySelectorAll(".tool-select")),
  modeSelectGroups: Array.from(document.querySelectorAll(".tool-select-wrap")),
  toolMenu: document.getElementById("tool-menu"),
  mobileMenuToggle: document.getElementById("mobile-menu-toggle"),
  undoBtn: document.getElementById("undo-btn"),
  redoBtn: document.getElementById("redo-btn"),
  zoomInBtn: document.getElementById("zoom-in-btn"),
  zoomOutBtn: document.getElementById("zoom-out-btn"),
  zoomResetBtn: document.getElementById("zoom-reset-btn"),
  exportJsonBtn: document.getElementById("export-json-btn"),
  exportSvgBtn: document.getElementById("export-svg-btn"),
  importBtn: document.getElementById("import-btn"),
  themeToggleBtn: document.getElementById("theme-toggle-btn"),
  importFile: document.getElementById("import-file"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsPanel: document.getElementById("settings-panel"),
  closeSettingsBtn: document.getElementById("close-settings-btn"),
  snapToggle: document.getElementById("snap-toggle"),
  showPointsToggle: document.getElementById("show-points-toggle"),
  showLabelsToggle: document.getElementById("show-labels-toggle"),
  showSegmentsToggle: document.getElementById("show-segments-toggle"),
  showSegmentLengthsToggle: document.getElementById("show-segment-lengths-toggle"),
  showTextToggle: document.getElementById("show-text-toggle"),
  showPolygonsToggle: document.getElementById("show-polygons-toggle"),
  showAnglesToggle: document.getElementById("show-angles-toggle"),
  showMajorGridToggle: document.getElementById("show-major-grid-toggle"),
  showMinorGridToggle: document.getElementById("show-minor-grid-toggle"),
  showGridValuesToggle: document.getElementById("show-grid-values-toggle"),
  contextMenu: document.getElementById("context-menu"),
  viewPointsBtn: document.getElementById("view-points-btn"),
  joinPointsBtn: document.getElementById("join-points-btn"),
  pointsDialog: document.getElementById("points-dialog"),
  pointsOutput: document.getElementById("points-output"),
  copyPointsBtn: document.getElementById("copy-points-btn"),
  inlineTextEditor: document.getElementById("inline-text-editor"),
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function getCssVar(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

function distanceWorld(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function areaConversions(areaSqm) {
  const acres = areaSqm / 4046.8564224;
  return {
    hectares: areaSqm / 10000,
    ares: areaSqm / 100,
    sqm: areaSqm,
    acres,
    cents: acres * 100,
    sqft: areaSqm * 10.76391041671,
  };
}

function polygonPerimeter(pointIds) {
  if (pointIds.length < 2) {
    return 0;
  }
  let perimeter = 0;
  for (let index = 0; index < pointIds.length; index += 1) {
    const next = (index + 1) % pointIds.length;
    const a = getPointById(pointIds[index]);
    const b = getPointById(pointIds[next]);
    if (!a || !b) {
      continue;
    }
    perimeter += distanceWorld(a, b);
  }
  return perimeter;
}

function saveDisplaySettings() {
  localStorage.setItem(
    DISPLAY_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...state.display,
      snapToPoints: state.snapToPoints,
    })
  );
}

function loadDisplaySettings() {
  try {
    const raw = localStorage.getItem(DISPLAY_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    for (const key of Object.keys(state.display)) {
      if (typeof parsed[key] === "boolean") {
        state.display[key] = parsed[key];
      }
    }
    if (typeof parsed.snapToPoints === "boolean") {
      state.snapToPoints = parsed.snapToPoints;
    }
  } catch {
    // Ignore corrupt local values and keep defaults.
  }
}

function syncDisplayControlsToState() {
  ui.snapToggle.checked = state.snapToPoints;
  ui.showPointsToggle.checked = state.display.showPoints;
  ui.showLabelsToggle.checked = state.display.showLabels;
  ui.showSegmentsToggle.checked = state.display.showSegments;
  ui.showSegmentLengthsToggle.checked = state.display.showSegmentLengths;
  ui.showTextToggle.checked = state.display.showText;
  ui.showPolygonsToggle.checked = state.display.showPolygons;
  ui.showAnglesToggle.checked = state.display.showAngles;
  ui.showMajorGridToggle.checked = state.display.showMajorGrid;
  ui.showMinorGridToggle.checked = state.display.showMinorGrid;
  ui.showGridValuesToggle.checked = state.display.showGridValues;
}

function updateDisplaySetting(key, value) {
  if (!(key in state.display)) {
    return;
  }
  state.display[key] = Boolean(value);
  saveDisplaySettings();
  render();
}

function createId() {
  const id = state.nextId;
  state.nextId += 1;
  return id;
}

function getRect() {
  return ui.graph.getBoundingClientRect();
}

function worldToScreen(point) {
  const rect = getRect();
  return {
    x: point.x * state.scale + state.panX + rect.width * 0.5,
    y: -point.y * state.scale + state.panY + rect.height * 0.5,
  };
}

function screenToWorld(screen) {
  const rect = getRect();
  return {
    x: (screen.x - state.panX - rect.width * 0.5) / state.scale,
    y: -(screen.y - state.panY - rect.height * 0.5) / state.scale,
  };
}

function getScreenPointFromEvent(event) {
  const rect = getRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function distanceScreen(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getPointById(pointId) {
  return state.points.find((point) => point.id === pointId) || null;
}

function getSegmentById(segmentId) {
  return state.segments.find((segment) => segment.id === segmentId) || null;
}

function getPolygonById(polygonId) {
  return state.polygons.find((polygon) => polygon.id === polygonId) || null;
}

function getTextById(textId) {
  return state.texts.find((text) => text.id === textId) || null;
}

function clearSelection() {
  state.selection.points.clear();
  state.selection.segments.clear();
  state.selection.polygons.clear();
  state.selection.texts.clear();
}

function getSelectedPointIds() {
  const ids = new Set(state.selection.points);

  for (const segmentId of state.selection.segments) {
    const segment = getSegmentById(segmentId);
    if (segment) {
      ids.add(segment.a);
      ids.add(segment.b);
    }
  }

  for (const polygonId of state.selection.polygons) {
    const polygon = getPolygonById(polygonId);
    if (polygon) {
      for (const pointId of polygon.pointIds) {
        ids.add(pointId);
      }
    }
  }

  return ids;
}

function getOrderedSelectedPoints() {
  return [...getSelectedPointIds()]
    .map((pointId) => getPointById(pointId))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

function serializeCoreState() {
  return {
    version: VERSION,
    nextId: state.nextId,
    scale: state.scale,
    panX: state.panX,
    panY: state.panY,
    points: state.points,
    segments: state.segments,
    polygons: state.polygons,
    texts: state.texts,
    angleAnnotations: state.angleAnnotations,
  };
}

function applyCoreState(serialized) {
  state.nextId = Number(serialized.nextId) || 1;
  state.scale = Number(serialized.scale) || 32;
  state.panX = Number(serialized.panX) || 0;
  state.panY = Number(serialized.panY) || 0;
  state.points = Array.isArray(serialized.points)
    ? serialized.points.map((point) => ({
        id: Number(point.id),
        x: Number(point.x),
        y: Number(point.y),
        label: String(point.label || ""),
      }))
    : [];
  state.segments = Array.isArray(serialized.segments)
    ? serialized.segments.map((segment) => ({
        id: Number(segment.id),
        a: Number(segment.a),
        b: Number(segment.b),
        kind: String(segment.kind || "segment"),
      }))
    : [];
  state.polygons = Array.isArray(serialized.polygons)
    ? serialized.polygons.map((polygon) => ({
        id: Number(polygon.id),
        pointIds: Array.isArray(polygon.pointIds) ? polygon.pointIds.map((id) => Number(id)) : [],
        labelOffset: polygon.labelOffset
          ? { x: Number(polygon.labelOffset.x) || 0, y: Number(polygon.labelOffset.y) || 0 }
          : { x: 0, y: 0 },
      }))
    : [];
  state.texts = Array.isArray(serialized.texts)
    ? serialized.texts.map((text) => ({
        id: Number(text.id),
        x: Number(text.x),
        y: Number(text.y),
        content: String(text.content || "Text"),
        size: clamp(Number(text.size) || 14, 10, 80),
      }))
    : [];
  state.angleAnnotations = Array.isArray(serialized.angleAnnotations)
    ? serialized.angleAnnotations.map((item) => ({
        id: Number(item.id),
        vertexId: Number(item.vertexId),
        aId: Number(item.aId),
        bId: Number(item.bId),
      }))
    : [];

  normalizeGeometry();
  clearSelection();
  state.drag = null;
  state.boxSelect = null;
  state.polygonDraft = [];
  state.midpointHoverWorld = null;
  state.construction = null;
  closeInlineTextEditor(false, false);
}

function pushHistory() {
  const snapshot = JSON.stringify(serializeCoreState());
  const current = state.history[state.historyIndex];
  if (snapshot === current) {
    return;
  }

  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(snapshot);

  if (state.history.length > 120) {
    state.history.shift();
  }

  state.historyIndex = state.history.length - 1;
  updateUndoRedoButtons();
}

function undo() {
  if (state.historyIndex <= 0) {
    setStatus("Nothing to undo.");
    return;
  }

  state.historyIndex -= 1;
  applyCoreState(JSON.parse(state.history[state.historyIndex]));
  updateUndoRedoButtons();
  render();
  setStatus("Undo complete.");
}

function redo() {
  if (state.historyIndex >= state.history.length - 1) {
    setStatus("Nothing to redo.");
    return;
  }

  state.historyIndex += 1;
  applyCoreState(JSON.parse(state.history[state.historyIndex]));
  updateUndoRedoButtons();
  render();
  setStatus("Redo complete.");
}

function updateUndoRedoButtons() {
  ui.undoBtn.disabled = state.historyIndex <= 0;
  ui.redoBtn.disabled = state.historyIndex >= state.history.length - 1;
}

function setStatus(message) {
  ui.status.textContent = message;
}

function isInlineEditorOpen() {
  return !ui.inlineTextEditor.hidden;
}

function openInlineTextEditor(screen, options = {}) {
  const textId = options.textId ?? null;
  const text = textId ? getTextById(textId) : null;
  const initialValue = options.initialValue ?? text?.content ?? "";
  const world = options.world ?? (text ? { x: text.x, y: text.y } : null);
  if (!world) {
    return;
  }

  state.textEdit = {
    textId,
    world,
  };

  const rect = getRect();
  const clampedX = clamp(screen.x, 16, rect.width - 16);
  const clampedY = clamp(screen.y, 22, rect.height - 8);

  ui.inlineTextEditor.value = initialValue;
  ui.inlineTextEditor.style.left = `${clampedX}px`;
  ui.inlineTextEditor.style.top = `${clampedY}px`;
  ui.inlineTextEditor.hidden = false;
  ui.inlineTextEditor.focus();
  ui.inlineTextEditor.select();
}

function closeInlineTextEditor(save, switchToSelect) {
  if (!isInlineEditorOpen() || !state.textEdit) {
    return;
  }

  const payload = state.textEdit;
  const value = ui.inlineTextEditor.value.trim();
  ui.inlineTextEditor.hidden = true;
  state.textEdit = null;

  if (save) {
    if (payload.textId) {
      const target = getTextById(payload.textId);
      if (target && value) {
        target.content = value;
        pushHistory();
      }
    } else if (value) {
      addText(payload.world, value);
      pushHistory();
    }
    render();
  }

  if (switchToSelect) {
    setMode("select");
  }
}

function insertPointOnEdge(edgePick, worldPoint) {
  const inserted = addPoint(worldPoint.x, worldPoint.y);
  if (edgePick.edge.edgeType === "segment") {
    state.segments = state.segments.filter((segment) => segment.id !== edgePick.edge.id);
    addSegment(edgePick.edge.aId, inserted.id, "segment");
    addSegment(inserted.id, edgePick.edge.bId, "segment");
  } else {
    const polygon = getPolygonById(edgePick.edge.polygonId);
    if (polygon) {
      polygon.pointIds.splice(edgePick.edge.edgeIndex + 1, 0, inserted.id);
    }
  }
  return inserted;
}

function joinSelectedPoints() {
  const points = getOrderedSelectedPoints();
  if (points.length < 2) {
    setStatus("Select at least two points to join.");
    return;
  }

  let createdCount = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const created = addSegment(points[index].id, points[index + 1].id, "segment");
    if (created) {
      createdCount += 1;
    }
  }

  if (createdCount === 0) {
    setStatus("No new joins were created.");
    return;
  }

  pushHistory();
  render();
  setStatus(`Created ${createdCount} join(s).`);
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", nextTheme);
  ui.themeToggleBtn.title = nextTheme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
  render();
}

function getSnapPoint(worldPoint, maxDistancePx = 14) {
  if (!state.snapToPoints || state.points.length === 0) {
    return null;
  }

  const targetScreen = worldToScreen(worldPoint);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const point of state.points) {
    const pointScreen = worldToScreen(point);
    const distance = distanceScreen(targetScreen, pointScreen);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }

  return bestDistance <= maxDistancePx ? best : null;
}

function addPoint(x, y, options = {}) {
  const point = {
    id: createId(),
    x: round2(x),
    y: round2(y),
    label: options.label || `P${state.nextId - 1}`,
  };
  state.points.push(point);
  return point;
}

function addSegment(a, b, kind = "segment") {
  if (a === b) {
    return null;
  }

  const exists = state.segments.some((segment) => {
    return (segment.a === a && segment.b === b) || (segment.a === b && segment.b === a);
  });

  if (exists) {
    return null;
  }

  const segment = { id: createId(), a, b, kind };
  state.segments.push(segment);
  return segment;
}

function isSegmentInsidePolygon(aId, bId) {
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

function addPolygon(pointIds) {
  if (!Array.isArray(pointIds) || pointIds.length < 3) {
    return null;
  }

  const polygon = {
    id: createId(),
    pointIds: [...pointIds],
    labelOffset: { x: 0, y: 0 },
  };
  state.polygons.push(polygon);
  return polygon;
}

function addText(world, content, size = 16) {
  state.texts.push({
    id: createId(),
    x: round2(world.x),
    y: round2(world.y),
    content: content || "Text",
    size,
  });
}

function normalizeGeometry() {
  const pointIds = new Set(state.points.map((point) => point.id));

  state.segments = state.segments.filter((segment) => {
    return pointIds.has(segment.a) && pointIds.has(segment.b) && segment.a !== segment.b;
  });

  state.polygons = state.polygons
    .map((polygon) => ({
      ...polygon,
      pointIds: polygon.pointIds.filter((pointId) => pointIds.has(pointId)),
    }))
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
}

function getAllEdges() {
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

function projectPointToSegment(worldPoint, aWorld, bWorld) {
  const abx = bWorld.x - aWorld.x;
  const aby = bWorld.y - aWorld.y;
  const apx = worldPoint.x - aWorld.x;
  const apy = worldPoint.y - aWorld.y;
  const mag2 = abx * abx + aby * aby;
  if (mag2 === 0) {
    return { point: { ...aWorld }, t: 0 };
  }

  const t = clamp((apx * abx + apy * aby) / mag2, 0, 1);
  return {
    point: {
      x: aWorld.x + t * abx,
      y: aWorld.y + t * aby,
    },
    t,
  };
}

function findNearestEdge(worldPoint, maxDistancePx = 12) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const edge of getAllEdges()) {
    const a = getPointById(edge.aId);
    const b = getPointById(edge.bId);
    if (!a || !b) {
      continue;
    }

    const projection = projectPointToSegment(worldPoint, a, b);
    const projectionScreen = worldToScreen(projection.point);
    const targetScreen = worldToScreen(worldPoint);
    const distance = distanceScreen(projectionScreen, targetScreen);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = {
        edge,
        projection,
      };
    }
  }

  return nearestDistance <= maxDistancePx ? nearest : null;
}

function polygonArea(pointIds) {
  if (pointIds.length < 3) {
    return 0;
  }

  let sum = 0;
  for (let index = 0; index < pointIds.length; index += 1) {
    const next = (index + 1) % pointIds.length;
    const currentPoint = getPointById(pointIds[index]);
    const nextPoint = getPointById(pointIds[next]);
    if (!currentPoint || !nextPoint) {
      continue;
    }
    sum += currentPoint.x * nextPoint.y - nextPoint.x * currentPoint.y;
  }

  return Math.abs(sum) * 0.5;
}

function removePoint(pointId) {
  state.points = state.points.filter((point) => point.id !== pointId);
  state.segments = state.segments.filter((segment) => segment.a !== pointId && segment.b !== pointId);
  state.polygons = state.polygons
    .map((polygon) => ({ ...polygon, pointIds: polygon.pointIds.filter((id) => id !== pointId) }))
    .filter((polygon) => polygon.pointIds.length >= 3);
  state.selection.points.delete(pointId);
}

function removeSelectedObjects() {
  if (
    state.selection.points.size === 0 &&
    state.selection.segments.size === 0 &&
    state.selection.polygons.size === 0 &&
    state.selection.texts.size === 0
  ) {
    return;
  }

  for (const pointId of state.selection.points) {
    removePoint(pointId);
  }

  state.segments = state.segments.filter((segment) => !state.selection.segments.has(segment.id));
  state.polygons = state.polygons.filter((polygon) => !state.selection.polygons.has(polygon.id));
  state.texts = state.texts.filter((text) => !state.selection.texts.has(text.id));

  clearSelection();
  normalizeGeometry();
  pushHistory();
  render();
  setStatus("Selection deleted.");
}

function hitTestPoint(screen, radiusPx = 10) {
  for (let index = state.points.length - 1; index >= 0; index -= 1) {
    const point = state.points[index];
    const pointScreen = worldToScreen(point);
    if (distanceScreen(pointScreen, screen) <= radiusPx) {
      return point;
    }
  }
  return null;
}

function distancePointToSegmentScreen(target, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = target.x - a.x;
  const apy = target.y - a.y;
  const mag2 = abx * abx + aby * aby;
  if (mag2 === 0) {
    return distanceScreen(target, a);
  }
  const t = clamp((apx * abx + apy * aby) / mag2, 0, 1);
  const proj = { x: a.x + t * abx, y: a.y + t * aby };
  return distanceScreen(target, proj);
}

function hitTestSegment(screen, tolerancePx = 7) {
  for (let index = state.segments.length - 1; index >= 0; index -= 1) {
    const segment = state.segments[index];
    const a = getPointById(segment.a);
    const b = getPointById(segment.b);
    if (!a || !b) {
      continue;
    }

    const aScreen = worldToScreen(a);
    const bScreen = worldToScreen(b);
    const distance = distancePointToSegmentScreen(screen, aScreen, bScreen);
    if (distance <= tolerancePx) {
      return segment;
    }
  }

  return null;
}

function pointInsidePolygonScreen(screen, polygon) {
  const polygonPoints = polygon.pointIds
    .map((pointId) => getPointById(pointId))
    .filter(Boolean)
    .map((point) => worldToScreen(point));

  if (polygonPoints.length < 3) {
    return false;
  }

  let inside = false;
  for (let index = 0, previous = polygonPoints.length - 1; index < polygonPoints.length; previous = index, index += 1) {
    const xi = polygonPoints[index].x;
    const yi = polygonPoints[index].y;
    const xj = polygonPoints[previous].x;
    const yj = polygonPoints[previous].y;
    const intersect = (yi > screen.y) !== (yj > screen.y) &&
      screen.x < ((xj - xi) * (screen.y - yi)) / ((yj - yi) || 1e-9) + xi;
    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

function hitTestPolygonLabel(screen) {
  for (let index = state.polygons.length - 1; index >= 0; index -= 1) {
    const polygon = state.polygons[index];
    const points = polygon.pointIds.map((id) => getPointById(id)).filter(Boolean);
    if (points.length < 3) continue;
    const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    centroid.x /= points.length;
    centroid.y /= points.length;
    const origin = worldToScreen({
      x: centroid.x + (polygon.labelOffset?.x ?? 0),
      y: centroid.y + (polygon.labelOffset?.y ?? 0),
    });
    // label block spans roughly: x ±70, y from -65 to +40
    if (
      screen.x >= origin.x - 70 &&
      screen.x <= origin.x + 70 &&
      screen.y >= origin.y - 65 &&
      screen.y <= origin.y + 40
    ) {
      return polygon;
    }
  }
  return null;
}

function hitTestPolygon(screen) {
  for (let index = state.polygons.length - 1; index >= 0; index -= 1) {
    const polygon = state.polygons[index];
    if (pointInsidePolygonScreen(screen, polygon)) {
      return polygon;
    }
  }
  return null;
}

function hitTestText(screen) {
  for (let index = state.texts.length - 1; index >= 0; index -= 1) {
    const text = state.texts[index];
    const screenPoint = worldToScreen(text);
    const width = Math.max(50, text.content.length * (text.size * 0.52));
    const height = text.size + 8;
    const box = {
      x: screenPoint.x - width * 0.5,
      y: screenPoint.y - height,
      width,
      height,
    };

    if (
      screen.x >= box.x &&
      screen.x <= box.x + box.width &&
      screen.y >= box.y &&
      screen.y <= box.y + box.height
    ) {
      return text;
    }
  }

  return null;
}

function pointConnections() {
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

function normalizeAngleRadians(value) {
  let angle = value;
  while (angle <= -Math.PI) {
    angle += 2 * Math.PI;
  }
  while (angle > Math.PI) {
    angle -= 2 * Math.PI;
  }
  return angle;
}

function angleCandidateKey(candidate) {
  const left = Math.min(candidate.aId, candidate.bId);
  const right = Math.max(candidate.aId, candidate.bId);
  return `${candidate.vertexId}:${left}:${right}`;
}

function getAngleCandidates() {
  const candidates = [];
  const edges = pointConnections();

  for (const [vertexId, neighbors] of edges.entries()) {
    const neighborIds = [...neighbors];
    if (neighborIds.length < 2) {
      continue;
    }

    for (let i = 0; i < neighborIds.length - 1; i += 1) {
      for (let j = i + 1; j < neighborIds.length; j += 1) {
        const aId = neighborIds[i];
        const bId = neighborIds[j];
        const vertex = getPointById(vertexId);
        const a = getPointById(aId);
        const b = getPointById(bId);
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

function getAngleArcGeometry(candidate, radiusPx = 26) {
  const vertex = getPointById(candidate.vertexId);
  const a = getPointById(candidate.aId);
  const b = getPointById(candidate.bId);
  if (!vertex || !a || !b) {
    return null;
  }

  const v = worldToScreen(vertex);
  const as = worldToScreen(a);
  const bs = worldToScreen(b);

  const startAngle = Math.atan2(as.y - v.y, as.x - v.x);
  const rawDelta = normalizeAngleRadians(Math.atan2(bs.y - v.y, bs.x - v.x) - startAngle);
  const sweep = rawDelta > 0 ? 1 : 0;
  const endAngle = startAngle + rawDelta;
  const start = {
    x: v.x + Math.cos(startAngle) * radiusPx,
    y: v.y + Math.sin(startAngle) * radiusPx,
  };
  const end = {
    x: v.x + Math.cos(endAngle) * radiusPx,
    y: v.y + Math.sin(endAngle) * radiusPx,
  };
  const middleAngle = startAngle + rawDelta * 0.5;
  const labelPoint = {
    x: v.x + Math.cos(middleAngle) * (radiusPx + 12),
    y: v.y + Math.sin(middleAngle) * (radiusPx + 12),
  };

  return {
    center: v,
    start,
    end,
    radiusPx,
    sweep,
    labelPoint,
    largeArc: Math.abs(rawDelta) > Math.PI ? 1 : 0,
  };
}

function hitTestAngleCandidate(screen, candidates) {
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const arc = getAngleArcGeometry(candidate);
    if (!arc) {
      continue;
    }
    const distance = distanceScreen(screen, arc.labelPoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return bestDistance <= 20 ? best : null;
}

function setMode(mode) {
  if (!MODES.includes(mode)) {
    return;
  }
  state.mode = mode;
  state.polygonDraft = [];
  state.construction = null;
  state.boxSelect = null;

  for (const button of ui.modeButtons) {
    button.classList.toggle("active", button.dataset.mode === mode);
  }

  for (const group of ui.modeSelectGroups) {
    const values = (group.dataset.groupModes || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    group.classList.toggle("active", values.includes(mode));
  }

  for (const select of ui.modeSelects) {
    const hasMode = Array.from(select.options).some((option) => option.value === mode);
    if (hasMode) {
      select.value = mode;
    }
  }

  ui.graph.classList.remove(...MODES.map((entry) => `mode-${entry}`));
  ui.graph.classList.add(`mode-${mode}`);

  if (globalThis.matchMedia("(max-width: 920px)").matches) {
    ui.toolMenu.classList.remove("open");
    ui.mobileMenuToggle.setAttribute("aria-expanded", "false");
  }

  if (mode === "select") {
    setStatus("Select mode: click to select and drag. Delete removes selected objects.");
  } else if (mode === "polygon") {
    setStatus("Polygon mode: click to place vertices, click the first vertex to close.");
  } else if (mode === "angle") {
    setStatus("Angle mode: click a highlighted angle to keep it as annotation.");
  } else if (mode === "midpoint") {
    setStatus("Mid Point mode: click an existing line to insert a point on it.");
  } else if (mode === "segment") {
    setStatus("Segment mode: click two points to create a segment.");
  } else if (mode === "parallel") {
    setStatus("Parallel mode: select a base segment, then click where the new line should pass.");
  } else if (mode === "perpendicular") {
    setStatus("Perpendicular mode: select a base segment, then click where the new line should pass.");
  } else if (mode === "text") {
    setStatus("Text mode: click anywhere on the graph to place text.");
  } else if (mode === "box-select") {
    setStatus("Box select mode: drag a box to select points, text, and segments.");
  } else {
    setStatus(`${mode} mode active.`);
  }

  render();
}

function makeLine(x1, y1, x2, y2, attrs = {}) {
  const line = document.createElementNS(SVG_NS, "line");
  line.setAttribute("x1", String(x1));
  line.setAttribute("y1", String(y1));
  line.setAttribute("x2", String(x2));
  line.setAttribute("y2", String(y2));
  for (const [name, value] of Object.entries(attrs)) {
    line.setAttribute(name, String(value));
  }
  return line;
}

function makeCircle(cx, cy, r, attrs = {}) {
  const circle = document.createElementNS(SVG_NS, "circle");
  circle.setAttribute("cx", String(cx));
  circle.setAttribute("cy", String(cy));
  circle.setAttribute("r", String(r));
  for (const [name, value] of Object.entries(attrs)) {
    circle.setAttribute(name, String(value));
  }
  return circle;
}

function makeText(x, y, content, attrs = {}) {
  const text = document.createElementNS(SVG_NS, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.textContent = content;
  for (const [name, value] of Object.entries(attrs)) {
    text.setAttribute(name, String(value));
  }
  return text;
}

function makePolygon(points, attrs = {}) {
  const polygon = document.createElementNS(SVG_NS, "polygon");
  polygon.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  for (const [name, value] of Object.entries(attrs)) {
    polygon.setAttribute(name, String(value));
  }
  return polygon;
}

function makePolyline(points, attrs = {}) {
  const polyline = document.createElementNS(SVG_NS, "polyline");
  polyline.setAttribute("points", points.map((point) => `${point.x},${point.y}`).join(" "));
  for (const [name, value] of Object.entries(attrs)) {
    polyline.setAttribute(name, String(value));
  }
  return polyline;
}

function chooseGridMajorStep() {
  const pixelsPerMajor = 110;
  const raw = pixelsPerMajor / state.scale;
  const power = 10 ** Math.floor(Math.log10(raw || 1));
  const normalized = raw / power;
  let selected = 1;
  if (normalized > 5) {
    selected = 10;
  } else if (normalized > 2) {
    selected = 5;
  } else if (normalized > 1) {
    selected = 2;
  }
  return selected * power;
}

function drawGrid(parentGroup) {
  const rect = getRect();
  const majorStep = chooseGridMajorStep();
  const minorStep = majorStep / 5;
  const minorColor = getCssVar("--grid-minor", "#dce6ec");
  const majorColor = getCssVar("--grid-major", "#b0c3cd");
  const axisColor = getCssVar("--grid-axis", "#6b7f8d");
  const valueColor = getCssVar("--grid-value", "#53657b");

  const minWorld = screenToWorld({ x: 0, y: rect.height });
  const maxWorld = screenToWorld({ x: rect.width, y: 0 });

  const minX = Math.floor(minWorld.x / minorStep) * minorStep;
  const maxX = Math.ceil(maxWorld.x / minorStep) * minorStep;
  const minY = Math.floor(minWorld.y / minorStep) * minorStep;
  const maxY = Math.ceil(maxWorld.y / minorStep) * minorStep;

  const gridGroup = document.createElementNS(SVG_NS, "g");
  const majorGroup = document.createElementNS(SVG_NS, "g");
  const axesGroup = document.createElementNS(SVG_NS, "g");
  const valuesGroup = document.createElementNS(SVG_NS, "g");

  for (let x = minX; x <= maxX + minorStep * 0.5; x += minorStep) {
    const screenA = worldToScreen({ x, y: minY });
    const screenB = worldToScreen({ x, y: maxY });
    const isMajor = Math.abs(x / majorStep - Math.round(x / majorStep)) < 1e-9;
    if ((isMajor && !state.display.showMajorGrid) || (!isMajor && !state.display.showMinorGrid)) {
      continue;
    }
    const line = makeLine(screenA.x, screenA.y, screenB.x, screenB.y, {
      stroke: isMajor ? majorColor : minorColor,
      "stroke-width": isMajor ? 1.2 : 0.7,
      "stroke-opacity": isMajor ? 0.75 : 0.8,
    });
    (isMajor ? majorGroup : gridGroup).append(line);

    if (isMajor && state.display.showGridValues && Math.abs(x) > 1e-8) {
      const label = makeText(screenA.x + 2, worldToScreen({ x, y: 0 }).y - 4, String(round2(x)), {
        "font-size": 10,
        fill: valueColor,
      });
      valuesGroup.append(label);
    }
  }

  for (let y = minY; y <= maxY + minorStep * 0.5; y += minorStep) {
    const screenA = worldToScreen({ x: minX, y });
    const screenB = worldToScreen({ x: maxX, y });
    const isMajor = Math.abs(y / majorStep - Math.round(y / majorStep)) < 1e-9;
    if ((isMajor && !state.display.showMajorGrid) || (!isMajor && !state.display.showMinorGrid)) {
      continue;
    }
    const line = makeLine(screenA.x, screenA.y, screenB.x, screenB.y, {
      stroke: isMajor ? majorColor : minorColor,
      "stroke-width": isMajor ? 1.2 : 0.7,
      "stroke-opacity": isMajor ? 0.75 : 0.8,
    });
    (isMajor ? majorGroup : gridGroup).append(line);

    if (isMajor && state.display.showGridValues && Math.abs(y) > 1e-8) {
      const label = makeText(worldToScreen({ x: 0, y }).x + 4, screenA.y - 2, String(round2(y)), {
        "font-size": 10,
        fill: valueColor,
      });
      valuesGroup.append(label);
    }
  }

  const xAxis = worldToScreen({ x: 0, y: 0 });
  if (state.display.showMajorGrid || state.display.showMinorGrid) {
  axesGroup.append(
    makeLine(0, xAxis.y, rect.width, xAxis.y, {
      stroke: axisColor,
      "stroke-width": 1.35,
      "stroke-opacity": 0.75,
    })
  );
  axesGroup.append(
    makeLine(xAxis.x, 0, xAxis.x, rect.height, {
      stroke: axisColor,
      "stroke-width": 1.35,
      "stroke-opacity": 0.75,
    })
  );
  }

  parentGroup.append(gridGroup, majorGroup, axesGroup, valuesGroup);
}

function render() {
  const rect = getRect();
  ui.graph.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  ui.graph.replaceChildren();

  const root = document.createElementNS(SVG_NS, "g");
  const polygonsGroup = document.createElementNS(SVG_NS, "g");
  const segmentsGroup = document.createElementNS(SVG_NS, "g");
  const pointsGroup = document.createElementNS(SVG_NS, "g");
  const labelsGroup = document.createElementNS(SVG_NS, "g");
  const overlaysGroup = document.createElementNS(SVG_NS, "g");
  const metricGroup = document.createElementNS(SVG_NS, "g");

  drawGrid(root);

  const angleCandidates = getAngleCandidates();
  const pinnedAngleKeys = new Set(state.angleAnnotations.map((item) => angleCandidateKey(item)));

  for (const polygon of state.polygons) {
    const points = polygon.pointIds.map((pointId) => getPointById(pointId)).filter(Boolean);
    if (points.length < 3) {
      continue;
    }

    const polygonScreenPoints = points.map((point) => worldToScreen(point));
    const selected = state.selection.polygons.has(polygon.id);

    if (state.display.showPolygons) {
      polygonsGroup.append(
        makePolygon(polygonScreenPoints, {
          fill: selected ? "rgba(245, 158, 11, 0.28)" : "rgba(15, 118, 110, 0.16)",
          stroke: selected ? "#b45309" : "#0f766e",
          "stroke-width": selected ? 2.2 : 1.6,
        })
      );
    }

    const area = polygonArea(polygon.pointIds);
    const perimeter = polygonPerimeter(polygon.pointIds);
    const converted = areaConversions(area);
    const centroid = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    centroid.x /= points.length;
    centroid.y /= points.length;
    const centroidScreen = worldToScreen(centroid);
    const labelOriginScreen = worldToScreen({
      x: centroid.x + (polygon.labelOffset?.x ?? 0),
      y: centroid.y + (polygon.labelOffset?.y ?? 0),
    });
    const xs = polygonScreenPoints.map((point) => point.x);
    const ys = polygonScreenPoints.map((point) => point.y);
    const bboxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const showPerimeter = state.display.showLabels && state.display.showPolygons;
    const showAreaMetrics = state.display.showLabels && state.display.showPolygons && bboxArea > 42000;
    if (showPerimeter) {
      const title = makeText(labelOriginScreen.x, labelOriginScreen.y - 56, `Perimeter: ${round2(perimeter)} m`, {
        "text-anchor": "middle",
        "font-size": 11,
        fill: getCssVar("--ink-muted", "#0f4f4a"),
        "font-weight": 700,
        "paint-order": "stroke",
        stroke: getCssVar("--text-halo", "#ffffff"),
        "stroke-width": 3,
        "stroke-opacity": 0.7,
      });
      labelsGroup.append(title);
    }

    if (showAreaMetrics) {
      const areaLines = [
        `Hectares: ${round3(converted.hectares)}`,
        `Ares: ${round3(converted.ares)}`,
        `Sqm: ${round2(converted.sqm)}`,
        `Acres: ${round3(converted.acres)}`,
        `Cents: ${round3(converted.cents)}`,
        `Sqft: ${round2(converted.sqft)}`,
      ];
      for (let i = 0; i < areaLines.length; i += 1) {
        labelsGroup.append(
          makeText(labelOriginScreen.x, labelOriginScreen.y - 40 + i * 12, areaLines[i], {
            "text-anchor": "middle",
            "font-size": 10,
            fill: getCssVar("--ink-muted", "#0f4f4a"),
            "font-weight": 600,
            "paint-order": "stroke",
            stroke: getCssVar("--text-halo", "#ffffff"),
            "stroke-width": 3,
            "stroke-opacity": 0.7,
          })
        );
      }
    }

    if (state.display.showPolygons && state.display.showSegmentLengths && state.display.showLabels) {
      for (let index = 0; index < points.length; index += 1) {
        const next = (index + 1) % points.length;
        const aPoint = points[index];
        const bPoint = points[next];
        const aScreen = worldToScreen(aPoint);
        const bScreen = worldToScreen(bPoint);
        const midpoint = { x: (aScreen.x + bScreen.x) * 0.5, y: (aScreen.y + bScreen.y) * 0.5 };
        const edgeLength = distanceWorld(aPoint, bPoint);
        labelsGroup.append(
          makeText(midpoint.x, midpoint.y - 5, `${round2(edgeLength)} m`, {
            "text-anchor": "middle",
            "font-size": 10,
            fill: getCssVar("--ink-muted", "#556471"),
            "font-weight": 600,
            "paint-order": "stroke",
            stroke: getCssVar("--text-halo", "#ffffff"),
            "stroke-width": 3,
            "stroke-opacity": 0.7,
          })
        );
      }
    }
  }

  if (state.polygonDraft.length >= 2) {
    const draftPoints = state.polygonDraft
      .map((pointId) => getPointById(pointId))
      .filter(Boolean)
      .map((point) => worldToScreen(point));
    if (state.hoverWorld) {
      draftPoints.push(worldToScreen(state.hoverWorld));
    }

    if (draftPoints.length >= 3) {
      polygonsGroup.append(
        makePolygon(draftPoints, {
          fill: "rgba(245, 158, 11, 0.18)",
          stroke: "#d97706",
          "stroke-dasharray": "7 6",
          "stroke-width": 1.8,
        })
      );
    } else {
      polygonsGroup.append(
        makePolyline(draftPoints, {
          fill: "none",
          stroke: "#d97706",
          "stroke-dasharray": "7 6",
          "stroke-width": 1.8,
        })
      );
    }
  }

  for (const segment of state.segments) {
    const a = getPointById(segment.a);
    const b = getPointById(segment.b);
    if (!a || !b) {
      continue;
    }
    const aScreen = worldToScreen(a);
    const bScreen = worldToScreen(b);
    const selected = state.selection.segments.has(segment.id);
    const color =
      segment.kind === "parallel"
        ? "#0e7490"
        : segment.kind === "perpendicular"
          ? "#be123c"
          : "#1f6d64";
    if (state.display.showSegments) {
      const isDiagonal = isSegmentInsidePolygon(segment.a, segment.b);
      segmentsGroup.append(
        makeLine(aScreen.x, aScreen.y, bScreen.x, bScreen.y, {
          stroke: selected ? "#f59e0b" : color,
          "stroke-width": selected ? 3.4 : 2.3,
          "stroke-linecap": "round",
          ...(isDiagonal && { "stroke-dasharray": "6 4" }),
        })
      );
    }

    if (state.display.showSegments && state.display.showSegmentLengths && state.display.showLabels) {
      const midpoint = { x: (aScreen.x + bScreen.x) * 0.5, y: (aScreen.y + bScreen.y) * 0.5 };
      const length = distanceWorld(a, b);
      labelsGroup.append(
        makeText(midpoint.x, midpoint.y - 6, `${round2(length)} m`, {
          "text-anchor": "middle",
          "font-size": 10,
          fill: getCssVar("--ink-muted", "#556471"),
          "font-weight": 600,
          "paint-order": "stroke",
          stroke: getCssVar("--text-halo", "#ffffff"),
          "stroke-width": 3,
          "stroke-opacity": 0.65,
        })
      );
    }
  }

  for (const point of state.points) {
    const screenPoint = worldToScreen(point);
    const selected = state.selection.points.has(point.id);
    if (state.display.showPoints) {
      pointsGroup.append(
        makeCircle(screenPoint.x, screenPoint.y, selected ? 6.8 : 5.4, {
          fill: selected ? "#f59e0b" : "#155e75",
          stroke: "#ffffff",
          "stroke-width": selected ? 2.2 : 1.6,
        })
      );
    }
    if (state.display.showLabels) {
      labelsGroup.append(
        makeText(screenPoint.x + 8, screenPoint.y - 8, `${point.label} (${round2(point.x)}, ${round2(point.y)})`, {
          "font-size": 11,
          fill: getCssVar("--ink-muted", "#334155"),
          "font-weight": selected ? 700 : 500,
        })
      );
    }
  }

  if (state.display.showText) {
    for (const text of state.texts) {
      const screenPoint = worldToScreen(text);
      const selected = state.selection.texts.has(text.id);
      labelsGroup.append(
        makeText(screenPoint.x, screenPoint.y, text.content, {
          "font-size": text.size,
          "text-anchor": "middle",
          fill: selected ? "#b45309" : getCssVar("--ink", "#1f2937"),
          "font-weight": selected ? 700 : 500,
          "paint-order": "stroke",
          stroke: getCssVar("--text-halo", "#ffffff"),
          "stroke-width": 4,
          "stroke-opacity": 0.9,
        })
      );
    }
  }

  if (state.boxSelect) {
    const x = Math.min(state.boxSelect.start.x, state.boxSelect.current.x);
    const y = Math.min(state.boxSelect.start.y, state.boxSelect.current.y);
    const width = Math.abs(state.boxSelect.current.x - state.boxSelect.start.x);
    const height = Math.abs(state.boxSelect.current.y - state.boxSelect.start.y);

    const rectElement = document.createElementNS(SVG_NS, "rect");
    rectElement.setAttribute("x", String(x));
    rectElement.setAttribute("y", String(y));
    rectElement.setAttribute("width", String(width));
    rectElement.setAttribute("height", String(height));
    rectElement.setAttribute("fill", "rgba(15, 118, 110, 0.12)");
    rectElement.setAttribute("stroke", "#0f766e");
    rectElement.setAttribute("stroke-dasharray", "6 4");
    rectElement.setAttribute("stroke-width", "1.4");
    overlaysGroup.append(rectElement);
  }

  if (state.mode !== "select" && state.mode !== "box-select" && state.hoverWorld) {
    const ghost = worldToScreen(state.hoverWorld);
    overlaysGroup.append(
      makeCircle(ghost.x, ghost.y, 4.5, {
        fill: "rgba(245, 158, 11, 0.55)",
        stroke: "#b45309",
        "stroke-width": 1.2,
      })
    );
  }

  if (state.mode === "midpoint" && state.midpointHoverWorld) {
    const midScreen = worldToScreen(state.midpointHoverWorld);
    overlaysGroup.append(
      makeCircle(midScreen.x, midScreen.y, 6.2, {
        fill: "rgba(34, 193, 181, 0.3)",
        stroke: "#0f766e",
        "stroke-width": 2,
      })
    );
  }

  if (state.display.showAngles) {
    for (const candidate of angleCandidates) {
      const key = angleCandidateKey(candidate);
      const isPinned = pinnedAngleKeys.has(key);
      const isPreview = state.mode === "angle";
      if (!isPinned && !isPreview) {
        continue;
      }

      const arc = getAngleArcGeometry(candidate, isPinned ? 30 : 24);
      if (!arc) {
        continue;
      }

      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", `M ${arc.start.x} ${arc.start.y} A ${arc.radiusPx} ${arc.radiusPx} 0 ${arc.largeArc} ${arc.sweep} ${arc.end.x} ${arc.end.y}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", isPinned ? "#0ea5a3" : "rgba(14,165,163,0.6)");
      path.setAttribute("stroke-width", isPinned ? "2.2" : "1.6");
      overlaysGroup.append(path);

      labelsGroup.append(
        makeText(arc.labelPoint.x, arc.labelPoint.y, `${round2(candidate.angleDeg)}deg`, {
          "font-size": 10,
          "text-anchor": "middle",
          fill: isPinned ? "#0f766e" : "rgba(15,118,110,0.8)",
          "font-weight": 700,
          "paint-order": "stroke",
          stroke: getCssVar("--text-halo", "#ffffff"),
          "stroke-width": 3,
          "stroke-opacity": 0.7,
        })
      );
    }
  }

  if (state.construction?.tool && state.construction?.baseSegmentId) {
    const segment = getSegmentById(state.construction.baseSegmentId);
    if (segment) {
      const a = getPointById(segment.a);
      const b = getPointById(segment.b);
      if (a && b) {
        const aScreen = worldToScreen(a);
        const bScreen = worldToScreen(b);
        overlaysGroup.append(
          makeLine(aScreen.x, aScreen.y, bScreen.x, bScreen.y, {
            stroke: "#f59e0b",
            "stroke-width": 4.2,
            "stroke-opacity": 0.45,
            "stroke-dasharray": "8 5",
            "stroke-linecap": "round",
          })
        );
      }
    }
  }

  root.append(polygonsGroup, segmentsGroup, pointsGroup, labelsGroup, metricGroup, overlaysGroup);
  ui.graph.append(root);
}

function getSelectionSummary() {
  return `${state.selection.points.size} point(s), ${state.selection.segments.size} segment(s), ${state.selection.polygons.size} polygon(s), ${state.selection.texts.size} text item(s)`;
}

function selectSingle(kind, id) {
  clearSelection();
  state.selection[kind].add(id);
}

function toggleSelection(kind, id) {
  if (state.selection[kind].has(id)) {
    state.selection[kind].delete(id);
  } else {
    state.selection[kind].add(id);
  }
}

function resolvePointForDrawing(worldPoint) {
  const snapped = getSnapPoint(worldPoint);
  if (snapped) {
    return snapped;
  }
  return addPoint(worldPoint.x, worldPoint.y);
}

function handleModeAction(screen, world) {
  if (state.mode === "point") {
    const hitPoint = hitTestPoint(screen, 10);
    const edgePick = hitPoint ? null : findNearestEdge(world);
    let point;

    if (hitPoint) {
      point = hitPoint;
    } else if (edgePick) {
      point = insertPointOnEdge(edgePick, edgePick.projection.point);
    } else {
      point = resolvePointForDrawing(world);
    }

    clearSelection();
    state.selection.points.add(point.id);
    pushHistory();
    render();
    setStatus(`Point placed at (${round2(point.x)}, ${round2(point.y)}).`);
    return;
  }

  if (state.mode === "midpoint") {
    const edgePick = findNearestEdge(world);
    if (!edgePick) {
      setStatus("No nearby line found. Click closer to a segment or polygon edge.");
      return;
    }

    const a = getPointById(edgePick.edge.aId);
    const b = getPointById(edgePick.edge.bId);
    if (!a || !b) {
      return;
    }

    const midpoint = {
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
    };
    const inserted = insertPointOnEdge(edgePick, midpoint);

    pushHistory();
    render();
    setStatus(`Midpoint inserted at (${round2(inserted.x)}, ${round2(inserted.y)}).`);
    return;
  }

  if (state.mode === "segment") {
    const hitPoint = hitTestPoint(screen) || getSnapPoint(world);
    const point = hitPoint || addPoint(world.x, world.y);
    if (!state.construction || state.construction.tool !== "segment") {
      state.construction = {
        tool: "segment",
        firstPointId: point.id,
      };
      setStatus("Segment mode: first point selected, click second point.");
      render();
      return;
    }

    const first = state.construction.firstPointId;
    if (first === point.id) {
      setStatus("Pick a different second point.");
      return;
    }

    addSegment(first, point.id, "segment");
    state.construction = null;
    pushHistory();
    render();
    setStatus("Segment created.");
    return;
  }

  if (state.mode === "parallel" || state.mode === "perpendicular") {
    if (!state.construction || state.construction.tool !== state.mode || !state.construction.baseSegmentId) {
      const segmentHit = hitTestSegment(screen);
      if (!segmentHit) {
        setStatus("Select a base segment first.");
        return;
      }
      state.construction = {
        tool: state.mode,
        baseSegmentId: segmentHit.id,
      };
      setStatus("Base segment selected. Click where the new line should pass.");
      render();
      return;
    }

    const baseSegment = getSegmentById(state.construction.baseSegmentId);
    if (!baseSegment) {
      state.construction = null;
      setStatus("Base segment no longer exists.");
      return;
    }

    const a = getPointById(baseSegment.a);
    const b = getPointById(baseSegment.b);
    if (!a || !b) {
      state.construction = null;
      setStatus("Base segment is invalid.");
      return;
    }

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) {
      state.construction = null;
      setStatus("Base segment has zero length.");
      return;
    }

    let ux = dx / length;
    let uy = dy / length;
    if (state.mode === "perpendicular") {
      const previousUx = ux;
      ux = -uy;
      uy = previousUx;
    }

    const halfLength = length * 0.5;
    const p1 = addPoint(world.x - ux * halfLength, world.y - uy * halfLength);
    const p2 = addPoint(world.x + ux * halfLength, world.y + uy * halfLength);
    addSegment(p1.id, p2.id, state.mode);
    state.construction = null;
    pushHistory();
    render();
    setStatus(`${state.mode === "parallel" ? "Parallel" : "Perpendicular"} segment created.`);
    return;
  }

  if (state.mode === "polygon") {
    const hitPoint = hitTestPoint(screen, 10);

    if (state.polygonDraft.length >= 3 && hitPoint && hitPoint.id === state.polygonDraft[0]) {
      addPolygon(state.polygonDraft);
      const area = polygonArea(state.polygonDraft);
      state.polygonDraft = [];
      pushHistory();
      render();
      setStatus(`Polygon closed. Area: ${round2(area)} sq units.`);
      return;
    }

    const point = hitPoint || addPoint(world.x, world.y);
    if (state.polygonDraft.includes(point.id)) {
      setStatus("That vertex already exists in the current polygon path.");
      return;
    }

    state.polygonDraft.push(point.id);
    const draftArea = state.polygonDraft.length >= 3 ? polygonArea(state.polygonDraft) : 0;
    render();
    setStatus(
      state.polygonDraft.length >= 3
        ? `Polygon drafting: ${state.polygonDraft.length} vertices, preview area ${round2(draftArea)} sq units.`
        : `Polygon drafting: ${state.polygonDraft.length} vertex added.`
    );
    return;
  }

  if (state.mode === "angle") {
    const candidates = getAngleCandidates();
    const hit = hitTestAngleCandidate(screen, candidates);
    if (!hit) {
      setStatus("No angle candidate at this location.");
      return;
    }

    const key = angleCandidateKey(hit);
    const existingIndex = state.angleAnnotations.findIndex((item) => angleCandidateKey(item) === key);
    if (existingIndex >= 0) {
      state.angleAnnotations.splice(existingIndex, 1);
      pushHistory();
      render();
      setStatus("Angle annotation removed.");
      return;
    }

    state.angleAnnotations.push({
      id: createId(),
      vertexId: hit.vertexId,
      aId: hit.aId,
      bId: hit.bId,
    });
    pushHistory();
    render();
    setStatus(`Angle annotation saved: ${round2(hit.angleDeg)}deg.`);
    return;
  }

  if (state.mode === "text") {
    openInlineTextEditor(screen, { world, initialValue: "" });
    setStatus("Type text and press Enter.");
    return;
  }

  if (state.mode === "box-select") {
    state.boxSelect = { start: { ...screen }, current: { ...screen } };
    render();
  }
}

function movePoint(pointId, dxWorld, dyWorld) {
  const point = getPointById(pointId);
  if (!point) {
    return;
  }
  point.x = round2(point.x + dxWorld);
  point.y = round2(point.y + dyWorld);
}

function handlePointerDown(event) {
  event.preventDefault();
  hideContextMenu();

  if (isInlineEditorOpen() && event.target !== ui.inlineTextEditor) {
    closeInlineTextEditor(true, false);
  }

  if (event.button === 2) {
    return;
  }

  ui.graph.setPointerCapture(event.pointerId);

  const screen = getScreenPointFromEvent(event);
  const world = screenToWorld(screen);
  state.mouseDownScreen = screen;

  if (event.button === 1 || (event.button === 0 && event.shiftKey && state.mode === "select")) {
    state.drag = {
      type: "pan",
      startScreen: screen,
      startPanX: state.panX,
      startPanY: state.panY,
    };
    setStatus("Panning graph...");
    return;
  }

  if (state.mode !== "select") {
    handleModeAction(screen, world);
    return;
  }

  const hitPoint = hitTestPoint(screen);
  const hitText = hitTestText(screen);
  const hitSegment = hitTestSegment(screen);
  const hitPolygonLabel = hitTestPolygonLabel(screen);
  const hitPolygon = !hitPolygonLabel && hitTestPolygon(screen);

  const additive = event.ctrlKey || event.metaKey;

  if (!hitPoint && !hitText && !hitSegment && !hitPolygon && !hitPolygonLabel) {
    if (!additive) {
      clearSelection();
      render();
    }
    state.drag = {
      type: "pan",
      startScreen: screen,
      startPanX: state.panX,
      startPanY: state.panY,
    };
    setStatus("Panning graph...");
    return;
  }

  if (!additive) {
    clearSelection();
  }

  if (hitPoint) {
    if (additive) {
      toggleSelection("points", hitPoint.id);
    } else {
      selectSingle("points", hitPoint.id);
    }

    const movedIds = state.selection.points.size > 0 ? [...state.selection.points] : [hitPoint.id];
    const startPositions = new Map();
    for (const pointId of movedIds) {
      const point = getPointById(pointId);
      if (point) {
        startPositions.set(pointId, { x: point.x, y: point.y });
      }
    }
    state.drag = {
      type: "move-points",
      movedIds,
      anchorWorld: world,
      startPositions,
    };
  } else if (hitText) {
    if (additive) {
      toggleSelection("texts", hitText.id);
    } else {
      selectSingle("texts", hitText.id);
    }
    state.drag = {
      type: "move-text",
      textId: hitText.id,
      anchorWorld: world,
      start: { x: hitText.x, y: hitText.y },
    };
  } else if (hitPolygonLabel) {
    state.drag = {
      type: "move-polygon-label",
      polygonId: hitPolygonLabel.id,
      anchorWorld: world,
      startOffset: { ...(hitPolygonLabel.labelOffset ?? { x: 0, y: 0 }) },
    };
  } else if (hitSegment) {
    if (additive) {
      toggleSelection("segments", hitSegment.id);
    } else {
      selectSingle("segments", hitSegment.id);
    }
  } else if (hitPolygon) {
    if (additive) {
      toggleSelection("polygons", hitPolygon.id);
    } else {
      selectSingle("polygons", hitPolygon.id);
    }
  }

  render();
  setStatus(`Selection updated: ${getSelectionSummary()}`);
}

function handlePointerMove(event) {
  const screen = getScreenPointFromEvent(event);
  const world = screenToWorld(screen);
  state.hoverScreen = screen;
  state.hoverWorld = world;

  if (state.mode === "midpoint") {
    const edgePick = findNearestEdge(world);
    if (edgePick) {
      const a = getPointById(edgePick.edge.aId);
      const b = getPointById(edgePick.edge.bId);
      state.midpointHoverWorld = a && b
        ? { x: (a.x + b.x) * 0.5, y: (a.y + b.y) * 0.5 }
        : null;
    } else {
      state.midpointHoverWorld = null;
    }
  } else {
    state.midpointHoverWorld = null;
  }

  if (!state.drag && state.mode !== "box-select") {
    render();
    return;
  }

  if (state.drag?.type === "pan") {
    const dx = screen.x - state.drag.startScreen.x;
    const dy = screen.y - state.drag.startScreen.y;
    state.panX = state.drag.startPanX + dx;
    state.panY = state.drag.startPanY + dy;
    render();
    return;
  }

  if (state.drag?.type === "move-points") {
    const dxWorld = world.x - state.drag.anchorWorld.x;
    const dyWorld = world.y - state.drag.anchorWorld.y;
    for (const pointId of state.drag.movedIds) {
      const point = getPointById(pointId);
      const start = state.drag.startPositions.get(pointId);
      if (!point || !start) {
        continue;
      }
      point.x = round2(start.x + dxWorld);
      point.y = round2(start.y + dyWorld);
    }
    render();
    return;
  }

  if (state.drag?.type === "move-text") {
    const text = getTextById(state.drag.textId);
    if (text) {
      text.x = round2(state.drag.start.x + (world.x - state.drag.anchorWorld.x));
      text.y = round2(state.drag.start.y + (world.y - state.drag.anchorWorld.y));
      render();
    }
    return;
  }

  if (state.drag?.type === "move-polygon-label") {
    const polygon = getPolygonById(state.drag.polygonId);
    if (polygon) {
      polygon.labelOffset = {
        x: round2(state.drag.startOffset.x + (world.x - state.drag.anchorWorld.x)),
        y: round2(state.drag.startOffset.y + (world.y - state.drag.anchorWorld.y)),
      };
      render();
    }
    return;
  }

  if (state.mode === "box-select" && state.boxSelect) {
    state.boxSelect.current = screen;
    render();
  }
}

function applyBoxSelection() {
  if (!state.boxSelect) {
    return;
  }

  const minX = Math.min(state.boxSelect.start.x, state.boxSelect.current.x);
  const maxX = Math.max(state.boxSelect.start.x, state.boxSelect.current.x);
  const minY = Math.min(state.boxSelect.start.y, state.boxSelect.current.y);
  const maxY = Math.max(state.boxSelect.start.y, state.boxSelect.current.y);

  clearSelection();

  for (const point of state.points) {
    const screen = worldToScreen(point);
    if (screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY) {
      state.selection.points.add(point.id);
    }
  }

  for (const segment of state.segments) {
    const a = getPointById(segment.a);
    const b = getPointById(segment.b);
    if (!a || !b) {
      continue;
    }
    const sa = worldToScreen(a);
    const sb = worldToScreen(b);
    const bothInside =
      sa.x >= minX &&
      sa.x <= maxX &&
      sa.y >= minY &&
      sa.y <= maxY &&
      sb.x >= minX &&
      sb.x <= maxX &&
      sb.y >= minY &&
      sb.y <= maxY;
    if (bothInside) {
      state.selection.segments.add(segment.id);
    }
  }

  for (const text of state.texts) {
    const screen = worldToScreen(text);
    if (screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY) {
      state.selection.texts.add(text.id);
    }
  }

  for (const polygon of state.polygons) {
    const allInside = polygon.pointIds.every((pointId) => {
      const point = getPointById(pointId);
      if (!point) {
        return false;
      }
      const screen = worldToScreen(point);
      return screen.x >= minX && screen.x <= maxX && screen.y >= minY && screen.y <= maxY;
    });

    if (allInside) {
      state.selection.polygons.add(polygon.id);
    }
  }

  setStatus(`Box selection complete: ${getSelectionSummary()}`);
}

function handlePointerUp(event) {
  const wasDragging = Boolean(state.drag);
  if (state.mode === "box-select" && state.boxSelect) {
    applyBoxSelection();
    state.boxSelect = null;
    render();
    return;
  }

  if (state.drag?.type === "move-points" || state.drag?.type === "move-text" || state.drag?.type === "move-polygon-label") {
    pushHistory();
  }

  state.drag = null;

  if (wasDragging) {
    render();
  }

  if (event.pointerType === "touch") {
    state.hoverWorld = null;
    state.hoverScreen = null;
  }
}

function handleWheel(event) {
  event.preventDefault();
  hideContextMenu();

  const screen = getScreenPointFromEvent(event);
  const beforeWorld = screenToWorld(screen);
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  state.scale = clamp(state.scale * factor, 6, 320);

  const rect = getRect();
  state.panX = screen.x - beforeWorld.x * state.scale - rect.width * 0.5;
  state.panY = screen.y + beforeWorld.y * state.scale - rect.height * 0.5;

  render();
}

function zoomBy(factor) {
  const rect = getRect();
  const centerScreen = { x: rect.width * 0.5, y: rect.height * 0.5 };
  const beforeWorld = screenToWorld(centerScreen);
  state.scale = clamp(state.scale * factor, 6, 320);
  state.panX = centerScreen.x - beforeWorld.x * state.scale - rect.width * 0.5;
  state.panY = centerScreen.y + beforeWorld.y * state.scale - rect.height * 0.5;
  render();
}

function resetZoomAndPan() {
  state.scale = 32;
  state.panX = 0;
  state.panY = 0;
  render();
  setStatus("Zoom and pan reset.");
}

function pointsToCoordinateList() {
  const selectedPoints = getOrderedSelectedPoints();
  const points = selectedPoints.length > 0
    ? selectedPoints
    : state.points.slice().sort((a, b) => a.id - b.id);

  if (points.length === 0) {
    return "No points in the current selection.";
  }

  return points.map((point) => `${point.label}, ${round2(point.x)}, ${round2(point.y)}`).join("\n");
}

function showPointListDialog() {
  ui.pointsOutput.value = pointsToCoordinateList();
  ui.pointsDialog.showModal();
}

function hideContextMenu() {
  ui.contextMenu.hidden = true;
}

function showContextMenu(clientX, clientY) {
  ui.contextMenu.hidden = false;
  ui.contextMenu.style.left = `${clientX}px`;
  ui.contextMenu.style.top = `${clientY}px`;
}

function downloadTextFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJson() {
  const payload = {
    format: "fmb-studio",
    exportedAt: new Date().toISOString(),
    data: serializeCoreState(),
  };
  downloadTextFile(
    "fmb-studio-diagram.json",
    JSON.stringify(payload, null, 2),
    "application/json;charset=utf-8"
  );
  setStatus("Diagram exported as JSON.");
}

function getSvgSnapshotMarkup() {
  const svgClone = ui.graph.cloneNode(true);
  svgClone.setAttribute("xmlns", SVG_NS);
  const style = document.createElementNS(SVG_NS, "style");
  style.textContent = `
    text {
      font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
      letter-spacing: 0.01em;
    }
  `;
  svgClone.prepend(style);
  const metadata = document.createElementNS(SVG_NS, "metadata");
  metadata.setAttribute("id", "fmb-state");
  metadata.textContent = JSON.stringify(serializeCoreState());
  svgClone.prepend(metadata);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${svgClone.outerHTML}`;
}

function exportSvg() {
  const markup = getSvgSnapshotMarkup();
  downloadTextFile("fmb-studio-diagram.svg", markup, "image/svg+xml;charset=utf-8");
  setStatus("Diagram exported as SVG.");
}

function importFromText(filename, text) {
  try {
    if (filename.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(text);
      const payload = parsed?.data || parsed;
      if (!payload || !Array.isArray(payload.points)) {
        throw new Error("This JSON file does not match FMB Studio format.");
      }
      applyCoreState(payload);
      pushHistory();
      render();
      setStatus("JSON import complete.");
      return;
    }

    if (filename.toLowerCase().endsWith(".svg")) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, "image/svg+xml");
      const metadata = doc.getElementById("fmb-state");
      if (!metadata || !metadata.textContent) {
        throw new Error("SVG metadata was not found.");
      }

      const payload = JSON.parse(metadata.textContent);
      applyCoreState(payload);
      pushHistory();
      render();
      setStatus("SVG import complete.");
      return;
    }

    throw new Error("Unsupported file type. Use JSON or SVG.");
  } catch (error) {
    setStatus(`Import failed: ${error instanceof Error ? error.message : "Invalid file"}`);
  }
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    await importFromText(file.name, text);
    ui.importFile.value = "";
  };
  reader.readAsText(file);
}

function initializeDemoGeometry() {
  const p1 = addPoint(-8, -4, { label: "A" });
  const p2 = addPoint(6, -2, { label: "B" });
  const p3 = addPoint(9, 7, { label: "C" });
  const p4 = addPoint(-5, 9, { label: "D" });
  addPolygon([p1.id, p2.id, p3.id, p4.id]);
  addSegment(p1.id, p3.id, "segment");
  addText({ x: 1, y: 2 }, "Title Goes Here", 18);
}

function handleKeyDown(event) {
  if (event.key === "Escape") {
    if (isInlineEditorOpen()) {
      closeInlineTextEditor(false, true);
      return;
    }
    setMode("select");
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
    return;
  }

  if (
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") ||
    ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")
  ) {
    event.preventDefault();
    redo();
    return;
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      return;
    }
    event.preventDefault();
    removeSelectedObjects();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    if (document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      return;
    }
    event.preventDefault();
    state.selection.points = new Set(state.points.map((point) => point.id));
    state.selection.segments = new Set(state.segments.map((segment) => segment.id));
    state.selection.polygons = new Set(state.polygons.map((polygon) => polygon.id));
    state.selection.texts = new Set(state.texts.map((text) => text.id));
    render();
    setStatus(`Selected all: ${getSelectionSummary()}`);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "<" || event.key === ">")) {
    if (state.selection.texts.size === 0) {
      return;
    }
    event.preventDefault();
    const delta = event.key === ">" ? 2 : -2;
    for (const textId of state.selection.texts) {
      const text = getTextById(textId);
      if (text) {
        text.size = clamp(text.size + delta, 10, 80);
      }
    }
    pushHistory();
    render();
    setStatus(`Text size adjusted.`);
    return;
  }

  const modeShortcuts = {
    "1": "select",
    "2": "box-select",
    "3": "point",
    "4": "midpoint",
    "5": "segment",
    "6": "parallel",
    "7": "perpendicular",
    "8": "polygon",
    "9": "text",
    "0": "angle",
  };

  if (!event.ctrlKey && !event.metaKey && modeShortcuts[event.key]) {
    setMode(modeShortcuts[event.key]);
    return;
  }

  const step = event.shiftKey ? 1 : event.altKey ? 0.01 : 0.2;
  const selectedPointIds = getSelectedPointIds();
  if (
    state.mode === "select" &&
    ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) &&
    (selectedPointIds.size > 0 || state.selection.texts.size > 0)
  ) {
    event.preventDefault();
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
    for (const pointId of selectedPointIds) {
      movePoint(pointId, dx, dy);
    }
    for (const textId of state.selection.texts) {
      const text = getTextById(textId);
      if (!text) {
        continue;
      }
      text.x = round2(text.x + dx);
      text.y = round2(text.y + dy);
    }
    pushHistory();
    render();
  }
}

function handleDoubleClick(event) {
  const screen = getScreenPointFromEvent(event);
  const hitText = hitTestText(screen);
  if (!hitText) {
    return;
  }

  openInlineTextEditor(screen, {
    textId: hitText.id,
    world: { x: hitText.x, y: hitText.y },
    initialValue: hitText.content,
  });
  setStatus("Editing text. Press Enter to save.");
}

function wireEvents() {
  for (const button of ui.modeButtons) {
    button.addEventListener("click", () => setMode(button.dataset.mode || "select"));
  }

  for (const group of ui.modeSelectGroups) {
    group.addEventListener("click", (event) => {
      // Let direct select interactions be handled by the native dropdown and change handler.
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLOptionElement) {
        return;
      }
      const select = group.querySelector(".tool-select");
      if (!(select instanceof HTMLSelectElement)) {
        return;
      }
      if (MODES.includes(select.value)) {
        setMode(select.value);
      }
    });
  }

  for (const select of ui.modeSelects) {
    select.addEventListener("change", () => {
      setMode(select.value || "select");
    });
  }

  ui.mobileMenuToggle.addEventListener("click", () => {
    const nextOpen = !ui.toolMenu.classList.contains("open");
    ui.toolMenu.classList.toggle("open", nextOpen);
    ui.mobileMenuToggle.setAttribute("aria-expanded", String(nextOpen));
  });

  ui.undoBtn.addEventListener("click", undo);
  ui.redoBtn.addEventListener("click", redo);
  ui.zoomInBtn.addEventListener("click", () => zoomBy(1.15));
  ui.zoomOutBtn.addEventListener("click", () => zoomBy(1 / 1.15));
  ui.zoomResetBtn.addEventListener("click", resetZoomAndPan);
  ui.exportJsonBtn.addEventListener("click", exportJson);
  ui.exportSvgBtn.addEventListener("click", exportSvg);
  ui.importBtn.addEventListener("click", () => ui.importFile.click());
  ui.themeToggleBtn.addEventListener("click", toggleTheme);
  ui.importFile.addEventListener("change", handleImport);

  ui.settingsBtn.addEventListener("click", () => {
    ui.settingsPanel.hidden = !ui.settingsPanel.hidden;
  });
  ui.closeSettingsBtn.addEventListener("click", () => {
    ui.settingsPanel.hidden = true;
  });
  ui.snapToggle.addEventListener("change", () => {
    state.snapToPoints = ui.snapToggle.checked;
    saveDisplaySettings();
    setStatus(state.snapToPoints ? "Snap enabled." : "Snap disabled.");
  });

  ui.showPointsToggle.addEventListener("change", (event) => updateDisplaySetting("showPoints", event.target.checked));
  ui.showLabelsToggle.addEventListener("change", (event) => updateDisplaySetting("showLabels", event.target.checked));
  ui.showSegmentsToggle.addEventListener("change", (event) => updateDisplaySetting("showSegments", event.target.checked));
  ui.showSegmentLengthsToggle.addEventListener("change", (event) => updateDisplaySetting("showSegmentLengths", event.target.checked));
  ui.showTextToggle.addEventListener("change", (event) => updateDisplaySetting("showText", event.target.checked));
  ui.showPolygonsToggle.addEventListener("change", (event) => updateDisplaySetting("showPolygons", event.target.checked));
  ui.showAnglesToggle.addEventListener("change", (event) => updateDisplaySetting("showAngles", event.target.checked));
  ui.showMajorGridToggle.addEventListener("change", (event) => updateDisplaySetting("showMajorGrid", event.target.checked));
  ui.showMinorGridToggle.addEventListener("change", (event) => updateDisplaySetting("showMinorGrid", event.target.checked));
  ui.showGridValuesToggle.addEventListener("change", (event) => updateDisplaySetting("showGridValues", event.target.checked));

  ui.graph.addEventListener("pointerdown", handlePointerDown);
  ui.graph.addEventListener("pointermove", handlePointerMove);
  ui.graph.addEventListener("pointerup", handlePointerUp);
  ui.graph.addEventListener("dblclick", handleDoubleClick);
  ui.graph.addEventListener("pointerleave", () => {
    if (!state.drag) {
      state.hoverWorld = null;
      state.hoverScreen = null;
      state.midpointHoverWorld = null;
      render();
    }
  });
  ui.graph.addEventListener("wheel", handleWheel, { passive: false });

  ui.graph.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showContextMenu(event.clientX, event.clientY);
  });

  ui.viewPointsBtn.addEventListener("click", () => {
    hideContextMenu();
    showPointListDialog();
  });
  ui.joinPointsBtn.addEventListener("click", () => {
    hideContextMenu();
    joinSelectedPoints();
  });

  ui.copyPointsBtn.addEventListener("click", async () => {
    ui.pointsOutput.select();
    try {
      await navigator.clipboard.writeText(ui.pointsOutput.value);
      setStatus("Coordinates copied.");
    } catch {
      document.execCommand("copy");
      setStatus("Coordinates copied.");
    }
  });

  globalThis.addEventListener("click", (event) => {
    if (event.target !== ui.contextMenu && !ui.contextMenu.contains(event.target)) {
      hideContextMenu();
    }
  });

  globalThis.addEventListener("keydown", handleKeyDown);
  globalThis.addEventListener("resize", render);

  let _printStyle = null;
  globalThis.addEventListener("beforeprint", () => {
    const rect = ui.graph.getBoundingClientRect();
    // A4 at 96 dpi: 794 × 1122 px (portrait) or 1122 × 794 px (landscape)
    const landscape = rect.width >= rect.height;
    const w = landscape ? 1122 : 794;
    const h = landscape ? 794 : 1122;
    ui.graph.setAttribute("width", w);
    ui.graph.setAttribute("height", h);
    _printStyle = document.createElement("style");
    _printStyle.textContent = `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 0; }`;
    document.head.appendChild(_printStyle);
  });
  globalThis.addEventListener("afterprint", () => {
    ui.graph.removeAttribute("width");
    ui.graph.removeAttribute("height");
    _printStyle?.remove();
    _printStyle = null;
  });

  ui.inlineTextEditor.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      closeInlineTextEditor(true, state.mode === "text");
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeInlineTextEditor(false, true);
    }
  });
  ui.inlineTextEditor.addEventListener("blur", () => {
    closeInlineTextEditor(true, false);
  });
}

function bootstrap() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === "dark" ? "dark" : "light");
  loadDisplaySettings();
  syncDisplayControlsToState();
  ui.versionBadge.textContent = `v${VERSION}`;
  initializeDemoGeometry();
  wireEvents();
  setMode("select");
  pushHistory();
  render();
  setStatus("Ready. Right click the graph for coordinate tools. Shortcuts: 1-9, 0 tools, Ctrl+Z, Ctrl+Y.");
}

bootstrap();
