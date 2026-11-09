import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getDb, schema } from "@/server/db";
import { roleHome } from "@/server/auth";
import { login, getCurrentUser, listDemoAccounts } from "@/server/session";
import "./login.css";

export const metadata: Metadata = {
  title: "Masuk — VeriDoc",
};

const ROLE_BADGE: Record<string, { label: string; detail: string }> = {
  SUPER_ADMIN: { label: "Super Admin", detail: "Kelola seluruh modul, sertifikat, SLA, dan DSS" },
  EXECUTIVE_SIGNER: { label: "Penandatangan Eksekutif", detail: "Setujui dengan PIN & terbitkan nomor surat" },
  REVIEWER_LEGAL_FINANCE: { label: "Reviewer Legal & Keuangan", detail: "Paraf draf sebelum naik ke direksi" },
  DOCUMENT_CREATOR: { label: "Penyusun Dokumen", detail: "Susun draf, unggah revisi, tindaklanjuti disposisi" },
  AUDITOR_COMPLIANCE: { label: "Auditor Kepatuhan", detail: "Baca seluruh rantai tanda tangan & log pencabutan" },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next } = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(next ?? roleHome(user.r));

  const accounts = await listDemoAccounts();

  async function submit(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const redirectTo = String(formData.get("next") ?? "");
    if (password.length === 0) {
      redirect(`/login?error=${encodeURIComponent("Kata sandi wajib diisi")}${redirectTo ? `&next=${encodeURIComponent(redirectTo)}` : ""}`);
    }
    const result = await login(email, password);
    if (!result.ok) {
      redirect(`/login?error=${encodeURIComponent(result.message)}${redirectTo ? `&next=${encodeURIComponent(redirectTo)}` : ""}`);
    }
    redirect(redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//") ? redirectTo : result.home);
  }

  const { error } = await searchParams;

  return (
    <main className="login-page bg-[var(--bg-canvas)]">
      <div className="mx-auto grid min-h-screen max-w-5xl grid-cols-1 gap-8 px-4 py-8 md:grid-cols-[1.05fr_1fr] md:items-center">
        {/* Left rail — product pitch + demo accounts */}
        <section>
          <a href="/" className="inline-flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--seal)] font-mono text-sm font-bold text-white">
              Vd
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight text-zinc-900">VeriDoc</p>
              <p className="text-xs leading-4 text-zinc-500">E-Office & verifikasi kriptografis</p>
            </div>
          </a>

          <h1 className="mt-8 text-3xl font-bold tracking-tight text-zinc-900 md:text-4xl">
            Masuk untuk memparaf, menerbitkan, dan mengawasi rantai tanda tangan.
          </h1>
          <p className="mt-3 max-w-md text-[15px] leading-6 text-zinc-600">
            Setiap peran memiliki hak yang berbeda: penyusun mengirim draf, reviewer memparaf, direksi
            menyegel, dan auditor membaca bukti tanpa bisa mengubah apa pun.
          </p>

          <div className="mt-6 space-y-2.5 rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Akun demo</p>
            {accounts.map((account) => (
              <div key={account.email} className="flex flex-col justify-between gap-1 border-b border-zinc-100 pb-2.5 last:border-0 last:pb-0 sm:flex-row sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-medium text-zinc-800">{account.fullName}</p>
                  <p className="truncate font-mono text-[11px] text-zinc-500">{account.email}</p>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <p className="text-[11px] font-semibold text-zinc-700">{ROLE_BADGE[account.role]?.label ?? account.role}</p>
                  <p className="max-w-[220px] text-[11px] leading-4 text-zinc-500 sm:ml-auto">{ROLE_BADGE[account.role]?.detail}</p>
                </div>
              </div>
            ))}
            <div className="mt-1 rounded-[var(--radius-sm)] border border-amber-200/70 bg-amber-50/70 px-3 py-2 text-[11px] leading-4 text-amber-800">
              Semua akun menggunakan kata sandi <code className="font-mono">veridoc123</code> dan PIN tanda tangan{" "}
              <code className="font-mono">123456</code>.
            </div>
          </div>
        </section>

        {/* Right rail — form */}
        <section className="w-full">
          <form
            action={submit}
            className="w-full rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-6 shadow-sm"
            noValidate
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[19px] font-semibold tracking-tight text-zinc-900">Masuk</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Sesi aktif 12 jam; aksi sensitif selalu mengecek peran.</p>
              </div>
              <span className="rounded-[var(--radius-sm)] border border-[var(--seal-border)] bg-[var(--seal-soft)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--seal)]">
                demo build
              </span>
            </div>

            {error ? (
              <div role="alert" className="mt-4 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-4 text-red-700">
                {error}
              </div>
            ) : null}

            <input type="hidden" name="next" value={next ?? ""} />

            <label className="mt-5 block">
              <span className="text-xs font-medium text-zinc-600">Email</span>
              <input
                type="email"
                name="email"
                required
                autoComplete="email"
                placeholder="direktur@veridoc.id"
                className="mt-1.5 block h-10 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-medium text-zinc-600">Kata sandi</span>
              <input
                type="password"
                name="password"
                required
                autoComplete="current-password"
                placeholder="veridoc123"
                className="mt-1.5 block h-10 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
              />
            </label>

            <button
              type="submit"
              className="mt-6 flex h-10 w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              Masuk ke dasbor
            </button>

            <p className="mt-3 text-center text-xs leading-4 text-zinc-500">
              Tanpa login, masih bisa{" "}
              <a href="/verify" className="font-medium text-[var(--accent-interactive)] hover:underline">
                memverifikasi dokumen QR
              </a>
              .
            </p>
          </form>

          <div className="mt-4 rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Login cepat untuk uji coba</p>
            <div className="mt-3 grid grid-cols-1 gap-2">
              {accounts.slice(1, 4).map((account) => (
                <form key={account.email} action={submit} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/50 px-3 py-2">
                  <input type="hidden" name="email" value={account.email} />
                  <input type="hidden" name="password" value="veridoc123" />
                  <input type="hidden" name="next" value={next ?? ""} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-zinc-800">{account.email}</p>
                    <p className="text-[11px] text-zinc-500">{ROLE_BADGE[account.role]?.label}</p>
                  </div>
                  <button
                    type="submit"
                    className="shrink-0 rounded-[var(--radius-sm)] border border-zinc-300 bg-white px-2.5 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Masuk
                  </button>
                </form>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
