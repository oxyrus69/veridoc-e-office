import { notFound } from "next/navigation";
import { getCorrespondenceDetail } from "@/server/services/templateEngine";
import { getSettings } from "@/server/services/settings";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL, formatDate, formatDateTime } from "@/lib/labels";
import type { Urgency } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** A4 lembar disposisi — kolom instruksi bertingkat seperti form kertas kantor. */
export default async function PrintDispositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [detail, settings] = await Promise.all([getCorrespondenceDetail(id), getSettings()]);
  if (!detail) notFound();

  const nodes = detail.nodes as unknown as {
    levelOrder: number;
    fromName: string;
    toName: string;
    targetUnit: string;
    instruction: string;
    dueDate: string;
    isCompleted: boolean;
    completedAt: Date | null;
    completionNote: string | null;
  }[];

  const qrValue = `${(settings["verify_base_url"] ?? "https://veridoc.id").replace(/\/+$/, "")}/dispositions/${detail.id}`;

  return (
    <main className="min-h-screen bg-zinc-200 py-8 print:bg-white print:py-0">
      <article className="mx-auto w-[210mm] max-w-full bg-white px-[18mm] py-[16mm] text-[10.5pt] leading-[1.5] text-black shadow-sm print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-[2.5px] border-black pb-3">
          <div>
            <p className="text-[9pt] font-semibold uppercase tracking-[0.22em]">{settings["org_name"] ?? "VeriDoc Nusantara"}</p>
            <p className="mt-0.5 text-[10pt] font-bold uppercase">Lembar Disposisi</p>
            <p className="mt-1 font-mono text-[9pt] text-zinc-600">Agenda {detail.agendaNumber}</p>
          </div>
          <QrCodeSvg value={qrValue} size={84} moduleSize={2} label={`QR disposisi ${detail.agendaNumber}`} />
        </header>

        <table className="mt-4 w-full border-collapse text-[9.5pt]">
          <tbody>
            {[
              ["Surat dari", detail.senderInstitution],
              ["Nomor surat", detail.originLetterNo],
              ["Tanggal surat", formatDate(detail.originLetterDate)],
              ["Diterima", `${formatDate(detail.receivedDate)} · dicatat ${detail.recordedByName}`],
              ["Sifat", URGENCY_LABEL[detail.urgency as Urgency]],
              ["Kerahasiaan", CONFIDENTIALITY_LABEL[detail.confidentiality] ?? detail.confidentiality],
              ["Lampiran", detail.attachmentNote || "—"],
            ].map(([label, value]) => (
              <tr key={label} className="border-b border-zinc-200">
                <th scope="row" className="w-[34mm] py-1 pr-3 text-left align-top font-semibold">{label}</th>
                <td className="py-1">{value}</td>
              </tr>
            ))}
            <tr>
              <th scope="row" className="w-[34mm] py-1 pr-3 text-left align-top font-semibold">Perihal</th>
              <td className="py-1 font-semibold">{detail.subject}</td>
            </tr>
          </tbody>
        </table>

        {detail.summary ? (
          <section className="mt-4 rounded border border-zinc-300 p-3">
            <p className="text-[8.5pt] font-semibold uppercase tracking-wider text-zinc-500">Ringkasan</p>
            <p className="mt-1 whitespace-pre-wrap text-justify text-[9.5pt]">{detail.summary}</p>
          </section>
        ) : null}

        <section className="mt-5 break-inside-avoid">
          <p className="text-[9pt] font-semibold uppercase tracking-wider">Rantai instruksi</p>
          <table className="mt-2 w-full border-collapse text-[8.5pt]">
            <thead>
              <tr className="border-y border-zinc-400 text-left">
                <th className="w-[10mm] py-1 pr-2 font-semibold">No</th>
                <th className="py-1 pr-2 font-semibold">Dari → Kepada / Unit</th>
                <th className="py-1 pr-2 font-semibold">Instruksi</th>
                <th className="w-[24mm] py-1 pr-2 font-semibold">Tenggat</th>
                <th className="w-[22mm] py-1 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map((node, index) => (
                <tr key={index} className="border-b border-zinc-200 align-top">
                  <td className="py-1.5 pr-2 font-mono">{String(index + 1).padStart(2, "0")}</td>
                  <td className="py-1.5 pr-2">
                    {node.fromName}
                    <span className="block text-[7.5pt] text-zinc-500">→ {node.toName}</span>
                    {node.targetUnit ? <span className="block text-[7.5pt] text-zinc-500">{node.targetUnit}</span> : null}
                  </td>
                  <td className="py-1.5 pr-2">{node.instruction}</td>
                  <td className="py-1.5 pr-2 text-[8pt]">{formatDate(node.dueDate)}</td>
                  <td className="py-1.5 text-[8pt]">
                    {node.isCompleted ? (
                      <>
                        <span className="font-semibold">selesai</span>
                        {node.completedAt ? <span className="block text-[7.5pt] text-zinc-500">{formatDateTime(node.completedAt)}</span> : null}
                      </>
                    ) : (
                      <span className="text-zinc-600">berjalan</span>
                    )}
                  </td>
                </tr>
              ))}
              {nodes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-[9pt] text-zinc-500">Belum ada instruksi disposisi.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        <footer className="mt-6 flex flex-wrap items-end justify-between gap-4 border-t border-zinc-400 pt-3 text-[8pt] text-zinc-600">
          <p>
            Dokumen ini dihasilkan otomatis oleh VeriDoc. Riwayat disposisi asli dapat diperiksa pada portal internal
            melalui agenda <span className="font-mono">{detail.agendaNumber}</span>.
          </p>
          <p className="font-mono">Dicatat {formatDateTime(detail.createdAt)}</p>
        </footer>
      </article>

      <p className="mx-auto mt-4 w-[210mm] max-w-full px-[18mm] text-center text-[9pt] text-zinc-500 print:hidden">
        Gunakan <kbd className="rounded border px-1">Ctrl</kbd> + <kbd className="rounded border px-1">P</kbd> untuk mencetak lembar disposisi ini.
      </p>
    </main>
  );
}
