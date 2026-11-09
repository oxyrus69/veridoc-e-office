import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import { computeCanonicalDocumentHashPure } from "@/lib/cryptoMath";
import type { DocStatus, DocumentCategory } from "@/server/db/schema";

export type DocumentListRow = {
  id: string;
  title: string;
  documentNumber: string | null;
  verificationCode: string;
  category: DocumentCategory;
  status: DocStatus;
  confidentiality: string;
  departmentName: string;
  currentVersionNo: number;
  currentStepOrder: number;
  effectiveFrom: string;
  effectiveUntil: string | null;
  sealedAt: Date | null;
  updatedAt: Date;
  canonicalContentHash: string | null;
  finalSignatureChainHash: string | null;
  creatorName: string;
  templateCode: string | null;
  totalSteps: number;
  approvedSteps: number;
};

export async function listDocuments(
  filters: { status?: DocStatus | "ALL"; category?: DocumentCategory | "ALL"; search?: string } = {},
  db?: Database,
): Promise<DocumentListRow[]> {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      id: schema.officialDocuments.id,
      title: schema.officialDocuments.title,
      documentNumber: schema.officialDocuments.documentNumber,
      verificationCode: schema.officialDocuments.verificationCode,
      category: schema.officialDocuments.category,
      status: schema.officialDocuments.status,
      confidentiality: schema.officialDocuments.confidentiality,
      departmentName: schema.officialDocuments.departmentName,
      currentVersionNo: schema.officialDocuments.currentVersionNo,
      currentStepOrder: schema.officialDocuments.currentStepOrder,
      effectiveFrom: schema.officialDocuments.effectiveFrom,
      effectiveUntil: schema.officialDocuments.effectiveUntil,
      sealedAt: schema.officialDocuments.sealedAt,
      updatedAt: schema.officialDocuments.updatedAt,
      canonicalContentHash: schema.officialDocuments.canonicalContentHash,
      finalSignatureChainHash: schema.officialDocuments.finalSignatureChainHash,
      creatorName: schema.profiles.fullName,
      templateCode: schema.documentTemplates.code,
    })
    .from(schema.officialDocuments)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.officialDocuments.creatorId))
    .leftJoin(schema.documentTemplates, eq(schema.documentTemplates.id, schema.officialDocuments.templateId))
    .orderBy(desc(schema.officialDocuments.updatedAt));

  const stepCounts = await database
    .select({
      documentId: schema.approvalWorkflowSteps.documentId,
      total: sql<number>`count(*)::int`,
      approved: sql<number>`sum(case when ${schema.approvalWorkflowSteps.verdict} = 'APPROVED_SIGNED' then 1 else 0 end)::int`,
    })
    .from(schema.approvalWorkflowSteps)
    .groupBy(schema.approvalWorkflowSteps.documentId);

  const stepMap = new Map(stepCounts.map((s) => [s.documentId, s]));

  let result: DocumentListRow[] = rows.map((row) => ({
    ...row,
    sealedAt: row.sealedAt ? new Date(row.sealedAt) : null,
    updatedAt: new Date(row.updatedAt),
    totalSteps: stepMap.get(row.id)?.total ?? 0,
    approvedSteps: stepMap.get(row.id)?.approved ?? 0,
  }));

  if (filters.status && filters.status !== "ALL") {
    result = result.filter((row) => row.status === filters.status);
  }
  if (filters.category && filters.category !== "ALL") {
    result = result.filter((row) => row.category === filters.category);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (row) =>
        row.title.toLowerCase().includes(q) ||
        (row.documentNumber ?? "").toLowerCase().includes(q) ||
        row.verificationCode.toLowerCase().includes(q) ||
        row.creatorName.toLowerCase().includes(q),
    );
  }

  return result;
}

export type DocumentDetail = Awaited<ReturnType<typeof getDocumentDetail>>;

