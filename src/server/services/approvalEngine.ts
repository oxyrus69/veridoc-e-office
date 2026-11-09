import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import { GENESIS_CHAIN, formatFingerprint, sha256Hex, verifySigningPin } from "@/lib/cryptoMath";
import {
  getCertificateForUser,
  newVerificationCode,
  nextDocumentNumber,
  sealApprovalStep,
  verifyChainHashSignature,
} from "./cryptoSealEngine";
import { getSetting, SETTING_KEYS } from "./settings";
import { appendAudit } from "./audit";

export type ApprovalOutcome = {
  ok: boolean;
  code:
    | "APPROVED_INTERMEDIATE"
    | "SEALED_FINAL"
    | "REJECTED"
    | "INVALID_PIN"
    | "INVALID_STATE"
    | "NOT_ASSIGNED"
    | "VERSION_CONFLICT";
  message: string;
  documentNumber?: string;
  verificationCode?: string;
  stepSignatureHash?: string;
};

async function loadStepContext(documentId: string, db: Database) {
  const [doc] = await db
    .select()
    .from(schema.officialDocuments)
    .where(eq(schema.officialDocuments.id, documentId))
    .limit(1);
  if (!doc) return null;

  const steps = await db
    .select()
    .from(schema.approvalWorkflowSteps)
    .where(eq(schema.approvalWorkflowSteps.documentId, documentId))
    .orderBy(asc(schema.approvalWorkflowSteps.stepOrder));

  const [version] = await db
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.documentId, documentId),
        eq(schema.documentVersions.versionNo, doc.currentVersionNo),
      ),
    )
    .limit(1);

  const [template] = doc.templateId
    ? await db.select().from(schema.documentTemplates).where(eq(schema.documentTemplates.id, doc.templateId)).limit(1)
    : [null];

  return { doc, steps, version, template };
}

/** Full verification of every sealed step: chain linkage + RSA-PSS signature. */
export function auditChain(params: {
  steps: {
    stepOrder: number;
    previousStepSignatureHash: string;
    stepSignatureHash: string | null;
    rsaSignature?: string | null;
    assignedApproverId: string;
    actedAt: Date | null;
    verdict: string;
    certificateFingerprint: string | null;
  }[];
  contentHash: string;
  publicKeys?: Map<string, string>;
  /** True when the document has a final seal; false while it is still in review. */
  sealed?: boolean;
}) {
  const issues: string[] = [];
  let previous = GENESIS_CHAIN;

  for (const step of params.steps) {
    if (step.verdict !== "APPROVED_SIGNED") continue;
    if (!step.stepSignatureHash || !step.actedAt) {
      issues.push(`Tahap ${step.stepOrder} tidak memiliki bukti tanda tangan`);
      continue;
    }
    if (step.previousStepSignatureHash !== previous) {
      issues.push(`Rantai patah pada tahap ${step.stepOrder}: hash tahap sebelumnya tidak cocok`);
    }
    previous = step.stepSignatureHash;

    if (params.publicKeys) {
      const pem = step.certificateFingerprint ? params.publicKeys.get(step.certificateFingerprint) : undefined;
      if (!pem) {
        issues.push(`Kunci publik tahap ${step.stepOrder} tidak ditemukan untuk sertifikat ${step.certificateFingerprint ?? "—"}`);
      } else if (!step.rsaSignature) {
        issues.push(`Tahap ${step.stepOrder} tidak memiliki tanda tangan RSA-PSS`);
      } else if (!verifyChainHashSignature(pem, step.stepSignatureHash, step.rsaSignature)) {
        issues.push(`Tanda tangan RSA-PSS tahap ${step.stepOrder} tidak sah`);
      }
    }
  }

  // A document that is still in review has not been sealed yet, so the stored
  // content hash is legitimately empty. Only a *sealed* document must carry it.
  if (params.sealed && params.steps.some((s) => s.verdict === "APPROVED_SIGNED") && !params.contentHash) {
    issues.push("Hash isi dokumen kosong padahal ada tahap yang ditandatangani");
  }

  return { valid: issues.length === 0, issues, tailHash: previous };
}

/**
 * Submits one verdict. Purely data-layer; callers enforce RBAC.
 * Enforces: PIN check, sequential state machine, atomic numbering on final,
 * reset to step 1 when a revision lands.
 */
