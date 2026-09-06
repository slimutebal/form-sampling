# Form Sampling

Form Sampling adalah aplikasi **PWA (Progressive Web App) mobile-first dan
offline-capable** untuk mendukung operasi sampling ore di lapangan: setup
shift, manpower, fleet/front, haulage ke pile, penanganan sample, hingga
laporan shift. Aplikasi ini menggantikan alur kerja workbook Excel
(`Form_Sampling.xlsx`) yang selama ini digunakan tim lapangan, dengan tujuan
mengurangi input manual dan tetap dapat digunakan pada kondisi koneksi
internet terbatas.

**Live App:**
<https://slimutebal.github.io/form-sampling/>

**Status:** Field Trial / Pilot — aplikasi ini **bukan** rilis produksi
final. Lihat [Catatan Field Trial](#catatan-field-trial) di bawah.

**Application Version:** 1.0.0

Aplikasi dapat langsung dibuka di browser, atau di-install ke Home Screen
agar terasa seperti aplikasi native (lihat [Instalasi](#instalasi)).

---

## Instalasi

Tidak wajib install untuk menggunakan aplikasi — membuka Live App di
browser sudah cukup. Install ke Home Screen hanya membuat akses lebih cepat
dan tampilan lebih penuh layar (tanpa address bar).

### Android

1. Buka **Google Chrome**.
2. Buka Live App: <https://slimutebal.github.io/form-sampling/>
3. Ketuk menu **⋮** (titik tiga di kanan atas).
4. Pilih **Install app** / **Add to Home screen**.
5. Konfirmasi instalasi.

### iPhone / iPad

1. Buka **Safari** (bukan Chrome — Add to Home Screen hanya tersedia di
   Safari pada iOS).
2. Buka Live App: <https://slimutebal.github.io/form-sampling/>
3. Ketuk tombol **Share** (ikon kotak dengan panah ke atas).
4. Pilih **Add to Home Screen**.
5. Ketuk **Add**.

### PC / Laptop

Membuka langsung lewat browser (Chrome/Edge/Firefox) sudah didukung penuh
dan cukup untuk penggunaan biasa. Jika ingin, Chrome/Edge juga mendukung
install sebagai aplikasi desktop lewat ikon install pada address bar bila
tersedia.

---

## Update Aplikasi

Aplikasi mengecek versi baru secara otomatis saat online. Jika versi baru
tidak muncul:

1. Pastikan perangkat **terhubung ke internet**.
2. **Buka ulang / reload** aplikasi.
3. Jika muncul prompt **"Perbarui Sekarang"** pada status bar aplikasi,
   ketuk untuk memperbarui.

Jika langkah di atas tetap tidak menampilkan versi baru, sebagai **langkah
terakhir** barulah bersihkan cache/data situs pada browser lalu buka ulang
Live App.

> ⚠️ **Penting:** Jangan sembarangan membersihkan data browser/situs saat
> shift sedang aktif. Data operasional shift (manpower, fleet, haulage,
> sample) tersimpan **lokal di perangkat (IndexedDB)** dan akan **hilang**
> jika data situs dibersihkan sebelum shift selesai/di-export. Lakukan
> pembersihan data hanya di luar shift aktif, atau setelah data shift
> diamankan (mis. lewat Laporan/Excel export).

---

## Alur Aplikasi

### A. Mulai Shift

Alur mulai shift: **Registrasi Shift → Handover (opsional) → Manpower →
Fleet Setup → masuk workspace shift aktif (Beranda)**.

- **Registrasi Shift** — mengisi tanggal, shift (Siang/Malam), sector, dan
  sampling house untuk shift yang akan dimulai.
- **Handover shift sebelumnya** — jika tersedia, arsip Excel shift
  sebelumnya dapat diimpor untuk membawa pending pile/batch (status
  `CONTINUE`) ke shift saat ini. Memulai shift tanpa file sebelumnya juga
  didukung.
- **Manpower** — memilih personel dari master Staff/Crew (pencarian
  nama/NIK). Penanggung Jawab (PIC) ditentukan otomatis dari sumber master
  personel tersebut, bukan dipilih manual.
- **Fleet Setup** — mendaftarkan Front awal (Sector/Front No, Hauler,
  Destination/Pile, daftar truck). Lihat detail lengkap di bagian
  [Fleet](#c-fleet).
- Setelah Fleet Setup disimpan, workspace shift diaktifkan dan aplikasi
  masuk ke **Beranda**.

### B. Beranda

Halaman ringkasan status shift aktif: shift/sector/sampling house yang
sedang berjalan, jumlah pile aktif, dan navigasi cepat ke pekerjaan yang
sedang berlangsung.

### C. Fleet

Halaman **Fleet** (`/fleet`) mengelola Front dan fleet truck selama shift
aktif — bukan langkah sekali jalan di awal shift saja, karena titik muat
dapat berpindah kapan saja.

- Menampilkan seluruh **Front aktif** beserta Hauler, Destination, dan
  jumlah unit truck efektifnya.
- **+ Tambah Front** mendukung dua mode:
  - **Continuation** — Fleet Reference diisi Front aktif lain: Front baru
    mewarisi Hauler dan fleet efektif Front tersebut, lalu dapat
    ditambah/dikurangi truck-nya. Front lama menjadi **riwayat
    (HISTORICAL)** begitu memiliki successor.
  - **BASE independen baru** — Fleet Reference "Tidak Ada": Front baru
    berdiri sendiri (Hauler, Destination, dan truck dipilih dari awal).
    Front lain yang sedang aktif **tidak** ikut menjadi riwayat hanya
    karena Front BASE baru ini dibuat.
- Destination pada Front dapat berubah saat continuation (mis. area
  dumping penuh, pindah pile tujuan).
- Contoh lineage Front (rantai continuation, selalu linear):

  ```text
  BR1/01 → BR1/04 → BR1/07
  ```

- **Riwayat Front** ditampilkan read-only di halaman yang sama.

### D. Pile

- Daftar Pile aktif menampilkan chip **Front aktif** yang Destination-nya
  mengarah ke Pile tersebut. Operator memilih Front di layar ini (bukan di
  dalam layar operasional Pile).
- Setelah Front dipilih, masuk ke layar operasi Pile. Pile dan Front
  ditampilkan sebagai **konteks read-only** (tidak dipilih ulang di sini).
- Operator hanya perlu memilih **Truck**. Batch dan Rit berikutnya
  **berjalan otomatis**, begitu juga kebutuhan sampling pada rit tersebut
  (lihat [Sampling Quick Reference](#sampling-quick-reference)).
- Truck dari fleet efektif Front ditawarkan sebagai pilihan cepat, tetapi
  operator tetap dapat mencari truck lain di luar fleet. Truck di luar
  fleet efektif tetap tersimpan sebagai transaksi, hanya ditandai
  **TRUCK SALAH** — transaksi tidak dibuang.

### E. Sample

Navigasi bawah menampilkan label **Sample** (judul halaman tetap
"Penanganan Sampel"). Posisi sampling muncul otomatis dari haulage yang
memenuhi interval sampling — tidak ada input manual untuk membuat sample.

Halaman menampilkan:

- Daftar sample **pending** (belum ditangani) dan **selesai ditangani**.
- Untuk tiap posisi sample: Pile, Batch, **Rit Dari** / **Rit Sampai**, dan
  **Status Pengiriman** (mis. belum diambil / sudah dikirim ke tujuan).

### F. Laporan

Halaman Laporan menampilkan **satu preview laporan operasional** dalam
format siap kirim WhatsApp, berisi ringkasan manpower, ringkasan produksi
per pile, penanganan sample, dan detail haulage. Tersedia aksi:

- **Copy** — menyalin teks laporan ke clipboard.
- **Share** — membuka share sheet perangkat (mis. langsung ke WhatsApp).

---

## Sampling Quick Reference

Sampling rule berasal dari master data ore (SAP/LIM), bukan hard-coded.
Ringkasan konfigurasi saat ini:

| Ore | Interval Sampling | Batch Size | Packing |
| --- | --- | --- | --- |
| SAP | 2 | 20 | 2 |
| LIM | 5 | 100 | 10 |

Rule sampling:

```text
MOD(Rit, interval) = 0  →  rit tersebut wajib sample
```

**Fresh Pile** (pile yang benar-benar baru, tanpa carry-over dari shift
sebelumnya):

- Default posisi awal: **Batch 001 / Rit 001**.
- Posisi awal ini dapat diubah supervisor **hanya sebelum haulage pertama**
  disimpan.
- Setelah haulage pertama tersimpan, posisi awal **terkunci** dan
  progresnya mengikuti mesin batch/rit otomatis seperti biasa.

Detail lengkap aturan bisnis ada di [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md).

---

## Perilaku Offline / Sinkronisasi

- Aplikasi dirancang **offline-first**: data operasional shift (manpower,
  fleet, haulage, sample) disimpan **lokal di perangkat** menggunakan
  IndexedDB, tidak menunggu koneksi internet.
- Setelah aplikasi pernah dimuat/di-install, application shell dapat
  berjalan meski sedang offline.
- Koneksi internet digunakan untuk aksi yang memang membutuhkan data
  bersama, misalnya sinkronisasi master data dan penulisan Pile baru ke
  master bersama (memerlukan online).
- Status bar global (`GlobalStatusBar`) di bagian atas aplikasi
  menampilkan status konektivitas, sinkronisasi, dan ketersediaan update
  aplikasi.
- Tidak ada arsip cloud terkelola (mis. Google Drive) — arsip Excel shift
  tetap menjadi **fallback/handover** portabel yang dibagikan/disimpan
  sendiri oleh pengguna.

---

## Catatan Field Trial

- Aplikasi ini sedang **diuji bersama pengguna lapangan (field trial /
  pilot)** — belum berstatus rilis produksi final.
- Alur kerja Excel yang sudah ada **tetap digunakan sebagai
  pembanding/fallback** selama masa uji coba.
- Jika ditemukan perilaku tidak terduga atau perbedaan hasil laporan
  antara aplikasi dan Excel, mohon dilaporkan ke tim pengembang.
- **Jangan membersihkan data browser/situs** selama shift sedang aktif
  kecuali memang diinstruksikan khusus — data shift tersimpan lokal di
  perangkat (lihat [Update Aplikasi](#update-aplikasi)).
- Selama masa trial, hasil operasional penting (produksi, sample,
  laporan) sebaiknya tetap dibandingkan dengan proses Excel yang berjalan
  paralel.

---

## Development

### Requirements

- Node.js 24 (lihat `.nvmrc`)
- npm

### Getting started

```bash
npm install
npm run dev
```

### Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Menjalankan Vite dev server |
| `npm run build` | Type-check dan build untuk production |
| `npm run preview` | Preview hasil production build |
| `npm run lint` | Menjalankan ESLint |
| `npm run typecheck` | Menjalankan TypeScript compiler |
| `npm run test` | Menjalankan Vitest (watch mode) |
| `npm run test:run` | Menjalankan Vitest sekali (CI mode) |
| `npm run format` | Menerapkan format Prettier |
| `npm run format:check` | Memeriksa format Prettier |

Deployment berjalan ke **GitHub Pages** melalui GitHub Actions setelah
lint, typecheck, test, dan build lolos. Konfigurasi endpoint (`VITE_GOOGLE_APPS_SCRIPT_URL`) diatur melalui
GitHub Actions Variable saat build — nilai produksi tidak disimpan langsung
di source code repository.

---

## Dokumentasi Teknis

- [`docs/BUSINESS_RULES.md`](docs/BUSINESS_RULES.md) — aturan bisnis sampling, fleet, batch/rit, report.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arsitektur sistem dan prinsip desain.
- [`docs/UI_UX_SPEC.md`](docs/UI_UX_SPEC.md) — spesifikasi UI/UX per layar.
- [`docs/TECH_STACK.md`](docs/TECH_STACK.md) — stack teknis dan keputusan teknologi.
- [`docs/GOOGLE_APPS_SCRIPT_CONTRACT.md`](docs/GOOGLE_APPS_SCRIPT_CONTRACT.md) — kontrak integrasi Google Apps Script (master data, New Pile Master).
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — roadmap pengembangan.

---

## Legal License

This project is proprietary software and is **not open source**.

Copyright © 2026 HNT & IA. All rights reserved.

The public visibility of this repository is provided solely for application
deployment, maintenance, and authorized internal operational use.

Except with prior written authorization from the copyright holders, the
following are prohibited:

- copying or redistributing the source code;
- modifying or creating derivative versions for distribution;
- rebranding or reselling the application;
- representing the software or source code as your own work;
- using the software outside the authorized company/work environment.

Authorized use is limited to approved users within the designated internal
company/work environment.

No license or ownership rights are granted merely by accessing this public
repository.