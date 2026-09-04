# Form Sampling — System Architecture

**Status:** Draft v0.1  
**Project:** Form Sampling  
**Source of Business Logic:** `docs/Form_Sampling.xlsx`

---

## 1. Tujuan Sistem

Form Sampling adalah aplikasi mobile berbasis **Progressive Web App (PWA)** untuk mendukung aktivitas sampling ore di lapangan.

Aplikasi menggantikan proses operasional yang saat ini berjalan melalui workbook `Form_Sampling.xlsx`, dengan tujuan:

- lebih mudah digunakan melalui perangkat mobile;
- mengurangi input manual;
- mempertahankan seluruh aturan sampling yang sudah ada;
- mendukung operasi dengan koneksi internet terbatas;
- menyediakan continuity antar-shift;
- menghasilkan laporan yang dapat dibagikan ke grup WhatsApp;
- menghasilkan arsip Excel detail untuk setiap shift;
- menyimpan master data dan summary operasional secara terpusat.

Workbook Excel lama tetap digunakan sebagai **reference specification** untuk business rule selama proses migrasi.

---

# 2. Prinsip Arsitektur

Sistem mengikuti prinsip berikut.

## 2.1 Offline First

Operasi sampling harus tetap dapat berjalan ketika tidak tersedia koneksi internet.

Data shift aktif disimpan terlebih dahulu pada perangkat.

Internet hanya dibutuhkan untuk fungsi seperti:

- sinkronisasi master data;
- backup summary;
- fungsi lain yang membutuhkan layanan eksternal.

Aplikasi tidak melakukan upload arsip Excel ke penyimpanan cloud terkelola (mis. Google Drive). Arsip XLSX dibagikan/disimpan oleh user secara eksternal (lihat Phase 17 — Archive Storage, CLOSED, pada `docs/ROADMAP.md`).

Kegagalan koneksi tidak boleh menghentikan proses sampling.

---

## 2.2 Business Logic Terpisah dari UI

Formula Excel tidak diterjemahkan langsung menjadi logika di komponen tampilan.

Struktur aplikasi dipisahkan menjadi:

```text
UI
│
▼
Application / Use Cases
│
▼
Domain / Business Rules
│
▼
Persistence / Integration
```

Contoh aturan yang harus berada pada domain layer:

- penentuan increment;
- penentuan batch;
- validasi truck;
- fleet validation;
- skipped haulage;
- wrong truck;
- status sample;
- pending sample;
- continuity pile antar-shift;
- total bag;
- validasi sample position.

Tujuannya agar aturan tersebut dapat diuji secara independen tanpa UI.

---

## 2.3 Excel Bukan Database Aktif

File Excel merupakan:

- arsip;
- snapshot shift;
- handover package;
- portable backup.

Excel tidak digunakan sebagai database transaksi aktif selama shift berlangsung.

---

## 2.4 Arsip Shift Bersifat Immutable

Ketika shift selesai dan file Excel telah di-finalisasi:

```text
Shift A
    ↓
Export Excel
    ↓
FINAL
```

Shift berikutnya hanya membaca file tersebut.

File shift sebelumnya tidak boleh diedit sebagai bagian dari proses shift berikutnya.

Flow yang benar:

```text
Previous Shift.xlsx
        │
        │ read only
        ▼
Current Shift Database
        │
        ▼
Current Shift.xlsx
```

---

# 3. System Context

Arsitektur tingkat tinggi:

```text
                         ┌──────────────────┐
                         │   Google Sheets   │
                         │                  │
                         │ Master Data      │
                         │ Shift Summary    │
                         └────────┬─────────┘
                                  │
                         Sync / Backup
                                  │
                                  ▼
┌─────────────────────────────────────────────────────┐
│                    FORM SAMPLING PWA                 │
│                                                     │
│  Registration                                       │
│  Fleet Setup                                        │
│  Pile / Haulage                                     │
│  Sampling                                           │
│  Sample Position                                    │
│  Handover                                           │
│  Report                                             │
│                                                     │
│                Local Operational Database           │
└───────────────┬─────────────────┬───────────────────┘
                │                 │
                │                 │
                ▼                 ▼
        WhatsApp Report        Excel Export
                               Full Shift Archive
                                      │
                                      ▼
                              Previous Shift Input
```