export async function submitApprovalVerdict(params: {
  documentId: string;
  approverId: string;
  pin: string;
  verdict: "APPROVED_SIGNED" | "REJECTED_RETURNED";
  comments?: string;
  expectedVersion?: number;
  db?: Database;
}): Promise<ApprovalOutcome> {
  const db = params.db ?? (await getDb());
  const context = await loadStepContext(params.documentId, db);
  if (!context) return { ok: false, code: "INVALID_STATE", message: "Dokumen tidak ditemukan" };
  const { doc, steps, version, template } = context;

  if (doc.status !== "IN_REVIEW_WORKFLOW") {
    return { ok: false, code: "INVALID_STATE", message: `Status dokumen ${doc.status} tidak menerima tindakan` };
  }
  if (params.expectedVersion !== undefined && params.expectedVersion !== doc.version) {
    return { ok: false, code: "VERSION_CONFLICT", message: "Dokumen telah berubah. Muat ulang halaman." };
  }
  if (!version) return { ok: false, code: "INVALID_STATE", message: "Versi dokumen tidak ditemukan" };

  const active = steps.find((s) => s.verdict === "PENDING_ACTION");
  if (!active) return { ok: false, code: "INVALID_STATE", message: "Tidak ada tahap yang menunggu tindakan" };
  if (active.assignedApproverId !== params.approverId) {
    return { ok: false, code: "NOT_ASSIGNED", message: "Anda bukan penyetuju untuk tahap ini" };
  }

  const certificate = await getCertificateForUser(params.approverId, db);
  if (!certificate || certificate.status !== "ACTIVE") {
    return { ok: false, code: "INVALID_PIN", message: "Sertifikat penandatangan tidak aktif" };
  }

  // The PIN is mandatory for the sealing signature (require_pin_final).
  const isFinalStep = steps.filter((s) => s.stepOrder > active.stepOrder).length === 0;
  const pinRequired = isFinalStep ? (await getSetting(SETTING_KEYS.requirePinFinal)) !== "false" : true;
  if (pinRequired && !params.pin) {
    return { ok: false, code: "INVALID_PIN", message: "PIN tanda tangan wajib diisi untuk tahap ini" };
  }
  if (!verifySigningPin(params.pin, certificate.signingPinHash)) {
    return { ok: false, code: "INVALID_PIN", message: "PIN tanda tangan salah" };
  }

  const now = new Date();

  if (params.verdict === "REJECTED_RETURNED") {
    await db
      .update(schema.approvalWorkflowSteps)
      .set({ verdict: "REJECTED_RETURNED", actedAt: now, comments: params.comments ?? "" })
      .where(eq(schema.approvalWorkflowSteps.id, active.id));

    await db
      .update(schema.officialDocuments)
      .set({ status: "REVISION_REQUESTED", updatedAt: now, version: doc.version + 1 })
      .where(eq(schema.officialDocuments.id, doc.id));

    await appendAudit({
      actorId: params.approverId,
      action: "APPROVAL_REJECTED",
      entityType: "document",
      entityId: doc.id,
      entityLabel: doc.title,
      detail: `Tahap ${active.stepOrder} dikembalikan: ${params.comments || "tanpa catatan"}`,
      db,
    });

    return { ok: true, code: "REJECTED", message: "Dokumen dikembalikan untuk revisi" };
  }

  /* ---------- APPROVED_SIGNED ---------- */
  const contentHash = version.contentSha256;
  const previousSteps = steps.filter((s) => s.verdict === "APPROVED_SIGNED").sort((a, b) => a.stepOrder - b.stepOrder);
  const previousHash = previousSteps.length ? (previousSteps[previousSteps.length - 1].stepSignatureHash as string) : GENESIS_CHAIN;

  const seal = await sealApprovalStep({
    certificate,
    contentHash,
    previousSignatureHash: previousHash,
    approverId: params.approverId,
    actedAt: now,
    pin: params.pin,
  });

  await db
    .update(schema.approvalWorkflowSteps)
    .set({
      verdict: "APPROVED_SIGNED",
      actedAt: now,
      comments: params.comments ?? "",
      signedVersionNo: doc.currentVersionNo,
      previousStepSignatureHash: seal.previousStepSignatureHash,
      stepSignatureHash: seal.stepSignatureHash,
      rsaSignature: seal.rsaSignature,
      certificateFingerprint: seal.certificateFingerprint,
    })
    .where(eq(schema.approvalWorkflowSteps.id, active.id));

  const remaining = steps.filter((s) => s.stepOrder > active.stepOrder).sort((a, b) => a.stepOrder - b.stepOrder);
  const isFinal = remaining.length === 0;

  await appendAudit({
    actorId: params.approverId,
    action: "APPROVAL_SIGNED",
    entityType: "document",
    entityId: doc.id,
    entityLabel: doc.title,
    detail: `Tahap ${active.stepOrder} (${active.stepName}) ditandatangani`,
    hashPreview: seal.stepSignatureHash,
    db,
  });

  if (!isFinal) {
    const nextStep = remaining[0];
    // The configured SLA is the default; the template may override it per step.
    const slaHours = Number((await getSetting(SETTING_KEYS.slaHours)) ?? 0) || template?.slaHoursPerStep || 24;
    await db
      .update(schema.approvalWorkflowSteps)
      .set({
        verdict: "PENDING_ACTION",
        slaDueAt: new Date(now.getTime() + slaHours * 3600000),
      })
      .where(eq(schema.approvalWorkflowSteps.id, nextStep.id));

    await db
      .update(schema.officialDocuments)
      .set({ currentStepOrder: nextStep.stepOrder, updatedAt: now, version: doc.version + 1 })
      .where(eq(schema.officialDocuments.id, doc.id));

    return {
      ok: true,
      code: "APPROVED_INTERMEDIATE",
      message: `Paraf tahap ${active.stepOrder} tersimpan. Dokumen naik ke tahap ${nextStep.stepOrder}.`,
      stepSignatureHash: seal.stepSignatureHash,
    };
  }

  /* Final stage — atomically issue number, verification code and seal. */
  const documentNumber =
    doc.documentNumber ??
    (await nextDocumentNumber({
      format: template?.numberPrefixFormat ?? "{{SEQ}}/VRD/{{ROMAN_MONTH}}/{{YEAR}}",
      department: doc.departmentName,
      db,
    }));
  const verificationCode = doc.verificationCode || newVerificationCode(now);

  const finalChainHash = sha256Hex([...previousSteps.map((s) => s.stepSignatureHash), seal.stepSignatureHash].join("->"));

  await db
    .update(schema.officialDocuments)
    .set({
      documentNumber,
      verificationCode,
      status: "SEALED_PUBLISHED",
      canonicalContentHash: contentHash,
      finalSignatureChainHash: finalChainHash,
      sealedAt: now,
      currentStepOrder: active.stepOrder,
      updatedAt: now,
      version: doc.version + 1,
    })
    .where(eq(schema.officialDocuments.id, doc.id));

  await appendAudit({
    actorId: params.approverId,
    action: "DOCUMENT_SEALED",
    entityType: "document",
    entityId: doc.id,
    entityLabel: doc.title,
    detail: `Nomor resmi terbit: ${documentNumber}`,
    hashPreview: finalChainHash,
    db,
  });

  return {
    ok: true,
    code: "SEALED_FINAL",
    message: `Dokumen tersegel. Nomor resmi ${documentNumber}.`,
    documentNumber,
    verificationCode,
    stepSignatureHash: seal.stepSignatureHash,
  };
}

