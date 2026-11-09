# VeriDoc — E-Office, Multi-Level Approval Workflow & Cryptographic Document Verification

Dokumen ini adalah spesifikasi teknis menyeluruh (*blueprint* & *agent instructions*) untuk membangun sistem tata naskah dinas elektronik (**E-Office**), alur persetujuan dokumen berjenjang (*Sequential & Parallel Approval Workflow*), pelacakan disposisi surat resmi, penandatanganan digital berbasis kriptografi (**SHA-256 Content Hashing & HMAC/RSA-PSS Digital Signature**), serta **Portal Publik Verifikasi Keaslian Dokumen & Pendeteksi Pemalsuan (*Tamper Detection*)** lengkap dengan **Sistem Pendukung Keputusan (DSS)** tata kelola.

Dirancang dengan standar produksi (*production-grade*), mematuhi kontrak visual `GLOBAL-DASHBOARD-DESIGN.md` (5-Zone Enterprise App Shell), serta mendukung **Dual-Mode Database Adapter (PGlite + PostgreSQL Server)** agar dapat dieksekusi secara mandiri dari awal hingga tuntas oleh *coding agent*.

---

## 1. Identitas Proyek & Tech Stack

* **Nama Sistem:** VeriDoc (Enterprise E-Office, Digital Disposition, Multi-Level Approval & Cryptographic Verification System)
* **Domain Masalah:** Instansi pendidikan/kampus, lembaga keuangan, rumah sakit, dan korporasi formal yang membutuhkan pengelolaan surat keputusan (SK), kontrak, berita acara, dan memo anggaran tanpa kertas (*paperless*), membutuhkan kepastian bahwa isi dokumen yang sudah disetujui pejabat tidak bisa diubah secara diam-diam (*tamper-evident*), serta membutuhkan halaman verifikasi QR publik agar pihak ketiga dapat memvalidasi keaslian surat secara instan tanpa login.
* **Tech Stack Wajib:**
  * **Framework:** Next.js 15 (App Router, React 19, *Server Components*, *Server Actions*, & Route Handlers) + TypeScript ketat (*strict mode*).
  * **Database & ORM:** Drizzle ORM (`src/server/db`) dengan **Dual-Mode Database Adapter** (`@electric-sql/pglite` untuk mode demo/lokal instan tanpa setup, dan `postgres` / PostgreSQL Server untuk mode produksi).
  * **Styling & UI:** Tailwind CSS, arsitektur komponen mengikuti `GLOBAL-DASHBOARD-DESIGN.md` (5-Zone App Shell, 4-Layer KPI Cards, `EnterpriseDataGrid`, `CommandPalette` `Ctrl+K`, `InspectorDrawer`), generator SVG QR Code murni tanpa ketergantungan API eksternal, `lucide-react`, `@tanstack/react-table`, dan `recharts`.
  * **Kriptografi & Keamanan (`server-only`):** Node.js `crypto` bawaan untuk:
    * Kanonikalisasi muatan dokumen dan *hashing* **`SHA-256`**.
    * Rantai segel persetujuan berjenjang (**Merkle / Hash-Chained Signatures** di mana tanda tangan pejabat ke-$n$ mengikat *hash* tanda tangan pejabat ke-$(n-1)$).
    * Enkripsi PIN Tanda Tangan Pejabat (`scrypt` / `AES-256-GCM`).

---

## 2. Peta Modul & Rute Sistem (`src/app`)

