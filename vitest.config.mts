import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// .env.local feeds the DB tests (keys of the local Supabase stack); absent file = DB tests skip.
try { process.loadEnvFile(".env.local"); } catch { /* no local env */ }

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts", "tests/**/*.test.ts"] },
});
