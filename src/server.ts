import { join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { loadConfig } from "./config.js";
import { createAdapter } from "./adapters.js";
import { createApp } from "./app.js";
import { Store } from "./db.js";
import { SyncService } from "./importer.js";
import { acquireLock } from "./lock.js";

const config = loadConfig(),
  release = acquireLock(config.dataDir);
const store = new Store(join(config.dataDir, "sota.db"));
const sync = new SyncService(
  store,
  createAdapter(config),
  join(config.dataDir, "raw"),
);
const dev = process.argv.includes("--dev");
const app = await createApp(config, store, sync, !dev);
let vite: { close(): Promise<void> } | undefined;
if (dev) {
  const { createServer } = await import("vite");
  const server = await createServer({
    server: {
      middlewareMode: true,
      host: config.host,
      hmr: { server: app.server, host: config.host, clientPort: config.port },
    },
    appType: "custom",
  });
  vite = server;
  app.addHook("onRequest", (request, reply, done) => {
    if (request.url.startsWith("/api/")) {
      done();
      return;
    }
    reply.hijack();
    server.middlewares(request.raw, reply.raw, async () => {
      try {
        const template = await readFile(resolve("web/index.html"), "utf8");
        const html = await server.transformIndexHtml(request.url, template);
        reply.raw.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
        });
        reply.raw.end(html);
      } catch {
        reply.raw.writeHead(500);
        reply.raw.end("页面加载失败");
      }
    });
  });
}
const timer = config.syncInterval
  ? setInterval(() => void sync.sync(), config.syncInterval * 1000)
  : null;
let closing = false;
const shutdown = async () => {
  if (closing) return;
  closing = true;
  if (timer) clearInterval(timer);
  await app.close();
  if (sync.running) await sync.sync();
  await vite?.close();
  store.close();
  release();
};
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(
    `SOTA → http://${config.host}:${config.port} (${config.sourceAdapter})`,
  );
  if (config.syncOnStart) {
    // Startup sync belongs to service lifecycle. Page reads never trigger it.
    void sync
      .sync()
      .then((result) =>
        console.log(
          `启动同步：${result.imported} 新增 / ${result.updated} 更新 / ${result.unchanged} 未变 / ${result.failed} 失败`,
        ),
      );
  }
} catch (error) {
  await shutdown();
  throw error;
}