| Modul | Rute Halaman (App Router) | Service & Mesin Inti (`src/server` & `src/lib`) | Status Target |
| :--- | :--- | :--- | :--- |
| **Dasbor Tata Kelola & Sekretariat** | `/admin` | `analytics.ts`, `dssEngine.ts` | Wajib Selesai |
| **Kotak Masuk Persetujuan (Inbox)** | `/inbox` | `approvalEngine.ts`, `cryptoSealEngine.ts` | Wajib Selesai |
| **Repositori Dokumen & SK Resmi** | `/documents`, `/documents/[id]` | `documentEngine.ts`, `diffEngine.ts` | Wajib Selesai |
| **Studio Penyusunan & Template** | `/documents/compose`, `/templates` | `templateEngine.ts` | Wajib Selesai |
| **Agenda Surat Masuk & Disposisi** | `/dispositions`, `/dispositions/[id]` | `dispositionEngine.ts` | Wajib Selesai |
| **Portal Verifikasi Publik & Tamper Lab** | `/verify`, `/verify/[verificationCode]` | `verificationEngine.ts`, `cryptoMath.ts` | Wajib Selesai |
| **Manajemen Kunci & Sertifikat Pejabat** | `/certificates` | `cryptoSealEngine.ts` | Wajib Selesai |
| **DSS (Bottleneck Birokrasi & Risiko)** | `/dss`, `/dss/bottlenecks`, `/dss/expiry-radar`, `/dss/riwayat` | `dssEngine.ts` | Wajib Selesai |
| **Jejak Audit Kriptografis & Pengaturan** | `/admin/audit`, `/admin/settings` | `audit.ts`, `settings.ts` | Wajib Selesai |
| **Ekspor Buku Agenda CSV (Excel ID)** | `/api/export/documents`, `/api/export/dispositions` | `exportHandlers.ts` | Wajib Selesai |
| **Cetak Naskah Dinas Resmi Ber-QR A4** | `(print)/print/document/[id]`, `(print)/print/disposition/[id]` | — | Wajib Selesai |

---

## 3. Matriks RBAC (Role-Based Access Control)

Penegakan akses dilakukan pada `src/middleware.ts` (*longest-prefix match*) dan di dalam setiap *Server Action* menggunakan `requireRole()` di `src/server/rbac.ts`.

| Peran | Halaman Pendaratan (`ROLE_HOME`) | Hak Akses Utama |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | `/admin` | Akses penuh ke seluruh modul, manajemen template naskah dinas, penerbitan/pencabutan sertifikat kunci penandatangan pejabat, konfigurasi SLA persetujuan, DSS, dan jejak audit. |
| `EXECUTIVE_SIGNER` | `/inbox` | Meninjau draf dokumen di tahap akhir, memberikan persetujuan & membubuhkan **Tanda Tangan Kriptografis Final** menggunakan PIN Penandatangan (menerbitkan nomor surat resmi & segel QR), menolak/meminta revisi, serta memberikan instruksi disposisi surat masuk. |
| `REVIEWER_LEGAL_FINANCE` | `/inbox` | Melakukan pemeriksaan dan paraf elektronik (*intermediate sequential/parallel approval*) pada draf kontrak, SK, atau pengajuan anggaran sebelum naik ke meja Direktur/Rektor. |
| `DOCUMENT_CREATOR` | `/documents` | Menyusun draf dokumen baru dari *template*, mengunggah revisi versi baru (dengan pelacakan *diff*), mencatat surat masuk eksternal, dan menindaklanjuti tugas disposisi. |
| `AUDITOR_COMPLIANCE` | `/admin/audit` | Akses baca penuh (*read-only*) ke seluruh dokumen, rantai tanda tangan kriptografis, log pencabutan (*revocation*), dan DSS kepatuhan; tidak dapat mengubah isi dokumen. |
| Publik (Tanpa Login) | `/verify`, `/verify/[verificationCode]` | Memverifikasi kode QR dokumen resmi, memeriksa status keaslian (`VALID_SEALED`, `REVOKED`, atau `TAMPERED_MODIFIED`), dan menguji coba simulator deteksi perubahan karakter (*Tamper Detection Sandbox*). |

---

## 4. Skema Database (`src/server/db/schema.ts`)

Gunakan Drizzle ORM. Pastikan semua migrasi bersifat idempoten.