---

# 4. Data Classification

Data dibagi menjadi empat kategori.

## 4.1 Master Data

Master data relatif stabil dan dapat disimpan secara terpusat di Google Sheets.

Contoh:

- Employee / NIK;
- Staff;
- Crew;
- Sector;
- Location;
- Sampling House;
- Ore Class;
- Sampling Interval;
- Packing Rule;
- Batch Rule;
- Hauler;
- Truck;
- Truck Model;
- Company;
- Fleet reference;
- configuration lain.

Google Sheets menjadi source utama untuk jenis data ini.

---

## 4.2 Shift Transaction Data

Data transaksi merupakan seluruh aktivitas yang terjadi selama shift.

Contoh:

- Pile ID;
- Front;
- Destination;
- Truck ID;
- Rit;
- Batch;
- Increment;
- Sample YES / NO;
- Remark;
- skipped haulage;
- wrong truck;
- sample position;
- dispatcher;
- sample delivery;
- pending sample.

Data ini disimpan pada **local operational database** selama shift.

Google Sheets tidak menjadi database transaksi utama.

---

## 4.3 Shift Summary

Setelah shift selesai, sebagian data dikirim sebagai summary.

Contoh:

```text
Date
Shift
Sector
Total Pile
Total Rit
Total Batch
Total Sample
Total Bag
Wrong Truck
Pending Sample
```

Summary dapat disimpan di Google Sheets. Summary tidak menyimpan referensi/link arsip Excel (lihat ADR-003 dan Phase 17 — Archive Storage, CLOSED, pada `docs/ROADMAP.md`).

---

## 4.4 Shift Archive

Semua detail shift disimpan dalam file Excel.

Contoh nama:

```text
Sampling_2026-09-03_DS.xlsx
Sampling_2026-09-03_NS.xlsx
```

Excel merupakan sumber audit detail setelah shift selesai.

---

# 5. Core Modules

## 5.1 Registration

Mengelola:

- tanggal;
- shift;
- sector;
- sampling location;
- manpower;
- shift metadata;
- previous shift reference.

Referensi Excel:

`Regist`

---

## 5.2 Fleet Management

Mengelola:

- front;
- hauler;
- destination;
- fleet reference;
- truck yang diperbolehkan.

Referensi Excel:

`Fleet_Det`

---

## 5.3 Pile / Haulage Operations

Mengelola aktivitas haulage per pile.

Data utama:

```text
Pile ID
Ore
Batch
Rit
Increment
Front
Truck
Sampling Status
Remark
```

Referensi Excel:

`Pile_01` sampai `Pile_06`

Pada aplikasi baru jumlah pile **tidak boleh dibatasi enam**.

`Pile_01 ... Pile_06` pada workbook diperlakukan sebagai implementasi lama, bukan batas domain.

Model baru:

```text
Shift
 └── 0..N Piles
       └── 0..N Haulage Transactions
```

---

## 5.4 Sampling Engine

Sampling Engine merupakan domain logic utama.

Tanggung jawabnya mencakup:

- menentukan sampling interval;
- menentukan apakah sebuah rit menjadi sample;
- menghitung nomor increment;
- menentukan batch;
- menentukan packing;
- continuity batch antar-shift;
- continuity increment antar-shift.

Rule berasal dari konfigurasi seperti:

```text
Ore
Increment Rule
Batch Rule
Packing Rule
```

yang sekarang terdapat pada sheet `Rules`.

---

## 5.5 Truck Validation Engine

Memastikan truck sesuai dengan fleet/front yang aktif.

Possible result:

```text
VALID
WRONG_TRUCK
UNKNOWN_TRUCK
NOT_IN_FLEET
```

Business rule harus memiliki result terstruktur, bukan hanya warna atau text warning pada UI.

---

## 5.6 Sample Position

Mengelola:

- Pile ID;
- Batch;
- Rit From;
- Rit To;
- Deliver To;
- Dispatcher / NIK;
- sample status;
- sample increment range;
- overlap detection.

Referensi Excel:

`Sample_Pos`

---

## 5.7 Reporting

Menghasilkan dua output berbeda.

### Human Report

Ditujukan untuk komunikasi melalui WhatsApp.

Contoh:

