import { and, eq, isNotNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import { daysBetween } from "@/lib/labels";

export type DssSeverity = "CRITICAL" | "WARNING" | "INFO";

export type DssFinding = {
  code:
    | "APPROVAL_SLA_BOTTLENECK"
    | "DOCUMENT_EXPIRY_RADAR"
    | "OVERDUE_URGENT_DISPOSITION"
    | "SIGNER_CERT_ROTATION_WARN";
  severity: DssSeverity;
  title: string;
  subjectLabel: string;
  subjectId: string;
  subjectType: "approver" | "document" | "correspondence" | "certificate";
  fact: string;
  impactLabel: string;
  impactValue: number;
  impactUnit: string;
  recommendation: string;
  href: string;
  actionLabel: string;
};

export type DssReport = {
  findings: DssFinding[];
  counts: Record<DssFinding["code"], number>;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  health: { healthy: number; warning: number; critical: number };
  generatedAt: Date;
};

const APPROVAL_CODE = "APPROVAL_SLA_BOTTLENECK";
const EXPIRY_CODE = "DOCUMENT_EXPIRY_RADAR";
const DISPOSITION_CODE = "OVERDUE_URGENT_DISPOSITION";
const CERT_CODE = "SIGNER_CERT_ROTATION_WARN";

/** Runs every governance rule directly from SQL on each page load. */
export async function computeDss(db?: Database): Promise<DssReport> {
  const database = db ?? (await getDb());
  const now = new Date();
  const findings: DssFinding[] = [];

  /* 1 — Approval SLA bottleneck per approver. */
  const pending = await database
    .select({
      approverId: schema.approvalWorkflowSteps.assignedApproverId,
      approverName: schema.profiles.fullName,
      approverTitle: schema.profiles.jobTitle,
      slaDueAt: schema.approvalWorkflowSteps.slaDueAt,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.approvalWorkflowSteps.assignedApproverId))
    .innerJoin(schema.officialDocuments, eq(schema.officialDocuments.id, schema.approvalWorkflowSteps.documentId))
    .where(
      and(
        eq(schema.approvalWorkflowSteps.verdict, "PENDING_ACTION"),
        eq(schema.officialDocuments.status, "IN_REVIEW_WORKFLOW"),
      ),
    );

  const byApprover = new Map<string, { name: string; title: string; overdue: number; total: number; overdueHours: number }>();
  for (const row of pending) {
    const entry =
      byApprover.get(row.approverId) ??
      { name: row.approverName, title: row.approverTitle, overdue: 0, total: 0, overdueHours: 0 };
    entry.total += 1;
    const overdueHours = Math.round((now.getTime() - new Date(row.slaDueAt).getTime()) / 3600000);
    if (overdueHours > 0) {
      entry.overdue += 1;
      entry.overdueHours = Math.max(entry.overdueHours, overdueHours);
    }
    byApprover.set(row.approverId, entry);
  }

  for (const [approverId, entry] of byApprover) {
    if (entry.overdue === 0) continue;
    findings.push({
      code: APPROVAL_CODE,
      severity: entry.overdueHours >= 48 ? "CRITICAL" : "WARNING",
      title: "Antrean persetujuan melewati SLA",
      subjectLabel: entry.name,
      subjectId: approverId,
      subjectType: "approver",
      fact: `${entry.overdue} dari ${entry.total} dokumen menunggu paraf; terlama ${entry.overdueHours} jam lewat tenggat.`,
      impactLabel: "Keterlambatan maksimum",
      impactValue: entry.overdueHours,
      impactUnit: "jam",
      recommendation: "Delegasikan wewenang sementara (acting approver) atau kirim pengingat eskalasi ke atasan langsung.",
      href: "/dss/bottlenecks",
      actionLabel: "Buka analisis",
    });
  }

  /* 2 — Expiry radar: sealed documents expiring within 30 days. */
  const sealed = await database
    .select({
      id: schema.officialDocuments.id,
      title: schema.officialDocuments.title,
      number: schema.officialDocuments.documentNumber,
      effectiveUntil: schema.officialDocuments.effectiveUntil,
      category: schema.officialDocuments.category,
    })
    .from(schema.officialDocuments)
    .where(and(eq(schema.officialDocuments.status, "SEALED_PUBLISHED"), isNotNull(schema.officialDocuments.effectiveUntil)));

  for (const doc of sealed) {
    if (!doc.effectiveUntil) continue;
    const remaining = daysBetween(now, `${doc.effectiveUntil}T00:00:00.000Z`);
    if (remaining > 30) continue;
    findings.push({
      code: EXPIRY_CODE,
      severity: remaining <= 7 ? "CRITICAL" : "WARNING",
      title: remaining < 0 ? "Naskah sudah melewati masa berlaku" : "Naskah mendekati kedaluwarsa",
      subjectLabel: doc.title,
      subjectId: doc.id,
      subjectType: "document",
      fact: `${doc.number ?? "Tanpa nomor"} berlaku sampai ${doc.effectiveUntil}; sisa ${remaining} hari.`,
      impactLabel: "Sisa masa berlaku",
      impactValue: remaining,
      impactUnit: "hari",
      recommendation: "Siapkan draf perpanjangan sekarang agar tidak ada jeda legalitas operasional.",
      href: "/dss/expiry-radar",
      actionLabel: "Siapkan perpanjangan",
    });
  }

  /* 3 — Overdue urgent dispositions. */
  const urgentNodes = await database
    .select({
      nodeId: schema.dispositionChains.id,
      dueDate: schema.dispositionChains.dueDate,
      instruction: schema.dispositionChains.instruction,
      targetUnit: schema.dispositionChains.targetUnit,
      correspondenceId: schema.incomingCorrespondences.id,
      agendaNumber: schema.incomingCorrespondences.agendaNumber,
      subject: schema.incomingCorrespondences.subject,
      urgency: schema.incomingCorrespondences.urgency,
    })
    .from(schema.dispositionChains)
    .innerJoin(schema.incomingCorrespondences, eq(schema.incomingCorrespondences.id, schema.dispositionChains.correspondenceId))
    .where(and(eq(schema.dispositionChains.isCompleted, false), eq(schema.incomingCorrespondences.urgency, "URGENT_IMMEDIATE")));

  const todayIso = now.toISOString().slice(0, 10);
  for (const node of urgentNodes) {
    if (String(node.dueDate) >= todayIso) continue;
    const overdueDays = daysBetween(`${node.dueDate}T00:00:00.000Z`, now);
    findings.push({
      code: DISPOSITION_CODE,
      severity: overdueDays >= 3 ? "CRITICAL" : "WARNING",
      title: "Disposisi mendesak belum dituntaskan",
      subjectLabel: `${node.agendaNumber} — ${node.subject}`,
      subjectId: node.correspondenceId,
      subjectType: "correspondence",
      fact: `Instruksi "${node.instruction}" ke ${node.targetUnit || "unit pelaksana"} lewat ${overdueDays} hari dari tenggat.`,
      impactLabel: "Keterlambatan",
      impactValue: overdueDays,
      impactUnit: "hari",
      recommendation: "Hubungi unit pelaksana hari ini dan minta bukti penyelesaian tertulis.",
      href: `/dispositions/${node.correspondenceId}`,
      actionLabel: "Buka lembar disposisi",
    });
  }

  /* 4 — Signer certificate rotation. */
  const certs = await database
    .select({
      id: schema.signerCertificates.id,
      fingerprint: schema.signerCertificates.keyFingerprint,
      expiresAt: schema.signerCertificates.expiresAt,
      lastRotatedAt: schema.signerCertificates.lastRotatedAt,
      status: schema.signerCertificates.status,
      name: schema.profiles.fullName,
      title: schema.profiles.jobTitle,
    })
    .from(schema.signerCertificates)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.signerCertificates.userId))
    .where(eq(schema.signerCertificates.status, "ACTIVE"));

  for (const cert of certs) {
    const daysToExpiry = daysBetween(now, new Date(cert.expiresAt));
    const daysSinceRotation = daysBetween(new Date(cert.lastRotatedAt), now);
    if (daysToExpiry > 60 && daysSinceRotation <= 180) continue;
    findings.push({
      code: CERT_CODE,
      severity: daysToExpiry <= 30 ? "CRITICAL" : "WARNING",
      title: "Kunci penandatangan perlu rotasi",
      subjectLabel: `${cert.name} — ${cert.title}`,
      subjectId: cert.id,
      subjectType: "certificate",
      fact: `Sertifikat berlaku ${daysToExpiry} hari lagi; terakhir dirotasi ${daysSinceRotation} hari lalu.`,
      impactLabel: "Sisa masa sertifikat",
      impactValue: daysToExpiry,
      impactUnit: "hari",
      recommendation: "Terbitkan kunci baru dari halaman Sertifikat agar tanda tangan tetap sah setelah masa berlaku habis.",
      href: "/certificates",
      actionLabel: "Rotasi kunci",
    });
  }

  const counts = {
    [APPROVAL_CODE]: findings.filter((f) => f.code === APPROVAL_CODE).length,
    [EXPIRY_CODE]: findings.filter((f) => f.code === EXPIRY_CODE).length,
    [DISPOSITION_CODE]: findings.filter((f) => f.code === DISPOSITION_CODE).length,
    [CERT_CODE]: findings.filter((f) => f.code === CERT_CODE).length,
  } as Record<DssFinding["code"], number>;

  const criticalCount = findings.filter((f) => f.severity === "CRITICAL").length;
  const warningCount = findings.filter((f) => f.severity === "WARNING").length;
  const infoCount = findings.length - criticalCount - warningCount;

  const total = Math.max(findings.length, 1);
  const health = {
    healthy: Math.round(((infoCount + 0) / total) * 100),
    warning: Math.round((warningCount / total) * 100),
    critical: Math.round((criticalCount / total) * 100),
  };

  return {
    findings: findings.sort((a, b) => {
      const rank = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      return rank[a.severity] - rank[b.severity];
    }),
    counts,
    criticalCount,
    warningCount,
    infoCount,
    health,
    generatedAt: now,
  };
}

