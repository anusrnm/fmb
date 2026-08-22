import { expect, test } from "@playwright/test";
import { gotoEditor, clickGraph } from "./helpers.mjs";

async function createSession(page, name) {
  await page.getByTitle("New session").click();
  await page.locator("#numeric-input-field").fill(name);
  await page.locator("#numeric-input-form button[type='submit']").click();
  await expect(page.locator("#session-select")).toHaveValue(/.+/);
  await expect(page.getByRole("status")).toContainText(`Created session "${name}"`);
}

async function switchSession(page, name) {
  await page.locator("#session-select").selectOption({ label: name });
  await expect(page.getByRole("status")).toContainText(`Switched to session "${name}"`);
}

async function drawPoints(page, positions) {
  await page.getByLabel("Point tools").selectOption("point");
  for (const [x, y] of positions) {
    await clickGraph(page, x, y);
  }
  // Point mode renders a ghost circle under the cursor; leave it before counting.
  await page.getByLabel("Select tools").selectOption("select");
}

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
});

test("starts with a single default session that cannot be deleted", async ({ page }) => {
  await expect(page.locator("#session-select option")).toHaveCount(1);
  await expect(page.locator("#session-select option")).toHaveText(["Untitled diagram"]);
  await expect(page.getByTitle("The last session cannot be deleted")).toBeDisabled();
});

test("keeps each session's geometry separate when switching", async ({ page }) => {
  const initialPoints = await page.locator("#graph circle").count();

  await createSession(page, "Plot B");
  await expect(page.locator("#graph circle")).toHaveCount(0);

  await drawPoints(page, [[200, 200], [320, 260]]);
  await expect(page.locator("#graph circle")).toHaveCount(2);
  await switchSession(page, "Untitled diagram");
  await expect(page.locator("#graph circle")).toHaveCount(initialPoints);

  await switchSession(page, "Plot B");
  await expect(page.locator("#graph circle")).toHaveCount(2);
});

test("persists sessions and the active one across a reload", async ({ page }) => {
  await createSession(page, "Plot B");
  await drawPoints(page, [[240, 240]]);
  await expect(page.locator("#graph circle")).toHaveCount(1);

  await page.reload();
  await expect(page.locator("#session-select")).toHaveValue(
    await page.locator("#session-select option", { hasText: "Plot B" }).getAttribute("value")
  );
  await expect(page.locator("#session-select option")).toHaveText(["Untitled diagram", "Plot B"]);
  await expect(page.locator("#graph circle")).toHaveCount(1);
});

test("renaming a session drives the export filename", async ({ page }) => {
  await page.getByTitle("Rename session").click();
  await page.locator("#numeric-input-field").fill("Plot A rev 2");
  await page.locator("#numeric-input-form button[type='submit']").click();
  await expect(page.getByRole("status")).toContainText('Session renamed to "Plot A rev 2"');
  await expect(page.locator("#session-select option")).toHaveText(["Plot A rev 2"]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTitle("Export JSON").click(),
  ]);
  expect(download.suggestedFilename()).toBe("plot-a-rev-2.json");
});

test("de-duplicates session names", async ({ page }) => {
  await createSession(page, "Untitled diagram (2)");
  await page.getByTitle("New session").click();
  await page.locator("#numeric-input-field").fill("Untitled diagram");
  await page.locator("#numeric-input-form button[type='submit']").click();
  await expect(page.locator("#session-select option")).toHaveText([
    "Untitled diagram",
    "Untitled diagram (2)",
    "Untitled diagram (3)",
  ]);
});

test("deleting a session removes it and activates a neighbour", async ({ page }) => {
  await createSession(page, "Plot B");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Delete session").click();

  await expect(page.getByRole("status")).toContainText('Deleted session "Plot B"');
  await expect(page.locator("#session-select option")).toHaveText(["Untitled diagram"]);
  await expect(page.getByTitle("The last session cannot be deleted")).toBeDisabled();
});

test("keeps undo history per session for the page load", async ({ page }) => {
  const initialPoints = await page.locator("#graph circle").count();
  await drawPoints(page, [[200, 200]]);
  await expect(page.locator("#graph circle")).toHaveCount(initialPoints + 1);

  await createSession(page, "Plot B");
  await switchSession(page, "Untitled diagram");

  await page.locator("#undo-btn").click();
  await expect(page.locator("#graph circle")).toHaveCount(initialPoints);
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("switches sessions from the collapsible actions menu", async ({ page }) => {
    await page.locator("#mobile-actions-toggle").click();
    await expect(page.locator("#actions-menu")).toHaveClass(/open/);
    await expect(page.locator("#session-select")).toBeVisible();

    await createSession(page, "Plot B");
    await page.locator("#mobile-actions-toggle").click();
    await page.locator("#session-select").selectOption({ label: "Untitled diagram" });

    await expect(page.getByRole("status")).toContainText('Switched to session "Untitled diagram"');
    await expect(page.locator("#actions-menu")).toHaveClass(/open/);
  });
});
