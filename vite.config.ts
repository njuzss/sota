import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const base = process.env.PAGES_BASE_PATH || "/sota/";
if (!/^\/(?:[a-zA-Z0-9._-]+\/)*$/.test(base))
  throw new Error("PAGES_BASE_PATH must be / or /repository/");
export default defineConfig({
  root: "web",
  base,
  plugins: [react()],
  build: { outDir: "../dist", emptyOutDir: true },
  server: { host: "127.0.0.1" },
  preview: { host: "127.0.0.1" },
});