/** Persists the current findings so `/dss/riwayat` has a real decision ledger. */
export async function persistDssDecisions(report: DssReport, db?: Database) {
  const database = db ?? (await getDb());
  for (const finding of report.findings) {
    const [existing] = await database
      .select({ id: schema.decisionLogs.id, humanDecision: schema.decisionLogs.humanDecision, impactValue: schema.decisionLogs.impactValue })
      .from(schema.decisionLogs)
      .where(and(eq(schema.decisionLogs.ruleCode, finding.code), eq(schema.decisionLogs.subjectId, finding.subjectId)))
      .limit(1);

    if (existing) {
      if (existing.impactValue !== finding.impactValue) {
        await database
          .update(schema.decisionLogs)
          .set({ impactValue: finding.impactValue, recommendation: finding.recommendation, severity: finding.severity })
          .where(eq(schema.decisionLogs.id, existing.id));
      }
      continue;
    }

    await database.insert(schema.decisionLogs).values({
      ruleCode: finding.code,
      subjectType: finding.subjectType,
      subjectId: finding.subjectId,
      subjectLabel: finding.subjectLabel,
      recommendation: finding.recommendation,
      impactValue: finding.impactValue,
      impactUnit: finding.impactUnit,
      severity: finding.severity,
    });
  }
}

