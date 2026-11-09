/** Shared display labels & helpers (safe for client components). */
import type { DocStatus, DocumentCategory, Urgency, UserRole } from "@/server/db/schema";

export const ROLE_LABEL: Record<UserRole, string> = {
  SUPER_ADMIN: "Super Admin",
  EXECUTIVE_SIGNER: "Penandatangan Eksekutif",
  REVIEWER_LEGAL_FINANCE: "Reviewer Legal & Keuangan",
  DOCUMENT_CREATOR: "Penyusun Dokumen",
  AUDITOR_COMPLIANCE: "Auditor Kepatuhan",
};

export const ROLE_HOME: Record<UserRole, string> = {
  SUPER_ADMIN: "/admin",
  EXECUTIVE_SIGNER: "/inbox",
  REVIEWER_LEGAL_FINANCE: "/inbox",
  DOCUMENT_CREATOR: "/documents",
  AUDITOR_COMPLIANCE: "/admin/audit",
};

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  DECREE_SK: "Surat Keputusan",
  COOPERATION_CONTRACT: "Kontrak Kerja Sama",
  BUDGET_MEMO: "Memo Anggaran",
  OFFICIAL_LETTER: "Surat Dinas",
  SOP_POLICY: "SOP & Kebijakan",
  MINUTES_BA: "Berita Acara",
};

export const STATUS_LABEL: Record<DocStatus, string> = {
  DRAFT: "Draf",
  IN_REVIEW_WORKFLOW: "Dalam Persetujuan",
  REVISION_REQUESTED: "Diminta Revisi",
  SEALED_PUBLISHED: "Tersegel & Terbit",
  EXPIRED: "Kedaluwarsa",
  REVOKED_INVALIDATED: "Dicabut",
};

export const URGENCY_LABEL: Record<Urgency, string> = {
  ROUTINE: "Rutin",
  IMPORTANT: "Penting",
  URGENT_IMMEDIATE: "Segera",
};

export const CONFIDENTIALITY_LABEL: Record<string, string> = {
  PUBLIC: "Publik",
  INTERNAL: "Internal",
  CONFIDENTIAL: "Rahasia",
  STRICTLY_SECRET: "Sangat Rahasia",
};

export const VERDICT_LABEL: Record<string, string> = {
  WAITING_PREVIOUS: "Menunggu Tahap Sebelumnya",
  PENDING_ACTION: "Menunggu Tindakan",
  APPROVED_SIGNED: "Disetujui & Ditandatangani",
  REJECTED_RETURNED: "Dikembalikan untuk Revisi",
};

export const STATUS_TONE: Record<DocStatus, "success" | "warning" | "danger" | "info" | "neutral"> = {
  DRAFT: "neutral",
  IN_REVIEW_WORKFLOW: "info",
  REVISION_REQUESTED: "warning",
  SEALED_PUBLISHED: "success",
  EXPIRED: "warning",
  REVOKED_INVALIDATED: "danger",
};

export const URGENCY_TONE: Record<Urgency, "neutral" | "warning" | "danger"> = {
  ROUTINE: "neutral",
  IMPORTANT: "warning",
  URGENT_IMMEDIATE: "danger",
};

/* ---------------------------------------------------------------- */
/* Formatting                                                       */
/* ---------------------------------------------------------------- */

export function formatRupiah(value: number | string): string {
  const n = typeof value === "string" ? Number(value.replace(/[^\d.-]/g, "")) : value;
  if (!Number.isFinite(n)) return String(value);
  return `Rp ${new Intl.NumberFormat("id-ID").format(Math.round(n))}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value);
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function relativeTime(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  return formatDate(d);
}

export function daysBetween(from: Date | string, to: Date | string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  return Math.round((b - a) / 86400000);
}

export function shortHash(hash: string | null | undefined, head = 12, tail = 6): string {
  if (!hash) return "—";
  if (hash.length <= head + tail + 1) return hash;
  return `${hash.slice(0, head)}…${hash.slice(-tail)}`;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(base: Date, days: number): Date {
  const copy = new Date(base);
  copy.setDate(copy.getDate() + days);
  return copy;
}
