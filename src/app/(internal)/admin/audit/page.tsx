import { redirect } from "next/navigation";
import { ClipboardList, Fingerprint } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { listAuditLogs, countAuditLogs } from "@/server/services/audit";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { ROLE_LABEL, formatDateTime, shortHash } from "@/lib/labels";
import type { UserRole } from "@/server/db/schema";

export const dynamic = "force-dynamic";

const ACTION_TONE: Record<string, "success" | "warning" | "danger" | "info" | "neutral" | "seal"> = {
  DOCUMENT_SEALED: "seal",
  APPROVAL_SIGNED: "success",
  APPROVAL_REJECTED: "warning",
  DOCUMENT_REVOKED: "danger",
  DOCUMENT_SUBMITTED: "info",
  DOCUMENT_CREATED: "neutral",
  VERSION_UPLOADED: "info",
  DSS_DECISION: "neutral",
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/admin/audit")) redirect("/documents");

  const { action } = await searchParams;
  const [logs, total] = await Promise.all([listAuditLogs(200), countAuditLogs()]);
  const filtered = action ? logs.filter((l) => l.action === action) : logs;
  const actions = Array.from(new Set(logs.map((l) => l.action))).sort();

  return (
    <>
      <PageHeader
        title="Jejak Audit"
        count={total}
        description="Log append-only untuk setiap aksi: siapa, kapan, pada entitas apa, dengan cuplikan hash bila menyangkut segel. Auditor hanya dapat membaca."
      />

      <PageBody>
        <div className="mb-3 flex flex-wrap items-center gap-1">
          <a
            href="/admin/audit"
            className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[12px] font-medium ${!action ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            Semua ({logs.length})
          </a>
          {actions.map((item) => (
            <a
              key={item}
              href={`/admin/audit?action=${item}`}
              className={`rounded-[var(--radius-sm)] px-2.5 py-1 font-mono text-[11px] font-medium ${action === item ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {item}
            </a>
          ))}
        </div>

        <SectionCard title="Aliran peristiwa" subtitle="200 peristiwa terakhir" padded={false}>
          <ol className="divide-y divide-zinc-100">
            {filtered.map((log) => (
              <li key={log.id} className="flex flex-wrap items-start gap-3 px-4 py-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100">
                  <ClipboardList className="h-3 w-3 text-zinc-500" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={ACTION_TONE[log.action] ?? "neutral"} mono>
                      {log.action}
                    </Badge>
                    <span className="text-[11px] text-zinc-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium text-zinc-900">{log.entityLabel || log.entityType}</p>
                  {log.detail ? <p className="mt-0.5 text-[12px] leading-5 text-zinc-600">{log.detail}</p> : null}
                  {log.hashPreview ? (
                    <p className="mt-0.5 flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                      <Fingerprint className="h-3 w-3" /> {shortHash(log.hashPreview, 20, 8)}
                    </p>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] font-medium text-zinc-700">{log.actorName ?? "Sistem"}</p>
                  <p className="text-[10px] text-zinc-400">{log.actorRole ? ROLE_LABEL[log.actorRole as UserRole] ?? log.actorRole : "—"}</p>
                </div>
              </li>
            ))}
            {filtered.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-zinc-500">Belum ada peristiwa untuk filter ini.</li>
            ) : null}
          </ol>
        </SectionCard>
      </PageBody>
    </>
  );
}
