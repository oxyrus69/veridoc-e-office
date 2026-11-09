import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Clock3, SendHorizonal } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { SectionCard } from "@/components/ui/Panel";
import ActionForm from "@/components/ui/ActionForm";
import { listTemplates, buildDefaultWorkflow, renderTemplateBody } from "@/server/services/templateEngine";
import { getCurrentUser } from "@/server/session";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { CATEGORY_LABEL } from "@/lib/labels";
import type { TemplateVariable } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function ComposePage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.r !== "DOCUMENT_CREATOR" && user.r !== "SUPER_ADMIN") redirect("/documents");

  const { template: templateCode } = await searchParams;
  const db = await getDb();

  const templates = await listTemplates();
  // Pilih template dari query string, jika tidak ada ambil yang aktif terlebih dahulu,
  // dan terakhir pakai template apa saja yang ada.
  const activeTemplate =
    templates.find((t) => t.code === templateCode) ??
    templates.find((t) => t.isActive) ??
    templates[0];
  if (!activeTemplate) redirect("/templates");

  const approvers = await db
    .select({
      id: schema.profiles.id,
      fullName: schema.profiles.fullName,
      jobTitle: schema.profiles.jobTitle,
      role: schema.profiles.role,
    })
    .from(schema.profiles)
    .where(eq(schema.profiles.isActive, true))
    .orderBy(schema.profiles.fullName);

  const template = activeTemplate;

  const variables = (template.variablesSchemaJson ?? []) as TemplateVariable[];
  const defaultFlow = buildDefaultWorkflow();
  const sampleVars: Record<string, unknown> = {
    nomor_surat: "(menunggu nomor resmi)",
    org_name: "VeriDoc Nusantara",
  };
  for (const v of variables) sampleVars[v.key] = "";
  const previewBody = renderTemplateBody(template.bodyMarkdownTemplate, sampleVars);

  return (
    <>
      <PageHeader
        title="Studio Penyusunan Naskah"
        description={`Template ${template.code} — ${template.name}. Nomor resmi diterbitkan otomatis oleh sistem setelah pengesahan final tuntas (format ${template.numberPrefixFormat}).`}
        actions={
          <Link
            href="/templates"
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[13px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Boxes className="h-4 w-4" /> Ganti template
          </Link>
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          {/* form */}
          <ActionForm action="compose:submit" className="space-y-4 self-start">
            <input type="hidden" name="templateId" value={template.id} />

            <SectionCard title="Identitas naskah" subtitle="Metadata computed ke hash segel saat submit">
              <div className="space-y-3">
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Judul naskah</span>
                  <input
                    name="title"
                    required
                    placeholder="mis. Surat Keputusan Penetapan Tim Audit Internal"
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                  />
                </label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Unit / departemen</span>
                    <input
                      name="departmentName"
                      defaultValue={user.department}
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Kerahasiaan</span>
                    <select
                      name="confidentiality"
                      defaultValue="INTERNAL"
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                    >
                      <option value="PUBLIC">PUB</option>
                      <option value="INTERNAL">INTERNAL</option>
                      <option value="CONFIDENTIAL">RAHASIA</option>
                      <option value="STRICTLY_SECRET">SANGAT RAHASIA</option>
                    </select>
                  </label>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Berlaku sejak</span>
                    <input
                      type="date"
                      name="effectiveFrom"
                      defaultValue={new Date().toISOString().slice(0, 10)}
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-zinc-600">Berlaku hingga (opsional)</span>
                    <input
                      type="date"
                      name="effectiveUntil"
                      className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                    />
                  </label>
                </div>
              </div>
            </SectionCard>

            {variables.length > 0 ? (
              <SectionCard title="Variabel naskah" subtitle={`Dipakai untuk render isian saat preview; wajib ${variables.filter((v) => v.required).length} isian wajib`}>
                <div className="space-y-3">
                  {variables.map((variable) => (
                    <label key={variable.key} className="block">
                      <span className="flex items-center gap-2 text-xs font-medium text-zinc-600">
                        {variable.label}
                        {variable.required ? <span className="text-red-500">*</span> : <span className="font-normal text-zinc-400">opsional</span>}
                        <span className="ml-auto font-mono text-[10px] text-zinc-400">{variable.key}</span>
                      </span>
                      {variable.type === "textarea" ? (
                        <textarea
                          name={`var__${variable.key}`}
                          required={variable.required}
                          rows={3}
                          className="thin-scroll mt-1 w-full resize-y rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                        />
                      ) : variable.type === "date" ? (
                        <input
                          type="date"
                          name={`var__${variable.key}`}
                          required={variable.required}
                          className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                        />
                      ) : variable.type === "currency" ? (
                        <input
                          name={`var__${variable.key}`}
                          required={variable.required}
                          placeholder="Rp 125.000.000"
                          className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 font-mono text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                        />
                      ) : (
                        <input
                          name={`var__${variable.key}`}
                          type={variable.type === "number" ? "number" : "text"}
                          required={variable.required}
                          className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                        />
                      )}
                    </label>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard title="Alur persetujuan" subtitle="Tahap-tahap yang akan menandatangani serially; SLA diambil dari template">
              <ol className="space-y-3">
                {[1, 2, 3].map((stepIndex) => {
                  const seed = template.defaultWorkflowStepsJson[stepIndex - 1] ?? defaultFlow[stepIndex - 1];
                  return (
                    <li key={stepIndex} className="flex flex-wrap items-end gap-3 rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/50 px-3 py-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 font-mono text-[11px] font-bold text-white">{stepIndex}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-zinc-800">{seed?.name ?? `Tahap ${stepIndex}`}</p>
                        <p className="text-[11px] text-zinc-500">
                          {seed?.mode === "SEQUENTIAL" ? "berurutan" : seed?.mode === "PARALLEL_ANY" ? "paralel cukup satu" : "paralel semua"} · SLA {seed?.slaHours ?? 24} jam
                        </p>
                      </div>
                      <label className="block w-56">
                        <span className="sr-only">Penyetuju tahap {stepIndex}</span>
                        <select
                          name={`step${stepIndex}_approver`}
                          className="w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[12px] focus:border-[var(--accent-interactive)] focus:outline-none"
                        >
                          <option value="">— pilih penyetuju —</option>
                          {approvers
                            .filter((a) => a.role === "EXECUTIVE_SIGNER" || a.role === "REVIEWER_LEGAL_FINANCE" || (stepIndex < 3 && a.role === "SUPER_ADMIN"))
                            .map((approver) => (
                              <option key={approver.id} value={approver.id}>
                                {approver.fullName} · {approver.jobTitle}
                              </option>
                            ))}
                        </select>
                      </label>
                    </li>
                  );
                })}
              </ol>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                <p className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <Clock3 className="h-3.5 w-3.5" />
                  SLA {template.slaHoursPerStep} jam/tahap; denda kebijakan internal jika terlampaui.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    className="rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    Simpan sebagai draf
                  </button>
                  <button
                    type="submit"
                    name="submitNow"
                    value="1"
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
                  >
                    <SendHorizonal className="h-3.5 w-3.5" /> Buat & ajukan ke persetujuan
                  </button>
                </div>
              </div>
            </SectionCard>
          </ActionForm>

          {/* live preview */}
          <div className="space-y-4 self-start">
            <SectionCard title="Template yang dipakai" subtitle={`${template.name} · ${CATEGORY_LABEL[template.category]}`}>
              <div className="space-y-2 text-[12px] leading-5">
                <p className="flex items-center justify-between">
                  <span className="text-zinc-500">Format nomor</span>
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px]">{template.numberPrefixFormat}</code>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-zinc-500">SLA standar</span>
                  <span className="font-mono text-zinc-700">{template.slaHoursPerStep} jam/tahap</span>
                </p>
                <p className="flex items-center justify-between">
                  <span className="text-zinc-500">Variabel</span>
                  <span className="font-mono text-zinc-700">{variables.length}</span>
                </p>
              </div>
            </SectionCard>

            <SectionCard title="Preview naskah" subtitle="Dihidup saat submit: placeholder perubahan akan dihitung ke SHA-256 segel">
              <div className="naskah max-h-[480px] overflow-y-auto thin-scroll rounded-[var(--radius-md)] border border-zinc-200 bg-white p-6 text-[12px] leading-5">
                {previewBody.split("\n").map((line, i) => {
                  if (!line.trim()) return <div key={i} className="h-1" aria-hidden />;
                  if (line.startsWith("## ")) return <p key={i} className="pt-1 text-center text-[13px] font-bold uppercase">{line.slice(3)}</p>;
                  if (line.startsWith("### ")) return <p key={i} className="text-center text-[12px] font-semibold">{line.slice(4)}</p>;
                  return (
                    <p key={i} className="indent-7 text-justify">
                      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                        part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
                      )}
                    </p>
                  );
                })}
              </div>
            </SectionCard>

            <div className="rounded-[var(--radius-md)] border border-[var(--seal-border)] bg-[var(--seal-soft)] px-4 py-3 text-[11px] leading-4 text-[var(--seal)]">
              Isian <strong>nomor surat tidak ditulis manual</strong> — sistem menerbitkannya dari urut-urutan template
              ({template.numberPrefixFormat}) saat tahap pengesahan final disetujui.
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
