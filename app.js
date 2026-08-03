import {
  calculateDistance,
  calculatePerimeter,
  findSelfIntersections,
} from './distance.js';

const defaultPoints = `Corner A, 0, 0
Corner B, 40, 30
Corner C, 80, -35
Corner D, 100, 0`;

const defaultJoins = "";

const CANVAS_EDIT_DECIMALS = 2;
const POINT_HIT_RADIUS_PX = 12;
const KEYBOARD_NUDGE_DEFAULT = 0.5;
const KEYBOARD_NUDGE_FINE = 0.1;
const KEYBOARD_NUDGE_COARSE = 2;

const interactionState = {
  viewportBounds: null,
  draggingPointIndex: -1,
  selectedPointIndex: -1,
  selectedPointIndices: new Set(),
  selectedArcIndex: -1,
  angleArcs: [],
  segments: [],
  annotations: [],
  selectedAnnotationIndex: -1,
  draggingAnnotationIndex: -1,
  annotationDragOffset: null,
  hoverPointIndex: -1,
  hoverSegmentActive: false,
  dragPoints: null,
  dragStartText: "",
  renderModel: null,
  undoStack: [],
  redoStack: [],
  maxHistoryEntries: 100,
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setStatus(message) {
  const statusEl = document.getElementById("status-message");
  if (statusEl) {
    statusEl.textContent = message;
  }
}

function syncTextSizeControl() {
  const textSize = document.getElementById("text-size");
  const textSizeValue = document.getElementById("text-size-value");
  const annotation = interactionState.annotations[interactionState.selectedAnnotationIndex];
  const size = clamp(Number(annotation?.fontSize) || 16, 10, 48);
  if (textSize) {
    textSize.value = String(size);
  }
  if (textSizeValue) {
    textSizeValue.value = `${size} px`;
    textSizeValue.textContent = `${size} px`;
  }
}

function getDownloadBaseName(value, fallback) {
  const trimmed = String(value || "").trim();
  const normalized = trimmed
    .replace(/[\\/]+/g, "_")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized || fallback;
}

function getCurrentConfig() {
  const pointsInput = document.getElementById("points-input");
  const joinsInput = document.getElementById("joins-input");
  const showPoints = document.getElementById("show-points");
  const showGridlines = document.getElementById("show-gridlines");
  const showLabels = document.getElementById("show-labels");
  const showAngleArcs = document.getElementById("show-angle-arcs");
  const showSegments = document.getElementById("show-segments");

  return {
    points: pointsInput.value,
    joins: joinsInput.value,
    showPoints: showPoints.checked,
    showGridlines: showGridlines.checked,
    showLabels: showLabels.checked,
    showAngleArcs: showAngleArcs.checked,
    showSegments: showSegments.checked,
    angleArcs: interactionState.angleArcs,
    segments: interactionState.segments,
    annotations: interactionState.annotations,
    colors: getColorSettings(),
  };
}

const colorSettings = [
  ["color-boundary", "--plot-boundary"],
  ["color-point", "--plot-point"],
  ["color-label", "--plot-text"],
  ["color-segment", "--plot-join"],
  ["color-arc", "--plot-area-text"],
];

function getColorSettings() {
  return Object.fromEntries(colorSettings.map(([inputId, property]) => {
    return [property, document.getElementById(inputId)?.value || ""];
  }));
}

function applyColorSettings(colors = {}) {
  colorSettings.forEach(([inputId, property]) => {
    const input = document.getElementById(inputId);
    const color = colors[property];
    if (input && /^#[0-9a-f]{6}$/i.test(color || "")) {
      input.value = color;
      document.documentElement.style.setProperty(property, color);
    }
  });
}

function resetColorSettings() {
  colorSettings.forEach(([inputId, property]) => {
    document.documentElement.style.removeProperty(property);
    const input = document.getElementById(inputId);
    if (input) {
      input.value = getComputedStyle(document.documentElement).getPropertyValue(property).trim();
    }
  });
}

function buildSvgDocument(svgContent, config, viewBox, width, height) {
  const payload = JSON.stringify(config);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${width}" height="${height}">
  <metadata id="fmb-config">${escapeHtml(payload)}</metadata>
  <style>
    text { font-family: Inter, 'Segoe UI', Roboto, sans-serif; }
    .axis-label { font-weight: 700; }
    .tick-label { fill: #475569; }
  </style>
  ${svgContent}
</svg>`;
}

function downloadSvgFile(fileName, config, svgContent, viewBox, width, height) {
  const blob = new Blob([buildSvgDocument(svgContent, config, viewBox, width, height)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function parseCoordinateText(rawText, fallbackNamePrefix) {
  const result = [];
  const warnings = [];

  rawText.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }

    let name = `${fallbackNamePrefix} ${index + 1}`;
    let coordText = line;

    if (line.includes(":")) {
      const [namePart, rest] = line.split(":", 2);
      name = namePart.trim() || name;
      coordText = rest.trim();
    }

    coordText = coordText.replace(/\(|\)/g, "").trim();
    const parts = coordText.replace(/;/g, ",").split(",").map((part) => part.trim()).filter(Boolean);

    if (parts.length < 2) {
      warnings.push(`Line ${index + 1}: could not parse '${rawLine}'.`);
      return;
    }

    try {
      let x;
      let y;
      if (parts.length >= 3 && !/^[-+]?\d*\.?\d+$/.test(parts[0])) {
        name = parts[0];
        x = Number(parts[1]);
        y = Number(parts[2]);
      } else {
        x = Number(parts[0]);
        y = Number(parts[1]);
      }

      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error();
      }

      result.push({ x, y, name });
    } catch {
      warnings.push(`Line ${index + 1}: could not parse '${rawLine}'.`);
    }
  });

  return { result, warnings };
}

function calculateArea(points) {
  if (points.length < 3) {
    return {
      areaSqm: 0,
      hectares: 0,
      ares: 0,
      remSqm: 0,
      acres: 0,
      cents: 0,
      sqft: 0,
    };
  }

  const bx = points.map((point) => point.x);
  const by = points.map((point) => point.y);
  const bxDraw = [...bx, bx[0]];
  const byDraw = [...by, by[0]];

  let areaSqm = 0;
  for (let index = 0; index < bxDraw.length - 1; index += 1) {
    areaSqm += bxDraw[index] * byDraw[index + 1] - bxDraw[index + 1] * byDraw[index];
  }

  areaSqm = Math.abs(areaSqm) * 0.5;
  const hectares = Math.floor(areaSqm / 10000);
  const leftoverAfterHect = areaSqm % 10000;
  const ares = Math.floor(leftoverAfterHect / 100);
  const remSqm = leftoverAfterHect % 100;

  return {
    areaSqm,
    hectares,
    ares,
    remSqm,
    acres: areaSqm / 4046.8564224,
    cents: (areaSqm / 4046.8564224) * 100,
    sqft: areaSqm * 10.76391041671,
  };
}

function boxesOverlap(boxA, boxB) {
  return !(
    boxA.x + boxA.width < boxB.x ||
    boxB.x + boxB.width < boxA.x ||
    boxA.y + boxA.height < boxB.y ||
    boxB.y + boxB.height < boxA.y
  );
}

function estimateLabelBox(x, y, text, anchor, fontSize = 12) {
  const width = Math.max(36, text.length * (fontSize * 0.6) + 10);
  const height = fontSize + 8;
  const left = anchor === "end" ? x - width : x;
  const top = y - fontSize;
  return { x: left, y: top, width, height };
}

function fitsInsideCanvas(box, width, height, padding) {
  return (
    box.x >= padding &&
    box.y >= padding &&
    box.x + box.width <= width - padding &&
    box.y + box.height <= height - padding
  );
}

function getLabelPosition(px, py, text, width, height, occupied, options = {}) {
  const padding = options.padding ?? 8;
  const offset = options.offset ?? 8;
  const fontSize = options.fontSize ?? 12;
  const candidates = [
    { x: px + offset, y: py - offset, anchor: "start" },
    { x: px - offset, y: py - offset, anchor: "end" },
    { x: px + offset, y: py + offset + fontSize, anchor: "start" },
    { x: px - offset, y: py + offset + fontSize, anchor: "end" },
    { x: px + offset, y: py, anchor: "start" },
    { x: px - offset, y: py, anchor: "end" },
  ];

  for (const candidate of candidates) {
    const box = estimateLabelBox(candidate.x, candidate.y, text, candidate.anchor, fontSize);
    if (!fitsInsideCanvas(box, width, height, padding)) {
      continue;
    }

    const hasCollision = occupied.some((usedBox) => boxesOverlap(usedBox, box));
    if (!hasCollision) {
      occupied.push(box);
      return candidate;
    }
  }

  const fallback = candidates[0];
  const fallbackBox = estimateLabelBox(fallback.x, fallback.y, text, fallback.anchor, fontSize);
  const clampedBox = {
    x: Math.min(Math.max(fallbackBox.x, padding), width - padding - fallbackBox.width),
    y: Math.min(Math.max(fallbackBox.y, padding), height - padding - fallbackBox.height),
    width: fallbackBox.width,
    height: fallbackBox.height,
  };
  occupied.push(clampedBox);

  const clampedX = fallback.anchor === "end"
    ? clampedBox.x + clampedBox.width
    : clampedBox.x;
  const clampedY = clampedBox.y + fontSize;

  return { x: clampedX, y: clampedY, anchor: fallback.anchor };
}

function getThemeColors() {
  const style = getComputedStyle(document.documentElement);
  return {
    plotBg: style.getPropertyValue("--svg-bg").trim(),
    plotBorder: style.getPropertyValue("--svg-border").trim(),
    plotGrid: style.getPropertyValue("--plot-grid").trim(),
    plotAxis: style.getPropertyValue("--plot-axis").trim(),
    plotAxisText: style.getPropertyValue("--plot-axis-text").trim(),
    plotLabel: style.getPropertyValue("--plot-label").trim(),
    plotBoundary: style.getPropertyValue("--plot-boundary").trim(),
    plotPoint: style.getPropertyValue("--plot-point").trim(),
    plotAux: style.getPropertyValue("--plot-aux").trim(),
    plotText: style.getPropertyValue("--plot-text").trim(),
    plotCenterText: style.getPropertyValue("--plot-center-text").trim(),
    plotCenterOpacity: style.getPropertyValue("--plot-center-opacity").trim(),
    plotJoin: style.getPropertyValue("--plot-join").trim(),
    plotJoinLabel: style.getPropertyValue("--plot-join-label").trim(),
    plotAreaText: style.getPropertyValue("--plot-area-text").trim(),
  };
}

function roundCoord(value) {
  const factor = 10 ** CANVAS_EDIT_DECIMALS;
  return Math.round(value * factor) / factor;
}

function calculateAngleDegrees(firstPoint, vertexPoint, lastPoint) {
  const firstVector = { x: firstPoint.x - vertexPoint.x, y: firstPoint.y - vertexPoint.y };
  const lastVector = { x: lastPoint.x - vertexPoint.x, y: lastPoint.y - vertexPoint.y };
  const magnitude = Math.hypot(firstVector.x, firstVector.y) * Math.hypot(lastVector.x, lastVector.y);
  if (magnitude === 0) {
    return Number.NaN;
  }

  const cosine = clamp((firstVector.x * lastVector.x + firstVector.y * lastVector.y) / magnitude, -1, 1);
  return Math.acos(cosine) * (180 / Math.PI);
}

function normalizeGeometrySelections(pointCount) {
  interactionState.selectedPointIndices = new Set(
    [...interactionState.selectedPointIndices].filter((index) => index >= 0 && index < pointCount),
  );
  interactionState.selectedPointIndex = interactionState.selectedPointIndices.size === 1
    ? [...interactionState.selectedPointIndices][0]
    : -1;
  interactionState.angleArcs = interactionState.angleArcs.filter((arc) => {
    return Array.isArray(arc) && arc.length === 3 && arc.every((index) => Number.isInteger(index) && index >= 0 && index < pointCount);
  });
  interactionState.segments = interactionState.segments.filter((segment) => {
    return Array.isArray(segment) && segment.length === 2 && segment.every((index) => Number.isInteger(index) && index >= 0 && index < pointCount);
  });
  interactionState.selectedArcIndex = clamp(interactionState.selectedArcIndex, -1, interactionState.angleArcs.length - 1);
}

function adjustGeometryIndices(afterIndex, delta) {
  const adjust = (index) => index >= afterIndex ? index + delta : index;
  interactionState.selectedPointIndices = new Set([...interactionState.selectedPointIndices].map(adjust));
  interactionState.angleArcs = interactionState.angleArcs.map((arc) => arc.map(adjust));
  interactionState.segments = interactionState.segments.map((segment) => segment.map(adjust));
}

function addAngleArcFromSelection() {
  if (interactionState.selectedPointIndices.size !== 3) {
    return false;
  }

  const arc = [...interactionState.selectedPointIndices];
  const alreadyExists = interactionState.angleArcs.some((existingArc) => existingArc.every((index, position) => index === arc[position]));
  if (!alreadyExists) {
    interactionState.angleArcs.push(arc);
    interactionState.selectedArcIndex = interactionState.angleArcs.length - 1;
  }
  return true;
}

function addSegmentFromSelection() {
  if (interactionState.selectedPointIndices.size !== 2) {
    setStatus("Ctrl-select exactly two points to create a segment.");
    return;
  }

  const segment = [...interactionState.selectedPointIndices];
  const alreadyExists = interactionState.segments.some((existingSegment) => {
    return (existingSegment[0] === segment[0] && existingSegment[1] === segment[1])
      || (existingSegment[0] === segment[1] && existingSegment[1] === segment[0]);
  });
  if (!alreadyExists) {
    interactionState.segments.push(segment);
  }
  render();
  setStatus(alreadyExists ? "That segment already exists." : "Segment created from the two selected points.");
}

function addTextAnnotation() {
  const model = interactionState.renderModel;
  if (!model) {
    return;
  }

  const textSize = Number(document.getElementById("text-size").value);
  interactionState.annotations.push({
    text: "New text",
    x: roundCoord((model.plotSpace.minX + model.plotSpace.maxX) / 2),
    y: roundCoord((model.plotSpace.minY + model.plotSpace.maxY) / 2),
    fontSize: textSize,
  });
  interactionState.selectedAnnotationIndex = interactionState.annotations.length - 1;
  syncTextSizeControl();
  render();
  requestAnimationFrame(() => {
    document.querySelector(`[data-annotation-editor="${interactionState.selectedAnnotationIndex}"]`)?.focus();
  });
  setStatus("Text added. Edit it directly on the plot.");
}

function getAnnotationIndexFromTarget(target) {
  const annotationElement = target instanceof Element ? target.closest("[data-annotation-index]") : null;
  return Number(annotationElement?.dataset.annotationIndex);
}

function updateSelectedAnnotationPosition(svgPoint) {
  const annotation = interactionState.annotations[interactionState.draggingAnnotationIndex];
  const model = interactionState.renderModel;
  if (!annotation || !model || !interactionState.annotationDragOffset) {
    return;
  }

  annotation.x = roundCoord(model.plotSpace.pxToX(svgPoint.x) - interactionState.annotationDragOffset.x);
  annotation.y = roundCoord(model.plotSpace.pxToY(svgPoint.y) - interactionState.annotationDragOffset.y);
  render();
}

function moveSelectedAnnotationBy(deltaX, deltaY) {
  const annotation = interactionState.annotations[interactionState.selectedAnnotationIndex];
  if (!annotation) {
    return false;
  }
  annotation.x = roundCoord(annotation.x + deltaX);
  annotation.y = roundCoord(annotation.y + deltaY);
  render();
  return true;
}

function removeSelectedAnnotation() {
  const index = interactionState.selectedAnnotationIndex;
  if (index < 0 || index >= interactionState.annotations.length) {
    return false;
  }
  interactionState.annotations.splice(index, 1);
  interactionState.selectedAnnotationIndex = -1;
  render();
  setStatus("Text removed.");
  return true;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAngleRadians(angle) {
  const twoPi = Math.PI * 2;
  let normalized = angle;
  while (normalized <= -Math.PI) {
    normalized += twoPi;
  }
  while (normalized > Math.PI) {
    normalized -= twoPi;
  }
  return normalized;
}

function getAngleArcGeometry(previousPoint, vertexPoint, nextPoint, radius, interiorAngleDegrees) {
  const startAngle = Math.atan2(previousPoint.y - vertexPoint.y, previousPoint.x - vertexPoint.x);
  const endAngleRaw = Math.atan2(nextPoint.y - vertexPoint.y, nextPoint.x - vertexPoint.x);
  const deltaShort = normalizeAngleRadians(endAngleRaw - startAngle);

  if (Math.abs(deltaShort) < 1e-6) {
    return null;
  }

  const isReflex = interiorAngleDegrees > 180;
  const displayedAngle = isReflex ? 360 - interiorAngleDegrees : interiorAngleDegrees;
  const largeArcFlag = 0;
  const sweepFlag = deltaShort > 0 ? 1 : 0;
  const deltaForLabel = deltaShort;
  const arcStartX = vertexPoint.x + radius * Math.cos(startAngle);
  const arcStartY = vertexPoint.y + radius * Math.sin(startAngle);
  const arcEndX = vertexPoint.x + radius * Math.cos(endAngleRaw);
  const arcEndY = vertexPoint.y + radius * Math.sin(endAngleRaw);
  const bisectorAngle = startAngle + deltaForLabel / 2;
  const labelRadius = radius + 14;
  const labelX = vertexPoint.x + labelRadius * Math.cos(bisectorAngle);
  const labelY = vertexPoint.y + labelRadius * Math.sin(bisectorAngle);

  return {
    isReflex,
    displayedAngle,
    largeArcFlag,
    sweepFlag,
    arcStartX,
    arcStartY,
    arcEndX,
    arcEndY,
    labelX,
    labelY,
  };
}

function pointsToText(points) {
  return points
    .map((point, index) => {
      const name = String(point.name || `Point ${index + 1}`).trim() || `Point ${index + 1}`;
      return `${name}, ${roundCoord(point.x)}, ${roundCoord(point.y)}`;
    })
    .join("\n");
}

function pushUndoSnapshot(snapshot) {
  interactionState.undoStack.push(snapshot);
  if (interactionState.undoStack.length > interactionState.maxHistoryEntries) {
    interactionState.undoStack.shift();
  }
}

function updateHistoryButtons() {
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");

  if (undoBtn) {
    undoBtn.disabled = interactionState.undoStack.length === 0;
  }
  if (redoBtn) {
    redoBtn.disabled = interactionState.redoStack.length === 0;
  }
}

function setPointsText(text, options = {}) {
  const pointsInput = document.getElementById("points-input");
  const nextText = String(text ?? "");
  const previousText = pointsInput.value;

  if (previousText === nextText && options.forceRender !== true) {
    updateHistoryButtons();
    return;
  }

  if (options.recordHistory) {
    pushUndoSnapshot(previousText);
    interactionState.redoStack = [];
  }

  pointsInput.value = nextText;
  render();
  if (options.statusMessage) {
    setStatus(options.statusMessage);
  }
  updateHistoryButtons();
}

function undoPointsChange() {
  if (interactionState.undoStack.length === 0) {
    setStatus("Nothing to undo.");
    updateHistoryButtons();
    return;
  }

  const pointsInput = document.getElementById("points-input");
  const currentText = pointsInput.value;
  const previousText = interactionState.undoStack.pop();
  interactionState.redoStack.push(currentText);
  pointsInput.value = previousText;
  render();
  setStatus("Undo applied.");
  updateHistoryButtons();
}

function redoPointsChange() {
  if (interactionState.redoStack.length === 0) {
    setStatus("Nothing to redo.");
    updateHistoryButtons();
    return;
  }

  const pointsInput = document.getElementById("points-input");
  const currentText = pointsInput.value;
  const nextText = interactionState.redoStack.pop();
  pushUndoSnapshot(currentText);
  pointsInput.value = nextText;
  render();
  setStatus("Redo applied.");
  updateHistoryButtons();
}

function createPlotSpace(points, joins, width, height, margin, options = {}) {
  const bounds = options.bounds || null;
  const expandForEditing = Boolean(options.expandForEditing);
  const paddingFactor = options.paddingFactor ?? 0.35;
  const xValues = [0, ...points.map((point) => point.x), ...joins.map((point) => point.x)];
  const yValues = [0, ...points.map((point) => point.y), ...joins.map((point) => point.y)];

  const rawMinX = Math.min(...xValues);
  const rawMaxX = Math.max(...xValues);
  const rawMinY = Math.min(...yValues);
  const rawMaxY = Math.max(...yValues);
  const rawXSpan = Math.max(rawMaxX - rawMinX, 1);
  const rawYSpan = Math.max(rawMaxY - rawMinY, 1);

  const paddingX = expandForEditing ? rawXSpan * paddingFactor : 0;
  const paddingY = expandForEditing ? rawYSpan * paddingFactor : 0;

  const minX = bounds ? bounds.minX : rawMinX - paddingX;
  const maxX = bounds ? bounds.maxX : rawMaxX + paddingX;
  const minY = bounds ? bounds.minY : rawMinY - paddingY;
  const maxY = bounds ? bounds.maxY : rawMaxY + paddingY;
  const xSpan = Math.max(maxX - minX, 1);
  const ySpan = Math.max(maxY - minY, 1);

  const xToPx = (value) => margin + ((value - minX) / xSpan) * (width - margin * 2);
  const yToPx = (value) => height - margin - ((value - minY) / ySpan) * (height - margin * 2);
  const pxToX = (px) => minX + ((px - margin) / (width - margin * 2)) * xSpan;
  const pxToY = (py) => minY + ((height - margin - py) / (height - margin * 2)) * ySpan;

  return {
    minX,
    maxX,
    minY,
    maxY,
    xSpan,
    ySpan,
    xToPx,
    yToPx,
    pxToX,
    pxToY,
    margin,
    width,
    height,
  };
}

function getSvgCoordinatesFromEvent(event, plot) {
  const rect = plot.getBoundingClientRect();
  const viewBox = plot.viewBox?.baseVal;
  const viewWidth = viewBox?.width || 800;
  const viewHeight = viewBox?.height || 500;

  return {
    x: ((event.clientX - rect.left) / rect.width) * viewWidth,
    y: ((event.clientY - rect.top) / rect.height) * viewHeight,
  };
}

function getNearestPointIndex(svgPoint, points, plotSpace, hitRadiusPx = POINT_HIT_RADIUS_PX) {
  let bestIndex = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  points.forEach((point, index) => {
    const px = plotSpace.xToPx(point.x);
    const py = plotSpace.yToPx(point.y);
    const distance = Math.hypot(svgPoint.x - px, svgPoint.y - py);
    if (distance <= hitRadiusPx && distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function getNearestSegmentInsertion(svgPoint, points, plotSpace, hitRadiusPx = POINT_HIT_RADIUS_PX) {
  if (points.length < 2) {
    return null;
  }

  let best = null;

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    const ax = plotSpace.xToPx(start.x);
    const ay = plotSpace.yToPx(start.y);
    const bx = plotSpace.xToPx(end.x);
    const by = plotSpace.yToPx(end.y);
    const abx = bx - ax;
    const aby = by - ay;
    const abSquared = abx * abx + aby * aby;
    if (abSquared <= 0) {
      continue;
    }

    const apx = svgPoint.x - ax;
    const apy = svgPoint.y - ay;
    const t = Math.min(1, Math.max(0, (apx * abx + apy * aby) / abSquared));
    const projectionX = ax + abx * t;
    const projectionY = ay + aby * t;
    const distance = Math.hypot(svgPoint.x - projectionX, svgPoint.y - projectionY);

    if (distance > hitRadiusPx) {
      continue;
    }

    if (!best || distance < best.distance) {
      best = {
        distance,
        insertIndex: index + 1,
        projectionX,
        projectionY,
      };
    }
  }

  return best;
}

function selectPoint(pointIndex, additive) {
  if (!additive) {
    interactionState.selectedPointIndices = new Set([pointIndex]);
  } else if (interactionState.selectedPointIndices.has(pointIndex)) {
    interactionState.selectedPointIndices.delete(pointIndex);
  } else {
    interactionState.selectedPointIndices.add(pointIndex);
  }
  interactionState.selectedArcIndex = -1;
  interactionState.selectedPointIndex = interactionState.selectedPointIndices.size === 1
    ? [...interactionState.selectedPointIndices][0]
    : -1;
}

function setPlotInteractionClasses() {
  const plot = document.getElementById("plot");
  if (!plot) {
    return;
  }

  plot.classList.add("edit-enabled");
  plot.classList.toggle("dragging-point", interactionState.draggingPointIndex >= 0);
  plot.classList.toggle(
    "hover-point",
    interactionState.hoverPointIndex >= 0 && interactionState.draggingPointIndex < 0,
  );
  plot.classList.toggle(
    "hover-segment",
    interactionState.hoverPointIndex < 0 && interactionState.hoverSegmentActive && interactionState.draggingPointIndex < 0,
  );
}

function clearHoverState() {
  if (interactionState.hoverPointIndex !== -1 || interactionState.hoverSegmentActive) {
    interactionState.hoverPointIndex = -1;
    interactionState.hoverSegmentActive = false;
    setPlotInteractionClasses();
    render();
  }
}

function getViewportBounds(points, joins) {
  const plotSpace = createPlotSpace(points, joins, 800, 500, 70, {
    expandForEditing: false,
  });

  return {
    minX: plotSpace.minX,
    maxX: plotSpace.maxX,
    minY: plotSpace.minY,
    maxY: plotSpace.maxY,
  };
}

function growViewportToIncludePoints(points, joins) {
  if (!interactionState.viewportBounds) {
    return false;
  }

  const all = [...points, ...joins];
  if (all.length === 0) {
    return false;
  }

  const xs = all.map((point) => point.x);
  const ys = all.map((point) => point.y);
  const fitMinX = Math.min(...xs);
  const fitMaxX = Math.max(...xs);
  const fitMinY = Math.min(...ys);
  const fitMaxY = Math.max(...ys);
  const padX = Math.max((fitMaxX - fitMinX) * 0.05, 1);
  const padY = Math.max((fitMaxY - fitMinY) * 0.05, 1);
  const bounds = interactionState.viewportBounds;
  const next = {
    minX: Math.min(bounds.minX, fitMinX - padX),
    maxX: Math.max(bounds.maxX, fitMaxX + padX),
    minY: Math.min(bounds.minY, fitMinY - padY),
    maxY: Math.max(bounds.maxY, fitMaxY + padY),
  };

  const changed = next.minX !== bounds.minX
    || next.maxX !== bounds.maxX
    || next.minY !== bounds.minY
    || next.maxY !== bounds.maxY;

  if (changed) {
    interactionState.viewportBounds = next;
  }
  return changed;
}

function getPointDeletionResult(points, selectedPointIndex) {
  if (selectedPointIndex < 0 || selectedPointIndex >= points.length) {
    return null;
  }

  const nextPoints = points.filter((_, index) => index !== selectedPointIndex);
  const nextSelectedIndex = nextPoints.length === 0
    ? -1
    : clamp(selectedPointIndex, 0, nextPoints.length - 1);

  return {
    nextPoints,
    nextSelectedIndex,
    removedPointNumber: selectedPointIndex + 1,
  };
}

function updatePointsInputAndRender(points, statusMessage, options = {}) {
  setPointsText(pointsToText(points), {
    recordHistory: Boolean(options.recordHistory),
    statusMessage,
  });
}

function addPointAtSvgCoordinate(svgPoint) {
  const model = interactionState.renderModel;
  if (!model) {
    return;
  }

  const { plotSpace } = model;
  const minPlotX = plotSpace.margin;
  const maxPlotX = plotSpace.width - plotSpace.margin;
  const minPlotY = plotSpace.margin;
  const maxPlotY = plotSpace.height - plotSpace.margin;

  const clampedX = Math.min(Math.max(svgPoint.x, minPlotX), maxPlotX);
  const clampedY = Math.min(Math.max(svgPoint.y, minPlotY), maxPlotY);
  const x = roundCoord(plotSpace.pxToX(clampedX));
  const y = roundCoord(plotSpace.pxToY(clampedY));
  const nextIndex = model.points.length + 1;
  const nextPoint = {
    name: `Point ${nextIndex}`,
    x,
    y,
  };

  const nextPoints = [...model.points, nextPoint];
  interactionState.selectedPointIndices = new Set([nextPoints.length - 1]);
  interactionState.selectedPointIndex = nextPoints.length - 1;
  updatePointsInputAndRender(
    nextPoints,
    `Point ${nextIndex} added at (${x.toFixed(2)}, ${y.toFixed(2)}).`,
    { recordHistory: true },
  );
}

function insertPointOnNearestSegment(segmentMatch) {
  const model = interactionState.renderModel;
  if (!model || !segmentMatch) {
    return;
  }

  const x = roundCoord(model.plotSpace.pxToX(segmentMatch.projectionX));
  const y = roundCoord(model.plotSpace.pxToY(segmentMatch.projectionY));
  const nextIndex = model.points.length + 1;
  const nextPoint = {
    name: `Point ${nextIndex}`,
    x,
    y,
  };

  const nextPoints = [...model.points];
  nextPoints.splice(segmentMatch.insertIndex, 0, nextPoint);
  adjustGeometryIndices(segmentMatch.insertIndex, 1);
  interactionState.selectedPointIndices = new Set([segmentMatch.insertIndex]);
  interactionState.selectedPointIndex = segmentMatch.insertIndex;
  updatePointsInputAndRender(
    nextPoints,
    `Point inserted on edge at (${x.toFixed(2)}, ${y.toFixed(2)}).`,
    { recordHistory: true },
  );
}

function handlePlotPointerDown(event) {
  const annotationIndex = getAnnotationIndexFromTarget(event.target);
  if (Number.isInteger(annotationIndex) && annotationIndex >= 0 && annotationIndex < interactionState.annotations.length) {
    interactionState.selectedAnnotationIndex = annotationIndex;
    syncTextSizeControl();
    event.preventDefault();
    const plot = event.currentTarget;
    const annotation = interactionState.annotations[annotationIndex];
    const model = interactionState.renderModel;
    const svgPoint = getSvgCoordinatesFromEvent(event, plot);
    interactionState.draggingAnnotationIndex = annotationIndex;
    interactionState.annotationDragOffset = {
      x: model.plotSpace.pxToX(svgPoint.x) - annotation.x,
      y: model.plotSpace.pxToY(svgPoint.y) - annotation.y,
    };
    plot.setPointerCapture(event.pointerId);
    plot.focus({ preventScroll: true });
    render();
    setStatus("Text selected. Drag or use arrow keys to move it.");
    return;
  }
  event.preventDefault();

  const activeElement = document.activeElement;
  if (activeElement && typeof activeElement.blur === "function") {
    activeElement.blur();
  }

  const plot = event.currentTarget;
  const model = interactionState.renderModel;
  if (!plot || !model) {
    return;
  }

  if (typeof plot.focus === "function") {
    plot.focus({ preventScroll: true });
  }

  const svgPoint = getSvgCoordinatesFromEvent(event, plot);
  const arcIndex = Number(event.target?.dataset?.arcIndex);
  if (Number.isInteger(arcIndex) && arcIndex >= 0 && arcIndex < interactionState.angleArcs.length) {
    interactionState.selectedArcIndex = arcIndex;
    interactionState.selectedPointIndices.clear();
    interactionState.selectedPointIndex = -1;
    render();
    setStatus("Angle arc selected. Press Delete or Backspace to remove it.");
    return;
  }
  const nearestPointIndex = getNearestPointIndex(svgPoint, model.points, model.plotSpace);

  if (nearestPointIndex >= 0) {
    selectPoint(nearestPointIndex, event.ctrlKey || event.metaKey);
    if (event.ctrlKey || event.metaKey) {
      const createdArc = addAngleArcFromSelection();
      render();
      setStatus(createdArc
        ? "Angle arc created from the three selected points."
        : `${interactionState.selectedPointIndices.size} points selected.`);
      return;
    }
    interactionState.draggingPointIndex = nearestPointIndex;
    interactionState.dragPoints = model.points.map((point) => ({ ...point }));
    interactionState.dragStartText = document.getElementById("points-input").value;
    interactionState.hoverPointIndex = nearestPointIndex;
    interactionState.hoverSegmentActive = false;
    plot.setPointerCapture(event.pointerId);
    setPlotInteractionClasses();
    setStatus(`Point ${nearestPointIndex + 1} selected.`);
    return;
  }

  const nearestSegment = getNearestSegmentInsertion(svgPoint, model.points, model.plotSpace);
  if (nearestSegment) {
    insertPointOnNearestSegment(nearestSegment);
    return;
  }

  addPointAtSvgCoordinate(svgPoint);
}

function handlePlotPointerMove(event) {
  event.preventDefault();

  const plot = event.currentTarget;
  const model = interactionState.renderModel;
  if (!plot || !model) {
    return;
  }

  const svgPoint = getSvgCoordinatesFromEvent(event, plot);
  if (interactionState.draggingAnnotationIndex >= 0) {
    updateSelectedAnnotationPosition(svgPoint);
    return;
  }
  const nearestPointIndex = getNearestPointIndex(svgPoint, model.points, model.plotSpace);
  const nearestSegment = nearestPointIndex < 0
    ? getNearestSegmentInsertion(svgPoint, model.points, model.plotSpace)
    : null;
  const hoverSegmentActive = Boolean(nearestSegment);
  const hoverChanged = nearestPointIndex !== interactionState.hoverPointIndex
    || hoverSegmentActive !== interactionState.hoverSegmentActive;

  if (hoverChanged) {
    interactionState.hoverPointIndex = nearestPointIndex;
    interactionState.hoverSegmentActive = hoverSegmentActive;
    setPlotInteractionClasses();
    if (interactionState.draggingPointIndex < 0) {
      render();
      return;
    }
  }

  if (interactionState.draggingPointIndex < 0 || !interactionState.dragPoints) {
    return;
  }

  // Keep the viewport fixed for the whole drag so the point tracks the cursor 1:1.
  const { plotSpace } = model;
  const target = interactionState.dragPoints[interactionState.draggingPointIndex];
  if (!target) {
    return;
  }

  target.x = roundCoord(plotSpace.pxToX(svgPoint.x));
  target.y = roundCoord(plotSpace.pxToY(svgPoint.y));
  updatePointsInputAndRender(interactionState.dragPoints, null, { recordHistory: false });
}

function handlePlotPointerUp(event) {
  if (interactionState.draggingAnnotationIndex >= 0) {
    const plot = event.currentTarget;
    interactionState.draggingAnnotationIndex = -1;
    interactionState.annotationDragOffset = null;
    if (plot?.hasPointerCapture(event.pointerId)) {
      plot.releasePointerCapture(event.pointerId);
    }
    setStatus("Text moved.");
    return;
  }
  if (interactionState.draggingPointIndex < 0) {
    return;
  }

  const plot = event.currentTarget;
  const pointNumber = interactionState.draggingPointIndex + 1;
  const pointsInput = document.getElementById("points-input");
  const endText = pointsInput.value;
  if (interactionState.dragStartText && interactionState.dragStartText !== endText) {
    pushUndoSnapshot(interactionState.dragStartText);
    interactionState.redoStack = [];
  }
  interactionState.draggingPointIndex = -1;
  interactionState.dragPoints = null;
  interactionState.dragStartText = "";
  if (plot && plot.hasPointerCapture(event.pointerId)) {
    plot.releasePointerCapture(event.pointerId);
  }
  if (interactionState.renderModel) {
    const { points, joins } = interactionState.renderModel;
    if (growViewportToIncludePoints(points, joins)) {
      render();
    }
  }
  setPlotInteractionClasses();
  setStatus(`Point ${pointNumber} moved.`);
  updateHistoryButtons();
}

function handlePlotPointerLeave() {
  if (interactionState.draggingPointIndex >= 0) {
    return;
  }

  clearHoverState();
}

function removeSelectedPoint() {
  const model = interactionState.renderModel;
  if (!model) {
    return;
  }

  const deletion = getPointDeletionResult(model.points, interactionState.selectedPointIndex);
  if (!deletion) {
    setStatus("Select a point first, then press Delete or Backspace.");
    return;
  }

  const removedIndex = interactionState.selectedPointIndex;
  interactionState.angleArcs = interactionState.angleArcs.filter((arc) => !arc.includes(removedIndex));
  interactionState.segments = interactionState.segments.filter((segment) => !segment.includes(removedIndex));
  adjustGeometryIndices(removedIndex + 1, -1);
  interactionState.selectedPointIndices = deletion.nextSelectedIndex >= 0
    ? new Set([deletion.nextSelectedIndex])
    : new Set();
  interactionState.selectedPointIndex = deletion.nextSelectedIndex;
  updatePointsInputAndRender(
    deletion.nextPoints,
    `Point ${deletion.removedPointNumber} removed.`,
    { recordHistory: true },
  );
}

function moveSelectedPointBy(deltaX, deltaY) {
  const model = interactionState.renderModel;
  if (!model) {
    return;
  }

  const selectedIndex = interactionState.selectedPointIndex;
  if (selectedIndex < 0 || selectedIndex >= model.points.length) {
    setStatus("Select a point first, then use arrow keys.");
    return;
  }

  const nextPoints = model.points.map((point) => ({ ...point }));
  const selectedPoint = nextPoints[selectedIndex];
  selectedPoint.x = roundCoord(selectedPoint.x + deltaX);
  selectedPoint.y = roundCoord(selectedPoint.y + deltaY);

  updatePointsInputAndRender(
    nextPoints,
    `Point ${selectedIndex + 1} moved to (${selectedPoint.x.toFixed(2)}, ${selectedPoint.y.toFixed(2)}).`,
    { recordHistory: true },
  );
}

function removeSelectedArc() {
  const arcIndex = interactionState.selectedArcIndex;
  if (arcIndex < 0 || arcIndex >= interactionState.angleArcs.length) {
    return false;
  }
  interactionState.angleArcs.splice(arcIndex, 1);
  interactionState.selectedArcIndex = -1;
  render();
  setStatus("Angle arc removed.");
  return true;
}

function isTypingInInputLikeElement() {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }

  const tagName = activeElement.tagName;
  if (tagName === "TEXTAREA" || activeElement.isContentEditable) {
    return true;
  }

  if (tagName !== "INPUT") {
    return false;
  }

  const inputType = String(activeElement.getAttribute("type") || "text").toLowerCase();
  const textInputTypes = new Set([
    "text",
    "search",
    "url",
    "tel",
    "email",
    "password",
    "number",
  ]);

  return textInputTypes.has(inputType);
}

function isPlotFocused() {
  const activeElement = document.activeElement;
  return activeElement?.id === "plot";
}

function handleGlobalKeyDown(event) {
  if (isTypingInInputLikeElement() && !isPlotFocused()) {
    return;
  }

  const isUndo = (event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "z";
  const isRedo = ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y")
    || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z");
  const isDelete = event.key === "Delete" || event.key === "Backspace";
  const isArrowKey = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key);

  if (isUndo) {
    event.preventDefault();
    undoPointsChange();
    return;
  }

  if (isRedo) {
    event.preventDefault();
    redoPointsChange();
    return;
  }

  if (isDelete) {
    event.preventDefault();
    if (removeSelectedAnnotation()) {
      return;
    }
    if (removeSelectedArc()) {
      return;
    }
    removeSelectedPoint();
    return;
  }

  if (isArrowKey) {
    event.preventDefault();
    const step = event.altKey
      ? KEYBOARD_NUDGE_FINE
      : event.shiftKey
        ? KEYBOARD_NUDGE_COARSE
        : KEYBOARD_NUDGE_DEFAULT;

    if (event.key === "ArrowUp" && moveSelectedAnnotationBy(0, step)) {
      return;
    }
    if (event.key === "ArrowDown" && moveSelectedAnnotationBy(0, -step)) {
      return;
    }
    if (event.key === "ArrowLeft" && moveSelectedAnnotationBy(-step, 0)) {
      return;
    }
    if (event.key === "ArrowRight" && moveSelectedAnnotationBy(step, 0)) {
      return;
    }
    if (event.key === "ArrowUp") {
      moveSelectedPointBy(0, step);
      return;
    }
    if (event.key === "ArrowDown") {
      moveSelectedPointBy(0, -step);
      return;
    }
    if (event.key === "ArrowLeft") {
      moveSelectedPointBy(-step, 0);
      return;
    }
    if (event.key === "ArrowRight") {
      moveSelectedPointBy(step, 0);
    }
  }
}

function buildPlot(points, joins, showPoints, showGridlines, showLabels, showAngleArcs, showSegments, area, perimeter, selectedPointIndex = -1) {
  const colors = getThemeColors();
  const width = 800;
  const height = 500;
  const margin = 70;
  const plotSpace = createPlotSpace(points, joins, width, height, margin, {
    expandForEditing: true,
    bounds: interactionState.viewportBounds ?? null,
  });
  const {
    minX,
    maxX,
    minY,
    maxY,
    xSpan,
    ySpan,
    xToPx,
    yToPx,
  } = plotSpace;

  const xAxisY = (() => {
    const zeroInRange = 0 >= minY && 0 <= maxY;
    return zeroInRange ? yToPx(0) : height - margin;
  })();
  const yAxisX = (() => {
    const zeroInRange = 0 >= minX && 0 <= maxX;
    return zeroInRange ? xToPx(0) : margin;
  })();

  const xAxisLabelY = xAxisY > height / 2 ? xAxisY + 24 : xAxisY - 8;
  const occupiedLabels = [];

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${colors.plotBg}" stroke="${colors.plotBorder}" stroke-width="1" rx="20" ry="20" />`);

  if (showGridlines) {
    for (let step = 0; step <= 5; step += 1) {
      const x = margin + (step / 5) * (width - margin * 2);
      const y = margin + (step / 5) * (height - margin * 2);
      parts.push(`<line x1="${x}" y1="${margin}" x2="${x}" y2="${height - margin}" stroke="${colors.plotGrid}" stroke-opacity="0.95" stroke-width="1.4" stroke-dasharray="4 3" shape-rendering="crispEdges" />`);
      parts.push(`<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="${colors.plotGrid}" stroke-opacity="0.95" stroke-width="1.4" stroke-dasharray="4 3" shape-rendering="crispEdges" />`);
    }
  }

  parts.push(`<line x1="${margin}" y1="${xAxisY}" x2="${width - margin}" y2="${xAxisY}" stroke="${colors.plotAxis}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke" shape-rendering="crispEdges" />`);
  parts.push(`<line x1="${yAxisX}" y1="${margin}" x2="${yAxisX}" y2="${height - margin}" stroke="${colors.plotAxis}" stroke-width="2.2" stroke-linecap="round" vector-effect="non-scaling-stroke" shape-rendering="crispEdges" />`);
  if (showLabels) {
    parts.push(`<text x="${width / 2}" y="${xAxisLabelY}" text-anchor="middle" font-size="16" font-weight="700" fill="${colors.plotAxisText}" fill-opacity="0.18" letter-spacing="0.14em">X Axis</text>`);
    parts.push(`<text x="${yAxisX - 12}" y="${height / 2}" text-anchor="end" transform="rotate(-90 ${yAxisX - 12} ${height / 2})" font-size="16" font-weight="700" fill="${colors.plotAxisText}" fill-opacity="0.18" letter-spacing="0.14em">Y Axis</text>`);
  }

  for (let step = 0; step <= 5; step += 1) {
    const x = margin + (step / 5) * (width - margin * 2);
    const value = minX + (step / 5) * xSpan;
    const tickDirection = xAxisY > height / 2 ? 8 : -8;
    const labelOffset = xAxisY > height / 2 ? 24 : -10;
    parts.push(`<line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${xAxisY + tickDirection}" stroke="#374151" stroke-width="1" shape-rendering="crispEdges" />`);
    if (showLabels) {
      parts.push(`<text x="${x}" y="${xAxisY + labelOffset}" text-anchor="middle" font-size="10" fill="#475569">${value.toFixed(0)}</text>`);
    }
  }

  for (let step = 0; step <= 5; step += 1) {
    const y = margin + (step / 5) * (height - margin * 2);
    const value = maxY - (step / 5) * ySpan;
    const tickDirection = yAxisX > width / 2 ? -8 : 8;
    const labelX = yAxisX - 12;
    parts.push(`<line x1="${yAxisX}" y1="${y}" x2="${yAxisX + tickDirection}" y2="${y}" stroke="#374151" stroke-width="1" shape-rendering="crispEdges" />`);
    if (showLabels) {
      parts.push(`<text x="${labelX}" y="${y + 3}" text-anchor="end" font-size="10" fill="#475569">${value.toFixed(0)}</text>`);
    }
  }

  if (points.length > 0) {
    const boundaryPath = points.map((point) => `${xToPx(point.x)},${yToPx(point.y)}`).join(" ");
    const closedPath = `${boundaryPath} ${xToPx(points[0].x)},${yToPx(points[0].y)}`;
    parts.push(`<polyline points="${closedPath}" fill="none" stroke="${colors.plotBoundary}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />`);

    points.forEach((point, pointIndex) => {
      const px = xToPx(point.x);
      const py = yToPx(point.y);
      if (point.y !== 0) {
        parts.push(`<line x1="${px}" y1="${yToPx(0)}" x2="${px}" y2="${py}" stroke="${colors.plotAux}" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke" />`);
      }
      if (pointIndex === interactionState.hoverPointIndex && pointIndex !== selectedPointIndex) {
        parts.push(`<circle cx="${px}" cy="${py}" r="7" fill="none" stroke="${colors.plotJoinLabel}" stroke-width="1.8" stroke-dasharray="3 2" vector-effect="non-scaling-stroke" />`);
      }
      if (interactionState.selectedPointIndices.has(pointIndex)) {
        parts.push(`<circle cx="${px}" cy="${py}" r="10" fill="none" stroke="${colors.plotBg}" stroke-width="4" vector-effect="non-scaling-stroke" />`);
        parts.push(`<circle cx="${px}" cy="${py}" r="8" fill="none" stroke="${colors.plotAux}" stroke-width="2.4" vector-effect="non-scaling-stroke" />`);
      }
      if (showPoints) {
        parts.push(`<circle cx="${px}" cy="${py}" r="5" fill="${colors.plotPoint}" stroke="${colors.plotBg}" stroke-width="1.5" vector-effect="non-scaling-stroke" />`);
      } else if (interactionState.selectedPointIndices.has(pointIndex)) {
        parts.push(`<circle cx="${px}" cy="${py}" r="3.5" fill="${colors.plotAux}" vector-effect="non-scaling-stroke" />`);
      }
      if (showLabels) {
        const pointLabelText = `${point.name} (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`;
        const label = getLabelPosition(
          px,
          py,
          pointLabelText,
          width,
          height,
          occupiedLabels,
          { padding: 8, offset: 10, fontSize: 12 },
        );
        parts.push(`<text x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" fill="${colors.plotText}" font-size="12" font-weight="600">${escapeHtml(pointLabelText)}</text>`);
      }
    });

    for (let index = 0; index < points.length; index += 1) {
      const start = points[index];
      const end = points[(index + 1) % points.length];
      const x1 = xToPx(start.x);
      const y1 = yToPx(start.y);
      const x2 = xToPx(end.x);
      const y2 = yToPx(end.y);
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const sideLength = calculateDistance(start, end);
      const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
      const normalizedAngle = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;
      if (showLabels) {
        parts.push(`<text x="${midX}" y="${midY}" transform="rotate(${normalizedAngle}, ${midX}, ${midY})" fill="${colors.plotAux}" font-size="12" font-weight="700" paint-order="stroke" stroke="${colors.plotBg}" stroke-width="2">${sideLength.toFixed(2)} m</text>`);
      }
    }

    if (showAngleArcs) interactionState.angleArcs.forEach((arc, arcIndex) => {
      const [previousIndex, vertexIndex, nextIndex] = arc;
      const previous = points[previousIndex];
      const vertex = points[vertexIndex];
      const next = points[nextIndex];
      const interiorAngle = calculateAngleDegrees(previous, vertex, next);
      if (!Number.isFinite(interiorAngle)) {
        return;
      }

      const vertexPx = { x: xToPx(vertex.x), y: yToPx(vertex.y) };
      const previousPx = { x: xToPx(previous.x), y: yToPx(previous.y) };
      const nextPx = { x: xToPx(next.x), y: yToPx(next.y) };
      const edgeLenA = calculateDistance(vertexPx, previousPx);
      const edgeLenB = calculateDistance(vertexPx, nextPx);
      const shortestEdge = Math.min(edgeLenA, edgeLenB);
      const arcRadius = Math.max(8, Math.min(14, shortestEdge * 0.2));
      const arcGeometry = getAngleArcGeometry(previousPx, vertexPx, nextPx, arcRadius, interiorAngle);
      if (!arcGeometry) {
        return;
      }

      const selectedArcStroke = arcIndex === interactionState.selectedArcIndex ? colors.plotAux : colors.plotAreaText;
      const selectedArcWidth = arcIndex === interactionState.selectedArcIndex ? 3 : 1.8;
      parts.push(`<path data-arc-index="${arcIndex}" d="M ${arcGeometry.arcStartX} ${arcGeometry.arcStartY} A ${arcRadius} ${arcRadius} 0 ${arcGeometry.largeArcFlag} ${arcGeometry.sweepFlag} ${arcGeometry.arcEndX} ${arcGeometry.arcEndY}" fill="none" stroke="${selectedArcStroke}" stroke-width="${selectedArcWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke" />`);
      if (arcGeometry.isReflex) {
        const innerRadius = Math.max(5.5, arcRadius - 3);
        const innerStartX = vertexPx.x + innerRadius * Math.cos(Math.atan2(previousPx.y - vertexPx.y, previousPx.x - vertexPx.x));
        const innerStartY = vertexPx.y + innerRadius * Math.sin(Math.atan2(previousPx.y - vertexPx.y, previousPx.x - vertexPx.x));
        const innerEndX = vertexPx.x + innerRadius * Math.cos(Math.atan2(nextPx.y - vertexPx.y, nextPx.x - vertexPx.x));
        const innerEndY = vertexPx.y + innerRadius * Math.sin(Math.atan2(nextPx.y - vertexPx.y, nextPx.x - vertexPx.x));
        parts.push(`<path data-arc-index="${arcIndex}" d="M ${innerStartX} ${innerStartY} A ${innerRadius} ${innerRadius} 0 0 ${arcGeometry.sweepFlag} ${innerEndX} ${innerEndY}" fill="none" stroke="${selectedArcStroke}" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke" />`);
      }
      if (showLabels) {
        const angleLabelText = `${interiorAngle.toFixed(1)}°`;
        const angleLabel = getLabelPosition(
          arcGeometry.labelX,
          arcGeometry.labelY,
          angleLabelText,
          width,
          height,
          occupiedLabels,
          { padding: 8, offset: 4, fontSize: 11 },
        );
        parts.push(`<text x="${angleLabel.x}" y="${angleLabel.y}" text-anchor="${angleLabel.anchor}" fill="${colors.plotAreaText}" font-size="11" font-weight="700" paint-order="stroke" stroke="${colors.plotBg}" stroke-width="2">${angleLabelText}</text>`);
      }
    });
  }

  if (showSegments) interactionState.segments.forEach(([startIndex, endIndex]) => {
    const start = points[startIndex];
    const end = points[endIndex];
    const x1 = xToPx(start.x);
    const y1 = yToPx(start.y);
    const x2 = xToPx(end.x);
    const y2 = yToPx(end.y);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);
    const normalizedAngle = angle > 90 ? angle - 180 : angle < -90 ? angle + 180 : angle;
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.plotJoin}" stroke-width="2.4" stroke-dasharray="6 4" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none" />`);
    if (showLabels) {
      parts.push(`<text x="${midX}" y="${midY}" transform="rotate(${normalizedAngle}, ${midX}, ${midY})" fill="${colors.plotJoinLabel}" font-size="11" font-weight="700" paint-order="stroke" stroke="${colors.plotBg}" stroke-width="2">${calculateDistance(start, end).toFixed(2)} m</text>`);
    }
  });

  if (showSegments) joins.forEach((join, index) => {
    const next = joins[index + 1];
    if (!next) {
      return;
    }

    const x1 = xToPx(join.x);
    const y1 = yToPx(join.y);
    const x2 = xToPx(next.x);
    const y2 = yToPx(next.y);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.plotJoin}" stroke-width="2" stroke-dasharray="6 4" stroke-linecap="round" vector-effect="non-scaling-stroke" pointer-events="none" />`);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const joinLength = calculateDistance(join, next);
    if (showLabels) {
      parts.push(`<text x="${midX}" y="${midY}" fill="${colors.plotJoinLabel}" font-size="11" font-weight="700">${joinLength.toFixed(2)} m</text>`);
    }
  });

  const areaText = `Area: ${area.hectares} ha • ${area.ares} a • ${area.remSqm.toFixed(2)} sqm • ${area.acres.toFixed(3)} ac • ${area.cents.toFixed(2)} cents • ${area.sqft.toFixed(2)} sqft`;
  if (showLabels) {
    parts.push(`<text x="${width - 24}" y="28" text-anchor="end" fill="${colors.plotAreaText}" font-size="13" font-weight="700">${escapeHtml(areaText)}</text>`);
  }
  if (showLabels && perimeter > 0) {
    parts.push(`<text x="${width - 24}" y="48" text-anchor="end" fill="${colors.plotAreaText}" font-size="12" font-weight="700">${escapeHtml(`Perimeter: ${perimeter.toFixed(2)} m`)}</text>`);
  }

  if (showLabels) {
    interactionState.annotations.forEach((annotation) => {
      const annotationIndex = interactionState.annotations.indexOf(annotation);
      const selected = annotationIndex === interactionState.selectedAnnotationIndex;
      const fontSize = clamp(Number(annotation.fontSize) || 16, 10, 48);
      const x = xToPx(annotation.x);
      const y = yToPx(annotation.y);
      const width = Math.max(90, annotation.text.length * fontSize * 0.7 + 24);
      parts.push(`<foreignObject data-annotation-index="${annotationIndex}" x="${x - width / 2}" y="${y - fontSize}" width="${width}" height="${fontSize * 2}" overflow="visible"><div xmlns="http://www.w3.org/1999/xhtml" data-annotation-editor="${annotationIndex}" contenteditable="true" spellcheck="false" style="display:inline-block;min-width:100%;color:${colors.plotCenterText};font:${fontSize}px Inter,Segoe UI,sans-serif;font-weight:700;text-align:center;white-space:nowrap;outline:${selected ? `2px solid ${colors.plotAux}` : "none"};border-radius:3px;cursor:move;paint-order:stroke;">${escapeHtml(annotation.text)}</div></foreignObject>`);
    });
  }

  return parts.join("");
}

