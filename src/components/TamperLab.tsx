"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FlaskConical, RotateCcw } from "lucide-react";
import { buildTamperReport, normalizeBodyText } from "@/lib/tamperLab";

const FORENSIC_SAMPLE = `## MEMORANDUM ANGGARAN
Nomor: (contoh)

**Kepada:** Direktur Utama
**Dari:** Biro Umum

**Nilai pengajuan**
Rp 150.000.000 bersumber dari Anggaran Investasi 2026.`;

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type LabResult = {
  status: "VALID" | "TAMPERED";
  originalHash: string;
  modifiedHash: string;
  changedLines: { lineNo: number; original: string; modified: string }[];
  avalancheBits: number | null;
  identicalPrefixChars: number;
  lineCountDelta: number;
};

export default function TamperLab({
  bodyText,
  originalHash,
}: {
  bodyText?: string;
  originalHash?: string;
}) {
  const baselineText = useMemo(() => bodyText ?? FORENSIC_SAMPLE, [bodyText]);
  const baselineHash = useMemo(() => originalHash ?? "", [originalHash]);
  const [modified, setModified] = useState(baselineText);
  const [result, setResult] = useState<LabResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const modifiedHash = await sha256Hex(normalizeBodyText(modified));
      const report = buildTamperReport({
        originalText: baselineText,
        modifiedText: modified,
        originalHash: baselineHash || "",
        modifiedHash,
      });
      setResult({
        status: report.status,
        originalHash: baselineHash || "—",
        modifiedHash,
        changedLines: report.changedLines,
        avalancheBits: report.avalancheBits,
        identicalPrefixChars: report.identicalPrefixChars,
        lineCountDelta: report.lineCountDelta,
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setModified(baselineText);
    setResult(null);
  }

  const tampered = result?.status === "TAMPERED";

  return (
    <div className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 px-4 py-3">
        <div className="flex items-start gap-2.5">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          <div>
            <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">
              Tamper Detection Lab {result ? null : "(simulasi forensik)"}
            </h2>
            <p className="mt-0.5 max-w-xl text-[11px] leading-4 text-zinc-500">
              Simulasikan naskah yang Anda pegang, ubah satu karakter, dan lihat bagaimana segel
              SHA-256 langsung patah. Hash dihitung di peramban Anda — tidak ada data yang dikirim.
            </p>
          </div>
        </div>
        {result ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border px-2.5 py-1 text-[12px] font-semibold ${
              tampered ? "border-red-300 bg-red-50 text-red-800" : "border-emerald-300 bg-emerald-50 text-emerald-800"
            }`}
          >
            {tampered ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {tampered ? "TAMPERED" : "VALID"}
          </span>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-2">
        <div>
          <label className="mb-1.5 flex items-center justify-between text-xs font-medium text-zinc-600">
            <span>Naskah yang Anda pegang</span>
            <button type="button" onClick={reset} className="inline-flex items-center gap-1 text-[var(--accent-interactive)] hover:underline">
              <RotateCcw className="h-3 w-3" /> kembalikan
            </button>
          </label>
          <textarea
            value={modified}
            onChange={(event) => {
              setModified(event.target.value);
              setResult(null);
            }}
            rows={12}
            spellCheck={false}
            className="thin-scroll w-full resize-y rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2.5 font-mono text-[12px] leading-5 text-zinc-900 focus:border-[var(--accent-interactive)] focus:outline-none"
            aria-label="Naskah hasil ekspor"
          />
          <p className="mt-1.5 text-[11px] leading-4 text-zinc-500">
            Coba ubah nilai rupiah (mis. 150.000.000 menjadi 150.000.001) atau satu huruf saja.
          </p>
        </div>

        <div className="min-w-0">
          <p className="mb-1.5 text-xs font-medium text-zinc-600">Hasil forensik</p>
          {!result ? (
            <div className="flex h-full min-h-[240px] items-center justify-center rounded-[var(--radius-md)] border border-dashed border-zinc-300 bg-zinc-50/60 px-6 text-center text-[13px] leading-5 text-zinc-500">
              {busy ? "Menghitung SHA-256…" : "Perbarui naskah lalu tekan Analisis integrasi."}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-zinc-200 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Hash tersegel (asli)</p>
                  <p className="mt-1 break-all font-mono text-[11px] leading-4 text-emerald-800">{result.originalHash}</p>
                </div>
                <div className="rounded-[var(--radius-md)] border border-zinc-200 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Hash hasil ekspor</p>
                  <p className={`mt-1 break-all font-mono text-[11px] leading-4 ${tampered ? "text-red-700" : "text-zinc-700"}`}>
                    {result.modifiedHash}
                  </p>
                </div>
              </div>

              <dl className="grid grid-cols-3 gap-2">
                <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-2 py-2 text-center">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Avalanche</dt>
                  <dd className="mt-0.5 font-mono text-base font-bold tabular-nums text-zinc-900">
                    {result.avalancheBits ?? "—"} <span className="text-[11px] font-medium text-zinc-500">bit / 256</span>
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-2 py-2 text-center">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Prefiks identik</dt>
                  <dd className="mt-0.5 font-mono text-base font-bold tabular-nums text-zinc-900">
                    {result.identicalPrefixChars < 1000 ? result.identicalPrefixChars : "—"}{" "}
                    <span className="text-[11px] font-medium text-zinc-500">char</span>
                  </dd>
                </div>
                <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-2 py-2 text-center">
                  <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Baris berubah</dt>
                  <dd className="mt-0.5 font-mono text-base font-bold tabular-nums text-zinc-900">{result.changedLines.length}</dd>
                </div>
              </dl>

              {result.changedLines.length > 0 ? (
                <div className="thin-scroll max-h-44 overflow-y-auto rounded-[var(--radius-md)] border border-zinc-200">
                  <table className="w-full border-collapse text-[11px]">
                    <thead className="sticky top-0 bg-zinc-50/95">
                      <tr>
                        <th scope="col" className="w-12 px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-zinc-500">Baris</th>
                        <th scope="col" className="px-2 py-1.5 text-left font-semibold uppercase tracking-wider text-zinc-500">Asli lalu hasil ekspor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.changedLines.map((line) => (
                        <tr key={line.lineNo} className="border-t border-zinc-100 align-top">
                          <td className="px-2 py-1.5 font-mono tabular-nums text-zinc-400">{String(line.lineNo).padStart(2, "0")}</td>
                          <td className="px-2 py-1.5 font-mono leading-4">
                            <span className="block text-zinc-400 line-through">{line.original || "(disisipkan baru)"}</span>
                            <span className="block text-red-700">{line.modified || "(dihapus)"}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-[12px] text-emerald-800">
                  Tidak terdapat selisih baris. Naskah identik dengan versi tersegel.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 px-4 py-3">
        <p className="max-w-xl text-[11px] leading-4 text-zinc-500">
          {result
            ? tampered
              ? `Perubahan ${result.lineCountDelta >= 0 ? "+" : ""}${result.lineCountDelta} baris mengubah ${result.avalancheBits} dari 256 bit — bukti matematis bahwa isi sudah diubah setelah pengesahan.`
              : "Integritas naskah terkonfirmasi sesuai segel."
            : "SHA-256 dihitung langsung di peramban via Web Crypto; tidak ada data yang dikirim ke server."}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={reset} className="rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
            Reset
          </button>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="rounded-[var(--radius-md)] bg-zinc-900 px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-700 disabled:opacity-60"
          >
            {busy ? "Menghitung…" : "Analisis integrasi"}
          </button>
        </div>
      </footer>
    </div>
  );
}
