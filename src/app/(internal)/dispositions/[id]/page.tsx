import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, CornerDownRight, PlusCircle, Printer, UserRound } from "lucide-react";
import { PageBody } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/Panel";
import ActionForm from "@/components/ui/ActionForm";
import { getCorrespondenceDetail } from "@/server/services/templateEngine";
import { getDb, schema } from "@/server/db";
import { getCurrentUser } from "@/server/session";
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL, formatDate, formatDateTime } from "@/lib/labels";
import type { DispositionTreeNode } from "@/server/services/templateEngine";
import type { Urgency } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function DispositionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [detail, people] = await Promise.all([
    getCorrespondenceDetail(id),
    (await getDb())
      .select({ id: schema.profiles.id, fullName: schema.profiles.fullName, jobTitle: schema.profiles.jobTitle })
      .from(schema.profiles)
      .orderBy(schema.profiles.fullName),
  ]);
  if (!detail) notFound();

  const canDispose = user.r !== "AUDITOR_COMPLIANCE";
  const flat = flatNodes(detail.roots);

  return (
    <PageBody>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Link href="/dispositions" className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50" aria-label="Kembali">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] text-zinc-500">{detail.agendaNumber}</span>
              <Badge tone={detail.urgency === "URGENT_IMMEDIATE" ? "danger" : detail.urgency === "IMPORTANT" ? "warning" : "neutral"}>
                {URGENCY_LABEL[detail.urgency as Urgency]}
              </Badge>
              <Badge tone="neutral">{CONFIDENTIALITY_LABEL[detail.confidentiality] ?? detail.confidentiality}</Badge>
            </div>
            <h1 className="mt-1 text-[17px] font-bold tracking-tight text-zinc-900 md:text-lg">{detail.subject}</h1>
            <p className="mt-0.5 text-[12px] text-zinc-500">
              {detail.senderInstitution} · surat {detail.originLetterNo} tanggal {formatDate(detail.originLetterDate)} · diterima {formatDate(detail.receivedDate)}
            </p>
          </div>
        </div>
        <a
          href={`/print/disposition/${detail.id}`}
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Printer className="h-3.5 w-3.5" /> Cetak lembar disposisi
        </a>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <SectionCard title="Ringkasan surat" subtitle={`Dicatat oleh ${detail.recordedByName}`}>
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-zinc-700">{detail.summary || "Tidak ada ringkasan."}</p>
            <p className="mt-3 flex items-center gap-1.5 border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
              <Clock3 className="h-3 w-3" /> Lampiran: {detail.attachmentNote || "—"}
            </p>
          </SectionCard>

          <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
            <header className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-2.5">
              <h2 className="text-[13px] font-semibold tracking-tight">Rantai disposisi</h2>
              <span className="font-mono text-[11px] tabular-nums text-zinc-500">{flat.length} instruksi</span>
            </header>
            <ol className="space-y-0 px-4 py-3">
              <li className="relative border-l-2 border-l-zinc-900 pl-5 pb-4">
                <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-zinc-900" aria-hidden />
                <p className="text-[12px] font-semibold text-zinc-900">Surat diterima sekretariat</p>
                <p className="text-[11px] text-zinc-500">{formatDateTime(detail.createdAt)} · {detail.recordedByName}</p>
              </li>
              {flat.map((node, index) => (
                <li key={node.id} className="relative border-l-2 pl-5 pb-4 last:pb-0" style={{ borderLeftColor: node.isOverdue ? "#ef4444" : node.isCompleted ? "#10b981" : "#93c5fd", marginLeft: `${(node.levelOrder - 1) * 14}px` }}>
                  <span
                    className={`absolute -left-[5px] top-1 h-2 w-2 rounded-full ${node.isOverdue ? "bg-red-500" : node.isCompleted ? "bg-emerald-500" : "bg-sky-500"}`}
                    aria-hidden
                  />
                  <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-white px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-medium text-zinc-900">
                        <span className="text-zinc-400">{String(index + 1).padStart(2, "0")}</span> {node.fromName}
                        <ArrowRight className="mx-1 inline h-3 w-3 text-zinc-400" />
                        {node.toName}
                      </p>
                      <Badge tone={node.isOverdue ? "danger" : node.isCompleted ? "success" : "info"}>
                        {node.isOverdue ? "lewat tenggat" : node.isCompleted ? "selesai" : `tenggat ${formatDate(node.dueDate)}`}
                      </Badge>
                    </div>
                    <p className="mt-1.5 rounded-[var(--radius-sm)] bg-zinc-50 px-2.5 py-1.5 text-[12px] leading-5 text-zinc-700">
                      <CornerDownRight className="mr-1 inline h-3 w-3 text-zinc-400" />
                      {node.instruction}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[11px] text-zinc-500">
                      <span className="flex items-center gap-1"><UserRound className="h-3 w-3" /> {node.targetUnit || "unit pelaksana"}</span>
                      {node.completedAt ? (
                        <span className="flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> {formatDateTime(node.completedAt)}
                          {node.completionNote ? ` — ${node.completionNote}` : ""}
                        </span>
                      ) : canDispose ? (
                        <ActionForm action="disposition:complete" className="ml-auto">
                          <input type="hidden" name="nodeId" value={node.id} />
                          <input type="hidden" name="detailHref" value={`/dispositions/${detail.id}`} />
                          <input type="hidden" name="note" value="Selesai ditindaklanjuti" />
                          <button type="submit" className="rounded-[var(--radius-sm)] border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50">
                            Tandai selesai
                          </button>
                        </ActionForm>
                      ) : null}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div className="space-y-4">
          <SectionCard title="Detail agenda">
            <dl className="space-y-2.5 text-[12px]">
              <Row label="Agenda" value={detail.agendaNumber} mono />
              <Row label="Pengirim" value={detail.senderInstitution} />
              <Row label="Nomor asal" value={detail.originLetterNo} mono />
              <Row label="Diterima" value={formatDate(detail.receivedDate)} />
              <Row label="Sifat" value={URGENCY_LABEL[detail.urgency as Urgency]} />
              <Row label="Kerahasiaan" value={CONFIDENTIALITY_LABEL[detail.confidentiality] ?? detail.confidentiality} />
            </dl>
          </SectionCard>

          {canDispose ? (
            <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
              <div className="flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-zinc-500" />
                <h2 className="text-[13px] font-semibold tracking-tight">Teruskan / instruksi baru</h2>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                Instruksi baru ditempelkan di bawah instruksi terakhir atas nama Anda.
              </p>
              <ActionForm action="disposition:assign" className="mt-3 space-y-3">
                <input type="hidden" name="correspondenceId" value={detail.id} />
                <input type="hidden" name="subjectLabel" value={detail.subject} />
                <input type="hidden" name="parentId" value={flat.length ? flat[flat.length - 1].id : ""} />
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Pelaksana</span>
                  <select name="toUserId" required className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none">
                    <option value="">— pilih pegawai —</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} · {p.jobTitle}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Unit pelaksana</span>
                  <input name="targetUnit" placeholder="mis. Sekretariat Direksi" className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Instruksi</span>
                  <textarea name="instruction" required rows={3} className="thin-scroll mt-1 w-full resize-y rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Tenggat</span>
                  <input
                    type="date"
                    name="dueDate"
                    required
                    aria-describedby="dueDate-hint"
                    className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none"
                  />
                  <span id="dueDate-hint" className="mt-1 block text-[11px] text-zinc-500">
                    Kosongkan untuk tenggat bawaan 3 hari dari hari ini.
                  </span>
                </label>
                <button type="submit" className="w-full rounded-[var(--radius-md)] bg-[var(--accent-primary)] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[var(--accent-primary-hover)]">
                  Simpan instruksi
                </button>
              </ActionForm>
            </section>
          ) : null}
        </div>
      </div>
    </PageBody>
  );
}

function flatNodes(nodes: DispositionTreeNode[]): DispositionTreeNode[] {
  const out: DispositionTreeNode[] = [];
  const walk = (list: DispositionTreeNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(nodes);
  return out;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-right font-medium text-zinc-800 ${mono ? "font-mono text-[11px]" : ""}`}>{value}</dd>
    </div>
  );
}
