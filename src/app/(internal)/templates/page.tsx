import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, FileText, Hash, ListOrdered, Timer } from "lucide-react";
import { PageBody, PageHeader } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/Panel";
import { listTemplates } from "@/server/services/templateEngine";
import { getCurrentUser } from "@/server/session";
import { CATEGORY_LABEL } from "@/lib/labels";
import type { TemplateVariable } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { t } = await searchParams;
  const templates = await listTemplates();
  const selected = templates.find((tpl) => tpl.id === t) ?? templates[0] ?? null;
  const variables = (selected?.variablesSchemaJson ?? []) as TemplateVariable[];

  return (
    <>
      <PageHeader
        title="Studio Template Naskah"
        count={templates.length}
        description="Template mendefinisikan variabel isian, isi baku, urutan alur persetujuan, dan format nomor resmi yang diterbitkan otomatis."
        actions={
          user.r !== "AUDITOR_COMPLIANCE" ? (
            <Link
              href={`/documents/compose${selected ? `?template=${selected.code}` : ""}`}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-[var(--accent-primary-hover)]"
            >
              <FileText className="h-4 w-4" /> Pakai template ini
            </Link>
          ) : null
        }
      />

      <PageBody>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[320px_1fr]">
          <nav aria-label="Daftar template" className="space-y-2 self-start">
            {templates.map((tpl) => {
              const active = selected?.id === tpl.id;
              return (
                <Link
                  key={tpl.id}
                  href={`/templates?t=${tpl.id}`}
                  className={`block rounded-[var(--radius-lg)] border px-4 py-3 transition-colors ${
                    active ? "border-zinc-900 bg-white shadow-sm" : "border-zinc-200/80 bg-white hover:border-zinc-300"
                  }`}
                  aria-current={active ? "page" : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{tpl.code}</span>
                    <Badge tone={tpl.isActive ? "success" : "neutral"}>{tpl.isActive ? "aktif" : "nonaktif"}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] font-semibold text-zinc-900">{tpl.name}</p>
                  <p className="mt-0.5 text-[11px] text-zinc-500">
                    {CATEGORY_LABEL[tpl.category]} · SLA {tpl.slaHoursPerStep} jam
                  </p>
                </Link>
              );
            })}
            {templates.length === 0 ? (
              <p className="rounded-[var(--radius-lg)] border border-dashed border-zinc-300 bg-white px-4 py-10 text-center text-sm text-zinc-500">
                Belum ada template naskah.
              </p>
            ) : null}
          </nav>

          {selected ? (
            <div className="min-w-0 space-y-4">
              <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
                <header className="border-b border-zinc-200/80 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Boxes className="h-4 w-4 text-zinc-400" />
                    <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">{selected.name}</h2>
                    <Badge tone="neutral">{CATEGORY_LABEL[selected.category]}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-zinc-500">{selected.code}</p>
                </header>
                <dl className="grid grid-cols-1 gap-px bg-zinc-200/70 sm:grid-cols-3">
                  <div className="bg-white px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      <Hash className="h-3 w-3" /> Format nomor
                    </dt>
                    <dd className="mt-1 break-all font-mono text-[12px] text-zinc-800">{selected.numberPrefixFormat}</dd>
                  </div>
                  <div className="bg-white px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      <Timer className="h-3 w-3" /> SLA per tahap
                    </dt>
                    <dd className="mt-1 font-mono text-[12px] text-zinc-800">{selected.slaHoursPerStep} jam</dd>
                  </div>
                  <div className="bg-white px-4 py-3">
                    <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                      <ListOrdered className="h-3 w-3" /> Alur default
                    </dt>
                    <dd className="mt-1 font-mono text-[12px] text-zinc-800">{selected.defaultWorkflowStepsJson?.length ?? 0} tahap</dd>
                  </div>
                </dl>
              </section>

              <SectionCard title="Variabel isian" subtitle="Kunci variabel yang diisi penyusun saat menyusun naskah" padded={false}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-left text-[13px]">
                    <thead className="border-b border-zinc-200 bg-zinc-50/90">
                      <tr>
                        <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Kunci</th>
                        <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Label</th>
                        <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Tipe</th>
                        <th scope="col" className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Wajib</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variables.map((v) => (
                        <tr key={v.key} className="border-b border-zinc-100 last:border-0">
                          <td className="px-4 py-2 font-mono text-[12px] text-zinc-700">{`{{${v.key}}}`}</td>
                          <td className="px-4 py-2 text-zinc-800">{v.label}</td>
                          <td className="px-4 py-2"><Badge tone="neutral">{v.type}</Badge></td>
                          <td className="px-4 py-2">{v.required ? <Badge tone="danger">wajib</Badge> : <span className="text-[12px] text-zinc-400">opsional</span>}</td>
                        </tr>
                      ))}
                      {variables.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-sm text-zinc-500">Template ini tidak memakai variabel dinamis.</td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </SectionCard>

              <SectionCard title="Alur persetujuan default" subtitle="Urutan, peran, dan cara pengambilan keputusan" padded={false}>
                <ol className="divide-y divide-zinc-100">
                  {(selected.defaultWorkflowStepsJson ?? []).map((step, index) => (
                    <li key={index} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-mono text-[11px] font-bold text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-medium text-zinc-900">{step.name}</p>
                        <p className="text-[11px] text-zinc-500">
                          {step.role === "EXECUTIVE_SIGNER" ? "Penandatangan eksekutif" : "Reviewer legal & keuangan"}
                        </p>
                      </div>
                      <Badge tone={step.mode === "SEQUENTIAL" ? "neutral" : "info"}>
                        {step.mode === "SEQUENTIAL" ? "berurutan" : step.mode === "PARALLEL_ANY" ? "paralel (salah satu)" : "paralel semua"}
                      </Badge>
                      <span className="font-mono text-[11px] tabular-nums text-zinc-500">SLA {step.slaHours} j</span>
                    </li>
                  ))}
                  {(selected.defaultWorkflowStepsJson ?? []).length === 0 ? (
                    <li className="px-4 py-6 text-center text-sm text-zinc-500">Template belum memiliki alur bawaan.</li>
                  ) : null}
                </ol>
              </SectionCard>

              <SectionCard title="Isi baku naskah" subtitle="Placeholder {{variabel}} akan diganti saat penyusunan" padded={false}>
                <pre className="thin-scroll max-h-72 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-5 text-zinc-700">
                  {selected.bodyMarkdownTemplate}
                </pre>
              </SectionCard>
            </div>
          ) : null}
        </div>
      </PageBody>
    </>
  );
}