function render() {
  const pointsInput = document.getElementById("points-input");
  const joinsInput = document.getElementById("joins-input");
  const showPoints = document.getElementById("show-points");
  const showGridlines = document.getElementById("show-gridlines");
  const showLabels = document.getElementById("show-labels");
  const showAngleArcs = document.getElementById("show-angle-arcs");
  const showSegments = document.getElementById("show-segments");
  const warnings = document.getElementById("warnings");
  const plot = document.getElementById("plot");

  const { result: points, warnings: parseWarnings } = parseCoordinateText(pointsInput.value, "Point");
  const { result: extraPoints, warnings: joinWarnings } = parseCoordinateText(joinsInput.value, "Join");

  const area = calculateArea(points);
  const perimeter = calculatePerimeter(points);
  const intersections = findSelfIntersections(points);

  if (!interactionState.viewportBounds) {
    interactionState.viewportBounds = getViewportBounds(points, extraPoints);
  }

  interactionState.renderModel = {
    points: points.map((point) => ({ ...point })),
    joins: extraPoints.map((point) => ({ ...point })),
    plotSpace: createPlotSpace(points, extraPoints, 800, 500, 70, {
      expandForEditing: true,
      bounds: interactionState.viewportBounds ?? null,
    }),
    intersections,
  };
  interactionState.selectedPointIndex = clamp(interactionState.selectedPointIndex, -1, points.length - 1);
  normalizeGeometrySelections(points.length);
  interactionState.hoverPointIndex = clamp(interactionState.hoverPointIndex, -1, points.length - 1);
  if (interactionState.hoverPointIndex >= 0) {
    interactionState.hoverSegmentActive = false;
  }

  const intersectionWarnings = intersections.map((intersection) => {
    return `Boundary self-intersection detected between edges ${intersection.segmentA + 1} and ${intersection.segmentB + 1}.`;
  });
  const combinedWarnings = [...parseWarnings, ...joinWarnings, ...intersectionWarnings];
  warnings.classList.toggle("show", combinedWarnings.length > 0);
  warnings.innerHTML = combinedWarnings.length
    ? combinedWarnings.map((message) => `<div>${escapeHtml(message)}</div>`).join("")
    : "";

  plot.innerHTML = buildPlot(
    points,
    extraPoints,
    showPoints.checked,
    showGridlines.checked,
    showLabels.checked,
    showAngleArcs.checked,
    showSegments.checked,
    area,
    perimeter,
    interactionState.selectedPointIndex,
  );
  setPlotInteractionClasses();
  updateHistoryButtons();
}

