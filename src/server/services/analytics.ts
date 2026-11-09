import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import { daysBetween } from "@/lib/labels";

export type AnalyticsSnapshot = {
  totalDocuments: number;
  sealed: number;
  inReview: number;
  revisionRequested: number;
  revoked: number;
  expiringSoon: number;
  totalApprovalsSigned: number;
  avgSealCycleHours: number;
  scanTotal: number;
  scanValid: number;
  scanTampered: number;
  openDispositions: number;
  overdueDispositions: number;
  urgentOpen: number;
  throughput: { label: string; sealed: number; created: number }[];
  byCategory: { category: string; count: number }[];
  byStatus: { status: string; count: number }[];
  slaCompliancePct: number;
};

export async function getAnalytics(db?: Database): Promise<AnalyticsSnapshot> {
  const database = db ?? (await getDb());
  const now = new Date();

  const documents = await database
    .select({
      id: schema.officialDocuments.id,
      status: schema.officialDocuments.status,
      category: schema.officialDocuments.category,
      createdAt: schema.officialDocuments.createdAt,
      sealedAt: schema.officialDocuments.sealedAt,
      effectiveUntil: schema.officialDocuments.effectiveUntil,
    })
    .from(schema.officialDocuments);

  const steps = await database
    .select({
      verdict: schema.approvalWorkflowSteps.verdict,
      slaDueAt: schema.approvalWorkflowSteps.slaDueAt,
      actedAt: schema.approvalWorkflowSteps.actedAt,
      createdAt: schema.approvalWorkflowSteps.createdAt,
      createdAtDoc: schema.officialDocuments.createdAt,
      sealedAtDoc: schema.officialDocuments.sealedAt,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.officialDocuments, eq(schema.officialDocuments.id, schema.approvalWorkflowSteps.documentId));

  const scans = await database.select({ result: schema.verificationScanLogs.result }).from(schema.verificationScanLogs);

  const dispositions = await database
    .select({
      isCompleted: schema.dispositionChains.isCompleted,
      dueDate: schema.dispositionChains.dueDate,
      urgency: schema.incomingCorrespondences.urgency,
    })
    .from(schema.dispositionChains)
    .innerJoin(schema.incomingCorrespondences, eq(schema.incomingCorrespondences.id, schema.dispositionChains.correspondenceId));

  const sealedDocs = documents.filter((d) => d.status === "SEALED_PUBLISHED");
  const cycleHours = sealedDocs
    .filter((d) => d.sealedAt)
    .map((d) => (new Date(d.sealedAt as Date).getTime() - new Date(d.createdAt).getTime()) / 3600000);
  const avgSealCycleHours = cycleHours.length ? Math.round(cycleHours.reduce((a, b) => a + b, 0) / cycleHours.length) : 0;

  const actedSteps = steps.filter((s) => s.actedAt);
  const onTime = actedSteps.filter((s) => new Date(s.actedAt as Date) <= new Date(s.slaDueAt));
  const slaCompliancePct = actedSteps.length ? Math.round((onTime.length / actedSteps.length) * 100) : 100;

  const todayIso = now.toISOString().slice(0, 10);
  const expiringSoon = sealedDocs.filter((d) => {
    if (!d.effectiveUntil) return false;
    const remaining = daysBetween(now, `${d.effectiveUntil}T00:00:00.000Z`);
    return remaining >= 0 && remaining <= 30;
  }).length;

  const openDispositions = dispositions.filter((d) => !d.isCompleted);
  const overdueDispositions = openDispositions.filter((d) => String(d.dueDate) < todayIso);
  const urgentOpen = openDispositions.filter((d) => d.urgency === "URGENT_IMMEDIATE");

  // 6-month throughput series.
  const months: { label: string; sealed: number; created: number }[] = [];
  for (let offset = 5; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    const label = new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
    const inMonth = (value: Date | string | null) => {
      if (!value) return false;
      const x = new Date(value);
      return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth();
    };
    months.push({
      label,
      sealed: documents.filter((doc) => inMonth(doc.sealedAt)).length,
      created: documents.filter((doc) => inMonth(doc.createdAt)).length,
    });
  }

  const categoryMap = new Map<string, number>();
  for (const doc of documents) categoryMap.set(doc.category, (categoryMap.get(doc.category) ?? 0) + 1);

  const statusMap = new Map<string, number>();
  for (const doc of documents) statusMap.set(doc.status, (statusMap.get(doc.status) ?? 0) + 1);

  return {
    totalDocuments: documents.length,
    sealed: sealedDocs.length,
    inReview: documents.filter((d) => d.status === "IN_REVIEW_WORKFLOW").length,
    revisionRequested: documents.filter((d) => d.status === "REVISION_REQUESTED").length,
    revoked: documents.filter((d) => d.status === "REVOKED_INVALIDATED").length,
    expiringSoon,
    totalApprovalsSigned: steps.filter((s) => s.verdict === "APPROVED_SIGNED").length,
    avgSealCycleHours,
    scanTotal: scans.length,
    scanValid: scans.filter((s) => s.result === "VALID").length,
    scanTampered: scans.filter((s) => s.result === "TAMPERED").length,
    openDispositions: openDispositions.length,
    overdueDispositions: overdueDispositions.length,
    urgentOpen: urgentOpen.length,
    throughput: months,
    byCategory: Array.from(categoryMap, ([category, count]) => ({ category, count })),
    byStatus: Array.from(statusMap, ([status, count]) => ({ status, count })),
    slaCompliancePct,
  };
}

export async function listRecentActivity(limit = 8, db?: Database) {
  const database = db ?? (await getDb());
  return database
    .select({
      id: schema.auditLogs.id,
      action: schema.auditLogs.action,
      actorName: schema.profiles.fullName,
      actorRole: schema.profiles.role,
      entityLabel: schema.auditLogs.entityLabel,
      detail: schema.auditLogs.detail,
      createdAt: schema.auditLogs.createdAt,
    })
    .from(schema.auditLogs)
    .leftJoin(schema.profiles, eq(schema.profiles.id, schema.auditLogs.actorId))
    .orderBy(desc(schema.auditLogs.createdAt))
    .limit(limit);
}

export async function listPriorityQueue(limit = 6, db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      id: schema.officialDocuments.id,
      title: schema.officialDocuments.title,
      documentNumber: schema.officialDocuments.documentNumber,
      status: schema.officialDocuments.status,
      category: schema.officialDocuments.category,
      stepName: schema.approvalWorkflowSteps.stepName,
      slaDueAt: schema.approvalWorkflowSteps.slaDueAt,
      approverName: schema.profiles.fullName,
      updatedAt: schema.officialDocuments.updatedAt,
    })
    .from(schema.approvalWorkflowSteps)
    .innerJoin(schema.officialDocuments, eq(schema.officialDocuments.id, schema.approvalWorkflowSteps.documentId))
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.approvalWorkflowSteps.assignedApproverId))
    .where(and(eq(schema.approvalWorkflowSteps.verdict, "PENDING_ACTION"), eq(schema.officialDocuments.status, "IN_REVIEW_WORKFLOW")))
    .orderBy(schema.approvalWorkflowSteps.slaDueAt)
    .limit(limit);

  // Overdue is decided where the data lives, so the view never reads the clock.
  const nowMs = Date.now();
  return rows.map((row) => ({
    ...row,
    slaDueAt: new Date(row.slaDueAt),
    updatedAt: new Date(row.updatedAt),
    isOverdue: new Date(row.slaDueAt).getTime() < nowMs,
  }));
}

export async function countScansSince(days: number, db?: Database) {
  const database = db ?? (await getDb());
  const since = new Date(Date.now() - days * 86400000);
  const [row] = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.verificationScanLogs)
    .where(gte(schema.verificationScanLogs.scannedAt, since));
  return row?.count ?? 0;
}