### 4.1. Enum Utama
* `user_role`: `'SUPER_ADMIN' | 'EXECUTIVE_SIGNER' | 'REVIEWER_LEGAL_FINANCE' | 'DOCUMENT_CREATOR' | 'AUDITOR_COMPLIANCE'`
* `doc_category`: `'DECREE_SK' | 'COOPERATION_CONTRACT' | 'BUDGET_MEMO' | 'OFFICIAL_LETTER' | 'SOP_POLICY' | 'MINUTES_BA'`
* `confidentiality_level`: `'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL' | 'STRICTLY_SECRET'`
* `doc_lifecycle_status`: `'DRAFT' | 'IN_REVIEW_WORKFLOW' | 'REVISION_REQUESTED' | 'SEALED_PUBLISHED' | 'EXPIRED' | 'REVOKED_INVALIDATED'`
* `step_mode`: `'SEQUENTIAL' | 'PARALLEL_ANY' | 'PARALLEL_ALL'`
* `step_verdict`: `'WAITING_PREVIOUS' | 'PENDING_ACTION' | 'APPROVED_SIGNED' | 'REJECTED_RETURNED'`
* `disposition_urgency`: `'ROUTINE' | 'IMPORTANT' | 'URGENT_IMMEDIATE'`

### 4.2. Tabel Inti (Minimal 18 Tabel)
1. **`profiles`** & **`signer_certificates`** (Kunci Kriptografi & PIN Pejabat):
   * Setiap pejabat penandatangan memiliki entri di `signer_certificates`: `id` (UUID PK), `user_id` (FK `profiles.id`), `key_fingerprint` (unique hex), `public_key_pem` (text), `encrypted_private_key` (text), `signing_pin_hash` (text), `job_title_official`, `status` (`'ACTIVE' | 'REVOKED'`), `issued_at`, `expires_at`.
2. **`document_templates`**:
   * `id` (UUID PK), `code` (unique, misal `"TPL-SK-REKTOR"`, `"TPL-KONTRAK-VENDOR"`), `name`, `category` (`doc_category`), `number_prefix_format` (misal: `"SK/{{YEAR}}/{{ROMAN_MONTH}}/{{SEQ}}"`), `variables_schema_json` (jsonb — daftar variabel dinamis seperti `nama_penerima`, `nilai_kontrak`, `tanggal_berlaku`), `body_markdown_template` (text), `default_workflow_steps_json` (jsonb), `sla_hours_per_step` (integer).
3. **`official_documents`**:
   * `id` (UUID PK), `document_number` (unique, nullable saat masih `DRAFT`, otomatis terbit secara atomik saat tanda tangan final selesai), `verification_code` (unique, misal `"VRD-2026-8F92A1"` untuk URL QR publik).
   * `template_id` (FK), `creator_id` (FK `profiles.id`), `department_name`, `title`, `category` (`doc_category`), `confidentiality` (`confidentiality_level`), `status` (`doc_lifecycle_status`).
   * `current_version_no` (integer, default $1$), `current_step_order` (integer), `effective_from` (date), `effective_until` (date, nullable).
   * **Segel Kriptografi Final:** `canonical_content_hash` (SHA-256 hex dari isi + metadata versi yang disahkan), `final_signature_chain_hash` (SHA-256 hex rantai seluruh persetujuan), `sealed_at` (timestamp), `revoked_at`, `revoked_by`, `revocation_reason`, `version` (integer, *optimistic locking*), `created_at`, `updated_at`.
4. **`document_versions`** (Riwayat Revisi & *Diff* Naskah):
   * `id` (UUID PK), `document_id` (FK `official_documents.id`), `version_no` (integer), `variables_payload_json` (jsonb), `rendered_body_text` (text), `content_sha256` (text), `change_notes` (text), `created_by` (FK), `created_at`.
