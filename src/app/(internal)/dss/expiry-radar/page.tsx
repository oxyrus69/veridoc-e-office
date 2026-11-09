import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarClock, FileText } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { KpiStatCard } from "@/components/ui/KpiStatCard";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { computeDss } from "@/server/services/dssEngine";
import { listDocuments } from "@/server/services/documentEngine";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { CATEGORY_LABEL, formatDate } from "@/lib/labels";
import type { DocumentCategory } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function ExpiryRadarPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/dss")) redirect("/documents");

  const [report, docs] = await Promise.all([computeDss(), listDocuments()]);
  const findings = report.findings
    .filter((f) => f.code === "DOCUMENT_EXPIRY_RADAR")
    .sort((a, b) => a.impactValue - b.impactValue);

  const docById = new Map(docs.map((d) => [d.id, d]));
  const within7 = findings.filter((f) => f.impactValue <= 7).length;
  const within30 = findings.filter((f) => f.impactValue > 7).length;

  return (
    <>
      <PageHeader
        title="Radar Kedaluwarsa Naskah"
        count={findings.length}
        description="Naskah tersegel yang berlaku kurang dari 30 hari. Hitungan memakai kolom effective_until dan tanggal hari ini; tidak ada cache."
        actions={
          <Link href="/dss" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50">
            <ArrowLeft className="h-4 w-4" /> Ringkasan DSS
          </Link>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiStatCard label="Kritis (≤ 7 hari)" value={String(within7)} tone={within7 ? "danger" : "success"} footer="Perpanjangan harus diajukan pekan ini" />
          <KpiStatCard label="Peringatan (8–30 hari)" value={String(within30)} tone={within30 ? "warning" : "success"} footer="Siapkan draf perpanjangan sekarang" />
          <KpiStatCard label="Naskah tak berbatas" value={String(docs.filter((d) => d.status === "SEALED_PUBLISHED" && !d.effectiveUntil).length)} footer="Tidak memerlukan perpanjangan" tone="success" />
        </div>

        <div className="mt-4">
          <SectionCard title="Naskah dalam radar" subtitle="Diurutkan dari sisa masa berlaku tersingkat" padded={false}>
            <div className="thin-scroll overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                <thead className="border-b border-zinc-200 bg-zinc-50/90">
                  <tr>
                    <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Naskah</th>
                    <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Kategori</th>
                    <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Berlaku hingga</th>
                    <th scope="col" className="px-4 py-2 text-right text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Sisa</th>
                    <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tindakan</th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((finding) => {
                    const doc = docById.get(finding.subjectId);
                    return (
                      <tr key={finding.subjectId} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50/70">
                        <td className="px-4 py-2.5">
                          <Link href={`/documents/${finding.subjectId}`} className="block max-w-[320px] truncate font-medium text-zinc-900 hover:underline">
                            {finding.subjectLabel}
                          </Link>
                          <span className="font-mono text-[11px] text-zinc-500">{doc?.documentNumber ?? "—"}</span>
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-zinc-600">
                          {doc ? CATEGORY_LABEL[doc.category as DocumentCategory] : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-[12px] text-zinc-700">{doc?.effectiveUntil ? formatDate(doc.effectiveUntil) : "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <Badge tone={finding.impactValue <= 7 ? "danger" : "warning"} mono>
                            {finding.impactValue} hari
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <Link href={`/documents/${finding.subjectId}`} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent-interactive)] hover:underline">
                            <FileText className="h-3.5 w-3.5" /> Siapkan perpanjangan
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                  {findings.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-zinc-500">
                        Tidak ada naskah yang mendekati kedaluwarsa.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-zinc-200 bg-white px-4 py-3 text-[12px] leading-5 text-zinc-600">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
          <p>
            Perpanjangan dilakukan dengan mengunggah revisi dari halaman detail naskah. Versi baru akan melewati
            seluruh alur persetujuan dari tahap 1 dan menerima nomor resmi baru; versi lama tetap tersimpan sebagai
            bukti historis.
          </p>
        </div>
      </PageBody>
    </>
  );
}
