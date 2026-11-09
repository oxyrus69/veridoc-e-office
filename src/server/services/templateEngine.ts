import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/server/db";
import type { Database } from "@/server/db";
import type { Urgency } from "@/server/db/schema";

/** Renders `{{var}}` placeholders and Markdown-ish dashes for print. */
export function renderTemplateBody(template: string, vars: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") return `(${key} belum diisi)`;
    return String(value);
  });
}

export type AvailableVariable = {
  key: string;
  label: string;
  type: string;
  required: boolean;
};

export function buildDefaultWorkflow(): { name: string; role: string; mode: string; slaHours: number }[] {
  return [
    { name: "Verifikasi Legal & Anggaran", role: "REVIEWER_LEGAL_FINANCE", mode: "SEQUENTIAL", slaHours: 24 },
    { name: "Paraf Biro Hukum", role: "REVIEWER_LEGAL_FINANCE", mode: "SEQUENTIAL", slaHours: 24 },
    { name: "Tanda Tangan Pengesahan", role: "EXECUTIVE_SIGNER", mode: "SEQUENTIAL", slaHours: 48 },
  ];
}

export async function listTemplates(db?: Database) {
  const database = db ?? (await getDb());
  return database
    .select()
    .from(schema.documentTemplates)
    .where(eq(schema.documentTemplates.isActive, true))
    .orderBy(asc(schema.documentTemplates.name));
}

export async function getTemplateById(id: string, db?: Database) {
  const database = db ?? (await getDb());
  const [row] = await database.select().from(schema.documentTemplates).where(eq(schema.documentTemplates.id, id)).limit(1);
  return row ?? null;
}

export async function getTemplateByCode(code: string, db?: Database) {
  const database = db ?? (await getDb());
  const [row] = await database.select().from(schema.documentTemplates).where(eq(schema.documentTemplates.code, code)).limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Incoming correspondence & dispositions                              */
/* ------------------------------------------------------------------ */

export type DispositionTreeNode = {
  id: string;
  levelOrder: number;
  instruction: string;
  targetUnit: string;
  dueDate: string;
  isCompleted: boolean;
  completedAt: Date | null;
  completionNote: string | null;
  fromName: string;
  toName: string;
  toRole: string;
  isOverdue: boolean;
  children: DispositionTreeNode[];
};

export type CorrespondenceListRow = {
  id: string;
  agendaNumber: string;
  senderInstitution: string;
  originLetterNo: string;
  originLetterDate: string;
  receivedDate: string;
  subject: string;
  urgency: Urgency;
  confidentiality: string;
  recordedByName: string;
  instructions: number;
  completed: number;
  openNodes: number;
  overdueNodes: number;
  earliestDue: string | null;
  createdAt: Date;
};

export async function listCorrespondences(db?: Database): Promise<CorrespondenceListRow[]> {
  const database = db ?? (await getDb());
  const rows = await database
    .select({
      id: schema.incomingCorrespondences.id,
      agendaNumber: schema.incomingCorrespondences.agendaNumber,
      senderInstitution: schema.incomingCorrespondences.senderInstitution,
      originLetterNo: schema.incomingCorrespondences.originLetterNo,
      originLetterDate: schema.incomingCorrespondences.originLetterDate,
      receivedDate: schema.incomingCorrespondences.receivedDate,
      subject: schema.incomingCorrespondences.subject,
      urgency: schema.incomingCorrespondences.urgency,
      confidentiality: schema.incomingCorrespondences.confidentiality,
      recordedByName: schema.profiles.fullName,
      createdAt: schema.incomingCorrespondences.createdAt,
    })
    .from(schema.incomingCorrespondences)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.incomingCorrespondences.recordedBy))
    .orderBy(asc(schema.incomingCorrespondences.receivedDate));

  const nodes = await database.select().from(schema.dispositionChains);
  const today = new Date().toISOString().slice(0, 10);

  return rows.map((row) => {
    const own = nodes.filter((n) => n.correspondenceId === row.id);
    const open = own.filter((n) => !n.isCompleted);
    const overdue = open.filter((n) => n.dueDate < today);
    const dueDates = open.map((n) => n.dueDate).sort();
    return {
      ...row,
      receivedDate: String(row.receivedDate),
      originLetterDate: String(row.originLetterDate),
      createdAt: new Date(row.createdAt),
      instructions: own.length,
      completed: own.filter((n) => n.isCompleted).length,
      openNodes: open.length,
      overdueNodes: overdue.length,
      earliestDue: dueDates[0] ?? null,
    };
  });
}

