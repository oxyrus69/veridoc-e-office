/**
 * Idempotent schema bootstrap for VeriDoc.
 * Works against PGlite (default local demo) and a real PostgreSQL server
 * (when DATABASE_URL starts with postgres://).
 */
import { mkdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";

const useServer = (process.env.DATABASE_URL ?? "").startsWith("postgres://");

const ENUMS = [
  ["user_role", ["SUPER_ADMIN", "EXECUTIVE_SIGNER", "REVIEWER_LEGAL_FINANCE", "DOCUMENT_CREATOR", "AUDITOR_COMPLIANCE"]],
  ["doc_category", ["DECREE_SK", "COOPERATION_CONTRACT", "BUDGET_MEMO", "OFFICIAL_LETTER", "SOP_POLICY", "MINUTES_BA"]],
  ["confidentiality_level", ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "STRICTLY_SECRET"]],
  ["doc_lifecycle_status", ["DRAFT", "IN_REVIEW_WORKFLOW", "REVISION_REQUESTED", "SEALED_PUBLISHED", "EXPIRED", "REVOKED_INVALIDATED"]],
  ["step_mode", ["SEQUENTIAL", "PARALLEL_ANY", "PARALLEL_ALL"]],
  ["step_verdict", ["WAITING_PREVIOUS", "PENDING_ACTION", "APPROVED_SIGNED", "REJECTED_RETURNED"]],
  ["disposition_urgency", ["ROUTINE", "IMPORTANT", "URGENT_IMMEDIATE"]],
  ["certificate_status", ["ACTIVE", "REVOKED"]],
  ["scan_result", ["VALID", "TAMPERED", "REVOKED", "NOT_FOUND"]],
];

const enumBlock = ENUMS.map(
  ([name, values]) => `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = '${name}') THEN
    CREATE TYPE ${name} AS ENUM (${values.map((v) => `'${v}'`).join(", ")});
  END IF;
END $$;
`,
).join("\n");

const TABLES = `
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  role user_role NOT NULL,
  department text NOT NULL,
  job_title text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS signer_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  key_fingerprint text NOT NULL,
  public_key_pem text NOT NULL,
  encrypted_private_key text NOT NULL,
  signing_pin_hash text NOT NULL,
  job_title_official text NOT NULL,
  status certificate_status NOT NULL DEFAULT 'ACTIVE',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_rotated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS signer_cert_fingerprint_uq ON signer_certificates (key_fingerprint);

CREATE TABLE IF NOT EXISTS document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category doc_category NOT NULL,
  number_prefix_format text NOT NULL,
  variables_schema_json jsonb NOT NULL,
  body_markdown_template text NOT NULL,
  default_workflow_steps_json jsonb NOT NULL,
  sla_hours_per_step integer NOT NULL DEFAULT 24,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS official_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number text,
  verification_code text NOT NULL,
  template_id uuid REFERENCES document_templates(id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  department_name text NOT NULL,
  title text NOT NULL,
  category doc_category NOT NULL,
  confidentiality confidentiality_level NOT NULL DEFAULT 'INTERNAL',
  status doc_lifecycle_status NOT NULL DEFAULT 'DRAFT',
  current_version_no integer NOT NULL DEFAULT 1,
  current_step_order integer NOT NULL DEFAULT 0,
  effective_from date NOT NULL,
  effective_until date,
  canonical_content_hash text,
  final_signature_chain_hash text,
  sealed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  revocation_reason text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS official_docs_number_uq ON official_documents (document_number);
CREATE UNIQUE INDEX IF NOT EXISTS official_docs_verification_code_uq ON official_documents (verification_code);
CREATE INDEX IF NOT EXISTS official_docs_status_idx ON official_documents (status);

CREATE TABLE IF NOT EXISTS document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES official_documents(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  variables_payload_json jsonb NOT NULL,
  rendered_body_text text NOT NULL,
  content_sha256 text NOT NULL,
  change_notes text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_doc_version_uq ON document_versions (document_id, version_no);

CREATE TABLE IF NOT EXISTS approval_workflow_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES official_documents(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  step_name text NOT NULL,
  mode step_mode NOT NULL DEFAULT 'SEQUENTIAL',
  assigned_approver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  verdict step_verdict NOT NULL DEFAULT 'WAITING_PREVIOUS',
  sla_due_at timestamptz NOT NULL,
  acted_at timestamptz,
  comments text,
  signed_version_no integer,
  previous_step_signature_hash text NOT NULL DEFAULT 'GENESIS',
  step_signature_hash text,
  rsa_signature text,
  certificate_fingerprint text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS approval_steps_doc_order_uq ON approval_workflow_steps (document_id, step_order);

CREATE TABLE IF NOT EXISTS incoming_correspondences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_number text NOT NULL UNIQUE,
  sender_institution text NOT NULL,
  origin_letter_no text NOT NULL,
  origin_letter_date date NOT NULL,
  received_date date NOT NULL,
  subject text NOT NULL,
  summary text NOT NULL DEFAULT '',
  urgency disposition_urgency NOT NULL DEFAULT 'ROUTINE',
  confidentiality confidentiality_level NOT NULL DEFAULT 'INTERNAL',
  recorded_by uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  attachment_note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disposition_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correspondence_id uuid NOT NULL REFERENCES incoming_correspondences(id) ON DELETE CASCADE,
  parent_id uuid,
  level_order integer NOT NULL,
  from_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  to_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  instruction text NOT NULL,
  target_unit text NOT NULL DEFAULT '',
  due_date date NOT NULL,
  is_completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  completion_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disposition_corr_idx ON disposition_chains (correspondence_id);

CREATE TABLE IF NOT EXISTS verification_scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_code text NOT NULL,
  document_id uuid REFERENCES official_documents(id) ON DELETE SET NULL,
  result scan_result NOT NULL,
  summary text NOT NULL DEFAULT '',
  ip_hash text NOT NULL DEFAULT '',
  user_agent text NOT NULL DEFAULT '',
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  threshold_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'WARNING',
  is_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS decision_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code text NOT NULL,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  subject_label text NOT NULL DEFAULT '',
  recommendation text NOT NULL,
  impact_value integer NOT NULL DEFAULT 0,
  impact_unit text NOT NULL DEFAULT 'jam',
  severity text NOT NULL DEFAULT 'WARNING',
  human_decision text NOT NULL DEFAULT 'PENDING',
  decided_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role text NOT NULL DEFAULT '',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL DEFAULT '',
  entity_label text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  hash_preview text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_created_idx ON audit_logs (created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  label text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_sequences (
  scope_key text NOT NULL,
  period_year integer NOT NULL,
  last_sequence integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope_key, period_year)
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key text PRIMARY KEY,
  scope text NOT NULL,
  result_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
`;

async function runWith(exec) {
  await exec(enumBlock);
  await exec(TABLES);
  // Idempotent column additions for databases created by an older schema.
  await exec(`
    ALTER TABLE approval_workflow_steps ADD COLUMN IF NOT EXISTS rsa_signature text;
  `);
}

async function main() {
  if (useServer) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false });
    await runWith((q) => sql.unsafe(q));
    await sql.end();
  } else {
    mkdirSync("./.data/pglite", { recursive: true });
    const client = new PGlite("./.data/pglite");
    await runWith((q) => client.exec(q));
    await client.close();
  }
  console.log(`Migration complete (${useServer ? "PostgreSQL server" : "PGlite lokal"}).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
