/**
 * Runs the TypeScript e2e suite through Next's own bundler-style resolution.
 *
 * `scripts/e2e-verify.ts` imports the app engines with `@/` aliases, so it is
 * compiled to a self-contained ESM bundle first. This keeps `npm run e2e`
 * dependency-free while exercising exactly the modules the server uses.
 *
 * The database is re-seeded first so the suite always starts from a known
 * state: several checks deliberately mutate documents (they sign, seal and
 * reset workflows) and would otherwise only pass on a fresh seed.
 */
import { execFileSync } from "node:child_process";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";

const root = process.cwd();

execFileSync(process.execPath, [path.join(root, "scripts", "seed.mjs")], {
  cwd: root,
  stdio: "inherit",
});

const outDir = path.join(root, ".tmp-e2e");
const outFile = path.join(outDir, "e2e-verify.mjs");

await mkdir(outDir, { recursive: true });

await build({
  entryPoints: [path.join(root, "scripts/e2e-verify.ts")],
  outfile: outFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  sourcemap: "inline",
  external: ["@electric-sql/pglite", "drizzle-orm", "postgres", "drizzle-orm/*", "@electric-sql/*"],
  alias: {
    "@": path.join(root, "src"),
  },
  logLevel: "warning",
});

try {
  await import(pathToFileURL(outFile).href);
} finally {
  await rm(outFile, { force: true });
}
