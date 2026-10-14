import { resolve } from "node:path";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { Store } from "./db.js";
import { FileSystemAdapter } from "./adapters.js";
import { SyncService } from "./importer.js";
import { exportPublication } from "./static-publication.js";
import { parseReport } from "./parser.js";
import { ReportDirectoryAdapter, knownFixtureHashes } from "./report-source.js";

export async function buildPublication(
  source: string,
  output: string,
  options = { demo: false, allowEmpty: false },
) {
  output = resolve(output);
  const parent = resolve(output, "..");
  await mkdir(parent, { recursive: true });
  const temporary = await mkdtemp(resolve(parent, ".publication-"));
  const store = new Store(":memory:");
  try {
    const adapter = options.demo
      ? new FileSystemAdapter(source, "fixture")
      : new ReportDirectoryAdapter(source, await knownFixtureHashes());
    if (options.demo) {
      const scan = adapter.scan.bind(adapter);
      adapter.scan = async () => {
        const artifacts = await scan();
        for (const artifact of artifacts)
          artifact.modifiedTime = parseReport(
            (await adapter.fetch(artifact.id)).text,
          ).report.generated_at;
        return artifacts;
      };
    }
    const result = await new SyncService(store, adapter).sync();
    const errors = [
      ...(adapter instanceof ReportDirectoryAdapter ? adapter.errors : []),
      ...result.events
        .filter((e) => e.event === "FAILED")
        .map((e) => ({ source_id: e.source_id, error: e.message })),
    ];
    for (const error of errors)
      console.error(`FAILED ${error.source_id}: ${error.error}`);
    if (errors.length && !store.get("SELECT COUNT(*) n FROM reports")!.n)
      throw new Error("没有可发布的有效日报，保留上一份出版物。");
    if (!result.found && !options.allowEmpty)
      throw new Error(
        "源目录没有日报；拒绝发布空站。使用 --allow-empty 可显式建立空站。",
      );
    const manifest = await exportPublication(
      store,
      temporary,
      options.demo,
      errors,
    );
    const backup = `${output}.previous`;
    await rm(backup, { recursive: true, force: true });
    let backedUp = false;
    try {
      await rename(output, backup);
      backedUp = true;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    try {
      await rename(temporary, output);
    } catch (e) {
      if (backedUp) await rename(backup, output);
      throw e;
    }
    await rm(backup, { recursive: true, force: true });
    return { result, manifest };
  } finally {
    store.close();
    await rm(temporary, { recursive: true, force: true });
  }
}
