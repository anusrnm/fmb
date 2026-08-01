import { assertEquals } from "@std/assert";
import { handler } from "./main.ts";

Deno.test("handler returns 404 for non-existent file", async () => {
  const request = new Request("http://localhost/non-existent-file.txt");
  const response = await handler(request);
  assertEquals(response.status, 404);
  const text = await response.text();
  assertEquals(text, "Not Found");
});
