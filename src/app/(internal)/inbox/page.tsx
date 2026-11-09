import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Clock3, Inbox as InboxIcon } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import EnterpriseDataGrid from "@/components/ui/EnterpriseDataGrid";
import { FilterChips } from "@/components/ui/EnterpriseDataGrid";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { listInbox, listRecentApprovals } from "@/server/services/approvalEngine";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";
import { CATEGORY_LABEL, CONFIDENTIALITY_LABEL, relativeTime, formatDateTime } from "@/lib/labels";
import type { DocumentCategory, Urgency } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/inbox")) redirect("/documents");

  const [items, recent] = await Promise.all([listInbox(user.u), listRecentApprovals(user.u, 6)]);
  const overdueCount = items.filter((i) => i.isOverdue).length;

  return (
    <>
      <PageHeader
        title="Kotak Masuk Paraf"
        count={items.length}
        description={`${overdueCount} dari ${items.length} dokumen sudah lewat tenggat SLA. Tandatangani dengan PIN sertifikat Anda.`}
        actions={
          <Link
            href="/documents"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Repositori dokumen <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <PageBody>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
            <InboxIcon className="h-8 w-8 text-zinc-300" aria-hidden />
            <div>
              <p className="text-[15px] font-semibold text-zinc-800">Tidak ada paraf menunggu</p>
              <p className="mt-1 text-[13px] text-zinc-500">
                Dokumen akan muncul di sini begitu penyusun mengajukannya ke tahap Anda.
              </p>
            </div>
          </div>
        ) : (
          <EnterpriseDataGrid
            title="Menunggu tanda tangan Anda"
            count={items.length}
            description="Diurutkan dari tenggat SLA terdekat"
            rows={items}
            rowKey={(item) => item.stepId}
            onRowClickHref={() => "/documents"}
            columns={[
              {
                key: "document",
                header: "Dokumen",
                cell: (item) => (
                  <Link href={`/documents/${item.documentId}`} className="group block">
                    <span className="block max-w-[380px] truncate text-[13px] font-medium text-zinc-900 group-hover:underline">{item.title}</span>
                    <span className="mt-0.5 block font-mono text-[11px] text-zinc-500">
                      {item.documentNumber ?? `versi ${item.currentVersionNo}`} · {CATEGORY_LABEL[item.category as DocumentCategory]}
                    </span>
                  </Link>
                ),
              },
              {
                key: "step",
                header: "Tahap",
                cell: (item) => (
                  <span className="text-[12px] text-zinc-600">
                    {item.stepOrder}. {item.stepName}
                    <span className="block text-[11px] text-zinc-400">{item.department}</span>
                  </span>
                ),
              },
              {
                key: "confidentiality",
                header: "Kerahasiaan",
                cell: (item) => (
                  <Badge tone={item.confidentiality === "STRICTLY_SECRET" ? "danger" : item.confidentiality === "CONFIDENTIAL" ? "warning" : "neutral"}>
                    {CONFIDENTIALITY_LABEL[item.confidentiality] ?? item.confidentiality}
                  </Badge>
                ),
              },
              {
                key: "sla",
                header: "Tenggat SLA",
                align: "right",
                cell: (item) => {
                  const hoursLeft = Math.round((item.slaDueAt.getTime() - Date.now()) / 3600000);
                  return (
                    <Badge tone={item.isOverdue ? "danger" : hoursLeft < 6 ? "warning" : "neutral"} mono>
                      {item.isOverdue ? `lewat ${item.hoursOverdue} jam` : `${hoursLeft} jam tersisa`}
                    </Badge>
                  );
                },
              },
              {
                key: "waiting",
                header: "Menunggu",
                align: "right",
                cell: (item) => (
                  <span className="font-mono text-[12px] tabular-nums text-zinc-500" title={`Tenggat ${formatDateTime(item.slaDueAt)}`}>
                    {item.waitingHours < 1 ? "baru saja" : `${item.waitingHours} jam`}
                  </span>
                ),
              },
            ]}
            footer={
              <p className="flex items-center gap-1.5">
                <Clock3 className="h-3 w-3" />
                Klik baris untuk membuka lembar persetujuan. Tindakan memparaf selalu mewajibkan PIN sertifikat.
              </p>
            }
          />
        )}

        <div className="mt-4">
          <SectionCard title="Paraf Anda terakhir" subtitle="Tindakan terbaru pada tahap Anda" padded={false}>
            {recent.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-zinc-500">Belum ada paraf yang Anda tandatangani.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recent.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <Link href={`/documents/${entry.documentId}`} className="block max-w-full truncate text-[13px] font-medium text-zinc-900 hover:underline">
                        {entry.title}
                      </Link>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{entry.stepName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone={entry.verdict === "APPROVED_SIGNED" ? "success" : "warning"}>
                        {entry.verdict === "APPROVED_SIGNED" ? "Disetujui" : "Dikembalikan"}
                      </Badge>
                      <span className="text-[11px] text-zinc-400">{entry.actedAt ? relativeTime(entry.actedAt) : ""}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </PageBody>
    </>
  );
}
