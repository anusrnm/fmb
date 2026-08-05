import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function clickGraph(page, x, y) {
  await page.locator("#graph").click({ position: { x, y } });
}

async function clickLocatorCenter(page, locator) {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error("Expected an interactive SVG label.");
  }
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FMB Studio" })).toBeVisible();
});

test("loads the demo drawing and toggles persistent display settings", async ({ page }) => {
  await expect(page.locator("#graph circle")).toHaveCount(4);
  await expect(page.locator("#graph polygon")).toHaveCount(1);

  await page.getByTitle("Settings").click();
  const pointsToggle = page.locator("#show-points-toggle");
  await pointsToggle.uncheck();
  await expect(page.locator("#graph circle")).toHaveCount(0);
  await pointsToggle.check();
  await expect(page.locator("#graph circle")).toHaveCount(4);
});

test("draws a polygon from the coordinate dialog and supports undo and redo", async ({ page }) => {
  await page.locator("#graph").click({ button: "right", position: { x: 760, y: 500 } });
  await page.getByRole("button", { name: "Coordinates" }).click();
  await page.locator("#points-output").fill("A, 0, 0\nB, 5, 0\nC, 4, 3\nD, 1, 4");
  await page.getByRole("button", { name: "Draw Shape" }).click();

  await expect(page.getByRole("status")).toContainText("Shape created from 4 coordinates");
  await expect(page.locator("#graph polygon")).toHaveCount(2);
  await expect(page.locator("#undo-btn")).toHaveAttribute("title", /Undo Create shape from coordinates/);
  await page.locator("#undo-btn").click();
  await expect(page.locator("#graph polygon")).toHaveCount(1);
  await expect(page.locator("#redo-btn")).toHaveAttribute("title", /Redo Create shape from coordinates/);
  await page.locator("#redo-btn").click();
  await expect(page.locator("#graph polygon")).toHaveCount(2);
});

test("opens command help from the keyboard", async ({ page }) => {
  await page.keyboard.press("?");
  await expect(page.getByRole("heading", { name: "Keyboard commands" })).toBeVisible();
  await expect(page.locator("#help-dialog")).toContainText("Fit drawing / selection");
});