5. **`approval_workflow_steps`** (Alur Persetujuan Berjenjang & Rantai Hash):
   * `id` (UUID PK), `document_id` (FK `official_documents.id`), `step_order` (integer: $1, 2, 3$), `step_name` (misal: `"Verifikasi Anggaran Finance"`, `"Paraf Biro Hukum"`, `"Tanda Tangan Pengesahan Direktur"`), `mode` (`step_mode`).
   * `assigned_approver_id` (FK `profiles.id`), `verdict` (`step_verdict`), `sla_due_at` (timestamp), `acted_at` (timestamp, nullable), `comments` (text).
   * **Bukti Kriptografi per Tahap:** `signed_version_no` (integer), `previous_step_signature_hash` (text — `"GENESIS"` untuk tahap 1), `step_signature_hash` (text — HMAC/RSA signature atas `content_sha256 + previous_step_signature_hash + approver_id + acted_at`), `certificate_fingerprint`.
6. **`incoming_correspondences`** & **`disposition_chains`** (Surat Masuk Eksternal & Lembar Disposisi):
   * Mencatat surat fisik/elektronik yang masuk dari instansi luar (`agenda_number`, `sender_institution`, `origin_letter_no`, `subject`, `urgency` `disposition_urgency`), serta pohon instruksi disposisi berjenjang dari Pimpinan ke Kepala Bagian hingga Staf Pelaksana lengkap dengan tenggat waktu penyelesaian.
7. **`verification_scan_logs`**:
   * Mencatat setiap kali seseorang memindai atau memasukkan kode dokumen di portal `/verify` (mencakup waktu pindai, hasil validasi `VALID` / `TAMPERED` / `REVOKED`, dan ringkasan pemeriksaan).
8. **`decision_rules`**, **`decision_logs`**, **`audit_logs`**, **`app_settings`**, **`document_sequences`**, **`idempotency_keys`**.

---

## 5. Spesifikasi Mesin Inti (*Core Engines*)

### 5.1. Mesin Kriptografi Kanonikalisasi, Rantai Segel & Deteksi Manipulasi (`src/lib/cryptoMath.ts` & `src/server/services/cryptoSealEngine.ts`)

1. **Kanonikalisasi & Hashing Deterministik (`computeCanonicalDocumentHashPure`)**:
   * Menggabungkan `title`, `category`, `document_number` (atau ID draf), `variables_payload_json` (dengan kunci JSON diurutkan secara alfabetis), dan `rendered_body_text` (dinormalisasi baris barunya `\r\n` $\to$ `\n`) lalu menghasilkan digest **`SHA-256`** 64 karakter heksadesimal:
     $$H_{\text{doc}} = \text{SHA256}(\text{CanonicalJSON}(\text{Metadata}) \parallel \text{NormalizedBody})$$
2. **Rantai Tanda Tangan Berjenjang (*Hash-Chained Multi-Signature*, `computeChainedSignaturePure`)**:
   * Setiap kali penyetuju tahap ke-$i$ memasukkan PIN Tanda Tangan yang sah, sistem menghitung segel tahap ke-$i$:
     $$S_i = \text{HMAC\_SHA256}_{\text{Key}_i}\left(H_{\text{doc}} \parallel S_{i-1} \parallel \text{ApproverID}_i \parallel \text{Timestamp}_i\right)$$
     di mana $S_0 = \text{"GENESIS\_VERIDOC\_CHAIN"}$.
   * Dengan konstruksi ini, jika isi dokumen ($H_{\text{doc}}$) atau salah satu paraf sebelumnya ($S_{i-1}$) diubah walaupun hanya **1 karakter atau 1 angka rupiah**, maka seluruh rantai tanda tangan $S_n$ otomatis menjadi **tidak valid (patah)**.
