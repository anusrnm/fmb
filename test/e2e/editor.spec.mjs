import { expect, test } from "@playwright/test";
import { gotoEditor } from "./helpers.mjs";

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
});

test("loads the demo drawing", async ({ page }) => {
  await expect(page.locator("#graph circle")).toHaveCount(4);
  await expect(page.locator("#graph polygon")).toHaveCount(1);
});

test("opens command help from keyboard", async ({ page }) => {
  await page.keyboard.press("?");
  await expect(page.getByRole("heading", { name: "Keyboard commands" })).toBeVisible();
});
