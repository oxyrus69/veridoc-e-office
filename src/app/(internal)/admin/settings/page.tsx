import { redirect } from "next/navigation";
import { Database, Save, Settings as SettingsIcon } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import ActionForm from "@/components/ui/ActionForm";
import { getSettings } from "@/server/services/settings";
import { databaseModeLabel } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { canAccess } from "@/server/auth";

export const dynamic = "force-dynamic";

const FIELDS: { key: string; label: string; hint: string; type?: "number" | "text" | "url" | "boolean" }[] = [
  { key: "org_name", label: "Nama instansi", hint: "Dicetak pada kop setiap naskah dinas." },
  { key: "org_unit", label: "Unit penerbit default", hint: "Dipakai bila penyusun tidak mengganti departemen." },
  { key: "verify_base_url", label: "Basis URL verifikasi", hint: "Dipakai untuk membentuk URL QR publik. Gunakan http(s):// dan tanpa garis miring di akhir.", type: "url" },
  { key: "sla_hours_per_step", label: "SLA paraf per tahap (jam)", hint: "Menentukan sla_due_at pada tahap baru sesudah paraf.", type: "number" },
  { key: "retain_audit_days", label: "Retensi jejak audit (hari)", hint: "Kebijakan penyimpanan; tidak menghapus data secara otomatis.", type: "number" },
  { key: "require_pin_final", label: "Wajib PIN pada paraf final", hint: "true/false. Nilai false tidak disarankan.", type: "boolean" },
];

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/admin/settings")) redirect("/admin");

  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Pengaturan Sistem"
        description="Nilai dibaca langsung oleh engine pada setiap request. Perubahan langsung berlaku untuk dokumen baru."
        actions={<Badge tone="neutral" mono>{databaseModeLabel()}</Badge>}
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <SectionCard title="Kebijakan naskah" subtitle="Nilai kunci pada tabel app_settings" padded={false}>
              <ul className="divide-y divide-zinc-100">
                {FIELDS.map((field) => (
                  <li key={field.key} className="px-4 py-3">
                    <ActionForm action="settings:save" className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="key" value={field.key} />
                      <input type="hidden" name="label" value={field.label} />
                      <label className="min-w-0 flex-1">
                        <span className="block text-[12px] font-medium text-zinc-700">{field.label}</span>
                        <span className="mt-0.5 block text-[11px] text-zinc-500">{field.hint}</span>
                        <input
                          name="value"
                          defaultValue={settings[field.key] ?? ""}
                          type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
                          className="mt-1.5 w-full max-w-md rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                        />
                        <span className="mt-1 block font-mono text-[10px] text-zinc-400">{field.key}</span>
                      </label>
                      <button type="submit" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
                        <Save className="h-3.5 w-3.5" /> Simpan
                      </button>
                    </ActionForm>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>

          <div className="space-y-4">
            <SectionCard title="Mode basis data" subtitle="Dipilih otomatis dari environment">
              <div className="space-y-2.5 text-[12px] leading-5">
                <p className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-zinc-400" />
                  <span className="font-medium text-zinc-800">{databaseModeLabel()}</span>
                </p>
                <p className="text-zinc-600">
                  Bila variabel <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">DATABASE_URL</code> diawali{" "}
                  <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">postgres://</code>, sistem beralih ke server PostgreSQL.
                  Tanpa itu, PGlite lokal di <code className="rounded bg-zinc-100 px-1 font-mono text-[11px]">.data/pglite</code> digunakan.
                </p>
                <p className="text-[11px] text-zinc-500">Skema identik; migrasi dan seed bekerja pada kedua mode.</p>
              </div>
            </SectionCard>

            <SectionCard title="Rahasia kriptografi" subtitle="Variabel environment (tidak dapat diubah dari UI)">
              <ul className="space-y-2 text-[11px] leading-4">
                <li><code className="font-mono text-zinc-700">VERIDOC_KEY_SECRET</code><span className="block text-zinc-500">Kunci AES-256-GCM untuk envelope kunci privat.</span></li>
                <li><code className="font-mono text-zinc-700">VERIDOC_SESSION_SECRET</code><span className="block text-zinc-500">HMAC untuk cookie sesi.</span></li>
                <li><code className="font-mono text-zinc-700">DATABASE_URL</code><span className="block text-zinc-500">Opsional, mengaktifkan mode PostgreSQL.</span></li>
              </ul>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-700">
                <SettingsIcon className="h-3 w-3" /> Nilai default demo harus diganti sebelum produksi.
              </p>
            </SectionCard>
          </div>
        </div>
      </PageBody>
    </>
  );
}
