import {
  clamp,
  round2,
  round3,
  distanceWorld,
  distanceScreen,
  areaConversions,
  projectPointToSegment,
  distancePointToSegmentScreen,
  normalizeAngleRadians,
  angleCandidateKey,
} from "./geometry.js";
import {
  parseCoordinatesText,
  normalizeCoordinateLoop,
} from "./coordinates.js";
import "./vendor/polygon-clipping.umd.js";
import * as core from "./core.js";
import { queryUi } from "./dom.js";
import * as history from "./history.js";

const VERSION = "2.16.5";
const SVG_NS = "http://www.w3.org/2000/svg";
const THEME_STORAGE_KEY = "fmb-theme";
const DISPLAY_SETTINGS_STORAGE_KEY = "fmb-display-settings";
const AUTOSAVE_STORAGE_KEY = "fmb-autosave-draft";
const MIN_SCALE = 0.01;
const MAX_SCALE = 320;
const BACKGROUND_IMAGE_SRC_PATTERN = /^data:image\/(png|jpeg|jpg|gif|webp|bmp);base64,[a-z0-9+/=\s]+$/i;
const BACKGROUND_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
const LINE_STYLE_DASHES = {
  solid: null,
  dashed: "8 6",
  dotted: "2 6",
};

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

const state = core.createState();

// Populated from the DOM in bootstrap() so importing this module does no DOM work.
const ui = {};
let disposeWiredEvents = null;
let pendingRenderFrame = 0;
let renderQueued = false;
let cachedGridKey = "";
let cachedGridLayer = null;
let historyActions = [];
let lastAutosaveSnapshot = "";
let contextMenuEdgePick = null;
let contextMenuVertexPointId = null;
let contextMenuTextId = null;
let suppressGraphContextMenuOpen = false;
let lastViewportAspect = 1;
const perfCounters = {
  renderNowCalls: 0,
  gridCacheHits: 0,
  gridCacheMisses: 0,
};

function resetPerfCounters() {
  perfCounters.renderNowCalls = 0;
  perfCounters.gridCacheHits = 0;
  perfCounters.gridCacheMisses = 0;
}

function getPerfCounters() {
  return {
    renderNowCalls: perfCounters.renderNowCalls,
    gridCacheHits: perfCounters.gridCacheHits,
    gridCacheMisses: perfCounters.gridCacheMisses,
  };
}

function exposePerfCounters() {
  if (typeof globalThis === "undefined") {
    return;
  }
  globalThis.__fmbPerf = {
    reset: resetPerfCounters,
    get: getPerfCounters,
  };
}

function getCssVar(name, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return raw || fallback;
}

function polygonPerimeter(pointIds) {
  return core.polygonPerimeter(state, pointIds);
}

function clearAutosaveDraft() {
  try {
    localStorage.removeItem(AUTOSAVE_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  lastAutosaveSnapshot = "";
}

function persistAutosaveNow() {
  try {
    const snapshot = serializeCoreState();
    const serializedSnapshot = JSON.stringify(snapshot);
    if (serializedSnapshot === lastAutosaveSnapshot) {
      return false;
    }
    localStorage.setItem(
      AUTOSAVE_STORAGE_KEY,
      JSON.stringify({
        version: VERSION,
        savedAt: new Date().toISOString(),
        data: snapshot,
      })
    );
    lastAutosaveSnapshot = serializedSnapshot;
    return true;
  } catch {
    return false;
  }
}

function restoreAutosaveDraft() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_STORAGE_KEY);
    if (!raw) {
      return false;
    }
    const parsed = JSON.parse(raw);
    const payload = parsed && typeof parsed === "object" && parsed.data ? parsed.data : null;
    if (!payload || typeof payload !== "object") {
      clearAutosaveDraft();
      return false;
    }
    applyCoreState(payload);
    lastAutosaveSnapshot = JSON.stringify(serializeCoreState());
    return true;
  } catch {
    clearAutosaveDraft();
    return false;
  }
}

function saveDisplaySettings() {
  localStorage.setItem(
    DISPLAY_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...state.display,
      snapToPoints: state.snapToPoints,
      snapToGrid: state.snapToGrid,
      snapToMidpoints: state.snapToMidpoints,
      snapToIntersections: state.snapToIntersections,
      snapAngleStep: state.snapAngleStep,
      snapAngleStepDegrees: state.snapAngleStepDegrees,
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
    if (typeof parsed.snapToGrid === "boolean") {
      state.snapToGrid = parsed.snapToGrid;
    }
    if (typeof parsed.snapToMidpoints === "boolean") {
      state.snapToMidpoints = parsed.snapToMidpoints;
    }
    if (typeof parsed.snapToIntersections === "boolean") {
      state.snapToIntersections = parsed.snapToIntersections;
    }
    if (typeof parsed.snapAngleStep === "boolean") {
      state.snapAngleStep = parsed.snapAngleStep;
    }
    if (Number.isFinite(Number(parsed.snapAngleStepDegrees))) {
      state.snapAngleStepDegrees = clamp(Math.round(Number(parsed.snapAngleStepDegrees)), 1, 180);
    }
  } catch {
    // Ignore corrupt local values and keep defaults.
  }
}

function syncDisplayControlsToState() {
  ui.snapToggle.checked = state.snapToPoints;
  ui.snapGridToggle.checked = state.snapToGrid;
  ui.snapMidpointToggle.checked = state.snapToMidpoints;
  ui.snapIntersectionToggle.checked = state.snapToIntersections;
  ui.snapAngleStepToggle.checked = state.snapAngleStep;
  ui.snapAngleStepDegreesInput.value = String(state.snapAngleStepDegrees);
  ui.snapAngleStepDegreesInput.disabled = !state.snapAngleStep;
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
  syncBackgroundImageControls();
}

function updateDisplaySetting(key, value) {
  if (!(key in state.display)) {
    return;
  }
  state.display[key] = Boolean(value);
  saveDisplaySettings();
  render();
}

function resetDisplaySettings() {
  state.snapToPoints = true;
  state.snapToGrid = false;
  state.snapToMidpoints = false;
  state.snapToIntersections = false;
  state.snapAngleStep = false;
  state.snapAngleStepDegrees = 15;
  for (const key of Object.keys(state.display)) {
    state.display[key] = true;
  }
  syncDisplayControlsToState();
  saveDisplaySettings();
  render();
  setStatus("Display settings reset.", "success");
}

function createId() {
  return core.createId(state);
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

function getPointById(pointId) {
  return core.getPointById(state, pointId);
}

function getSegmentById(segmentId) {
  return core.getSegmentById(state, segmentId);
}

function getPolygonById(polygonId) {
  return core.getPolygonById(state, polygonId);
}

function getTextById(textId) {
  return core.getTextById(state, textId);
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
  const selectedIds = getSelectedPointIds();
  return state.points.filter((point) => selectedIds.has(point.id));
}

function getCoordinateEditorPoints() {
  if (state.selection.polygons.size === 1) {
    const polygonId = [...state.selection.polygons][0];
    const polygon = getPolygonById(polygonId);
    if (polygon) {
      return polygon.pointIds
        .map((pointId) => getPointById(pointId))
        .filter(Boolean);
    }
  }

  const selectedPoints = getOrderedSelectedPoints();
  return selectedPoints.length > 0 ? selectedPoints : state.points;
}

function serializeCoreState() {
  return core.serializeCoreState(state, VERSION);
}

function applyCoreState(serialized) {
  if (!serialized || typeof serialized !== "object") {
    throw new Error("This file does not contain a diagram state.");
  }

  const readFiniteNumber = (value, field) => {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      throw new Error(`Invalid ${field} in diagram data.`);
    }
    return number;
  };
  const readEntityId = (value, field, ids) => {
    const id = readFiniteNumber(value, field);
    if (!Number.isInteger(id) || id < 1 || ids.has(id)) {
      throw new Error(`Invalid or duplicate ${field} in diagram data.`);
    }
    ids.add(id);
    return id;
  };

  const ids = new Set();
  const points = Array.isArray(serialized.points)
    ? serialized.points.map((point) => ({
        id: readEntityId(point.id, "point ID", ids),
        x: readFiniteNumber(point.x, "point x coordinate"),
        y: readFiniteNumber(point.y, "point y coordinate"),
      }))
    : [];
  const segments = Array.isArray(serialized.segments)
    ? serialized.segments.map((segment) => ({
        id: readEntityId(segment.id, "segment ID", ids),
        a: Number(segment.a),
        b: Number(segment.b),
        kind: String(segment.kind || "segment"),
        lineStyle: Object.hasOwn(LINE_STYLE_DASHES, segment.lineStyle) ? segment.lineStyle : "solid",
      }))
    : [];
  const polygons = Array.isArray(serialized.polygons)
    ? serialized.polygons.map((polygon) => ({
        id: readEntityId(polygon.id, "polygon ID", ids),
        pointIds: Array.isArray(polygon.pointIds) ? polygon.pointIds.map((id) => Number(id)) : [],
        labelOffset: polygon.labelOffset
          ? {
              x: readFiniteNumber(polygon.labelOffset.x, "polygon label x offset"),
              y: readFiniteNumber(polygon.labelOffset.y, "polygon label y offset"),
            }
          : { x: 0, y: 0 },
      }))
    : [];
  const texts = Array.isArray(serialized.texts)
    ? serialized.texts.map((text) => ({
        id: readEntityId(text.id, "text ID", ids),
        x: readFiniteNumber(text.x, "text x coordinate"),
        y: readFiniteNumber(text.y, "text y coordinate"),
        content: String(text.content || "Text"),
        size: clamp(Number(text.size) || 14, 10, 80),
      }))
    : [];
  const angleAnnotations = Array.isArray(serialized.angleAnnotations)
    ? serialized.angleAnnotations.map((item) => ({
        id: readEntityId(item.id, "angle annotation ID", ids),
        vertexId: Number(item.vertexId),
        aId: Number(item.aId),
        bId: Number(item.bId),
      }))
    : [];
  const constraints = Array.isArray(serialized.constraints)
    ? serialized.constraints
        .map((constraint) => {
          if (!constraint || typeof constraint !== "object") {
            return null;
          }
          if (constraint.type === "point-lock") {
            return {
              id: readEntityId(constraint.id, "constraint ID", ids),
              type: "point-lock",
              pointId: Number(constraint.pointId),
            };
          }
          return null;
        })
        .filter(Boolean)
    : [];

  const maxExistingId = ids.size > 0 ? Math.max(...ids) : 0;
  const savedNextId =
    Number.isInteger(Number(serialized.nextId)) && Number(serialized.nextId) > 0
      ? Number(serialized.nextId)
      : 1;
  state.nextId = Math.max(maxExistingId + 1, savedNextId);
  state.scale = Number(serialized.scale) || 32;
  state.panX = Number(serialized.panX) || 0;
  state.panY = Number(serialized.panY) || 0;
  state.points = points;
  state.segments = segments;
  state.polygons = polygons;
  state.texts = texts;
  state.angleAnnotations = angleAnnotations;
  state.constraints = constraints;
  state.backgroundImage = sanitizeBackgroundImage(serialized.backgroundImage);
  syncBackgroundImageControls();

  normalizeGeometry();
  clearSelection();
  state.drag = null;
  state.boxSelect = null;
  state.polygonDraft = [];
  state.polygonDraftCreatedPointIds.clear();
  state.midpointHoverWorld = null;
  state.construction = null;
  closeInlineTextEditor(false, false);
}

function pushHistory(action = "Change diagram") {
  const snapshot = JSON.stringify(serializeCoreState());
  const result = history.pushSnapshot(state.history, state.historyIndex, snapshot);
  if (!result.changed) {
    return;
  }

  const nextActions = historyActions.slice(0, state.historyIndex + 1);
  nextActions.push(action);
  while (nextActions.length > result.history.length) {
    nextActions.shift();
  }
  historyActions = nextActions;
  state.history = result.history;
  state.historyIndex = result.historyIndex;
  updateUndoRedoButtons();
  persistAutosaveNow();
}

function undo() {
  if (!history.canUndo(state.historyIndex)) {
    setStatus("Nothing to undo.", "warning");
    return;
  }

  const action = historyActions[state.historyIndex] || "change";
  state.historyIndex = history.undoIndex(state.historyIndex);
  applyCoreState(JSON.parse(state.history[state.historyIndex]));
  updateUndoRedoButtons();
  render();
  setStatus(`Undid: ${action}.`, "success");
}

function redo() {
  if (!history.canRedo(state.history, state.historyIndex)) {
    setStatus("Nothing to redo.", "warning");
    return;
  }

  state.historyIndex = history.redoIndex(state.history, state.historyIndex);
  const action = historyActions[state.historyIndex] || "change";
  applyCoreState(JSON.parse(state.history[state.historyIndex]));
  updateUndoRedoButtons();
  render();
  setStatus(`Redid: ${action}.`, "success");
}

