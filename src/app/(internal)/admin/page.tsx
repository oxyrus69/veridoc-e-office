import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, ChevronRight, Clock3, Inbox, Radar, ShieldCheck } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { KpiStatCard } from "@/components/ui/KpiStatCard";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ui/ActionButton";
import { SectionCard, HealthBar } from "@/components/ui/Panel";
import { getAnalytics, listPriorityQueue, listRecentActivity } from "@/server/services/analytics";
import { computeDss, persistDssDecisions } from "@/server/services/dssEngine";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { CATEGORY_LABEL, relativeTime, formatNumber } from "@/lib/labels";
import type { DocumentCategory } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/admin")) redirect("/inbox");

  const [analytics, dss, queue, activity] = await Promise.all([
    getAnalytics(),
    computeDss(),
    listPriorityQueue(6),
    listRecentActivity(7),
  ]);
  await persistDssDecisions(dss).catch(() => undefined);

  const sparkline = analytics.throughput.map((t) => t.sealed);
  const criticalFindings = dss.findings.filter((f) => f.severity === "CRITICAL");
  const banner = criticalFindings[0];

  return (
    <>
      <PageHeader
        title="Dasbor Tata Kelola & Sekretariat"
        description={`Ringkasan naskah dinas, antrean paraf, dan rekomendasi DSS. ${dss.findings.length} temuan tata kelola aktif.`}
        actions={
          <>
            <ActionButton href="/documents" variant="secondary">
              Repositori naskah
            </ActionButton>
            <ActionButton href="/documents/compose" variant="primary">
              Susun dokumen
            </ActionButton>
          </>
        }
      />

      <PageBody>
        {banner ? (
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-lg)] border border-red-200 bg-red-50 px-4 py-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-red-900">
                  {criticalFindings.length} isu kritis menunggu keputusan
                </p>
                <p className="mt-0.5 truncate text-[12px] text-red-800">
                  {banner.title}: {banner.fact}
                </p>
              </div>
            </div>
            <Link
              href={banner.href}
              className="shrink-0 rounded-[var(--radius-md)] border border-red-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-red-900 hover:bg-red-100"
            >
              {banner.actionLabel}
            </Link>
          </div>
        ) : null}

        {/* Zone D1 — KPI strip */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiStatCard
            label="Naskah tersegel"
            value={formatNumber(analytics.sealed)}
            delta={{ value: `${analytics.totalApprovalsSigned} paraf`, tone: "flat", label: "Total paraf tersimpan" }}
            sparkline={sparkline}
            footer={`${analytics.totalDocuments} dokumen total • ${analytics.inReview} dalam persetujuan`}
          />
          <KpiStatCard
            label="Kepatuhan SLA paraf"
            value={`${analytics.slaCompliancePct}%`}
            tone={analytics.slaCompliancePct >= 90 ? "success" : analytics.slaCompliancePct >= 70 ? "warning" : "danger"}
            delta={{
              value: `${queue.filter((q) => q.isOverdue).length} lewat tenggat`,
              tone: queue.some((q) => q.isOverdue) ? "down" : "up",
            }}
            footer={`Rata-rata siklus segel ${analytics.avgSealCycleHours} jam`}
          />
          <KpiStatCard
            label="Temuan tata kelola"
            value={formatNumber(dss.findings.length)}
            tone={dss.criticalCount > 0 ? "danger" : dss.warningCount > 0 ? "warning" : "success"}
            delta={{ value: `${dss.criticalCount} kritis`, tone: dss.criticalCount > 0 ? "down" : "up" }}
            footer={`${dss.counts.DOCUMENT_EXPIRY_RADAR} naskah dalam radar kedaluwarsa`}
          />
          <KpiStatCard
            label="Pemindaian publik"
            value={formatNumber(analytics.scanTotal)}
            delta={{ value: `${analytics.scanTampered} tamper`, tone: analytics.scanTampered > 0 ? "down" : "up" }}
            footer={`${analytics.scanValid} valid dari portal /verify`}
          />
        </div>

        {/* Zone D2 + D3 */}
        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            <SectionCard
              title="Tren penerbitan naskah"
              subtitle="6 bulan terakhir — naskah tersegel versus draf dibuat"
              action={<Badge tone="neutral" mono>{analytics.throughput.reduce((a, b) => a + b.sealed, 0)} segel</Badge>}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <div className="flex h-32 items-end gap-2">
                    {analytics.throughput.map((month) => {
                      const max = Math.max(...analytics.throughput.map((m) => Math.max(m.sealed, m.created)), 1);
                      return (
                        <div key={month.label} className="flex flex-1 flex-col items-center gap-1">
                          <div className="flex h-24 w-full items-end justify-center gap-0.5">
                            <div
                              className="w-1/2 rounded-t-[2px] bg-zinc-300"
                              style={{ height: `${Math.max((month.created / max) * 100, 3)}%` }}
                              title={`${month.created} draf dibuat`}
                            />
                            <div
                              className="w-1/2 rounded-t-[2px] bg-emerald-600"
                              style={{ height: `${Math.max((month.sealed / max) * 100, 3)}%` }}
                              title={`${month.sealed} tersegel`}
                            />
                          </div>
                          <span className="font-mono text-[10px] uppercase text-zinc-500">{month.label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Tersegel
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" /> Draf dibuat
                    </span>
                  </div>
                </div>

                {/* data matrix — required next to every chart */}
                <div className="overflow-hidden rounded-[var(--radius-md)] border border-zinc-200">
                  <table className="w-full border-collapse text-[11px]">
                    <caption className="sr-only">Tabel angka tren penerbitan</caption>
                    <thead className="bg-zinc-50/90">
                      <tr>
                        <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-zinc-500">
                          Bulan
                        </th>
                        <th scope="col" className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-zinc-500">
                          Draf
                        </th>
                        <th scope="col" className="px-2 py-1.5 text-right font-semibold uppercase tracking-wider text-zinc-500">
                          Segel
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.throughput.map((month) => (
                        <tr key={month.label} className="border-t border-zinc-100">
                          <td className="px-2 py-1.5 text-zinc-700">{month.label}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-600">{month.created}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums text-zinc-900">{month.sealed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Antrean paraf prioritas"
              subtitle="Diurutkan berdasarkan tenggat SLA terdekat"
              padded={false}
              action={
                <ActionButton href="/inbox" variant="ghost">
                  Buka inbox
                  <ChevronRight className="h-3 w-3" />
                </ActionButton>
              }
            >
              <div className="thin-scroll overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead className="border-b border-zinc-200 bg-zinc-50/90">
                    <tr>
                      <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Naskah
                      </th>
                      <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Tahap
                      </th>
                      <th scope="col" className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Penyetuju
                      </th>
                      <th scope="col" className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        Tenggat
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {queue.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-zinc-500">
                          Tidak ada antrean paraf saat ini.
                        </td>
                      </tr>
                    ) : (
                      queue.map((item) => {
                        const overdue = item.isOverdue;
                        return (
                          <tr key={item.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/80">
                            <td className="px-4 py-2.5">
                              <Link href={`/documents/${item.id}`} className="font-medium text-zinc-900 hover:underline">
                                {item.title}
                              </Link>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                {CATEGORY_LABEL[item.category as DocumentCategory]} • {item.documentNumber ?? "tanpa nomor"}
                              </p>
                            </td>
                            <td className="px-4 py-2.5 text-zinc-600">{item.stepName}</td>
                            <td className="px-4 py-2.5 text-zinc-600">{item.approverName}</td>
                            <td className="px-4 py-2.5 text-right">
                              <Badge tone={overdue ? "danger" : "neutral"} mono>
                                {relativeTime(item.slaDueAt)}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          </div>

          {/* Zone D3 — telemetry rail */}
          <div className="space-y-4 xl:col-span-4">
            <SectionCard title="Rekomendasi DSS" subtitle="Satu klik untuk menindaklanjuti" padded={false}>
              <ul className="divide-y divide-zinc-100">
                {dss.findings.slice(0, 4).map((finding) => (
                  <li key={`${finding.code}-${finding.subjectId}`} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <Badge tone={finding.severity === "CRITICAL" ? "danger" : finding.severity === "WARNING" ? "warning" : "info"}>
                        {finding.severity}
                      </Badge>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500">
                        {finding.impactValue} {finding.impactUnit}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-1 text-[13px] font-medium text-zinc-900">{finding.subjectLabel}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-zinc-500">{finding.fact}</p>
                    <Link
                      href={finding.href}
                      className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-interactive)] hover:underline"
                    >
                      {finding.actionLabel}
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </li>
                ))}
                {dss.findings.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-zinc-500">Tidak ada temuan tata kelola.</li>
                ) : null}
              </ul>
            </SectionCard>

            <SectionCard title="Kesehatan antrean" subtitle="Proporsi temuan berdasarkan tingkat keparahan">
              <HealthBar
                healthy={Math.max(dss.findings.length - dss.criticalCount - dss.warningCount, 0)}
                warning={dss.warningCount}
                critical={dss.criticalCount}
              />
              <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-2.5 py-2">
                  <dt className="text-zinc-500">Disposisi terbuka</dt>
                  <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-zinc-900">
                    {analytics.openDispositions}
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-2.5 py-2">
                  <dt className="text-zinc-500">Lewat tenggat</dt>
                  <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums text-red-700">
                    {analytics.overdueDispositions}
                  </dd>
                </div>
              </dl>
            </SectionCard>

            <SectionCard title="Aliran audit terkini" subtitle="7 aksi terakhir" padded={false}>
              <ol className="divide-y divide-zinc-100">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2.5 px-4 py-2.5">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent-interactive)]" />
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-zinc-800">{entry.action}</p>
                      <p className="truncate text-[11px] text-zinc-500">
                        {entry.actorName ?? "Sistem"} • {relativeTime(entry.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
                {activity.length === 0 ? (
                  <li className="px-4 py-6 text-center text-sm text-zinc-500">Belum ada aktivitas.</li>
                ) : null}
              </ol>
            </SectionCard>
          </div>
        </div>

        {/* quick entry points */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { href: "/verify", icon: ShieldCheck, title: "Portal verifikasi publik", body: "Cek kode QR dan jalankan Tamper Detection Lab." },
            { href: "/dispositions", icon: Inbox, title: "Agenda & disposisi", body: `${analytics.openDispositions} instruksi masih berjalan.` },
            { href: "/dss/expiry-radar", icon: Radar, title: "Radar kedaluwarsa", body: `${analytics.expiringSoon} naskah habis dalam 30 hari.` },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex items-start gap-3 rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white px-4 py-3 transition-colors hover:bg-zinc-50"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400 group-hover:text-zinc-600" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-zinc-900">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-4 text-zinc-500">{item.body}</p>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
              </Link>
            );
          })}
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Clock3 className="h-3 w-3" />
          DSS dihitung ulang dari SQL setiap halaman dibuka ({relativeTime(dss.generatedAt)}).
        </p>
      </PageBody>
    </>
  );
}
