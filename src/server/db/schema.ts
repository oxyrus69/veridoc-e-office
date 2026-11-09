import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  date,
  pgEnum,
  uniqueIndex,
  index,
  primaryKey,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* 4.1 Enums                                                           */
/* ------------------------------------------------------------------ */

export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",
  "EXECUTIVE_SIGNER",
  "REVIEWER_LEGAL_FINANCE",
  "DOCUMENT_CREATOR",
  "AUDITOR_COMPLIANCE",
]);

export const docCategoryEnum = pgEnum("doc_category", [
  "DECREE_SK",
  "COOPERATION_CONTRACT",
  "BUDGET_MEMO",
  "OFFICIAL_LETTER",
  "SOP_POLICY",
  "MINUTES_BA",
]);

export const confidentialityEnum = pgEnum("confidentiality_level", [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "STRICTLY_SECRET",
]);

export const docLifecycleEnum = pgEnum("doc_lifecycle_status", [
  "DRAFT",
  "IN_REVIEW_WORKFLOW",
  "REVISION_REQUESTED",
  "SEALED_PUBLISHED",
  "EXPIRED",
  "REVOKED_INVALIDATED",
]);

export const stepModeEnum = pgEnum("step_mode", ["SEQUENTIAL", "PARALLEL_ANY", "PARALLEL_ALL"]);

export const stepVerdictEnum = pgEnum("step_verdict", [
  "WAITING_PREVIOUS",
  "PENDING_ACTION",
  "APPROVED_SIGNED",
  "REJECTED_RETURNED",
]);

export const dispositionUrgencyEnum = pgEnum("disposition_urgency", [
  "ROUTINE",
  "IMPORTANT",
  "URGENT_IMMEDIATE",
]);

export const certStatusEnum = pgEnum("certificate_status", ["ACTIVE", "REVOKED"]);

export const scanResultEnum = pgEnum("scan_result", ["VALID", "TAMPERED", "REVOKED", "NOT_FOUND"]);

/* ------------------------------------------------------------------ */
/* 1. profiles & signer_certificates                                   */
/* ------------------------------------------------------------------ */

export const profiles = pgTable("profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  department: text("department").notNull(),
  jobTitle: text("job_title").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const signerCertificates = pgTable(
  "signer_certificates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    keyFingerprint: text("key_fingerprint").notNull(),
    publicKeyPem: text("public_key_pem").notNull(),
    encryptedPrivateKey: text("encrypted_private_key").notNull(),
    signingPinHash: text("signing_pin_hash").notNull(),
    jobTitleOfficial: text("job_title_official").notNull(),
    status: certStatusEnum("status").notNull().default("ACTIVE"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("signer_cert_fingerprint_uq").on(t.keyFingerprint)],
);

/* ------------------------------------------------------------------ */
/* 2. document_templates                                               */
/* ------------------------------------------------------------------ */

export type TemplateVariable = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "currency" | "textarea";
  required?: boolean;
};

export type WorkflowStepSeed = {
  name: string;
  role: "EXECUTIVE_SIGNER" | "REVIEWER_LEGAL_FINANCE";
  mode: "SEQUENTIAL" | "PARALLEL_ANY" | "PARALLEL_ALL";
  slaHours: number;
};

