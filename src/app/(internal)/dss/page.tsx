import { redirect } from "next/navigation";
import Link from "next/link";
import { AlertOctagon, ArrowUpRight, ChevronRight, Gauge, Radar, ShieldCheck, Timer, type LucideIcon } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { KpiStatCard } from "@/components/ui/KpiStatCard";
import { HealthBar, SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { computeDss, persistDssDecisions, type DssFinding } from "@/server/services/dssEngine";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { relativeTime } from "@/lib/labels";

export const dynamic = "force-dynamic";

const CODE_META: Record<DssFinding["code"], { label: string; href: string; icon: LucideIcon; about: string }> = {
  APPROVAL_SLA_BOTTLENECK: {
    label: "Leher botol persetujuan",
    href: "/dss/bottlenecks",
    icon: Timer,
    about: "Antrean paraf seorang pejabat yang melewati SLA. Tindakan: delegasi sementara atau eskalasi.",
  },
  DOCUMENT_EXPIRY_RADAR: {
    label: "Radar kedaluwarsa",
    href: "/dss/expiry-radar",
    icon: Radar,
    about: "Naskah tersegel yang masa berlakunya habis dalam 30 hari. Tindakan: siapkan perpanjangan sekarang.",
  },
  OVERDUE_URGENT_DISPOSITION: {
    label: "Disposisi mendesak terlambat",
    href: "/dispositions",
    icon: AlertOctagon,
    about: "Instruksi berlabel segera yang belum dituntaskan melewati tenggat. Tindakan: hubungi unit pelaksana.",
  },
  SIGNER_CERT_ROTATION_WARN: {
    label: "Rotasi kunci penandatangan",
    href: "/certificates",
    icon: ShieldCheck,
    about: "Sertifikat mendekati kedaluwarsa atau belum dirotasi > 180 hari. Tindakan: terbitkan kunci baru.",
  },
};

export default async function DssPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/dss")) redirect("/documents");

  const report = await computeDss();
  await persistDssDecisions(report).catch(() => undefined);
  const byCode = (Object.keys(CODE_META) as DssFinding["code"][]).map((code) => ({
    code,
    ...CODE_META[code],
    findings: report.findings.filter((f) => f.code === code),
    critical: report.findings.filter((f) => f.code === code && f.severity === "CRITICAL").length,
  }));

  return (
    <>
      <PageHeader
        title="Decision Support System — Tata Kelola Naskah"
        count={report.findings.length}
        description="Empat aturan dijalankan langsung dari SQL setiap kali halaman dibuka. Sistem menyarankan, manusia memutuskan dan keputusan itu tercatat."
        actions={
          <Link href="/dss/riwayat" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
            Riwayat keputusan <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <KpiStatCard
            label="Total temuan"
            value={String(report.findings.length)}
            tone={report.criticalCount > 0 ? "danger" : report.warningCount > 0 ? "warning" : "success"}
            delta={{ value: `${report.criticalCount} kritis`, tone: report.criticalCount > 0 ? "down" : "up" }}
            footer={`${report.warningCount} peringatan · ${Math.max(report.findings.length - report.criticalCount - report.warningCount, 0)} info`}
          />
          {byCode.slice(0, 3).map((group) => (
            <KpiStatCard
              key={group.code}
              label={group.label}
              value={String(group.findings.length)}
              tone={group.critical > 0 ? "danger" : group.findings.length > 0 ? "warning" : "success"}
              delta={{ value: `${group.critical} kritis`, tone: group.critical > 0 ? "down" : "up" }}
              footer={group.about}
            />
          ))}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          <div className="space-y-4 xl:col-span-8">
            {byCode.map((group) => {
              const Icon = group.icon;
              return (
                <section key={group.code} className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200/80 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-zinc-400" />
                      <h2 className="text-[13px] font-semibold tracking-tight">{group.label}</h2>
                      <span className="rounded-[var(--radius-sm)] bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-zinc-600">
                        {group.findings.length}
                      </span>
                    </div>
                    <Link href={group.href} className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent-interactive)] hover:underline">
                      Buka analisis <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </header>
                  <ul className="divide-y divide-zinc-100">
                    {group.findings.map((finding) => (
                      <li key={`${finding.code}-${finding.subjectId}`} className="px-4 py-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-zinc-900">{finding.subjectLabel}</p>
                            <p className="mt-0.5 text-[12px] leading-5 text-zinc-600">{finding.fact}</p>
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge tone={finding.severity === "CRITICAL" ? "danger" : finding.severity === "WARNING" ? "warning" : "info"}>
                              {finding.severity}
                            </Badge>
                            <p className="mt-1 font-mono text-[11px] tabular-nums text-zinc-500">
                              {finding.impactValue} {finding.impactUnit}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] bg-zinc-50 px-2.5 py-1.5">
                          <p className="text-[11px] leading-4 text-zinc-600">
                            <span className="font-semibold text-zinc-700">Saran sistem:</span> {finding.recommendation}
                          </p>
                          <Link href={finding.href} className="shrink-0 text-[11px] font-semibold text-[var(--accent-interactive)] hover:underline">
                            {finding.actionLabel}
                          </Link>
                        </div>
                      </li>
                    ))}
                    {group.findings.length === 0 ? (
                      <li className="px-4 py-6 text-center text-[12px] text-zinc-500">
                        Tidak ada temuan — ambang aturan ({group.about.split(".")[0].toLowerCase()}) terpenuhi.
                      </li>
                    ) : null}
                  </ul>
                </section>
              );
            })}
          </div>

          <div className="space-y-4 xl:col-span-4">
            <SectionCard title="Kesehatan tata kelola" subtitle="Proporsi temuan menurut keparahan">
              <HealthBar
                healthy={Math.max(report.findings.length - report.criticalCount - report.warningCount, 0)}
                warning={report.warningCount}
                critical={report.criticalCount}
              />
              <p className="mt-3 flex items-center gap-1.5 text-[11px] text-zinc-500">
                <Gauge className="h-3 w-3" /> Dihitung {relativeTime(report.generatedAt)}
              </p>
            </SectionCard>

            <SectionCard title="Ambang aturan" subtitle="Nilai yang dipakai mesin DSS">
              <dl className="space-y-2.5 text-[12px]">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-zinc-500">SLA paraf leher botol</dt>
                  <dd className="font-mono text-zinc-800">&gt; 48 jam → kritis</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-zinc-500">Jendela radar kedaluwarsa</dt>
                  <dd className="font-mono text-zinc-800">≤ 30 hari</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-zinc-500">Disposisi segera terlambat</dt>
                  <dd className="font-mono text-zinc-800">≥ 3 hari → kritis</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-zinc-500">Rotasi kunci</dt>
                  <dd className="font-mono text-zinc-800">180 hari / 60 hari</dd>
                </div>
              </dl>
              <p className="mt-3 text-[11px] leading-4 text-zinc-500">
                Ambang dapat diubah Super Admin melalui tabel <code className="font-mono">decision_rules</code>.
              </p>
            </SectionCard>
          </div>
        </div>
      </PageBody>
    </>
  );
}
