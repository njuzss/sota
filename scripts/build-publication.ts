import "dotenv/config";
import { resolve } from "node:path";
import { buildPublication } from "../src/build-publication.js";
const demo = process.argv.includes("--demo");
const source = resolve(
  demo ? "fixtures/reports" : process.env.SOURCE_DIR || "data/reports",
);
const { result, manifest } = await buildPublication(source, "web/public/data", {
  demo,
  allowEmpty: !demo || process.argv.includes("--allow-empty"),
});
console.log(
  JSON.stringify({
    reports: result.imported,
    days: manifest.dates.length,
    latest: manifest.latest,
    revision: manifest.revision,
    demo,
  }),
);
