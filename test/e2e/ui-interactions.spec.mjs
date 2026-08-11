import { expect, test } from "@playwright/test";
import { clickGraph, gotoEditor } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
});

test("toggles persistent display settings", async ({ page }) => {
  await expect(page.locator("#graph circle")).toHaveCount(4);
  await page.getByTitle("Settings").click();
  const pointsToggle = page.locator("#show-points-toggle");
  await pointsToggle.uncheck();
  await expect(page.locator("#graph circle")).toHaveCount(0);
  await pointsToggle.check();
  await expect(page.locator("#graph circle")).toHaveCount(4);
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

test("persists the selected theme after reload", async ({ page }) => {
  await page.locator("#theme-toggle-btn").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});