export async function listDecisionLogs(db?: Database) {
  const database = db ?? (await getDb());
  return database
    .select({
      id: schema.decisionLogs.id,
      ruleCode: schema.decisionLogs.ruleCode,
      subjectType: schema.decisionLogs.subjectType,
      subjectId: schema.decisionLogs.subjectId,
      subjectLabel: schema.decisionLogs.subjectLabel,
      recommendation: schema.decisionLogs.recommendation,
      impactValue: schema.decisionLogs.impactValue,
      impactUnit: schema.decisionLogs.impactUnit,
      severity: schema.decisionLogs.severity,
      humanDecision: schema.decisionLogs.humanDecision,
      decidedAt: schema.decisionLogs.decidedAt,
      decidedByName: schema.profiles.fullName,
      createdAt: schema.decisionLogs.createdAt,
    })
    .from(schema.decisionLogs)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.decisionLogs.decidedBy))
    .orderBy(schema.decisionLogs.createdAt);
}

export async function decideDecisionLog(params: {
  id: string;
  decision: "ACCEPTED" | "DEFERRED" | "DISMISSED";
  actorId: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  await db
    .update(schema.decisionLogs)
    .set({ humanDecision: params.decision, decidedBy: params.actorId, decidedAt: new Date() })
    .where(eq(schema.decisionLogs.id, params.id));
}

export async function approverWorkloads(db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      approverId: schema.profiles.id,
      name: schema.profiles.fullName,
      title: schema.profiles.jobTitle,
      role: schema.profiles.role,
      pending: sql<number>`count(*) filter (where ${schema.approvalWorkflowSteps.verdict} = 'PENDING_ACTION')::int`,
      signed: sql<number>`count(*) filter (where ${schema.approvalWorkflowSteps.verdict} = 'APPROVED_SIGNED')::int`,
      rejected: sql<number>`count(*) filter (where ${schema.approvalWorkflowSteps.verdict} = 'REJECTED_RETURNED')::int`,
      overdue: sql<number>`count(*) filter (where ${schema.approvalWorkflowSteps.verdict} = 'PENDING_ACTION' and ${schema.approvalWorkflowSteps.slaDueAt} < now())::int`,
      avgWaitHours: sql<number>`coalesce(round(avg(extract(epoch from (${schema.approvalWorkflowSteps.actedAt} - ${schema.approvalWorkflowSteps.createdAt})) / 3600) filter (where ${schema.approvalWorkflowSteps.actedAt} is not null))::int, 0)`,
    })
    .from(schema.profiles)
    .leftJoin(schema.approvalWorkflowSteps, eq(schema.approvalWorkflowSteps.assignedApproverId, schema.profiles.id))
    .groupBy(schema.profiles.id, schema.profiles.fullName, schema.profiles.jobTitle, schema.profiles.role)
    .orderBy(schema.profiles.fullName);
  return rows;
}
