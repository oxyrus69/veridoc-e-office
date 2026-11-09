import { redirect } from "next/navigation";
import { KeyRound, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { KpiStatCard } from "@/components/ui/KpiStatCard";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import ActionForm from "@/components/ui/ActionForm";
import { listCertificates } from "@/server/services/cryptoSealEngine";
import { getCurrentUser } from "@/server/session";
import { ROLE_LABEL, formatDate } from "@/lib/labels";
import type { UserRole } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const certs = await listCertificates();
  const expiredSoon = certs.filter((c) => c.daysToExpiry <= 60).length;
  const revoked = certs.filter((c) => c.status === "REVOKED").length;
  const canManage = user.r === "SUPER_ADMIN";
  const canSeeKeys = canManage || user.r === "AUDITOR_COMPLIANCE";

  return (
    <>
      <PageHeader
        title="Sertifikat Penandatangan"
        count={certs.length}
        description="Setiap pejabat menandatangani dengan pasangan kunci RSA-PSS 2048-bit. Kunci privat dienkripsi AES-256-GCM; PIN tidak pernah disimpan mentah."
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <KpiStatCard label="Sertifikat aktif" value={String(certs.filter((c) => c.status === "ACTIVE").length)} tone="success" footer="Dapat dipakai untuk memparaf tahap" />
          <KpiStatCard label="Perlu rotasi (≤ 60 hari)" value={String(expiredSoon)} tone={expiredSoon ? "warning" : "success"} footer="Rotasi menerbitkan pasangan kunci baru" />
          <KpiStatCard label="Dicabut" value={String(revoked)} tone={revoked ? "danger" : "success"} footer="Kunci dicabut tidak diterima sistem audit" />
        </div>

        <div className="mt-4 space-y-4">
          {certs.map((cert) => {
            const expiresInLabel = cert.daysToExpiry < 0 ? `kedaluwarsa ${Math.abs(cert.daysToExpiry)} hari lalu` : `${cert.daysToExpiry} hari lagi`;
            const tone = cert.status === "REVOKED" ? "danger" : cert.daysToExpiry <= 30 ? "danger" : cert.daysToExpiry <= 60 ? "warning" : "success";
            return (
              <section key={cert.certificateId} className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
                <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200/80 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900">{cert.fullName}</h2>
                      <Badge tone={cert.status === "REVOKED" ? "danger" : "success"}>{cert.status}</Badge>
                      <Badge tone="neutral">{ROLE_LABEL[cert.role as UserRole] ?? cert.role}</Badge>
                    </div>
                    <p className="mt-0.5 text-[12px] text-zinc-500">
                      {cert.jobTitleOfficial} · {cert.department}
                    </p>
                  </div>
                  <Badge tone={tone}>
                    {cert.status === "REVOKED" ? "dicabut" : `berlaku ${expiresInLabel}`}
                  </Badge>
                </header>

                <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[1.4fr_1fr]">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Fingerprint kunci publik (SHA-256)</p>
                    <p className="mt-1 break-all font-mono text-[11px] leading-5 text-zinc-700">{cert.formattedFingerprint}</p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                      <span>Terbit {formatDate(cert.issuedAt)}</span>
                      <span>Berakhir {formatDate(cert.expiresAt)}</span>
                      <span>Rotasi terakhir {formatDate(cert.lastRotatedAt)}</span>
                    </p>
                  </div>

                  {canSeeKeys ? (
                    <details className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/60 px-3 py-2">
                      <summary className="flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-zinc-700">
                        <KeyRound className="h-3.5 w-3.5 text-zinc-400" /> Lihat kunci publik (PEM)
                      </summary>
                      <pre className="thin-scroll mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px] leading-4 text-zinc-600">
                        {cert.publicKeyPem}
                      </pre>
                    </details>
                  ) : null}
                </div>

                <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/80 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                    {cert.daysToExpiry <= 30 ? (
                      <>
                        <ShieldAlert className="h-3.5 w-3.5 text-red-500" /> Segera rotasi agar tanda tangan tetap sah setelah masa berlaku habis.
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Kunci dalam masa berlaku sehat.
                      </>
                    )}
                  </p>

                  {canManage && cert.status === "ACTIVE" ? (
                    <ActionForm action="certificate:rotation" className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="certificateId" value={cert.certificateId} />
                      <label className="block">
                        <span className="text-[11px] font-medium text-zinc-600">PIN pejabat</span>
                        <input
                          name="pin"
                          required
                          inputMode="numeric"
                          minLength={6}
                          maxLength={6}
                          pattern="[0-9]{6}"
                          autoComplete="off"
                          className="mt-0.5 w-28 rounded-[var(--radius-sm)] border border-zinc-300 bg-white px-2 py-1.5 font-mono text-[13px] tracking-[0.3em] focus:border-[var(--accent-interactive)] focus:outline-none"
                        />
                      </label>
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
                        <RefreshCw className="h-3.5 w-3.5" /> Rotasi kunci
                      </button>
                    </ActionForm>
                  ) : null}
                </footer>
              </section>
            );
          })}
          {certs.length === 0 ? (
            <p className="rounded-[var(--radius-lg)] border border-dashed border-zinc-300 bg-white px-4 py-12 text-center text-sm text-zinc-500">
              Belum ada sertifikat terbit.
            </p>
          ) : null}
        </div>

        <div className="mt-4">
          <SectionCard title="Cara kerja sertifikat" subtitle="Alur teknis yang dijalankan setiap paraf">
            <ol className="space-y-2 text-[12px] leading-5 text-zinc-700">
              <li><strong>1.</strong> PIN di-hash scrypt dengan salt unik per akun; nilai asli tidak pernah disimpan.</li>
              <li><strong>2.</strong> Saat memparaf, PIN diverifikasi lalu diturunkan menjadi HMAC key tahap: <code className="font-mono text-[11px]">SHA-256(PIN:fingerprint)</code>.</li>
              <li><strong>3.</strong> Tanda tangan tahap dihitung dari hash isi, tanda tangan sebelumnya, ID pejabat, dan waktu.</li>
              <li><strong>4.</strong> Kunci privat (AES-256-GCM) menandatangani hash rantai dengan RSA-PSS salt 32.</li>
              <li><strong>5.</strong> Auditor memverifikasi dengan kunci publik; perubahan apa pun membuat salah satu langkah gagal.</li>
            </ol>
          </SectionCard>
        </div>
      </PageBody>
    </>
  );
}