```text
DAILY ORE QUALITY ASSURANCE

Date:
Shift:
Sector:

MANPOWER
...

PRODUCTION
...

SAMPLE HANDLING
...

TOTAL
...
```

Output harus dapat:

```text
Copy Report
```

dan/atau:

```text
Share
```

melalui mobile share sheet.

WhatsApp tidak menjadi database maupun dependency inti aplikasi.

---

### Machine / Archive Report

Berupa file Excel berisi seluruh detail shift.

---

# 6. Shift Lifecycle

Satu shift memiliki lifecycle:

```text
NEW
  ↓
INITIALIZED
  ↓
ACTIVE
  ↓
READY_TO_CLOSE
  ↓
FINALIZED
  ↓
ARCHIVED
```

Setelah `FINALIZED`, transaksi tidak boleh diubah tanpa mekanisme correction khusus.

---

# 7. Beginning of Shift Flow

Flow standar:

```text
Open Application
       │
       ▼
Start Shift
       │
       ▼
Import Previous Shift Excel
       │
       ▼
Validate File
       │
       ▼
Read Carry-over State
       │
       ▼
Create Current Shift
       │
       ▼
Start Operation
```

User tetap harus mempunyai pilihan:

```text
Start Without Previous Shift
```

untuk kondisi operasional tertentu.

---

# 8. Previous Shift Import

Excel shift sebelumnya berfungsi sebagai handover package.

Aplikasi membaca dua jenis informasi.

## 8.1 Carry-over State

Data yang mempengaruhi shift berikutnya:

- Pile yang masih aktif;
- pending pile;
- status CONT / HOLD;
- batch terakhir;
- rit terakhir;
- increment terakhir;
- sample belum delivered;
- sample position yang belum selesai.

Contoh:

```text
Pile: PILE001
Ore: SAP
Batch: 12
Last Rit: 235
Increment: 18/20
Status: CONTINUE
```

Shift berikutnya dapat meneruskan:

```text
Rit: 236
Increment: 19/20
```

---

## 8.2 Historical Reference

Informasi untuk referensi operator tetapi tidak menjadi transaksi baru.

Contoh:

- production previous shift;
- truck yang digunakan;
- wrong truck;
- skipped haulage;
- manpower;
- remark;
- sample delivered.

---

# 9. Excel Archive Contract

Aplikasi tidak boleh bergantung pada layout visual Excel untuk proses import.

File Excel hasil aplikasi harus memiliki struktur data yang stabil.

Contoh:

```text
Report
Shift_Info
Pile_Summary
Haulage_Detail
Sampling_Detail
Sample_Position
Pending_Sample
App_Data
```

---

## 9.1 Shift_Info

Contoh:

```text
Shift_ID
Date
Shift
Sector
Location
Created_By
Started_At
Finalized_At
```

---

## 9.2 Haulage_Detail

Contoh field:

```text
Transaction_ID
Shift_ID
Pile_ID
Ore
Batch
Rit
Increment
Front_ID
Truck_ID
Sample_Status
Remark
Timestamp
```

---

## 9.3 Pending_Sample

Contoh:

```text
Pile_ID
Ore
Batch
Last_Rit
Last_Increment
Status
```

---

## 9.4 App_Data

Digunakan sebagai metadata file.

Minimal:

```text
SchemaVersion
ApplicationVersion
Shift_ID
ExportTimestamp
FileType
Checksum / Integrity Metadata
```

Contoh:

```text
SchemaVersion = 1
FileType = FORM_SAMPLING_SHIFT
```

Aplikasi harus memvalidasi metadata ini sebelum import.

---

# 10. Identity Strategy

Semua entity penting harus mempunyai ID yang stabil.

## Shift ID

Contoh:

```text
20260903_DS_SECTOR01_001
```

Namun implementation final sebaiknya tidak hanya bergantung pada kombinasi text tersebut.

Shift dapat mempunyai internal UUID dan human-readable shift code.

---

## Transaction ID

Setiap haulage transaction memiliki ID unik.

Contoh konseptual:

```text
HLG-20260903-DS-000123
```

---

## Sample ID

Contoh:

```text
SMP-20260903-P001-B012-I018
```

ID digunakan untuk:

- audit trail;
- duplicate prevention;
- synchronization;
- import;
- reconciliation.

---

# 11. Duplicate Protection

