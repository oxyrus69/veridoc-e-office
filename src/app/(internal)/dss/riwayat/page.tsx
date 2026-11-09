import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpenCheck } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import ActionForm from "@/components/ui/ActionForm";
import { listDecisionLogs } from "@/server/services/dssEngine";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { formatDateTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

const RULE_LABEL: Record<string, string> = {
  APPROVAL_SLA_BOTTLENECK: "Leher botol paraf",
  DOCUMENT_EXPIRY_RADAR: "Radar kedaluwarsa",
  OVERDUE_URGENT_DISPOSITION: "Disposisi terlambat",
  SIGNER_CERT_ROTATION_WARN: "Rotasi kunci",
};

const DECISION_LABEL: Record<string, string> = {
  PENDING: "Menunggu keputusan",
  ACCEPTED: "Diterima",
  DEFERRED: "Ditunda",
  DISMISSED: "Diabaikan",
};

export default async function DssHistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/dss")) redirect("/documents");

  const logs = await listDecisionLogs();
  const canDecide = ["SUPER_ADMIN", "AUDITOR_COMPLIANCE"].includes(user.r);
  const pending = logs.filter((l) => l.humanDecision === "PENDING");

  return (
    <>
      <PageHeader
        title="Riwayat Keputusan DSS"
        count={logs.length}
        description="Setiap temuan yang pernah muncul dicatat sebagai baris keputusan. DSS menyarankan; pejabat yang berwenang memutuskan dan keputusan itu menjadi bukti audit."
        actions={
          <Link href="/dss" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
            <ArrowLeft className="h-4 w-4" /> Ringkasan DSS
          </Link>
        }
      />

      <PageBody>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Total tercatat</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{logs.length}</p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50/50 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">Menunggu keputusan</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-amber-900">{pending.length}</p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-emerald-200 bg-emerald-50/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">Sudah diputuskan</p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-emerald-900">{logs.length - pending.length}</p>
          </div>
        </div>

        <SectionCard title="Ledger keputusan" subtitle="Dari yang terbaru" padded={false}>
          <ul className="divide-y divide-zinc-100">
            {[...logs].reverse().map((log) => (
              <li key={log.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone="neutral">{RULE_LABEL[log.ruleCode] ?? log.ruleCode}</Badge>
                      <Badge tone={log.severity === "CRITICAL" ? "danger" : log.severity === "WARNING" ? "warning" : "info"}>{log.severity}</Badge>
                      <Badge tone={log.humanDecision === "ACCEPTED" ? "success" : log.humanDecision === "PENDING" ? "warning" : "neutral"}>
                        {DECISION_LABEL[log.humanDecision] ?? log.humanDecision}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-[13px] font-medium text-zinc-900">{log.subjectLabel}</p>
                    <p className="mt-0.5 text-[12px] leading-5 text-zinc-600">{log.recommendation}</p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-400">
                      {log.impactValue} {log.impactUnit} · dicatat {formatDateTime(log.createdAt)}
                      {log.decidedAt ? ` · diputuskan ${formatDateTime(log.decidedAt)}` : ""}
                      {log.decidedByName ? ` oleh ${log.decidedByName}` : ""}
                    </p>
                  </div>

                  {canDecide && log.humanDecision === "PENDING" ? (
                    <div className="flex shrink-0 gap-1.5">
                      {(
                        [
                          ["ACCEPTED", "Terima", "bg-emerald-600 text-white hover:bg-emerald-700"],
                          ["DEFERRED", "Tunda", "border border-amber-300 bg-white text-amber-800 hover:bg-amber-50"],
                          ["DISMISSED", "Abaikan", "border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"],
                        ] as const
                      ).map(([decision, label, classes]) => (
                        <ActionForm key={decision} action="dss:decide">
                          <input type="hidden" name="logId" value={log.id} />
                          <input type="hidden" name="decision" value={decision} />
                          <input type="hidden" name="subjectType" value={log.subjectType} />
                          <button type="submit" className={`rounded-[var(--radius-sm)] px-2.5 py-1 text-[11px] font-medium ${classes}`}>
                            {label}
                          </button>
                        </ActionForm>
                      ))}
                    </div>
                  ) : null}

                  {!canDecide && log.humanDecision === "PENDING" ? (
                    <span className="shrink-0 text-[11px] text-zinc-400">menunggu admin/auditor</span>
                  ) : null}
                </div>
              </li>
            ))}
            {logs.length === 0 ? (
              <li className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <BookOpenCheck className="h-7 w-7 text-zinc-300" />
                <p className="text-sm text-zinc-500">
                  Belum ada temuan tercatat. Buka <Link href="/dss" className="font-medium text-[var(--accent-interactive)] hover:underline">ringkasan DSS</Link> untuk memicu pencatatan.
                </p>
              </li>
            ) : null}
          </ul>
        </SectionCard>
      </PageBody>
    </>
  );
}