export async function getDocumentDetail(id: string, db?: Database) {
  const database = db ?? (await getDb());
  const [doc] = await database
    .select({
      id: schema.officialDocuments.id,
      title: schema.officialDocuments.title,
      documentNumber: schema.officialDocuments.documentNumber,
      verificationCode: schema.officialDocuments.verificationCode,
      category: schema.officialDocuments.category,
      status: schema.officialDocuments.status,
      confidentiality: schema.officialDocuments.confidentiality,
      departmentName: schema.officialDocuments.departmentName,
      currentVersionNo: schema.officialDocuments.currentVersionNo,
      currentStepOrder: schema.officialDocuments.currentStepOrder,
      effectiveFrom: schema.officialDocuments.effectiveFrom,
      effectiveUntil: schema.officialDocuments.effectiveUntil,
      canonicalContentHash: schema.officialDocuments.canonicalContentHash,
      finalSignatureChainHash: schema.officialDocuments.finalSignatureChainHash,
      sealedAt: schema.officialDocuments.sealedAt,
      revokedAt: schema.officialDocuments.revokedAt,
      revocationReason: schema.officialDocuments.revocationReason,
      version: schema.officialDocuments.version,
      createdAt: schema.officialDocuments.createdAt,
      updatedAt: schema.officialDocuments.updatedAt,
      creatorId: schema.officialDocuments.creatorId,
      creatorName: schema.profiles.fullName,
      creatorTitle: schema.profiles.jobTitle,
      templateId: schema.officialDocuments.templateId,
      templateCode: schema.documentTemplates.code,
      templateName: schema.documentTemplates.name,
      templateNumberFormat: schema.documentTemplates.numberPrefixFormat,
      templateSlaHours: schema.documentTemplates.slaHoursPerStep,
    })
    .from(schema.officialDocuments)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.officialDocuments.creatorId))
    .leftJoin(schema.documentTemplates, eq(schema.documentTemplates.id, schema.officialDocuments.templateId))
    .where(eq(schema.officialDocuments.id, id))
    .limit(1);

  if (!doc) return null;

  const versions = await database
    .select({
      id: schema.documentVersions.id,
      versionNo: schema.documentVersions.versionNo,
      variablesPayloadJson: schema.documentVersions.variablesPayloadJson,
      renderedBodyText: schema.documentVersions.renderedBodyText,
      contentSha256: schema.documentVersions.contentSha256,
      changeNotes: schema.documentVersions.changeNotes,
      createdAt: schema.documentVersions.createdAt,
      createdByName: schema.profiles.fullName,
    })
    .from(schema.documentVersions)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.documentVersions.createdBy))
    .where(eq(schema.documentVersions.documentId, id))
    .orderBy(asc(schema.documentVersions.versionNo));

  return {
    ...doc,
    createdAt: new Date(doc.createdAt),
    updatedAt: new Date(doc.updatedAt),
    sealedAt: doc.sealedAt ? new Date(doc.sealedAt) : null,
    revokedAt: doc.revokedAt ? new Date(doc.revokedAt) : null,
    versions: versions.map((v) => ({ ...v, createdAt: new Date(v.createdAt) })),
  };
}

