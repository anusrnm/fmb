import { expect, test } from "@playwright/test";
import { clickGraph, exportDiagram, gotoEditor } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
});

async function importTransformNetwork(page, lockedPointId = null) {
  const data = {
    nextId: 17, scale: 32, panX: 0, panY: 0,
    points: [
      { id: 1, x: 2, y: 3 }, { id: 2, x: 6, y: 3 },
      { id: 3, x: 6, y: 7 }, { id: 4, x: 2, y: 7 },
      { id: 5, x: 10, y: 7 }, { id: 6, x: 10, y: 11 },
      { id: 7, x: 12, y: 11 }, { id: 8, x: 14, y: 11 },
      { id: 9, x: 2, y: 3 },
    ],
    polygons: [
      { id: 10, pointIds: [1, 2, 3, 4], labelOffset: { x: 1, y: 2 }, edgeStyles: { 1: "dashed" } },
      { id: 11, pointIds: [3, 5, 6], labelOffset: { x: 0, y: 0 }, edgeStyles: {} },
    ],
    segments: [
      { id: 12, a: 6, b: 7, kind: "parallel", lineStyle: "dotted" },
      { id: 13, a: 7, b: 8, kind: "segment", lineStyle: "solid" },
    ],
    texts: [{ id: 14, x: -8, y: -5, content: "Not attached", size: 16 }],
    angleAnnotations: [{ id: 15, vertexId: 2, aId: 1, bId: 3 }],
    constraints: lockedPointId === null ? [] : [{ id: 16, type: "point-lock", pointId: lockedPointId }],
  };
  await page.locator("#import-file").setInputFiles({
    name: "transform-network.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ data })),
  });
  await expect(page.getByRole("status")).toContainText("JSON import complete");
  return data;
}

async function openNetworkTransform(page) {
  const box = await page.locator("#graph").boundingBox();
  await page.locator("#graph").click({
    button: "right",
    position: { x: box.width / 2 + 4 * 32, y: box.height / 2 - 5 * 32 },
  });
  await page.getByRole("button", { name: "Transform Shape", exact: true }).click();
  await expect(page.locator("#transform-shape-dialog")).toBeVisible();
}

async function selectPolygonRotationPivot(page) {
  const box = await page.locator("#graph").boundingBox();
  await page.locator("#graph").click({
    button: "right",
    position: { x: box.width / 2 + 4 * 32, y: box.height / 2 - 5 * 32 },
  });
  await page.keyboard.press("Escape");
  await page.locator("#graph").click({
    modifiers: ["Control"],
    position: { x: box.width / 2 + 6 * 32, y: box.height / 2 - 7 * 32 },
  });
}

test("precise rotation shortcut rotates only the selected polygon about its selected point", async ({ page }) => {
  const before = await importTransformNetwork(page, 3);
  await selectPolygonRotationPivot(page);
  let degrees = 0;
  let after;
  const rotations = [["r", 1], ["Shift+r", 0.1], ["Alt+r", 0.01],
    ["q", -1], ["Shift+q", -0.1], ["Alt+q", -0.01]];
  for (const [shortcut, step] of rotations) {
    await page.keyboard.press(shortcut);
    await expect(page.getByRole("status")).toContainText(`Polygon rotated ${step}deg`);
    await expect(page.locator("#transform-shape-dialog")).toBeHidden();
    degrees += step;
    after = await exportDiagram(page);
    const rotated = after.points.find((point) => point.id === after.polygons[0].pointIds[3]);
    const radians = degrees * Math.PI / 180;
    expect(rotated.x).toBeCloseTo(6 - 4 * Math.cos(radians), 9);
    expect(rotated.y).toBeCloseTo(7 - 4 * Math.sin(radians), 9);
  }
  const polygon = after.polygons.find((shape) => shape.id === 10);
  const radians = degrees * Math.PI / 180;
  polygon.pointIds.forEach((id, index) => {
    const point = after.points.find((entry) => entry.id === id);
    const original = before.points[index];
    const x = original.x - 6;
    const y = original.y - 7;
    expect(point.x).toBeCloseTo(6 + x * Math.cos(radians) - y * Math.sin(radians), 9);
    expect(point.y).toBeCloseTo(7 + x * Math.sin(radians) + y * Math.cos(radians), 9);
  });
  expect(polygon.pointIds[2]).toBe(3);
  expect(after.polygons[1]).toEqual(before.polygons[1]);
  expect(after.segments).toEqual(before.segments);
  expect(after.points.slice(4, 9)).toEqual(before.points.slice(4, 9));
  expect(after.angleAnnotations).toEqual(before.angleAnnotations);
  for (let index = 0; index < rotations.length; index += 1) await page.locator("#undo-btn").click();
  const undone = await exportDiagram(page);
  expect(undone.points).toEqual(before.points);
  expect(undone.polygons).toEqual(before.polygons);
  for (let index = 0; index < rotations.length; index += 1) await page.locator("#redo-btn").click();
  expect((await exportDiagram(page)).points).toEqual(after.points);
});

