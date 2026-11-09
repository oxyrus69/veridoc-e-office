import { PGlite } from "@electric-sql/pglite";

export const dynamic = "force-dynamic";

export async function GET() {
  const steps: string[] = [];
  try {
    const dataDir = `${process.cwd().replace(/\\/g, "/")}/.data/pglite`;
    steps.push(`dataDir=${dataDir}`);

    // Node 20+: `WebAssembly.Module` accepts a Buffer.
    // PGlite accepts explicit wasmModule + fsBundle options when bundlers break
    // its `import.meta.url` based asset lookup.
    const client = new PGlite(dataDir);
    await client.waitReady;
    const r = await client.query("select 1 as ok");
    steps.push(`query=${JSON.stringify(r.rows)}`);
    await client.close();
  } catch (error) {
    steps.push(`error=${(error as Error).message}`);
  }
  return Response.json({ steps });
}
