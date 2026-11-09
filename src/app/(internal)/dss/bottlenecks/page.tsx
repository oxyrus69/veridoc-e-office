import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Timer, TrendingUp, UserRound } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { KpiStatCard } from "@/components/ui/KpiStatCard";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import EnterpriseDataGrid from "@/components/ui/EnterpriseDataGrid";
import { computeDss, approverWorkloads } from "@/server/services/dssEngine";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { ROLE_LABEL } from "@/lib/labels";
import type { UserRole } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function BottlenecksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/dss")) redirect("/documents");

  const [report, workloads] = await Promise.all([computeDss(), approverWorkloads()]);
  const findings = report.findings.filter((f) => f.code === "APPROVAL_SLA_BOTTLENECK");
  const totalOverdue = workloads.reduce((acc, w) => acc + Number(w.overdue), 0);
  const worst = workloads.reduce((acc, w) => Math.max(acc, Number(w.overdue)), 0);

  return (
    <>
      <PageHeader
        title="Leher Botol Persetujuan"
        count={findings.length}
        description="Pejabat dengan antrean paraf melewati tenggat. Data diambil dari jumlah tahap PENDING_ACTION dan selisih waktu terhadap sla_due_at."
        actions={
          <Link href="/dss" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
            <ArrowLeft className="h-4 w-4" /> Ringkasan DSS
          </Link>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiStatCard label="Pejabat terdampak" value={String(findings.length)} tone={findings.length ? "danger" : "success"} footer="Penyetuju dengan minimal satu paraf lewat tenggat" />
          <KpiStatCard label="Total paraf lewat" value={String(totalOverdue)} tone={totalOverdue ? "warning" : "success"} footer="Seluruh tahap yang melewati sla_due_at" />
          <KpiStatCard label="Antrean terburuk" value={String(worst)} tone={worst > 1 ? "danger" : "warning"} footer="Jumlah paraf terlambat pada satu pejabat" />
        </div>

        <div className="mt-4">
          <SectionCard title="Usulan tindakan" subtitle="Rekomendasi berbasis temuan mesin, bukan keputusan otomatis" padded={false}>
            <ul className="divide-y divide-zinc-100">
              {findings.map((finding) => (
                <li key={finding.subjectId} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-900">{finding.subjectLabel}</p>
                        <p className="mt-0.5 text-[12px] leading-5 text-zinc-600">{finding.fact}</p>
                      </div>
                    </div>
                    <Badge tone={finding.severity === "CRITICAL" ? "danger" : "warning"} mono>
                      {finding.impactValue} jam
                    </Badge>
                  </div>
                  <p className="mt-2 flex items-start gap-1.5 rounded-[var(--radius-sm)] bg-zinc-50 px-2.5 py-1.5 text-[11px] leading-4 text-zinc-600">
                    <TrendingUp className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" />
                    {finding.recommendation}
                  </p>
                </li>
              ))}
              {findings.length === 0 ? (
                <li className="px-4 py-8 text-center text-sm text-zinc-500">Tidak ada antrean yang melewati SLA.</li>
              ) : null}
            </ul>
          </SectionCard>
        </div>

        <div className="mt-4">
          <EnterpriseDataGrid
            title="Beban kerja seluruh pejabat"
            count={workloads.length}
            description="Pending = paraf menunggu; lewat = melewati SLA; rata-rata = jam sampai paraf ditandatangani"
            rows={workloads}
            rowKey={(w) => w.approverId}
            onRowClickHref={() => ""}
            columns={[
              {
                key: "name",
                header: "Pejabat",
                cell: (w) => (
                  <span className="block">
                    <span className="block text-[13px] font-medium text-zinc-900">{w.name}</span>
                    <span className="block text-[11px] text-zinc-500">{w.title || ROLE_LABEL[w.role as UserRole]}</span>
                  </span>
                ),
              },
              { key: "role", header: "Peran", cell: (w) => <span className="text-[12px] text-zinc-600">{ROLE_LABEL[w.role as UserRole]}</span> },
              { key: "pending", header: "Menunggu", align: "right", cell: (w) => <span className="font-mono text-[13px] tabular-nums text-zinc-900">{w.pending}</span> },
              {
                key: "overdue",
                header: "Lewat SLA",
                align: "right",
                cell: (w) => <Badge tone={Number(w.overdue) > 0 ? "danger" : "success"} mono>{w.overdue}</Badge>,
              },
              { key: "signed", header: "Sudah paraf", align: "right", cell: (w) => <span className="font-mono text-[12px] tabular-nums text-zinc-600">{w.signed}</span> },
              { key: "rejected", header: "Dikembalikan", align: "right", cell: (w) => <span className="font-mono text-[12px] tabular-nums text-zinc-600">{w.rejected}</span> },
              {
                key: "avg",
                header: "Rata-rata (jam)",
                align: "right",
                cell: (w) => (
                  <span className="inline-flex items-center gap-1 font-mono text-[12px] tabular-nums text-zinc-700">
                    <Timer className="h-3 w-3 text-zinc-400" />
                    {w.avgWaitHours}
                  </span>
                ),
              },
            ]}
          />
        </div>
      </PageBody>
    </>
  );
}