test("precise rotation button is above zoom and validates selection and locked vertices", async ({ page }) => {
  await page.getByRole("button", { name: "Rotate around selected point", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Select one polygon");
  await expect(page.locator("#transform-shape-dialog")).toBeHidden();
  const rotateBox = await page.locator("#rotate-point-btn").boundingBox();
  const zoomBox = await page.locator("#zoom-in-btn").boundingBox();
  expect(rotateBox.y + rotateBox.height).toBeLessThanOrEqual(zoomBox.y);
  const before = await importTransformNetwork(page, 4);
  await selectPolygonRotationPivot(page);
  await page.getByRole("button", { name: "Rotate around selected point", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Unlock the polygon");
  await expect(page.locator("#transform-shape-dialog")).toBeHidden();
  expect((await exportDiagram(page)).points).toEqual(before.points);
  await importTransformNetwork(page, 3);
  await selectPolygonRotationPivot(page);
  let degrees = 0;
  for (const [modifiers, step] of [[[], 1], [["Shift"], 0.1], [["Alt"], 0.01],
    [[], -1], [["Shift"], -0.1], [["Alt"], -0.01]]) {
    const name = step < 0 ? "Rotate clockwise around selected point" : "Rotate around selected point";
    await page.getByRole("button", { name, exact: true }).click({ modifiers });
    await expect(page.getByRole("status")).toContainText(`Polygon rotated ${step}deg`);
    await expect(page.locator("#transform-shape-dialog")).toBeHidden();
    degrees += step;
    const data = await exportDiagram(page);
    const rotated = data.points.find((point) => point.id === data.polygons[0].pointIds[3]);
    expect(rotated.x).toBeCloseTo(6 - 4 * Math.cos(degrees * Math.PI / 180), 9);
    expect(rotated.y).toBeCloseTo(7 - 4 * Math.sin(degrees * Math.PI / 180), 9);
  }
  await openNetworkTransform(page);
  await expect(page.getByLabel("Operation", { exact: true })).toBeVisible();
  await expect(page.locator("#transform-shape-summary")).toContainText("First-vertex pivot:");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("transform shape moves the connected network with undo, redo and persistence", async ({ page }) => {
  const before = await importTransformNetwork(page);
  await openNetworkTransform(page);
  await expect(page.locator("#transform-shape-summary")).toContainText("8 points, 2 polygons, 2 segments");
  await expect(page.locator("#transform-shape-summary")).toContainText("(2, 3)");
  await page.getByLabel("X offset", { exact: true }).fill("1.23456");
  await page.getByLabel("Y offset", { exact: true }).fill("-2.34567");
  await page.getByRole("button", { name: "Apply transform" }).click();
  await expect(page.getByRole("status")).toContainText("Transformed connected network (8 points)");
  const after = await exportDiagram(page);
  after.points.forEach((point, index) => {
    const original = before.points[index];
    expect(point.x).toBeCloseTo(original.x + (point.id === 9 ? 0 : 1.23456), 8);
    expect(point.y).toBeCloseTo(original.y + (point.id === 9 ? 0 : -2.34567), 8);
  });
  expect(after.polygons).toEqual(before.polygons);
  expect(after.segments).toEqual(before.segments);
  expect(after.angleAnnotations).toEqual(before.angleAnnotations);
  expect(after.texts).toEqual(before.texts);
  expect(after.scale).toBe(before.scale);
  expect(after.panX).toBe(before.panX);
  expect(after.panY).toBe(before.panY);
  await page.locator("#undo-btn").click();
  expect((await exportDiagram(page)).points).toEqual(before.points);
  await page.locator("#redo-btn").click();
  expect((await exportDiagram(page)).points).toEqual(after.points);
  await page.reload();
  expect((await exportDiagram(page)).points).toEqual(after.points);
});

test("transform shape rotates and mirrors around a stationary locked first vertex", async ({ page }) => {
  for (const operation of ["rotate", "horizontal", "vertical"]) {
    const before = await importTransformNetwork(page, 1);
    await openNetworkTransform(page);
    await page.getByLabel("Operation", { exact: true }).selectOption(operation === "rotate" ? "rotate" : "mirror");
    if (operation === "rotate") {
      await page.getByLabel("Angle (degrees, counterclockwise)").fill("90");
    } else {
      await page.getByLabel("Direction", { exact: true }).selectOption(operation);
    }
    await page.getByRole("button", { name: "Apply transform" }).click();
    await expect(page.getByRole("status")).toContainText("Transformed connected network");
    const after = await exportDiagram(page);
    after.points.forEach((point, index) => {
      const original = before.points[index];
      const x = original.x - 2;
      const y = original.y - 3;
      const expected = point.id === 9 ? original : operation === "rotate"
        ? { x: 2 - y, y: 3 + x }
        : operation === "horizontal" ? { x: 2 - x, y: original.y } : { x: original.x, y: 3 - y };
      expect(point.x).toBeCloseTo(expected.x, 8);
      expect(point.y).toBeCloseTo(expected.y, 8);
    });
    expect(after.constraints).toEqual(before.constraints);
    expect(after.polygons[0].labelOffset).toEqual(operation === "rotate"
      ? { x: -2, y: 1 } : operation === "horizontal" ? { x: -1, y: 2 } : { x: 1, y: -2 });
  }
});

test("transform shape rejects invalid input and locked connected points atomically", async ({ page }) => {
  const before = await importTransformNetwork(page, 8);
  await openNetworkTransform(page);
  await page.getByLabel("X offset", { exact: true }).fill("");
  await page.getByRole("button", { name: "Apply transform" }).click();
  await expect(page.getByRole("alert")).toContainText("finite X offset");
  await page.getByLabel("X offset", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Apply transform" }).click();
  await expect(page.getByRole("alert")).toContainText("Unlock");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const after = await exportDiagram(page);
  expect(after.points).toEqual(before.points);
  expect(after.polygons).toEqual(before.polygons);
  expect(after.constraints).toEqual(before.constraints);
});

test("transform shape cancel, Escape and identity operations leave drawing and history unchanged", async ({ page }) => {
  const before = await importTransformNetwork(page);
  const undoTitle = await page.locator("#undo-btn").getAttribute("title");
  await openNetworkTransform(page);
  await page.getByLabel("X offset", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openNetworkTransform(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("#transform-shape-dialog")).toBeHidden();
  await openNetworkTransform(page);
  await page.getByLabel("Operation", { exact: true }).selectOption("rotate");
  await page.getByLabel("Angle (degrees, counterclockwise)").fill("360");
  await page.getByRole("button", { name: "Apply transform" }).focus();
  await page.keyboard.press("3");
  await expect(page.getByLabel("Select tools")).toHaveValue("select");
  await page.getByRole("button", { name: "Apply transform" }).click();
  await expect(page.getByRole("status")).toContainText("made no changes");
  await expect(page.locator("#undo-btn")).toHaveAttribute("title", undoTitle);
  expect((await exportDiagram(page)).points).toEqual(before.points);
});

test("draws a polygon from ordered side lengths and supports undo and redo", async ({ page }) => {
  const before = await exportDiagram(page);
  await page.getByTitle("Plot by side lengths").click();
  await page.getByLabel("Side lengths", { exact: true }).fill("5, 2, 2, 2");
  await page.getByRole("button", { name: "Draw polygon" }).click();
  await expect(page.getByRole("status")).toContainText("Polygon created from 4 side lengths");
  const data = await exportDiagram(page);
  expect(data.polygons).toHaveLength(before.polygons.length + 1);
  const polygon = data.polygons.at(-1);
  const points = polygon.pointIds.map((id) => data.points.find((point) => point.id === id));
  expect(points[0]).toMatchObject({ x: 0, y: 0 });
  [5, 2, 2, 2].forEach((side, index) => {
    const next = points[(index + 1) % points.length];
    expect(Math.hypot(points[index].x - next.x, points[index].y - next.y)).toBeCloseTo(side, 7);
  });
  await page.locator("#undo-btn").click();
  expect((await exportDiagram(page)).polygons).toHaveLength(before.polygons.length);
  await page.locator("#redo-btn").click();
  expect((await exportDiagram(page)).polygons).toHaveLength(before.polygons.length + 1);
  await page.reload();
  const restored = await exportDiagram(page);
  expect(restored.polygons.at(-1)).toEqual(polygon);
  expect(restored.points.slice(-points.length)).toEqual(points);
});

test("deleting a polygon removes its unshared vertices and undo restores them", async ({ page }) => {
  const before = await exportDiagram(page);
  await page.getByTitle("Plot by side lengths").click();
  await page.getByLabel("Side lengths", { exact: true }).fill("3, 4, 5");
  await page.getByRole("button", { name: "Draw polygon" }).click();
  const created = await exportDiagram(page);
  const pointIds = created.polygons.at(-1).pointIds;
  await page.keyboard.press("Delete");
  const deleted = await exportDiagram(page);
  expect(deleted.polygons).toHaveLength(before.polygons.length);
  expect(deleted.points.some((point) => pointIds.includes(point.id))).toBe(false);
  await page.locator("#undo-btn").click();
  const restored = await exportDiagram(page);
  expect(restored.polygons).toEqual(created.polygons);
  expect(restored.points).toEqual(created.points);
});

test("deleting a polygon preserves vertices used by other polygons or segments", async ({ page }) => {
  const diagram = {
    data: {
      nextId: 11,
      scale: 32, panX: 0, panY: 0,
      points: [
        { id: 1, x: 0, y: 0 }, { id: 2, x: 4, y: 0 },
        { id: 3, x: 4, y: 4 }, { id: 4, x: 0, y: 4 },
        { id: 5, x: -4, y: 0 }, { id: 6, x: -2, y: 3 },
        { id: 7, x: 6, y: 0 },
      ],
      segments: [{ id: 8, a: 2, b: 7, kind: "segment" }],
      polygons: [
        { id: 9, pointIds: [1, 2, 3, 4] },
        { id: 10, pointIds: [1, 5, 6] },
      ],
      texts: [], angleAnnotations: [], constraints: [],
    },
  };
  await page.locator("#import-file").setInputFiles({
    name: "shared-points.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(diagram)),
  });
  await expect(page.getByRole("status")).toContainText("JSON import complete");
  await page.locator("#import-file").evaluate((input) => input.blur());
  await page.getByTitle("Settings").click();
  await page.getByLabel("Point and area labels").uncheck();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const graphBox = await page.locator("#graph").boundingBox();
  await clickGraph(page, graphBox.width / 2 + 64, graphBox.height / 2 - 64);
  await expect(page.getByRole("status")).toContainText("Dragging shape");
  await page.keyboard.press("Delete");
  const data = await exportDiagram(page);
  expect(data.polygons.map((polygon) => polygon.id)).toEqual([10]);
  expect(data.points.map((point) => point.id)).toEqual([1, 2, 5, 6, 7]);
  expect(data.segments.map((segment) => segment.id)).toEqual([8]);
  await page.locator("#undo-btn").click();
  await page.locator("#graph").click({
    button: "right",
    position: { x: graphBox.width / 2 + 64, y: graphBox.height / 2 - 64 },
  });
  await page.getByRole("button", { name: "Edit Side Lengths" }).click();
  await page.getByLabel("Side lengths", { exact: true }).fill("3, 4, 5");
  await page.getByRole("button", { name: "Update polygon" }).click();
  const updated = await exportDiagram(page);
  expect(updated.polygons.find((polygon) => polygon.id === 10)).toMatchObject(diagram.data.polygons[1]);
  expect(updated.segments.find((segment) => segment.id === 8)).toMatchObject(diagram.data.segments[0]);
  expect(updated.points.find((point) => point.id === 1)).toMatchObject(diagram.data.points[0]);
  expect(updated.points.find((point) => point.id === 2)).toMatchObject(diagram.data.points[1]);
  expect(updated.polygons.find((polygon) => polygon.id === 9).pointIds).not.toContain(1);
  expect(updated.polygons.find((polygon) => polygon.id === 9).pointIds).not.toContain(2);
});

test("side-length dialog reports invalid input without changing the drawing", async ({ page }) => {
  const before = await exportDiagram(page);
  await page.getByTitle("Plot by side lengths").click();
  const input = page.getByLabel("Side lengths", { exact: true });
  await input.fill("1, 1, 2");
  await page.getByRole("button", { name: "Draw polygon" }).click();
  await expect(page.getByRole("alert")).toContainText("longest side");
  await input.fill("3, bad, 5");
  await page.getByRole("button", { name: "Draw polygon" }).click();
  await expect(page.getByRole("alert")).toContainText("valid numbers");
  await page.getByRole("button", { name: "Cancel" }).click();
  expect((await exportDiagram(page)).polygons).toHaveLength(before.polygons.length);
});

test("edits polygon side lengths from the right-click menu", async ({ page }) => {
  await page.getByTitle("Plot by side lengths").click();
  await page.getByLabel("Side lengths", { exact: true }).fill("3, 4, 5");
  await page.getByRole("button", { name: "Draw polygon" }).click();
  const before = await exportDiagram(page);
  const graphBox = await page.locator("#graph").boundingBox();
  await page.locator("#graph").click({
    button: "right",
    position: { x: graphBox.width / 2, y: graphBox.height / 2 },
  });
  await page.getByRole("button", { name: "Edit Side Lengths" }).click();
  const input = page.getByLabel("Side lengths", { exact: true });
  const originalSides = (await input.inputValue()).split(",").map(Number);
  [3, 4, 5].forEach((side, index) => expect(originalSides[index]).toBeCloseTo(side, 7));
  await input.fill("4, 4, 4, 4");
  await page.getByRole("button", { name: "Update polygon" }).click();
  await expect(page.getByRole("status")).toContainText("Polygon updated from 4 side lengths");
  const after = await exportDiagram(page);
  expect(after.polygons).toHaveLength(before.polygons.length);
  const polygon = after.polygons.at(-1);
  expect(polygon.id).toBe(before.polygons.at(-1).id);
  const points = polygon.pointIds.map((id) => after.points.find((point) => point.id === id));
  expect(points[0]).toMatchObject({ x: 0, y: 0 });
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    expect(Math.hypot(point.x - next.x, point.y - next.y)).toBeCloseTo(4, 7);
  });
  await page.locator("#undo-btn").click();
  const undone = await exportDiagram(page);
  expect(undone.polygons).toEqual(before.polygons);
  expect(undone.points).toEqual(before.points);
});

test("rounds displayed side lengths without changing unedited side precision", async ({ page }) => {
  await page.getByTitle("Plot by side lengths").click();
  await page.getByLabel("Side lengths", { exact: true }).fill("3.14159, 4.23456, 5.34567");
  await page.getByRole("button", { name: "Draw polygon" }).click();
  const graphBox = await page.locator("#graph").boundingBox();
  await page.locator("#graph").click({
    button: "right",
    position: { x: graphBox.width / 2, y: graphBox.height / 2 },
  });
  await page.getByRole("button", { name: "Edit Side Lengths" }).click();
  const input = page.getByLabel("Side lengths", { exact: true });
  await expect(input).toHaveValue("3.14, 4.23, 5.35");
  await input.fill("3.25, 4.23, 5.35");
  await page.getByRole("button", { name: "Update polygon" }).click();
  const data = await exportDiagram(page);
  const points = data.polygons.at(-1).pointIds.map((id) => data.points.find((point) => point.id === id));
  [3.25, 4.23456, 5.34567].forEach((side, index) => {
    const next = points[(index + 1) % points.length];
    expect(Math.hypot(points[index].x - next.x, points[index].y - next.y)).toBeCloseTo(side, 7);
  });
});

test("creates a segment, inserts its midpoint, and adds text", async ({ page }) => {
  await page.getByLabel("Line tools").selectOption("segment");
  await clickGraph(page, 300, 500);
  await clickGraph(page, 500, 500);
  await expect(page.getByRole("status")).toContainText("Segment created");

  await page.getByLabel("Point tools").selectOption("midpoint");
  await clickGraph(page, 400, 500);
  await expect(page.getByRole("status")).toContainText("Midpoint inserted");

  await page.getByTitle("Text").click();
  await clickGraph(page, 650, 450);
  await page.getByLabel("Inline text editor").fill("Survey note");
  await page.getByLabel("Inline text editor").press("Enter");
  await expect(page.locator("#graph text", { hasText: "Survey note" })).toBeVisible();
});

test("creates a segment from numeric input after first click", async ({ page }) => {
  await page.getByLabel("Line tools").selectOption("segment");
  await clickGraph(page, 300, 500);

  await page.keyboard.press("Enter");
  const dialog = page.locator("#numeric-input-dialog");
  await expect(dialog).toBeVisible();
  await page.locator("#numeric-input-field").fill("10, 0");
  await page.locator("#numeric-input-field").press("Enter");

  await expect(page.getByRole("status")).toContainText("Segment created from numeric input");

  const data = await exportDiagram(page);
  const segment = data.segments[data.segments.length - 1];
  const pointA = data.points.find((point) => point.id === segment.a);
  const pointB = data.points.find((point) => point.id === segment.b);
  expect(pointA).toBeTruthy();
  expect(pointB).toBeTruthy();
  const length = Math.hypot(pointA.x - pointB.x, pointA.y - pointB.y);
  expect(length).toBeCloseTo(10, 2);
});

test("adds polygon vertex from numeric edge input", async ({ page }) => {
  await page.getByTitle("Polygon").click();
  await clickGraph(page, 120, 470);

  await page.keyboard.press("Enter");
  const dialog = page.locator("#numeric-input-dialog");
  await expect(dialog).toBeVisible();
  await page.locator("#numeric-input-field").fill("5, 0");
  await page.locator("#numeric-input-field").press("Enter");

  await expect(page.getByRole("status")).toContainText("Polygon drafting: 2 vertex");
});

test("drafts a polygon by closing it at the first vertex", async ({ page }) => {
  await page.getByTitle("Polygon").click();
  await clickGraph(page, 120, 470);
  await clickGraph(page, 230, 470);
  await clickGraph(page, 175, 380);
  await expect(page.getByRole("status")).toContainText("Polygon drafting: 3 vertices");
  await clickGraph(page, 120, 470);

  await expect(page.getByRole("status")).toContainText("Polygon closed");
  await expect(page.locator("#graph polygon")).toHaveCount(2);
});

test("selects, nudges, and deletes a point with keyboard controls", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "P1 (-7.8, -4)" })).toBeVisible();
  await page.keyboard.press("Delete");

  await expect(page.getByRole("status")).toContainText("Selection deleted");
  await expect(page.locator("#graph circle")).toHaveCount(3);
});

test("locks selected points to block move until unlocked", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.keyboard.press("l");
  await expect(page.getByRole("status")).toContainText("Locked 1 point");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("Selected points are locked");
  await expect(page.locator("#graph text", { hasText: "P1 (-8, -4)" })).toBeVisible();

  await page.keyboard.press("l");
  await expect(page.getByRole("status")).toContainText("Unlocked 1 point");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "P1 (-7.8, -4)" })).toBeVisible();
});

