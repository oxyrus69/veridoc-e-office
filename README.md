# VeriDoc — E-Office & Verifikasi Dokumen Kriptografis

Sistem tata naskah dinas elektronik dengan persetujuan berjenjang, rantai tanda
tangan kriptografis (SHA-256 + HMAC + RSA-PSS), dan portal verifikasi QR publik
yang mendeteksi pemalsuan isi.

Spesifikasi lengkap: [`spesifikasi_sistem_e_office_dan_verifikasi_dokumen_kriptografis.md`](./spesifikasi_sistem_e_office_dan_verifikasi_dokumen_kriptografis.md).

## Menjalankan

```bash
npm install
npm run db:migrate     # buat 18 tabel (idempotent)
npm run db:seed        # isi data demo realistis
npm run build
npm run start          # atau: npm run dev
```

Uji menyeluruh (determinisme hash, deteksi tamper, alur persetujuan, RBAC,
format CSV, kredensial):

```bash
npm run e2e            # 25 pemeriksaan, 0 kegagalan
```

### Mode basis data

- **PGlite (default)** — database tertanam di `.data/pglite`, tanpa server.
- **PostgreSQL** — set `DATABASE_URL=postgres://...`, migrasi & seed sama.

Rahasia yang dipakai (demo): `VERIDOC_KEY_SECRET` (envelope kunci privat) dan
`VERIDOC_SESSION_SECRET` (cookie sesi). Lihat [`.env.example`](./.env.example).

## Akun demo

| Email | Peran | Kata sandi | PIN paraf |
| --- | --- | --- | --- |
| `sekretariat@veridoc.id` | Super Admin | `veridoc123` | `123456` |
| `direktur@veridoc.id` | Penandatangan Eksekutif | `veridoc123` | `123456` |
| `legal.finance@veridoc.id` | Reviewer Legal & Keuangan | `veridoc123` | `123456` |
| `staf.admin@veridoc.id` | Penyusun Dokumen | `veridoc123` | `123456` |
| `auditor@veridoc.id` | Auditor Kepatuhan | `veridoc123` | `123456` |

## Cara kerja segel

```
H_doc = SHA256( CanonicalJSON(metadata) || NormalizedBody )
S_i   = HMAC-SHA256_{K_i}( H_doc | S_(i-1) | ApproverId_i | Timestamp_i )
S_i   → ditandatangani RSA-PSS dengan kunci privat pejabat
S_0   = GENESIS_VERIDOC_CHAIN
```

- `K_i = SHA256(PIN_i : fingerprint_i)` — memparaf menuntut PIN, bukan hanya sesi.
- Nomor resmi diterbitkan otomatis pada paraf final, dari urutan per template.
- Revisi membuat versi baru dan **mereset seluruh alur ke tahap 1**.
- Portal `/verify/[kode]` merekonstruksi segel; satu karakter berubah →
  `TAMPERED` beserta baris dan selisih bit yang berubah.
- **Tamper Detection Lab** menghitung SHA-256 di peramban (Web Crypto) — naskah
  tidak pernah dikirim ke server.

## Modul

- `/admin` dasbor tata kelola, `/admin/audit` jejak audit, `/admin/settings`
- `/inbox` kotak masuk paraf dengan SLA
- `/documents`, `/documents/[id]` (split 65/35 + inspektur rantai), `/documents/compose`
- `/templates`, `/dispositions`, `/dispositions/[id]`
- `/certificates` sertifikat & rotasi kunci
- `/dss` + `bottlenecks`, `expiry-radar`, `riwayat` (decision support)
- `/verify` dan `/verify/[kode]` (publik)
- `/print/document/[id]`, `/print/disposition/[id]` (A4)
- `GET /api/export/documents`, `GET /api/export/dispositions` — CSV UTF-8 BOM, delimiter `;`

## Struktur

```
src/lib/          cryptoMath (murni), qr (encoder mandiri), tamperLab, labels, csv
src/server/       db (dual-mode), auth/RBAC, session, services (engine)
src/app/          rute App Router
scripts/          migrate, seed, e2e-verify (esbuild-bundled)
```

Encoder QR di `src/lib/qr.ts` ditulis dari nol (byte mode, level M) dan
divalidasi oleh decoder eksternal pada saat pengembangan — tidak ada panggilan
API pihak ketiga.
