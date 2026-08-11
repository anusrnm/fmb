import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

export async function gotoEditor(page) {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FMB Studio" })).toBeVisible();
}

export async function clickGraph(page, x, y) {
  await page.locator("#graph").click({ position: { x, y } });
}

export async function exportDiagram(page) {
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