3. **Simulator & Inspektur Deteksi Pemalsuan (`verifyAndDetectTamperingPure`)**:
   * Di halaman publik `/verify/[verificationCode]`, selain menampilkan status keaslian dokumen dari database, sediakan tab interaktif **"Uji Ketahanan Kriptografi (Tamper Detection Lab)"**:
   * Penguji dapat mencoba mengubah 1 kata atau angka nominal di dalam kotak teks dokumen (misal: mengubah nilai kontrak dari `Rp 150.000.000` menjadi `Rp 150.000.001`) dan melihat secara langsung:
     * Hash `SHA-256` asli vs Hash `SHA-256` hasil modifikasi yang berubah total (*Avalanche Effect*).
     * Status segel langsung berubah menjadi merah terang: **`PERINGATAN KRITIS: INTEGRITAS DOKUMEN RUSAK (TAMPERED) — TANDA TANGAN DIGITAL TIDAK COCOK`** lengkap dengan penunjuk baris yang dimodifikasi.

### 5.2. Mesin Alur Kerja Persetujuan & Penomoran Otomatis (`src/server/services/approvalEngine.ts`)

1. **Transisi Tahap Otomatis (`submitApprovalVerdictAction`)**:
   * Wajib memverifikasi **PIN Tanda Tangan (6 digit)** milik pejabat yang sedang login sebelum menyetujui tahap.
   * Jika `verdict = 'APPROVED_SIGNED'` pada tahap perantara ($i < N$), sistem memajukan `current_step_order` ke $i+1$, mengubah status tahap berikutnya dari `WAITING_PREVIOUS` menjadi `PENDING_ACTION`, dan mengatur tenggat `sla_due_at`.
   * Jika `verdict = 'APPROVED_SIGNED'` pada tahap terakhir ($i = N$), sistem secara atomik:
     * Menerbitkan **Nomor Surat Resmi (`document_number`)** sesuai pola `document_templates` (misal: `0042/SK-DIR/VRD/XI/2026`).
     * Mengunci dokumen menjadi `SEALED_PUBLISHED` dan menyematkan QR Code verifikasi.
   * Jika `verdict = 'REJECTED_RETURNED'`, status dokumen kembali menjadi `REVISION_REQUESTED`. Ketika pembuat dokumen mengunggah **Versi Baru (`version_no + 1`)**, seluruh tahap persetujuan wajib direset ulang dari tahap 1 agar pejabat tidak menandatangani isi yang berubah tanpa pemeriksaan ulang.

### 5.3. Mesin Pendukung Keputusan Tata Kelola / DSS (`src/server/services/dssEngine.ts`)

Menghitung rekomendasi tata kelola secara langsung dari SQL saat halaman `/dss` dibuka:
1. **Deteksi Leher Botol Birokrasi / *Approval Bottleneck* (`APPROVAL_SLA_BOTTLENECK`)**:
   * Mendeteksi pejabat/penyetuju yang memiliki antrean dokumen tertahan melewati tenggat `sla_due_at` atau waktu tunggu rata-rata tertinggi $\to$ merekomendasikan pendelegasian wewenang sementara (*acting approver*) atau pengingat eskalasi.
2. **Radar Kedaluwarsa SK & Kontrak Kerja Sama (`DOCUMENT_EXPIRY_RADAR`)**:
   * Mendeteksi dokumen berstatus `SEALED_PUBLISHED` (seperti MOU, Kontrak, atau SK Kepanitiaan) yang tanggal `effective_until`-nya tersisa $\le 30$ hari agar segera dibuatkan draf perpanjangan.
3. **Disposisi Mendesak Lewat Tenggat (`OVERDUE_URGENT_DISPOSITION`)**:
   * Menampilkan daftar surat masuk berlabel `URGENT_IMMEDIATE` yang instruksi disposisinya belum diselesaikan oleh unit pelaksana.
4. **Kepatuhan Rotasi Sertifikat Kunci Penandatangan (`SIGNER_CERT_ROTATION_WARN`)**:
   * Memperingatkan `SUPER_ADMIN` jika sertifikat kriptografi pejabat akan kedaluwarsa atau belum dirotasi $> 180$ hari.

---

