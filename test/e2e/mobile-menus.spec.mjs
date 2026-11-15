import { expect, test } from "@playwright/test";
import { exportDiagram, gotoEditor } from "./helpers.mjs";

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

test("mobile shape details stay below toolbar and clear of bottom controls", async ({ page }) => {
  await page.locator("#import-file").setInputFiles({
    name: "mobile-details.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ data: {
      nextId: 5, scale: 32, panX: 0, panY: 0,
      points: [{ id: 1, x: -2, y: -2 }, { id: 2, x: 2, y: -2 },
        { id: 3, x: 2, y: 2 }, { id: 4, x: -2, y: 2 }],
      polygons: [{ id: 5, pointIds: [1, 2, 3, 4] }],
      segments: [], texts: [], angleAnnotations: [], constraints: [],
    } })),
  });
  await expect(page.getByRole("status")).toContainText("JSON import complete");
  const graph = await page.locator("#graph").boundingBox();
  await page.locator("#graph").click({ position: { x: graph.width / 2, y: graph.height / 2 } });
  await expect(page.locator("#shape-details")).toBeVisible();
  const panel = await page.locator("#shape-details").boundingBox();
  const toolbar = await page.locator(".topbar").boundingBox();
  const controls = await page.locator(".zoom-controls").boundingBox();
  const status = await page.locator("#status").boundingBox();
  expect(panel.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
  expect(panel.x + panel.width).toBeLessThan(controls.x);
  expect(panel.y + panel.height).toBeLessThan(status.y);
  expect(panel.x).toBeGreaterThanOrEqual(graph.x);
});

test("mobile session title uses the full menu width above its buttons", async ({ page }) => {
  await page.locator("#mobile-actions-toggle").click();
  const title = await page.locator("#session-select").boundingBox();
  const controls = await page.locator(".session-control").boundingBox();
  expect(title.width).toBeGreaterThan(250);
  expect(title.width).toBeCloseTo(controls.width, 0);
  for (const id of ["session-new-btn", "session-rename-btn", "session-delete-btn"]) {
    const button = await page.locator(`#${id}`).boundingBox();
    expect(button.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(button.x).toBeGreaterThanOrEqual(controls.x);
    expect(button.x + button.width).toBeLessThanOrEqual(controls.x + controls.width + 1);
  }
});

test("mobile status and vertex hint stack without overlapping controls", async ({ page }) => {
  await page.locator("#graph").click({ button: "right", position: { x: 180, y: 300 } });
  await page.getByRole("button", { name: "Coordinates", exact: true }).click();
  await page.locator("#points-output").fill("0, 0\n3, 0\n3, 3\n0, 3");
  await page.locator("#draw-points-btn").click();
  await expect(page.locator("#vertex-edit-hint")).toBeVisible();
  const hint = await page.locator("#vertex-edit-hint").boundingBox();
  const status = await page.locator("#status").boundingBox();
  const controls = await page.locator(".zoom-controls").boundingBox();
  expect(hint.y + hint.height).toBeLessThanOrEqual(status.y);
  expect(hint.x + hint.width).toBeLessThan(controls.x);
  expect(status.x + status.width).toBeLessThan(controls.x);
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

test("touch multi-select toggles individual points and deletes only the selection", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 320, height: 844 }, hasTouch: true, baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  try {
    await gotoEditor(page);
    await page.locator("#import-file").setInputFiles({
      name: "multi-points.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ data: {
        nextId: 4, scale: 32, panX: 0, panY: 0,
        points: [{ id: 1, x: -3, y: 0 }, { id: 2, x: 0, y: 0 }, { id: 3, x: 3, y: 0 }],
        segments: [], polygons: [], texts: [], angleAnnotations: [], constraints: [],
      } })),
    });
    await expect(page.getByRole("status")).toContainText("JSON import complete");
    await expect(page.locator("#multi-select-btn")).toHaveCount(0);
    await page.locator("#mobile-menu-toggle").tap();
    const selectTools = page.getByLabel("Select tools");
    await selectTools.selectOption("multi-select");
    await expect(selectTools).toHaveValue("multi-select");
    await expect(page.locator("#tool-menu")).not.toHaveClass(/open/);
    const graph = await page.locator("#graph").boundingBox();
    const x = graph.x + graph.width / 2;
    const y = graph.y + graph.height / 2;
    await page.touchscreen.tap(x - 96, y);
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x + 96, y);
    await expect(page.getByRole("status")).toContainText("3 point(s)");
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 24, y + 24);
    await page.mouse.up();
    await expect(page.getByRole("status")).toContainText("2 point(s)");
    await page.touchscreen.tap(x, y - 100);
    await page.locator("#mobile-actions-toggle").tap();
    await page.getByRole("button", { name: "Delete selection" }).tap();
    await page.locator("#mobile-actions-toggle").tap();
    expect((await exportDiagram(page)).points).toEqual([{ id: 2, x: 0, y: 0 }]);
    await page.locator("#mobile-actions-toggle").tap();
    await page.locator("#undo-btn").tap();
    await page.locator("#mobile-actions-toggle").tap();
    expect((await exportDiagram(page)).points.map((point) => point.id)).toEqual([1, 2, 3]);
    await page.locator("#mobile-menu-toggle").tap();
    await selectTools.selectOption("select");
    await expect(selectTools).toHaveValue("select");
    await page.touchscreen.tap(x, y);
    await expect(page.getByRole("status")).toContainText("1 point(s)");
  } finally {
    await context.close();
  }
});