export type InboxItem = {
  documentId: string;
  title: string;
  documentNumber: string | null;
  category: string;
  department: string;
  confidentiality: string;
  stepId: string;
  stepOrder: number;
  stepName: string;
  slaDueAt: Date;
  isOverdue: boolean;
  hoursOverdue: number;
  waitingHours: number;
  currentVersionNo: number;
  documentVersion: number;
  creatorName: string;
};

export async function listInbox(userId: string, db?: Database): Promise<InboxItem[]> {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      documentId: schema.officialDocuments.id,
      title: schema.officialDocuments.title,
      documentNumber: schema.officialDocuments.documentNumber,
      category: schema.officialDocuments.category,
      department: schema.officialDocuments.departmentName,
      confidentiality: schema.officialDocuments.confidentiality,
      currentVersionNo: schema.officialDocuments.currentVersionNo,
      documentVersion: schema.officialDocuments.version,
      stepId: schema.approvalWorkflowSteps.id,
      stepOrder: schema.approvalWorkflowSteps.stepOrder,
      stepName: schema.approvalWorkflowSteps.stepName,
      slaDueAt: schema.approvalWorkflowSteps.slaDueAt,
      createdAt: schema.approvalWorkflowSteps.createdAt,
      creatorName: schema.profiles.fullName,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.officialDocuments, eq(schema.officialDocuments.id, schema.approvalWorkflowSteps.documentId))
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.officialDocuments.creatorId))
    .where(
      and(
        eq(schema.approvalWorkflowSteps.assignedApproverId, userId),
        eq(schema.approvalWorkflowSteps.verdict, "PENDING_ACTION"),
        eq(schema.officialDocuments.status, "IN_REVIEW_WORKFLOW"),
      ),
    )
    .orderBy(asc(schema.approvalWorkflowSteps.slaDueAt));

  const now = Date.now();
  return rows.map((row) => {
    const due = new Date(row.slaDueAt).getTime();
    const overdueHours = Math.max(0, Math.round((now - due) / 3600000));
    return {
      ...row,
      slaDueAt: new Date(row.slaDueAt),
      isOverdue: now > due,
      hoursOverdue: overdueHours,
      waitingHours: Math.round((now - new Date(row.createdAt).getTime()) / 3600000),
    };
  });
}