export async function createDocumentDraft(params: {
  templateId: string | null;
  creatorId: string;
  title: string;
  category: DocumentCategory;
  confidentiality: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "STRICTLY_SECRET";
  departmentName: string;
  variablesPayload: Record<string, unknown>;
  renderedBodyText: string;
  effectiveFrom: string;
  effectiveUntil: string | null;
  workflow: { name: string; approverId: string; mode: "SEQUENTIAL" | "PARALLEL_ANY" | "PARALLEL_ALL"; slaHours: number }[];
  submit: boolean;
  verificationCode: string;
  documentNumber?: string | null;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  const now = new Date();
  const docId = crypto.randomUUID();

  const contentHash = computeCanonicalDocumentHashPure({
    title: params.title,
    category: params.category,
    documentNumber: params.documentNumber ?? docId,
    variablesPayload: params.variablesPayload,
    renderedBodyText: params.renderedBodyText,
  });

  await db.insert(schema.officialDocuments).values({
    id: docId,
    documentNumber: params.documentNumber ?? null,
    verificationCode: params.verificationCode,
    templateId: params.templateId,
    creatorId: params.creatorId,
    departmentName: params.departmentName,
    title: params.title,
    category: params.category,
    confidentiality: params.confidentiality,
    status: params.submit ? "IN_REVIEW_WORKFLOW" : "DRAFT",
    currentVersionNo: 1,
    currentStepOrder: params.submit ? 1 : 0,
    effectiveFrom: params.effectiveFrom,
    effectiveUntil: params.effectiveUntil,
    createdBy: params.creatorId,
  });

  await db.insert(schema.documentVersions).values({
    documentId: docId,
    versionNo: 1,
    variablesPayloadJson: params.variablesPayload,
    renderedBodyText: params.renderedBodyText,
    contentSha256: contentHash,
    changeNotes: "Draf awal",
    createdBy: params.creatorId,
  });

  if (params.submit && params.workflow.length > 0) {
    let order = 1;
    for (const step of params.workflow) {
      await db.insert(schema.approvalWorkflowSteps).values({
        documentId: docId,
        stepOrder: order,
        stepName: step.name,
        mode: step.mode,
        assignedApproverId: step.approverId,
        verdict: order === 1 ? "PENDING_ACTION" : "WAITING_PREVIOUS",
        slaDueAt: new Date(now.getTime() + step.slaHours * 3600000),
        previousStepSignatureHash: "GENESIS",
      });
      order += 1;
    }
  }

  return { documentId: docId, contentHash };
}

/** Creates version n+1 and resets the whole approval chain. */
export async function addDocumentRevision(params: {
  documentId: string;
  creatorId: string;
  variablesPayload: Record<string, unknown>;
  renderedBodyText: string;
  changeNotes: string;
  effectiveFrom?: string;
  effectiveUntil?: string | null;
  slaHours: number;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  const [doc] = await db
    .select()
    .from(schema.officialDocuments)
    .where(eq(schema.officialDocuments.id, params.documentId))
    .limit(1);
  if (!doc) throw new Error("Dokumen tidak ditemukan");

  const nextVersionNo = doc.currentVersionNo + 1;
  const contentHash = computeCanonicalDocumentHashPure({
    title: doc.title,
    category: doc.category,
    documentNumber: doc.documentNumber ?? doc.id,
    variablesPayload: params.variablesPayload,
    renderedBodyText: params.renderedBodyText,
  });

  await db.insert(schema.documentVersions).values({
    documentId: doc.id,
    versionNo: nextVersionNo,
    variablesPayloadJson: params.variablesPayload,
    renderedBodyText: params.renderedBodyText,
    contentSha256: contentHash,
    changeNotes: params.changeNotes,
    createdBy: params.creatorId,
  });

  await db
    .update(schema.officialDocuments)
    .set({
      currentVersionNo: nextVersionNo,
      status: "IN_REVIEW_WORKFLOW",
      currentStepOrder: 1,
      effectiveFrom: params.effectiveFrom ?? doc.effectiveFrom,
      effectiveUntil: params.effectiveUntil ?? doc.effectiveUntil,
      canonicalContentHash: null,
      finalSignatureChainHash: null,
      sealedAt: null,
      updatedAt: new Date(),
      version: doc.version + 1,
    })
    .where(eq(schema.officialDocuments.id, doc.id));

  const steps = await db
    .select()
    .from(schema.approvalWorkflowSteps)
    .where(eq(schema.approvalWorkflowSteps.documentId, doc.id))
    .orderBy(asc(schema.approvalWorkflowSteps.stepOrder));

  const now = new Date();
  for (const step of steps) {
    await db
      .update(schema.approvalWorkflowSteps)
      .set({
        verdict: step.stepOrder === 1 ? "PENDING_ACTION" : "WAITING_PREVIOUS",
        actedAt: null,
        comments: null,
        signedVersionNo: null,
        stepSignatureHash: null,
        previousStepSignatureHash: "GENESIS",
        certificateFingerprint: null,
        slaDueAt: new Date(now.getTime() + params.slaHours * 3600000),
      })
      .where(eq(schema.approvalWorkflowSteps.id, step.id));
  }

  return { versionNo: nextVersionNo, contentHash, resetSteps: steps.length };
}

export async function revokeDocument(params: {
  documentId: string;
  revokedBy: string;
  reason: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  await db
    .update(schema.officialDocuments)
    .set({
      status: "REVOKED_INVALIDATED",
      revokedAt: new Date(),
      revokedBy: params.revokedBy,
      revocationReason: params.reason,
      updatedAt: new Date(),
      version: sql`${schema.officialDocuments.version} + 1`,
    })
    .where(eq(schema.officialDocuments.id, params.documentId));
}

export async function markExpiredDocuments(db?: Database) {
  const database = db ?? (await getDb());
  const today = new Date().toISOString().slice(0, 10);
  await database
    .update(schema.officialDocuments)
    .set({ status: "EXPIRED", updatedAt: new Date() })
    .where(
      sql`${schema.officialDocuments.status} = 'SEALED_PUBLISHED'
          and ${schema.officialDocuments.effectiveUntil} is not null
          and ${schema.officialDocuments.effectiveUntil} < ${today}`,
    );
}

export async function getDocumentVersion(documentId: string, versionNo: number, db?: Database) {
  const database = db ?? (await getDb());
  const [row] = await database
    .select()
    .from(schema.documentVersions)
    .where(
      sql`${schema.documentVersions.documentId} = ${documentId} and ${schema.documentVersions.versionNo} = ${versionNo}`,
    )
    .limit(1);
  return row ?? null;
}

export async function countDocumentsByStatus(db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database
    .select({ status: schema.officialDocuments.status, count: sql<number>`count(*)::int` })
    .from(schema.officialDocuments)
    .groupBy(schema.officialDocuments.status);
  return rows;
}

export async function listDocumentsByIds(ids: string[], db?: Database) {
  if (ids.length === 0) return [];
  const database = db ?? (await getDb());
  return database.select().from(schema.officialDocuments).where(inArray(schema.officialDocuments.id, ids));
}
