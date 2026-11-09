import { and, desc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import { verifyAndDetectTamperingPure } from "@/lib/cryptoMath";
import type { ApprovalStep } from "@/server/db/schema";
import { auditChain } from "./approvalEngine";
import { verifyChainHashSignature } from "./cryptoSealEngine";

export type VerificationOutcome = {
  found: boolean;
  verificationCode: string;
  status: "VALID_SEALED" | "TAMPERED_MODIFIED" | "REVOKED" | "NOT_FOUND" | "IN_REVIEW" | "EXPIRED";
  scanResult: "VALID" | "TAMPERED" | "REVOKED" | "NOT_FOUND";
  headline: string;
  explanation: string;
  document: {
    id: string;
    title: string;
    documentNumber: string | null;
    category: string;
    departmentName: string;
    confidentiality: string;
    effectiveFrom: string;
    effectiveUntil: string | null;
    sealedAt: Date | null;
    revokedAt: Date | null;
    revocationReason: string | null;
    verificationCode: string;
    canonicalContentHash: string | null;
    finalSignatureChainHash: string | null;
    creatorName: string;
    creatorTitle: string;
    currentVersionNo: number;
    status: string;
  } | null;
  signers: {
    stepOrder: number;
    stepName: string;
    approverName: string;
    approverTitle: string;
    actedAt: Date | null;
    stepSignatureHash: string | null;
    previousStepSignatureHash: string;
    certificateFingerprint: string | null;
    verdict: string;
    rsaVerified: boolean;
  }[];
  chain: { valid: boolean; issues: string[]; tailHash: string };
  bodyText: string | null;
  variables: Record<string, unknown>;
};

/**
 * Public verification. Recomputes the stored chain from scratch and compares
 * it with the sealed hashes; any mismatch is reported as TAMPERED_MODIFIED.
 */
export async function verifyByCode(codeInput: string, db?: Database): Promise<VerificationOutcome> {
  const database = db ?? (await getDb());
  const code = codeInput.trim().toUpperCase();

  const [row] = await database
    .select({
      id: schema.officialDocuments.id,
      title: schema.officialDocuments.title,
      documentNumber: schema.officialDocuments.documentNumber,
      verificationCode: schema.officialDocuments.verificationCode,
      category: schema.officialDocuments.category,
      status: schema.officialDocuments.status,
      confidentiality: schema.officialDocuments.confidentiality,
      departmentName: schema.officialDocuments.departmentName,
      effectiveFrom: schema.officialDocuments.effectiveFrom,
      effectiveUntil: schema.officialDocuments.effectiveUntil,
      sealedAt: schema.officialDocuments.sealedAt,
      revokedAt: schema.officialDocuments.revokedAt,
      revocationReason: schema.officialDocuments.revocationReason,
      canonicalContentHash: schema.officialDocuments.canonicalContentHash,
      finalSignatureChainHash: schema.officialDocuments.finalSignatureChainHash,
      currentVersionNo: schema.officialDocuments.currentVersionNo,
      creatorName: schema.profiles.fullName,
      creatorTitle: schema.profiles.jobTitle,
    })
    .from(schema.officialDocuments)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.officialDocuments.creatorId))
    .where(eq(schema.officialDocuments.verificationCode, code))
    .limit(1);

  if (!row) {
    return {
      found: false,
      verificationCode: code,
      status: "NOT_FOUND",
      scanResult: "NOT_FOUND",
      headline: "Kode verifikasi tidak terdaftar",
      explanation:
        "Tidak ada dokumen dengan kode ini di basis data VeriDoc. Periksa kembali karakter pada QR, atau hubungi sekretariat penerbit naskah.",
      document: null,
      signers: [],
      chain: { valid: false, issues: ["Dokumen tidak ditemukan"], tailHash: "" },
      bodyText: null,
      variables: {},
    };
  }

  const [version] = await database
    .select()
    .from(schema.documentVersions)
    .where(
      and(
        eq(schema.documentVersions.documentId, row.id),
        eq(schema.documentVersions.versionNo, row.currentVersionNo),
      ),
    )
    .limit(1);

  const steps = await database
    .select({
      stepOrder: schema.approvalWorkflowSteps.stepOrder,
      stepName: schema.approvalWorkflowSteps.stepName,
      verdict: schema.approvalWorkflowSteps.verdict,
      actedAt: schema.approvalWorkflowSteps.actedAt,
      previousStepSignatureHash: schema.approvalWorkflowSteps.previousStepSignatureHash,
      stepSignatureHash: schema.approvalWorkflowSteps.stepSignatureHash,
      rsaSignature: schema.approvalWorkflowSteps.rsaSignature,
      certificateFingerprint: schema.approvalWorkflowSteps.certificateFingerprint,
      assignedApproverId: schema.approvalWorkflowSteps.assignedApproverId,
      approverName: schema.profiles.fullName,
      approverTitle: schema.profiles.jobTitle,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.approvalWorkflowSteps.assignedApproverId))
    .where(eq(schema.approvalWorkflowSteps.documentId, row.id))
    .orderBy(schema.approvalWorkflowSteps.stepOrder);

  const certificates = await database
    .select({
      fingerprint: schema.signerCertificates.keyFingerprint,
      publicKeyPem: schema.signerCertificates.publicKeyPem,
    })
    .from(schema.signerCertificates);
  const publicKeys = new Map(certificates.map((c) => [c.fingerprint, c.publicKeyPem]));

  const signers = steps.map((s) => ({
    stepOrder: s.stepOrder,
    stepName: s.stepName,
    approverName: s.approverName,
    approverTitle: s.approverTitle,
    actedAt: s.actedAt ? new Date(s.actedAt) : null,
    stepSignatureHash: s.stepSignatureHash,
    previousStepSignatureHash: s.previousStepSignatureHash,
    certificateFingerprint: s.certificateFingerprint,
    verdict: s.verdict,
    rsaVerified: s.certificateFingerprint && s.rsaSignature && publicKeys.get(s.certificateFingerprint)
      ? verifyChainHashSignature(publicKeys.get(s.certificateFingerprint) as string, s.stepSignatureHash ?? "", s.rsaSignature)
      : false,
  }));

  const chain = auditChain({
    steps: steps.map((s) => ({
      stepOrder: s.stepOrder,
      previousStepSignatureHash: s.previousStepSignatureHash,
      stepSignatureHash: s.stepSignatureHash,
      rsaSignature: s.rsaSignature,
      assignedApproverId: s.assignedApproverId,
      actedAt: s.actedAt ? new Date(s.actedAt) : null,
      verdict: s.verdict,
      certificateFingerprint: s.certificateFingerprint,
    })),
    contentHash: version?.contentSha256 ?? "",
    publicKeys,
    sealed: row.status === "SEALED_PUBLISHED" || row.status === "REVOKED_INVALIDATED" || row.status === "EXPIRED",
  });

  const document = {
    id: row.id,
    title: row.title,
    documentNumber: row.documentNumber,
    category: row.category,
    departmentName: row.departmentName,
    confidentiality: row.confidentiality,
    effectiveFrom: String(row.effectiveFrom),
    effectiveUntil: row.effectiveUntil ? String(row.effectiveUntil) : null,
    sealedAt: row.sealedAt ? new Date(row.sealedAt) : null,
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : null,
    revocationReason: row.revocationReason,
    verificationCode: row.verificationCode,
    canonicalContentHash: row.canonicalContentHash,
    finalSignatureChainHash: row.finalSignatureChainHash,
    creatorName: row.creatorName,
    creatorTitle: row.creatorTitle,
    currentVersionNo: row.currentVersionNo,
    status: row.status,
  };

  // Content hash must match the sealed one; otherwise someone edited the body.
  const contentMatches = Boolean(version && row.canonicalContentHash && version.contentSha256 === row.canonicalContentHash);

  if (row.status === "REVOKED_INVALIDATED") {
    return {
      found: true,
      verificationCode: code,
      status: "REVOKED",
      scanResult: "REVOKED",
      headline: "Dokumen telah dicabut",
      explanation: `Penerbit mencabut keabsahan naskah ini${row.revocationReason ? `: ${row.revocationReason}` : "."} Dokumen yang beredar dalam bentuk cetak/salinan tidak lagi berlaku.`,
      document,
      signers,
      chain,
      bodyText: version?.renderedBodyText ?? null,
      variables: (version?.variablesPayloadJson as Record<string, unknown>) ?? {},
    };
  }

  if (row.status === "EXPIRED") {
    return {
      found: true,
      verificationCode: code,
      status: "EXPIRED",
      scanResult: "REVOKED",
      headline: "Masa berlaku telah berakhir",
      explanation: "Segel kriptografis masih utuh, namun masa berlaku naskah sudah lewat. Ajukan perpanjangan ke unit penerbit.",
      document,
      signers,
      chain,
      bodyText: version?.renderedBodyText ?? null,
      variables: (version?.variablesPayloadJson as Record<string, unknown>) ?? {},
    };
  }

  if (row.status !== "SEALED_PUBLISHED") {
    return {
      found: true,
      verificationCode: code,
      status: "IN_REVIEW",
      scanResult: "NOT_FOUND",
      headline: "Dokumen belum tersegel",
      explanation: "Naskah ini masih dalam proses persetujuan sehingga belum memiliki segel final yang dapat diverifikasi publik.",
      document,
      signers,
      chain,
      bodyText: version?.renderedBodyText ?? null,
      variables: (version?.variablesPayloadJson as Record<string, unknown>) ?? {},
    };
  }

  if (!contentMatches || !chain.valid) {
    return {
      found: true,
      verificationCode: code,
      status: "TAMPERED_MODIFIED",
      scanResult: "TAMPERED",
      headline: "Peringatan kritis: integritas dokumen rusak",
      explanation:
        "Hash isi yang tersimpan tidak sama dengan hash yang tersegel. Isi naskah telah diubah setelah penandatanganan, sehingga tanda tangan digital tidak cocok.",
      document,
      signers,
      chain,
      bodyText: version?.renderedBodyText ?? null,
      variables: (version?.variablesPayloadJson as Record<string, unknown>) ?? {},
    };
  }

  return {
    found: true,
      verificationCode: code,
    status: "VALID_SEALED",
    scanResult: "VALID",
    headline: "Dokumen asli dan tersegel",
    explanation: "Rantai tanda tangan utuh dan hash isi cocok dengan segel yang tersimpan pada saat pengesahan.",
    document,
    signers,
    chain,
    bodyText: version?.renderedBodyText ?? null,
    variables: (version?.variablesPayloadJson as Record<string, unknown>) ?? {},
  };
}

