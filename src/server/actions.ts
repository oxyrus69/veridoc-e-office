"use server";

/**
 * Single server-action dispatcher for every interactive form in VeriDoc.
 * The form carries a hidden `name` field; every mutation emits an audit row
 * and revalidates the affected pages.
 */
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import { getCurrentUser, logout } from "@/server/session";
import { canAccess } from "@/server/auth";
import { appendAudit } from "@/server/services/audit";
import { submitApprovalVerdict } from "@/server/services/approvalEngine";
import { addDocumentRevision, createDocumentDraft, revokeDocument } from "@/server/services/documentEngine";
import {
  completeDispositionNode,
  createCorrespondence,
  getTemplateById,
  nextAgendaNumber,
  renderTemplateBody,
} from "@/server/services/templateEngine";
import { decideDecisionLog } from "@/server/services/dssEngine";
import { saveSetting } from "@/server/services/settings";
import { issueCertificate, rotateCertificate } from "@/server/services/cryptoSealEngine";
import { logScan } from "@/server/services/verificationEngine";
import { generateVerificationCode } from "@/lib/cryptoMath";

export type ActionResult = {
  ok: boolean;
  message: string;
  url?: string;
};

/** Standalone logout action so navigation chrome can render a plain form. */
export async function logoutAction() {
  await logout();
  const { redirect } = await import("next/navigation");
  redirect("/login");
}

function fields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (value && typeof value === "string") out[key] = value;
  }
  return out;
}

function revalidateAll() {
  revalidatePath("/");
}

