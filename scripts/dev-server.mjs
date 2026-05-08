import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const args = new Set(process.argv.slice(2));
const smoke = args.has("--smoke");
const portArg = process.argv.find((arg) => arg.startsWith("--port="));
const port = Number(portArg?.split("=")[1] ?? process.env.PORT ?? 5173);

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
]);

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const target = clean === "/" ? "/web/" : clean;
  const file = target.endsWith("/") ? `${target}index.html` : target;
  const resolved = normalize(join(root, file));
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = createServer(async (req, res) => {
  const filePath = safePath(req.url ?? "/");
  if (!filePath) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mime.get(extname(filePath)) ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Try: npm run dev -- --port=5174`);
  } else {
    console.error(err);
  }
  process.exit(1);
});

server.listen(port, async () => {
  const url = `http://localhost:${port}/web/`;
  console.log(`FusionPilot demo serving at ${url}`);

  if (smoke) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok || !text.includes("FUSION")) {
        throw new Error(`unexpected smoke response: ${res.status}`);
      }
      console.log("Smoke check passed.");
      server.close();
    } catch (err) {
      console.error(`Smoke check failed: ${err.message}`);
      server.close(() => process.exit(1));
    }
  }
});