## 6. Standar Antarmuka, Dual-Mode DB & Pengujian Otomatis (Wajib)

1. **Kepatuhan Desain Visual (`GLOBAL-DASHBOARD-DESIGN.md`)**:
   * Wajib menerapkan **5-Zone Enterprise App Shell** di seluruh halaman internal.
   * Pada halaman detail `/documents/[id]`, bangun antarmuka **Split-View Document & Cryptographic Chain Inspector**:
     * Panel Kiri (65%): Pratinjau naskah dinas resmi lengkap dengan kop surat, isi terformat, tabel variabel, pemilih versi (`v1` vs `v2` dengan tampilan *diff* perubahan), serta blok kaki berisi **QR Code SVG Asli**, nama pejabat, jabatan, waktu pengesahan, dan potongan hash `SHA-256`.
     * Panel Kanan (35%): Visualisasi vertikal **Rantai Segel Persetujuan (*Cryptographic Hash Chain*)** dari `GENESIS` $\to$ `Paraf Tahap 1` $\to$ `Paraf Tahap 2` $\to$ `Segel Pengesahan Final` beserta aksi tombol **Setujui dengan PIN** atau **Kembalikan untuk Revisi**.
2. **Dual-Mode Database Adapter & Keamanan Kunci**:
   * Gunakan PGlite (`.data/pglite`) sebagai *default* lokal dan PostgreSQL Server ketika `DATABASE_URL` diawali `postgres://`.
3. **Data Seed Realistis (`scripts/seed.mjs`)**:
   * Kata sandi semua akun demo: `veridoc123` | PIN Tanda Tangan Pejabat: `123456`.
   * **5 Akun Demo:** `sekretariat@veridoc.id` (`SUPER_ADMIN`), `direktur@veridoc.id` (`EXECUTIVE_SIGNER`), `legal.finance@veridoc.id` (`REVIEWER_LEGAL_FINANCE`), `staf.admin@veridoc.id` (`DOCUMENT_CREATOR`), dan `auditor@veridoc.id` (`AUDITOR_COMPLIANCE`).
   * **Skenario Seed Wajib:** 4 Template Naskah Dinas (SK Direksi, Kontrak Kerja Sama, Memo Anggaran, Berita Acara), 4 Sertifikat Kunci Kriptografi Pejabat, **8 Dokumen Resmi** (3 berstatus `SEALED_PUBLISHED` dengan rantai *hash* valid yang langsung bisa diuji di `/verify`, 2 berstatus `IN_REVIEW_WORKFLOW` yang menunggu paraf di `/inbox` dan 1 di antaranya melewati SLA untuk memicu DSS, 1 berstatus `REVISION_REQUESTED` dengan 2 riwayat versi `v1` & `v2`, 1 akan kedaluwarsa dalam 14 hari, dan 1 berstatus `REVOKED_INVALIDATED` untuk mendemokan peringatan surat yang telah dicabut), serta **4 Surat Masuk & Rantai Disposisi**.
4. **Verifikasi Akhir & Inisialisasi Git (`scripts/e2e-verify.mjs`)**:
   * Buat skrip pengujian otomatis yang memverifikasi:
     * Determinisme fungsi `computeCanonicalDocumentHashPure` dan `computeChainedSignaturePure`.
     * Deteksi manipulasi 1 karakter pada `verifyAndDetectTamperingPure` (harus mengembalikan status `TAMPERED`).
     * Alur persetujuan berjenjang dengan validasi PIN pejabat, penerbitan nomor surat otomatis saat tahap akhir lunas, dan *reset* persetujuan saat dokumen direvisi ke versi baru.
     * Isolasi RBAC dan ekspor CSV (`\uFEFF` BOM + `;`).
   * Pastikan `npm run db:migrate && npm run db:seed && npx tsc --noEmit && npm run build && node scripts/e2e-verify.mjs` lulus dengan **0 error**, lalu inisialisasi Git (`git init -b main`).