test("touch multi-select supports different object types and resets on tool changes", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  try {
    await gotoEditor(page);
    await page.locator("#import-file").setInputFiles({
      name: "multi-objects.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ data: {
        nextId: 9, scale: 32, panX: 0, panY: 0,
        points: [{ id: 1, x: -2, y: -2 }, { id: 2, x: 2, y: -2 }, { id: 3, x: 0, y: 2 },
          { id: 4, x: -5, y: -3 }, { id: 5, x: -3, y: -3 }],
        segments: [{ id: 6, a: 4, b: 5 }],
        polygons: [{ id: 7, pointIds: [1, 2, 3] }],
        texts: [{ id: 8, x: 4, y: 3, content: "Note", size: 16 }],
        angleAnnotations: [], constraints: [],
      } })),
    });
    await expect(page.getByRole("status")).toContainText("JSON import complete");
    await page.locator("#mobile-menu-toggle").tap();
    const selectTools = page.getByLabel("Select tools");
    await selectTools.selectOption("multi-select");
    await expect(page.locator("#graph")).toHaveClass(/mode-multi-select/);
    const graph = await page.locator("#graph").boundingBox();
    const x = graph.x + graph.width / 2;
    const y = graph.y + graph.height / 2;
    await page.touchscreen.tap(x, y);
    await page.touchscreen.tap(x - 128, y + 96);
    await page.touchscreen.tap(x + 128, y - 100);
    await expect(page.getByRole("status")).toContainText("1 segment(s), 1 polygon(s), 1 text item(s)");
    await page.locator("#mobile-menu-toggle").tap();
    await page.getByLabel("Point tools").selectOption("point");
    await expect(page.locator("#graph")).toHaveClass(/mode-point/);
    await page.locator("#mobile-menu-toggle").tap();
    await expect(page.locator("#tool-menu")).toHaveClass(/open/);
    await selectTools.selectOption("multi-select");
    await expect(page.locator("#graph")).toHaveClass(/mode-multi-select/);
    await expect(page.locator("#tool-menu")).not.toHaveClass(/open/);
    await page.touchscreen.tap(x - 64, y + 64);
    await expect(page.getByRole("status")).toContainText("1 point(s), 1 segment(s), 1 polygon(s), 1 text item(s)");
  } finally {
    await context.close();
  }
});

test("box selection can be deleted and restored using touch actions", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  try {
    await gotoEditor(page);
    await page.locator("#import-file").setInputFiles({
      name: "touch-delete.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ data: {
        nextId: 4, scale: 32, panX: 0, panY: 0,
        points: [{ id: 1, x: -3, y: 0 }, { id: 2, x: -1, y: 0 }, { id: 3, x: 4, y: 0 }],
        segments: [], polygons: [], texts: [], angleAnnotations: [], constraints: [],
      } })),
    });
    await expect(page.getByRole("status")).toContainText("JSON import complete");
    await page.locator("#mobile-actions-toggle").tap();
    await expect(page.getByRole("button", { name: "Delete selection" })).toBeDisabled();
    await page.locator("#mobile-menu-toggle").tap();
    await page.getByLabel("Select tools").selectOption("box-select");
    await expect(page.locator("#actions-menu")).not.toHaveClass(/open/);

    const graph = await page.locator("#graph").boundingBox();
    const centerX = graph.x + graph.width / 2;
    const centerY = graph.y + graph.height / 2;
    await page.mouse.move(centerX - 110, centerY - 15);
    await page.mouse.down();
    await page.mouse.move(centerX - 20, centerY + 15);
    await page.mouse.up();
    await expect(page.getByRole("status")).toContainText("2 point(s)");
    await expect(page.locator("#actions-menu")).not.toHaveClass(/open/);

    await page.locator("#mobile-actions-toggle").tap();
    await expect(page.locator("#actions-menu")).toHaveClass(/open/);
    await expect(page.getByRole("button", { name: "Delete selection" })).toBeEnabled();
    await page.getByRole("button", { name: "Delete selection" }).tap();
    await expect(page.getByRole("status")).toContainText("Selection deleted");
    await page.locator("#mobile-actions-toggle").tap();
    await expect(page.getByRole("button", { name: "Delete selection" })).toBeDisabled();
    expect((await exportDiagram(page)).points.map((point) => point.id)).toEqual([3]);

    await page.locator("#mobile-actions-toggle").tap();
    await page.locator("#undo-btn").tap();
    await page.locator("#mobile-actions-toggle").tap();
    expect((await exportDiagram(page)).points.map((point) => point.id)).toEqual([1, 2, 3]);
    await page.locator("#mobile-actions-toggle").tap();
    await page.locator("#redo-btn").tap();
    await page.locator("#mobile-actions-toggle").tap();
    expect((await exportDiagram(page)).points.map((point) => point.id)).toEqual([3]);
  } finally {
    await context.close();
  }
});