test("ctrl/cmd deselect does not drag a point", async ({ page, browserName }) => {
  const modifier = browserName === "webkit" ? "Meta" : "Control";
  const pointA = page.locator("#graph text", { hasText: "P1 (-8, -4)" });
  const pointCircle = page.locator("#graph circle").first();

  await expect(pointA).toBeVisible();
  const box = await pointCircle.boundingBox();
  if (!box) {
    throw new Error("Expected first point circle to be visible.");
  }
  const x = box.x + box.width * 0.5;
  const y = box.y + box.height * 0.5;

  await page.mouse.click(x, y);

  await page.keyboard.down(modifier);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 50, y + 20);
  await page.mouse.up();
  await page.keyboard.up(modifier);

  await expect(page.locator("#graph text", { hasText: "P1 (-8, -4)" })).toBeVisible();
});

test("constructs parallel and perpendicular segments from a selected base", async ({ page }) => {
  await page.getByLabel("Line tools").selectOption("segment");
  await clickGraph(page, 300, 500);
  await clickGraph(page, 500, 500);

  await page.getByLabel("Line tools").selectOption("parallel");
  await clickGraph(page, 400, 500);
  await expect(page.getByRole("status")).toContainText("Base segment selected");
  await clickGraph(page, 400, 400);
  await expect(page.getByRole("status")).toContainText("Parallel segment created");

  await page.getByLabel("Line tools").selectOption("perpendicular");
  await clickGraph(page, 400, 500);
  await expect(page.getByRole("status")).toContainText("Base segment selected");
  await clickGraph(page, 550, 400);
  await expect(page.getByRole("status")).toContainText("Perpendicular segment created");
});

