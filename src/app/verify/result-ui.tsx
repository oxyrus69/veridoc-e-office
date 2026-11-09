import type { VerificationOutcome } from "@/server/services/verificationEngine";
import { CATEGORY_LABEL, STATUS_LABEL, STATUS_TONE, formatDate } from "@/lib/labels";

const STATUS_UI = {
  VALID_SEALED: { icon: "✓", label: "ASLI & TERSEGEL", className: "border-emerald-300 bg-emerald-50 text-emerald-900", accent: "bg-emerald-500" },
  TAMPERED_MODIFIED: { icon: "✕", label: "PERINGATAN — DAMPAKAN", className: "border-red-400 bg-red-50 text-red-900", accent: "bg-red-500" },
  REVOKED: { icon: "⊘", label: "DOKUMEN DICABUT", className: "border-amber-300 bg-amber-50 text-amber-900", accent: "bg-amber-500" },
  EXPIRED: { icon: "◷", label: "MASA BERLAKU HABIS", className: "border-amber-300 bg-amber-50 text-amber-900", accent: "bg-amber-500" },
  IN_REVIEW: { icon: "…", label: "BELUM TERSEGEL", className: "border-sky-300 bg-sky-50 text-sky-900", accent: "bg-sky-500" },
  NOT_FOUND: { icon: "?", label: "KODE TIDAK TERDAFTAR", className: "border-zinc-300 bg-zinc-100 text-zinc-700", accent: "bg-zinc-400" },
} as const;

/** The five identity fields that answer "who, what, when, where, which" at a glance. */
export function ResultBadge({ outcome, compact }: { outcome: VerificationOutcome; compact?: boolean }) {
  const ui = STATUS_UI[outcome.status] ?? STATUS_UI.NOT_FOUND;
  const doc = outcome.document;

  if (!doc) {
    return (
      <div className={`rounded-[var(--radius-lg)] border-2 px-5 py-4 ${ui.className}`}>
        <div className="flex items-center gap-3">
          <span className={`flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold ${ui.accent} text-white`}>{ui.icon}</span>
          <div>
            <p className="text-lg font-bold leading-5 tracking-tight">{ui.label}</p>
            <p className="mt-0.5 text-[12px] opacity-80">{outcome.explanation}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-hidden rounded-[var(--radius-lg)] border-2 ${ui.className}`}>
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl font-bold ${ui.accent} text-white`} aria-hidden>
          {ui.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-5 tracking-tight md:text-xl">{ui.label}</p>
          <p className="mt-0.5 text-[13px] leading-5 opacity-80">{outcome.headline}.</p>
        </div>
        <div className="text-right font-mono text-[11px] leading-4 opacity-70">
          <p>verifikasi saat: {formatDate(outcome.chain ? new Date() : new Date())}</p>
          <p>kode: {doc.verificationCode}</p>
        </div>
      </div>

      {compact ? null : (
        <dl className="grid grid-cols-2 gap-px border-t border-current/10 bg-current/10 text-[13px] md:grid-cols-5">
          <Fact label="Penerbit" value={`${doc.departmentName}`} />
          <Fact label="Naskah" value={doc.title} />
          <Fact label="Nomor resmi" value={doc.documentNumber ?? "(belum terbit)"} mono />
          <Fact label="Kategori" value={CATEGORY_LABEL[doc.category as keyof typeof CATEGORY_LABEL] ?? doc.category} />
          <Fact
            label="Masa berlaku"
            value={
              doc.effectiveUntil
                ? `${formatDate(doc.effectiveFrom)} – ${formatDate(doc.effectiveUntil)}`
                : `${formatDate(doc.effectiveFrom)} – tanpa batas`
            }
          />
        </dl>
      )}
    </div>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white/70 px-4 py-3" style={{ background: "rgba(255,255,255,0.75)" }}>
      <dt className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{label}</dt>
      <dd className={`mt-1 leading-5 ${mono ? "font-mono text-[12px]" : "font-medium"} break-words`}>{value}</dd>
    </div>
  );
}

export { STATUS_LABEL, STATUS_TONE };
