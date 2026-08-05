import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "FMB Studio" })).toBeVisible();
});

test("coalesces burst renders and reuses cached grid layer", async ({ page }) => {
  const result = await page.evaluate(async () => {
    if (!globalThis.__fmbPerf) {
      throw new Error("Performance counters are not available on globalThis.__fmbPerf");
    }

    const waitForFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

    globalThis.__fmbPerf.reset();

    // Burst many resize events in one task: render scheduler should coalesce.
    for (let index = 0; index < 60; index += 1) {
      globalThis.dispatchEvent(new Event("resize"));
    }

    await waitForFrame();
    await waitForFrame();
    const afterBurst = globalThis.__fmbPerf.get();

    // Trigger frame-by-frame renders with unchanged grid inputs.
    for (let index = 0; index < 6; index += 1) {
      globalThis.dispatchEvent(new Event("resize"));
      await waitForFrame();
    }

    const finalCounters = globalThis.__fmbPerf.get();

    return { afterBurst, finalCounters };
  });

  expect(result.afterBurst.renderNowCalls).toBeLessThanOrEqual(2);
  expect(result.afterBurst.gridCacheMisses).toBeLessThanOrEqual(1);
  expect(result.finalCounters.gridCacheHits).toBeGreaterThanOrEqual(5);
  expect(result.finalCounters.renderNowCalls).toBeGreaterThanOrEqual(6);
});