function exportInputs() {
  const plot = document.getElementById("plot");
  if (!plot) {
    return;
  }

  const viewBox = plot.getAttribute("viewBox") || "0 0 800 500";
  const width = plot.getAttribute("width") || "800";
  const height = plot.getAttribute("height") || "500";
  const fileName = `${getDownloadBaseName(interactionState.annotations[0]?.text, "fmb-plot")}.svg`;
  const config = getCurrentConfig();
  downloadSvgFile(fileName, config, plot.innerHTML, viewBox, width, height);
  setStatus("Plot exported as SVG with embedded data.");
}

function saveGraph() {
  const plot = document.getElementById("plot");
  if (!plot) {
    return;
  }

  const viewBox = plot.getAttribute("viewBox") || "0 0 800 500";
  const width = plot.getAttribute("width") || "800";
  const height = plot.getAttribute("height") || "500";
  const fileName = `${getDownloadBaseName(interactionState.annotations[0]?.text, "fmb-plot")}.svg`;
  const config = getCurrentConfig();
  downloadSvgFile(fileName, config, plot.innerHTML, viewBox, width, height);
  setStatus("Graph saved as SVG.");
}

function importInputs(event) {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      let data = null;

      if (file.name.toLowerCase().endsWith(".svg")) {
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(text, "image/svg+xml");
        const metadata = svgDoc.querySelector('metadata[id="fmb-config"]');
        const payload = metadata?.textContent?.trim();
        if (payload) {
          data = JSON.parse(payload);
        }
      } else {
        data = JSON.parse(text);
      }

      if (!data) {
        throw new Error("No embedded plot data found.");
      }

      const pointsInput = document.getElementById("points-input");
      const joinsInput = document.getElementById("joins-input");
      const showPoints = document.getElementById("show-points");
      const showGridlines = document.getElementById("show-gridlines");
      const showLabels = document.getElementById("show-labels");
      const showAngleArcs = document.getElementById("show-angle-arcs");
      const showSegments = document.getElementById("show-segments");

      if (typeof data.points === "string") {
        pointsInput.value = data.points;
      }
      if (typeof data.joins === "string") {
        joinsInput.value = data.joins;
      }
      if (typeof data.showPoints === "boolean") {
        showPoints.checked = data.showPoints;
      }
      if (typeof data.showGridlines === "boolean") {
        showGridlines.checked = data.showGridlines;
      }
      if (typeof data.showLabels === "boolean") {
        showLabels.checked = data.showLabels;
      }
      if (typeof data.showAngleArcs === "boolean") {
        showAngleArcs.checked = data.showAngleArcs;
      }
      if (typeof data.showSegments === "boolean") {
        showSegments.checked = data.showSegments;
      }
      if (Array.isArray(data.angleArcs)) {
        interactionState.angleArcs = data.angleArcs;
      }
      if (Array.isArray(data.segments)) {
        interactionState.segments = data.segments;
      }
      if (Array.isArray(data.annotations)) {
        interactionState.annotations = data.annotations.filter((annotation) => {
          return annotation && typeof annotation.text === "string" && Number.isFinite(annotation.x) && Number.isFinite(annotation.y);
        }).map((annotation) => ({ ...annotation, fontSize: clamp(Number(annotation.fontSize) || 16, 10, 48) }));
      }
      applyColorSettings(data.colors);

      render();
      syncTextSizeControl();
      setStatus(`Imported ${file.name}.`);
    } catch {
      setStatus("The selected file could not be imported.");
    }
  };

  reader.readAsText(file);
  event.target.value = "";
}

