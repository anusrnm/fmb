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

test("restores autosaved geometry edits after reload", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "A (-7.8, -4)" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("status")).toContainText("Recovered autosaved draft");
  await expect(page.locator("#graph text", { hasText: "A (-7.8, -4)" })).toBeVisible();
});
