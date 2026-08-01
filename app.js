import { calculateDistance } from './distance.js';

const defaultPoints = `Corner A, 0, 0
Corner B, 40, 30
Corner C, 80, -35
Corner D, 100, 0`;

const defaultJoins = "";

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
  const centerText = document.getElementById("center-text");
  const showPoints = document.getElementById("show-points");
  const showGridlines = document.getElementById("show-gridlines");

  return {
    points: pointsInput.value,
    joins: joinsInput.value,
    centerText: centerText.value,
    showPoints: showPoints.checked,
    showGridlines: showGridlines.checked,
  };
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

function getLabelPosition(px, py, text, width, height, padding = 8, offset = 3) {
  const estimatedWidth = Math.max(90, text.length * 6 + 36);
  let x = px + offset;
  let y = py - offset;
  let anchor = "start";

  if (x + estimatedWidth > width - padding) {
    x = px - estimatedWidth - offset;
    anchor = "end";
  }

  if (x < padding) {
    x = padding;
    anchor = "start";
  }

  if (y < padding) {
    y = padding;
  }

  if (y > height - padding) {
    y = height - padding;
  }

  return { x, y, anchor };
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

function buildPlot(points, joins, centerText, showPoints, showGridlines, area) {
  const colors = getThemeColors();
  const width = 800;
  const height = 500;
  const margin = 70;
  const xValues = [0, ...points.map((point) => point.x), ...joins.map((point) => point.x)];
  const yValues = [0, ...points.map((point) => point.y), ...joins.map((point) => point.y)];

  const minX = Math.min(...xValues);
  const maxX = Math.max(...xValues);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues);
  const xSpan = Math.max(maxX - minX, 1);
  const ySpan = Math.max(maxY - minY, 1);

  const xToPx = (value) => margin + ((value - minX) / xSpan) * (width - margin * 2);
  const yToPx = (value) => height - margin - ((value - minY) / ySpan) * (height - margin * 2);

  const xAxisY = (() => {
    const zeroInRange = 0 >= minY && 0 <= maxY;
    return zeroInRange ? yToPx(0) : height - margin;
  })();
  const yAxisX = (() => {
    const zeroInRange = 0 >= minX && 0 <= maxX;
    return zeroInRange ? xToPx(0) : margin;
  })();

  const xAxisLabelY = xAxisY > height / 2 ? xAxisY + 24 : xAxisY - 8;

  const parts = [];
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${colors.plotBg}" rx="20" ry="20" />`);

  if (showGridlines) {
    for (let step = 0; step <= 5; step += 1) {
      const x = margin + (step / 5) * (width - margin * 2);
      const y = margin + (step / 5) * (height - margin * 2);
      parts.push(`<line x1="${x}" y1="${margin}" x2="${x}" y2="${height - margin}" stroke="${colors.plotGrid}" stroke-width="1" stroke-dasharray="3 3" />`);
      parts.push(`<line x1="${margin}" y1="${y}" x2="${width - margin}" y2="${y}" stroke="${colors.plotGrid}" stroke-width="1" stroke-dasharray="3 3" />`);
    }
  }

  parts.push(`<line x1="${margin}" y1="${xAxisY}" x2="${width - margin}" y2="${xAxisY}" stroke="${colors.plotAxis}" stroke-width="2.2" />`);
  parts.push(`<line x1="${yAxisX}" y1="${margin}" x2="${yAxisX}" y2="${height - margin}" stroke="${colors.plotAxis}" stroke-width="2.2" />`);
  parts.push(`<text x="${width / 2}" y="${xAxisLabelY}" text-anchor="middle" font-size="16" font-weight="700" fill="${colors.plotAxisText}" fill-opacity="0.18" letter-spacing="0.14em">X Axis</text>`);
  parts.push(`<text x="${yAxisX - 12}" y="${height / 2}" text-anchor="end" transform="rotate(-90 ${yAxisX - 12} ${height / 2})" font-size="16" font-weight="700" fill="${colors.plotAxisText}" fill-opacity="0.18" letter-spacing="0.14em">Y Axis</text>`);

  for (let step = 0; step <= 5; step += 1) {
    const x = margin + (step / 5) * (width - margin * 2);
    const value = minX + (step / 5) * xSpan;
    const tickDirection = xAxisY > height / 2 ? 8 : -8;
    const labelOffset = xAxisY > height / 2 ? 24 : -10;
    parts.push(`<line x1="${x}" y1="${xAxisY}" x2="${x}" y2="${xAxisY + tickDirection}" stroke="#374151" stroke-width="1" />`);
    parts.push(`<text x="${x}" y="${xAxisY + labelOffset}" text-anchor="middle" font-size="10" fill="#475569">${value.toFixed(0)}</text>`);
  }

  for (let step = 0; step <= 5; step += 1) {
    const y = margin + (step / 5) * (height - margin * 2);
    const value = maxY - (step / 5) * ySpan;
    const tickDirection = yAxisX > width / 2 ? -8 : 8;
    const labelX = yAxisX - 12;
    parts.push(`<line x1="${yAxisX}" y1="${y}" x2="${yAxisX + tickDirection}" y2="${y}" stroke="#374151" stroke-width="1" />`);
    parts.push(`<text x="${labelX}" y="${y + 3}" text-anchor="end" font-size="10" fill="#475569">${value.toFixed(0)}</text>`);
  }

  if (points.length > 0) {
    const boundaryPath = points.map((point) => `${xToPx(point.x)},${yToPx(point.y)}`).join(" ");
    const closedPath = `${boundaryPath} ${xToPx(points[0].x)},${yToPx(points[0].y)}`;
    parts.push(`<polyline points="${closedPath}" fill="none" stroke="${colors.plotBoundary}" stroke-width="2.4" stroke-linejoin="round" />`);

    points.forEach((point) => {
      const px = xToPx(point.x);
      const py = yToPx(point.y);
        if (point.y !== 0) {
        parts.push(`<line x1="${px}" y1="${yToPx(0)}" x2="${px}" y2="${py}" stroke="${colors.plotAux}" stroke-width="1.2" stroke-dasharray="4 3" />`);
      }
      if (showPoints) {
        parts.push(`<circle cx="${px}" cy="${py}" r="5" fill="${colors.plotPoint}" />`);
      }
      const label = getLabelPosition(px, py, `${point.name} (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`, width, height, 8, 3);
      parts.push(`<text x="${label.x}" y="${label.y}" text-anchor="${label.anchor}" fill="${colors.plotText}" font-size="12" font-weight="600">${escapeHtml(`${point.name} (${point.x.toFixed(2)}, ${point.y.toFixed(2)})`)}</text>`);
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
      parts.push(`<text x="${midX}" y="${midY}" transform="rotate(${normalizedAngle}, ${midX}, ${midY})" fill="${colors.plotAux}" font-size="12" font-weight="700">${sideLength.toFixed(2)} m</text>`);
    }
  }

  joins.forEach((join, index) => {
    const next = joins[index + 1];
    if (!next) {
      return;
    }

    const x1 = xToPx(join.x);
    const y1 = yToPx(join.y);
    const x2 = xToPx(next.x);
    const y2 = yToPx(next.y);
    parts.push(`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.plotJoin}" stroke-width="2" stroke-dasharray="6 4" />`);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    const joinLength = calculateDistance(join, next);
    parts.push(`<text x="${midX}" y="${midY}" fill="${colors.plotJoinLabel}" font-size="11" font-weight="700">${joinLength.toFixed(2)} m</text>`);
  });

  const areaText = `Area: ${area.hectares} ha • ${area.ares} a • ${area.remSqm.toFixed(2)} sqm • ${area.acres.toFixed(3)} ac • ${area.cents.toFixed(2)} cents • ${area.sqft.toFixed(2)} sqft`;
  parts.push(`<text x="${width - 24}" y="28" text-anchor="end" fill="${colors.plotAreaText}" font-size="13" font-weight="700">${escapeHtml(areaText)}</text>`);

  if (centerText.trim()) {
    parts.push(`<text x="400" y="250" text-anchor="middle" fill="${colors.plotCenterText}" fill-opacity="${colors.plotCenterOpacity}" font-size="32" font-weight="700" opacity="0.7" letter-spacing="0.12em">${escapeHtml(centerText.trim())}</text>`);
  }

  return parts.join("");
}

function render() {
  const pointsInput = document.getElementById("points-input");
  const joinsInput = document.getElementById("joins-input");
  const centerText = document.getElementById("center-text");
  const showPoints = document.getElementById("show-points");
  const showGridlines = document.getElementById("show-gridlines");
  const warnings = document.getElementById("warnings");
  const plot = document.getElementById("plot");

  const { result: points, warnings: parseWarnings } = parseCoordinateText(pointsInput.value, "Point");
  const { result: extraPoints, warnings: joinWarnings } = parseCoordinateText(joinsInput.value, "Join");

  const area = calculateArea(points);

  const combinedWarnings = [...parseWarnings, ...joinWarnings];
  warnings.classList.toggle("show", combinedWarnings.length > 0);
  warnings.innerHTML = combinedWarnings.length
    ? combinedWarnings.map((message) => `<div>${escapeHtml(message)}</div>`).join("")
    : "";

  plot.innerHTML = buildPlot(points, extraPoints, centerText.value, showPoints.checked, showGridlines.checked, area);
}

function exportInputs() {
  const plot = document.getElementById("plot");
  const centerText = document.getElementById("center-text");
  if (!plot) {
    return;
  }

  const viewBox = plot.getAttribute("viewBox") || "0 0 800 500";
  const width = plot.getAttribute("width") || "800";
  const height = plot.getAttribute("height") || "500";
  const fileName = `${getDownloadBaseName(centerText.value, "fmb-plot")}.svg`;
  const config = getCurrentConfig();
  downloadSvgFile(fileName, config, plot.innerHTML, viewBox, width, height);
  setStatus("Plot exported as SVG with embedded data.");
}

function saveGraph() {
  const plot = document.getElementById("plot");
  const centerText = document.getElementById("center-text");
  if (!plot) {
    return;
  }

  const viewBox = plot.getAttribute("viewBox") || "0 0 800 500";
  const width = plot.getAttribute("width") || "800";
  const height = plot.getAttribute("height") || "500";
  const fileName = `${getDownloadBaseName(centerText.value, "fmb-plot")}.svg`;
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
      const centerText = document.getElementById("center-text");
      const showPoints = document.getElementById("show-points");
      const showGridlines = document.getElementById("show-gridlines");

      if (typeof data.points === "string") {
        pointsInput.value = data.points;
      }
      if (typeof data.joins === "string") {
        joinsInput.value = data.joins;
      }
      if (typeof data.centerText === "string") {
        centerText.value = data.centerText;
      }
      if (typeof data.showPoints === "boolean") {
        showPoints.checked = data.showPoints;
      }
      if (typeof data.showGridlines === "boolean") {
        showGridlines.checked = data.showGridlines;
      }

      render();
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

function initialize() {
  const pointsInput = document.getElementById("points-input");
  const joinsInput = document.getElementById("joins-input");
  const centerText = document.getElementById("center-text");
  const showPoints = document.getElementById("show-points");
  const showGridlines = document.getElementById("show-gridlines");
  const exportBtn = document.getElementById("export-btn");
  const importBtn = document.getElementById("import-btn");
  const saveGraphBtn = document.getElementById("save-graph-btn");
  const importFile = document.getElementById("import-file");
  const themeToggle = document.getElementById("theme-toggle");

  const savedTheme = getSavedTheme();
  applyTheme(savedTheme === "dark" ? "dark" : "light");

  pointsInput.value = defaultPoints;
  joinsInput.value = defaultJoins;
  centerText.value = "";
  showPoints.checked = true;
  showGridlines.checked = true;

  [pointsInput, joinsInput, centerText].forEach((element) => {
    element.addEventListener("input", render);
  });
  showPoints.addEventListener("change", render);
  showGridlines.addEventListener("change", render);
  exportBtn.addEventListener("click", exportInputs);
  importBtn.addEventListener("click", () => importFile.click());
  saveGraphBtn.addEventListener("click", saveGraph);
  importFile.addEventListener("change", importInputs);
  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  render();
}

document.addEventListener("DOMContentLoaded", initialize);