export async function getCorrespondenceDetail(id: string, db?: Database) {
  const database = db ?? (await getDb());
  const [row] = await database
    .select({
      id: schema.incomingCorrespondences.id,
      agendaNumber: schema.incomingCorrespondences.agendaNumber,
      senderInstitution: schema.incomingCorrespondences.senderInstitution,
      originLetterNo: schema.incomingCorrespondences.originLetterNo,
      originLetterDate: schema.incomingCorrespondences.originLetterDate,
      receivedDate: schema.incomingCorrespondences.receivedDate,
      subject: schema.incomingCorrespondences.subject,
      summary: schema.incomingCorrespondences.summary,
      urgency: schema.incomingCorrespondences.urgency,
      confidentiality: schema.incomingCorrespondences.confidentiality,
      attachmentNote: schema.incomingCorrespondences.attachmentNote,
      recordedByName: schema.profiles.fullName,
      createdAt: schema.incomingCorrespondences.createdAt,
    })
    .from(schema.incomingCorrespondences)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.incomingCorrespondences.recordedBy))
    .where(eq(schema.incomingCorrespondences.id, id))
    .limit(1);

  if (!row) return null;

  const nodes = await database
    .select({
      id: schema.dispositionChains.id,
      parentId: schema.dispositionChains.parentId,
      levelOrder: schema.dispositionChains.levelOrder,
      instruction: schema.dispositionChains.instruction,
      targetUnit: schema.dispositionChains.targetUnit,
      dueDate: schema.dispositionChains.dueDate,
      isCompleted: schema.dispositionChains.isCompleted,
      completedAt: schema.dispositionChains.completedAt,
      completionNote: schema.dispositionChains.completionNote,
      fromName: schema.profiles.fullName,
      fromId: schema.dispositionChains.fromUserId,
      toId: schema.dispositionChains.toUserId,
      toName: schema.profiles.fullName,
      toRole: schema.profiles.role,
      createdAt: schema.dispositionChains.createdAt,
    })
    .from(schema.dispositionChains)
    .innerJoin(schema.profiles, eq(schema.profiles.id, schema.dispositionChains.toUserId))
    .where(eq(schema.dispositionChains.correspondenceId, id))
    .orderBy(asc(schema.dispositionChains.levelOrder), asc(schema.dispositionChains.createdAt));

  const today = new Date().toISOString().slice(0, 10);
  const byId = new Map<string, DispositionTreeNode>();
  const roots: DispositionTreeNode[] = [];

  for (const node of nodes) {
    byId.set(node.id, {
      id: node.id,
      levelOrder: node.levelOrder,
      instruction: node.instruction,
      targetUnit: node.targetUnit,
      dueDate: String(node.dueDate),
      isCompleted: node.isCompleted,
      completedAt: node.completedAt ? new Date(node.completedAt) : null,
      completionNote: node.completionNote,
      fromName: node.fromName,
      toName: node.toName,
      toRole: node.toRole,
      isOverdue: !node.isCompleted && String(node.dueDate) < today,
      children: [],
    });
  }
  for (const node of nodes) {
    const tree = byId.get(node.id)!;
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(tree);
    else roots.push(tree);
  }

  return {
    ...row,
    originLetterDate: String(row.originLetterDate),
    receivedDate: String(row.receivedDate),
    createdAt: new Date(row.createdAt),
    roots,
    nodes,
  };
}

export async function createDispositionInstruction(params: {
  correspondenceId: string;
  fromUserId: string;
  toUserId: string;
  parentId: string | null;
  instruction: string;
  targetUnit: string;
  dueDate: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  const siblings = await db
    .select()
    .from(schema.dispositionChains)
    .where(eq(schema.dispositionChains.correspondenceId, params.correspondenceId));
  const levelOrder = params.parentId ? siblings.filter((s) => s.parentId === params.parentId).length + 2 : 1;

  await db.insert(schema.dispositionChains).values({
    correspondenceId: params.correspondenceId,
    parentId: params.parentId,
    levelOrder,
    fromUserId: params.fromUserId,
    toUserId: params.toUserId,
    instruction: params.instruction,
    targetUnit: params.targetUnit,
    dueDate: params.dueDate,
  });
}

export async function completeDispositionNode(params: {
  nodeId: string;
  note: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  await db
    .update(schema.dispositionChains)
    .set({ isCompleted: true, completedAt: new Date(), completionNote: params.note })
    .where(eq(schema.dispositionChains.id, params.nodeId));
}

export async function createCorrespondence(params: {
  agendaNumber: string;
  senderInstitution: string;
  originLetterNo: string;
  originLetterDate: string;
  receivedDate: string;
  subject: string;
  summary: string;
  urgency: Urgency;
  confidentiality: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "STRICTLY_SECRET";
  recordedBy: string;
  attachmentNote: string;
  db?: Database;
}) {
  const db = params.db ?? (await getDb());
  const [row] = await db
    .insert(schema.incomingCorrespondences)
    .values({
      agendaNumber: params.agendaNumber,
      senderInstitution: params.senderInstitution,
      originLetterNo: params.originLetterNo,
      originLetterDate: params.originLetterDate,
      receivedDate: params.receivedDate,
      subject: params.subject,
      summary: params.summary,
      urgency: params.urgency,
      confidentiality: params.confidentiality,
      recordedBy: params.recordedBy,
      attachmentNote: params.attachmentNote,
    })
    .returning();
  return row;
}

export async function nextAgendaNumber(db?: Database) {
  const database = db ?? (await getDb());
  const rows = await database.select({ agendaNumber: schema.incomingCorrespondences.agendaNumber }).from(schema.incomingCorrespondences);
  const year = new Date().getFullYear();
  return `AG-${year}-${String(rows.length + 1).padStart(4, "0")}`;
}
