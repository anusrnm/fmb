import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.env.PORT ?? "8000");
const rootDir = process.cwd();
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

function getFilePath(pathname) {
  let relativePath;
  try {
    relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const filePath = resolve(rootDir, relativePath);
  const pathFromRoot = relative(rootDir, filePath);
  return pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)
    ? null
    : filePath;
}

export async function handler(request) {
  const notFound = new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
  const filePath = getFilePath(new URL(request.url).pathname);
  if (!filePath) return notFound;

  let file;
  try {
    file = await readFile(filePath);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return notFound;
    throw error;
  }

  return new Response(file, {
    headers: { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream" },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  createServer(async (request, response) => {
    try {
      const result = await handler(new Request(new URL(request.url, `http://${request.headers.host}`)));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(request.method === "HEAD" ? undefined : Buffer.from(await result.arrayBuffer()));
    } catch (error) {
      console.error("Failed to serve request:", error);
      response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      response.end("Internal Server Error");
    }
  }).listen(port);
}