test("pins and removes an angle annotation", async ({ page }) => {
  await page.getByLabel("Line tools").selectOption("segment");
  await clickGraph(page, 520, 500);
  await clickGraph(page, 640, 500);
  await clickGraph(page, 520, 500);
  await clickGraph(page, 520, 380);

  await page.getByTitle("Angle").click();
  await clickGraph(page, 545, 475);
  await expect(page.getByRole("status")).toContainText("Angle annotation saved");

  await clickGraph(page, 545, 475);
  await expect(page.getByRole("status")).toContainText("Angle annotation removed");
});

test("reports duplicate segment creation instead of claiming success", async ({ page }) => {
  await page.getByLabel("Line tools").selectOption("segment");
  await clickGraph(page, 300, 500);
  await clickGraph(page, 500, 500);
  await expect(page.getByRole("status")).toContainText("Segment created");

  await clickGraph(page, 300, 500);
  await clickGraph(page, 500, 500);
  await expect(page.getByRole("status")).toContainText("That segment already exists");
});

test("inserts and removes a polygon vertex with vertex edit tools", async ({ page }) => {
  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }
  await clickGraph(page, graphBox.width * 0.5 + 12, graphBox.height * 0.5 + 6);

  const pointA = await page.locator("#graph text", { hasText: "P1 (-8, -4)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const pointB = await page.locator("#graph text", { hasText: "P2 (6, -2)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const midpoint = {
    x: (pointA.x + pointB.x) * 0.5,
    y: (pointA.y + pointB.y) * 0.5,
  };

  await page.keyboard.down("Control");
  await page.locator("#graph").click({ position: midpoint });
  await page.keyboard.up("Control");
  await expect(page.getByRole("status")).toContainText("Polygon vertex inserted");
  const afterInsert = await exportDiagram(page);
  expect(afterInsert.points).toHaveLength(5);

  await page.keyboard.press("x");
  await expect(page.getByRole("status")).toContainText("Removed vertex");
  const afterRemove = await exportDiagram(page);
  expect(afterRemove.points).toHaveLength(4);
});