Previous Shift Excel tidak boleh di-import dua kali tanpa detection.

Aplikasi harus menyimpan:

```text
Imported Shift ID
Source File ID / fingerprint
Import Timestamp
```

Jika file yang sama dimasukkan lagi:

```text
Previous shift already imported.
No data duplicated.
```

---

# 12. Import Validation

Previous shift file tidak boleh langsung dipercaya.

Validation minimal:

```text
File type valid
Schema version supported
Shift ID valid
Date valid
Previous shift relationship valid
Required sheets available
Required fields available
No duplicate import
Pile state valid
Data integrity valid
```

Jika ditemukan masalah, aplikasi memberi warning atau menolak import sesuai tingkat severity.

Contoh:

```text
WARNING

Imported:
01 Sep 2026 - Night Shift

Current:
03 Sep 2026 - Day Shift

This file is not the immediately previous shift.
```

---

# 13. Local Persistence

Data shift aktif disimpan di perangkat.

Untuk PWA, implementation kemungkinan menggunakan browser local database seperti IndexedDB atau abstraction di atasnya.

Detail teknologi diputuskan kemudian.

Local persistence menyimpan minimal:

```text
Current Shift
Manpower
Fleet Setup
Pile
Haulage Transactions
Sample Transactions
Sample Position
Pending State
Cached Master Data
Sync State
```

---

# 14. Synchronization Strategy

Sinkronisasi tidak boleh bersifat blocking.

Flow:

```text
User Action
     │
     ▼
Save Local
     │
     ▼
Operation Successful
     │
     ▼
Background / Deferred Sync
```

Bukan:

```text
User Action
     │
     ▼
Wait Google
     │
     ▼
Save
```

Tujuannya agar internet buruk tidak mengganggu operasi.

---

# 15. Google Sheets Responsibility

Google Sheets bukan operational transaction database.

Google Sheets digunakan untuk:

## Master Data

```text
Employees
Trucks
Haulers
Ore Classes
Sampling Rules
Locations
Sectors
Configuration
```

## Shift Summary

Contoh:

```text
Shift_ID
Date
Shift
Sector
Pile_Count
Rit_Total
Batch_Total
Sample_Total
Bag_Total
Wrong_Truck
Pending_Count
```

`Archive_Link` is not part of the shift summary contract. No managed cloud archive exists to link to (Phase 17 — Archive Storage, CLOSED).

---

# 16. Excel Responsibility

Excel digunakan untuk:

```text
Full Shift Archive
Audit Detail
Handover
Offline Portable Backup
Investigation / Reconciliation
Historical Record
```

Excel tidak digunakan untuk:

```text
live database
multi-user synchronization
master configuration source
```

---

# 17. WhatsApp Responsibility

WhatsApp hanya menjadi communication channel.

Flow utama:

```text
Generate Report
       │
       ├── Copy
       │
       └── Share
              │
              ▼
        Native Share Sheet
              │
              ▼
          WhatsApp
```

Aplikasi tidak bergantung pada WhatsApp API untuk core operation.

---

# 18. Source Workbook Mapping

Workbook lama menjadi reference untuk migration.

| Excel Sheet | New Application Domain |
|---|---|
| Rules | Master Data / Sampling Rules |
| Truck | Truck Master |
| Regist | Shift Registration |
| Fleet_Det | Fleet Management |
| Pile_01–Pile_06 | Pile + Haulage Transactions |
| Sample_Pos | Sample Position |
| Report | Reporting |

Formula workbook harus dianalisis dan diklasifikasikan menjadi:

```text
Business Rule
UI Helper
Excel-specific Calculation
Report Formatting
Validation Rule
```

Tidak semua formula perlu dipindahkan.

Formula yang hanya berfungsi untuk mengatasi keterbatasan Excel tidak boleh otomatis diterjemahkan ke aplikasi.

---

# 19. Domain Model Awal

Model konseptual:

```text
Shift
│
├── Manpower[]
├── Fleet[]
│   └── AllowedTruck[]
│
├── Pile[]
│   ├── HaulageTransaction[]
│   ├── SamplingEvent[]
│   └── PendingState
│
├── SamplePosition[]
│
└── Report
```

Master:

```text
Employee
Truck
Hauler
Sector
Location
OreClass
SamplingRule
```

---

# 20. Auditability