function updateUndoRedoButtons() {
  ui.undoBtn.disabled = !history.canUndo(state.historyIndex);
  ui.redoBtn.disabled = !history.canRedo(state.history, state.historyIndex);
  const undoAction = historyActions[state.historyIndex] || "change";
  const redoAction = historyActions[state.historyIndex + 1] || "change";
  ui.undoBtn.title = ui.undoBtn.disabled ? "Nothing to undo" : `Undo ${undoAction} (Ctrl+Z)`;
  ui.redoBtn.title = ui.redoBtn.disabled ? "Nothing to redo" : `Redo ${redoAction} (Ctrl+Y)`;
}

function setStatus(message, tone = "info") {
  ui.status.textContent = message;
  ui.status.dataset.tone = tone;
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
    let changedText = false;
    if (payload.textId) {
      const target = getTextById(payload.textId);
      if (target && value) {
        target.content = value;
        changedText = true;
        pushHistory("Edit text");
      }
    } else if (value) {
      addText(payload.world, value);
      changedText = true;
      pushHistory("Add text");
    }
    if (changedText && !state.display.showText) {
      state.display.showText = true;
      saveDisplaySettings();
      syncDisplayControlsToState();
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
    setStatus("Select at least two points to join.", "warning");
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
    setStatus("No new joins were created.", "warning");
    return;
  }

  pushHistory("Join selected points");
  render();
  setStatus(`Created ${createdCount} join(s).`, "success");
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

function getGridSnapPoint(worldPoint) {
  if (!state.snapToGrid) {
    return null;
  }
  const majorStep = chooseGridMajorStep();
  const step = majorStep / 5;
  if (!Number.isFinite(step) || step <= 0) {
    return null;
  }
  return {
    x: round2(Math.round(worldPoint.x / step) * step),
    y: round2(Math.round(worldPoint.y / step) * step),
  };
}

function segmentIntersectionWorld(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const denom = r.x * s.y - r.y * s.x;
  if (Math.abs(denom) < 1e-9) {
    return null;
  }

  const ac = { x: c.x - a.x, y: c.y - a.y };
  const t = (ac.x * s.y - ac.y * s.x) / denom;
  const u = (ac.x * r.y - ac.y * r.x) / denom;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) {
    return null;
  }

  return {
    x: a.x + t * r.x,
    y: a.y + t * r.y,
  };
}

function getMidpointSnapPoint(worldPoint, maxDistancePx = 14) {
  if (!state.snapToMidpoints) {
    return null;
  }

  const targetScreen = worldToScreen(worldPoint);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const edge of getAllEdges()) {
    const a = getPointById(edge.aId);
    const b = getPointById(edge.bId);
    if (!a || !b) {
      continue;
    }
    const midpoint = {
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
    };
    const distance = distanceScreen(targetScreen, worldToScreen(midpoint));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = midpoint;
    }
  }

  return bestDistance <= maxDistancePx ? best : null;
}

function getIntersectionSnapPoint(worldPoint, maxDistancePx = 14) {
  if (!state.snapToIntersections) {
    return null;
  }

  const targetScreen = worldToScreen(worldPoint);
  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  const edges = getAllEdges();

  for (let i = 0; i < edges.length; i += 1) {
    const a1 = getPointById(edges[i].aId);
    const b1 = getPointById(edges[i].bId);
    if (!a1 || !b1) {
      continue;
    }

    for (let j = i + 1; j < edges.length; j += 1) {
      const a2 = getPointById(edges[j].aId);
      const b2 = getPointById(edges[j].bId);
      if (!a2 || !b2) {
        continue;
      }

      const intersection = segmentIntersectionWorld(a1, b1, a2, b2);
      if (!intersection) {
        continue;
      }

      const distance = distanceScreen(targetScreen, worldToScreen(intersection));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = intersection;
      }
    }
  }

  return bestDistance <= maxDistancePx ? best : null;
}

function getSnappedWorldPoint(worldPoint) {
  const pointSnap = getSnapPoint(worldPoint);
  if (pointSnap) {
    return { x: pointSnap.x, y: pointSnap.y, source: "point", point: pointSnap };
  }

  const intersectionSnap = getIntersectionSnapPoint(worldPoint);
  if (intersectionSnap) {
    return { x: intersectionSnap.x, y: intersectionSnap.y, source: "intersection" };
  }

  const midpointSnap = getMidpointSnapPoint(worldPoint);
  if (midpointSnap) {
    return { x: midpointSnap.x, y: midpointSnap.y, source: "midpoint" };
  }

  const gridSnap = getGridSnapPoint(worldPoint);
  if (gridSnap) {
    return { x: gridSnap.x, y: gridSnap.y, source: "grid" };
  }

  return { x: worldPoint.x, y: worldPoint.y, source: "none" };
}

function applyAngleStepSnap(baseWorld, targetWorld) {
  if (!state.snapAngleStep) {
    return targetWorld;
  }

  const stepDeg = clamp(Math.round(Number(state.snapAngleStepDegrees) || 15), 1, 180);
  const step = (stepDeg * Math.PI) / 180;
  const dx = targetWorld.x - baseWorld.x;
  const dy = targetWorld.y - baseWorld.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 1e-9) {
    return targetWorld;
  }

  const snappedAngle = Math.round(Math.atan2(dy, dx) / step) * step;
  return {
    x: round2(baseWorld.x + Math.cos(snappedAngle) * distance),
    y: round2(baseWorld.y + Math.sin(snappedAngle) * distance),
  };
}

function addPoint(x, y) {
  return core.addPoint(state, x, y);
}

function addSegment(a, b, kind = "segment") {
  return core.addSegment(state, a, b, kind);
}

function isSegmentInsidePolygon(aId, bId) {
  return core.isSegmentInsidePolygon(state, aId, bId);
}

function addPolygon(pointIds) {
  return core.addPolygon(state, pointIds);
}

function addText(world, content, size = 16) {
  return core.addText(state, world, content, size);
}

function normalizeGeometry() {
  return core.normalizeGeometry(state);
}

