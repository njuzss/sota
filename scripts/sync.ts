import { join } from "node:path";
import { loadConfig } from "../src/config.js";
import { createAdapter } from "../src/adapters.js";
import { Store } from "../src/db.js";
import { SyncService } from "../src/importer.js";
import { acquireLock } from "../src/lock.js";
const config = loadConfig(),
  release = acquireLock(config.dataDir),
  store = new Store(join(config.dataDir, "sota.db"));
try {
  const result = await new SyncService(
    store,
    createAdapter(config),
    join(config.dataDir, "raw"),
  ).sync(process.argv.includes("--force"));
  console.log(JSON.stringify(result, null, 2));
  if (result.failed) process.exitCode = 1;
} finally {
  store.close();
  release();
}