Setiap transaksi penting minimal memiliki:

```text
ID
CreatedAt
CreatedBy
UpdatedAt
ShiftID
```

Untuk tindakan kritis dapat ditambahkan:

```text
PreviousValue
NewValue
Reason
```

Data tidak seharusnya hilang hanya karena user melakukan correction.

---

# 21. Error Handling

Aplikasi harus membedakan:

```text
INFO
WARNING
BLOCKING_ERROR
```

Contoh:

### INFO
Sample interval berikutnya.

### WARNING
Truck tidak termasuk fleet.

### BLOCKING ERROR
Previous shift file rusak atau schema tidak dikenali.

Warning tidak selalu berarti transaksi harus dihentikan.

Business requirement menentukan mana kondisi yang blocking.

---

# 22. User Experience Principle

Target user adalah personel lapangan.

Karena itu UI harus mengutamakan:

- sedikit input manual;
- pilihan dari master data;
- tombol besar;
- penggunaan satu tangan;
- minimum typing;
- immediate validation;
- offline status jelas;
- current pile jelas;
- current batch/increment jelas;
- warning yang mudah dipahami;
- recovery dari salah input.

Aplikasi tidak boleh menampilkan kompleksitas workbook Excel kepada operator.

---

# 23. Security Boundary

Data aplikasi tidak boleh bergantung hanya pada keamanan file Excel.

Minimal perlu dipikirkan:

- siapa yang dapat mengubah master;
- siapa yang dapat membuka shift;
- siapa yang dapat finalize;
- siapa yang dapat melakukan correction;
- integrity file hasil export;
- backup;
- access terhadap Google Sheet.

Authentication strategy ditentukan pada technical design berikutnya.

---

# 24. Failure Scenarios yang Harus Didukung

Aplikasi harus tetap memiliki behavior yang jelas ketika:

```text
Internet terputus
Google Sheets tidak dapat diakses
Browser/app ditutup
HP restart
Previous shift Excel tidak tersedia
Previous shift file salah
Previous shift file corrupt
File yang sama di-import dua kali
Master data berubah
Truck belum terdaftar
Pile dilanjutkan antar-shift
Shift selesai dengan pending sample
User salah input truck
User salah input rit
```

---

# 25. Non-Goals Versi Awal

Untuk menjaga scope, versi awal tidak harus menjadi:

- ERP;
- fleet dispatch system;
- laboratory information system;
- production database perusahaan;
- WhatsApp automation platform;
- real-time multi-device collaborative system.

Scope utamanya adalah:

```text
Field Sampling Workflow
+
Validation
+
Shift Handover
+
Reporting
+
Archiving
```

---

# 26. Architectural Decisions

Keputusan yang sudah disepakati:

### ADR-001
Application type:

```text
Mobile-first PWA
```

### ADR-002
Operation model:

```text
Offline first
```

### ADR-003
Google Sheets:

```text
Master Data + Shift Summary
```

bukan transaction database.

### ADR-004
Shift operational data:

```text
Local database
```

### ADR-005
Permanent detailed archive:

```text
Excel per shift
```

### ADR-006
Shift continuity:

```text
Import previous shift Excel
```

### ADR-007
Previous shift archive:

```text
Read-only / immutable
```

### ADR-008
WhatsApp:

```text
Generated report + user initiated share/copy
```

### ADR-009
Workbook:

```text
Business-rule reference
```

bukan runtime engine aplikasi.

---

# 27. Decisions yang Belum Dikunci

Beberapa hal sengaja belum diputuskan pada tahap architecture:

```text
Frontend framework
TypeScript framework
Local database library
Google API integration method
Authentication
Hosting
Backend requirement
Excel generation library
Testing framework
State management
Deployment pipeline
```

Keputusan tersebut dibuat setelah:

1. business rule workbook selesai dipetakan;
2. domain model disepakati;
3. kebutuhan offline dan synchronization ditentukan secara detail.

---

# 28. Target Architecture

Target akhir:

```text
                  MASTER DATA
                Google Sheets
                      │
                      ▼
              ┌───────────────┐
Previous      │               │
Shift Excel ─►│ Sampling PWA  │
              │               │
              │ Domain Engine │
              │ Local Storage │
              └───────┬───────┘
                      │
             End-of-Shift Finalize
                      │
          ┌───────────┼────────────┐
          │           │            │
          ▼           ▼            ▼
      WhatsApp     Excel       Shift Summary
       Report      Archive      Google Sheets
                     │
                     ▼
              Next Shift Input
```