test("manages point locks from the constraints panel", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.getByTitle("Settings").click();

  await page.locator("#lock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Locked 1 point");
  await expect(page.locator("#constraints-summary")).toContainText("1 lock constraint");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("Selected points are locked");

  await page.locator("#unlock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Unlocked 1 point");
  await expect(page.locator("#constraints-summary")).toContainText("0 lock constraints");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "P1 (-7.8, -4)" })).toBeVisible();
});

test("clears and unlocks constraints via panel actions", async ({ page }) => {
  await clickGraph(page, 373, 434);

  await page.getByTitle("Settings").click();
  await page.locator("#lock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Locked 1 point");
  await expect(page.locator("#constraints-summary")).toContainText("1 lock constraint");

  await page.locator("#unlock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Unlocked 1 point");
  await expect(page.locator("#constraints-summary")).toContainText("0 lock constraints");

  await page.locator("#lock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Locked 1 point");
  await page.locator("#clear-constraints-btn").click();
  await expect(page.getByRole("status")).toContainText("Cleared 1 constraint");
  await expect(page.locator("#constraints-summary")).toContainText("0 lock constraints");
  await expect(page.locator("#clear-constraints-btn")).toBeDisabled();
});

test("shows vertex handles, edge affordance, and inline hint for polygon editing", async ({ page }) => {
  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }

  await clickGraph(page, graphBox.width * 0.5 + 12, graphBox.height * 0.5 + 6);
  await expect(page.locator("#graph circle.vertex-handle")).toHaveCount(4);
  await expect(page.locator("#vertex-edit-hint")).toBeVisible();
  await expect(page.locator("#vertex-edit-hint")).toContainText("Ctrl+Click");
  await expect(page.locator("#vertex-edit-hint")).toContainText("X");

  const pointA = await page.locator("#graph text", { hasText: "P1 (-8, -4)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const pointB = await page.locator("#graph text", { hasText: "P2 (6, -2)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const midpoint = {
    x: (pointA.x + pointB.x) * 0.5,
    y: (pointA.y + pointB.y) * 0.5,
  };

  await page.locator("#graph").hover({ position: midpoint });
  await expect(page.locator("#graph circle.vertex-insert-affordance")).toHaveCount(1);
});

