import { expect, test } from "@playwright/test";
import { gotoEditor } from "./helpers.mjs";

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  await gotoEditor(page);
});

test("opens and closes the tools menu from the left burger button", async ({ page }) => {
  const toolMenu = page.locator("#tool-menu");
  const toggle = page.locator("#mobile-menu-toggle");

  await expect(toolMenu).not.toHaveClass(/open/);
  await toggle.click();
  await expect(toolMenu).toHaveClass(/open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");

  await page.locator('.tool-btn[data-mode="polygon"]').click();
  await expect(toolMenu).not.toHaveClass(/open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("opens and closes the actions menu from the right burger button", async ({ page }) => {
  const actionsMenu = page.locator("#actions-menu");
  const toggle = page.locator("#mobile-actions-toggle");

  await expect(actionsMenu).not.toHaveClass(/open/);

  await toggle.click();
  await expect(actionsMenu).toHaveClass(/open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#undo-btn")).toBeVisible();
  await expect(page.locator("#settings-btn")).toBeVisible();

  await page.locator("#zoom-in-btn").click();
  await expect(actionsMenu).not.toHaveClass(/open/);
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#zoom-reset-btn")).toHaveAttribute("title", /115%/);
});

test("opening one mobile menu closes the other", async ({ page }) => {
  const toolMenu = page.locator("#tool-menu");
  const actionsMenu = page.locator("#actions-menu");

  await page.locator("#mobile-menu-toggle").click();
  await expect(toolMenu).toHaveClass(/open/);

  await page.locator("#mobile-actions-toggle").click();
  await expect(actionsMenu).toHaveClass(/open/);
  await expect(toolMenu).not.toHaveClass(/open/);

  await page.locator("#mobile-menu-toggle").click();
  await expect(toolMenu).toHaveClass(/open/);
  await expect(actionsMenu).not.toHaveClass(/open/);
});
