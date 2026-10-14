import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PublicationManifest } from "../src/static-publication.js";
const index = await readFile("dist/index.html", "utf8");
const manifest: PublicationManifest = JSON.parse(
  await readFile("dist/data/manifest.json", "utf8"),
);
// Real HTML directory entries work on Pages without server rewrites or hash routing.
const routes = [
  "frontier",
  "trending",
  "market",
  "archive",
  "search",
  "settings",
  ...manifest.dates.map((date) => `day/${date}`),
];
for (const route of routes) {
  if (
    !/^(frontier|trending|market|archive|search|settings|day\/\d{4}-\d{2}-\d{2})$/.test(
      route,
    )
  )
    throw new Error("Invalid publication route");
  await mkdir(join("dist", route), { recursive: true });
  await writeFile(join("dist", route, "index.html"), index);
}
await writeFile("dist/404.html", index);
await writeFile("dist/.nojekyll", "");
console.log(`Created ${routes.length} deep-link entries`);