test("removing a shared polygon vertex keeps the shared point in other polygons", async ({ page }) => {
  const diagram = {
    data: {
      nextId: 7,
      scale: 32,
      panX: 0,
      panY: 0,
      points: [
        { id: 1, x: 0, y: 0, label: "A" },
        { id: 2, x: 4, y: 0, label: "B" },
        { id: 3, x: 4, y: 4, label: "C" },
        { id: 4, x: 0, y: 4, label: "D" },
        { id: 5, x: -4, y: 0, label: "E" },
        { id: 6, x: -2, y: 3, label: "F" },
      ],
      segments: [],
      polygons: [
        { id: 7, pointIds: [1, 2, 3, 4], labelOffset: { x: 0, y: 0 } },
        { id: 8, pointIds: [1, 5, 6], labelOffset: { x: 0, y: 0 } },
      ],
      texts: [],
      angleAnnotations: [],
      constraints: [],
    },
  };

  await page.locator("#import-file").setInputFiles({
    name: "shared-vertex.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(diagram)),
  });

  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }
  const center = { x: graphBox.width * 0.5, y: graphBox.height * 0.5 };

  // Select polygon [1,2,3,4], then additive-select shared point A(0,0).
  await clickGraph(page, center.x + 64, center.y - 64);
  await page.keyboard.down("Control");
  await clickGraph(page, center.x, center.y);
  await page.keyboard.up("Control");
  await page.keyboard.press("x");
  await expect(page.getByRole("status")).toContainText("Removed vertex at (0, 0)");

  const data = await exportDiagram(page);
  expect(data.points).toHaveLength(6);
  const poly7 = data.polygons.find((polygon) => polygon.id === 7);
  const poly8 = data.polygons.find((polygon) => polygon.id === 8);
  expect(poly7?.pointIds).toHaveLength(3);
  expect(poly8?.pointIds).toContain(1);
});

