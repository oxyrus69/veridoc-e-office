import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, FilePlus2 } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import EnterpriseDataGrid, { FilterChips } from "@/components/ui/EnterpriseDataGrid";
import { Badge } from "@/components/ui/Badge";
import { listDocuments, countDocumentsByStatus } from "@/server/services/documentEngine";
import { getCurrentUser } from "@/server/session";
import {
  CATEGORY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  URGENCY_LABEL,
  relativeTime,
  shortHash,
} from "@/lib/labels";
import { toneClasses } from "@/lib/dom";
import type { DocumentCategory, DocStatus } from "@/server/db/schema";

export const dynamic = "force-dynamic";

const STATUSES: (DocStatus | "ALL")[] = ["ALL", "DRAFT", "IN_REVIEW_WORKFLOW", "REVISION_REQUESTED", "SEALED_PUBLISHED", "EXPIRED", "REVOKED_INVALIDATED"];
const CATEGORIES: (DocumentCategory | "ALL")[] = ["ALL", "DECREE_SK", "COOPERATION_CONTRACT", "BUDGET_MEMO", "OFFICIAL_LETTER", "SOP_POLICY", "MINUTES_BA"];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ status?: string; category?: string; q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { status, category, q } = await searchParams;
  const statusFilter = (STATUSES.includes(status as DocStatus) ? status : "ALL") as DocStatus | "ALL";
  const categoryFilter = (CATEGORIES.includes(category as DocumentCategory) ? category : "ALL") as DocumentCategory | "ALL";
  const [rows, statusCounts] = await Promise.all([
    listDocuments({ status: statusFilter, category: categoryFilter, search: q }),
    countDocumentsByStatus(),
  ]);
  const countFor = (s: string) => (s === "ALL" ? rows.length : statusCounts.find((c) => c.status === s)?.count ?? 0);

  return (
    <>
      <PageHeader
        title="Repositori Naskah Dinas"
        count={rows.length}
        description="Seluruh draf, naskah dalam persetujuan, dan naskah tersegel. Klik baris untuk membuka lembar detail & segel."
        actions={
          user.r !== "AUDITOR_COMPLIANCE" ? (
            <Link
              href="/documents/compose"
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
            >
              <FilePlus2 className="h-4 w-4" /> Susun dokumen
            </Link>
          ) : null
        }
      />

      <PageBody>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <FilterChips
            name="status"
            active={statusFilter}
            baseHref="/documents"
            options={STATUSES.map((s) => ({
              value: s,
              label: s === "ALL" ? "Semua status" : STATUS_LABEL[s as DocStatus],
              count: countFor(s),
            }))}
          />
          <form method="GET" action="/documents" className="flex items-center gap-2">
            <input type="hidden" name="status" value={statusFilter} />
            <input type="hidden" name="category" value={categoryFilter} />
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Cari judul, nomor, kode VRD, penyusun…"
              className="h-8 w-64 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 text-[13px] placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
            />
            <button type="submit" className="rounded-[var(--radius-md)] border border-zinc-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
              Cari
            </button>
          </form>
        </div>
        <div className="mb-4 flex flex-wrap gap-1">
          {CATEGORIES.map((c) => (
            <Link
              key={c}
              href={`/documents?status=${statusFilter}&category=${c}`}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                categoryFilter === c
                  ? "border-zinc-900 bg-zinc-900 text-white"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {c === "ALL" ? "Semua kategori" : CATEGORY_LABEL[c as DocumentCategory]}
            </Link>
          ))}
        </div>

        <EnterpriseDataGrid
          title="Daftar naskah"
          count={rows.length}
          rows={rows}
          rowKey={(row) => row.id}
          onRowClickHref={() => ""}
          columns={[
            {
              key: "document",
              header: "Dokumen",
              cell: (row) => (
                <Link href={`/documents/${row.id}`} className="group block">
                  <span className="block max-w-[340px] truncate text-[13px] font-medium text-zinc-900 group-hover:underline">{row.title}</span>
                  <span className="mt-0.5 block font-mono text-[11px] text-zinc-500">
                    {row.documentNumber ?? `kode ${row.verificationCode}`}
                  </span>
                </Link>
              ),
            },
            {
              key: "category",
              header: "Kategori",
              cell: (row) => <span className="text-[12px] text-zinc-600">{CATEGORY_LABEL[row.category as DocumentCategory]}</span>,
            },
            {
              key: "status",
              header: "Status",
              cell: (row) => (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-medium ${toneClasses(STATUS_TONE[row.status])}`}
                >
                  {STATUS_LABEL[row.status]}
                  {row.totalSteps > 0 ? (
                    <span className="font-mono text-[10px] tabular-nums opacity-70">
                      {row.approvedSteps}/{row.totalSteps}
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: "seal",
              header: "Segel",
              cell: (row) =>
                row.finalSignatureChainHash ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border-[var(--seal-border)] bg-[var(--seal-soft)] px-2 py-0.5 font-mono text-[11px] font-medium text-[var(--seal)]"
                    title={`${row.finalSignatureChainHash}`}
                  >
                    QR siap
                  </span>
                ) : (
                  <Badge tone="neutral">{row.canonicalContentHash ? shortHash(row.canonicalContentHash, 8, 4) : "belum ada"}</Badge>
                ),
            },
            {
              key: "validity",
              header: "Masa berlaku",
              cell: (row) => (
                <span className="text-[12px] text-zinc-600">
                  {row.effectiveFrom}
                  <span className="block text-[11px] text-zinc-400">s.d. {row.effectiveUntil ?? "tidak dibatasi"}</span>
                </span>
              ),
            },
            {
              key: "updated",
              header: "Pembaruan",
              align: "right",
              cell: (row) => <span className="text-[11px] text-zinc-400">{relativeTime(row.updatedAt)}</span>,
            },
          ]}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-4 text-[11px] text-zinc-500">
                {rows
                  .filter((r) => r.status === "SEALED_PUBLISHED")
                  .length === 0
                  ? "Belum ada naskah tersegel dengan filter ini."
                  : `${rows.filter((r) => r.status === "SEALED_PUBLISHED").length} naskah siap diverifikasi publik`}
              </p>
              <a
                href="/api/export/documents"
                className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-interactive)] hover:underline"
              >
                <Download className="h-3.5 w-3.5" /> Unduh buku dafdar (CSV)
              </a>
            </div>
          }
        />
      </PageBody>
    </>
  );
}
