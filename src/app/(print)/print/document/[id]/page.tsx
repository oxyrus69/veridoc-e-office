import { notFound } from "next/navigation";
import { getDocumentDetail } from "@/server/services/documentEngine";
import { listWorkflowSteps } from "@/server/services/approvalEngine";
import { getSettings } from "@/server/services/settings";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import { CATEGORY_LABEL, CONFIDENTIALITY_LABEL, formatDate, formatDateTime, shortHash } from "@/lib/labels";
import type { DocumentCategory } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** A4 naskah dinas with the verification QR block in the footer. */
export default async function PrintDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [doc, steps, settings] = await Promise.all([getDocumentDetail(id), listWorkflowSteps(id), getSettings()]);
  if (!doc) notFound();

  const version = doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
  const signers = (steps as unknown[]).map((s: unknown) => s as { stepOrder: number; stepName: string; approverName: string; approverTitle: string; verdict: string; actedAt: Date | null; stepSignatureHash: string | null; certificateFingerprint: string | null; rsaSignature?: string | null });
  const signed = signers.filter((s) => s.verdict === "APPROVED_SIGNED");
  const qrValue = `${(settings["verify_base_url"] ?? "https://veridoc.id").replace(/\/+$/, "")}/verify/${doc.verificationCode}`;

  return (
    <main className="min-h-screen bg-zinc-200 py-8 print:bg-white print:py-0">
      <article className="mx-auto w-[210mm] max-w-full bg-white px-[22mm] py-[18mm] text-[11pt] leading-[1.55] text-black shadow-sm print:shadow-none">
        {/* kop */}
        <header className="border-b-[2.5px] border-black pb-3 text-center">
          <p className="text-[9pt] font-semibold uppercase tracking-[0.22em]">{settings["org_name"] ?? "VeriDoc Nusantara"}</p>
          <p className="mt-0.5 text-[10pt] font-bold uppercase">{doc.departmentName}</p>
          <p className="mt-1 text-[8pt] text-zinc-600">Dokumen resmi terverifikasi — {settings["org_unit"] ?? "Sekretariat Direksi"}</p>
        </header>

        <h1 className="mt-6 text-center text-[13pt] font-bold uppercase tracking-wide">{CATEGORY_LABEL[doc.category as DocumentCategory]}</h1>
        <p className="mt-1 text-center font-mono text-[10pt]">Nomor: {doc.documentNumber ?? "(belum diterbitkan)"}</p>
        <p className="mt-3 text-center text-[11pt] font-semibold underline decoration-1 underline-offset-4">{doc.title}</p>

        <dl className="mt-5 grid grid-cols-[32mm_1fr] gap-y-0.5 border-y border-zinc-300 py-2 text-[9.5pt]">
          <dt className="font-semibold">Kategori</dt>
          <dd>{CATEGORY_LABEL[doc.category as DocumentCategory]}</dd>
          <dt className="font-semibold">Kerahasiaan</dt>
          <dd>{CONFIDENTIALITY_LABEL[doc.confidentiality] ?? doc.confidentiality}</dd>
          <dt className="font-semibold">Masa berlaku</dt>
          <dd>
            {formatDate(doc.effectiveFrom)} s.d. {doc.effectiveUntil ? formatDate(doc.effectiveUntil) : "tidak dibatasi"}
          </dd>
          <dt className="font-semibold">Penyusun</dt>
          <dd>
            {doc.creatorName} — {doc.creatorTitle}
          </dd>
        </dl>

        <section className="mt-5 space-y-2 text-justify">
          {(version?.renderedBodyText ?? "").split("\n").map((line, index) => {
            if (!line.trim()) return <div key={index} className="h-1.5" aria-hidden />;
            if (line.startsWith("## "))
              return (
                <h2 key={index} className="pt-1 text-center text-[12pt] font-bold uppercase">
                  {line.slice(3)}
                </h2>
              );
            if (line.startsWith("### "))
              return (
                <h3 key={index} className="text-center text-[11pt] font-semibold underline underline-offset-4">
                  {line.slice(4)}
                </h3>
              );
            return (
              <p key={index} className="indent-[12mm]">
                {line.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                  part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
                )}
              </p>
            );
          })}
        </section>

        {/* signature block */}
        <section className="mt-8 break-inside-avoid">
          <p className="text-[9pt] font-semibold uppercase tracking-wider">Lembar pengesahan berjenjang</p>
          <table className="mt-2 w-full border-collapse text-[8.5pt]">
            <thead>
              <tr className="border-y border-zinc-400 text-left">
                <th className="py-1 pr-2 font-semibold">Tahap</th>
                <th className="py-1 pr-2 font-semibold">Pejabat</th>
                <th className="py-1 pr-2 font-semibold">Waktu</th>
                <th className="py-1 font-semibold">Tanda tangan tahap (S_i)</th>
              </tr>
            </thead>
            <tbody>
              {signers.map((s) => (
                <tr key={s.stepOrder} className="border-b border-zinc-200 align-top">
                  <td className="py-1 pr-2 font-mono">{s.stepOrder}</td>
                  <td className="py-1 pr-2">
                    {s.approverName}
                    <span className="block text-[7.5pt] text-zinc-500">{s.approverTitle}</span>
                  </td>
                  <td className="py-1 pr-2 text-[8pt]">{s.actedAt ? formatDateTime(s.actedAt) : "—"}</td>
                  <td className="break-all py-1 font-mono text-[7pt] leading-3">{s.stepSignatureHash ?? "belum ditandatangani"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* QR footer */}
        <footer className="mt-8 flex break-inside-avoid items-start justify-between gap-6 border-t-2 border-black pt-4">
          <div className="min-w-0 flex-1 text-[8pt] leading-[1.45]">
            <p className="text-[9pt] font-bold uppercase tracking-wider">Bukti keaslian</p>
            <p className="mt-1">
              Pindai QR untuk memverifikasi naskah ini secara publik. Segel isi (SHA-256):
            </p>
            <p className="mt-1 break-all font-mono text-[7pt]">{doc.canonicalContentHash ?? "—"}</p>
            <p className="mt-1 break-all font-mono text-[7pt]">Rantai final: {doc.finalSignatureChainHash ?? "—"}</p>
            <p className="mt-1">
              Kode verifikasi: <span className="font-mono font-semibold">{doc.verificationCode}</span>
              {doc.sealedAt ? ` · disegel ${formatDateTime(doc.sealedAt)}` : " · belum tersegel"}
            </p>
            <p className="mt-1 text-zinc-600">
              {signed.length} paraf kriptografis terverifikasi · {doc.versions.length} versi tersimpan ·{" "}
              {shortHash(doc.finalSignatureChainHash, 8, 4)}
            </p>
          </div>
          <div className="shrink-0 text-center">
            <QrCodeSvg value={qrValue} size={112} moduleSize={3} label={`QR verifikasi ${doc.verificationCode}`} />
            <p className="mt-1 max-w-[112px] break-all font-mono text-[6.5pt] leading-3 text-zinc-600">{qrValue}</p>
          </div>
        </footer>
      </article>

      <p className="mx-auto mt-4 w-[210mm] max-w-full px-[22mm] text-center text-[9pt] text-zinc-500 print:hidden">
        Gunakan <kbd className="rounded border px-1">Ctrl</kbd> + <kbd className="rounded border px-1">P</kbd> untuk mencetak (A4, margin default). Header/footer peramban aman dimatikan.
      </p>
    </main>
  );
}
