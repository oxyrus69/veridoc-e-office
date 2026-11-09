import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  BellOff,
  CheckCircle2,
  Copy,
  Crown,
  FileEdit,
  Gauge,
  History,
  KeyRound,
  Link2,
  Printer,
  QrCode as QrIcon,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  Undo2,
  UserRound,
} from "lucide-react";
import { PageBody } from "@/components/layout/AppShell";
import { Badge } from "@/components/ui/Badge";
import ActionForm from "@/components/ui/ActionForm";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import { getDocumentDetail } from "@/server/services/documentEngine";
import { listWorkflowSteps, auditChain } from "@/server/services/approvalEngine";
import { getCertificateForUser } from "@/server/services/cryptoSealEngine";
import { getSettings } from "@/server/services/settings";
import { getCertFingerprintMap } from "../detail-helpers";
import { getCurrentUser } from "@/server/session";
import { canAccess, canSign } from "@/server/auth";
import {
  CATEGORY_LABEL,
  CONFIDENTIALITY_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  VERDICT_LABEL,
  formatDateTime,
  shortHash,
} from "@/lib/labels";
import { toneClasses } from "@/lib/dom";
import type { DocumentCategory } from "@/server/db/schema";

export const dynamic = "force-dynamic";

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccess(user.r, "/documents")) redirect("/login");

  const [detail, steps, settings, publicKeys] = await Promise.all([
    getDocumentDetail(id),
    listWorkflowSteps(id),
    getSettings(),
    getCertFingerprintMap(),
  ]);
  if (!detail) notFound();

  const typedSteps = (steps as unknown[]).map((s: unknown) => ({
    id: String((s as any)?.id),
    stepOrder: Number((s as any)?.stepOrder),
    stepName: String((s as any)?.stepName),
    previousStepSignatureHash: String((s as any)?.previousStepSignatureHash ?? "GENESIS"),
    stepSignatureHash: (s as any)?.stepSignatureHash ?? null,
    rsaSignature: (s as any)?.rsaSignature ?? null,
    assignedApproverId: String((s as any)?.assignedApproverId ?? (s as any)?.approverId),
    actedAt: (s as any)?.actedAt,
    verdict: String((s as any)?.verdict),
    certificateFingerprint: (s as any)?.certificateFingerprint ?? null,
    approverName: String((s as any)?.approverName ?? "-"),
    approverTitle: String((s as any)?.approverTitle ?? (s as any)?.approverRole ?? "-"),
    approverRole: String((s as any)?.approverRole ?? "-"),
    slaDueAt: (s as any)?.slaDueAt,
  }));

  const sealed = detail.status === "SEALED_PUBLISHED" || detail.status === "REVOKED_INVALIDATED" || detail.status === "EXPIRED";
  const chain = auditChain({
    steps: typedSteps,
    contentHash: detail.canonicalContentHash ?? "",
    publicKeys,
    sealed,
  });

  const currentVersion = detail.versions.find((v: { versionNo: number }) => v.versionNo === detail.currentVersionNo);
  const myPendingStep = typedSteps.find(
    (s) => s.verdict === "PENDING_ACTION" && s.assignedApproverId === user.u && detail.status === "IN_REVIEW_WORKFLOW",
  );
  const isCreator = detail.creatorId === user.u;
  const qrValue = `${settings["verify_base_url"].replace(/\/+$/, "")}/verify/${detail.verificationCode}`;
  const signerHasCert = user.certificateStatus === "ACTIVE" && user.certificateFingerprint !== null;

  return (
    <PageBody>
      {/* breadcrumb + status strip */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/documents"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-zinc-300 bg-white text-zinc-500 hover:bg-zinc-50"
            aria-label="Kembali ke repositori"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="max-w-[560px] truncate text-[17px] font-bold tracking-tight text-zinc-900 md:text-lg">{detail.title}</h1>
              <span className={`inline-flex items-center rounded-[var(--radius-sm)] border px-2 py-0.5 text-[11px] font-semibold ${toneClasses(STATUS_TONE[detail.status])}`}>
                {STATUS_LABEL[detail.status]}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-zinc-500">
              {detail.documentNumber ?? `${detail.verificationCode} · nomor belum terbit`} · v{detail.currentVersionNo} · diubah {relativeTimeDetail(detail.updatedAt)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/print/document/${detail.id}`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Printer className="h-3.5 w-3.5" /> Cetak A4
          </a>
          <Link
            href={`/verify/${detail.verificationCode}`}
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-700"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Lihat hasil publik
          </Link>
        </div>
      </div>

      {chain.issues.length > 0 ? (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-900">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Keberatan integritas</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {chain.issues.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[65fr_35fr]">
        {/* ---------------- left 65%: naskah ---------------- */}
        <div className="min-w-0 space-y-4">
          <article className="naskah rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-8 text-[13px] leading-6 md:p-10">
            <header className="border-b-2 border-zinc-900 pb-4 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">VeriDoc Nusantara</p>
              <p className="mt-1 text-[13px] font-bold">{detail.departmentName}</p>
              <p className="mt-2 font-mono text-[12px] text-zinc-600">
                Nomor: {detail.documentNumber ?? "(menunggu pengesahan final)"}
              </p>
            </header>
            <div className="space-y-2.5 border-b border-zinc-200 py-4">
              <MetaLine label="Kategori" value={CATEGORY_LABEL[detail.category as DocumentCategory]} />
              <MetaLine label="Berlaku sejak" value={detail.effectiveFrom} />
              <MetaLine label="Berlaku hingga" value={detail.effectiveUntil ?? "tidak dibatasi"} />
              <MetaLine label="Penyusun" value={`${detail.creatorName} — ${detail.creatorTitle}`} />
            </div>
            <div className="pt-4">
              <RenderBody body={currentVersion?.renderedBodyText ?? "(versi kosong)"} highlightNumber={detail.documentNumber} />
            </div>
            {sealed ? (
              <footer className="mt-8 border-t-2 border-zinc-900 pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-zinc-500">Pengesahan final</p>
                    <p className="mt-1 text-[12px] font-semibold">{steps[steps.length - 1]?.approverName ?? "—"}</p>
                    <p className="text-[11px] text-zinc-500">{detail.sealedAt ? formatDateTime(detail.sealedAt) : "—"}</p>
                  </div>
                  <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--seal)] text-center font-mono text-[10px] font-bold leading-3 text-[var(--seal)]">
                    {shortHash(detail.finalSignatureChainHash, 4, 0).toUpperCase()}…
                    <br />
                    TERSEGEL
                  </div>
                </div>
              </footer>
            ) : null}
          </article>

          {/* versions */}
          <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
            <header className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-zinc-400" />
                <h2 className="text-[13px] font-semibold tracking-tight">Riwayat versi</h2>
              </div>
              <span className="rounded-[var(--radius-sm)] bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-zinc-600">{detail.versions.length}</span>
            </header>
            <ol className="divide-y divide-zinc-100">
              {[...detail.versions].reverse().map((version) => (
                <li key={version.id} className={`px-4 py-3 ${version.versionNo === detail.currentVersionNo ? "bg-[var(--seal-soft)]/40" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={version.versionNo === detail.currentVersionNo ? "seal" : "neutral"} mono>
                        v{version.versionNo}
                      </Badge>
                      <span className="text-[12px] font-medium text-zinc-700">{version.changeNotes || "Tanpa catatan"}</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      {version.createdByName} · {formatDateTime(version.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 break-all font-mono text-[11px] text-zinc-400">SHA-256 {version.contentSha256}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* ---------------- right 35% ---------------- */}
        <div className="space-y-4">
          {/* hygiene box */}
          <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Fakta naskah</h2>
            <dl className="mt-3 space-y-2.5 text-[12px]">
              <Info label="Kode verifikasi" value={detail.verificationCode} mono />
              <Info label="Template" value={detail.templateName ?? "—"} />
              <Info label="Kerahasiaan" value={CONFIDENTIALITY_LABEL[detail.confidentiality] ?? detail.confidentiality} />
              <Info label="Tahap berjalan" value={detail.currentStepOrder > 0 ? `${detail.currentStepOrder} dari ${steps.length}` : "belum diajukan"} />
              <Info label="Baris naskah" value={`${(currentVersion?.renderedBodyText ?? "").split("\n").length}`} />
            </dl>
          </section>

          {/* chain inspector */}
          <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
            <header className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-zinc-400" />
                <h2 className="text-[13px] font-semibold tracking-tight">Inspetor rantai tanda tangan</h2>
              </div>
              <Badge tone={chain.valid ? "success" : "danger"} mono>
                {chain.valid ? "UTUH" : `PATAH (${chain.issues.length})`}
              </Badge>
            </header>
            <ol className="px-4 py-3">
              <ChainNode label="GENESIS_VERIDOC_CHAIN" note="Titik awal rantai" mono value="" tone="neutral" />
              {typedSteps.map((step) => (
                <ChainNode
                  key={step.id}
                  label={`Tahap ${step.stepOrder} — ${step.stepName}`}
                  value={step.stepSignatureHash ?? ""}
                  mono
                  tone={step.verdict === "APPROVED_SIGNED" ? "success" : step.verdict === "PENDING_ACTION" ? "info" : step.verdict === "REJECTED_RETURNED" ? "danger" : "neutral"}
                  note={
                    step.verdict === "APPROVED_SIGNED" ? (
                      <span>
                        {step.approverName} {step.actedAt ? `· ${formatDateTime(step.actedAt)}` : ""}
                        {step.certificateFingerprint ? (
                          <span className="block font-mono text-[10px] text-zinc-400">kunci {shortHash(step.certificateFingerprint, 10, 6)}</span>
                        ) : null}
                      </span>
                    ) : (
                      VERDICT_LABEL[step.verdict as keyof typeof VERDICT_LABEL]
                    )
                  }
                />
              ))}
              {detail.finalSignatureChainHash ? (
                <ChainNode label="Segel final (H_final)" value={detail.finalSignatureChainHash} mono tone="seal" note="SHA-256 atas S1→S2→…Sn" />
              ) : null}
            </ol>
            <p className="border-t border-zinc-100 px-4 py-2.5 text-[11px] leading-4 text-zinc-500">
              {chain.tailHash ? `Ekor rantai saat ini: ${shortHash(chain.tailHash)}` : "Belum ada tahap yang ditandatangani."}
            </p>
          </section>

          {/* QR */}
          <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4 text-center">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">QR verifikasi</h2>
            <div className="mt-3 flex flex-col items-center gap-3">
              <QrCodeSvg value={qrValue} size={150} label={qrValue} />
              <p className="max-w-[220px] break-all font-mono text-[10px] leading-4 text-zinc-500">{qrValue}</p>
            </div>
            <p className="mt-3 text-[11px] leading-4 text-zinc-500">
              {sealed
                ? "Cetak beserta naskah final; pemindaian oleh pihak luar akan memverifikasi ulang segel."
                : "QR akan aktif ketika naskah tersegel pada tahap pengesahan final."}
            </p>
          </section>

          {/* actions per state */}
          {myPendingStep ? (
            signerHasCert ? (
              <ApprovalCard
                stepName={myPendingStep.stepName}
                stepOrder={myPendingStep.stepOrder}
                slaDueAt={myPendingStep.slaDueAt}
                documentId={detail.id}
                expectedVersion={detail.version}
                approverName={user.n}
              />
            ) : (
              <section className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50/60 px-4 py-3 text-[12px] leading-5 text-amber-900">
                Anda ditunjuk untuk tahap {myPendingStep.stepOrder}, tetapi sertifikat Anda belum aktif.
                Super Admin dapat menerbitkannya dari <Link href="/certificates" className="font-semibold underline">halaman Sertifikat</Link>.
              </section>
            )
          ) : null}

          {detail.status === "REVISION_REQUESTED" && (isCreator || user.r === "SUPER_ADMIN") ? (
            <RevisionCard title={detail.title} documentId={detail.id} body={currentVersion?.renderedBodyText ?? ""} slaHours={detail.templateSlaHours ?? 24} variables={currentVersion?.variablesPayloadJson} />
          ) : null}

          {detail.status === "SEALED_PUBLISHED" && user.r === "SUPER_ADMIN" ? (
            <section className="rounded-[var(--radius-lg)] border border-red-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <BellOff className="h-4 w-4 text-red-500" />
                <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Cabut naskah</h2>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                Pencabutan mengunci naskah sebagai REVOKED; portal verifikasi langsung menampilkan status dicabut.
              </p>
              <ActionForm action="document:revoke" className="mt-3">
                <input type="hidden" name="documentId" value={detail.id} />
                <input type="hidden" name="entityLabel" value={detail.title} />
                <label className="block">
                  <span className="text-xs font-medium text-zinc-600">Alasan pencabutan</span>
                  <textarea name="reason" required rows={2} className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] focus:border-[var(--accent-interactive)] focus:outline-none" />
                </label>
                <button type="submit" className="mt-3 w-full rounded-[var(--radius-md)] border border-red-300 bg-white px-3 py-2 text-[12px] font-semibold text-red-700 hover:bg-red-50">
                  Cabut naskah
                </button>
              </ActionForm>
            </section>
          ) : null}

          {/* signers rail */}
          <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white">
            <header className="flex items-center gap-2 border-b border-zinc-200/80 px-4 py-2.5">
              <UserRound className="h-4 w-4 text-zinc-400" />
              <h2 className="text-[13px] font-semibold tracking-tight">Pejabat alur</h2>
            </header>
            <ul className="divide-y divide-zinc-100">
              {typedSteps.map((step) => (
                <li key={step.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-zinc-800">{step.approverName}</p>
                    <p className="truncate text-[11px] text-zinc-500">{step.approverTitle || step.approverRole}</p>
                  </div>
                  <Badge
                    tone={
                      step.verdict === "APPROVED_SIGNED"
                        ? "success"
                        : step.verdict === "PENDING_ACTION"
                          ? "info"
                          : step.verdict === "REJECTED_RETURNED"
                            ? "danger"
                            : "neutral"
                    }
                  >
                    {step.verdict === "APPROVED_SIGNED" ? "Paraf" : step.verdict === "PENDING_ACTION" ? "Belum" : "Menunggu"}
                  </Badge>
                </li>
              ))}
              {steps.length === 0 ? (
                <li className="px-4 py-4 text-[12px] text-zinc-500">Alur persetujuan belum ditunjuk.</li>
              ) : null}
            </ul>
          </section>
        </div>
      </div>
    </PageBody>
  );
}

/* ------------------------------------------------------------------ */
/* subcomponents                                                       */
/* ------------------------------------------------------------------ */

function relativeTimeDetail(date: Date) {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function ApprovalCard({
  stepName,
  stepOrder,
  slaDueAt,
  documentId,
  expectedVersion,
  approverName,
}: {
  stepName: string;
  stepOrder: number;
  slaDueAt: Date;
  documentId: string;
  expectedVersion: number;
  approverName: string;
}) {
  const overdue = slaDueAt.getTime() < Date.now();
  return (
    <section className="rounded-[var(--radius-lg)] border-2 border-[var(--accent-interactive)] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Stamp className="h-4 w-4 text-[var(--accent-interactive)]" />
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Paraf tahap {stepOrder}</h2>
        <Badge tone={overdue ? "danger" : "info"}>
          {overdue ? `Lewat ${Math.round((Date.now() - slaDueAt.getTime()) / 3600000)} jam` : `Tenggat ${formatDateTime(slaDueAt)}`}
        </Badge>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-zinc-500">
        {stepName}. Sesuai kewenangan {approverName}. Paraf langsung menulis rantai hash dan tanda tangan RSA.
      </p>

      <fieldset className="mt-3 border-t border-zinc-100 pt-3">
        <legend className="sr-only">Tindakan persetujuan</legend>
        <div className="space-y-4">
          <ActionForm action="approval:approve" className="space-y-3">
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="expectedVersion" value={String(expectedVersion)} />
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">PIN tanda tangan (6 digit)</span>
              <input
                name="pin"
                required
                inputMode="numeric"
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                autoComplete="off"
                className="mt-1 w-36 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 font-mono text-[15px] tracking-[0.4em] focus:border-[var(--accent-interactive)] focus:outline-none"
                aria-label="PIN tanda tangan"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">Catatan paraf (opsional)</span>
              <input
                name="comments"
                placeholder="mis. Disetujui sesuai hasil telaah pasal 2."
                className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
              />
            </label>
            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--seal)] px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-[#7c2d12]">
              <ShieldCheck className="h-4 w-4" /> Tanda tangani & lanjutkan
            </button>
          </ActionForm>

          <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wider text-zinc-400">
            <span className="h-px flex-1 bg-zinc-200" /> atau <span className="h-px flex-1 bg-zinc-200" />
          </div>

          <ActionForm action="approval:reject" className="space-y-3">
            <input type="hidden" name="documentId" value={documentId} />
            <input type="hidden" name="expectedVersion" value={String(expectedVersion)} />
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">PIN tanda tangan</span>
              <input
                name="pin"
                required
                inputMode="numeric"
                minLength={6}
                maxLength={6}
                pattern="[0-9]{6}"
                autoComplete="off"
                className="mt-1 w-36 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 font-mono text-[15px] tracking-[0.4em] focus:border-[var(--accent-interactive)] focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-zinc-600">Alasan & catatan revisi</span>
              <textarea
                name="comments"
                required
                rows={2}
                placeholder="Jelaskan bagian mana yang harus diperbaiki penyusun."
                className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
              />
            </label>
            <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-amber-300 bg-white px-3 py-2 text-[13px] font-semibold text-amber-800 hover:bg-amber-50">
              <Undo2 className="h-4 w-4" /> Kembalikan untuk revisi
            </button>
          </ActionForm>
        </div>
      </fieldset>
      <p className="mt-3 text-[10px] leading-4 text-zinc-400">
        Verifikasi PIN dilakukan di server; paraf yang tidak sah tidak mengubah satu baris pun pada naskah.
      </p>
    </section>
  );
}

function RevisionCard({
  title,
  documentId,
  body,
  slaHours,
  variables,
}: {
  title: string;
  documentId: string;
  body: string;
  slaHours: number;
  variables: Record<string, unknown> | undefined;
}) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-sky-200 bg-sky-50/50 p-4">
      <div className="flex items-center gap-2">
        <FileEdit className="h-4 w-4 text-sky-700" />
        <h2 className="text-[13px] font-semibold tracking-tight text-zinc-900">Unggah revisi {`"${title.slice(0, 30)}…"}`}</h2>
      </div>
      <p className="mt-1 text-[11px] leading-4 text-sky-900">
        Revisi membuat versi baru dan <strong>mereset seluruh workflow ke tahap 1</strong>. Paraf sebelumnya tidak
        berlaku terhadap versi baru.
      </p>
      <ActionForm action="document:revision" className="mt-3">
        <input type="hidden" name="documentId" value={documentId} />
        <input type="hidden" name="slaHours" value={String(slaHours)} />
        <input type="hidden" name="variables" value={JSON.stringify(variables ?? {})} />
        <label className="block">
          <span className="text-xs font-medium text-zinc-700">Isi naskah yang direvisi</span>
          <textarea
            name="bodyText"
            required
            rows={5}
            defaultValue={body}
            className="thin-scroll mt-1 w-full resize-y rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 font-mono text-[12px] leading-5 focus:border-[var(--accent-interactive)] focus:outline-none"
          />
        </label>
        <label className="mt-2 block">
          <span className="text-xs font-medium text-zinc-700">Apa yang berubah?</span>
          <input
            name="changeNotes"
            required
            placeholder="mis. Nilai kontrak disesuaikan hasil negosiasi"
            className="mt-1 w-full rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-2 text-[13px] placeholder:text-zinc-400 focus:border-[var(--accent-interactive)] focus:outline-none"
          />
        </label>
        <button type="submit" className="mt-3 w-full rounded-[var(--radius-md)] bg-sky-700 px-3 py-2 text-[13px] font-semibold text-white hover:bg-sky-800">
          Simpan versi baru & reset alur
        </button>
      </ActionForm>
    </section>
  );
}

function Info({ label, value, mono }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-zinc-500">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-right ${mono ? "font-mono text-[11px]" : "font-medium text-zinc-800"}`}>{value}</dd>
    </div>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 text-[12px] sm:flex-row sm:items-baseline sm:justify-between">
      <span className="shrink-0 font-semibold uppercase tracking-wider text-zinc-500 sm:w-32">{label}</span>
      <span className="text-zinc-800">{value}</span>
    </div>
  );
}

function ChainNode({
  label,
  value,
  tone,
  note,
  mono,
}: {
  label: string;
  value: string;
  tone: "success" | "info" | "danger" | "neutral" | "seal";
  note?: React.ReactNode;
  mono?: boolean;
}) {
  const border = {
    success: "border-l-emerald-500",
    info: "border-l-sky-500",
    danger: "border-l-red-500",
    neutral: "border-l-zinc-300",
    seal: "border-l-[var(--seal)]",
  }[tone];
  return (
    <li className={`relative border-l-2 pl-4 pb-4 last:pb-0 ${border}`}>
      <span className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-current opacity-40" aria-hidden />
      <p className="text-[11px] font-medium leading-4 text-zinc-700">{label}</p>
      {mono && value ? (
        <p className="break-all font-mono text-[10px] leading-4 text-zinc-500">{value}</p>
      ) : null}
      {note ? <div className="mt-0.5 text-[11px] text-zinc-500">{note}</div> : null}
    </li>
  );
}

function RenderBody({ body, highlightNumber }: { body: string; highlightNumber: string | null }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-2">
      {lines.map((raw, i) => {
        const line = raw;
        if (!line.trim()) return <div key={i} className="h-1" aria-hidden />;
        if (line.startsWith("## "))
          return (
            <p key={i} className="pt-2 text-center text-[15px] font-bold uppercase tracking-wide">
              {line.slice(3)}
            </p>
          );
        if (line.startsWith("### "))
          return (
            <p key={i} className="pt-2 text-center text-[13px] font-semibold underline decoration-2 underline-offset-4">
              {line.slice(4)}
            </p>
          );
        return (
          <p key={i} className="text-justify indent-8">
            {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
              part.startsWith("**") && part.endsWith("**") ? <strong key={j}>{part.slice(2, -2)}</strong> : <span key={j}>{part}</span>,
            )}
          </p>
        );
      })}
    </div>
  );
}
