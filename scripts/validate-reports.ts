import { resolve } from "node:path";
import {
  ReportDirectoryAdapter,
  knownFixtureHashes,
} from "../src/report-source.js";
const adapter = new ReportDirectoryAdapter(
  resolve(process.env.SOURCE_DIR || "data/reports"),
  await knownFixtureHashes(),
);
const reports = await adapter.scan();
console.log(
  JSON.stringify(
    {
      valid: reports.length,
      invalid: adapter.errors.length,
      errors: adapter.errors,
    },
    null,
    2,
  ),
);
// This standalone audit is strict; publication independently isolates bad files and builds valid history.
if (adapter.errors.length) process.exitCode = 1;
