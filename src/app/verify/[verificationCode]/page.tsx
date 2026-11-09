import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, ChevronRight, Crosshair, FileText, Home, KeyRound, Link2, Printer, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { verifyByCode } from "@/server/services/verificationEngine";
import { getSessionPayload } from "@/server/session";
import { getSettings } from "@/server/services/settings";
import { QrCodeSvg } from "@/components/QrCodeSvg";
import TamperLab from "@/components/TamperLab";
import { ResultBadge } from "../result-ui";
import { CATEGORY_LABEL, CONFIDENTIALITY_LABEL, formatDateTime, shortHash } from "@/lib/labels";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function VerifyResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ verificationCode: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { verificationCode } = await params;
  const { tab } = await searchParams;
  const outcome = await verifyByCode(verificationCode);

  if (!outcome.found && outcome.status !== "NOT_FOUND") notFound();
  if (!outcome.found) {
    return (
      <Shell code={verificationCode}>
        <div className="mx-auto max-w-2xl">
          <ResultBadge outcome={outcome} />
          <p className="mt-4 text-sm leading-6 text-zinc-600">{outcome.explanation}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/verify?code=${encodeURIComponent(verificationCode)}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50">
              <ArrowLeft className="h-3.5 w-3.5" /> Coba kode lain
            </Link>
          </div>
        </div>

        <section className="mt-10">
          <h2 className="text-[15px] font-semibold tracking-tight">Simulasi: bagaimana kalau naskah Anda sudah dirubah?</h2>
          <p className="mt-1 mb-4 max-w-2xl text-[13px] leading-5 text-zinc-600">
            Lab ini menunjukkan mekanisme deteksi menggunakan contoh naskah. Ubah satu karakter dan hitung ulang
            SHA-256 dengan kunci Web Crypto di peramban Anda.
          </p>
          <TamperLab />
        </section>
      </Shell>
    );
  }

  const doc = outcome.document;
  if (!doc) {
    return (
      <Shell code={verificationCode}>        <div className="mx-auto max-w-2xl">
          <ResultBadge outcome={outcome} />
          <p className="mt-4 text-sm leading-6 text-zinc-600">{outcome.explanation}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/verify?code=${encodeURIComponent(verificationCode)}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-800 hover:bg-zinc-50">
              <ArrowLeft className="h-3.5 w-3.5" /> Coba kode lain
            </Link>
          </div>
        </div>
        <section className="mt-10">
          <TamperLab />
        </section>
      </Shell>
    );
  }

  const settings = await getSettings();
  // Printing is an authenticated action, so the public portal offers the print
  // button only to a signed-in visitor.
  const canPrint = Boolean(await getSessionPayload());
  const sealedSteps = outcome.signers.filter((s) => s.verdict === "APPROVED_SIGNED");
  const qrValue = `${settings[SETTING_VERIFY_BASE_URL].replace(/\/+$/, "")}/verify/${doc.verificationCode}`;
  const displayTab = tab === "lab" ? "lab" : tab === "board" ? "board" : tab === "chain" ? "chain" : "result";

  return (
    <Shell code={doc.verificationCode}>
      <div className="mx-auto max-w-6xl">
        <ResultBadge outcome={outcome} />
        <p className="mx-auto mt-3 max-w-3xl text-[13px] leading-5 text-zinc-600">{outcome.explanation}</p>
        {doc.revocationReason ? (
          <p className="mt-2 text-[12px] font-medium text-amber-800">
            Alasan pencabutan: {doc.revocationReason}
          </p>
        ) : null}

        {/* tab strip */}
        <nav aria-label="Detail verifikasi" className="mt-6 flex flex-wrap items-center gap-1 border-b border-zinc-200">
          {(
            [
              ["result", "Ringkasan & QR", ShieldCheck],
              ["board", "Naskah & Variabel", FileText],
              ["chain", "Rantai Tanda Tangan", Scale],
              ["lab", "Tamper Detection Lab", Crosshair],
            ] as const
          ).map(([key, label, Icon]) => (
            <Link
              key={key}
              href={`/verify/${doc.verificationCode}${key === "result" ? "" : `?tab=${key}`}`}
              aria-current={displayTab === key ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[13px] font-medium ${
                displayTab === key
                  ? "border-[var(--accent-primary)] text-zinc-900"
                  : "border-transparent text-zinc-500 hover:text-zinc-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </Link>
          ))}
          <span className="ml-auto hidden items-center gap-2 py-2 text-[11px] text-zinc-400 sm:flex">
            Selidiki ulang pernah dilakukan oleh portal pada{" "}
            <span className="font-mono">{formatDateTime(new Date())}</span>
          </span>
        </nav>

        {displayTab === "result" ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_320px]">
            <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-5">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-lg font-bold tracking-tight text-zinc-900 md:text-xl">{doc.title}</h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone="neutral">{CATEGORY_LABEL[doc.category as keyof typeof CATEGORY_LABEL] ?? doc.category}</Badge>
                    <Badge tone="neutral">{CONFIDENTIALITY_LABEL[doc.confidentiality] ?? doc.confidentiality}</Badge>
                    <Badge tone={doc.status === "SEALED_PUBLISHED" ? "success" : "warning"}>{doc.status.replace("_", " ")}</Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  {canPrint ? (
                    <Link href={`/print/document/${doc.id}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
                      <Printer className="h-3.5 w-3.5" /> Cetak sertifikat
                    </Link>
                  ) : (
                    <Link href={`/login?next=/print/document/${doc.id}`} className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-zinc-300 bg-white px-3 py-1.5 text-[12px] font-medium text-zinc-700 hover:bg-zinc-50">
                      <Printer className="h-3.5 w-3.5" /> Masuk untuk mencetak
                    </Link>
                  )}
                  <Link
                    href={`/verify/${doc.verificationCode}?tab=lab`}
                    className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-zinc-700"
                  >
                    <Crosshair className="h-3.5 w-3.5" /> Uji lab
                  </Link>
                </div>
              </header>

              <dl className="mt-4 grid grid-cols-1 gap-3 text-[13px] sm:grid-cols-2">
                <Field label="Penyusun" value={`${doc.creatorName} — ${doc.creatorTitle}`} />
                <Field label="Unit penerbit" value={doc.departmentName} />
                <Field label="Nomor resmi" value={doc.documentNumber ?? "(belum terbit)"} mono />
                <Field label="Kode verifikasi" value={doc.verificationCode} mono />
                <Field label="Masa berlaku" value={doc.effectiveUntil ? `${formatDate(doc.effectiveFrom)} s.d. ${formatDate(doc.effectiveUntil)}` : `Sejak ${formatDate(doc.effectiveFrom)}`} />
                <Field label="Waktu segel" value={doc.sealedAt ? formatDateTime(doc.sealedAt) : "belum tersegel"} />
              </dl>

              {doc.canonicalContentHash ? (
                <div className="mt-4 rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/70 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Segel isi (H_doc) &amp; rantai final</p>
                  <p className="mt-1.5 break-all font-mono text-[11px] leading-5 text-zinc-800">{doc.canonicalContentHash}</p>
                  {doc.finalSignatureChainHash ? (
                    <p className="mt-1 break-all font-mono text-[11px] leading-5 text-zinc-500">→ {doc.finalSignatureChainHash}</p>
                  ) : null}
                </div>
              ) : null}
            </section>

            <aside className="flex flex-col items-center gap-3 self-start rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-5 text-center">
              <QrCodeSvg value={qrValue} label={`QR untuk ${qrValue}`} size={168} />
              <p className="font-mono text-[11px] leading-4 text-zinc-500 break-all">{qrValue}</p>
              <div className="flex flex-wrap justify-center gap-3 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1.5"><KeyRound className="h-3 w-3" /> {sealedSteps.length} kunci RSA diverifikasi</span>
                <span className="flex items-center gap-1.5"><Link2 className="h-3 w-3" /> {outcome.chain.issues.length === 0 ? "rantai utuh" : "rantai patah"}</span>
              </div>
            </aside>
          </div>
        ) : null}

        {displayTab === "board" ? (
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_380px]">
            <article className="naskah max-h-[70vh] overflow-y-auto rounded-[var(--radius-lg)] border border-zinc-200 bg-white p-8 text-[13px] md:p-10">
              <RenderNaskah body={outcome.bodyText ?? "(isi naskah tidak tersedia)"} />
              {doc.sealedAt ? (
                <footer className="mt-8 border-t border-zinc-200 pt-4 text-[11px] text-zinc-500">
                  <p>Naskah ini tersegel pada {formatDateTime(doc.sealedAt)} sebagai versi {doc.currentVersionNo}.</p>
                  <p className="mt-1">Cetak dengan nomor {doc.documentNumber ?? "tanpa nomor"}.</p>
                </footer>
              ) : null}
            </article>

            <aside className="space-y-4">
              <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
                <h2 className="text-[13px] font-semibold tracking-tight">Variabel naskah</h2>
                <dl className="mt-3 space-y-2.5">
                  {Object.entries(outcome.variables).map(([key, value]) => (
                    <div key={key} className="border-b border-zinc-100 pb-2 last:border-0">
                      <dt className="font-mono text-[11px] text-zinc-400">{key}</dt>
                      <dd className="mt-0.5 break-words text-[13px] leading-5 text-zinc-800">{String(value)}</dd>
                    </div>
                  ))}
                  {Object.keys(outcome.variables).length === 0 ? (
                    <p className="text-sm text-zinc-500">Variabel tidak tercatat untuk versi ini.</p>
                  ) : null}
                </dl>
              </section>

              {doc.canonicalContentHash ? (
                <section className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
                  <h2 className="text-[13px] font-semibold tracking-tight">Hash kriptografis</h2>
                  <dl className="mt-3 space-y-2 text-[11px]">
                    <div>
                      <dt className="text-zinc-400">H_doc — SHA-256 isi tersegel</dt>
                      <dd className="mt-0.5 break-all font-mono text-zinc-800">{doc.canonicalContentHash}</dd>
                    </div>
                    {doc.finalSignatureChainHash ? (
                      <div>
                        <dt className="text-zinc-400">Hash akhir rantai</dt>
                        <dd className="mt-0.5 break-all font-mono text-zinc-800">{doc.finalSignatureChainHash}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <Link
                    href={`/verify/${doc.verificationCode}?tab=lab`}
                    className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent-interactive)] hover:underline"
                  >
                    Bandingkan dengan naskah Anda <ChevronRight className="h-3 w-3" />
                  </Link>
                </section>
              ) : null}
            </aside>
          </div>
        ) : null}

        {displayTab === "chain" ? (
          <div className="mt-6">
            {outcome.chain.issues.length > 0 ? (
              <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-md)] border border-red-300 bg-red-50 px-4 py-3 text-[13px] text-red-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Rantai tidak dapat direkonstruksi secara utuh</p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-5">
                    {outcome.chain.issues.map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            <ol className="relative ml-2 space-y-4 border-l-2 border-zinc-200 pl-6">
              {outcome.signers.map((signer) => {
                const signed = signer.verdict === "APPROVED_SIGNED";
                return (
                  <li key={signer.stepOrder} className="relative">
                    <span
                      className={`absolute -left-[32px] top-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white font-mono text-[11px] font-bold shadow-sm ${
                        signed ? "bg-emerald-600 text-white" : "bg-zinc-300 text-zinc-600"
                      }`}
                    >
                      {signer.stepOrder}
                    </span>
                    <div className="rounded-[var(--radius-lg)] border border-zinc-200/80 bg-white p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[13px] font-semibold text-zinc-900">{signer.stepName}</p>
                        <span className="text-[11px] text-zinc-400">
                          {signer.actedAt ? formatDateTime(signer.actedAt) : "belum ditandatangani"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-zinc-500">
                        {signer.approverName} · {signer.approverTitle}
                      </p>
                      <dl className="mt-3 grid grid-cols-1 gap-2 text-[11px] sm:grid-cols-3">
                        <MiniHash label="Menerima dari (S_i-1)" value={shortHash(signer.previousStepSignatureHash)} />
                        <MiniHash label="Tanda tangan tahap (S_i)" value={signed ? shortHash(signer.stepSignatureHash) : "—"} />
                        <div>
                          <dt className="text-zinc-400">Sertifikat kunci</dt>
                          <dd className="mt-0.5 font-mono break-all text-zinc-700">
                            {signer.certificateFingerprint ? `${shortHash(signer.certificateFingerprint, 16, 8)}` : "—"}
                          </dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge tone={signed ? (signer.rsaVerified ? "success" : "danger") : "neutral"}>
                          {signed ? (signer.rsaVerified ? "RSA-PSS sah" : "RSA gagal verify") : "belum ada tanda tangan"}
                        </Badge>
                        {signed ? <CertifiedMark /> : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            <p className="mt-5 text-[12px] leading-5 text-zinc-500">
              Setiap paraf dihitung dengan <code className="font-mono text-[11px]">S_i = HMAC-SHA256(PIN_i)(H_doc | S_(i-1) | ID_i | T_i)</code>{" "}
              lalu ditandatangani ulang oleh kunci RSA-PSS pejabat. Untuk membuktikan bahwa dokumen Anda asli,
              salin bilangan <span className="font-mono text-[11px]">S_i</span> dan bandingkan dengan sertifikat cetak.
            </p>
          </div>
        ) : null}

        {displayTab === "lab" ? (
          <div className="mt-6">
            <p className="mb-4 max-w-3xl text-[13px] leading-5 text-zinc-600">
              Tempel naskah yang Anda pegang (misalnya hasil scan salinan) dan ubah satu karakter. Lab akan
              menghitung ulang SHA-256 dan menunjukkan baris mana yang berubah serta berapa bit yang berbeda
              dari segel asli <span className="font-mono text-[11px]">{shortHash(doc.canonicalContentHash ?? "")}</span>.
            </p>
            <TamperLab bodyText={outcome.bodyText ?? undefined} originalHash={doc.canonicalContentHash ?? undefined} />
          </div>
        ) : null}
      </div>
    </Shell>
  );
}

const SETTING_VERIFY_BASE_URL = "verify_base_url";

function Shell({ code, children }: { code: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[var(--bg-canvas)] text-zinc-900">
      <header className="border-b border-zinc-200/80 bg-white">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Link href="/verify" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--seal)] font-mono text-sm font-bold text-white">Vd</span>
            <span>
              <span className="block text-[13px] font-semibold leading-4 tracking-tight">VeriDoc</span>
              <span className="block font-mono text-[11px] leading-4 text-zinc-500">{code}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-[12px] font-medium text-zinc-600">
            <Link href="/verify?tab=lab" className="hidden rounded-[var(--radius-md)] px-3 py-1.5 hover:bg-zinc-100 sm:block">
              Tamper Lab
            </Link>
            <Link href="/" className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 hover:bg-zinc-100">
              <Home className="h-3.5 w-3.5" /> Beranda
            </Link>
            <Link href="/login" className="rounded-[var(--radius-md)] border border-zinc-300 px-3 py-1.5 text-zinc-700 hover:bg-zinc-50">
              Masuk internal
            </Link>
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-8 md:py-10">{children}</div>
      <footer className="border-t border-zinc-200/80 py-6 text-center text-xs text-zinc-500">
        Verifikasi publik VeriDoc — hasil merekonstruksi segel secara matematis dan valid kapan pun naskah dicetak ulang.
      </footer>
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50/50 px-3 py-2.5">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</dt>
      <dd className={`mt-1 leading-5 break-words ${mono ? "font-mono text-[12px]" : "font-medium text-[13px]"} text-zinc-800`}>{value}</dd>
    </div>
  );
}

function MiniHash({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-sm)] border border-zinc-200 bg-zinc-50/60 px-2.5 py-2">
      <dt className="text-[10px] text-zinc-400">{label}</dt>
      <dd className="mt-0.5 font-mono break-all text-[11px] leading-4 text-zinc-700">{value}</dd>
    </div>
  );
}

function CertifiedMark() {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> terparaf pada versi tersegel
    </span>
  );
}

/** Minimal markdown → HTML for the naskah body. No third-party deps. */
function RenderNaskah({ body }: { body: string }) {
  const lines = body.split("\n");
  return (
    <div className="space-y-3">
      {lines.map((line, index) => {
        if (!line.trim()) return <div key={index} aria-hidden />;
        if (line.startsWith("## ")) return <h1 key={index} className="text-center text-base font-bold uppercase tracking-wide">{line.slice(3)}</h1>;
        if (line.startsWith("### ")) return <h2 key={index} className="text-center text-[15px] font-bold">{line.slice(4)}</h2>;
        const trimmed = line.trim();
        return (
          <p key={index} className="indent-8 justify-between">
            {trimmed.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
              part.startsWith("**") && part.endsWith("**") ? (
                <strong key={i}>{part.slice(2, -2)}</strong>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}
