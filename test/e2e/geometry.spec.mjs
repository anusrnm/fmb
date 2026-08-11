import { expect, test } from "@playwright/test";
import { clickGraph, exportDiagram, gotoEditor } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
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
  await expect(page.locator("#graph text", { hasText: "A (-7.8, -4)" })).toBeVisible();
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
  await expect(page.locator("#graph text", { hasText: "A (-8, -4)" })).toBeVisible();

  await page.keyboard.press("l");
  await expect(page.getByRole("status")).toContainText("Unlocked 1 point");
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "A (-7.8, -4)" })).toBeVisible();
});

test("ctrl/cmd deselect does not drag a point", async ({ page, browserName }) => {
  const modifier = browserName === "webkit" ? "Meta" : "Control";
  const pointA = page.locator("#graph text", { hasText: "A (-8, -4)" });
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

  await expect(page.locator("#graph text", { hasText: "A (-8, -4)" })).toBeVisible();
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
  const pointA = await page.locator("#graph text", { hasText: "A (-8, -4)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const pointB = await page.locator("#graph text", { hasText: "B (6, -2)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const midpoint = {
    x: (pointA.x + pointB.x) * 0.5,
    y: (pointA.y + pointB.y) * 0.5,
  };

  await page.locator("#graph").hover({ position: midpoint });
  await page.keyboard.press("Shift+I");
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
  await expect(page.locator("#graph text", { hasText: "A (-7.8, -4)" })).toBeVisible();
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
  await expect(page.locator("#vertex-edit-hint")).toContainText("Shift+I");
  await expect(page.locator("#vertex-edit-hint")).toContainText("X");

  const pointA = await page.locator("#graph text", { hasText: "A (-8, -4)" }).evaluate((node) => {
    const x = Number(node.getAttribute("x"));
    const y = Number(node.getAttribute("y"));
    return { x: x - 8, y: y + 8 };
  });
  const pointB = await page.locator("#graph text", { hasText: "B (6, -2)" }).evaluate((node) => {
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
  await expect(page.getByRole("status")).toContainText("Removed vertex A");

  const data = await exportDiagram(page);
  expect(data.points).toHaveLength(6);
  const poly7 = data.polygons.find((polygon) => polygon.id === 7);
  const poly8 = data.polygons.find((polygon) => polygon.id === 8);
  expect(poly7?.pointIds).toHaveLength(3);
  expect(poly8?.pointIds).toContain(1);
});

test("Shift+I inserts a single polygon vertex when overlapping edges exist", async ({ page }) => {
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

  // Select polygon mode, then hover the shared B-C edge midpoint.
  await page.getByTitle("Polygon").click();
  await rightPolygon.click({ position: { x: rightPolygonBox.width * 0.5, y: rightPolygonBox.height * 0.5 } });
  await page.mouse.move(rightPolygonBox.x + 2, rightPolygonBox.y + rightPolygonBox.height * 0.5);
  await page.keyboard.press("Shift+I");
  await expect(page.getByRole("status")).toContainText("Polygon vertex inserted");

  const data = await exportDiagram(page);
  const poly7 = data.polygons.find((polygon) => polygon.id === 7);
  const poly8 = data.polygons.find((polygon) => polygon.id === 8);
  const lengths = [poly7?.pointIds.length, poly8?.pointIds.length].sort((a, b) => a - b);
  expect(lengths).toEqual([4, 5]);
});
