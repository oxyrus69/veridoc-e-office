import { redirect } from "next/navigation";
import Link from "next/link";
import { Download, MailPlus } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import EnterpriseDataGrid from "@/components/ui/EnterpriseDataGrid";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import ActionForm from "@/components/ui/ActionForm";
import { listCorrespondences } from "@/server/services/templateEngine";
import { getCurrentUser } from "@/server/session";
import { URGENCY_LABEL, CONFIDENTIALITY_LABEL, formatDate } from "@/lib/labels";
import type { Urgency } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function DispositionsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const rows = await listCorrespondences();
  const canRecord = user.r !== "AUDITOR_COMPLIANCE";

  return (
    <>
      <PageHeader
        title="Agenda Surat & Disposisi"
        count={rows.length}
        description="Buku agenda surat masuk beserta rantai instruksi berjenjang. Setiap instruksi punya tenggat dan bukti penyelesaian."
        actions={
          <a
            href="/api/export/dispositions"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" /> Ekspor agenda (CSV)
          </a>
        }
      />

      <PageBody>
        <EnterpriseDataGrid
          title="Surat masuk"
          count={rows.length}
          description="Diurutkan dari tanggal diterima terbaru"
          rows={[...rows].reverse()}
          rowKey={(row) => row.id}
          onRowClickHref={() => ""}
          columns={[
            {
              key: "letter",
              header: "Agenda & perihal",
              cell: (row) => (
                <Link href={`/dispositions/${row.id}`} className="group block">
                  <span className="block font-mono text-[11px] text-zinc-500">{row.agendaNumber}</span>
                  <span className="mt-0.5 block max-w-[380px] truncate text-[13px] font-medium text-zinc-900 group-hover:underline">{row.subject}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-zinc-500">{row.senderInstitution}</span>
                </Link>
              ),
            },
            {
              key: "origin",
              header: "Surat asal",
              cell: (row) => (
                <span className="text-[12px] text-zinc-600">
                  {row.originLetterNo}
                  <span className="block text-[11px] text-zinc-400">{formatDate(row.originLetterDate)}</span>
                </span>
              ),
            },
            {
              key: "urgency",
              header: "Sifat",
              cell: (row) => (
                <Badge tone={row.urgency === "URGENT_IMMEDIATE" ? "danger" : row.urgency === "IMPORTANT" ? "warning" : "neutral"}>
                  {URGENCY_LABEL[row.urgency as Urgency]}
                </Badge>
              ),
            },
            {
              key: "progress",
              header: "Progres disposisi",
              cell: (row) => {
                const total = Math.max(row.instructions, 1);
                const pct = Math.round((row.completed / total) * 100);
                return (
                  <div className="w-32">
                    <div className="flex items-baseline justify-between font-mono text-[11px] tabular-nums">
                      <span className="text-zinc-700">
                        {row.completed}/{row.instructions}
                      </span>
                      <span className="text-zinc-400">{pct}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
                      <span
                        className={`block h-full ${pct === 100 ? "bg-emerald-500" : row.overdueNodes > 0 ? "bg-red-500" : "bg-sky-500"}`}
                        style={{ width: `${Math.max(pct, 3)}%` }}
                      />
                    </div>
                  </div>
                );
              },
            },
            {
              key: "due",
              header: "Tenggat terdekat",
              align: "right",
              cell: (row) =>
                row.earliestDue ? (
                  <Badge tone={row.overdueNodes > 0 ? "danger" : "neutral"} mono>
                    {row.overdueNodes > 0 ? `${row.overdueNodes} lewat` : formatDate(row.earliestDue)}
                  </Badge>
                ) : (
                  <span className="text-[12px] text-zinc-400">selesai</span>
                ),
            },
          ]}
          footer={
            <p className="text-[11px] text-zinc-500">
              {rows.reduce((acc, r) => acc + r.overdueNodes, 0)} instruksi melewati tenggat dari {rows.reduce((acc, r) => acc + r.openNodes, 0)} yang masih berjalan.
            </p>
          }
        />

        {canRecord ? (
          <div className="mt-4">
            <SectionCard title="Catat surat masuk baru" subtitle="Agenda diberi nomor otomatis; unit penerima dipilih pada halaman detail" padded={false}>
              <ActionForm action="correspondence:create" className="px-4 py-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Instansi pengirim <span className="text-red-500">*</span></span>
                    <input name="senderInstitution" required className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Perihal <span className="text-red-500">*</span></span>
                    <input name="subject" required className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Nomor surat asal</span>
                    <input name="originLetterNo" placeholder="B/1234/XI/2026" className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-medium text-zinc-600">Tanggal surat</span>
                      <input type="date" name="originLetterDate" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-zinc-600">Diterima</span>
                      <input type="date" name="receivedDate" defaultValue={new Date().toISOString().slice(0, 10)} className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                    </label>
                  </div>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Sifat / urgensi</span>
                    <select name="urgency" defaultValue="ROUTINE" className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none">
                      <option value="ROUTINE">Rutin</option>
                      <option value="IMPORTANT">Penting</option>
                      <option value="URGENT_IMMEDIATE">Segera</option>
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Kerahasiaan</span>
                    <select name="confidentiality" defaultValue="INTERNAL" className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none">
                      <option value="PUBLIC">Publik</option>
                      <option value="INTERNAL">Internal</option>
                      <option value="CONFIDENTIAL">Rahasia</option>
                      <option value="STRICTLY_SECRET">Sangat rahasia</option>
                    </select>
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-xs font-medium text-zinc-600">Ringkasan isi</span>
                    <textarea name="summary" rows={2} className="thin-scroll mt-1 w-full resize-y rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                  </label>
                  <label className="block md:col-span-2">
                    <span className="text-xs font-medium text-zinc-600">Lampiran</span>
                    <input name="attachmentNote" placeholder="1 berkas PDF, 1 templat isian" className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                  </label>
                </div>
                <button type="submit" className="mt-3 inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[var(--accent-primary-hover)]">
                  <MailPlus className="h-4 w-4" /> Catat ke agenda
                </button>
              </ActionForm>
            </SectionCard>
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
