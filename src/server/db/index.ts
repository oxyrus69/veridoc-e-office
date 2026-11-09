import { drizzle as drizzleNodePostgres } from "drizzle-orm/postgres-js";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema";

/** Shape shared by both drivers; queries used by the app are driver agnostic. */
export type Database = ReturnType<typeof drizzlePglite<typeof schema>>;

type GlobalDb = {
  db?: Database;
  client?: PGlite;
};

const globalForDb = globalThis as unknown as { __veridocDb?: GlobalDb };

export function isServerPostgres() {
  return (process.env.DATABASE_URL ?? "").startsWith("postgres://");
}

export function databaseModeLabel() {
  return isServerPostgres() ? "PostgreSQL Server" : "PGlite Lokal";
}

/**
 * Absolute, forward-slash path to the embedded database.
 *
 * PGlite's filesystem layer rejects `URL`/relative inputs on Windows bundlers,
 * so the directory is resolved against `process.cwd()` and created up front.
 */
function pgliteDataDir() {
  const dir = path.resolve(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  return dir.replace(/\\/g, "/");
}

export async function getDb(): Promise<Database> {
  if (globalForDb.__veridocDb?.db) return globalForDb.__veridocDb.db;

  if (isServerPostgres()) {
    const client = postgres(process.env.DATABASE_URL as string, { max: 4, prepare: false });
    const db = drizzleNodePostgres(client, { schema }) as unknown as Database;
    globalForDb.__veridocDb = { db };
    return db;
  }

  const client = new PGlite(pgliteDataDir());
  await client.waitReady;
  const db = drizzlePglite(client, { schema });
  globalForDb.__veridocDb = { db, client };
  return db;
}

export async function closeDb() {
  const client = globalForDb.__veridocDb?.client;
  if (client) await client.close();
  globalForDb.__veridocDb = undefined;
}

export { schema };
