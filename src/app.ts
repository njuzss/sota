import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { resolve } from "node:path";
import type { Config } from "./config.js";
import { Store } from "./db.js";
import { SyncService } from "./importer.js";
import { PublicationService } from "./publication.js";
import { CHANNELS, type Channel } from "./contracts.js";
import { validDate } from "./parser.js";

export async function createApp(
  config: Config,
  store: Store,
  sync: SyncService,
  serveWeb = true,
) {
  const app = Fastify({ logger: false });
  const publication = new PublicationService(store);
  app.addHook("onRequest", async (request, reply) => {
    const hostname = (request.headers.host || "localhost")
      .replace(/:\d+$/, "")
      .toLowerCase();
    if (
      !["localhost", "127.0.0.1", "[::1]", config.host].includes(hostname) &&
      ["127.0.0.1", "localhost", "::1"].includes(config.host)
    )
      return reply.code(403).send({ error: "Host 不在本地服务范围" });
    if (request.method === "POST") {
      const origin = request.headers.origin;
      let validOrigin = !origin;
      try {
        if (origin) validOrigin = new URL(origin).host === request.headers.host;
      } catch {
        validOrigin = false;
      }
      if (
        !validOrigin ||
        !request.headers["content-type"]?.startsWith("application/json")
      )
        return reply.code(403).send({ error: "同步操作只接受同源 JSON 请求" });
    }
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
  });
  app.get("/api/day/latest", async (_, reply) => {
    const day = publication.latest();
    return (
      day ||
      reply.code(404).send({ error: "尚无日报；请先同步源数据", code: "EMPTY" })
    );
  });
  app.get<{ Params: { date: string } }>(
    "/api/day/:date",
    async (request, reply) => {
      if (!validDate(request.params.date))
        return reply.code(400).send({ error: "日期格式无效" });
      return (
        publication.day(request.params.date) ||
        reply.code(404).send({ error: "这个日期还没有日报", code: "NOT_FOUND" })
      );
    },
  );
  app.get("/api/archive", async () => ({ days: publication.archive() }));
  app.get<{ Params: { channel: string } }>(
    "/api/channel/:channel",
    async (request, reply) => {
      const channel = request.params.channel;
      if (!Object.hasOwn(CHANNELS, channel))
        return reply.code(404).send({ error: "频道不存在" });
      return { reports: publication.channel(channel as Channel) };
    },
  );
  app.get<{ Querystring: { q?: string } }>(
    "/api/search",
    async (request, reply) => {
      if (
        request.query.q &&
        (typeof request.query.q !== "string" || request.query.q.length > 200)
      )
        return reply.code(400).send({ error: "查询最多 200 字符" });
      return { results: publication.search(request.query.q || "") };
    },
  );
  app.get("/api/status", async () =>
    publication.status(sync.adapter, sync.running),
  );
  app.post("/api/sync", async (_, reply) => {
    if (sync.running) return reply.code(409).send({ error: "同步正在进行" });
    const result = await sync.sync();
    return reply.code(result.failed ? 207 : 200).send(result);
  });
  app.post("/api/search/rebuild", async () => {
    store.rebuildSearch();
    return { ok: true };
  });
  if (serveWeb) {
    await app.register(fastifyStatic, {
      root: resolve("dist/web"),
      prefix: "/",
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/"))
        return reply.code(404).send({ error: "API 不存在" });
      if (/\.[a-z0-9]+(?:\?|$)/i.test(request.url))
        return reply.code(404).send({ error: "文件不存在" });
      return reply.type("text/html").sendFile("index.html");
    });
  }
  return app;
}
