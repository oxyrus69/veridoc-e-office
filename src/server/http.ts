import { NextResponse } from "next/server";
import { isServerPostgres } from "@/server/db";

const COOKIE = "veridoc_uid";

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  role:
    | "SUPER_ADMIN"
    | "EXECUTIVE_SIGNER"
    | "REVIEWER_LEGAL_FINANCE"
    | "DOCUMENT_CREATOR"
    | "AUDITOR_COMPLIANCE";
  department: string;
  jobTitle: string;
  certificateFingerprint: string | null;
};

export function cookieName() {
  return COOKIE;
}

export function dbMode() {
  return isServerPostgres() ? "postgres" : "pglite";
}

export function unauthorized(message = "Sesi berakhir. Silakan masuk kembali.") {
  return NextResponse.json({ ok: false, message }, { status: 401 });
}

export function forbidden(message = "Peran Anda tidak diizinkan melakukan tindakan ini.") {
  return NextResponse.json({ ok: false, message }, { status: 403 });
}

export function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export function ok<T extends Record<string, unknown>>(payload: T) {
  return NextResponse.json({ ok: true, ...payload });
}

export function csvResponse(csv: string, filename: string) {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