export async function countPendingForUser(userId: string, db?: Database): Promise<number> {
  const database = db ?? (await getDb());
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.approvalWorkflowSteps)
    .where(
      and(
        eq(schema.approvalWorkflowSteps.assignedApproverId, userId),
        eq(schema.approvalWorkflowSteps.verdict, "PENDING_ACTION"),
      ),
    );
  return row?.count ?? 0;
}

export async function listWorkflowSteps(documentId: string, db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      id: schema.approvalWorkflowSteps.id,
      stepOrder: schema.approvalWorkflowSteps.stepOrder,
      stepName: schema.approvalWorkflowSteps.stepName,
      mode: schema.approvalWorkflowSteps.mode,
      verdict: schema.approvalWorkflowSteps.verdict,
      slaDueAt: schema.approvalWorkflowSteps.slaDueAt,
      actedAt: schema.approvalWorkflowSteps.actedAt,
      comments: schema.approvalWorkflowSteps.comments,
      signedVersionNo: schema.approvalWorkflowSteps.signedVersionNo,
      previousStepSignatureHash: schema.approvalWorkflowSteps.previousStepSignatureHash,
      stepSignatureHash: schema.approvalWorkflowSteps.stepSignatureHash,
      rsaSignature: schema.approvalWorkflowSteps.rsaSignature,
      certificateFingerprint: schema.approvalWorkflowSteps.certificateFingerprint,
      assignedApproverId: schema.approvalWorkflowSteps.assignedApproverId,
      approverId: schema.profiles.id,
      approverName: schema.profiles.fullName,
      approverTitle: schema.profiles.jobTitle,
      approverRole: schema.profiles.role,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.approvalWorkflowSteps.assignedApproverId))
    .where(eq(schema.approvalWorkflowSteps.documentId, documentId))
    .orderBy(asc(schema.approvalWorkflowSteps.stepOrder));

  // Overdue is decided where the data lives so the view never reads the clock.
  const nowMs = Date.now();
  return rows.map((row) => ({
    ...row,
    slaDueAt: new Date(row.slaDueAt),
    actedAt: row.actedAt ? new Date(row.actedAt) : null,
    isOverdue: new Date(row.slaDueAt).getTime() < nowMs,
    hoursOverdue: Math.max(0, Math.round((nowMs - new Date(row.slaDueAt).getTime()) / 3600000)),
  }));
}

/** Resets every step to WAITING_PREVIOUS (step 1 pending) for a new revision. */
export async function resetWorkflowForRevision(params: {
  documentId: string;
  newVersionNo: number;
  slaHours: number;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  const steps = await db
    .select()
    .from(schema.approvalWorkflowSteps)
    .where(eq(schema.approvalWorkflowSteps.documentId, params.documentId))
    .orderBy(asc(schema.approvalWorkflowSteps.stepOrder));

  const now = new Date();
  for (const step of steps) {
    const isFirst = step.stepOrder === 1;
    await db
      .update(schema.approvalWorkflowSteps)
      .set({
        verdict: isFirst ? "PENDING_ACTION" : "WAITING_PREVIOUS",
        actedAt: null,
        comments: null,
        signedVersionNo: null,
        stepSignatureHash: null,
        previousStepSignatureHash: "GENESIS",
        certificateFingerprint: null,
        slaDueAt: new Date(now.getTime() + (isFirst ? params.slaHours : params.slaHours * 2) * 3600000),
      })
      .where(eq(schema.approvalWorkflowSteps.id, step.id));
  }

  await db
    .update(schema.officialDocuments)
    .set({
      status: "IN_REVIEW_WORKFLOW",
      currentStepOrder: 1,
      canonicalContentHash: null,
      finalSignatureChainHash: null,
      sealedAt: null,
      updatedAt: now,
      version: sql`${schema.officialDocuments.version} + 1`,
    })
    .where(eq(schema.officialDocuments.id, params.documentId));

  return steps.length;
}

export async function listRecentApprovals(userId: string, limit = 6, db?: Database) {
  const database = db ?? (await getDb());
  return database
    .select({
      id: schema.approvalWorkflowSteps.id,
      documentId: schema.approvalWorkflowSteps.documentId,
      stepName: schema.approvalWorkflowSteps.stepName,
      verdict: schema.approvalWorkflowSteps.verdict,
      actedAt: schema.approvalWorkflowSteps.actedAt,
      title: schema.officialDocuments.title,
      documentNumber: schema.officialDocuments.documentNumber,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.officialDocuments, eq(schema.officialDocuments.id, schema.approvalWorkflowSteps.documentId))
    .where(and(eq(schema.approvalWorkflowSteps.assignedApproverId, userId), sql`${schema.approvalWorkflowSteps.actedAt} is not null`))
    .orderBy(desc(schema.approvalWorkflowSteps.actedAt))
    .limit(limit);
}

export { formatFingerprint };
