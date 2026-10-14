import "dotenv/config";
import { resolve } from "node:path";
import { homedir } from "node:os";
export interface Config {
  host: string;
  port: number;
  dataDir: string;
  sourceAdapter: "fixture" | "filesystem" | "google_docs";
  sourceDir: string;
  driveFolderId: string;
  syncOnStart: boolean;
  syncInterval: number;
}
export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  options = { demo: process.argv.includes("--demo") },
): Config {
  const sourceAdapter = options.demo
    ? "fixture"
    : env.SOURCE_ADAPTER || "filesystem";
  if (!["fixture", "filesystem", "google_docs"].includes(sourceAdapter))
    throw new Error("SOURCE_ADAPTER 必须为 fixture / filesystem / google_docs");
  const port = Number(env.PORT || 3000),
    interval = options.demo
      ? 0
      : Number(
          env.SYNC_INTERVAL_SECONDS ||
            (sourceAdapter === "filesystem" ? 300 : 0),
        );
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT 无效");
  if (
    !Number.isFinite(interval) ||
    interval < 0 ||
    (interval > 0 && interval < 300)
  )
    throw new Error("同步间隔必须为 0 或至少 300 秒");
  return {
    host: env.HOST || "127.0.0.1",
    port,
    dataDir: resolve(
      options.demo
        ? "./data/demo"
        : env.DATA_DIR ||
            (sourceAdapter === "fixture" ? "./data/demo" : "./data/local"),
    ),
    sourceAdapter: sourceAdapter as Config["sourceAdapter"],
    sourceDir: resolve(
      (options.demo ? "./fixtures/reports" : env.SOURCE_DIR) ||
        (sourceAdapter === "fixture"
          ? "./fixtures/reports"
          : resolve(homedir(), "ai/docs/personal-hot")),
    ),
    driveFolderId: env.GOOGLE_DRIVE_FOLDER_ID || "",
    syncOnStart: env.SYNC_ON_START !== "false",
    syncInterval: interval,
  };
}