function getAllEdges() {
  return core.getAllEdges(state);
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

function findNearestPolygonEdge(worldPoint, polygonId, maxDistancePx = 12) {
  let nearest = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const edge of getAllEdges()) {
    if (edge.edgeType !== "polygon-edge" || edge.polygonId !== polygonId) {
      continue;
    }
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
  return core.polygonArea(state, pointIds);
}

function removePoint(pointId) {
  return core.removePoint(state, pointId);
}

function syncNextIdWithState() {
  const ids = [
    ...state.points,
    ...state.segments,
    ...state.polygons,
    ...state.texts,
    ...state.angleAnnotations,
    ...state.constraints,
  ]
    .map((item) => item.id)
    .filter((id) => Number.isInteger(id) && id > 0);
  state.nextId = Math.max(1, ...ids, 0) + 1;
}

function cancelPolygonDraft() {
  const releasedPointIds = [...state.polygonDraftCreatedPointIds];
  for (const pointId of state.polygonDraftCreatedPointIds) {
    removePoint(pointId);
  }
  const firstReleasedId = Math.min(...releasedPointIds);
  const hasNewerObject = [
    ...state.points,
    ...state.segments,
    ...state.polygons,
    ...state.texts,
    ...state.angleAnnotations,
  ].some((item) => item.id >= firstReleasedId);
  if (Number.isFinite(firstReleasedId) && !hasNewerObject) {
    state.nextId = firstReleasedId;
  }
  state.polygonDraft = [];
  state.polygonDraftCreatedPointIds.clear();
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
  syncNextIdWithState();
  pushHistory("Delete selection");
  render();
  setStatus("Selection deleted.", "success");
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
  if (!state.display.showLabels || !state.display.showPolygons) {
    return null;
  }
  // Matches rendered label block: title at origin.y−64, up to 6 metric lines ending near origin.y+29.
  const HIT_HALF_W = 84;
  const HIT_TOP    = -68;
  const HIT_BOTTOM =  38;
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
    if (
      screen.x >= origin.x - HIT_HALF_W &&
      screen.x <= origin.x + HIT_HALF_W &&
      screen.y >= origin.y + HIT_TOP &&
      screen.y <= origin.y + HIT_BOTTOM
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

function resolvePointerTarget(screen) {
  const point = hitTestPoint(screen);
  if (point) {
    return { kind: "point", item: point };
  }
  const text = hitTestText(screen);
  if (text) {
    return { kind: "text", item: text };
  }
  const segment = hitTestSegment(screen);
  if (segment) {
    return { kind: "segment", item: segment };
  }
  const polygonLabel = hitTestPolygonLabel(screen);
  if (polygonLabel) {
    return { kind: "polygon-label", item: polygonLabel };
  }
  const polygon = hitTestPolygon(screen);
  return polygon ? { kind: "polygon", item: polygon } : null;
}

function pointConnections() {
  return core.pointConnections(state);
}

function getAngleCandidates() {
  return core.getAngleCandidates(state);
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
  cancelPolygonDraft();
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

  if (globalThis.matchMedia("(max-width: 1024px)").matches) {
    ui.toolMenu.classList.remove("open");
    ui.mobileMenuToggle.setAttribute("aria-expanded", "false");
  }

  if (mode === "select") {
    setStatus("Select mode: click to select and drag. Delete removes selected objects.");
  } else if (mode === "polygon") {
    setStatus("Polygon mode: click to place vertices, Enter for numeric edge input, click the first vertex or Ctrl/Cmd+click to close.");
  } else if (mode === "angle") {
    setStatus("Angle mode: click a highlighted angle to keep it as annotation.");
  } else if (mode === "midpoint") {
    setStatus("Mid Point mode: click an existing line to insert a point on it.");
  } else if (mode === "segment") {
    setStatus("Segment mode: click two points or press Enter after first click for numeric length/angle input.");
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
  const theme = document.documentElement.getAttribute("data-theme") || "light";

  const gridKey = [
    `${Math.round(rect.width)}x${Math.round(rect.height)}`,
    state.scale.toFixed(6),
    state.panX.toFixed(4),
    state.panY.toFixed(4),
    majorStep.toPrecision(8),
    state.display.showMajorGrid ? "1" : "0",
    state.display.showMinorGrid ? "1" : "0",
    state.display.showGridValues ? "1" : "0",
    minorColor,
    majorColor,
    axisColor,
    theme,
  ].join("|");

  if (cachedGridLayer && cachedGridKey === gridKey) {
    perfCounters.gridCacheHits += 1;
    parentGroup.append(cachedGridLayer.cloneNode(true));
    return;
  }
  perfCounters.gridCacheMisses += 1;

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
        class: "grid-value-text",
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
        class: "grid-value-text",
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

  const layer = document.createElementNS(SVG_NS, "g");
  layer.append(gridGroup, majorGroup, axesGroup, valuesGroup);
  cachedGridLayer = layer;
  cachedGridKey = gridKey;
  parentGroup.append(layer.cloneNode(true));
}

// Only inline base64 raster data URLs are accepted so imported files cannot pull in
// remote or script-bearing resources through the background layer.
function sanitizeBackgroundImage(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const src = String(value.src || "");
  if (!BACKGROUND_IMAGE_SRC_PATTERN.test(src)) {
    return null;
  }
  const x = Number(value.x);
  const y = Number(value.y);
  const width = Number(value.width);
  const height = Number(value.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  const opacity = Number(value.opacity);
  return {
    src,
    x: round3(x),
    y: round3(y),
    width: round3(width),
    height: round3(height),
    opacity: Number.isFinite(opacity) ? clamp(opacity, 0.05, 1) : 0.6,
  };
}

function computeBackgroundImagePlacement(aspectRatio) {
  const rect = getRect();
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;
  const maxWidth = (rect.width / state.scale) * 0.9;
  const maxHeight = (rect.height / state.scale) * 0.9;
  let width = maxWidth;
  let height = width / safeAspect;
  if (height > maxHeight) {
    height = maxHeight;
    width = height * safeAspect;
  }
  const center = screenToWorld({ x: rect.width * 0.5, y: rect.height * 0.5 });
  return {
    x: round3(center.x - width * 0.5),
    y: round3(center.y + height * 0.5),
    width: round3(width),
    height: round3(height),
  };
}

function syncBackgroundImageControls() {
  const image = state.backgroundImage;
  const hasImage = Boolean(image);
  if (ui.showBackgroundImageToggle) {
    ui.showBackgroundImageToggle.checked = state.display.showBackgroundImage;
    ui.showBackgroundImageToggle.disabled = !hasImage;
  }
  for (const control of [ui.backgroundImageFitBtn, ui.backgroundImageRemoveBtn, ui.backgroundImageOpacity]) {
    if (control) {
      control.disabled = !hasImage;
    }
  }
  if (ui.backgroundImageOpacity && hasImage) {
    ui.backgroundImageOpacity.value = String(Math.round(image.opacity * 100));
  }
  const placementInputs = [
    [ui.backgroundImageX, image?.x],
    [ui.backgroundImageY, image?.y],
    [ui.backgroundImageWidth, image?.width],
  ];
  for (const [input, value] of placementInputs) {
    if (!input) {
      continue;
    }
    input.disabled = !hasImage;
    input.value = hasImage ? String(value) : "";
  }
}

function loadBackgroundImageFile(file) {
  if (!file) {
    return;
  }
  if (file.size > BACKGROUND_IMAGE_MAX_BYTES) {
    setStatus("Background image is too large (8 MB maximum).", "error");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("error", () => setStatus("Background image could not be read.", "error"));
  reader.addEventListener("load", () => {
    const src = String(reader.result || "");
    if (!BACKGROUND_IMAGE_SRC_PATTERN.test(src)) {
      setStatus("Unsupported image type. Use PNG, JPEG, GIF, WEBP, or BMP.", "error");
      return;
    }

    const probe = new Image();
    probe.addEventListener("error", () => setStatus("Background image could not be decoded.", "error"));
    probe.addEventListener("load", () => {
      const placement = computeBackgroundImagePlacement(probe.naturalWidth / probe.naturalHeight);
      state.backgroundImage = {
        src,
        ...placement,
        opacity: state.backgroundImage?.opacity ?? 0.6,
      };
      state.display.showBackgroundImage = true;
      saveDisplaySettings();
      syncBackgroundImageControls();
      pushHistory("Add background image");
      render();
      setStatus("Background image added. Use Fit to view or the X/Y/Width fields to align it.", "success");
    });
    probe.src = src;
  });
  reader.readAsDataURL(file);
}

function updateBackgroundImagePlacement(patch, action) {
  if (!state.backgroundImage) {
    return;
  }
  state.backgroundImage = { ...state.backgroundImage, ...patch };
  syncBackgroundImageControls();
  pushHistory(action);
  render();
}

function removeBackgroundImage() {
  if (!state.backgroundImage) {
    return;
  }
  state.backgroundImage = null;
  syncBackgroundImageControls();
  pushHistory("Remove background image");
  render();
  setStatus("Background image removed.");
}

function drawBackgroundImage(parentGroup) {
  const image = state.backgroundImage;
  if (!image || !state.display.showBackgroundImage) {
    return;
  }
  const topLeft = worldToScreen({ x: image.x, y: image.y });
  const element = document.createElementNS(SVG_NS, "image");
  element.setAttribute("href", image.src);
  element.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", image.src);
  element.setAttribute("x", String(topLeft.x));
  element.setAttribute("y", String(topLeft.y));
  element.setAttribute("width", String(image.width * state.scale));
  element.setAttribute("height", String(image.height * state.scale));
  element.setAttribute("opacity", String(image.opacity));
  element.setAttribute("preserveAspectRatio", "none");
  element.setAttribute("pointer-events", "none");
  element.setAttribute("class", "background-image-layer");
  parentGroup.append(element);
}

function getSelectedPolygonForVertexEditing() {
  if (state.mode !== "select" && state.mode !== "polygon") {
    return null;
  }
  if (state.selection.polygons.size !== 1) {
    return null;
  }
  const polygonId = [...state.selection.polygons][0];
  const polygon = getPolygonById(polygonId);
  if (!polygon || polygon.pointIds.length < 3) {
    return null;
  }
  return polygon;
}

function updateVertexEditHint(polygon, canInsertVertex, canRemoveVertex) {
  if (!ui.vertexEditHint) {
    return;
  }
  if (!polygon) {
    ui.vertexEditHint.hidden = true;
    ui.vertexEditHint.textContent = "";
    return;
  }

  ui.vertexEditHint.hidden = false;
  if (canInsertVertex && canRemoveVertex) {
    ui.vertexEditHint.textContent = "Vertex edit: Shift+I inserts on hovered edge. X removes selected vertex.";
    return;
  }
  if (canInsertVertex) {
    ui.vertexEditHint.textContent = "Vertex edit: Shift+I inserts on hovered edge. Select one vertex and press X to remove.";
    return;
  }
  if (canRemoveVertex) {
    ui.vertexEditHint.textContent = "Vertex edit: X removes selected vertex. Hover an edge and press Shift+I to insert.";
    return;
  }
  ui.vertexEditHint.textContent = "Vertex edit active: hover a polygon edge and press Shift+I, or select one vertex and press X.";
}

function renderNow() {
  perfCounters.renderNowCalls += 1;
  updateConstraintsPanel();
  updateZoomResetButton();
  const rect = getRect();
  lastViewportAspect = rect.width / Math.max(rect.height, 1);
  ui.graph.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
  ui.graph.replaceChildren();

  const root = document.createElementNS(SVG_NS, "g");
  const polygonsGroup = document.createElementNS(SVG_NS, "g");
  const segmentsGroup = document.createElementNS(SVG_NS, "g");
  const pointsGroup = document.createElementNS(SVG_NS, "g");
  const labelsGroup = document.createElementNS(SVG_NS, "g");
  const overlaysGroup = document.createElementNS(SVG_NS, "g");
  const metricGroup = document.createElementNS(SVG_NS, "g");

  drawBackgroundImage(root);
  drawGrid(root);

  const angleCandidates = getAngleCandidates();
  const pinnedAngleKeys = new Set(state.angleAnnotations.map((item) => angleCandidateKey(item)));
  const selectedVertexPolygon = getSelectedPolygonForVertexEditing();
  const selectedVertexPointIds = selectedVertexPolygon ? new Set(selectedVertexPolygon.pointIds) : null;
  let vertexInsertEdgePick = null;
  if (selectedVertexPolygon && state.hoverWorld) {
    const edgePick = findNearestEdge(state.hoverWorld, 14);
    if (
      edgePick &&
      edgePick.edge.edgeType === "polygon-edge" &&
      edgePick.edge.polygonId === selectedVertexPolygon.id
    ) {
      vertexInsertEdgePick = edgePick;
    }
  }
  const canRemoveVertex = Boolean(
    selectedVertexPolygon &&
      state.selection.points.size === 1 &&
      selectedVertexPolygon.pointIds.includes([...state.selection.points][0]) &&
      selectedVertexPolygon.pointIds.length > 3
  );
  updateVertexEditHint(selectedVertexPolygon, Boolean(vertexInsertEdgePick), canRemoveVertex);

  for (const polygon of state.polygons) {
    const points = polygon.pointIds.map((pointId) => getPointById(pointId)).filter(Boolean);
    if (points.length < 3) {
      continue;
    }

    const polygonScreenPoints = points.map((point) => worldToScreen(point));
    const selected = state.selection.polygons.has(polygon.id);
    const hovered = ["polygon", "polygon-label"].includes(state.hoverTarget?.kind) &&
      state.hoverTarget.item.id === polygon.id;

    if (state.display.showPolygons) {
      polygonsGroup.append(
        makePolygon(polygonScreenPoints, {
          fill: selected ? "rgba(245, 158, 11, 0.28)" : hovered ? "rgba(15, 118, 110, 0.24)" : "rgba(15, 118, 110, 0.16)",
          stroke: selected ? "#b45309" : hovered ? "#0891b2" : "#0f766e",
          "stroke-width": selected || hovered ? 2.2 : 1.6,
        })
      );
    }

    const area = polygonArea(polygon.pointIds);
    const perimeter = polygonPerimeter(polygon.pointIds);
    const converted = areaConversions(area);
    const centroid = points.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), { x: 0, y: 0 });
    centroid.x /= points.length;
    centroid.y /= points.length;
    const labelOriginScreen = worldToScreen({
      x: centroid.x + (polygon.labelOffset?.x ?? 0),
      y: centroid.y + (polygon.labelOffset?.y ?? 0),
    });
    const xs = polygonScreenPoints.map((point) => point.x);
    const ys = polygonScreenPoints.map((point) => point.y);
    const bboxArea = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    const showArea = state.display.showLabels && state.display.showPolygons;
    const showAreaMetrics = state.display.showLabels && state.display.showPolygons && bboxArea > 42000;
    if (showArea) {
      const title = makeText(labelOriginScreen.x, labelOriginScreen.y - 64, `Area: ${round2(converted.sqm)} sqm`, {
        class: "area-metric-text area-metric-title",
      });
      labelsGroup.append(title);
    }

    if (showAreaMetrics) {
      const areaLines = [
        `Hectares: ${round3(converted.hectares)}`,
        `Ares: ${round3(converted.ares)}`,
        `Perimeter: ${round2(perimeter)} m`,
        `Acres: ${round3(converted.acres)}`,
        `Cents: ${round3(converted.cents)}`,
        `Sqft: ${round2(converted.sqft)}`,
      ];
      for (let i = 0; i < areaLines.length; i += 1) {
        labelsGroup.append(
          makeText(labelOriginScreen.x, labelOriginScreen.y - 46 + i * 15, areaLines[i], {
            class: "area-metric-text",
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
            class: "segment-length-text",
          })
        );
      }
    }
  }

  if (state.polygonDraft.length >= 1) {
    const draftWorldPoints = state.polygonDraft
      .map((pointId) => getPointById(pointId))
      .filter(Boolean);
    if (state.hoverWorld) {
      draftWorldPoints.push(state.hoverWorld);
    }
    const draftPoints = draftWorldPoints.map((point) => worldToScreen(point));

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

    if (state.display.showPolygons && state.display.showSegmentLengths && state.display.showLabels) {
      const edgeCount = draftWorldPoints.length >= 3 ? draftWorldPoints.length : draftWorldPoints.length - 1;
      for (let index = 0; index < edgeCount; index += 1) {
        const aPoint = draftWorldPoints[index];
        const bPoint = draftWorldPoints[(index + 1) % draftWorldPoints.length];
        const aScreen = worldToScreen(aPoint);
        const bScreen = worldToScreen(bPoint);
        const midpoint = { x: (aScreen.x + bScreen.x) * 0.5, y: (aScreen.y + bScreen.y) * 0.5 };
        labelsGroup.append(
          makeText(midpoint.x, midpoint.y - 5, `${round2(distanceWorld(aPoint, bPoint))} m`, {
            class: "segment-length-text",
          })
        );
      }
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
    const hovered = state.hoverTarget?.kind === "segment" && state.hoverTarget.item.id === segment.id;
    const color =
      segment.kind === "parallel"
        ? "#0e7490"
        : segment.kind === "perpendicular"
          ? "#be123c"
          : "#1f6d64";
    if (state.display.showSegments) {
      const isDiagonal = isSegmentInsidePolygon(segment.a, segment.b);
      const dashArray = LINE_STYLE_DASHES[segment.lineStyle] || (isDiagonal ? "6 4" : null);
      segmentsGroup.append(
        makeLine(aScreen.x, aScreen.y, bScreen.x, bScreen.y, {
          class: "segment-line",
          stroke: selected ? "#f59e0b" : hovered ? "#0891b2" : color,
          "stroke-width": selected ? 3.4 : hovered ? 3 : 2.3,
          "stroke-linecap": "round",
          ...(dashArray && { "stroke-dasharray": dashArray }),
        })
      );
    }

    if (state.display.showSegments && state.display.showSegmentLengths && state.display.showLabels) {
      const midpoint = { x: (aScreen.x + bScreen.x) * 0.5, y: (aScreen.y + bScreen.y) * 0.5 };
      const length = distanceWorld(a, b);
      labelsGroup.append(
        makeText(midpoint.x, midpoint.y - 6, `${round2(length)} m`, {
          class: "segment-length-text",
        })
      );
    }
  }

  for (let pi = 0; pi < state.points.length; pi += 1) {
    const point = state.points[pi];
    // Label is position-based (P1, P2, …) so it stays sequential regardless of internal IDs.
    const pointLabel = `P${pi + 1}`;
    const screenPoint = worldToScreen(point);
    const selected = state.selection.points.has(point.id);
    const hovered = state.hoverTarget?.kind === "point" && state.hoverTarget.item.id === point.id;
    const locked = core.isPointLocked(state, point.id);
    if (state.display.showPoints) {
      pointsGroup.append(
        makeCircle(screenPoint.x, screenPoint.y, selected ? 6.8 : hovered ? 6.4 : 5.4, {
          fill: selected ? "#f59e0b" : hovered ? "#0891b2" : locked ? "#64748b" : "#155e75",
          stroke: locked ? "#1e293b" : "#ffffff",
          "stroke-width": selected || hovered ? 2.2 : 1.6,
        })
      );
    }
    if (selectedVertexPointIds?.has(point.id)) {
      pointsGroup.append(
        makeCircle(screenPoint.x, screenPoint.y, 8.4, {
          class:
            hovered
              ? "vertex-handle vertex-handle-hovered"
              : "vertex-handle",
        })
      );
    }
    if (state.display.showLabels) {
      labelsGroup.append(
        makeText(screenPoint.x + 8, screenPoint.y - 8, `${pointLabel} (${round2(point.x)}, ${round2(point.y)})`, {
          class: selected ? "point-label-text point-label-selected" : "point-label-text",
        })
      );
    }
  }

  if (state.display.showText) {
    for (const text of state.texts) {
      const screenPoint = worldToScreen(text);
      const selected = state.selection.texts.has(text.id);
      const hovered = state.hoverTarget?.kind === "text" && state.hoverTarget.item.id === text.id;
      labelsGroup.append(
        makeText(screenPoint.x, screenPoint.y, text.content, {
          class: selected
            ? "user-text user-text-selected"
            : hovered
              ? "user-text user-text-hovered"
              : "user-text",
          "font-size": text.size,
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

  if (vertexInsertEdgePick) {
    const a = getPointById(vertexInsertEdgePick.edge.aId);
    const b = getPointById(vertexInsertEdgePick.edge.bId);
    if (a && b) {
      const aScreen = worldToScreen(a);
      const bScreen = worldToScreen(b);
      const projectionScreen = worldToScreen(vertexInsertEdgePick.projection.point);
      overlaysGroup.append(
        makeLine(aScreen.x, aScreen.y, bScreen.x, bScreen.y, {
          stroke: "#0f766e",
          "stroke-width": 4,
          "stroke-opacity": 0.28,
          "stroke-linecap": "round",
        })
      );
      overlaysGroup.append(
        makeCircle(projectionScreen.x, projectionScreen.y, 7.2, {
          class: "vertex-insert-affordance",
        })
      );
      labelsGroup.append(
        makeText(projectionScreen.x, projectionScreen.y + 3.2, "+", {
          class: "vertex-insert-affordance-text",
        })
      );
    }
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
          class: isPinned ? "angle-label-text angle-label-pinned" : "angle-label-text angle-label-preview",
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

function flushRender() {
  if (!renderQueued) {
    return;
  }
  if (pendingRenderFrame && typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(pendingRenderFrame);
  }
  pendingRenderFrame = 0;
  renderQueued = false;
  renderNow();
}

function render() {
  if (typeof globalThis.requestAnimationFrame !== "function") {
    renderNow();
    return;
  }
  if (renderQueued) {
    return;
  }
  renderQueued = true;
  pendingRenderFrame = globalThis.requestAnimationFrame(() => {
    pendingRenderFrame = 0;
    renderQueued = false;
    renderNow();
  });
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
  const snapped = getSnappedWorldPoint(worldPoint);
  if (snapped.point) {
    return snapped.point;
  }
  return addPoint(snapped.x, snapped.y);
}

function parseLengthAngleInput(raw) {
  if (typeof raw !== "string") {
    return null;
  }
  const parts = raw
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  if (parts.length !== 2) {
    return null;
  }
  const length = Number(parts[0]);
  const angleDeg = Number(parts[1]);
  if (!Number.isFinite(length) || length <= 0 || !Number.isFinite(angleDeg)) {
    return null;
  }
  return { length, angleDeg };
}

function pointFromPolar(origin, length, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: round2(origin.x + length * Math.cos(angleRad)),
    y: round2(origin.y + length * Math.sin(angleRad)),
  };
}

function openNumericInputDialog(message, defaultValue = "10, 0", parser = parseLengthAngleInput, errorMessage = "Enter length and angle in degrees, e.g. 10, 45.") {
  return new Promise((resolve) => {
    ui.numericInputLabel.textContent = message;
    ui.numericInputField.value = defaultValue;
    ui.numericInputError.hidden = true;
    ui.numericInputError.textContent = "";
    ui.numericInputDialog.showModal();
    ui.numericInputField.select();

    function onSubmit(event) {
      event.preventDefault();
      const parsed = parser(ui.numericInputField.value);
      if (!parsed) {
        ui.numericInputError.textContent = errorMessage;
        ui.numericInputError.hidden = false;
        ui.numericInputField.focus();
        return;
      }
      cleanup();
      ui.numericInputDialog.close("ok");
      resolve({ value: parsed });
    }

    function onCancel() {
      cleanup();
      ui.numericInputDialog.close("cancel");
      resolve({ cancelled: true });
    }

    function cleanup() {
      ui.numericInputForm.removeEventListener("submit", onSubmit);
      ui.numericInputCancelBtn.removeEventListener("click", onCancel);
      ui.numericInputDialog.removeEventListener("cancel", onCancel);
    }

    ui.numericInputForm.addEventListener("submit", onSubmit);
    ui.numericInputCancelBtn.addEventListener("click", onCancel);
    ui.numericInputDialog.addEventListener("cancel", onCancel);
  });
}

async function tryNumericSegmentInput() {
  if (state.mode !== "segment" || !state.construction || state.construction.tool !== "segment") {
    return false;
  }

  const firstPoint = getPointById(state.construction.firstPointId);
  if (!firstPoint) {
    state.construction = null;
    setStatus("First segment point no longer exists.", "warning");
    render();
    return true;
  }

  const input = await openNumericInputDialog("Segment: length and angle in degrees (length, angle)");
  if (input.cancelled) {
    setStatus("Numeric segment input cancelled.");
    return true;
  }

  const target = pointFromPolar(firstPoint, input.value.length, input.value.angleDeg);
  const secondPoint = addPoint(target.x, target.y);
  const segment = addSegment(firstPoint.id, secondPoint.id, "segment");
  state.construction = null;
  if (!segment) {
    removePoint(secondPoint.id);
    syncNextIdWithState();
    render();
    setStatus("That segment already exists.", "warning");
    return true;
  }

  pushHistory("Create segment from numeric input");
  render();
  setStatus(`Segment created from numeric input (${round2(input.value.length)} @ ${round2(input.value.angleDeg)}deg).`, "success");
  return true;
}

async function tryNumericPolygonVertexInput() {
  if (state.mode !== "polygon" || state.polygonDraft.length === 0) {
    return false;
  }

  const previousPoint = getPointById(state.polygonDraft[state.polygonDraft.length - 1]);
  if (!previousPoint) {
    setStatus("Previous polygon vertex no longer exists.", "warning");
    return true;
  }

  const input = await openNumericInputDialog("Polygon edge: length and angle in degrees (length, angle)");
  if (input.cancelled) {
    setStatus("Numeric polygon input cancelled.");
    return true;
  }

  const target = pointFromPolar(previousPoint, input.value.length, input.value.angleDeg);
  const point = addPoint(target.x, target.y);
  state.polygonDraft.push(point.id);
  state.polygonDraftCreatedPointIds.add(point.id);

  const draftArea = state.polygonDraft.length >= 3 ? polygonArea(state.polygonDraft) : 0;
  render();
  setStatus(
    state.polygonDraft.length >= 3
      ? `Polygon drafting: ${state.polygonDraft.length} vertices, preview area ${round2(draftArea)} sq units.`
      : `Polygon drafting: ${state.polygonDraft.length} vertex added.`
  );
  return true;
}

function handleModeAction(screen, world, event = null) {
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
    pushHistory("Place point");
    render();
    setStatus(`Point placed at (${round2(point.x)}, ${round2(point.y)}).`, "success");
    return;
  }

  if (state.mode === "midpoint") {
    const edgePick = findNearestEdge(world);
    if (!edgePick) {
      setStatus("No nearby line found. Click closer to a segment or polygon edge.", "warning");
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

    pushHistory("Insert midpoint");
    render();
    setStatus(`Midpoint inserted at (${round2(inserted.x)}, ${round2(inserted.y)}).`, "success");
    return;
  }

  if (state.mode === "segment") {
    const directHitPoint = hitTestPoint(screen);
    const snapped = directHitPoint ? null : getSnappedWorldPoint(world);
    const hitPoint = directHitPoint || snapped?.point || null;
    const point = hitPoint || addPoint(snapped?.x ?? world.x, snapped?.y ?? world.y);
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
      setStatus("Pick a different second point.", "warning");
      return;
    }

    const firstPoint = getPointById(first);
    if (firstPoint && !hitPoint && state.snapAngleStep) {
      const snappedAnglePoint = applyAngleStepSnap(firstPoint, point);
      point.x = snappedAnglePoint.x;
      point.y = snappedAnglePoint.y;
    }

    const segment = addSegment(first, point.id, "segment");
    state.construction = null;
    if (!segment) {
      render();
      setStatus("That segment already exists.", "warning");
      return;
    }
    pushHistory("Create segment");
    render();
    setStatus("Segment created.", "success");
    return;
  }

  if (state.mode === "parallel" || state.mode === "perpendicular") {
    if (!state.construction || state.construction.tool !== state.mode || !state.construction.baseSegmentId) {
      const segmentHit = hitTestSegment(screen);
      if (!segmentHit) {
        setStatus("Select a base segment first.", "warning");
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

    const anchor = getSnappedWorldPoint(world);
    const halfLength = length * 0.5;
    const p1 = addPoint(anchor.x - ux * halfLength, anchor.y - uy * halfLength);
    const p2 = addPoint(anchor.x + ux * halfLength, anchor.y + uy * halfLength);
    addSegment(p1.id, p2.id, state.mode);
    state.construction = null;
    pushHistory(`Create ${state.mode} segment`);
    render();
    setStatus(`${state.mode === "parallel" ? "Parallel" : "Perpendicular"} segment created.`, "success");
    return;
  }

  if (state.mode === "polygon") {
    if (state.polygonDraft.length >= 2 && (event?.ctrlKey || event?.metaKey)) {
      const hitPoint = hitTestPoint(screen, 10);
      const previousPoint = getPointById(state.polygonDraft[state.polygonDraft.length - 1]);
      let closingPoint = hitPoint;
      if (!closingPoint) {
        const snapped = getSnappedWorldPoint(world);
        if (snapped.point) {
          closingPoint = snapped.point;
        } else {
          const finalWorld = previousPoint ? applyAngleStepSnap(previousPoint, snapped) : snapped;
          closingPoint = addPoint(finalWorld.x, finalWorld.y);
        }
      }

      if (!state.polygonDraft.includes(closingPoint.id)) {
        state.polygonDraft.push(closingPoint.id);
      }

      if (state.polygonDraft.length < 3) {
        setStatus("Add one more distinct vertex before closing the polygon.", "warning");
        render();
        return;
      }

      const polygon = addPolygon(state.polygonDraft);
      if (!polygon) {
        setStatus("Could not close polygon. Ensure at least three distinct vertices.", "warning");
        render();
        return;
      }

      const area = polygonArea(state.polygonDraft);
      state.polygonDraft = [];
      state.polygonDraftCreatedPointIds.clear();
      pushHistory("Create polygon");
      render();
      setStatus(`Polygon closed. Area: ${round2(area)} sq units.`, "success");
      return;
    }

    const hitPoint = hitTestPoint(screen, 10);

    if (state.polygonDraft.length >= 3 && hitPoint && hitPoint.id === state.polygonDraft[0]) {
      addPolygon(state.polygonDraft);
      const area = polygonArea(state.polygonDraft);
      state.polygonDraft = [];
      state.polygonDraftCreatedPointIds.clear();
      pushHistory("Create polygon");
      render();
      setStatus(`Polygon closed. Area: ${round2(area)} sq units.`, "success");
      return;
    }

    const previousPoint = getPointById(state.polygonDraft[state.polygonDraft.length - 1]);
    let point = hitPoint;
    if (!point) {
      const snapped = getSnappedWorldPoint(world);
      if (snapped.point) {
        point = snapped.point;
      } else {
        const nextWorld = previousPoint ? applyAngleStepSnap(previousPoint, snapped) : snapped;
        point = addPoint(nextWorld.x, nextWorld.y);
      }
    }
    if (state.polygonDraft.includes(point.id)) {
      setStatus("That vertex already exists in the current polygon path.", "warning");
      return;
    }

    state.polygonDraft.push(point.id);
    if (!hitPoint) {
      state.polygonDraftCreatedPointIds.add(point.id);
    }
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
      setStatus("No angle candidate at this location.", "warning");
      return;
    }

    const key = angleCandidateKey(hit);
    const existingIndex = state.angleAnnotations.findIndex((item) => angleCandidateKey(item) === key);
    if (existingIndex >= 0) {
      state.angleAnnotations.splice(existingIndex, 1);
      pushHistory("Remove angle annotation");
      render();
      setStatus("Angle annotation removed.", "success");
      return;
    }

    state.angleAnnotations.push({
      id: createId(),
      vertexId: hit.vertexId,
      aId: hit.aId,
      bId: hit.bId,
    });
    pushHistory("Add angle annotation");
    render();
    setStatus(`Angle annotation saved: ${round2(hit.angleDeg)}deg.`, "success");
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
  if (!point || core.isPointLocked(state, pointId)) {
    return false;
  }
  point.x = round2(point.x + dxWorld);
  point.y = round2(point.y + dyWorld);
  return true;
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

  if (
    event.button === 1 ||
    (event.button === 0 && event.shiftKey && (state.mode === "select" || state.mode === "polygon"))
  ) {
    state.drag = {
      type: "pan",
      startScreen: screen,
      startPanX: state.panX,
      startPanY: state.panY,
    };
    setStatus("Panning graph...");
    return;
  }

  if (state.mode === "polygon") {
    const target = resolvePointerTarget(screen);
    const hitPoint = target?.kind === "point" ? target.item : null;
    const hitText = target?.kind === "text" ? target.item : null;
    const hitPolygonLabel = target?.kind === "polygon-label" ? target.item : null;
    const hitPolygon = target?.kind === "polygon" ? target.item : null;

    // Keep existing close behavior: clicking the first draft vertex closes polygon.
    const closesDraft =
      state.polygonDraft.length >= 3 &&
      hitPoint &&
      hitPoint.id === state.polygonDraft[0];

    if (!closesDraft && hitPoint) {
      if (core.isPointLocked(state, hitPoint.id)) {
        clearSelection();
        state.selection.points.add(hitPoint.id);
        render();
        setStatus("That point is locked. Press L to unlock selected points.", "warning");
        return;
      }
      clearSelection();
      state.selection.points.add(hitPoint.id);
      const startPositions = new Map();
      startPositions.set(hitPoint.id, { x: hitPoint.x, y: hitPoint.y });
      state.drag = {
        type: "move-points",
        movedIds: [hitPoint.id],
        anchorWorld: world,
        startPositions,
      };
      render();
      setStatus("Dragging vertex...");
      return;
    }

    if (hitText) {
      clearSelection();
      state.selection.texts.add(hitText.id);
      state.drag = {
        type: "move-text",
        textId: hitText.id,
        anchorWorld: world,
        start: { x: hitText.x, y: hitText.y },
      };
      render();
      setStatus("Dragging text...");
      return;
    }

    if (hitPolygonLabel) {
      state.drag = {
        type: "move-polygon-label",
        polygonId: hitPolygonLabel.id,
        anchorWorld: world,
        startOffset: { ...(hitPolygonLabel.labelOffset ?? { x: 0, y: 0 }) },
      };
      render();
      setStatus("Dragging polygon label...");
      return;
    }

    if (hitPolygon) {
      const movedIds = [...new Set(hitPolygon.pointIds)];
      const startPositions = new Map();
      for (const pointId of movedIds) {
        const point = getPointById(pointId);
        if (point) {
          startPositions.set(pointId, { x: point.x, y: point.y });
        }
      }

      if (startPositions.size > 0) {
        const hasUnlockedPoint = movedIds.some((pointId) => !core.isPointLocked(state, pointId));
        if (!hasUnlockedPoint) {
          clearSelection();
          state.selection.polygons.add(hitPolygon.id);
          render();
          setStatus("Selected shape vertices are locked. Press L to unlock selected points.", "warning");
          return;
        }
        clearSelection();
        state.selection.polygons.add(hitPolygon.id);
        state.drag = {
          type: "move-polygon",
          movedIds,
          anchorWorld: world,
          startPositions,
        };
        render();
        setStatus("Dragging shape...");
        return;
      }
    }
  }

  if (state.mode !== "select") {
    handleModeAction(screen, world, event);
    return;
  }

  const target = resolvePointerTarget(screen);
  const hitPoint = target?.kind === "point" ? target.item : null;
  const hitText = target?.kind === "text" ? target.item : null;
  const hitSegment = target?.kind === "segment" ? target.item : null;
  const hitPolygonLabel = target?.kind === "polygon-label" ? target.item : null;
  const hitPolygon = target?.kind === "polygon" ? target.item : null;

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

    const movedIds = [...state.selection.points];
    if (movedIds.length === 0) {
      state.drag = null;
      render();
      setStatus(`Selection updated: ${getSelectionSummary()}`);
      return;
    }
    const movableIds = movedIds.filter((pointId) => !core.isPointLocked(state, pointId));
    if (movableIds.length === 0) {
      state.drag = null;
      render();
      setStatus("Selection updated. Selected points are locked; press L to unlock.", "warning");
      return;
    }
    const startPositions = new Map();
    for (const pointId of movableIds) {
      const point = getPointById(pointId);
      if (point) {
        startPositions.set(pointId, { x: point.x, y: point.y });
      }
    }
    state.drag = {
      type: "move-points",
      movedIds: movableIds,
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
      const movedIds = [...new Set(hitPolygon.pointIds)];
      const startPositions = new Map();
      for (const pointId of movedIds) {
        const point = getPointById(pointId);
        if (point) {
          startPositions.set(pointId, { x: point.x, y: point.y });
        }
      }

      if (startPositions.size > 0) {
        const hasUnlockedPoint = movedIds.some((pointId) => !core.isPointLocked(state, pointId));
        if (!hasUnlockedPoint) {
          state.drag = null;
          render();
          setStatus("Selection updated. Selected shape vertices are locked; press L to unlock.", "warning");
          return;
        }
        state.drag = {
          type: "move-polygon",
          movedIds,
          anchorWorld: world,
          startPositions,
        };
        render();
        setStatus("Dragging shape...");
        return;
      }
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
  state.hoverTarget = state.mode === "select" && !state.drag ? resolvePointerTarget(screen) : null;

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
      if (core.isPointLocked(state, pointId)) {
        continue;
      }
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

  if (state.drag?.type === "move-polygon") {
    const dxWorld = world.x - state.drag.anchorWorld.x;
    const dyWorld = world.y - state.drag.anchorWorld.y;
    for (const pointId of state.drag.movedIds) {
      if (core.isPointLocked(state, pointId)) {
        continue;
      }
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

  if (
    state.drag?.type === "move-points" ||
    state.drag?.type === "move-polygon" ||
    state.drag?.type === "move-text" ||
    state.drag?.type === "move-polygon-label"
  ) {
    pushHistory("Move selection");
  }

  state.drag = null;

  if (wasDragging) {
    render();
  }

  if (event.pointerType === "touch") {
    state.hoverWorld = null;
    state.hoverScreen = null;
    state.hoverTarget = null;
  }
}

function handleWheel(event) {
  event.preventDefault();
  hideContextMenu();

  const screen = getScreenPointFromEvent(event);
  const beforeWorld = screenToWorld(screen);
  const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
  state.scale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);

  const rect = getRect();
  state.panX = screen.x - beforeWorld.x * state.scale - rect.width * 0.5;
  state.panY = screen.y + beforeWorld.y * state.scale - rect.height * 0.5;

  render();
}

function zoomBy(factor) {
  const rect = getRect();
  const centerScreen = { x: rect.width * 0.5, y: rect.height * 0.5 };
  const beforeWorld = screenToWorld(centerScreen);
  state.scale = clamp(state.scale * factor, MIN_SCALE, MAX_SCALE);
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

function fitViewport(selectionOnly = false) {
  const pointIds = selectionOnly
    ? getSelectedPointIds()
    : new Set(state.points.map((point) => point.id));
  const points = [...pointIds].map((pointId) => getPointById(pointId)).filter(Boolean);
  const texts = selectionOnly
    ? [...state.selection.texts].map((textId) => getTextById(textId)).filter(Boolean)
    : state.texts;
  const anchors = [...points, ...texts];
  if (anchors.length === 0) {
    setStatus(selectionOnly ? "Select geometry or text to fit." : "The drawing is empty.", "warning");
    return;
  }

  const rect = getRect();
  const padding = Math.min(80, Math.max(32, Math.min(rect.width, rect.height) * 0.1));
  const minX = Math.min(...anchors.map((item) => item.x));
  const maxX = Math.max(...anchors.map((item) => item.x));
  const minY = Math.min(...anchors.map((item) => item.y));
  const maxY = Math.max(...anchors.map((item) => item.y));
  const width = Math.max(maxX - minX, 1);
  const height = Math.max(maxY - minY, 1);
  state.scale = clamp(
    Math.min((rect.width - padding * 2) / width, (rect.height - padding * 2) / height),
    MIN_SCALE,
    MAX_SCALE
  );
  const centerX = (minX + maxX) * 0.5;
  const centerY = (minY + maxY) * 0.5;
  state.panX = -centerX * state.scale;
  state.panY = centerY * state.scale;
  render();
  setStatus(selectionOnly ? "Fitted selection to viewport." : "Fitted drawing to viewport.", "success");
}

function zoomPercentText() {
  const percent = (state.scale / 32) * 100;
  const rounded = Math.round(percent * 100) / 100;
  const display = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
  return `${display}%`;
}

function updateZoomResetButton() {
  const icon = ui.zoomResetBtn.querySelector(".icon");
  const label = zoomPercentText();
  if (icon) {
    icon.textContent = label;
  }
  ui.zoomResetBtn.title = `Reset zoom and position (${label})`;
}

function pointsToCoordinateList() {
  const points = getCoordinateEditorPoints();

  if (points.length === 0) {
    return "No points in the current selection.";
  }

  const pointDisplayIndex = new Map(state.points.map((point, index) => [point.id, index + 1]));
  return points
    .map((point, index) => {
      const displayIndex = pointDisplayIndex.get(point.id) || index + 1;
      return `P${displayIndex}, ${round2(point.x)}, ${round2(point.y)}`;
    })
    .join("\n");
}

function startSelectModeEditingFromKeyboard() {
  if (state.mode !== "select") {
    return false;
  }

  const hasGeometrySelection =
    state.selection.points.size > 0 ||
    state.selection.segments.size > 0 ||
    state.selection.polygons.size > 0;

  if (hasGeometrySelection) {
    showPointListDialog(pointsToCoordinateList());
    setStatus("Editing selected coordinates. Press Enter to apply.");
    return true;
  }

  if (state.selection.texts.size === 1) {
    const textId = [...state.selection.texts][0];
    const text = getTextById(textId);
    if (!text) {
      setStatus("Selected text no longer exists.", "warning");
      return true;
    }
    openInlineTextEditor(worldToScreen(text), {
      textId: text.id,
      world: { x: text.x, y: text.y },
      initialValue: text.content,
    });
    setStatus("Editing text. Press Enter to save.");
    return true;
  }

  if (state.selection.texts.size > 1) {
    setStatus("Select exactly one text item to edit.", "warning");
    return true;
  }

  const rect = getRect();
  const centerScreen = { x: rect.width * 0.5, y: rect.height * 0.5 };
  const centerWorld = screenToWorld(centerScreen);
  openInlineTextEditor(centerScreen, { world: centerWorld, initialValue: "" });
  setStatus("Type text and press Enter.");
  return true;
}

function updateCoordinateInspector() {
  ui.coordinatePreview.replaceChildren();
  let points;
  try {
    points = normalizeCoordinateLoop(parseCoordinatesText(ui.pointsOutput.value));
  } catch (error) {
    ui.coordinateValidation.textContent = error instanceof Error ? error.message : "Could not parse coordinates.";
    ui.coordinateValidation.dataset.tone = "error";
    ui.drawPointsBtn.disabled = true;
    return;
  }

  const canDrawShape = points.length >= 3;
  const selectedPoints = getOrderedSelectedPoints();
  const canUpdatePointsOnly =
    state.selection.polygons.size === 0 &&
    selectedPoints.length > 0 &&
    selectedPoints.length === points.length;
  const canApply = canDrawShape || canUpdatePointsOnly;
  ui.coordinateValidation.textContent = canApply
    ? canDrawShape
      ? `${points.length} coordinates ready.`
      : `${points.length} coordinate${points.length === 1 ? "" : "s"} ready to update.`
    : `${points.length} coordinate${points.length === 1 ? "" : "s"}; at least 3 required to draw a shape.`;
  ui.coordinateValidation.dataset.tone = canApply ? "success" : "warning";
  ui.drawPointsBtn.disabled = !canApply;

  const selectedSegments = [...state.selection.segments]
    .map((segmentId) => getSegmentById(segmentId))
    .filter(Boolean);
  ui.lineStyleControl.hidden = selectedSegments.length === 0;
  if (selectedSegments.length > 0) {
    const styles = new Set(selectedSegments.map((segment) => segment.lineStyle || "solid"));
    ui.lineStyleSelect.value = styles.size === 1 ? [...styles][0] : "mixed";
  }

  if (points.length < 2) {
    return;
  }

  const width = 300;
  const height = 140;
  const padding = 14;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scale = Math.min(
    (width - padding * 2) / Math.max(maxX - minX, 1),
    (height - padding * 2) / Math.max(maxY - minY, 1)
  );
  const previewPoints = points.map((point) => ({
    x: padding + (point.x - minX) * scale,
    y: height - padding - (point.y - minY) * scale,
  }));
  const preview = canDrawShape
    ? makePolygon(previewPoints, { class: "coordinate-preview-shape" })
    : makePolyline(previewPoints, { class: "coordinate-preview-shape" });
  ui.coordinatePreview.append(preview);
}

function showPointListDialog(content = pointsToCoordinateList()) {
  ui.pointsOutput.value = content;
  updateCoordinateInspector();
  if (!ui.pointsDialog.open) {
    ui.pointsDialog.show();
  }
  ui.pointsOutput.focus();
  ui.pointsOutput.setSelectionRange(0, 0);
}

function updateSelectedSegmentLineStyle(lineStyle) {
  if (!Object.hasOwn(LINE_STYLE_DASHES, lineStyle)) {
    return;
  }
  const selectedSegments = [...state.selection.segments]
    .map((segmentId) => getSegmentById(segmentId))
    .filter(Boolean);
  if (selectedSegments.length === 0) {
    return;
  }
  let changed = false;
  for (const segment of selectedSegments) {
    if ((segment.lineStyle || "solid") !== lineStyle) {
      segment.lineStyle = lineStyle;
      changed = true;
    }
  }
  if (!changed) {
    return;
  }
  pushHistory(`Change line style to ${lineStyle}`);
  render();
  setStatus(`Line style changed to ${lineStyle}.`, "success");
}

function pointIsUsedOutsidePolygon(pointId, polygonId) {
  if (state.segments.some((segment) => segment.a === pointId || segment.b === pointId)) {
    return true;
  }

  if (state.angleAnnotations.some((item) => item.vertexId === pointId || item.aId === pointId || item.bId === pointId)) {
    return true;
  }

  return state.polygons.some((polygon) => polygon.id !== polygonId && polygon.pointIds.includes(pointId));
}

function pointIsUsedOutsidePolygons(pointId, polygonIdSet) {
  return state.polygons.some((polygon) => !polygonIdSet.has(polygon.id) && polygon.pointIds.includes(pointId));
}

function discardPolygonVertex(pointId) {
  // Vertex belonged only to the discarded polygon(s), so drop anything anchored to it too.
  state.segments = state.segments.filter((segment) => segment.a !== pointId && segment.b !== pointId);
  state.angleAnnotations = state.angleAnnotations.filter(
    (item) => item.vertexId !== pointId && item.aId !== pointId && item.bId !== pointId
  );
  removePoint(pointId);
}

function polygonToClippingInput(polygon) {
  const points = polygon.pointIds.map((pointId) => getPointById(pointId)).filter(Boolean);
  if (points.length < 3) {
    return null;
  }
  const ring = points.map((point) => [point.x, point.y]);
  ring.push([points[0].x, points[0].y]);
  return [ring];
}

function ringToPointIds(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    return [];
  }

  const unique = [];
  for (let index = 0; index < ring.length - 1; index += 1) {
    const item = ring[index];
    if (!Array.isArray(item) || item.length < 2) {
      continue;
    }
    const x = round2(Number(item[0]));
    const y = round2(Number(item[1]));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    const previous = unique[unique.length - 1];
    if (!previous || previous.x !== x || previous.y !== y) {
      unique.push({ x, y });
    }
  }

  if (unique.length >= 2) {
    const first = unique[0];
    const last = unique[unique.length - 1];
    if (first.x === last.x && first.y === last.y) {
      unique.pop();
    }
  }

  if (unique.length < 3) {
    return [];
  }

  const pointIds = [];
  for (const point of unique) {
    pointIds.push(addPoint(point.x, point.y).id);
  }
  return pointIds;
}

function drawShapeFromCoordinateInput() {
  let parsed;
  try {
    parsed = parseCoordinatesText(ui.pointsOutput.value);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Could not parse coordinates.", "error");
    return;
  }

  parsed = normalizeCoordinateLoop(parsed);

  if (parsed.length === 0) {
    setStatus("Enter at least one coordinate row.", "warning");
    return;
  }

  const selectedPolygonIds = [...state.selection.polygons];
  if (selectedPolygonIds.length > 1) {
    setStatus("Select only one shape to update, or clear selection to create a new one.");
    return;
  }

  // Editing existing point(s) directly (no polygon involved) doesn't require a full shape.
  const selectedPoints = getOrderedSelectedPoints();
  if (selectedPolygonIds.length === 0 && selectedPoints.length > 0 && selectedPoints.length === parsed.length) {
    selectedPoints.forEach((point, index) => {
      point.x = round2(parsed[index].x);
      point.y = round2(parsed[index].y);
    });
    normalizeGeometry();
    pushHistory(`Update point coordinate${selectedPoints.length === 1 ? "" : "s"}`);
    render();
    ui.pointsDialog.close();
    setStatus(`Updated ${selectedPoints.length} point${selectedPoints.length === 1 ? "" : "s"}.`, "success");
    return;
  }

  if (parsed.length < 3) {
    setStatus("Enter at least three coordinate rows to draw a shape, or select point(s) matching the rows to update.");
    return;
  }

  if (selectedPolygonIds.length === 1) {
    const polygon = getPolygonById(selectedPolygonIds[0]);
    if (!polygon) {
      setStatus("Selected shape no longer exists.");
      return;
    }

    const previousPointIds = [...polygon.pointIds];
    const nextPointIds = [];
    for (let index = 0; index < parsed.length; index += 1) {
      const item = parsed[index];
      const existingPoint = getPointById(previousPointIds[index]);
      if (existingPoint) {
        existingPoint.x = round2(item.x);
        existingPoint.y = round2(item.y);
        nextPointIds.push(existingPoint.id);
      } else {
        const point = addPoint(item.x, item.y);
        nextPointIds.push(point.id);
      }
    }

    polygon.pointIds = nextPointIds;

    for (const pointId of previousPointIds.slice(parsed.length)) {
      if (!pointIsUsedOutsidePolygon(pointId, polygon.id)) {
        removePoint(pointId);
      }
    }

    clearSelection();
    state.selection.polygons.add(polygon.id);
    normalizeGeometry();
    pushHistory("Update shape coordinates");
    render();
    ui.pointsDialog.close();
    setStatus(`Updated selected shape with ${nextPointIds.length} coordinates.`, "success");
    return;
  }

  const pointIds = [];
  for (const item of parsed) {
    const point = addPoint(item.x, item.y);
    pointIds.push(point.id);
  }

  const polygon = addPolygon(pointIds);
  if (!polygon) {
    setStatus("Could not create shape from provided coordinates.", "error");
    return;
  }

  clearSelection();
  state.selection.polygons.add(polygon.id);
  pushHistory("Create shape from coordinates");
  render();
  ui.pointsDialog.close();
  setStatus(`Shape created from ${pointIds.length} coordinates.`, "success");
}

function insertPolygonVertexOnEdge(edgePick) {
  if (!edgePick || edgePick.edge.edgeType !== "polygon-edge") {
    setStatus("Move closer to a polygon edge to insert a vertex.", "warning");
    return false;
  }

  const inserted = insertPointOnEdge(edgePick, edgePick.projection.point);
  clearSelection();
  state.selection.polygons.add(edgePick.edge.polygonId);
  state.selection.points.add(inserted.id);
  normalizeGeometry();
  pushHistory("Insert polygon vertex");
  render();
  setStatus(`Polygon vertex inserted at (${round2(inserted.x)}, ${round2(inserted.y)}).`, "success");
  return true;
}

function removePolygonVertex(pointId, polygonId = null) {
  const point = getPointById(pointId);
  if (!point) {
    setStatus("Selected vertex no longer exists.", "warning");
    return false;
  }

  let polygon = null;
  if (Number.isInteger(polygonId)) {
    const byId = getPolygonById(polygonId);
    if (byId && byId.pointIds.includes(pointId)) {
      polygon = byId;
    }
  }
  if (!polygon) {
    const selectedPolygonIds = [...state.selection.polygons];
    if (selectedPolygonIds.length === 1) {
      const selectedPolygon = getPolygonById(selectedPolygonIds[0]);
      if (selectedPolygon && selectedPolygon.pointIds.includes(pointId)) {
        polygon = selectedPolygon;
      }
    }
  }
  if (!polygon) {
    polygon = state.polygons.find((entry) => entry.pointIds.includes(pointId)) || null;
  }

  if (!polygon) {
    setStatus("Select a polygon vertex to remove.", "warning");
    return false;
  }
  if (polygon.pointIds.length <= 3) {
    setStatus("A polygon must keep at least three vertices.", "warning");
    return false;
  }

  const vertexIndex = polygon.pointIds.indexOf(pointId);
  if (vertexIndex < 0) {
    setStatus("Selected vertex is not part of that polygon.", "warning");
    return false;
  }

  polygon.pointIds.splice(vertexIndex, 1);
  if (!pointIsUsedOutsidePolygon(pointId, polygon.id)) {
    removePoint(pointId);
  }

  clearSelection();
  state.selection.polygons.add(polygon.id);
  normalizeGeometry();
  pushHistory("Remove polygon vertex");
  render();
  setStatus(`Removed vertex at (${round2(point.x)}, ${round2(point.y)}).`, "success");
  return true;
}

function lockSelectedPoints() {
  const selectedPointIds = [...getSelectedPointIds()];
  if (selectedPointIds.length === 0) {
    return { changed: false, message: "Select at least one point to lock.", tone: "warning" };
  }

  let changedCount = 0;
  for (const pointId of selectedPointIds) {
    if (core.addPointLockConstraint(state, pointId)) {
      changedCount += 1;
    }
  }

  if (changedCount === 0) {
    return { changed: false, message: "Selected points are already locked.", tone: "warning" };
  }

  return {
    changed: true,
    message: `Locked ${changedCount} point${changedCount === 1 ? "" : "s"}.`,
    tone: "success",
  };
}

function unlockSelectedPoints() {
  const selectedPointIds = [...getSelectedPointIds()];
  if (selectedPointIds.length === 0) {
    return { changed: false, message: "Select at least one point to unlock.", tone: "warning" };
  }

  let changedCount = 0;
  for (const pointId of selectedPointIds) {
    if (core.removePointLockConstraint(state, pointId)) {
      changedCount += 1;
    }
  }

  if (changedCount === 0) {
    return { changed: false, message: "Selected points are already unlocked.", tone: "warning" };
  }

  return {
    changed: true,
    message: `Unlocked ${changedCount} point${changedCount === 1 ? "" : "s"}.`,
    tone: "success",
  };
}

function clearAllConstraints() {
  if (state.constraints.length === 0) {
    return { changed: false, message: "No constraints to clear.", tone: "warning" };
  }
  const count = state.constraints.length;
  state.constraints = [];
  return {
    changed: true,
    message: `Cleared ${count} constraint${count === 1 ? "" : "s"}.`,
    tone: "success",
  };
}

function runPolygonBooleanOperation(operation) {
  const selectedPolygonIds = [...state.selection.polygons];
  if (selectedPolygonIds.length !== 2) {
    setStatus("Select exactly two polygons to run a boolean operation.", "warning");
    return;
  }

  const subjectPolygon = getPolygonById(selectedPolygonIds[0]);
  const clipPolygon = getPolygonById(selectedPolygonIds[1]);
  if (!subjectPolygon || !clipPolygon) {
    setStatus("Selected polygons are no longer available.", "warning");
    return;
  }

  const subjectInput = polygonToClippingInput(subjectPolygon);
  const clipInput = polygonToClippingInput(clipPolygon);
  if (!subjectInput || !clipInput) {
    setStatus("Selected polygons are invalid for boolean operations.", "warning");
    return;
  }

  const polygonClipping = globalThis.polygonClipping;
  if (!polygonClipping) {
    setStatus("Polygon boolean engine is unavailable.", "error");
    return;
  }

  let result = null;
  try {
    if (operation === "union") {
      result = polygonClipping.union(subjectInput, clipInput);
    } else if (operation === "subtract") {
      result = polygonClipping.difference(subjectInput, clipInput);
    } else if (operation === "intersect") {
      result = polygonClipping.intersection(subjectInput, clipInput);
    }
  } catch {
    setStatus("Polygon boolean operation failed. Check polygon geometry and try again.", "error");
    return;
  }

  const selectedSet = new Set(selectedPolygonIds);
  const removedPointIds = new Set(
    [subjectPolygon, clipPolygon].flatMap((polygon) => polygon.pointIds)
  );

  state.polygons = state.polygons.filter((polygon) => !selectedSet.has(polygon.id));

  for (const pointId of removedPointIds) {
    if (!pointIsUsedOutsidePolygons(pointId, selectedSet)) {
      discardPolygonVertex(pointId);
    }
  }

  const createdPolygonIds = [];
  const multipolygon = Array.isArray(result) ? result : [];
  for (const polygonCoords of multipolygon) {
    if (!Array.isArray(polygonCoords) || polygonCoords.length === 0) {
      continue;
    }
    const outerRing = polygonCoords[0];
    const pointIds = ringToPointIds(outerRing);
    if (pointIds.length < 3) {
      continue;
    }
    const polygon = addPolygon(pointIds);
    if (polygon) {
      createdPolygonIds.push(polygon.id);
    }
  }

  clearSelection();
  for (const polygonId of createdPolygonIds) {
    state.selection.polygons.add(polygonId);
  }

  normalizeGeometry();
  syncNextIdWithState();
  pushHistory(`Polygon ${operation}`);
  render();

  if (createdPolygonIds.length === 0) {
    setStatus(`Polygon ${operation} created no remaining area.`, "warning");
    return;
  }
  setStatus(
    `Polygon ${operation} complete (${createdPolygonIds.length} result polygon${createdPolygonIds.length === 1 ? "" : "s"}).`,
    "success"
  );
}

function updateConstraintsPanel() {
  if (!ui.constraintsSummary || !ui.lockSelectedBtn || !ui.unlockSelectedBtn || !ui.clearConstraintsBtn) {
    return;
  }

  const selectedPointIds = [...getSelectedPointIds()];
  const lockedConstraints = state.constraints.filter((constraint) => constraint.type === "point-lock");

  ui.lockSelectedBtn.disabled = selectedPointIds.length === 0;
  ui.unlockSelectedBtn.disabled = selectedPointIds.length === 0;
  ui.clearConstraintsBtn.disabled = state.constraints.length === 0;

  ui.constraintsSummary.textContent =
    `${lockedConstraints.length} lock constraint${lockedConstraints.length === 1 ? "" : "s"}` +
    `, ${selectedPointIds.length} point${selectedPointIds.length === 1 ? "" : "s"} selected`;
}

function hideContextMenu() {
  contextMenuEdgePick = null;
  contextMenuVertexPointId = null;
  contextMenuTextId = null;
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
      pushHistory("Import JSON diagram");
      render();
      setStatus("JSON import complete.", "success");
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
      pushHistory("Import SVG diagram");
      render();
      setStatus("SVG import complete.", "success");
      return;
    }

    throw new Error("Unsupported file type. Use JSON or SVG.");
  } catch (error) {
    setStatus(`Import failed: ${error instanceof Error ? error.message : "Invalid file"}`, "error");
  }
}

function handleImport(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === "string" ? reader.result : "";
    importFromText(file.name, text);
    ui.importFile.value = "";
  };
  reader.readAsText(file);
}

function initializeDemoGeometry() {
  const p1 = addPoint(-8, -4);
  const p2 = addPoint(6, -2);
  const p3 = addPoint(9, 7);
  const p4 = addPoint(-5, 9);
  addPolygon([p1.id, p2.id, p3.id, p4.id]);
  addSegment(p1.id, p3.id, "segment");
  addText({ x: 1, y: 2 }, "Title Goes Here", 18);
}

function isEditingTextInput(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest("input, textarea, select, [contenteditable='true']") !== null;
}

async function handleKeyDown(event) {
  if (ui.pointsDialog.open && event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
    if (event.shiftKey) {
      return;
    }
    event.preventDefault();
    drawShapeFromCoordinateInput();
    return;
  }

  if (isEditingTextInput(event.target)) {
    return;
  }

  if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
    if (startSelectModeEditingFromKeyboard()) {
      event.preventDefault();
      return;
    }

    const willHandle =
      (state.mode === "segment" && state.construction?.tool === "segment") ||
      (state.mode === "polygon" && state.polygonDraft.length > 0);
    if (willHandle) {
      event.preventDefault();
      await tryNumericSegmentInput() || await tryNumericPolygonVertexInput();
      return;
    }
  }

  if (event.key === "?" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    ui.helpDialog.showModal();
    return;
  }

  if (event.key.toLowerCase() === "c" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    showPointListDialog();
    return;
  }

  if (event.key.toLowerCase() === "i" && !event.ctrlKey && !event.metaKey && state.hoverWorld) {
    const selectedPolygon = event.shiftKey ? getSelectedPolygonForVertexEditing() : null;
    const edgePick = selectedPolygon
      ? findNearestPolygonEdge(state.hoverWorld, selectedPolygon.id)
      : findNearestEdge(state.hoverWorld);
    if (!edgePick) {
      setStatus("Move the pointer closer to an edge before inserting a point.", "warning");
      return;
    }
    if (event.shiftKey) {
      insertPolygonVertexOnEdge(edgePick.edge.edgeType === "polygon-edge" ? edgePick : null);
      return;
    }
    const inserted = insertPointOnEdge(edgePick, edgePick.projection.point);
    clearSelection();
    state.selection.points.add(inserted.id);
    pushHistory("Insert point on edge");
    render();
    setStatus(`Point inserted at (${round2(inserted.x)}, ${round2(inserted.y)}).`, "success");
    return;
  }

  if (event.key.toLowerCase() === "f" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    fitViewport(event.shiftKey);
    return;
  }

  if (["+", "=", "-", "_"].includes(event.key) && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const zoomIn = event.key === "+" || event.key === "=";
    const factor = event.shiftKey ? 1.5 : event.altKey ? 1.05 : 1.15;
    zoomBy(zoomIn ? factor : 1 / factor);
    return;
  }

  if (event.key === "Escape") {
    if (!ui.contextMenu.hidden) {
      hideContextMenu();
      return;
    }
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
    event.preventDefault();
    removeSelectedObjects();
    return;
  }

  if (event.key.toLowerCase() === "x" && !event.ctrlKey && !event.metaKey) {
    const selectedPointIds = [...state.selection.points];
    if (selectedPointIds.length !== 1) {
      setStatus("Select exactly one polygon vertex to remove.", "warning");
      return;
    }
    event.preventDefault();
    removePolygonVertex(selectedPointIds[0]);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
    event.preventDefault();
    state.selection.points = new Set(state.points.map((point) => point.id));
    state.selection.segments = new Set(state.segments.map((segment) => segment.id));
    state.selection.polygons = new Set(state.polygons.map((polygon) => polygon.id));
    state.selection.texts = new Set(state.texts.map((text) => text.id));
    render();
    setStatus(`Selected all: ${getSelectionSummary()}`);
    return;
  }

  if (event.key.toLowerCase() === "l" && !event.ctrlKey && !event.metaKey) {
    event.preventDefault();
    const selectedPointIds = [...getSelectedPointIds()];
    const allLocked = selectedPointIds.length > 0 && selectedPointIds.every((pointId) => core.isPointLocked(state, pointId));
    const result = allLocked ? unlockSelectedPoints() : lockSelectedPoints();
    setStatus(result.message, result.tone);
    if (result.changed) {
      pushHistory("Toggle point lock constraints");
      render();
    } else {
      updateConstraintsPanel();
    }
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
    pushHistory("Resize text");
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
    let movedAnyPoint = false;
    for (const pointId of selectedPointIds) {
      movedAnyPoint = movePoint(pointId, dx, dy) || movedAnyPoint;
    }
    for (const textId of state.selection.texts) {
      const text = getTextById(textId);
      if (!text) {
        continue;
      }
      text.x = round2(text.x + dx);
      text.y = round2(text.y + dy);
    }
    if (!movedAnyPoint && state.selection.texts.size === 0) {
      setStatus("Selected points are locked. Press L to unlock.", "warning");
      return;
    }
    pushHistory("Nudge selection");
    render();
  }
}

function handleDoubleClick(event) {
  const screen = getScreenPointFromEvent(event);
  const hitText = hitTestText(screen);
  if (hitText) {
    openInlineTextEditor(screen, {
      textId: hitText.id,
      world: { x: hitText.x, y: hitText.y },
      initialValue: hitText.content,
    });
    setStatus("Editing text. Press Enter to save.");
    return;
  }

  const world = screenToWorld(screen);
  const edgePick = findNearestEdge(world);
  if (!edgePick) {
    return;
  }

  const inserted = insertPointOnEdge(edgePick, edgePick.projection.point);
  clearSelection();
  state.selection.points.add(inserted.id);
  pushHistory("Insert point on edge");
  render();
  setStatus(`Point inserted at (${round2(inserted.x)}, ${round2(inserted.y)}).`);
}

function wireEvents() {
  const disposers = [];
  function addTrackedEvent(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    disposers.push(() => target.removeEventListener(type, handler, options));
  }

  for (const button of ui.modeButtons) {
    addTrackedEvent(button, "click", () => setMode(button.dataset.mode || "select"));
  }

  for (const group of ui.modeSelectGroups) {
    addTrackedEvent(group, "click", (event) => {
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
    addTrackedEvent(select, "change", () => {
      setMode(select.value || "select");
    });
  }

  addTrackedEvent(ui.mobileMenuToggle, "click", () => {
    const nextOpen = !ui.toolMenu.classList.contains("open");
    ui.actionsMenu.classList.remove("open");
    ui.mobileActionsToggle.setAttribute("aria-expanded", "false");
    ui.toolMenu.classList.toggle("open", nextOpen);
    ui.mobileMenuToggle.setAttribute("aria-expanded", String(nextOpen));
  });

  addTrackedEvent(ui.mobileActionsToggle, "click", () => {
    const nextOpen = !ui.actionsMenu.classList.contains("open");
    ui.toolMenu.classList.remove("open");
    ui.mobileMenuToggle.setAttribute("aria-expanded", "false");
    ui.actionsMenu.classList.toggle("open", nextOpen);
    ui.mobileActionsToggle.setAttribute("aria-expanded", String(nextOpen));
  });

  addTrackedEvent(ui.actionsMenu, "click", (event) => {
    if (event.target instanceof HTMLElement && event.target.closest("button")) {
      ui.actionsMenu.classList.remove("open");
      ui.mobileActionsToggle.setAttribute("aria-expanded", "false");
    }
  });

  addTrackedEvent(ui.undoBtn, "click", undo);
  addTrackedEvent(ui.redoBtn, "click", redo);
  addTrackedEvent(ui.zoomInBtn, "click", () => zoomBy(1.15));
  addTrackedEvent(ui.zoomOutBtn, "click", () => zoomBy(1 / 1.15));
  addTrackedEvent(ui.zoomResetBtn, "click", resetZoomAndPan);
  addTrackedEvent(ui.fitDrawingBtn, "click", () => fitViewport(false));
  addTrackedEvent(ui.fitSelectionBtn, "click", () => fitViewport(true));
  addTrackedEvent(ui.exportJsonBtn, "click", exportJson);
  addTrackedEvent(ui.exportSvgBtn, "click", exportSvg);
  addTrackedEvent(ui.importBtn, "click", () => ui.importFile.click());
  addTrackedEvent(ui.themeToggleBtn, "click", toggleTheme);
  addTrackedEvent(ui.helpBtn, "click", () => ui.helpDialog.showModal());
  addTrackedEvent(ui.importFile, "change", handleImport);

  addTrackedEvent(ui.settingsBtn, "click", () => {
    ui.settingsPanel.hidden = !ui.settingsPanel.hidden;
  });
  addTrackedEvent(ui.closeSettingsBtn, "click", () => {
    ui.settingsPanel.hidden = true;
  });
  addTrackedEvent(ui.resetSettingsBtn, "click", resetDisplaySettings);
  addTrackedEvent(ui.clearAutosaveBtn, "click", () => {
    clearAutosaveDraft();
    setStatus("Autosave draft cleared.", "success");
  });
  addTrackedEvent(ui.lockSelectedBtn, "click", () => {
    const result = lockSelectedPoints();
    setStatus(result.message, result.tone);
    if (result.changed) {
      pushHistory("Lock selected points");
      render();
    } else {
      updateConstraintsPanel();
    }
  });
  addTrackedEvent(ui.unlockSelectedBtn, "click", () => {
    const result = unlockSelectedPoints();
    setStatus(result.message, result.tone);
    if (result.changed) {
      pushHistory("Unlock selected points");
      render();
    } else {
      updateConstraintsPanel();
    }
  });
  addTrackedEvent(ui.clearConstraintsBtn, "click", () => {
    const result = clearAllConstraints();
    setStatus(result.message, result.tone);
    if (result.changed) {
      pushHistory("Clear constraints");
      render();
    } else {
      updateConstraintsPanel();
    }
  });
  addTrackedEvent(ui.snapToggle, "change", () => {
    state.snapToPoints = ui.snapToggle.checked;
    saveDisplaySettings();
    setStatus(state.snapToPoints ? "Snap enabled." : "Snap disabled.");
  });
  addTrackedEvent(ui.snapGridToggle, "change", () => {
    state.snapToGrid = ui.snapGridToggle.checked;
    saveDisplaySettings();
    setStatus(state.snapToGrid ? "Grid snap enabled." : "Grid snap disabled.");
  });
  addTrackedEvent(ui.snapMidpointToggle, "change", () => {
    state.snapToMidpoints = ui.snapMidpointToggle.checked;
    saveDisplaySettings();
    setStatus(state.snapToMidpoints ? "Midpoint snap enabled." : "Midpoint snap disabled.");
  });
  addTrackedEvent(ui.snapIntersectionToggle, "change", () => {
    state.snapToIntersections = ui.snapIntersectionToggle.checked;
    saveDisplaySettings();
    setStatus(state.snapToIntersections ? "Intersection snap enabled." : "Intersection snap disabled.");
  });
  addTrackedEvent(ui.snapAngleStepToggle, "change", () => {
    state.snapAngleStep = ui.snapAngleStepToggle.checked;
    ui.snapAngleStepDegreesInput.disabled = !state.snapAngleStep;
    saveDisplaySettings();
    setStatus(state.snapAngleStep ? `Angle snap enabled (${state.snapAngleStepDegrees}deg).` : "Angle snap disabled.");
  });
  addTrackedEvent(ui.snapAngleStepDegreesInput, "change", () => {
    const value = clamp(Math.round(Number(ui.snapAngleStepDegreesInput.value) || 15), 1, 180);
    state.snapAngleStepDegrees = value;
    ui.snapAngleStepDegreesInput.value = String(value);
    saveDisplaySettings();
    if (state.snapAngleStep) {
      setStatus(`Angle snap step set to ${value}deg.`);
    }
  });

  addTrackedEvent(ui.showPointsToggle, "change", (event) => updateDisplaySetting("showPoints", event.target.checked));
  addTrackedEvent(ui.showLabelsToggle, "change", (event) => updateDisplaySetting("showLabels", event.target.checked));
  addTrackedEvent(ui.showSegmentsToggle, "change", (event) => updateDisplaySetting("showSegments", event.target.checked));
  addTrackedEvent(ui.showSegmentLengthsToggle, "change", (event) => updateDisplaySetting("showSegmentLengths", event.target.checked));
  addTrackedEvent(ui.showTextToggle, "change", (event) => updateDisplaySetting("showText", event.target.checked));
  addTrackedEvent(ui.showPolygonsToggle, "change", (event) => updateDisplaySetting("showPolygons", event.target.checked));
  addTrackedEvent(ui.showAnglesToggle, "change", (event) => updateDisplaySetting("showAngles", event.target.checked));
  addTrackedEvent(ui.showMajorGridToggle, "change", (event) => updateDisplaySetting("showMajorGrid", event.target.checked));
  addTrackedEvent(ui.showMinorGridToggle, "change", (event) => updateDisplaySetting("showMinorGrid", event.target.checked));
  addTrackedEvent(ui.showGridValuesToggle, "change", (event) => updateDisplaySetting("showGridValues", event.target.checked));

  addTrackedEvent(ui.showBackgroundImageToggle, "change", (event) =>
    updateDisplaySetting("showBackgroundImage", event.target.checked)
  );
  addTrackedEvent(ui.backgroundImageChooseBtn, "click", () => ui.backgroundImageFile.click());
  addTrackedEvent(ui.backgroundImageFile, "change", (event) => {
    loadBackgroundImageFile(event.target.files?.[0]);
    event.target.value = "";
  });
  addTrackedEvent(ui.backgroundImageRemoveBtn, "click", removeBackgroundImage);
  addTrackedEvent(ui.backgroundImageFitBtn, "click", () => {
    if (!state.backgroundImage) {
      return;
    }
    const placement = computeBackgroundImagePlacement(
      state.backgroundImage.width / state.backgroundImage.height
    );
    updateBackgroundImagePlacement(placement, "Fit background image");
    setStatus("Background image fitted to the current view.");
  });
  addTrackedEvent(ui.backgroundImageOpacity, "input", (event) => {
    if (!state.backgroundImage) {
      return;
    }
    state.backgroundImage.opacity = clamp(Number(event.target.value) / 100, 0.05, 1);
    render();
  });
  addTrackedEvent(ui.backgroundImageOpacity, "change", () => {
    if (state.backgroundImage) {
      pushHistory("Change background image opacity");
    }
  });
  addTrackedEvent(ui.backgroundImageX, "change", (event) => {
    const value = Number(event.target.value);
    if (!state.backgroundImage || !Number.isFinite(value)) {
      syncBackgroundImageControls();
      return;
    }
    updateBackgroundImagePlacement({ x: round3(value) }, "Move background image");
  });
  addTrackedEvent(ui.backgroundImageY, "change", (event) => {
    const value = Number(event.target.value);
    if (!state.backgroundImage || !Number.isFinite(value)) {
      syncBackgroundImageControls();
      return;
    }
    updateBackgroundImagePlacement({ y: round3(value) }, "Move background image");
  });
  addTrackedEvent(ui.backgroundImageWidth, "change", (event) => {
    const value = Number(event.target.value);
    if (!state.backgroundImage || !Number.isFinite(value) || value <= 0) {
      syncBackgroundImageControls();
      return;
    }
    const aspect = state.backgroundImage.width / state.backgroundImage.height;
    updateBackgroundImagePlacement(
      { width: round3(value), height: round3(value / aspect) },
      "Resize background image"
    );
  });

  addTrackedEvent(ui.graph, "pointerdown", handlePointerDown);
  addTrackedEvent(ui.graph, "pointermove", handlePointerMove);
  addTrackedEvent(ui.graph, "pointerup", handlePointerUp);
  addTrackedEvent(ui.graph, "dblclick", handleDoubleClick);
  addTrackedEvent(ui.graph, "pointerleave", () => {
    if (!state.drag) {
      state.hoverWorld = null;
      state.hoverScreen = null;
      state.hoverTarget = null;
      state.midpointHoverWorld = null;
      render();
    }
  });
  addTrackedEvent(ui.graph, "wheel", handleWheel, { passive: false });

  addTrackedEvent(ui.graph, "contextmenu", (event) => {
    event.preventDefault();
    if (suppressGraphContextMenuOpen) {
      suppressGraphContextMenuOpen = false;
      return;
    }
    if (!ui.contextMenu.hidden) {
      hideContextMenu();
      return;
    }
    const screen = getScreenPointFromEvent(event);
    const world = screenToWorld(screen);
    const hitPoint = hitTestPoint(screen);
    const hitText = hitTestText(screen);
    const hitSegment = hitTestSegment(screen);
    const hitPolygon = hitTestPolygonLabel(screen) || hitTestPolygon(screen);
    const edgePick = findNearestEdge(world);
    const polygonEdgePick = edgePick?.edge?.edgeType === "polygon-edge" ? edgePick : null;
    const removablePolygon = hitPoint
      ? state.polygons.find((polygon) => polygon.pointIds.includes(hitPoint.id) && polygon.pointIds.length > 3) || null
      : null;
    const isEmptyArea =
      !hitPoint &&
      !hitText &&
      !hitSegment &&
      !hitPolygon;
    if (hitPoint) {
      const keepMultiSelection =
        state.selection.points.size > 1 &&
        state.selection.points.has(hitPoint.id);
      if (!keepMultiSelection) {
        clearSelection();
        state.selection.points.add(hitPoint.id);
      }
      render();
    } else if (hitSegment) {
      const keepMultiSelection =
        state.selection.segments.size > 1 &&
        state.selection.segments.has(hitSegment.id);
      if (!keepMultiSelection) {
        clearSelection();
        state.selection.segments.add(hitSegment.id);
      }
      render();
    } else if (hitPolygon) {
      const keepMultiSelection =
        state.selection.polygons.size > 1 &&
        state.selection.polygons.has(hitPolygon.id);
      if (!keepMultiSelection) {
        clearSelection();
        state.selection.polygons.add(hitPolygon.id);
      }
      render();
    }
    contextMenuEdgePick = polygonEdgePick;
    contextMenuVertexPointId = removablePolygon ? hitPoint.id : null;
    contextMenuTextId = hitText ? hitText.id : null;
    ui.joinPointsBtn.hidden = state.selection.points.size < 2;
    ui.editTextBtn.hidden = !hitText;
    ui.insertPolygonVertexBtn.hidden = !polygonEdgePick;
    ui.removePolygonVertexBtn.hidden = !removablePolygon;
    const canRunPolygonBoolean = state.selection.polygons.size === 2;
    ui.polygonUnionBtn.hidden = !canRunPolygonBoolean;
    ui.polygonSubtractBtn.hidden = !canRunPolygonBoolean;
    ui.polygonIntersectBtn.hidden = !canRunPolygonBoolean;
    ui.polygonUnionBtn.disabled = !canRunPolygonBoolean;
    ui.polygonSubtractBtn.disabled = !canRunPolygonBoolean;
    ui.polygonIntersectBtn.disabled = !canRunPolygonBoolean;
    ui.viewPointsBtn.dataset.context = isEmptyArea ? "empty" : "objects";
    showContextMenu(event.clientX, event.clientY);
  });

  addTrackedEvent(ui.viewPointsBtn, "click", () => {
    hideContextMenu();
    if (ui.viewPointsBtn.dataset.context === "empty") {
      showPointListDialog("0, 0\n5, 0\n4, 3\n1, 4");
      setStatus("Enter coordinates and choose Update.");
      return;
    }
    showPointListDialog(pointsToCoordinateList());
  });
  addTrackedEvent(ui.editTextBtn, "click", () => {
    const textId = contextMenuTextId;
    hideContextMenu();
    const text = textId ? getTextById(textId) : null;
    if (!text) {
      setStatus("Selected text no longer exists.", "warning");
      return;
    }
    const screen = worldToScreen(text);
    openInlineTextEditor(screen, { textId: text.id, world: { x: text.x, y: text.y }, initialValue: text.content });
    setStatus("Editing text. Press Enter to save.");
  });

  addTrackedEvent(ui.joinPointsBtn, "click", () => {
    hideContextMenu();
    joinSelectedPoints();
  });

  addTrackedEvent(ui.insertPolygonVertexBtn, "click", () => {
    const edgePick = contextMenuEdgePick;
    hideContextMenu();
    insertPolygonVertexOnEdge(edgePick);
  });

  addTrackedEvent(ui.removePolygonVertexBtn, "click", () => {
    const pointId = contextMenuVertexPointId;
    hideContextMenu();
    if (!Number.isInteger(pointId)) {
      setStatus("Select a polygon vertex to remove.", "warning");
      return;
    }
    removePolygonVertex(pointId);
  });

  addTrackedEvent(ui.polygonUnionBtn, "click", () => {
    hideContextMenu();
    runPolygonBooleanOperation("union");
  });

  addTrackedEvent(ui.polygonSubtractBtn, "click", () => {
    hideContextMenu();
    runPolygonBooleanOperation("subtract");
  });

  addTrackedEvent(ui.polygonIntersectBtn, "click", () => {
    hideContextMenu();
    runPolygonBooleanOperation("intersect");
  });

  addTrackedEvent(ui.copyPointsBtn, "click", async () => {
    ui.pointsOutput.select();
    try {
      await navigator.clipboard.writeText(ui.pointsOutput.value);
      setStatus("Coordinates copied.");
    } catch {
      document.execCommand("copy");
      setStatus("Coordinates copied.");
    }
  });

  addTrackedEvent(ui.pointsOutput, "input", updateCoordinateInspector);

  addTrackedEvent(ui.lineStyleSelect, "change", (event) => {
    updateSelectedSegmentLineStyle(event.target.value);
    updateCoordinateInspector();
  });

  addTrackedEvent(ui.drawPointsBtn, "click", () => {
    drawShapeFromCoordinateInput();
  });

  addTrackedEvent(ui.pointsDialog, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      ui.pointsDialog.close();
    }
  });

  addTrackedEvent(globalThis, "pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    if (!(event.target instanceof Node) || !ui.contextMenu.contains(event.target)) {
      hideContextMenu();
    }
  }, true);

  addTrackedEvent(globalThis, "contextmenu", (event) => {
    if (!ui.contextMenu.hidden) {
      suppressGraphContextMenuOpen = true;
      hideContextMenu();
      if (event.target instanceof Node && (ui.graph.contains(event.target) || ui.contextMenu.contains(event.target))) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!(event.target instanceof Node) || (!ui.graph.contains(event.target) && !ui.contextMenu.contains(event.target))) {
      hideContextMenu();
    }
  }, true);

  addTrackedEvent(globalThis, "keydown", handleKeyDown);
  addTrackedEvent(globalThis, "resize", render);
  addTrackedEvent(globalThis, "beforeunload", () => {
    persistAutosaveNow();
  });

  let _printStyle = null;
  addTrackedEvent(globalThis, "beforeprint", () => {
    // Screen aspect rarely matches paper, so just pick the paper orientation
    // that fits the current view best; the SVG's own aspect ratio (from its
    // viewBox) is preserved and scaled to fit within that page via "meet".
    const landscape = lastViewportAspect >= 1;
    _printStyle = document.createElement("style");
    _printStyle.textContent = `@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 0; }`;
    document.head.appendChild(_printStyle);
  });
  addTrackedEvent(globalThis, "afterprint", () => {
    _printStyle?.remove();
    _printStyle = null;
  });

  addTrackedEvent(ui.inlineTextEditor, "keydown", (event) => {
    if (event.key === "Enter") {
      if (event.isComposing || event.keyCode === 229) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      closeInlineTextEditor(true, state.mode === "text");
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeInlineTextEditor(false, true);
    }
  });
  addTrackedEvent(ui.inlineTextEditor, "blur", () => {
    closeInlineTextEditor(true, false);
  });

  return () => {
    for (let index = disposers.length - 1; index >= 0; index -= 1) {
      disposers[index]();
    }
  };
}

function bootstrap() {
  flushRender();
  disposeWiredEvents?.();
  disposeWiredEvents = null;
  historyActions = [];
  lastAutosaveSnapshot = "";
  exposePerfCounters();
  Object.assign(ui, queryUi(document));
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  applyTheme(savedTheme === "dark" ? "dark" : "light");
  loadDisplaySettings();
  syncDisplayControlsToState();
  ui.versionBadge.textContent = `v${VERSION}`;
  initializeDemoGeometry();
  const recoveredAutosave = restoreAutosaveDraft();
  disposeWiredEvents = wireEvents();
  setMode("select");
  pushHistory(recoveredAutosave ? "Recover autosaved draft" : "Initialize diagram");
  render();
  setStatus(
    recoveredAutosave
      ? "Recovered autosaved draft. Ready. Right click the graph for coordinate tools. Shortcuts: 1-9, 0 tools, Ctrl+Z, Ctrl+Y."
      : "Ready. Right click the graph for coordinate tools. Shortcuts: 1-9, 0 tools, Ctrl+Z, Ctrl+Y."
  );
}

// Only auto-run in a browser; importing this module headlessly does no DOM work.
if (typeof document !== "undefined") {
  bootstrap();
}
