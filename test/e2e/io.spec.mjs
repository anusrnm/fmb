import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { clickGraph, gotoEditor } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
});

test("draws a polygon from the coordinate dialog and supports undo and redo", async ({ page }) => {
  await page.locator("#graph").click({ button: "right", position: { x: 760, y: 500 } });
  await page.getByRole("button", { name: "Coordinates" }).click();
  await page.locator("#points-output").fill("A, 0, 0\nB, 5, 0\nC, 4, 3\nD, 1, 4");
  await page.getByRole("button", { name: "Update" }).click();

  await expect(page.getByRole("status")).toContainText("Shape created from 4 coordinates");
  await expect(page.locator("#graph polygon")).toHaveCount(2);
  await expect(page.locator("#undo-btn")).toHaveAttribute("title", /Undo Create shape from coordinates/);
  await page.locator("#undo-btn").click();
  await expect(page.locator("#graph polygon")).toHaveCount(1);
  await expect(page.locator("#redo-btn")).toHaveAttribute("title", /Redo Create shape from coordinates/);
  await page.locator("#redo-btn").click();
  await expect(page.locator("#graph polygon")).toHaveCount(2);
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

test("changes a segment line style from the Coordinates menu", async ({ page }) => {
  const segment = page.locator("#graph .segment-line").first();
  const box = await segment.boundingBox();
  if (!box) {
    throw new Error("Expected a rendered segment.");
  }

  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: "right" });
  await page.getByRole("button", { name: "Coordinates" }).click();
  await expect(page.locator("#line-style-control")).toBeVisible();
  await page.locator("#line-style-select").selectOption("dotted");

  await expect(segment).toHaveAttribute("stroke-dasharray", "2 6");
  await expect(page.locator("#status")).toContainText("Line style changed to dotted");

  await page.locator("#undo-btn").click();
  await expect(segment).toHaveAttribute("stroke-dasharray", "6 4");
});

test("shows polygon coordinates using vertex order with matching point indices", async ({ page }) => {
  await page.locator("#graph").dblclick({ position: { x: 597, y: 402 } });
  await clickGraph(page, 650, 360);

  await page.keyboard.press("c");
  await expect(page.locator("#points-dialog")).toBeVisible();

  const content = await page.locator("#points-output").inputValue();
  expect(content).toMatch(/^P1, .*\nP5, .*\nP2, .*\nP3, .*\nP4, .*$/);
});

test("applies coordinate edits with Enter key", async ({ page }) => {
  await page.keyboard.press("c");
  await expect(page.locator("#points-dialog")).toBeVisible();

  await page.locator("#points-output").fill("0, 0\n5, 0\n4, 3\n1, 4");
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toContainText("Shape created from 4 coordinates");
  await expect(page.locator("#points-dialog")).toBeHidden();
});

test("opens coordinate editor with Enter for selected polygon", async ({ page }) => {
  await clickGraph(page, 700, 360);
  await page.keyboard.press("Enter");

  await expect(page.locator("#points-dialog")).toBeVisible();
  await expect(page.locator("#points-output")).toHaveValue(/P\d, /);
});

test("opens inline text editor with Enter for selected text", async ({ page }) => {
  await page.locator("#graph text", { hasText: "Title Goes Here" }).click();
  await page.keyboard.press("Enter");

  await expect(page.locator("#inline-text-editor")).toBeVisible();
  await expect(page.locator("#inline-text-editor")).toHaveValue("Title Goes Here");
});

test("creates text in text mode when pressing Enter", async ({ page }) => {
  await page.getByTitle("Text").click();
  await clickGraph(page, 760, 420);
  await expect(page.locator("#inline-text-editor")).toBeVisible();

  await page.locator("#inline-text-editor").fill("Parcel Note");
  await page.keyboard.press("Enter");

  await expect(page.locator("#inline-text-editor")).toBeHidden();
  await expect(page.locator("#graph text", { hasText: "Parcel Note" })).toBeVisible();
});

test("creates text from typed keyboard input and Enter", async ({ page }) => {
  await page.getByTitle("Text").click();
  await clickGraph(page, 760, 420);
  await expect(page.locator("#inline-text-editor")).toBeFocused();

  await page.keyboard.type("Typed via keyboard");
  await page.keyboard.press("Enter");

  await expect(page.locator("#inline-text-editor")).toBeHidden();
  await expect(page.locator("#graph text", { hasText: "Typed via keyboard" })).toBeVisible();
});

test("makes newly added text visible when text display was off", async ({ page }) => {
  await page.getByTitle("Settings").click();
  await page.locator("#show-text-toggle").uncheck();
  await expect(page.locator("#graph text", { hasText: "Title Goes Here" })).toHaveCount(0);

  await page.getByTitle("Text").click();
  await clickGraph(page, 760, 420);
  await page.keyboard.type("Visible Note");
  await page.keyboard.press("Enter");

  await expect(page.locator("#graph text", { hasText: "Visible Note" })).toBeVisible();
  await expect(page.locator("#show-text-toggle")).toBeChecked();
});

test("creates text in select mode with Enter when nothing is selected", async ({ page }) => {
  await page.keyboard.press("Escape");
  await page.keyboard.press("Enter");
  await expect(page.locator("#inline-text-editor")).toBeVisible();

  await page.locator("#inline-text-editor").fill("Center Note");
  await page.keyboard.press("Enter");

  await expect(page.locator("#inline-text-editor")).toBeHidden();
  await expect(page.locator("#graph text", { hasText: "Center Note" })).toBeVisible();
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

test("reuses the most recent point id after deleting that point", async ({ page }) => {
  const exportState = async () => {
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
  };

  const initial = await exportState();
  const initialPointIds = initial.points.map((point) => point.id);
  const initialMaxPointId = Math.max(...initialPointIds);

  await page.getByLabel("Point tools").selectOption("point");
  const initialPointCount = initial.points.length;
  await clickGraph(page, 980, 220);

  const afterFirstCreate = await exportState();
  expect(afterFirstCreate.points.length).toBe(initialPointCount + 1);
  const createdPointId = Math.max(...afterFirstCreate.points.map((point) => point.id));
  expect(createdPointId).toBeGreaterThan(initialMaxPointId);

  await clickGraph(page, 980, 220);
  await page.keyboard.press("Delete");
  await expect(page.getByRole("status")).toContainText("Selection deleted");

  await clickGraph(page, 1020, 220);
  const afterSecondCreate = await exportState();
  expect(afterSecondCreate.points.length).toBe(initialPointCount + 1);
  const recreatedPointId = Math.max(...afterSecondCreate.points.map((point) => point.id));
  expect(recreatedPointId).toBe(createdPointId);
});

test("restores autosaved geometry edits after reload", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "P1 (-7.8, -4)" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("status")).toContainText("Recovered autosaved draft");
  await expect(page.locator("#graph text", { hasText: "P1 (-7.8, -4)" })).toBeVisible();
});

test("restores active constraints from autosave after reload", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.keyboard.press("l");
  await expect(page.getByRole("status")).toContainText("Locked 1 point");

  await page.reload();
  await expect(page.getByRole("status")).toContainText("Recovered autosaved draft");

  await clickGraph(page, 373, 434);
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("Selected points are locked");

  await page.getByTitle("Settings").click();
  await expect(page.locator("#constraints-summary")).toContainText("1 lock constraint");
});