test("Ctrl+Click inserts a single polygon vertex when overlapping edges exist", async ({ page }) => {
  const diagram = {
    data: {
      nextId: 7,
      scale: 32,
      panX: 0,
      panY: 0,
      points: [
        { id: 1, x: 0, y: 0, label: "A" },
        { id: 2, x: 4, y: 0, label: "B" },
        { id: 3, x: 4, y: 4, label: "C" },
        { id: 4, x: 0, y: 4, label: "D" },
        { id: 5, x: 8, y: 0, label: "E" },
        { id: 6, x: 8, y: 4, label: "F" },
      ],
      segments: [],
      polygons: [
        { id: 7, pointIds: [1, 2, 3, 4], labelOffset: { x: 0, y: 0 } },
        { id: 8, pointIds: [2, 5, 6, 3], labelOffset: { x: 0, y: 0 } },
      ],
      texts: [],
      angleAnnotations: [],
      constraints: [],
    },
  };

  await page.locator("#import-file").setInputFiles({
    name: "overlapping-edges.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(diagram)),
  });

  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }
  const rightPolygon = page.locator("#graph polygon").nth(1);
  await expect(rightPolygon).toBeVisible();
  const rightPolygonBox = await rightPolygon.boundingBox();
  if (!rightPolygonBox) {
    throw new Error("Expected right polygon bounds.");
  }

  // Select the right polygon in polygon mode (away from its centroid label band), then
  // Ctrl+Click its shared B-C edge to insert a vertex.
  await page.getByTitle("Polygon").click();
  await rightPolygon.click({ position: { x: rightPolygonBox.width * 0.5, y: rightPolygonBox.height * 0.85 } });
  await page.keyboard.down("Control");
  await page.mouse.click(rightPolygonBox.x + 2, rightPolygonBox.y + rightPolygonBox.height * 0.5);
  await page.keyboard.up("Control");
  await expect(page.getByRole("status")).toContainText("Polygon vertex inserted");

  const data = await exportDiagram(page);
  const poly7 = data.polygons.find((polygon) => polygon.id === 7);
  const poly8 = data.polygons.find((polygon) => polygon.id === 8);
  const lengths = [poly7?.pointIds.length, poly8?.pointIds.length].sort((a, b) => a - b);
  expect(lengths).toEqual([4, 5]);
});

