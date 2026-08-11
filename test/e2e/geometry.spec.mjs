import { expect, test } from "@playwright/test";
import { clickGraph, gotoEditor } from "./helpers.mjs";

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
  await expect(page.locator("#graph circle")).toHaveCount(5);

  await page.keyboard.press("x");
  await expect(page.getByRole("status")).toContainText("Removed vertex");
  await expect(page.locator("#graph circle")).toHaveCount(4);
});

test("manages point locks from the constraints panel", async ({ page }) => {
  await clickGraph(page, 373, 434);
  await page.getByTitle("Settings").click();

  await page.locator("#lock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Locked 1 point");
  await expect(page.locator("#constraints-list li")).toHaveCount(1);
  await expect(page.locator("#constraints-list")).toContainText("Lock A (-8, -4)");

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("status")).toContainText("Selected points are locked");

  await page.locator("#constraints-list .constraints-remove-btn").click();
  await expect(page.getByRole("status")).toContainText("Unlocked A");
  await expect(page.locator("#constraints-list")).toContainText("No active constraints");

  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#graph text", { hasText: "A (-7.8, -4)" })).toBeVisible();
});

test("clears and unlocks constraints via panel actions", async ({ page }) => {
  await clickGraph(page, 373, 434);

  await page.getByTitle("Settings").click();
  await page.locator("#lock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Locked 1 point");
  await expect(page.locator("#constraints-list .constraints-remove-btn")).toHaveCount(1);

  await page.locator("#unlock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Unlocked 1 point");
  await expect(page.locator("#constraints-list")).toContainText("No active constraints");

  await page.locator("#lock-selected-btn").click();
  await expect(page.getByRole("status")).toContainText("Locked 1 point");
  await page.locator("#clear-constraints-btn").click();
  await expect(page.getByRole("status")).toContainText("Cleared 1 constraint");
  await expect(page.locator("#constraints-list")).toContainText("No active constraints");
  await expect(page.locator("#clear-constraints-btn")).toBeDisabled();
});
