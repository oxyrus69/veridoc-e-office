/**
 * VeriDoc demo seed.
 *
 * Builds a coherent, cryptographically valid dataset:
 *   - 5 demo accounts (password: veridoc123)
 *   - 4 RSA-PSS signer certificates (PIN: 123456)
 *   - 4 document templates
 *   - 8 official documents covering every lifecycle state
 *   - 4 incoming letters with multi-level disposition chains
 *
 * Every sealed document is produced with the exact same primitive functions
 * the app uses at runtime, so `/verify` genuinely re-validates the chain.
 */
import { PGlite } from "@electric-sql/pglite";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  GENESIS_CHAIN,
  computeCanonicalDocumentHashPure,
  computeChainedSignaturePure,
  deriveSigningKey,
  encryptPrivateKey,
  generateRsaPssKeyPair,
  hashPassword,
  hashSigningPin,
  sha256Hex,
  signChainHash,
} from "../src/lib/cryptoMath.ts";

const KEY_SECRET = process.env.VERIDOC_KEY_SECRET ?? "veridoc-demo-key-envelope-secret-v1";
const PASSWORD = "veridoc123";
const PIN = "123456";

const HOUR = 3600000;
const DAY = 86400000;
const now = new Date();
const ago = (h) => new Date(now.getTime() - h * HOUR);
const ahead = (h) => new Date(now.getTime() + h * HOUR);
const isoDate = (d) => d.toISOString().slice(0, 10);
const daysAhead = (n) => isoDate(new Date(now.getTime() + n * DAY));
const daysAgo = (n) => isoDate(new Date(now.getTime() - n * DAY));

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];
const romanMonth = ROMAN[now.getMonth()];

