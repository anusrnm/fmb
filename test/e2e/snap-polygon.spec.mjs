import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function clickGraph(page, x, y) {
  await page.locator("#graph").click({ position: { x, y } });
}

async function exportDiagram(page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTitle("Export JSON").click(),
  ]);
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Expected exported JSON download path.");
  }
  const exported = JSON.parse(await readFile(filePath, "utf8"));
  return exported.data;
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FMB Studio" })).toBeVisible();
});

test("snaps a new point to grid when grid snap is enabled", async ({ page }) => {
  await page.getByTitle("Settings").click();
  await page.locator("#snap-toggle").uncheck();
  await page.locator("#snap-grid-toggle").check();

  await page.getByLabel("Point tools").selectOption("point");
  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }
  await page.mouse.click(graphBox.x + graphBox.width * 0.5 + 11, graphBox.y + graphBox.height * 0.5 + 17);

  const data = await exportDiagram(page);
  const newPoint = data.points[data.points.length - 1];
  expect(Math.abs(newPoint.x - Math.round(newPoint.x))).toBeLessThan(1e-9);
  expect(Math.abs(newPoint.y - Math.round(newPoint.y))).toBeLessThan(1e-9);
});

test("snaps to edge midpoint when midpoint snap is enabled", async ({ page }) => {
  await page.getByTitle("Settings").click();
  await page.locator("#snap-toggle").uncheck();
  await page.locator("#snap-midpoint-toggle").check();

  await page.getByLabel("Point tools").selectOption("point");
  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }

  // Demo diagonal A(-8,-4) -> C(9,7) has midpoint at (0.5, 1.5)
  const centerX = graphBox.x + graphBox.width * 0.5;
  const centerY = graphBox.y + graphBox.height * 0.5;
  const targetX = centerX + 0.5 * 32;
  const targetY = centerY - 1.5 * 32;
  await page.mouse.click(targetX, targetY);

  const data = await exportDiagram(page);
  const newPoint = data.points[data.points.length - 1];
  expect(newPoint.x).toBeCloseTo(0.5, 2);
  expect(newPoint.y).toBeCloseTo(1.5, 2);
});

test("closes polygon from two vertices with Ctrl click and includes final click vertex", async ({ page }) => {
  await page.getByTitle("Polygon").click();
  await clickGraph(page, 120, 470);
  await clickGraph(page, 230, 470);
  await page.keyboard.down("Control");
  await clickGraph(page, 175, 380);
  await page.keyboard.up("Control");

  await expect(page.getByRole("status")).toContainText("Polygon closed");
  await expect(page.locator("#graph polygon")).toHaveCount(2);

  const data = await exportDiagram(page);
  const createdPolygon = data.polygons[data.polygons.length - 1];
  expect(createdPolygon.pointIds.length).toBe(3);
});

test("drags an existing shape directly in polygon mode", async ({ page }) => {
  await expect(page.locator("#graph text", { hasText: "P1 (-8, -4)" })).toBeVisible();
  await page.getByTitle("Polygon").click();

  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }

  // Click within polygon body away from labels/points so polygon drag path is used.
  const startX = graphBox.x + graphBox.width * 0.5 + 12;
  const startY = graphBox.y + graphBox.height * 0.5 + 6;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 20);
  await page.mouse.up();

  await expect(page.getByRole("status")).toContainText("Dragging shape");
  await expect(page.locator("#graph text", { hasText: "P1 (-8, -4)" })).toHaveCount(0);
});

test("drags an existing shape directly in select mode", async ({ page }) => {
  await expect(page.locator("#graph text", { hasText: "P1 (-8, -4)" })).toBeVisible();
  await page.getByLabel("Select tools").selectOption("select");

  const graphBox = await page.locator("#graph").boundingBox();
  if (!graphBox) {
    throw new Error("Expected graph bounds.");
  }

  // Click within polygon body away from labels/points so polygon drag path is used.
  const startX = graphBox.x + graphBox.width * 0.5 + 12;
  const startY = graphBox.y + graphBox.height * 0.5 + 6;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 40, startY + 20);
  await page.mouse.up();

  await expect(page.getByRole("status")).toContainText("Dragging shape");
  await expect(page.locator("#graph text", { hasText: "P1 (-8, -4)" })).toHaveCount(0);
});