export const documentTemplates = pgTable("document_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: docCategoryEnum("category").notNull(),
  numberPrefixFormat: text("number_prefix_format").notNull(),
  variablesSchemaJson: jsonb("variables_schema_json").$type<TemplateVariable[]>().notNull(),
  bodyMarkdownTemplate: text("body_markdown_template").notNull(),
  defaultWorkflowStepsJson: jsonb("default_workflow_steps_json").$type<WorkflowStepSeed[]>().notNull(),
  slaHoursPerStep: integer("sla_hours_per_step").notNull().default(24),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 3. official_documents                                               */
/* ------------------------------------------------------------------ */

export const officialDocuments = pgTable(
  "official_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentNumber: text("document_number"),
    verificationCode: text("verification_code").notNull(),
    templateId: uuid("template_id").references(() => documentTemplates.id, { onDelete: "set null" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    departmentName: text("department_name").notNull(),
    title: text("title").notNull(),
    category: docCategoryEnum("category").notNull(),
    confidentiality: confidentialityEnum("confidentiality").notNull().default("INTERNAL"),
    status: docLifecycleEnum("status").notNull().default("DRAFT"),
    currentVersionNo: integer("current_version_no").notNull().default(1),
    currentStepOrder: integer("current_step_order").notNull().default(0),
    effectiveFrom: date("effective_from").notNull(),
    effectiveUntil: date("effective_until"),
    canonicalContentHash: text("canonical_content_hash"),
    finalSignatureChainHash: text("final_signature_chain_hash"),
    sealedAt: timestamp("sealed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => profiles.id, { onDelete: "set null" }),
    revocationReason: text("revocation_reason"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("official_docs_number_uq").on(t.documentNumber),
    uniqueIndex("official_docs_verification_code_uq").on(t.verificationCode),
    index("official_docs_status_idx").on(t.status),
  ],
);

/* ------------------------------------------------------------------ */
/* 4. document_versions                                                */
/* ------------------------------------------------------------------ */

export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => officialDocuments.id, { onDelete: "cascade" }),
    versionNo: integer("version_no").notNull(),
    variablesPayloadJson: jsonb("variables_payload_json").$type<Record<string, unknown>>().notNull(),
    renderedBodyText: text("rendered_body_text").notNull(),
    contentSha256: text("content_sha256").notNull(),
    changeNotes: text("change_notes").notNull().default(""),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("document_versions_doc_version_uq").on(t.documentId, t.versionNo)],
);

/* ------------------------------------------------------------------ */
/* 5. approval_workflow_steps                                          */
/* ------------------------------------------------------------------ */

export const approvalWorkflowSteps = pgTable(
  "approval_workflow_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => officialDocuments.id, { onDelete: "cascade" }),
    stepOrder: integer("step_order").notNull(),
    stepName: text("step_name").notNull(),
    mode: stepModeEnum("mode").notNull().default("SEQUENTIAL"),
    assignedApproverId: uuid("assigned_approver_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    verdict: stepVerdictEnum("verdict").notNull().default("WAITING_PREVIOUS"),
    slaDueAt: timestamp("sla_due_at", { withTimezone: true }).notNull(),
    actedAt: timestamp("acted_at", { withTimezone: true }),
    comments: text("comments"),
    signedVersionNo: integer("signed_version_no"),
    previousStepSignatureHash: text("previous_step_signature_hash").notNull().default("GENESIS"),
    stepSignatureHash: text("step_signature_hash"),
    rsaSignature: text("rsa_signature"),
    certificateFingerprint: text("certificate_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("approval_steps_doc_order_uq").on(t.documentId, t.stepOrder)],
);

/* ------------------------------------------------------------------ */
/* 6. incoming_correspondences & disposition_chains                    */
/* ------------------------------------------------------------------ */

export const incomingCorrespondences = pgTable("incoming_correspondences", {
  id: uuid("id").defaultRandom().primaryKey(),
  agendaNumber: text("agenda_number").notNull().unique(),
  senderInstitution: text("sender_institution").notNull(),
  originLetterNo: text("origin_letter_no").notNull(),
  originLetterDate: date("origin_letter_date").notNull(),
  receivedDate: date("received_date").notNull(),
  subject: text("subject").notNull(),
  summary: text("summary").notNull().default(""),
  urgency: dispositionUrgencyEnum("urgency").notNull().default("ROUTINE"),
  confidentiality: confidentialityEnum("confidentiality").notNull().default("INTERNAL"),
  recordedBy: uuid("recorded_by")
    .notNull()
    .references(() => profiles.id, { onDelete: "restrict" }),
  attachmentNote: text("attachment_note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dispositionChains = pgTable(
  "disposition_chains",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    correspondenceId: uuid("correspondence_id")
      .notNull()
      .references(() => incomingCorrespondences.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    levelOrder: integer("level_order").notNull(),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    instruction: text("instruction").notNull(),
    targetUnit: text("target_unit").notNull().default(""),
    dueDate: date("due_date").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completionNote: text("completion_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("disposition_corr_idx").on(t.correspondenceId)],
);

/* ------------------------------------------------------------------ */
/* 7. verification_scan_logs                                           */
/* ------------------------------------------------------------------ */

export const verificationScanLogs = pgTable("verification_scan_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  verificationCode: text("verification_code").notNull(),
  documentId: uuid("document_id").references(() => officialDocuments.id, { onDelete: "set null" }),
  result: scanResultEnum("result").notNull(),
  summary: text("summary").notNull().default(""),
  ipHash: text("ip_hash").notNull().default(""),
  userAgent: text("user_agent").notNull().default(""),
  scannedAt: timestamp("scanned_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* 8. decision_rules, decision_logs, audit_logs, app_settings,         */
/*    document_sequences, idempotency_keys                             */
/* ------------------------------------------------------------------ */

export const decisionRules = pgTable("decision_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  thresholdJson: jsonb("threshold_json").$type<Record<string, number | string>>().notNull().default({}),
  severity: text("severity").notNull().default("WARNING"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const decisionLogs = pgTable("decision_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleCode: text("rule_code").notNull(),
  subjectType: text("subject_type").notNull(),
  subjectId: text("subject_id").notNull(),
  subjectLabel: text("subject_label").notNull().default(""),
  recommendation: text("recommendation").notNull(),
  impactValue: integer("impact_value").notNull().default(0),
  impactUnit: text("impact_unit").notNull().default("jam"),
  severity: text("severity").notNull().default("WARNING"),
  humanDecision: text("human_decision").notNull().default("PENDING"),
  decidedBy: uuid("decided_by").references(() => profiles.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: uuid("actor_id").references(() => profiles.id, { onDelete: "set null" }),
    actorRole: text("actor_role").notNull().default(""),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull().default(""),
    entityLabel: text("entity_label").notNull().default(""),
    detail: text("detail").notNull().default(""),
    hashPreview: text("hash_preview").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_logs_created_idx").on(t.createdAt)],
);

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  label: text("label").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentSequences = pgTable(
  "document_sequences",
  {
    scopeKey: text("scope_key").notNull(),
    periodYear: integer("period_year").notNull(),
    lastSequence: integer("last_sequence").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.scopeKey, t.periodYear] })],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  scope: text("scope").notNull(),
  resultJson: jsonb("result_json").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type Profile = typeof profiles.$inferSelect;
export type SignerCertificate = typeof signerCertificates.$inferSelect;
export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type OfficialDocument = typeof officialDocuments.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type ApprovalStep = typeof approvalWorkflowSteps.$inferSelect;
export type IncomingCorrespondence = typeof incomingCorrespondences.$inferSelect;
export type DispositionNode = typeof dispositionChains.$inferSelect;
export type ScanLog = typeof verificationScanLogs.$inferSelect;
export type DecisionLog = typeof decisionLogs.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type DocumentCategory = (typeof docCategoryEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type DocStatus = (typeof docLifecycleEnum.enumValues)[number];
export type StepVerdict = (typeof stepVerdictEnum.enumValues)[number];
export type Urgency = (typeof dispositionUrgencyEnum.enumValues)[number];