function polygonAreaFromExport(data, polygonId) {
  const polygon = data.polygons.find((entry) => entry.id === polygonId);
  if (!polygon || polygon.pointIds.length < 3) {
    return 0;
  }
  const byId = new Map(data.points.map((point) => [point.id, point]));
  let sum = 0;
  for (let index = 0; index < polygon.pointIds.length; index += 1) {
    const next = (index + 1) % polygon.pointIds.length;
    const a = byId.get(polygon.pointIds[index]);
    const b = byId.get(polygon.pointIds[next]);
    if (!a || !b) {
      continue;
    }
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) * 0.5;
}

async function importOverlappingRectangles(page) {
  const diagram = {
    data: {
      nextId: 9,
      scale: 32,
      panX: 0,
      panY: 0,
      points: [
        { id: 1, x: 0, y: 0, label: "A" },
        { id: 2, x: 4, y: 0, label: "B" },
        { id: 3, x: 4, y: 4, label: "C" },
        { id: 4, x: 0, y: 4, label: "D" },
        { id: 5, x: 2, y: 0, label: "E" },
        { id: 6, x: 6, y: 0, label: "F" },
        { id: 7, x: 6, y: 4, label: "G" },
        { id: 8, x: 2, y: 4, label: "H" },
      ],
      segments: [],
      polygons: [
        { id: 9, pointIds: [1, 2, 3, 4], labelOffset: { x: 0, y: 0 } },
        { id: 10, pointIds: [5, 6, 7, 8], labelOffset: { x: 0, y: 0 } },
      ],
      texts: [],
      angleAnnotations: [],
      constraints: [],
    },
  };

  await page.locator("#import-file").setInputFiles({
    name: "polygon-boolean-rectangles.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(diagram)),
  });
}

async function selectBothRectangles(page) {
  await page.getByLabel("Select tools").selectOption("box-select");

  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }
  const centerX = graphBox.width * 0.5;
  const centerY = graphBox.height * 0.5;

  await page.locator("#graph").dragTo(page.locator("#graph"), {
    sourcePosition: { x: centerX - 10, y: centerY - 140 },
    targetPosition: { x: centerX + 210, y: centerY + 20 },
  });

  await expect(page.getByRole("status")).toContainText("2 polygon(s)");
}

test("context menu closes on outside click", async ({ page }) => {
  const menu = page.locator("#context-menu");
  await page.locator("#graph").click({ button: "right", position: { x: 80, y: 80 } });
  await expect(menu).toBeVisible();

  await page.locator("#graph").click({ position: { x: 520, y: 220 } });
  await expect(menu).toBeHidden();
});

test("polygon union merges two selected overlapping polygons", async ({ page }) => {
  await importOverlappingRectangles(page);
  await selectBothRectangles(page);

  await page.locator("#graph").click({ button: "right", position: { x: 40, y: 40 } });
  await page.locator("#polygon-union-btn").click();
  await expect(page.getByRole("status")).toContainText("Polygon union complete");

  const data = await exportDiagram(page);
  expect(data.polygons).toHaveLength(1);
  const area = polygonAreaFromExport(data, data.polygons[0].id);
  expect(area).toBeCloseTo(24, 5);

  await expect(page.locator("#undo-btn")).toHaveAttribute("title", /Undo Polygon union/);
  await page.locator("#undo-btn").click();
  const afterUndo = await exportDiagram(page);
  expect(afterUndo.polygons).toHaveLength(2);

  await expect(page.locator("#redo-btn")).toHaveAttribute("title", /Redo Polygon union/);
  await page.locator("#redo-btn").click();
  const afterRedo = await exportDiagram(page);
  expect(afterRedo.polygons).toHaveLength(1);
});

test("polygon subtract computes selected-subject difference", async ({ page }) => {
  await importOverlappingRectangles(page);
  await selectBothRectangles(page);

  await page.locator("#graph").click({ button: "right", position: { x: 40, y: 40 } });
  await page.locator("#polygon-subtract-btn").click();
  await expect(page.getByRole("status")).toContainText("Polygon subtract complete");

  const data = await exportDiagram(page);
  expect(data.polygons).toHaveLength(1);
  const area = polygonAreaFromExport(data, data.polygons[0].id);
  expect(area).toBeCloseTo(8, 5);
});

test("polygon intersect computes overlap region", async ({ page }) => {
  await importOverlappingRectangles(page);
  await selectBothRectangles(page);

  await page.locator("#graph").click({ button: "right", position: { x: 40, y: 40 } });
  await page.locator("#polygon-intersect-btn").click();
  await expect(page.getByRole("status")).toContainText("Polygon intersect complete");

  const data = await exportDiagram(page);
  expect(data.polygons).toHaveLength(1);
  const area = polygonAreaFromExport(data, data.polygons[0].id);
  expect(area).toBeCloseTo(8, 5);
});
