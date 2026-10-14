import { join } from "node:path";
import { existsSync } from "node:fs";
import { rename, rm, copyFile } from "node:fs/promises";
import { loadConfig } from "../src/config.js";
import { createAdapter } from "../src/adapters.js";
import { Store } from "../src/db.js";
import { SyncService } from "../src/importer.js";
import { acquireLock } from "../src/lock.js";
const config = loadConfig(),
  release = acquireLock(config.dataDir);
const target = join(config.dataDir, "sota.db"),
  temporary = join(config.dataDir, `rebuild-${process.pid}.db`);
const store = new Store(temporary);
let closed = false;
try {
  const result = await new SyncService(
    store,
    createAdapter(config),
    join(config.dataDir, "raw"),
  ).sync(true);
  console.log(JSON.stringify(result, null, 2));
  if (result.failed || !result.found)
    throw new Error(
      "重建源不完整或为空，保留原数据库。修复源文件/凭据后重试。",
    );
  store.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  store.close();
  closed = true;
  if (existsSync(target)) {
    // Checkpoint an old database left by an interrupted process before backing it up.
    const previous = new Store(target);
    previous.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    previous.close();
    await copyFile(target, `${target}.backup`);
  }
  await rename(temporary, target);
  console.log(`重建完成：${target}；旧库保存在 sota.db.backup`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (!closed) store.close();
  for (const suffix of ["", "-wal", "-shm"])
    await rm(temporary + suffix, { force: true });
  release();
}
