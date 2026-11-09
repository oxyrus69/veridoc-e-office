import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { listDocuments } from "@/server/services/documentEngine";
import { getCurrentUser } from "@/server/session";
import { CATEGORY_LABEL, CONFIDENTIALITY_LABEL, STATUS_LABEL } from "@/lib/labels";
import type { DocumentCategory, DocStatus } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Excel-friendly CSV: UTF-8 BOM + `;` delimiter + CRLF rows. */export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir." }, { status: 401 });
  }

  const rows = await listDocuments();
  const csv = toCsv(
    rows.map((row) => ({
      nomor_resmi: row.documentNumber ?? "",
      kode_verifikasi: row.verificationCode,
      judul: row.title,
      kategori: CATEGORY_LABEL[row.category as DocumentCategory] ?? row.category,
      status: STATUS_LABEL[row.status as DocStatus] ?? row.status,
      kerahasiaan: CONFIDENTIALITY_LABEL[row.confidentiality] ?? row.confidentiality,
      unit: row.departmentName,
      penyusun: row.creatorName,
      versi_aktif: row.currentVersionNo,
      tahap: `${row.approvedSteps}/${row.totalSteps}`,
      berlaku_dari: row.effectiveFrom,
      berlaku_hingga: row.effectiveUntil ?? "",
      disegel_pada: row.sealedAt ? row.sealedAt.toISOString() : "",
      hash_isi: row.canonicalContentHash ?? "",
      hash_rantai: row.finalSignatureChainHash ?? "",
    })),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="veridoc-buku-agenda-dokumen-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
