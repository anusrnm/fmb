/// <reference types="bun" />

import { resolve } from "node:path";

const port = Number(process.env.PORT ?? "8000");
const rootDir = process.cwd();

function getFilePath(pathname: string): string | null {
  let relativePath: string;
  try {
    relativePath = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  } catch {
    return null;
  }

  const filePath = resolve(rootDir, relativePath);
  return filePath === rootDir || filePath.startsWith(`${rootDir}/`) ? filePath : null;
}

export async function handler(request: Request): Promise<Response> {
  const notFound = new Response("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });

  const filePath = getFilePath(new URL(request.url).pathname);
  if (!filePath) return notFound;

  const file = Bun.file(filePath);
  if (!(await file.exists())) return notFound;

  return new Response(file);
}

Bun.serve({ port, fetch: handler });