---

# 29. Core Architectural Rule

Hal terpenting dalam pengembangan:

> Excel lama adalah reference untuk memahami aturan bisnis, tetapi aplikasi baru tidak boleh dibangun sebagai “Excel yang dipindahkan ke browser”.

Aplikasi harus memodelkan proses operasional secara langsung:

```text
Shift
→ Fleet
→ Pile
→ Haulage
→ Sampling
→ Sample Handling
→ Report
→ Archive
→ Handover
```

Setiap formula Excel harus terlebih dahulu dipahami tujuan bisnisnya sebelum diimplementasikan ulang dalam kode.

# 30. Internationalization / Multi-Language

Aplikasi harus mendukung minimal dua bahasa:

```text
Bahasa Indonesia
English
```

Bahasa dapat dipilih oleh user dan dapat diubah tanpa mempengaruhi data operasional.

---

## 30.1 Stable Internal Values

Business data tidak boleh disimpan menggunakan text yang bergantung pada bahasa.

Contoh yang salah:

```text
Shift = "Shift Siang"
Status = "Belum Diambil"
Sample = "Ya"
```

Gunakan stable code:

```text
Shift = "DS"
Status = "NOT_PICKED_UP"
Sample = true
```

Kemudian presentation layer menerjemahkan nilai tersebut.

Contoh:

```text
DS

Indonesian:
Shift Siang

English:
Day Shift
```

---

## 30.2 Translation Layer

Semua text UI harus berasal dari translation resources.

Contoh struktur konseptual:

```text
locales/
├── id.json
└── en.json
```

Contoh:

```text
sampling.start

ID:
Mulai Sampling

EN:
Start Sampling
```

Text UI tidak boleh tersebar sebagai hard-coded string di berbagai component.

---

## 30.3 Domain Layer Language Neutral

Domain/business logic tidak mengetahui bahasa user.

Contoh result domain:

```text
WRONG_TRUCK
OVERLAP
PENDING_SAMPLE
NOT_IN_FLEET
```

Presentation layer menerjemahkan:

```text
WRONG_TRUCK

ID:
Unit DT tidak sesuai fleet

EN:
Truck is not assigned to this fleet
```

Dengan demikian perubahan translation tidak dapat mengubah business logic.

---

## 30.4 Master Data

Master data dibagi menjadi dua kategori.

### Proper Name / Identifier

Tidak perlu diterjemahkan:

```text
Employee Name
NIK
Truck ID
Pile ID
Front ID
Company
Hauler
Location Code
```

### Display Classification

Dapat mempunyai bilingual label:

```text
Ore Category
Status
Sampling Type
Location Description
Role
Remark Category
```

Jika diperlukan, struktur dapat menggunakan:

```text
code
label_id
label_en
```

Contoh:

```text
code: NOT_PICKED_UP
label_id: Belum Diambil
label_en: Not Picked Up
```

---

## 30.5 WhatsApp Report Language

Report WhatsApp dapat dibuat berdasarkan bahasa yang dipilih user.

Contoh:

```text
[ Indonesian ]
[ English ]
```

Business data yang dilaporkan tetap sama.

Hanya presentation yang berubah.

Contoh:

```text
ID:
Sampel Tertunda : 3

EN:
Pending Samples : 3
```

---

## 30.6 Excel Export

Excel harus mempertahankan stable machine-readable values pada data internal.

Human-readable report sheet dapat mengikuti bahasa yang dipilih saat export.

Contoh:

```text
Report            → translated
Haulage_Detail    → stable field structure
App_Data          → stable machine values
```

Nama field yang digunakan untuk proses import sebaiknya tetap stabil dan tidak berubah berdasarkan bahasa.

Contoh:

```text
Pile_ID
Batch
Rit
Truck_ID
Sample_Status
```

Jangan membuat:

```text
Truck_ID
```

berubah menjadi:

```text
Unit_DT
```

hanya karena user memilih Bahasa Indonesia.

Ini penting agar file shift tetap dapat dibaca kembali oleh aplikasi.

---

## 30.7 Locale Formatting

