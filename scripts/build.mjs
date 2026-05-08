import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const out = resolve("dist");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp("web", `${out}/web`, { recursive: true });
await cp("trajectories", `${out}/trajectories`, { recursive: true });
await cp("index.html", `${out}/index.html`);

console.log("Built static demo into dist/");
console.log("Serve dist/ with any static file server; open /web/.");
