import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// One local server / CLI writer at a time; rebuild never swaps a live database.
export function acquireLock(dataDir: string): () => void {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, "writer.lock");
  try {
    writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  } catch (e: any) {
    if (e.code !== "EEXIST") throw e;
    const pid = Number(readFileSync(path, "utf8"));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error: any) {
      if (error.code === "ESRCH") alive = false;
    }
    if (alive)
      throw new Error(
        `数据目录正被进程 ${pid} 使用。服务运行时请用设置页 Sync Now；CLI sync/rebuild 前先停止服务。`,
      );
    unlinkSync(path);
    writeFileSync(path, String(process.pid), { flag: "wx", mode: 0o600 });
  }
  return () => {
    try {
      if (readFileSync(path, "utf8") === String(process.pid)) unlinkSync(path);
    } catch {}
  };
}