test("touch selection can delete a polygon without deleting a shared vertex", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  try {
    await gotoEditor(page);
    await page.locator("#import-file").setInputFiles({
      name: "touch-delete-shape.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ data: {
        nextId: 7, scale: 32, panX: 0, panY: 0,
        points: [{ id: 1, x: -2, y: -2 }, { id: 2, x: 2, y: -2 },
          { id: 3, x: 0, y: 2 }, { id: 4, x: -4, y: -2 }],
        segments: [{ id: 5, a: 1, b: 4 }],
        polygons: [{ id: 6, pointIds: [1, 2, 3] }],
        texts: [], angleAnnotations: [], constraints: [],
      } })),
    });
    await expect(page.getByRole("status")).toContainText("JSON import complete");
    const graph = await page.locator("#graph").boundingBox();
    await page.touchscreen.tap(graph.x + graph.width / 2, graph.y + graph.height / 2);
    await expect(page.locator("#shape-details")).toBeVisible();
    await page.locator("#mobile-actions-toggle").tap();
    await page.getByRole("button", { name: "Delete selection" }).tap();
    await expect(page.getByRole("status")).toContainText("Selection deleted");
    await page.locator("#mobile-actions-toggle").tap();
    const data = await exportDiagram(page);
    expect(data.polygons).toHaveLength(0);
    expect(data.points.map((point) => point.id)).toEqual([1, 4]);
    expect(data.segments.map((segment) => segment.id)).toEqual([5]);
  } finally {
    await context.close();
  }
});

test("touch rotation selects a pivot and fine steps without shortcuts", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, baseURL: "http://127.0.0.1:4173",
  });
  const page = await context.newPage();
  try {
    await gotoEditor(page);
    await page.locator("#import-file").setInputFiles({
      name: "touch-rotation.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ data: {
        nextId: 5, scale: 32, panX: 0, panY: 0,
        points: [{ id: 1, x: -2, y: -2 }, { id: 2, x: 2, y: -2 },
          { id: 3, x: 0, y: 2 }],
        polygons: [{ id: 4, pointIds: [1, 2, 3] }],
        segments: [], texts: [], angleAnnotations: [], constraints: [],
      } })),
    });
    await expect(page.getByRole("status")).toContainText("JSON import complete");
    await page.locator("#mobile-actions-toggle").tap();
    await page.getByTitle("Settings").tap();
    await page.getByLabel("Point labels", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Close", exact: true }).tap();
    const box = await page.locator("#graph").boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByRole("button", { name: "Choose rotation pivot" }).tap();
    await expect(page.locator("#choose-rotation-pivot-btn")).toHaveAttribute("aria-pressed", "true");
    await page.touchscreen.tap(box.x + box.width / 2 - 64, box.y + box.height / 2 + 64);
    await expect(page.getByRole("status")).toContainText("Rotation pivot selected");
    await expect(page.locator("#choose-rotation-pivot-btn")).toHaveAttribute("aria-pressed", "false");
    for (const step of ["0.1", "0.01"]) {
      await page.getByLabel("Rotation step", { exact: true }).selectOption(step);
      await page.getByRole("button", { name: "Rotate around selected point", exact: true }).tap();
      await expect(page.getByRole("status")).toContainText(`rotated ${step}deg`);
      await page.locator("#mobile-actions-toggle").tap();
      const data = await exportDiagram(page);
      const pivot = data.points.find((point) => point.id === 1);
      expect(pivot).toMatchObject({ x: -2, y: -2 });
      const point = data.points.find((point) => point.id === 2);
      const angle = (step === "0.1" ? 0.1 : 0.11) * Math.PI / 180;
      expect(point.x).toBeCloseTo(-2 + 4 * Math.cos(angle), 9);
      expect(point.y).toBeCloseTo(-2 + 4 * Math.sin(angle), 9);
    }
    await page.getByRole("button", { name: "Rotate clockwise around selected point" }).tap();
    await expect(page.getByRole("status")).toContainText("rotated -0.01deg");
    await page.getByRole("button", { name: "Choose rotation pivot" }).tap();
    await page.getByRole("button", { name: "Choose rotation pivot" }).tap();
    await expect(page.getByRole("status")).toContainText("canceled");
  } finally {
    await context.close();
  }
});
