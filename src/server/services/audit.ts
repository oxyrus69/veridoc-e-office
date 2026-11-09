import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";

export async function appendAudit(params: {
  actorId?: string | null;
  actorRole?: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  detail?: string;
  hashPreview?: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  await db.insert(schema.auditLogs).values({
    actorId: params.actorId ?? null,
    actorRole: params.actorRole ?? "",
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId ?? "",
    entityLabel: params.entityLabel ?? "",
    detail: params.detail ?? "",
    hashPreview: params.hashPreview ?? "",
  });
}

export async function listAuditLogs(limit = 100, db?: Database) {
  const database = db ?? (await getDb());
  return database
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      actorRole: schema.auditLogs.actorRole,
      actorName: schema.profiles.fullName,
      entityType: schema.auditLogs.entityType,
      entityId: schema.auditLogs.entityId,
      entityLabel: schema.auditLogs.entityLabel,
      detail: schema.auditLogs.detail,
      hashPreview: schema.auditLogs.hashPreview,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.auditLogs.actorId))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit);
}

export async function countAuditLogs(db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database.select({ id: schema.auditLogs.id }).from(schema.auditLogs);
  return rows.length;
}