test("validates and previews coordinates in a non-modal inspector", async ({ page }) => {
  await page.keyboard.press("c");
  await expect(page.locator("#points-dialog")).toBeVisible();
  await page.locator("#points-output").fill("A, 0, 0\ninvalid");
  await expect(page.locator("#coordinate-validation")).toHaveAttribute("data-tone", "error");
  await expect(page.locator("#draw-points-btn")).toBeDisabled();

  await page.locator("#points-output").fill("A, 0, 0\nB, 5, 0\nC, 2, 4");
  await expect(page.locator("#coordinate-validation")).toContainText("3 coordinates ready");
  await expect(page.locator("#coordinate-preview polygon")).toHaveCount(1);
  await clickGraph(page, 760, 500);
  await expect(page.locator("#points-dialog")).toBeVisible();
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

test("zooms and resets the viewport", async ({ page }) => {
  const zoomButton = page.locator("#zoom-reset-btn");
  await expect(zoomButton).toHaveAttribute("title", /100%/);
  await page.getByTitle("Zoom in").click();
  await expect(zoomButton).toHaveAttribute("title", /115%/);
  await zoomButton.click();
  await expect(zoomButton).toHaveAttribute("title", /100%/);
});

test("fits the drawing and current selection", async ({ page }) => {
  await page.getByLabel("Fit drawing").click();
  await expect(page.getByRole("status")).toContainText("Fitted drawing to viewport");

  await clickGraph(page, 373, 434);
  await page.getByLabel("Fit selection").click();
  await expect(page.getByRole("status")).toContainText("Fitted selection to viewport");
});

test("previews the pointer target before selection", async ({ page }) => {
  const point = page.locator("#graph circle").first();
  const box = await point.boundingBox();
  if (!box) {
    throw new Error("Expected a point to hover.");
  }
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await expect(page.locator("#graph circle").first()).toHaveAttribute("fill", "#0891b2");
});

test("resets persisted display settings", async ({ page }) => {
  await page.getByTitle("Settings").click();
  await page.locator("#show-points-toggle").uncheck();
  await expect(page.locator("#graph circle")).toHaveCount(0);
  await page.locator("#reset-settings-btn").click();
  await expect(page.locator("#show-points-toggle")).toBeChecked();
  await expect(page.locator("#graph circle")).toHaveCount(4);
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
  await page.getByTitle("Angle").click();
  const angleLabel = page.locator("#graph text").filter({ hasText: /deg$/ }).first();
  await clickLocatorCenter(page, angleLabel);
  await expect(page.getByRole("status")).toContainText("Angle annotation saved");

  await clickLocatorCenter(page, page.locator("#graph text").filter({ hasText: /deg$/ }).first());
  await expect(page.getByRole("status")).toContainText("Angle annotation removed");
});

test("persists the selected theme after reload", async ({ page }) => {
  await page.locator("#theme-toggle-btn").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("imports a JSON diagram and exports JSON and SVG snapshots", async ({ page }) => {
  const diagram = {
    data: {
      nextId: 5,
      scale: 32,
      panX: 0,
      panY: 0,
      points: [
        { id: 1, x: 0, y: 0, label: "A" },
        { id: 2, x: 4, y: 0, label: "B" },
        { id: 3, x: 2, y: 3, label: "C" },
      ],
      segments: [],
      polygons: [{ id: 4, pointIds: [1, 2, 3], labelOffset: { x: 0, y: 0 } }],
      texts: [],
      angleAnnotations: [],
    },
  };

  await page.locator("#import-file").setInputFiles({
    name: "diagram.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(diagram)),
  });
  await expect(page.getByRole("status")).toContainText("JSON import complete");
  await expect(page.locator("#graph circle")).toHaveCount(3);

  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTitle("Export JSON").click(),
  ]);
  await expect(jsonDownload.suggestedFilename()).toBe("fmb-studio-diagram.json");

  const [svgDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTitle("Export SVG").click(),
  ]);
  await expect(svgDownload.suggestedFilename()).toBe("fmb-studio-diagram.svg");
});

test("rejects invalid JSON coordinates without replacing the current diagram", async ({ page }) => {
  await page.locator("#import-file").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ data: { points: [{ id: 1, x: "invalid", y: 0 }] } })),
  });

  await expect(page.getByRole("status")).toContainText("Import failed: Invalid point x coordinate");
  await expect(page.locator("#graph circle")).toHaveCount(4);
});

test("repairs stale imported next IDs before creating new objects", async ({ page }) => {
  await page.locator("#import-file").setInputFiles({
    name: "stale-next-id.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      data: {
        nextId: 1,
        scale: 32,
        panX: 0,
        panY: 0,
        points: [
          { id: 1, x: 0, y: 0, label: "A" },
          { id: 2, x: 4, y: 0, label: "B" },
          { id: 3, x: 2, y: 3, label: "C" },
        ],
        segments: [],
        polygons: [{ id: 4, pointIds: [1, 2, 3], labelOffset: { x: 0, y: 0 } }],
        texts: [],
        angleAnnotations: [],
      },
    })),
  });
  await page.getByTitle("Point").click();
  await clickGraph(page, 650, 450);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTitle("Export JSON").click(),
  ]);
  const filePath = await download.path();
  if (!filePath) {
    throw new Error("Expected exported JSON download path.");
  }
  const exported = JSON.parse(await readFile(filePath, "utf8"));
  const ids = [
    ...exported.data.points,
    ...exported.data.segments,
    ...exported.data.polygons,
    ...exported.data.texts,
    ...exported.data.angleAnnotations,
  ].map((item) => item.id);

  expect(new Set(ids).size).toBe(ids.length);
  expect(exported.data.nextId).toBeGreaterThan(Math.max(...ids));
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