async function main() {
  mkdirSync("./.data/pglite", { recursive: true });
  const db = new PGlite("./.data/pglite");
  const q = (sql, params) => db.query(sql, params);

  /* ---------------------------------------------------------------- */
  /* Reset demo data (child tables first)                             */
  /* ---------------------------------------------------------------- */
  await q(`
    TRUNCATE TABLE verification_scan_logs, decision_logs, decision_rules, audit_logs,
      disposition_chains, incoming_correspondences,
      approval_workflow_steps, document_versions, official_documents,
      document_templates, signer_certificates, profiles,
      app_settings, document_sequences, idempotency_keys
    RESTART IDENTITY CASCADE;
  `);

  /* ---------------------------------------------------------------- */
  /* 5 accounts                                                       */
  /* ---------------------------------------------------------------- */
  const passwordHash = hashPassword(PASSWORD);

  const people = {
    sekretariat: {
      id: randomUUID(),
      email: "sekretariat@veridoc.id",
      fullName: "Rahmawati Kusumawardhani",
      role: "SUPER_ADMIN",
      department: "Sekretariat Direksi",
      jobTitle: "Kepala Sekretariat Direksi",
    },
    direktur: {
      id: randomUUID(),
      email: "direktur@veridoc.id",
      fullName: "Dr. Bagas Prasetyo Wibowo",
      role: "EXECUTIVE_SIGNER",
      department: "Direksi",
      jobTitle: "Direktur Utama",
    },
    legal: {
      id: randomUUID(),
      email: "legal.finance@veridoc.id",
      fullName: "Nadia Puspita Sari",
      role: "REVIEWER_LEGAL_FINANCE",
      department: "Biro Hukum & Keuangan",
      jobTitle: "Kepala Biro Hukum dan Anggaran",
    },
    staf: {
      id: randomUUID(),
      email: "staf.admin@veridoc.id",
      fullName: "Ahmad Fauzan Hakim",
      role: "DOCUMENT_CREATOR",
      department: "Sekretariat Direksi",
      jobTitle: "Staf Administrasi Naskah",
    },
    auditor: {
      id: randomUUID(),
      email: "auditor@veridoc.id",
      fullName: "Siti Halimah Rahayu",
      role: "AUDITOR_COMPLIANCE",
      department: "Satuan Pengawas Internal",
      jobTitle: "Auditor Kepatuhan Senior",
    },
  };

  for (const person of Object.values(people)) {
    await q(
      `INSERT INTO profiles (id, email, full_name, role, department, job_title, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [person.id, person.email, person.fullName, person.role, person.department, person.jobTitle, passwordHash],
    );
  }

  /* ---------------------------------------------------------------- */
  /* 4 signer certificates                                            */
  /* ---------------------------------------------------------------- */
  const officers = [
    { person: people.direktur, title: "Direktur Utama", issuedDaysAgo: 120, validDays: 300, rotateDaysAgo: 120 },
    { person: people.legal, title: "Kepala Biro Hukum dan Anggaran", issuedDaysAgo: 210, validDays: 200, rotateDaysAgo: 210 },
    { person: people.sekretariat, title: "Kepala Sekretariat Direksi", issuedDaysAgo: 60, validDays: 330, rotateDaysAgo: 60 },
    // Deliberately close to expiry so the DSS rotation rule fires.
    { person: people.auditor, title: "Auditor Kepatuhan Senior", issuedDaysAgo: 330, validDays: 355, rotateDaysAgo: 195 },
  ];

  /** keyed by person id */
  const certificates = {};

  for (const officer of officers) {
    const { publicKeyPem, privateKeyPem } = generateRsaPssKeyPair();
    const fingerprint = sha256Hex(publicKeyPem).slice(0, 40);
    const id = randomUUID();
    await q(
      `INSERT INTO signer_certificates
        (id, user_id, key_fingerprint, public_key_pem, encrypted_private_key, signing_pin_hash,
         job_title_official, status, issued_at, expires_at, last_rotated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ACTIVE',$8,$9,$10)`,
      [
        id,
        officer.person.id,
        fingerprint,
        publicKeyPem,
        encryptPrivateKey(privateKeyPem, KEY_SECRET),
        hashSigningPin(PIN),
        officer.title,
        ago(officer.issuedDaysAgo * 24),
        ahead(officer.validDays * 24),
        ago(officer.rotateDaysAgo * 24),
      ],
    );
    certificates[officer.person.id] = { id, fingerprint, publicKeyPem, privateKeyPem };
  }

  /* ---------------------------------------------------------------- */
  /* 4 templates                                                      */
  /* ---------------------------------------------------------------- */
  const templates = [
    {
      code: "TPL-SK-DIREKSI",
      name: "Surat Keputusan Direksi",
      category: "DECREE_SK",
      numberPrefixFormat: "{{SEQ}}/SK-DIR/VRD/{{ROMAN_MONTH}}/{{YEAR}}",
      slaHoursPerStep: 24,
      variables: [
        { key: "nama_penerima", label: "Nama Penerima Keputusan", type: "text", required: true },
        { key: "jabatan_penerima", label: "Jabatan Penerima", type: "text", required: true },
        { key: "tentang", label: "Tentang", type: "text", required: true },
        { key: "tanggal_berlaku", label: "Tanggal Berlaku", type: "date", required: true },
        { key: "diktum", label: "Diktum Keputusan", type: "textarea", required: true },
      ],
      body: `## SURAT KEPUTUSAN DIREKSI
Nomor: {{nomor_surat}}

Tentang
### {{tentang}}

Direktur Utama {{org_name}}, setelah menimbang dan memperhatikan ketentuan yang berlaku, dengan ini memutuskan:

**KESATU** — Menetapkan {{nama_penerima}} selaku {{jabatan_penerima}}.

**KEDUA** — {{diktum}}

**KETIGA** — Keputusan ini berlaku sejak {{tanggal_berlaku}} dan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.`,
    },
    {
      code: "TPL-KONTRAK-KERJASAMA",
      name: "Kontrak Kerja Sama",
      category: "COOPERATION_CONTRACT",
      numberPrefixFormat: "{{SEQ}}/PKS-DIR/VRD/{{ROMAN_MONTH}}/{{YEAR}}",
      slaHoursPerStep: 36,
      variables: [
        { key: "nama_vendor", label: "Nama Mitra / Vendor", type: "text", required: true },
        { key: "nilai_kontrak", label: "Nilai Kontrak", type: "currency", required: true },
        { key: "lingkup_pekerjaan", label: "Lingkup Pekerjaan", type: "textarea", required: true },
        { key: "tanggal_mulai", label: "Tanggal Mulai", type: "date", required: true },
        { key: "tanggal_selesai", label: "Tanggal Selesai", type: "date", required: true },
      ],
      body: `## PERJANJIAN KERJA SAMA
Nomor: {{nomor_surat}}

Pada hari ini, PARA PIHAK sepakat mengikatkan diri dalam perjanjian kerja sama dengan ketentuan sebagai berikut.

**Pasal 1 — Para Pihak**
PIHAK PERTAMA: {{org_name}}. PIHAK KEDUA: {{nama_vendor}}.

**Pasal 2 — Lingkup Pekerjaan**
{{lingkup_pekerjaan}}

**Pasal 3 — Nilai Perjanjian**
Nilai perjanjian ditetapkan sebesar {{nilai_kontrak}} termasuk pajak yang berlaku.

**Pasal 4 — Jangka Waktu**
Perjanjian berlaku sejak {{tanggal_mulai}} sampai dengan {{tanggal_selesai}}.`,
    },
    {
      code: "TPL-MEMO-ANGGARAN",
      name: "Memo Anggaran",
      category: "BUDGET_MEMO",
      numberPrefixFormat: "{{SEQ}}/MEMO-KEU/VRD/{{ROMAN_MONTH}}/{{YEAR}}",
      slaHoursPerStep: 18,
      variables: [
        { key: "unit_pengusul", label: "Unit Pengusul", type: "text", required: true },
        { key: "kebutuhan", label: "Kebutuhan", type: "text", required: true },
        { key: "nilai_pengajuan", label: "Nilai Pengajuan", type: "currency", required: true },
        { key: "sumber_anggaran", label: "Sumber Anggaran", type: "text", required: true },
        { key: "justifikasi", label: "Justifikasi", type: "textarea", required: true },
      ],
      body: `## MEMORANDUM ANGGARAN
Nomor: {{nomor_surat}}

**Kepada:** Direktur Utama
**Dari:** {{unit_pengusul}}
**Perihal:** Pengajuan anggaran {{kebutuhan}}

**Latar belakang**
{{justifikasi}}

**Nilai pengajuan**
{{nilai_pengajuan}} bersumber dari {{sumber_anggaran}}.

**Permohonan**
Memohon persetujuan atas pengajuan anggaran tersebut agar dapat segera ditindaklanjuti pada periode berjalan.`,
    },
    {
      code: "TPL-BERITA-ACARA",
      name: "Berita Acara",
      category: "MINUTES_BA",
      numberPrefixFormat: "{{SEQ}}/BA-DIR/VRD/{{ROMAN_MONTH}}/{{YEAR}}",
      slaHoursPerStep: 12,
      variables: [
        { key: "kegiatan", label: "Nama Kegiatan", type: "text", required: true },
        { key: "hari_tanggal", label: "Hari / Tanggal", type: "text", required: true },
        { key: "lokasi", label: "Lokasi", type: "text", required: true },
        { key: "pihak_terlibat", label: "Pihak Terlibat", type: "text", required: true },
        { key: "hasil", label: "Hasil", type: "textarea", required: true },
      ],
      body: `## BERITA ACARA
Nomor: {{nomor_surat}}

Pada {{hari_tanggal}} bertempat di {{lokasi}} telah dilaksanakan {{kegiatan}}.

**Pihak yang terlibat**
{{pihak_terlibat}}

**Hasil**
{{hasil}}

Berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.`,
    },
  ];

  const templateIds = {};
  const defaultWorkflow = [
    { name: "Verifikasi Legal & Anggaran", role: "REVIEWER_LEGAL_FINANCE", mode: "SEQUENTIAL", slaHours: 24 },
    { name: "Paraf Biro Hukum", role: "REVIEWER_LEGAL_FINANCE", mode: "SEQUENTIAL", slaHours: 24 },
    { name: "Tanda Tangan Pengesahan Direktur", role: "EXECUTIVE_SIGNER", mode: "SEQUENTIAL", slaHours: 48 },
  ];

  for (const tpl of templates) {
    const id = randomUUID();
    templateIds[tpl.code] = id;
    await q(
      `INSERT INTO document_templates
        (id, code, name, category, number_prefix_format, variables_schema_json,
         body_markdown_template, default_workflow_steps_json, sla_hours_per_step)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9)`,
      [
        id,
        tpl.code,
        tpl.name,
        tpl.category,
        tpl.numberPrefixFormat,
        JSON.stringify(tpl.variables),
        tpl.body,
        JSON.stringify(defaultWorkflow),
        tpl.slaHoursPerStep,
      ],
    );
  }

  /* ---------------------------------------------------------------- */
  /* Documents                                                        */
  /* ---------------------------------------------------------------- */

  const templateByCode = Object.fromEntries(templates.map((t) => [t.code, t]));

  /**
   * Creates one document plus its version rows and workflow steps.
   * `seal` produces a genuine HMAC+RSA chain when the doc is SEALED_PUBLISHED.
   */
  async function createDocument(spec) {
    const docId = randomUUID();
    const versions =
      spec.versions ??
      [
        {
          versionNo: 1,
          variables: spec.variables,
          body: spec.body,
          contentHash: spec.contentHash,
          changeNotes: "Draf awal diajukan ke alur persetujuan.",
          createdBy: spec.creatorId,
          createdAt: spec.createdAt,
        },
      ];
    const versionNo = versions.length;

    let chainTail = GENESIS_CHAIN;
    let stepRows = [];

    for (const [index, step] of (spec.steps ?? []).entries()) {
      const order = index + 1;
      const stepId = randomUUID();
      const row = {
        id: stepId,
        order,
        name: step.name,
        mode: step.mode ?? "SEQUENTIAL",
        approverId: step.approverId,
        verdict: step.verdict,
        slaDueAt: step.slaDueAt,
        actedAt: step.actedAt ?? null,
        comments: step.comments ?? "",
        signedVersionNo: null,
        previousStepSignatureHash: GENESIS_CHAIN,
        stepSignatureHash: null,
        rsaSignature: null,
        certificateFingerprint: null,
      };

      if (step.verdict === "APPROVED_SIGNED") {
        const cert = certificates[step.approverId];
        const key = deriveSigningKey(PIN, cert.fingerprint);
        const sig = computeChainedSignaturePure({
          contentHash: spec.contentHash,
          previousSignatureHash: chainTail,
          approverId: step.approverId,
          timestamp: step.actedAt.toISOString(),
          key,
        });
        row.previousStepSignatureHash = chainTail;
        row.stepSignatureHash = sig;
        row.rsaSignature = signChainHash(cert.privateKeyPem, sig);
        row.certificateFingerprint = cert.fingerprint;
        row.signedVersionNo = versionNo;
        chainTail = sig;
      }

      stepRows.push(row);
    }

    const finalChainHash =
      spec.status === "SEALED_PUBLISHED" || spec.status === "REVOKED_INVALIDATED"
        ? sha256Hex(stepRows.filter((s) => s.stepSignatureHash).map((s) => s.stepSignatureHash).join("->"))
        : null;

    await q(
      `INSERT INTO official_documents
        (id, document_number, verification_code, template_id, creator_id, department_name, title,
         category, confidentiality, status, current_version_no, current_step_order,
         effective_from, effective_until, canonical_content_hash, final_signature_chain_hash,
         sealed_at, revoked_at, revoked_by, revocation_reason, version, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
      [
        docId,
        spec.documentNumber ?? null,
        spec.verificationCode,
        templateIds[spec.templateCode],
        spec.creatorId,
        spec.departmentName,
        spec.title,
        spec.category,
        spec.confidentiality,
        spec.status,
        versionNo,
        spec.currentStepOrder,
        spec.effectiveFrom,
        spec.effectiveUntil ?? null,
        spec.status === "SEALED_PUBLISHED" || spec.status === "REVOKED_INVALIDATED" ? spec.contentHash : null,
        finalChainHash,
        spec.sealedAt ?? null,
        spec.revokedAt ?? null,
        spec.revokedBy ?? null,
        spec.revocationReason ?? null,
        spec.rowVersion ?? 1,
        spec.creatorId,
        spec.createdAt,
        spec.updatedAt ?? spec.createdAt,
      ],
    );

    for (const version of versions) {
      await q(
        `INSERT INTO document_versions
          (id, document_id, version_no, variables_payload_json, rendered_body_text, content_sha256, change_notes, created_by, created_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9)`,
        [
          randomUUID(),
          docId,
          version.versionNo,
          JSON.stringify(version.variables),
          version.body,
          version.contentHash,
          version.changeNotes,
          version.createdBy,
          version.createdAt,
        ],
      );
    }

    for (const row of stepRows) {
      await q(
        `INSERT INTO approval_workflow_steps
          (id, document_id, step_order, step_name, mode, assigned_approver_id, verdict, sla_due_at,
           acted_at, comments, signed_version_no, previous_step_signature_hash, step_signature_hash,
           rsa_signature, certificate_fingerprint, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          row.id,
          docId,
          row.order,
          row.name,
          row.mode,
          row.approverId,
          row.verdict,
          row.slaDueAt,
          row.actedAt,
          row.comments,
          row.signedVersionNo,
          row.previousStepSignatureHash,
          row.stepSignatureHash,
          row.rsaSignature,
          row.certificateFingerprint,
          spec.createdAt,
        ],
      );
    }

    return docId;
  }

  const hashFor = (spec) =>
    computeCanonicalDocumentHashPure({
      title: spec.title,
      category: spec.category,
      documentNumber: spec.documentNumber,
      variablesPayload: spec.variables,
      renderedBodyText: spec.body,
    });

  const documents = [];

  /* 1 — SK Panitia Dies Natalis (sealed, valid) */
  {
    const spec = {
      title: "Surat Keputusan Panitia Dies Natalis ke-38",
      category: "DECREE_SK",
      templateCode: "TPL-SK-DIREKSI",
      confidentiality: "INTERNAL",
      departmentName: "Sekretariat Direksi",
      creatorId: people.staf.id,
      documentNumber: `0042/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
      verificationCode: "VRD-2026-8F92A1",
      status: "SEALED_PUBLISHED",
      effectiveFrom: daysAgo(20),
      effectiveUntil: daysAhead(300),
      createdAt: ago(240),
      sealedAt: ago(160),
      currentStepOrder: 3,
      variables: {
        nomor_surat: `0042/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
        nama_penerima: "Dr. Bagas Prasetyo Wibowo",
        jabatan_penerima: "Ketua Panitia Dies Natalis ke-38",
        tentang: "Penetapan Panitia Dies Natalis ke-38",
        tanggal_berlaku: daysAgo(20),
        diktum:
          "Panitia bertanggung jawab menyusun rangkaian kegiatan akademik, menyusun anggaran, dan melaporkan hasil pelaksanaan paling lambat 14 hari setelah kegiatan berakhir.",
        org_name: "VeriDoc Nusantara",
      },
      body: `## SURAT KEPUTUSAN DIREKSI
Nomor: 0042/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}

Tentang
### Penetapan Panitia Dies Natalis ke-38

Direktur Utama VeriDoc Nusantara, setelah menimbang dan memperhatikan ketentuan yang berlaku, dengan ini memutuskan:

**KESATU** — Menetapkan Dr. Bagas Prasetyo Wibowo selaku Ketua Panitia Dies Natalis ke-38.

**KEDUA** — Panitia bertanggung jawab menyusun rangkaian kegiatan akademik, menyusun anggaran, dan melaporkan hasil pelaksanaan paling lambat 14 hari setelah kegiatan berakhir.

**KETIGA** — Keputusan ini berlaku sejak ${daysAgo(20)} dan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(216),
        actedAt: ago(214),
        comments: "Anggaran kegiatan sesuai pagu. Diteruskan.",
      },
      {
        name: "Paraf Biro Hukum",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(190),
        actedAt: ago(186),
        comments: "Diktum sudah sesuai format naskah dinas.",
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(140),
        actedAt: ago(160),
        comments: "Disahkan.",
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 2 — Kontrak Cloud (sealed, valid) */
  {
    const spec = {
      title: "Perjanjian Kerja Sama Penyediaan Layanan Cloud",
      category: "COOPERATION_CONTRACT",
      templateCode: "TPL-KONTRAK-KERJASAMA",
      confidentiality: "CONFIDENTIAL",
      departmentName: "Biro Hukum & Keuangan",
      creatorId: people.staf.id,
      documentNumber: `0018/PKS-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
      verificationCode: "VRD-2026-3C71D4",
      status: "SEALED_PUBLISHED",
      effectiveFrom: daysAgo(90),
      effectiveUntil: daysAhead(275),
      createdAt: ago(360),
      sealedAt: ago(300),
      currentStepOrder: 3,
      variables: {
        nomor_surat: `0018/PKS-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
        nama_vendor: "PT Awan Data Nusantara",
        nilai_kontrak: "Rp 1.480.000.000",
        lingkup_pekerjaan:
          "Penyediaan infrastruktur komputasi awan, pencadangan harian, serta dukungan teknis 24 jam untuk seluruh aplikasi layanan.",
        tanggal_mulai: daysAgo(90),
        tanggal_selesai: daysAhead(275),
        org_name: "VeriDoc Nusantara",
      },
      body: `## PERJANJIAN KERJA SAMA
Nomor: 0018/PKS-DIR/VRD/${romanMonth}/${now.getFullYear()}

Pada hari ini, PARA PIHAK sepakat mengikatkan diri dalam perjanjian kerja sama dengan ketentuan sebagai berikut.

**Pasal 1 — Para Pihak**
PIHAK PERTAMA: VeriDoc Nusantara. PIHAK KEDUA: PT Awan Data Nusantara.

**Pasal 2 — Lingkup Pekerjaan**
Penyediaan infrastruktur komputasi awan, pencadangan harian, serta dukungan teknis 24 jam untuk seluruh aplikasi layanan.

**Pasal 3 — Nilai Perjanjian**
Nilai perjanjian ditetapkan sebesar Rp 1.480.000.000 termasuk pajak yang berlaku.

**Pasal 4 — Jangka Waktu**
Perjanjian berlaku sejak ${daysAgo(90)} sampai dengan ${daysAhead(275)}.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(330),
        actedAt: ago(326),
        comments: "Nilai kontrak sesuai pagu pengadaan tahun berjalan.",
      },
      {
        name: "Paraf Biro Hukum",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(320),
        actedAt: ago(315),
        comments: "Klausul pembatalan sepihak sudah diperbaiki pada pasal 7.",
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(310),
        actedAt: ago(300),
        comments: "Disahkan untuk periode satu tahun.",
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 3 — Berita Acara Serah Terima (sealed, valid) */
  {
    const spec = {
      title: "Berita Acara Serah Terima Perangkat Jaringan",
      category: "MINUTES_BA",
      templateCode: "TPL-BERITA-ACARA",
      confidentiality: "INTERNAL",
      departmentName: "Sekretariat Direksi",
      creatorId: people.staf.id,
      documentNumber: `0009/BA-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
      verificationCode: "VRD-2026-B4E091",
      status: "SEALED_PUBLISHED",
      effectiveFrom: daysAgo(12),
      effectiveUntil: null,
      createdAt: ago(96),
      sealedAt: ago(72),
      currentStepOrder: 2,
      variables: {
        nomor_surat: `0009/BA-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
        kegiatan: "Serah Terima Perangkat Jaringan Kantor Pusat",
        hari_tanggal: `${daysAgo(12)}`,
        lokasi: "Ruang Server Lantai 3, Kantor Pusat",
        pihak_terlibat: "Biro Umum, Divisi Teknologi Informasi, dan PT Awan Data Nusantara",
        hasil:
          "24 unit switch akses, 2 unit router inti, dan seluruh kabel backbone telah diterima dalam kondisi baik serta diuji fungsional tanpa temuan.",
        org_name: "VeriDoc Nusantara",
      },
      body: `## BERITA ACARA
Nomor: 0009/BA-DIR/VRD/${romanMonth}/${now.getFullYear()}

Pada ${daysAgo(12)} bertempat di Ruang Server Lantai 3, Kantor Pusat telah dilaksanakan Serah Terima Perangkat Jaringan Kantor Pusat.

**Pihak yang terlibat**
Biro Umum, Divisi Teknologi Informasi, dan PT Awan Data Nusantara

**Hasil**
24 unit switch akses, 2 unit router inti, dan seluruh kabel backbone telah diterima dalam kondisi baik serta diuji fungsional tanpa temuan.

Berita acara ini dibuat dengan sebenarnya untuk dipergunakan sebagaimana mestinya.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(88),
        actedAt: ago(86),
        comments: "Nilai aset sudah masuk daftar inventaris.",
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(78),
        actedAt: ago(72),
        comments: "Disahkan.",
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 4 — SK Kepanitiaan (sealed, expires in 14 days) */
  {
    const spec = {
      title: "Surat Keputusan Kepanitiaan Audit Internal Tahunan",
      category: "DECREE_SK",
      templateCode: "TPL-SK-DIREKSI",
      confidentiality: "INTERNAL",
      departmentName: "Satuan Pengawas Internal",
      creatorId: people.staf.id,
      documentNumber: `0039/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
      verificationCode: "VRD-2026-7D5A22",
      status: "SEALED_PUBLISHED",
      effectiveFrom: daysAgo(351),
      effectiveUntil: daysAhead(14),
      createdAt: ago(9000),
      sealedAt: ago(8800),
      currentStepOrder: 3,
      variables: {
        nomor_surat: `0039/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
        nama_penerima: "Siti Halimah Rahayu",
        jabatan_penerima: "Ketua Tim Audit Internal Tahunan",
        tentang: "Penetapan Tim Audit Internal Tahunan",
        tanggal_berlaku: daysAgo(351),
        diktum:
          "Tim audit menyelesaikan pemeriksaan atas seluruh unit kerja dan menyerahkan laporan akhir kepada Direksi.",
        org_name: "VeriDoc Nusantara",
      },
      body: `## SURAT KEPUTUSAN DIREKSI
Nomor: 0039/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}

Tentang
### Penetapan Tim Audit Internal Tahunan

Direktur Utama VeriDoc Nusantara, setelah menimbang dan memperhatikan ketentuan yang berlaku, dengan ini memutuskan:

**KESATU** — Menetapkan Siti Halimah Rahayu selaku Ketua Tim Audit Internal Tahunan.

**KEDUA** — Tim audit menyelesaikan pemeriksaan atas seluruh unit kerja dan menyerahkan laporan akhir kepada Direksi.

**KETIGA** — Keputusan ini berlaku sejak ${daysAgo(351)} dan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(8850),
        actedAt: ago(8840),
        comments: "Lingkup audit sesuai program kerja tahunan.",
      },
      {
        name: "Paraf Biro Hukum",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(8820),
        actedAt: ago(8815),
        comments: "Format sesuai tata naskah.",
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(8790),
        actedAt: ago(8800),
        comments: "Disahkan.",
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 5 — Memo Anggaran (IN_REVIEW, step 1 overdue → DSS bottleneck) */
  {
    const spec = {
      title: "Memo Anggaran Pengadaan Perangkat Jaringan Cabang",
      category: "BUDGET_MEMO",
      templateCode: "TPL-MEMO-ANGGARAN",
      confidentiality: "CONFIDENTIAL",
      departmentName: "Biro Hukum & Keuangan",
      creatorId: people.staf.id,
      documentNumber: null,
      verificationCode: "VRD-2026-1F4B77",
      status: "IN_REVIEW_WORKFLOW",
      effectiveFrom: daysAgo(2),
      effectiveUntil: null,
      createdAt: ago(64),
      sealedAt: null,
      currentStepOrder: 1,
      variables: {
        nomor_surat: "(menunggu nomor resmi)",
        unit_pengusul: "Biro Umum",
        kebutuhan: "Pengadaan perangkat jaringan cabang",
        nilai_pengajuan: "Rp 386.500.000",
        sumber_anggaran: "Anggaran Investasi 2026",
        justifikasi:
          "Kapasitas jaringan cabang sudah mendekati batas maksimum dan mengganggu layanan verifikasi dokumen pada jam sibuk.",
        org_name: "VeriDoc Nusantara",
      },
      body: `## MEMORANDUM ANGGARAN
Nomor: (menunggu nomor resmi)

**Kepada:** Direktur Utama
**Dari:** Biro Umum
**Perihal:** Pengajuan anggaran Pengadaan perangkat jaringan cabang

**Latar belakang**
Kapasitas jaringan cabang sudah mendekati batas maksimum dan mengganggu layanan verifikasi dokumen pada jam sibuk.

**Nilai pengajuan**
Rp 386.500.000 bersumber dari Anggaran Investasi 2026.

**Permohonan**
Memohon persetujuan atas pengajuan anggaran tersebut agar dapat segera ditindaklanjuti pada periode berjalan.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "PENDING_ACTION",
        slaDueAt: ago(60), // already 60 hours overdue
      },
      {
        name: "Paraf Biro Hukum",
        approverId: people.legal.id,
        verdict: "WAITING_PREVIOUS",
        slaDueAt: ahead(6),
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "WAITING_PREVIOUS",
        slaDueAt: ahead(30),
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 6 — SK Tarif Layanan (IN_REVIEW, final signature waiting) */
  {
    const spec = {
      title: "Surat Keputusan Penetapan Tarif Layanan Verifikasi",
      category: "DECREE_SK",
      templateCode: "TPL-SK-DIREKSI",
      confidentiality: "PUBLIC",
      departmentName: "Direksi",
      creatorId: people.staf.id,
      documentNumber: null,
      verificationCode: "VRD-2026-9A2C58",
      status: "IN_REVIEW_WORKFLOW",
      effectiveFrom: daysAhead(10),
      effectiveUntil: daysAhead(375),
      createdAt: ago(30),
      sealedAt: null,
      currentStepOrder: 2,
      variables: {
        nomor_surat: "(menunggu nomor resmi)",
        nama_penerima: "Seluruh Unit Layanan Verifikasi",
        jabatan_penerima: "Unit Pelaksana Layanan Verifikasi",
        tentang: "Penetapan Tarif Layanan Verifikasi Dokumen",
        tanggal_berlaku: daysAhead(10),
        diktum:
          "Tarif layanan ditetapkan sebesar Rp 25.000 per dokumen untuk verifikasi standar dan Rp 75.000 untuk verifikasi prioritas.",
        org_name: "VeriDoc Nusantara",
      },
      body: `## SURAT KEPUTUSAN DIREKSI
Nomor: (menunggu nomor resmi)

Tentang
### Penetapan Tarif Layanan Verifikasi Dokumen

Direktur Utama VeriDoc Nusantara, setelah menimbang dan memperhatikan ketentuan yang berlaku, dengan ini memutuskan:

**KESATU** — Menetapkan Seluruh Unit Layanan Verifikasi selaku Unit Pelaksana Layanan Verifikasi.

**KEDUA** — Tarif layanan ditetapkan sebesar Rp 25.000 per dokumen untuk verifikasi standar dan Rp 75.000 untuk verifikasi prioritas.

**KETIGA** — Keputusan ini berlaku sejak ${daysAhead(10)} dan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Anggaran & Dampak Fiskal",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(22),
        actedAt: ago(26),
        comments: "Proyeksi penerimaan sudah dihitung, tidak membebani APBD.",
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "PENDING_ACTION",
        slaDueAt: ahead(18), // inside SLA
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 7 — Kontrak Maintenance Genset (REVISION_REQUESTED, 2 versions) */
  {
    const spec = {
      title: "Kontrak Kerja Sama Pemeliharaan Genset Kantor Pusat",
      category: "COOPERATION_CONTRACT",
      templateCode: "TPL-KONTRAK-KERJASAMA",
      confidentiality: "CONFIDENTIAL",
      departmentName: "Biro Umum",
      creatorId: people.staf.id,
      documentNumber: null,
      verificationCode: "VRD-2026-6E13AC",
      status: "REVISION_REQUESTED",
      effectiveFrom: daysAhead(5),
      effectiveUntil: daysAhead(370),
      createdAt: ago(120),
      sealedAt: null,
      currentStepOrder: 1,
      rowVersion: 3,
      updatedAt: ago(4),
      variables: {
        nomor_surat: "(menunggu nomor resmi)",
        nama_vendor: "PT Mesin Prima Servis",
        nilai_kontrak: "Rp 268.000.000",
        lingkup_pekerjaan:
          "Pemeliharaan preventif bulanan dua unit genset 500 kVA, termasuk penggantian oli, filter, dan uji beban triwulanan.",
        tanggal_mulai: daysAhead(5),
        tanggal_selesai: daysAhead(370),
        org_name: "VeriDoc Nusantara",
      },
      body: `## PERJANJIAN KERJA SAMA
Nomor: (menunggu nomor resmi)

Pada hari ini, PARA PIHAK sepakat mengikatkan diri dalam perjanjian kerja sama dengan ketentuan sebagai berikut.

**Pasal 1 — Para Pihak**
PIHAK PERTAMA: VeriDoc Nusantara. PIHAK KEDUA: PT Mesin Prima Servis.

**Pasal 2 — Lingkup Pekerjaan**
Pemeliharaan preventif bulanan dua unit genset 500 kVA, termasuk penggantian oli, filter, dan uji beban triwulanan.

**Pasal 3 — Nilai Perjanjian**
Nilai perjanjian ditetapkan sebesar Rp 268.000.000 termasuk pajak yang berlaku.

**Pasal 4 — Jangka Waktu**
Perjanjian berlaku sejak ${daysAhead(5)} sampai dengan ${daysAhead(370)}.`,
    };
    const v1Body = spec.body.replace("Rp 268.000.000", "Rp 312.000.000");
    const v1Variables = { ...spec.variables, nilai_kontrak: "Rp 312.000.000" };
    const v1Hash = computeCanonicalDocumentHashPure({
      title: spec.title,
      category: spec.category,
      documentNumber: spec.verificationCode,
      variablesPayload: v1Variables,
      renderedBodyText: v1Body,
    });
    const v2Hash = hashFor(spec);
    spec.contentHash = v2Hash;
    spec.versions = [
      {
        versionNo: 1,
        variables: v1Variables,
        body: v1Body,
        contentHash: v1Hash,
        changeNotes: "Draf awal diajukan ke Biro Hukum & Keuangan.",
        createdBy: people.staf.id,
        createdAt: ago(120),
      },
      {
        versionNo: 2,
        variables: spec.variables,
        body: spec.body,
        contentHash: v2Hash,
        changeNotes: "Revisi nilai kontrak setelah ditolak pada tahap verifikasi anggaran (turun Rp 44.000.000).",
        createdBy: people.staf.id,
        createdAt: ago(4),
      },
    ];
    spec.steps = [
      {
        // Step 1 was rejected, then v2 was uploaded: the whole workflow is
        // reset back to step 1 with all signatures cleared.
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "PENDING_ACTION",
        slaDueAt: ahead(18),
        actedAt: null,
        comments: null,
      },
      {
        name: "Paraf Biro Hukum",
        approverId: people.legal.id,
        verdict: "WAITING_PREVIOUS",
        slaDueAt: ahead(12),
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "WAITING_PREVIOUS",
        slaDueAt: ahead(36),
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* 8 — SK Lama (REVOKED) */
  {
    const spec = {
      title: "Surat Keputusan Kepanitiaan Pelatihan Kearsipan (Dicabut)",
      category: "DECREE_SK",
      templateCode: "TPL-SK-DIREKSI",
      confidentiality: "INTERNAL",
      departmentName: "Sekretariat Direksi",
      creatorId: people.staf.id,
      documentNumber: `0011/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
      verificationCode: "VRD-2026-C0DE77",
      status: "REVOKED_INVALIDATED",
      effectiveFrom: daysAgo(180),
      effectiveUntil: daysAhead(90),
      createdAt: ago(4400),
      sealedAt: ago(4300),
      revokedAt: ago(600),
      revokedBy: people.sekretariat.id,
      revocationReason:
        "Kegiatan pelatihan kearsipan dibatalkan karena realokasi anggaran, sehingga kepanitiaan tidak lagi diperlukan.",
      currentStepOrder: 2,
      rowVersion: 2,
      variables: {
        nomor_surat: `0011/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`,
        nama_penerima: "Ahmad Fauzan Hakim",
        jabatan_penerima: "Ketua Panitia Pelatihan Kearsipan",
        tentang: "Penetapan Panitia Pelatihan Kearsipan",
        tanggal_berlaku: daysAgo(180),
        diktum: "Panitia menyelenggarakan pelatihan kearsipan bagi seluruh staf administrasi.",
        org_name: "VeriDoc Nusantara",
      },
      body: `## SURAT KEPUTUSAN DIREKSI
Nomor: 0011/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}

Tentang
### Penetapan Panitia Pelatihan Kearsipan

Direktur Utama VeriDoc Nusantara, setelah menimbang dan memperhatikan ketentuan yang berlaku, dengan ini memutuskan:

**KESATU** — Menetapkan Ahmad Fauzan Hakim selaku Ketua Panitia Pelatihan Kearsipan.

**KEDUA** — Panitia menyelenggarakan pelatihan kearsipan bagi seluruh staf administrasi.

**KETIGA** — Keputusan ini berlaku sejak ${daysAgo(180)} dan apabila di kemudian hari terdapat kekeliruan akan diperbaiki sebagaimana mestinya.`,
    };
    spec.contentHash = hashFor(spec);
    spec.steps = [
      {
        name: "Verifikasi Legal & Anggaran",
        approverId: people.legal.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(4350),
        actedAt: ago(4340),
        comments: "Anggaran pelatihan tersedia.",
      },
      {
        name: "Tanda Tangan Pengesahan Direktur",
        approverId: people.direktur.id,
        verdict: "APPROVED_SIGNED",
        slaDueAt: ago(4310),
        actedAt: ago(4300),
        comments: "Disahkan.",
      },
    ];
    documents.push(await createDocument(spec));
  }

  /* ---------------------------------------------------------------- */
  /* 4 incoming letters + disposition trees                           */
  /* ---------------------------------------------------------------- */
  const correspondences = [
    {
      agendaNumber: "AG-2026-0001",
      senderInstitution: "Kementerian Pendayagunaan Aparatur Negara",
      originLetterNo: "B/1178/M.PAN/XI/2026",
      originLetterDate: daysAgo(9),
      receivedDate: daysAgo(8),
      subject: "Permintaan Data Dukung Evaluasi Tata Naskah Dinas Elektronik",
      summary:
        "Kementerian meminta data dukung penerapan tanda tangan elektronik dan daftar naskah dinas yang telah tersegel dalam dua tahun terakhir.",
      urgency: "URGENT_IMMEDIATE",
      confidentiality: "INTERNAL",
      attachmentNote: "1 berkas PDF (4 halaman), 1 templat isian XLSX",
      recordedBy: people.staf.id,
      createdAt: ago(190),
      nodes: [
        {
          from: people.direktur.id,
          to: people.legal.id,
          instruction: "Siapkan data dukung dan koordinasikan dengan Divisi TI. Batas waktu tiga hari kerja.",
          targetUnit: "Biro Hukum & Keuangan",
          dueDate: daysAgo(5),
          isCompleted: false,
          level: 1,
        },
        {
          from: people.legal.id,
          to: people.staf.id,
          instruction: "Rekap seluruh naskah tersegel dan unggah ke portal kementerian.",
          targetUnit: "Sekretariat Direksi",
          dueDate: daysAgo(3),
          isCompleted: false,
          level: 2,
        },
      ],
    },
    {
      agendaNumber: "AG-2026-0002",
      senderInstitution: "Bank Mitra Nusantara",
      originLetterNo: "BMN/2026/1145",
      originLetterDate: daysAgo(6),
      receivedDate: daysAgo(5),
      subject: "Konfirmasi Perpanjangan Fasilitas Kredit Modal Kerja",
      summary: "Bank menawarkan perpanjangan fasilitas kredit modal kerja dengan suku bunga tetap selama satu tahun.",
      urgency: "IMPORTANT",
      confidentiality: "CONFIDENTIAL",
      attachmentNote: "1 adendum perjanjian",
      recordedBy: people.staf.id,
      createdAt: ago(120),
      nodes: [
        {
          from: people.direktur.id,
          to: people.legal.id,
          instruction: "Kaji ulang syarat bunga dan ajukan rekomendasi tertulis.",
          targetUnit: "Biro Hukum & Keuangan",
          dueDate: daysAgo(1),
          isCompleted: true,
          level: 1,
          completionNote: "Kajian selesai, rekomendasi perpanjangan disetujui dengan catatan.",
        },
        {
          from: people.legal.id,
          to: people.staf.id,
          instruction: "Siapkan draf adendum untuk ditandatangani Direksi.",
          targetUnit: "Sekretariat Direksi",
          dueDate: daysAhead(3),
          isCompleted: false,
          level: 2,
        },
      ],
    },
    {
      agendaNumber: "AG-2026-0003",
      senderInstitution: "PT Awan Data Nusantara",
      originLetterNo: "ADN/XI/2026/0092",
      originLetterDate: daysAgo(4),
      receivedDate: daysAgo(3),
      subject: "Pemberitahuan Pemeliharaan Terjadwal Infrastruktur Cloud",
      summary: "Pemeliharaan terjadwal pada akhir pekan dengan potensi gangguan layanan maksimal 30 menit.",
      urgency: "ROUTINE",
      confidentiality: "INTERNAL",
      attachmentNote: "-",
      recordedBy: people.staf.id,
      createdAt: ago(70),
      nodes: [
        {
          from: people.direktur.id,
          to: people.staf.id,
          instruction: "Sebarkan informasi ke seluruh unit layanan dan siapkan jalur eskalasi.",
          targetUnit: "Divisi Teknologi Informasi",
          dueDate: daysAhead(2),
          isCompleted: false,
          level: 1,
        },
      ],
    },
    {
      agendaNumber: "AG-2026-0004",
      senderInstitution: "Universitas Cendekia Nusantara",
      originLetterNo: "UCN/UND/2026/3311",
      originLetterDate: daysAgo(2),
      receivedDate: daysAgo(1),
      subject: "Undangan Kerja Sama Penelitian Tata Kelola Dokumen Digital",
      summary: "Undangan kerja sama penelitian bersama Program Studi Tata Kelola Informasi selama 12 bulan.",
      urgency: "URGENT_IMMEDIATE",
      confidentiality: "PUBLIC",
      attachmentNote: "1 proposal penelitian",
      recordedBy: people.staf.id,
      createdAt: ago(26),
      nodes: [
        {
          from: people.direktur.id,
          to: people.legal.id,
          instruction: "Pelajari proposal dan siapkan draf perjanjian kerja sama penelitian.",
          targetUnit: "Biro Hukum & Keuangan",
          dueDate: daysAhead(4),
          isCompleted: false,
          level: 1,
        },
      ],
    },
  ];

  for (const letter of correspondences) {
    const correspondenceId = randomUUID();
    await q(
      `INSERT INTO incoming_correspondences
        (id, agenda_number, sender_institution, origin_letter_no, origin_letter_date, received_date,
         subject, summary, urgency, confidentiality, recorded_by, attachment_note, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        correspondenceId,
        letter.agendaNumber,
        letter.senderInstitution,
        letter.originLetterNo,
        letter.originLetterDate,
        letter.receivedDate,
        letter.subject,
        letter.summary,
        letter.urgency,
        letter.confidentiality,
        letter.recordedBy,
        letter.attachmentNote,
        letter.createdAt,
      ],
    );

    const nodeIdsByLevel = {};
    for (const node of letter.nodes) {
      const nodeId = randomUUID();
      await q(
        `INSERT INTO disposition_chains
          (id, correspondence_id, parent_id, level_order, from_user_id, to_user_id, instruction,
           target_unit, due_date, is_completed, completed_at, completion_note, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          nodeId,
          correspondenceId,
          node.level > 1 ? (nodeIdsByLevel[node.level - 1] ?? null) : null,
          node.level,
          node.from,
          node.to,
          node.instruction,
          node.targetUnit,
          node.dueDate,
          node.isCompleted,
          node.isCompleted ? ago(30) : null,
          node.completionNote ?? null,
          letter.createdAt,
        ],
      );
      nodeIdsByLevel[node.level] = nodeId;
    }
  }

  /* ---------------------------------------------------------------- */
  /* DSS rules, settings, sequences, audit & scans                    */
  /* ---------------------------------------------------------------- */
  const rules = [
    ["APPROVAL_SLA_BOTTLENECK", "Deteksi Leher Botol Persetujuan", "Antrean paraf melewati tenggat SLA.", { maxOverdueHours: 48 }, "CRITICAL"],
    ["DOCUMENT_EXPIRY_RADAR", "Radar Kedaluwarsa Naskah", "Naskah tersegel yang berlaku kurang dari 30 hari.", { windowDays: 30 }, "WARNING"],
    ["OVERDUE_URGENT_DISPOSITION", "Disposisi Mendesak Lewat Tenggat", "Instruksi segera yang belum dituntaskan unit pelaksana.", { maxOverdueDays: 3 }, "CRITICAL"],
    ["SIGNER_CERT_ROTATION_WARN", "Peringatan Rotasi Kunci", "Sertifikat penandatangan mendekati kedaluwarsa atau belum dirotasi 180 hari.", { rotationDays: 180, expiryDays: 60 }, "WARNING"],
  ];
  for (const [code, name, description, threshold, severity] of rules) {
    await q(
      `INSERT INTO decision_rules (id, code, name, description, threshold_json, severity)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [randomUUID(), code, name, description, JSON.stringify(threshold), severity],
    );
  }

  const settings = [
    ["sla_hours_per_step", "24", "Batas waktu paraf per tahap (jam)"],
    ["org_name", "VeriDoc Nusantara", "Nama instansi pada kop naskah"],
    ["org_unit", "Sekretariat Direksi", "Unit penerbit naskah"],
    ["verify_base_url", "https://veridoc.id", "Basis URL pada QR verifikasi"],
    ["retain_audit_days", "365", "Retensi jejak audit (hari)"],
    ["require_pin_final", "true", "Wajib PIN pada tanda tangan final"],
  ];
  for (const [key, value, label] of settings) {
    await q(
      `INSERT INTO app_settings (key, value, label) VALUES ($1,$2,$3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, label = EXCLUDED.label`,
      [key, value, label],
    );
  }

  // Number sequences continue from the seeded numbers.
  await q(
    `INSERT INTO document_sequences (scope_key, period_year, last_sequence) VALUES ($1,$2,$3)
     ON CONFLICT (scope_key, period_year) DO UPDATE SET last_sequence = EXCLUDED.last_sequence`,
    [`Sekretariat Direksi:{{SEQ}}/SK-DIR/VRD/{{ROMAN_MONTH}}/{{YEAR}}`, now.getFullYear(), 42],
  );
  await q(
    `INSERT INTO document_sequences (scope_key, period_year, last_sequence) VALUES ($1,$2,$3)
     ON CONFLICT (scope_key, period_year) DO UPDATE SET last_sequence = EXCLUDED.last_sequence`,
    [`Biro Hukum & Keuangan:{{SEQ}}/PKS-DIR/VRD/{{ROMAN_MONTH}}/{{YEAR}}`, now.getFullYear(), 18],
  );

  const audits = [
    [people.direktur.id, "EXECUTIVE_SIGNER", "DOCUMENT_SEALED", "document", documents[0], "Surat Keputusan Panitia Dies Natalis ke-38", `Nomor resmi terbit: 0042/SK-DIR/VRD/${romanMonth}/${now.getFullYear()}`, ago(160)],
    [people.legal.id, "REVIEWER_LEGAL_FINANCE", "APPROVAL_SIGNED", "document", documents[1], "Perjanjian Kerja Sama Penyediaan Layanan Cloud", "Tahap 2 (Paraf Biro Hukum) ditandatangani", ago(315)],
    [people.staf.id, "DOCUMENT_CREATOR", "DOCUMENT_CREATED", "document", documents[4], "Memo Anggaran Pengadaan Perangkat Jaringan Cabang", "Draf diajukan ke alur persetujuan 3 tahap", ago(64)],
    [people.staf.id, "DOCUMENT_CREATOR", "VERSION_UPLOADED", "document", documents[6], "Kontrak Kerja Sama Pemeliharaan Genset Kantor Pusat", "Versi 2 diunggah setelah revisi nilai kontrak", ago(26)],
    [people.legal.id, "REVIEWER_LEGAL_FINANCE", "APPROVAL_REJECTED", "document", documents[6], "Kontrak Kerja Sama Pemeliharaan Genset Kantor Pusat", "Tahap 1 dikembalikan: nilai di atas pagu pemeliharaan", ago(20)],
    [people.sekretariat.id, "SUPER_ADMIN", "DOCUMENT_REVOKED", "document", documents[7], "Surat Keputusan Kepanitiaan Pelatihan Kearsipan (Dicabut)", "Kegiatan dibatalkan karena realokasi anggaran", ago(600)],
  ];
  for (const [actorId, role, action, entityType, entityId, label, detail, at] of audits) {
    await q(
      `INSERT INTO audit_logs (id, actor_id, actor_role, action, entity_type, entity_id, entity_label, detail, hash_preview, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [randomUUID(), actorId, role, action, entityType, entityId, label, detail, "", at],
    );
  }

  const scans = [
    ["VRD-2026-8F92A1", documents[0], "VALID", "Rantai tanda tangan utuh; hash isi cocok dengan segel.", ago(30)],
    ["VRD-2026-3C71D4", documents[1], "VALID", "Rantai tanda tangan utuh; hash isi cocok dengan segel.", ago(18)],
    ["VRD-2026-B4E091", documents[2], "VALID", "Rantai tanda tangan utuh; hash isi cocok dengan segel.", ago(9)],
    ["VRD-2026-7D5A22", documents[3], "VALID", "Rantai tanda tangan utuh; hash isi cocok dengan segel.", ago(5)],
    ["VRD-2026-8F92A1", documents[0], "VALID", "Verifikasi ulang oleh unit pengadaan.", ago(3)],
    ["VRD-2026-C0DE77", documents[7], "REVOKED", "Dokumen telah dicabut penerbit.", ago(2)],
    ["VRD-2026-XXXXXX", null, "NOT_FOUND", "Kode verifikasi tidak terdaftar.", ago(1)],
  ];
  for (const [code, docId, result, summary, at] of scans) {
    await q(
      `INSERT INTO verification_scan_logs (id, verification_code, document_id, result, summary, user_agent, scanned_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [randomUUID(), code, docId, result, summary, "Seed/1.0 (demo)", at],
    );
  }

  await db.close();

  console.log("Seed complete.");
  console.log("  Accounts  : 5 (password veridoc123, PIN 123456)");
  console.log("  Templates : 4");
  console.log("  Documents : 8");
  console.log("  Letters   : 4 with disposition chains");
  console.log("  Verify    : /verify/VRD-2026-8F92A1 (valid), VRD-2026-C0DE77 (revoked)");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
