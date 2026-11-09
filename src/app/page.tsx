import Link from "next/link";
import { ShieldCheck, ArrowRight } from "lucide-react";

export const metadata = {
  title: "VeriDoc — E-Office & Verifikasi Dokumen Kriptografis",
  description:
    "Tata naskah dinas elektronik dengan persetujuan berjenjang, rantai tanda tangan SHA-256, dan portal verifikasi QR publik.",
};

const counts = [
  ["3", "Naskah tersegel & siap diverifikasi"],
  ["2", "Dokumen menunggu paraf"],
  ["1", "Disposisi mendesak lewat tenggat"],
  ["1", "Sertifikat kunci perlu rotasi"],
];

export default function LandingPage() {
  return (
    <main className="bg-[var(--bg-canvas)] text-zinc-900">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--seal)] font-mono text-sm font-bold text-white">
              Vd
            </div>
            <div>
              <p className="text-[13px] font-semibold tracking-tight">VeriDoc</p>
              <p className="text-[11px] leading-4 text-zinc-500">E-Office & verifikasi kriptografis</p>
            </div>
          </div>
          <nav className="flex items-center gap-2 text-[13px] font-medium">
            <Link href="/verify" className="rounded-[var(--radius-md)] px-3 py-1.5 text-zinc-600 hover:bg-zinc-100">
              Verifikasi dokumen
            </Link>
            <Link
              href="/login"
              className="rounded-[var(--radius-md)] border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50"
            >
              Masuk
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 pb-16 pt-12 md:pt-16">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--seal-border)] bg-[var(--seal-soft)] px-3 py-1 text-[12px] font-medium text-[var(--seal)]">
            <ShieldCheck className="h-3.5 w-3.5" />
            setiap isi naskah terikat pada segel matematis
          </p>
          <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-[2.6rem] md:leading-[1.08]">
            Paraf berjenjang, nomor surat otomatis, dan QR bukti keaslian untuk setiap naskah dinas.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-6 text-zinc-600">
            VeriDoc menggabungkan workflow persetujuan bertingkat dengan rantai tanda tangan kriptografis
            (SHA-256 + RSA-PSS) sehingga satu karakter yang diubah setelah pengesahan membuat dokumen
            langsung terdeteksi sebagai dipalsukan.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/verify"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
            >
              Verifikasi kode QR sekarang
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
            >
              Buka dasbor tata kelola
            </Link>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Demo: masuk dengan salah satu akun di halaman masuk (kata sandi <code className="font-mono">veridoc123</code>, PIN paraf{" "}
            <code className="font-mono">123456</code>).
          </p>
        </div>
      </section>

      {/* Live numbers */}
      <section className="border-y border-zinc-200/80 bg-white">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-px overflow-hidden rounded-b-none md:grid-cols-4">
          {counts.map(([value, label]) => (
            <div key={label} className="border border-zinc-200/70 px-4 py-5">
              <p className="font-mono text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
              <p className="mt-1 text-[12px] leading-4 text-zinc-600">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Mechanism */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <div className="grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-start">
          <div>
            <h2 className="text-[19px] font-semibold tracking-tight">Bagaimana segel VeriDoc bekerja</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Setiap paraf bukan sekadar stempel visual. VeriDoc menautkan isi naskah, identitas pejabat,
              dan waktu paraf dengan matematika rantai hash sehingga tidak bisa diubah tanpa terlihat.
            </p>
            <div className="mt-5 rounded-[var(--radius-lg)] border border-zinc-200 bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Formula segel</p>
              <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-[11px] leading-5 text-zinc-100">
{`H(doc) = SHA256( CanonicalJSON(metadata) || Body )
S(i)   = HMAC-SHA256_{PIN_i}( H(doc) | S(i-1) | ID_i | T_i )
S  →  RSA-PSS_{PEM_i}`}
              </pre>
            </div>
          </div>

          <ol className="relative space-y-4 border-l-2 border-zinc-200 pl-5">
            {[
              ["01", "Draf disusun dari template", "Variabel dinamis, nomor resmi, dan SLA per tahap diambil dari template naskah."],
              ["02", "Reviewer legal & keuangan memparaf", "PIN tanda tangan memverifikasi pejabat; HMAC menautkan isi ke paraf sebelumnya."],
              ["03", "Direktur membubuhkan tanda tangan final", "Sistem menerbitkan nomor surat resmi, mengunci isi, dan menempelkan kunci RSA."],
              ["04", "Publik memverifikasi lewat QR", "Portal publik merekonstruksi hash dan membandingkan segelnya — 1 karakter berubah, status langsung TAMPERED."],
            ].map(([step, title, body]) => (
              <li key={step} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[31px] top-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-[var(--accent-primary)] font-mono text-[9px] font-bold text-white"
                >
                  {step}
                </span>
                <p className="text-[13px] font-semibold text-zinc-900">{title}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-zinc-600">{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Tamper demo band */}
      <section className="border-t border-zinc-200/80 bg-zinc-950 text-white">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-12 md:grid-cols-2 md:items-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">uji ketahanan</p>
            <h2 className="mt-2 text-[19px] font-semibold tracking-tight">Ubah satu angka? Segel langsung patah.</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-300">
              Ubah <span className="rounded bg-zinc-800 px-1 font-mono text-[12px]">Rp 150.000.000</span> menjadi{" "}
              <span className="rounded bg-zinc-800 px-1 font-mono text-[12px]">Rp 150.000.001</span> di dalam
              Tamper Detection Lab; sistem akan menunjukkan baris perubahan dan hash sha-256 yang benar-benar
              berbeda.
            </p>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-zinc-800 bg-zinc-900 p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-400">contoh diff</p>
            <pre className="mt-2 overflow-x-auto rounded bg-zinc-950 p-3 font-mono text-[12px] leading-5 text-zinc-300">
{`- Nilai kontrak : Rp 150.000.000
+ Nilai kontrak : Rp 150.000.001
  SHA-256 asli  : 4d78…91c2
  SHA-256 hasil : 8ae0…3f71
  STATUS        : TAMPERED`}
            </pre>
            <Link
              href="/verify/VRD-2026-8F92A1?tab=lab"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-orange-300 hover:text-orange-200"
            >
              Buka Tamper Detection Lab
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-zinc-500">
        <p>VeriDoc — sistem tata naskah dinas elektronik & bukti keaslian kriptografis.</p>
        <div className="flex items-center gap-3">
          <Link href="/verify" className="hover:underline">
            Publik
          </Link>
          <Link href="/login" className="hover:underline">
            Masuk internal
          </Link>
        </div>
      </footer>
    </main>
  );
}
