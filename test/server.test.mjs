import assert from "node:assert/strict";
import test from "node:test";
import { handler } from "../main.js";

test("handler serves the index page and static assets", async () => {
  const page = await handler(new Request("http://localhost/"));
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.match(await page.text(), /FMB Studio/);

  const stylesheet = await handler(new Request("http://localhost/styles.css"));
  assert.equal(stylesheet.status, 200);
  assert.match(stylesheet.headers.get("content-type"), /text\/css/);
});

test("handler returns 404 for missing and out-of-root files", async () => {
  for (const pathname of ["/non-existent-file.txt", "/%2e%2e%2fREADME.md"]) {
    const response = await handler(new Request(`http://localhost${pathname}`));
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "Not Found");
  }
});