function getSavedTheme() {
  return localStorage.getItem("fmb-theme");
}

function applyTheme(theme) {
  const root = document.documentElement;
  const themeToggle = document.getElementById("theme-toggle");

  root.dataset.theme = theme;
  if (themeToggle) {
    themeToggle.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
    themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.dataset.theme || "light";
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  localStorage.setItem("fmb-theme", nextTheme);
  render();
}

function handlePlotWheel(event) {
  event.preventDefault();
  const plot = event.currentTarget;
  const model = interactionState.renderModel;
  if (!model) {
    return;
  }

  const svgPoint = getSvgCoordinatesFromEvent(event, plot);
  const { plotSpace } = model;
  const worldX = plotSpace.pxToX(svgPoint.x);
  const worldY = plotSpace.pxToY(svgPoint.y);

  const zoomFactor = event.deltaY < 0 ? 1 / 1.15 : 1.15;
  const bounds = interactionState.viewportBounds ?? {
    minX: plotSpace.minX,
    maxX: plotSpace.maxX,
    minY: plotSpace.minY,
    maxY: plotSpace.maxY,
  };

  const newMinX = worldX + (bounds.minX - worldX) * zoomFactor;
  const newMaxX = worldX + (bounds.maxX - worldX) * zoomFactor;
  const newMinY = worldY + (bounds.minY - worldY) * zoomFactor;
  const newMaxY = worldY + (bounds.maxY - worldY) * zoomFactor;

  // Prevent zooming in past a minimum span
  if (newMaxX - newMinX < 0.5 || newMaxY - newMinY < 0.5) {
    return;
  }

  interactionState.viewportBounds = { minX: newMinX, maxX: newMaxX, minY: newMinY, maxY: newMaxY };
  render();
}

function handlePlotDoubleClick(event) {
  const annotationIndex = getAnnotationIndexFromTarget(event.target);
  if (Number.isInteger(annotationIndex) && annotationIndex >= 0 && annotationIndex < interactionState.annotations.length) {
    event.preventDefault();
    interactionState.selectedAnnotationIndex = annotationIndex;
    document.querySelector(`[data-annotation-editor="${annotationIndex}"]`)?.focus();
    setStatus("Editing text on the plot.");
    return;
  }
  if (interactionState.viewportBounds) {
    interactionState.viewportBounds = null;
    render();
    setStatus("Zoom reset.");
  }
}

function initialize() {
  const pointsInput = document.getElementById("points-input");
  const joinsInput = document.getElementById("joins-input");
  const showPoints = document.getElementById("show-points");
  const showGridlines = document.getElementById("show-gridlines");
  const showLabels = document.getElementById("show-labels");
  const showAngleArcs = document.getElementById("show-angle-arcs");
  const showSegments = document.getElementById("show-segments");
  const addTextBtn = document.getElementById("add-text-btn");
  const textSize = document.getElementById("text-size");
  const textSizeValue = document.getElementById("text-size-value");
  const createSegmentBtn = document.getElementById("create-segment-btn");
  const resetColorsBtn = document.getElementById("reset-colors-btn");
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const saveGraphBtn = document.getElementById("save-graph-btn");
  const undoBtn = document.getElementById("undo-btn");
  const redoBtn = document.getElementById("redo-btn");
  const importFile = document.getElementById("import-file");
  const themeToggle = document.getElementById("theme-toggle");
  const plot = document.getElementById("plot");
  plot.setAttribute("tabindex", "0");

  const savedTheme = getSavedTheme();
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  pointsInput.value = defaultPoints;
  joinsInput.value = defaultJoins;
  showPoints.checked = true;
  showGridlines.checked = true;
  showLabels.checked = true;
  showAngleArcs.checked = true;
  showSegments.checked = true;
  resetColorSettings();

  [pointsInput, joinsInput].forEach((element) => {
    element.addEventListener("input", () => {
      if (element === pointsInput || element === joinsInput) {
        interactionState.viewportBounds = null;
      }
      if (element === pointsInput) {
        interactionState.redoStack = [];
      }
      render();
    });
  });
  showPoints.addEventListener("change", render);
  showGridlines.addEventListener("change", render);
  [showLabels, showAngleArcs, showSegments].forEach((element) => element.addEventListener("change", render));
  colorSettings.forEach(([inputId, property]) => {
    document.getElementById(inputId).addEventListener("input", (event) => {
      document.documentElement.style.setProperty(property, event.target.value);
      render();
    });
  });
  resetColorsBtn.addEventListener("click", () => {
    resetColorSettings();
    render();
  });
  addTextBtn.addEventListener("click", addTextAnnotation);
  textSize.addEventListener("input", () => {
    const size = Number(textSize.value);
    textSizeValue.value = `${size} px`;
    textSizeValue.textContent = `${size} px`;
    const annotation = interactionState.annotations[interactionState.selectedAnnotationIndex];
    if (annotation) {
      annotation.fontSize = size;
      render();
    }
  });
  createSegmentBtn.addEventListener("click", addSegmentFromSelection);
  exportBtn.addEventListener("click", exportInputs);
  importBtn.addEventListener("click", () => importFile.click());
  saveGraphBtn.addEventListener("click", saveGraph);
  undoBtn.addEventListener("click", undoPointsChange);
  redoBtn.addEventListener("click", redoPointsChange);
  importFile.addEventListener("change", importInputs);
  plot.addEventListener("pointerdown", handlePlotPointerDown);
  plot.addEventListener("pointermove", handlePlotPointerMove);
  plot.addEventListener("pointerup", handlePlotPointerUp);
  plot.addEventListener("pointercancel", handlePlotPointerUp);
  plot.addEventListener("pointerleave", handlePlotPointerLeave);
  plot.addEventListener("input", (event) => {
    const annotationIndex = getAnnotationIndexFromTarget(event.target);
    const annotation = interactionState.annotations[annotationIndex];
    if (annotation) {
      annotation.text = event.target.textContent.trim() || "Text";
    }
  });
  plot.addEventListener("focusout", (event) => {
    if (getAnnotationIndexFromTarget(event.target) >= 0) {
      render();
    }
  });
  plot.addEventListener("wheel", handlePlotWheel, { passive: false });
  plot.addEventListener("dblclick", handlePlotDoubleClick);
  document.addEventListener("keydown", handleGlobalKeyDown, true);
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  render();
  updateHistoryButtons();
}

document.addEventListener("DOMContentLoaded", initialize);