export async function runAction(_prev: unknown, formData: FormData) {
  const f = fields(formData);
  const name = f.name ?? "";
  const user = await getCurrentUser();

  if (name === "logout") {
    await logout();
    return { ok: true, message: "Anda keluar dari VeriDoc.", url: "/login" };
  }

  if (!user) {
    return { ok: false, message: "Sesi berakhir. Silakan masuk kembali." } satisfies ActionResult;
  }

  try {
    switch (name) {
      /* ---------- approval ---------- */
      case "approval:approve":
      case "approval:reject": {
        const isApprove = name === "approval:approve";
        const result = await submitApprovalVerdict({
          documentId: f.documentId,
          approverId: user.u,
          pin: f.pin ?? "",
          verdict: isApprove ? "APPROVED_SIGNED" : "REJECTED_RETURNED",
          comments: f.comments || (isApprove ? "Disetujui." : ""),
          expectedVersion: f.expectedVersion ? Number(f.expectedVersion) : undefined,
        });
        if (!result.ok) return { ok: false, message: result.message };
        revalidateAll();
        return {
          ok: true,
          message: result.message,
          url: isApprove && f.documentId ? `/documents/${f.documentId}` : undefined,
        };
      }

      /* ---------- compose ---------- */
      case "compose:submit": {
        if (!canAccess(user.r, "/documents/compose")) {
          return { ok: false, message: "Peran Anda tidak dapat menyusun dokumen." };
        }
        const template = await getTemplateById(f.templateId ?? "");
        if (!template || !template.isActive) {
          return { ok: false, message: "Pilih template naskah yang aktif." };
        }
        if (!f.title?.trim()) return { ok: false, message: "Judul dokumen wajib diisi." };

        const variables: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(f)) {
          if (key.startsWith("var__")) variables[key.slice(5)] = value;
        }
        const bodyText = renderTemplateBody(template.bodyMarkdownTemplate, {
          ...variables,
          nomor_surat: "(menunggu nomor resmi)",
          org_name: "VeriDoc Nusantara",
        });

        const workflow: { name: string; approverId: string; mode: "SEQUENTIAL" | "PARALLEL_ANY" | "PARALLEL_ALL"; slaHours: number }[] = [];
        for (let i = 1; i <= 3; i += 1) {
          const approverId = f[`step${i}_approver`];
          if (!approverId) break;
          const seed = (template.defaultWorkflowStepsJson ?? [])[i - 1];
          workflow.push({
            name: seed?.name ?? `Pengesahan Tahap ${i}`,
            approverId,
            mode: (seed?.mode ?? "SEQUENTIAL") as "SEQUENTIAL",
            slaHours: seed?.slaHours ?? 24,
          });
        }
        if (workflow.length === 0) {
          return { ok: false, message: "Minimal satu penyetuju harus ditunjuk." };
        }

        const submitted = Boolean(f.submitNow);
        const { documentId } = await createDocumentDraft({
          templateId: template.id,
          creatorId: user.u,
          title: f.title.trim(),
          category: template.category,
          confidentiality: (f.confidentiality ?? "INTERNAL") as "INTERNAL",
          departmentName: f.departmentName?.trim() || user.department,
          variablesPayload: variables,
          renderedBodyText: bodyText,
          effectiveFrom: f.effectiveFrom || new Date().toISOString().slice(0, 10),
          effectiveUntil: f.effectiveUntil || null,
          workflow,
          submit: submitted,
          verificationCode: generateVerificationCode(new Date().getFullYear()),
        });

        const db = await getDb();
        await appendAudit({
          actorId: user.u,
          actorRole: user.r,
          action: submitted ? "DOCUMENT_SUBMITTED" : "DOCUMENT_CREATED",
          entityType: "document",
          entityId: documentId,
          entityLabel: f.title.trim(),
          detail: submitted
            ? `Draf diajukan dengan ${workflow.length} tahap persetujuan`
            : "Draf disimpan tanpa mengajukan persetujuan",
          db,
        });

        revalidateAll();
        return {
          ok: true,
          message: submitted ? "Dokumen diajukan ke alur persetujuan." : "Draf tersimpan.",
          url: `/documents/${documentId}`,
        };
      }

      /* ---------- document maintenance ---------- */
      case "document:revision": {
        if (user.r === "AUDITOR_COMPLIANCE") {
          return { ok: false, message: "Auditor tidak dapat mengubah dokumen." };
        }
        const notes = f.changeNotes?.trim();
        if (!notes) return { ok: false, message: "Catatan perubahan wajib diisi." };
        const bodyText = f.bodyText?.trim();
        if (!bodyText) return { ok: false, message: "Isi naskah tidak boleh kosong." };

        let variablesPayload: Record<string, unknown> = {};
        if (f.variables) {
          try {
            variablesPayload = JSON.parse(f.variables);
          } catch {
            variablesPayload = {};
          }
        }

        const result = await addDocumentRevision({
          documentId: f.documentId,
          creatorId: user.u,
          variablesPayload,
          renderedBodyText: bodyText,
          changeNotes: notes,
          effectiveFrom: f.effectiveFrom || undefined,
          effectiveUntil: f.effectiveUntil || null,
          slaHours: Number(f.slaHours || 24),
        });
        const db = await getDb();
        await appendAudit({
          actorId: user.u,
          actorRole: user.r,
          action: "VERSION_UPLOADED",
          entityType: "document",
          entityId: f.documentId,
          entityLabel: "",
          detail: `Versi ${result.versionNo} diunggah; ${result.resetSteps} tahap persetujuan direset`,
          db,
        });
        revalidateAll();
        return {
          ok: true,
          message: `Versi ${result.versionNo} diunggah. Seluruh alur persetujuan direset ke tahap 1.`,
          url: `/documents/${f.documentId}`,
        };
      }

      case "document:revoke": {
        if (user.r !== "SUPER_ADMIN") {
          return { ok: false, message: "Hanya Super Admin yang dapat mencabut naskah." };
        }
        if (!f.reason?.trim()) return { ok: false, message: "Alasan pencabutan wajib diisi." };
        await revokeDocument({ documentId: f.documentId, revokedBy: user.u, reason: f.reason.trim() });
        const db = await getDb();
        await appendAudit({
          actorId: user.u,
          actorRole: user.r,
          action: "DOCUMENT_REVOKED",
          entityType: "document",
          entityId: f.documentId,
          entityLabel: f.entityLabel ?? "",
          detail: `Dikutip karena: ${f.reason.trim()}`,
          db,
        });
        revalidateAll();
        return { ok: true, message: "Naskah dicabut. Salinan fisik tidak lagi berlaku.", url: `/documents/${f.documentId}` };
      }

      /* ---------- correspondence & dispositions ---------- */
      case "correspondence:create": {
        if (user.r === "AUDITOR_COMPLIANCE") {
          return { ok: false, message: "Auditor tidak dapat mencatat agenda surat." };
        }
        if (!f.subject?.trim() || !f.senderInstitution?.trim()) {
          return { ok: false, message: "Pengirim dan perihal wajib diisi." };
        }
        const agendaNumber = await nextAgendaNumber();
        const row = await createCorrespondence({
          agendaNumber,
          senderInstitution: f.senderInstitution.trim(),
          originLetterNo: f.originLetterNo?.trim() || "-",
          originLetterDate: f.originLetterDate?.trim() || new Date().toISOString().slice(0, 10),
          receivedDate: f.receivedDate?.trim() || new Date().toISOString().slice(0, 10),
          subject: f.subject.trim(),
          summary: f.summary ?? "",
          urgency: (f.urgency ?? "ROUTINE") as "ROUTINE",
          confidentiality: (f.confidentiality ?? "INTERNAL") as "INTERNAL",
          recordedBy: user.u,
          attachmentNote: f.attachmentNote || "-",
        });
        revalidateAll();
        return { ok: true, message: `Agenda ${agendaNumber} tersimpan.`, url: `/dispositions/${row.id}` };
      }

      case "disposition:assign": {
        if (user.r === "AUDITOR_COMPLIANCE") {
          return { ok: false, message: "Auditor tidak dapat mendisposisikan surat." };
        }
        if (!f.instruction?.trim() || !f.toUserId) {
          return { ok: false, message: "Instruksi dan pelaksana wajib diisi." };
        }
        const db = await getDb();
        const nodes = await db
          .select({ parentId: schema.dispositionChains.parentId })
          .from(schema.dispositionChains)
          .where(eq(schema.dispositionChains.correspondenceId, f.correspondenceId));
        const parentId = f.parentId || null;
        const siblings = parentId ? nodes.filter((n) => n.parentId === parentId) : [];
        const levelOrder = parentId ? siblings.length + 2 : 1;

        await db.insert(schema.dispositionChains).values({
          correspondenceId: f.correspondenceId,
          parentId,
          levelOrder,
          fromUserId: user.u,
          toUserId: f.toUserId,
          instruction: f.instruction.trim(),
          targetUnit: f.targetUnit?.trim() ?? "",
          dueDate: f.dueDate || new Date().toISOString().slice(0, 10),
        });
        await appendAudit({
          actorId: user.u,
          actorRole: user.r,
          action: "DISPOSITION_ASSIGNED",
          entityType: "disposition",
          entityId: f.correspondenceId,
          entityLabel: f.subjectLabel ?? "",
          detail: `Instruksi ke ${f.targetUnit?.trim() || "unit pelaksana"}: "${f.instruction.trim()}" (tenggat ${f.dueDate})`,
          db,
        });
        revalidateAll();
        return { ok: true, message: "Instruksi disposisi tersimpan.", url: `/dispositions/${f.correspondenceId}` };
      }

      case "disposition:complete": {
        if (user.r === "AUDITOR_COMPLIANCE") {
          return { ok: false, message: "Auditor tidak dapat menuntaskan disposisi." };
        }
        await completeDispositionNode({ nodeId: f.nodeId, note: f.note?.trim() || "Selesai ditindaklanjuti." });
        revalidateAll();
        return { ok: true, message: "Instruksi ditandai selesai.", url: f.detailHref };
      }

      /* ---------- DSS ---------- */
      case "dss:decide": {
        if (!["SUPER_ADMIN", "AUDITOR_COMPLIANCE"].includes(user.r)) {
          return { ok: false, message: "Hanya admin atau auditor yang mendokumentasikan keputusan." };
        }
        await decideDecisionLog({ id: f.logId, decision: (f.decision as "ACCEPTED" | "DEFERRED" | "DISMISSED") ?? "DEFERRED", actorId: user.u });
        const db = await getDb();
        await appendAudit({
          actorId: user.u,
          actorRole: user.r,
          action: "DSS_DECISION",
          entityType: "decision_log",
          entityId: f.logId,
          detail: `Keputusan ${f.decision} atas temuan ${f.subjectType ?? ""}`,
          db,
        });
        revalidateAll();
        return { ok: true, message: "Keputusan tercatat pada jejak DSS." };
      }

      /* ---------- settings ---------- */
      case "settings:save": {
        if (user.r !== "SUPER_ADMIN") return { ok: false, message: "Hanya Super Admin yang mengubah pengaturan." };
        if (!f.key || !f.value) return { ok: false, message: "Pengaturan tidak lengkap." };
        await saveSetting({ key: f.key, value: f.value.trim(), label: f.label });
        revalidateAll();
        return { ok: true, message: "Pengaturan disimpan." };
      }

      /* ---------- certificates ---------- */
      case "certificate:rotation": {
        if (user.r !== "SUPER_ADMIN") return { ok: false, message: "Hanya Super Admin yang merotasi kunci." };
        const { keyFingerprint } = await rotateCertificate({
          certificateId: f.certificateId,
          pin: f.pin ?? "",
          validityDays: 365,
        });
        revalidateAll();
        return { ok: true, message: `Kunci baru terbit: ${keyFingerprint.slice(0, 12)}…` };
      }

      case "certificate:issue": {
        if (user.r !== "SUPER_ADMIN") return { ok: false, message: "Hanya Super Admin yang menerbitkan sertifikat." };
        if (!f.pin || f.pin.length < 6) return { ok: false, message: "PIN minimal 6 digit." };
        await issueCertificate({
          userId: f.userId,
          jobTitleOfficial: f.jobTitleOfficial?.trim() || "Pejabat Penandatangan",
          pin: f.pin,
          validityDays: 365,
        });
        revalidateAll();
        return { ok: true, message: "Sertifikat penandatangan terbit." };
      }

      /* ---------- verification scan log ---------- */
      case "verify:log": {
        await logScan({
          verificationCode: f.verificationCode,
          documentId: f.documentId || null,
          result: (f.result as "VALID" | "TAMPERED" | "REVOKED" | "NOT_FOUND") ?? "VALID",
          summary: f.summary ?? "",
        });
        return { ok: true, message: "Pemindaian tercatat." };
      }

      default:
        return { ok: false, message: `Aksi tidak dikenal: ${name}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Terjadi kesalahan saat memproses.";
    return { ok: false, message };
  }
}