export async function logScan(params: {
  verificationCode: string;
  documentId: string | null;
  result: "VALID" | "TAMPERED" | "REVOKED" | "NOT_FOUND";
  summary: string;
  userAgent?: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  await db.insert(schema.verificationScanLogs).values({
    verificationCode: params.verificationCode,
    documentId: params.documentId,
    result: params.result,
    summary: params.summary,
    userAgent: (params.userAgent ?? "").slice(0, 240),
  });
}

export async function listRecentScans(limit = 20, db?: Database) {
  const database = db ?? (await getDb());
  return database
    .select({
      id: schema.verificationScanLogs.id,
      verificationCode: schema.verificationScanLogs.verificationCode,
      documentTitle: schema.officialDocuments.title,
      result: schema.verificationScanLogs.result,
      summary: schema.verificationScanLogs.summary,
      scannedAt: schema.verificationScanLogs.scannedAt,
    })
    .from(schema.verificationScanLogs)
    .leftJoin(schema.officialDocuments, eq(schema.officialDocuments.id, schema.verificationScanLogs.documentId))
    .orderBy(desc(schema.verificationScanLogs.scannedAt))
    .limit(limit);
}

export async function scanStats(db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database.select({ result: schema.verificationScanLogs.result }).from(schema.verificationScanLogs);
  const total = rows.length;
  const valid = rows.filter((r) => r.result === "VALID").length;
  const tampered = rows.filter((r) => r.result === "TAMPERED").length;
  const revoked = rows.filter((r) => r.result === "REVOKED").length;
  const notFound = rows.filter((r) => r.result === "NOT_FOUND").length;
  return { total, valid, tampered, revoked, notFound };
}

/** Re-exports for the public Tamper Lab (browser-safe). */
export function runTamperLab(params: { originalText: string; modifiedText: string; originalHash: string }) {
  return verifyAndDetectTamperingPure(params);
}

export type StepRow = ApprovalStep;
