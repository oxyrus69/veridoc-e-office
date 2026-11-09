import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships its WASM/FS assets next to its own JS and locates them through
  // `import.meta.url`. Bundling it rewrites that URL into a file:// object the
  // Node fs API rejects, so keep it (and the Postgres driver) external and let
  // Node resolve them from node_modules at runtime.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
};

export default nextConfig;
