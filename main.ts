import { serveFile } from "@std/http/file-server";
import { join } from "@std/path";

const port = Number(Deno.env.get("PORT") ?? "8000");
const rootDir = Deno.cwd();

export async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = join(rootDir, relativePath);

  try {
    return await serveFile(request, filePath);
  } catch {
    return new Response("Not Found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
}

Deno.serve({ port }, handler);
