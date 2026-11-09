import { NextResponse } from "next/server";
import { toCsv } from "@/lib/csv";
import { listCorrespondences, getCorrespondenceDetail } from "@/server/services/templateEngine";
import { getCurrentUser } from "@/server/session";
import { CONFIDENTIALITY_LABEL, URGENCY_LABEL } from "@/lib/labels";
import type { Urgency } from "@/server/db/schema";

export const dynamic = "force-dynamic";

/** Agenda + one row per disposition instruction (Excel-friendly CSV). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Sesi berakhir." }, { status: 401 });
  }

  const letters = await listCorrespondences();
  const rows: Record<string, unknown>[] = [];

  for (const letter of letters) {
    const detail = await getCorrespondenceDetail(letter.id);
    const nodes = detail?.nodes ?? [];
    const base = {
      agenda: letter.agendaNumber,
      diterima: letter.receivedDate,
      pengirim: letter.senderInstitution,
      nomor_surat: letter.originLetterNo,
      tanggal_surat: letter.originLetterDate,
      perihal: letter.subject,
      sifat: URGENCY_LABEL[letter.urgency as Urgency] ?? letter.urgency,
      kerahasiaan: CONFIDENTIALITY_LABEL[letter.confidentiality] ?? letter.confidentiality,
    };

    if (nodes.length === 0) {
      rows.push({ ...base, tingkat: "", dari: "", kepada: "", unit: "", instruksi: "", tenggat: "", status: "belum didisposisi", selesai_pada: "", catatan: "" });
      continue;
    }

    for (const node of nodes) {
      rows.push({
        ...base,
        tingkat: node.levelOrder,
        dari: node.fromName,
        kepada: node.toName,
        unit: node.targetUnit,
        instruksi: node.instruction,
        tenggat: node.dueDate,
        status: node.isCompleted ? "selesai" : "berjalan",
        selesai_pada: node.completedAt ? new Date(node.completedAt).toISOString() : "",
        catatan: node.completionNote ?? "",
      });
    }
  }

  const csv = toCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="veridoc-agenda-disposisi-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