Bahasa UI dan format data harus diperlakukan secara terpisah.

Internal date format:

```text
2026-09-03
```

Display Indonesia:

```text
03 September 2026
```

Display English:

```text
03 September 2026
```

Timestamp dan numeric value tetap menggunakan representation standar pada database/export machine layer.

---

## 30.8 User Preference

Language preference dapat disimpan secara lokal per device/user.

Contoh:

```text
language = "id"
```

atau:

```text
language = "en"
```

Default awal dapat menggunakan Bahasa Indonesia karena target utama adalah operator lapangan, tetapi user tetap dapat mengubahnya dari settings.

---

# ADR-010 — Application Language

Aplikasi menggunakan architecture yang mendukung internationalization sejak awal.

Supported languages untuk versi pertama:

```text
id = Bahasa Indonesia
en = English
```

Internal domain values, database values, IDs, dan Excel interchange format harus language-neutral.

Translation hanya terjadi pada presentation layer dan human-readable output.

# 31. Source Control and Deployment

Source code Form Sampling dikelola menggunakan GitHub.

GitHub digunakan untuk:

```text
Source Control
Version History
Branch Management
Pull Request / Code Review
Issue Tracking
Release Tagging
CI/CD
Deployment Automation
```

Repository GitHub menjadi source of truth untuk application source code.

---

## ADR-011 — Source Control

Version control platform:

```text
GitHub
```

Development dilakukan melalui local workspace:

```text
D:\Workspace\form-sampling
```

dan disinkronkan dengan GitHub repository.

---

## Branch Strategy

Initial recommended strategy:

```text
main
  │
  ├── feature/*
  ├── fix/*
  └── refactor/*
```

`main` harus selalu berada dalam kondisi deployable.

Development feature tidak dilakukan langsung pada `main`.

Contoh:

```text
feature/sampling-engine
feature/excel-import
feature/shift-handover
fix/wrong-truck-validation
```

---

## Deployment Pipeline

Target flow:

```text
Local Development
       │
       ▼
Git Commit
       │
       ▼
GitHub
       │
       ▼
Automated Checks
       │
       ├── Lint
       ├── Type Check
       ├── Unit Tests
       └── Build
              │
              ▼
           Deploy
```

Deployment automation sebaiknya menggunakan GitHub Actions.

Build tidak boleh di-deploy jika test atau validation utama gagal.

---

## Environment Separation

Minimal environment:

```text
Development
Production
```

Jika diperlukan kemudian:

```text
Development
Staging
Production
```

Configuration environment tidak boleh hard-coded di source code.

---

## Secrets

Credential dan secret tidak boleh disimpan dalam repository.

Contoh:

```text
API keys
OAuth client secrets
Service credentials
Deployment tokens
```

Gunakan environment configuration / GitHub Secrets sesuai kebutuhan deployment.

Data yang aman untuk frontend public configuration harus dibedakan dari actual secret.

---

## Hosting Decision

GitHub sebagai source-control dan CI/CD platform sudah diputuskan.

Hosting provider belum dikunci.

Candidate:

```text
GitHub Pages
```

dapat digunakan jika aplikasi dapat di-deploy sebagai static PWA tanpa kebutuhan trusted server-side runtime.

Jika kemudian diperlukan:

```text
secure backend
server-side Google integration
secret-bearing API
central authentication service
server-side file processing
```

maka hosting/backend dapat menggunakan platform lain sementara repository dan deployment pipeline tetap berada di GitHub.

Dengan demikian:

```text
GitHub Repository
      │
      └── permanent

Hosting Target
      │
      └── replaceable
```

Deployment architecture tidak boleh membuat application domain bergantung pada hosting provider tertentu.

---

## Release Identification

Setiap production release harus mempunyai version identifier.

Contoh:

```text
v0.1.0
v0.2.0
v1.0.0
```

Application version juga disimpan pada Excel archive:

```text
App_Data.ApplicationVersion
```

Tujuannya agar archive lama dapat diketahui dibuat menggunakan versi aplikasi mana.

---

## Deployment Principle

Deployment harus reproducible.

Artinya production build harus dapat dibuat kembali dari:

```text
Git commit
+
versioned dependencies
+
environment configuration
```

Perubahan manual langsung pada production deployment harus dihindari.