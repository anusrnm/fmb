// Pure coordinate-text parsing helpers, free of DOM/state dependencies so they
// can be imported and unit-tested in isolation. See app.js for the callers.

export function parseCoordinatesText(text) {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = [];
  for (const row of rows) {
    const commaParts = row.split(",").map((part) => part.trim()).filter(Boolean);
    let label = "";
    let xToken = "";
    let yToken = "";

    if (commaParts.length >= 3) {
      [label, xToken, yToken] = commaParts;
    } else if (commaParts.length === 2) {
      [xToken, yToken] = commaParts;
    } else {
      const numberTokens = row.match(/-?\d+(?:\.\d+)?/g);
      if (!numberTokens || numberTokens.length < 2) {
        throw new Error(`Could not read coordinates from line: "${row}"`);
      }
      xToken = numberTokens[0];
      yToken = numberTokens[1];
    }

    const x = Number(xToken);
    const y = Number(yToken);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`Invalid numeric coordinates in line: "${row}"`);
    }

    parsed.push({ label, x, y });
  }

  return parsed;
}

export function normalizeCoordinateLoop(points) {
  if (points.length < 4) {
    return points;
  }

  const first = points[0];
  const last = points[points.length - 1];
  const samePosition = Math.abs(first.x - last.x) < 1e-9 && Math.abs(first.y - last.y) < 1e-9;
  return samePosition ? points.slice(0, -1) : points;
}
