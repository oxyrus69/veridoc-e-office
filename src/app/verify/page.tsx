import Link from "next/link";
import { ShieldCheck, ArrowRight, QrCode, FileSearch, LockKeyhole } from "lucide-react";
import { verifyByCode, listRecentScans, scanStats, logScan } from "@/server/services/verificationEngine";
import { ResultBadge } from "./result-ui";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Verifikasi Publik — VeriDoc",
  description: "Cek keaslian naskah dinas dengan kode verifikasi atau QR.",
};

const DEMO_CODES = [
  { code: "VRD-2026-8F92A1", hint: "SK Panitia Dies Natalis (valid)" },
  { code: "VRD-2026-C0DE77", hint: "SK Kepanitiaan Kearsipan (dicabut)" },
  { code: "VRD-2026-6E13AC", hint: "Kontrak Genset (belum tersegel)" },
  { code: "VRD-0000-000000", hint: "Kode tidak dikenal (demo)" },
];

export default async function VerifyPortal({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const [stats, recent] = await Promise.all([scanStats(), listRecentScans(6)]);

  // A scan is only recorded when a code is submitted on purpose: a direct visit
  // to /verify (no `code`) just shows the portal, never a log entry.
  const preview = code ? await verifyByCode(code) : null;
  if (preview) {
    await logScan({
      verificationCode: code!.trim().toUpperCase(),
      documentId: preview.document?.id ?? null,
      result: preview.scanResult,
      summary: preview.headline,
    }).catch(() => undefined);
  }

  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <Link href="/verify" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--seal)] font-mono text-sm font-bold text-white">
              Vd
            </span>
            <span>
              <span className="block text-[13px] font-semibold leading-4 tracking-tight">VeriDoc</span>
              <span className="block text-[11px] leading-4 text-zinc-500">Publik Verifikasi Portal</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-[13px] font-medium text-zinc-600">
            <Link href="/" className="rounded-[var(--radius-md)] px-3 py-1.5 hover:bg-zinc-100">
              Beranda
            </Link>
            <Link href="/login" className="rounded-[var(--radius-md)] border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50">
              Masuk internal
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[12px] font-medium text-emerald-800">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verifikasi tanpa login — rantai tanda tangan diverifikasi ulang setiap kali
          </p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl md:leading-[1.1]">
            Scan. Masukan kodu. Dapatkan keabsahan naskah.
          </h1>
          <p className="mt-3 text-[15px] leading-6 text-zinc-600">
            Tiap naskah dinas tersegel punya satu kode verifikasi di QR-nya. {stats.total} kali pemindaian
            tercatat dari portal ini — {stats.valid} valid, {stats.tampered} dipalsukan, {stats.revoked} dicabut.
          </p>
        </div>

        <form action="/verify" method="GET" className="mt-8 flex max-w-xl items-center gap-2 rounded-[var(--radius-md)] border border-zinc-300 bg-white p-2 shadow-sm focus-within:border-[var(--accent-interactive)]">
          <FileSearch className="ml-2 h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
          <input
            type="search"
            name="code"
            defaultValue={code ?? ""}
            placeholder="VRD-2026-8F92A1"
            className="h-9 min-w-0 flex-1 bg-transparent font-mono text-sm tracking-wide text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            aria-label="Kode verifikasi"
          />
          <button
            type="submit"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
          >
            Verifikasi
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="mt-2.5 text-xs text-zinc-500">
          Coba salah satu kode demo:{" "}
          {DEMO_CODES.map((item, index) => (
            <span key={item.code}>
              {index > 0 ? " · " : ""}
              <Link href={`/verify/${item.code}`} className="font-mono font-medium text-[var(--accent-interactive)] hover:underline" title={item.hint}>
                {item.code}
              </Link>
            </span>
          ))}
        </p>

        {preview ? (
          <div className="mt-8 max-w-3xl">
            <ResultBadge outcome={preview} compact />
          </div>
        ) : null}

        <section className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { icon: QrCode, title: "1. Temukan QR", body: "QR tertera di lembar final naskah, memuat kode VRD-YYYY-XXXXXX dan alamat verifikasi." },
            { icon: ShieldCheck, title: "2. Pindai atau ketik", body: "Halaman verifikasi akan merekonstruksi SHA-256 dari seluruh baris naskah dan membandingkannya dengan segel." },
            { icon: LockKeyhole, title: "3. Tandatangani RSA", body: "Setiap paraf diauterisasi dengan kunci publik penandatangan. Jika satu karakter berubah, status langsung TAMPERED." },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white px-4 py-4">
                <Icon className="h-4 w-4 text-zinc-400" aria-hidden />
                <p className="mt-2.5 text-[13px] font-semibold text-zinc-900">{item.title}</p>
                <p className="mt-1 text-[12px] leading-5 text-zinc-600">{item.body}</p>
              </div>
            );
          })}
        </section>

        <section className="mt-8 rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
          <header className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3">
            <h2 className="text-[13px] font-semibold tracking-tight">Pemindaian terakhir</h2>
            <span className="rounded-[var(--radius-sm)] bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-zinc-600">{stats.total} total</span>
          </header>
          <ul className="divide-y divide-zinc-100">
            {recent.length === 0
              ? ([
                  <li key="empty" className="px-4 py-8 text-center text-sm text-zinc-500">
                    Belum ada pemindaian. Verifikasi kode pertama Anda.
                  </li>,
                ] as React.ReactNode[])
              : recent.map((scan) => (
                  <li key={scan.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[13px] font-medium text-zinc-900">{scan.verificationCode}</p>
                      <p className="truncate text-[11px] text-zinc-500">{scan.documentTitle ?? "Dokumen tidak terdaftar"}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`font-mono text-[11px] font-bold tracking-wide ${
                          scan.result === "VALID" ? "text-emerald-700" : scan.result === "REVOKED" ? "text-amber-700" : scan.result === "TAMPERED" ? "text-red-700" : "text-zinc-500"
                        }`}
                      >
                        {scan.result}
                      </span>
                      <span className="w-20 text-right text-[11px] text-zinc-400">{formatClock(scan.scannedAt)}</span>
                    </div>
                  </li>
                ))}
          </ul>
        </section>

        <Link href="/verify/VRD-2026-8F92A1?tab=lab" className="mt-8 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent-interactive)] hover:underline">
          Buka Tamper Detection Lab
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <footer className="border-t border-zinc-200/80 py-6 text-center text-xs text-zinc-500">
        Portal verifikasi publik VeriDoc · segel kriptografis SHA-256 + RSA-PSS
      </footer>
    </main>
  );
}

function formatClock(value: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);
}
