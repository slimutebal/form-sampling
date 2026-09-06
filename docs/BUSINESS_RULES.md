# Form Sampling — Business Rules

**Status:** Draft v0.1  
**Project:** Form Sampling  
**Source:** `docs/Form_Sampling.xlsx`  
**Related:** `docs/ARCHITECTURE.md`

---

# 1. Purpose

Dokumen ini mendefinisikan business rule yang harus dipertahankan ketika workflow pada `Form_Sampling.xlsx` dipindahkan menjadi aplikasi PWA.

Workbook digunakan sebagai sumber untuk memahami current behavior.

Namun:

> Formula Excel bukan specification final.

Setiap formula diklasifikasikan menjadi:

```text
CONFIRMED_BUSINESS_RULE
IMPLEMENTATION_DETAIL
REPORT_FORMATTING
LEGACY_BEHAVIOR
NEEDS_CONFIRMATION
```

Business logic pada aplikasi baru harus mengikuti kebutuhan operasional, bukan keterbatasan struktur Excel.

---

# 2. Terminology

Istilah utama:

| Term | Meaning |
|---|---|
| Shift | Satu periode kerja operasional |
| Pile | Pile produksi yang sedang ditangani |
| Pile ID | Identifier unik pile |
| Stockpile | Area / kelompok tempat pile berada |
| Ore | Jenis ore yang menentukan sampling rule |
| Front | Sumber/front produksi |
| Fleet | Kumpulan truck yang diperbolehkan pada front |
| Rit | Nomor haulage dalam sebuah batch |
| Batch | Kelompok rit |
| Increment | Titik sampling dalam batch |
| Pending | Pekerjaan dari shift sebelumnya yang belum selesai |
| Sample Position | Status / posisi sample setelah dihasilkan |
| Dispatcher | Personel yang menangani pengiriman sample |
| Wrong Truck | Truck yang tidak sesuai fleet |
| Skipped Haulage | Rit yang terlewat dalam urutan input |

---

# 3. Master Data Rules

## BR-MASTER-001 — Pile Determines Ore

Satu `Pile_ID` harus mempunyai ore classification yang berasal dari master pile.

Current source:

```text
Rules → Pile_area
```

Mapping:

```text
Pile_ID
→ Stockpile
→ Ore
```

Operator tidak seharusnya memilih ore secara manual jika Pile ID sudah diketahui.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-MASTER-002 — Ore Determines Sampling Rule

Sampling rule berasal dari `Int_Sample`.

Current fields:

```text
Ore
Inc
Batch
Packing
```

Current configuration:

| Ore | Sampling Interval | Batch Size | Packing |
|---|---:|---:|---:|
| SAP | 2 | 20 | 2 |
| LIM | 5 | 100 | 10 |

Contoh SAP:

```text
Sample every 2 rit
Batch completes at Rit 20
```

Contoh LIM:

```text
Sample every 5 rit
Batch completes at Rit 100
```

Nilai ini harus dianggap sebagai configuration/master data, bukan hard-coded dalam aplikasi.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-MASTER-003 — Truck Must Come From Truck Master

Truck yang dapat dipilih operator harus berasal dari truck master.

Current source:

```text
Truck → d_trucks
```

Data antara lain:

```text
PT
Model
Unit Number
Truck_ID
PF Type
```

Input text bebas untuk Truck ID sebisa mungkin dihindari.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-MASTER-004 — Canonical New Pile_ID Derives Sector/Stockpile/Ore (post-inspection correction §3)

Untuk **Pile_ID baru** (belum ada di master), Sector/Stockpile/Ore tidak
ditanyakan ke operator ketika grammar Pile_ID deterministik. Sector tetap
berasal dari Shift aktif dan divalidasi terhadap Shift (lihat detail per
keluarga di bawah).

Confirmed canonical families (`deriveCanonicalPileArea`,
`src/domain/master/canonical-pile-id.ts`):

```text
FAMILY A — LIM stockpile
L<n>_<nn>   → Stockpile LS_<n>   / Ore LIM
L<n>_S<nn>  → Stockpile LS_<n>   / Ore SAP

FAMILY B — SAP stockpile
S<n>_<nn>   → Stockpile SS_<n>   / Ore SAP
S<n>_L<nn>  → Stockpile SS_<n>   / Ore LIM

FAMILY C — DS-C stockpile
DS-C<n>_L<nn> → Sector DS, Stockpile DS-C_<n> / Ore LIM
DS-C<n>_S<nn> → Sector DS, Stockpile DS-C_<n> / Ore SAP
```

Aturan kanonik: `_L` selalu berarti LIM, `_S` selalu berarti SAP —
**termasuk untuk keluarga DS-C**. Ini adalah koreksi resmi dari
process owner terhadap baris master `Pile_Areas` existing yang salah:
baris `DS-C<n>_L<nn>` yang saat ini tersimpan dengan Ore = SAP adalah
**wrong master data**. Aplikasi **tidak** boleh secara otomatis menulis
ulang baris live Google Sheet yang salah tersebut selama refactor ini —
inkonsistensi tersebut dilaporkan untuk dikoreksi terpisah oleh pemilik
data (lihat laporan akhir setiap kali koreksi ini dijalankan).

Untuk Pile_ID lama/legacy yang tidak sesuai satu pun grammar di atas:
aplikasi tidak menebak grammar baru dan tidak jatuh kembali ke selector
Stockpile/Ore manual. Tampilkan pesan bisnis stabil
`PILE_ID_PATTERN_NOT_SUPPORTED`. Operator tetap dapat memilih Pile
existing yang persis melalui master lookup biasa.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 4. Shift Rules

## BR-SHIFT-001 — Every Transaction Belongs to a Shift

Setiap operational transaction harus mempunyai minimal:

```text
Shift_ID
Date
Shift
Sector
```

dan jika relevan:

```text
Sampling House / Location
```

Tidak boleh ada haulage transaction tanpa hubungan dengan sebuah Shift.

---

## BR-SHIFT-002 — Shift Codes Are Language Neutral

Internal value tidak menggunakan localized string.

Gunakan:

```text
D
N
```

atau stable enum yang nantinya ditentukan.

UI dapat menampilkan:

```text
ID:
Shift Siang
Shift Malam

EN:
Day Shift
Night Shift
```

Internal code tidak berubah.

---

## BR-SHIFT-003 — Previous Shift Relationship

Aplikasi menggunakan siklus dua shift per hari (`DS` / `NS`, BR-SHIFT-002)
untuk menentukan shift sebelumnya (previous shift) pada Handover Import
(lihat § 6 Previous Shift / Pending Rules).

Current shift `NS` tanggal `D`:

```text
previous = DS tanggal D (hari yang sama)
```

Current shift `DS` tanggal `D`:

```text
previous = NS tanggal D-1 (hari sebelumnya)
```

Contoh:

```text
Current: 2026-09-05 / NS
Previous: 2026-09-05 / DS

Current: 2026-09-05 / DS
Previous: 2026-09-04 / NS
```

Perhitungan tanggal D-1 menggunakan aritmatika kalender murni pada string
`YYYY-MM-DD` (termasuk lintas akhir bulan dan akhir tahun) — tidak boleh
menggunakan parsing tanggal berbasis locale device.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 5. Manpower Rules

## BR-MAN-001 — Staff Selected From Master

Personel utama berasal dari staff master.

Current workbook melakukan lookup:

```text
NIK → Name
```

Name tidak perlu diketik manual.

---

## BR-MAN-002 — Crew Selected From Crew Master

Crew berasal dari master employee/crew.

Current workbook mengenal job seperti:

```text
Sampler
Checker
Dispatcher
```

Role disimpan sebagai stable code dan diterjemahkan pada UI.

**Post-inspection correction (§1) — Job Desk prefill:** `CrewReference.jobCode`
(`Emply_Crew` / `Crews` master) prefills Job Desk when it is non-empty.
When the master's Job column is blank — confirmed to be the case for most
Crew rows in the legacy workbook — the operator must select/type Job Desk
during shift setup; the app never invents one. The Staff/Employee master
has no exact Job field at all, so a Staff/Employee entry's Job Desk stays
optional and may remain blank — the app must never invent whether a Staff
member is e.g. SPV or Foreman.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-MAN-003 — PIC Determined by Master Table Membership (post-inspection correction §1)

Penanggung Jawab / PIC bukan checkbox yang dipilih manual operator.
PIC ditentukan murni oleh master table tempat personel tersebut resolve:

```text
Personel resolve dari Employees / Emply_Staff (Staff)
→ isPic = true, SELALU

Personel resolve dari Crews / Emply_Crew (Crew)
→ isPic = false, SELALU
```

Penentuan ini berbasis **keanggotaan master table**, bukan string-prefix
parsing (mis. prefix ID "SCM") — ID Staff kebetulan saat ini ber-prefix
SCM, tapi itu bukan sumber kebenaran; keanggotaan pada master Employees
adalah sumber kebenaran satu-satunya
(`createManpowerFromDraft`, `src/application/manpower/create-manpower-from-draft.ts`).

Sebuah shift boleh mempunyai lebih dari satu Staff/PIC sekaligus.
Aplikasi tidak boleh membatasi ke satu PIC saja, dan operator tidak
pernah men-toggle PIC secara manual — tidak ada checkbox PIC pada UI
Manpower Setup (`src/features/manpower/manpower-setup-page.tsx`). Setiap
baris Staff yang ditambahkan otomatis ditampilkan sebagai Penanggung
Jawab.

PIC adalah metadata internal shift (`ManpowerAssignment.isPic`,
`src/domain/manpower/manpower-assignment.ts`) dan **tidak** menjadi
kolom pada fixed report — lihat BR-REPORT-007.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 6. Previous Shift / Pending Rules

Bagian ini merupakan salah satu business rule terpenting.

---

## BR-PEND-001 — Only CONT Pile Is Continued

Current pending status:

```text
Cont
Hold
```

Pile dengan status:

```text
Cont
```

dapat muncul sebagai pile yang akan diteruskan.

Pile dengan:

```text
Hold
```

tidak otomatis diteruskan ke proses sampling aktif.

New application internal values:

```text
CONTINUE
HOLD
```

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-PEND-002 — Pending State Contains Batch and Last Rit

Current pending structure:

```text
Stockpile
Pile_ID
Batch
Rit
Status
```

Interpretasi:

```text
Batch = batch yang belum selesai
Rit   = rit terakhir yang sudah tercatat dalam batch tersebut
```

Contoh:

```text
Pile_ID = L18_S09
Batch   = 24
Rit     = 10
Status  = CONTINUE
```

berarti shift berikutnya meneruskan:

```text
Batch 24
Rit 11
```

---

## BR-PEND-003 — One Pile Can Have Multiple Pending Batches

Workbook saat ini mendukung lebih dari satu unfinished batch pada pile yang sama.

Contoh actual behavior:

```text
Pile L18_S09

Batch 24 / Last Rit 10
Batch 25 / Last Rit 3
Batch 31 / Last Rit 18
Batch 32 / Last Rit 14
```

Dengan SAP batch size 20, remaining workload menjadi:

```text
Batch 24 → Rit 11–20
Batch 25 → Rit 04–20
Batch 31 → Rit 19–20
Batch 32 → Rit 15–20
```

Setelah seluruh pending quota selesai:

```text
Batch 33 → Rit 01
```

dimulai sebagai batch baru.

Ini berarti domain model tidak boleh hanya mempunyai:

```text
pile.lastBatch
pile.lastRit
```

karena satu pile dapat membawa beberapa pending batch.

Gunakan konsep seperti:

```text
Pile
└── PendingBatch[]
```

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-PEND-004 — Pending Batches Processed in Batch Order

Current workbook mengurutkan pending data berdasarkan nomor batch.

Application baru harus mempertahankan deterministic ordering.

Contoh:

```text
24
25
31
32
```

bukan berdasarkan urutan row import.

---

# 7. Batch and Rit Engine

## BR-BATCH-001 — Batch Size Comes From Ore Rule

Batch capacity:

```text
SAP = 20 rit
LIM = 100 rit
```

berasal dari master configuration.

Tidak boleh ditulis langsung dalam source code.

---

## BR-BATCH-002 — Pending Batch Continues From Last Rit + 1

Jika:

```text
Batch size = 20
Last Rit   = 10
```

maka rit berikut:

```text
11
```

---

## BR-BATCH-003 — Batch Rolls Over After Batch Capacity

Contoh SAP:

```text
Batch 24 / Rit 20
```

rit berikutnya:

```text
Batch 25 / Rit 01
```

Jika batch berikutnya merupakan pending batch existing, aplikasi harus mengikuti pending state tersebut.

---

## BR-BATCH-004 — New Batch Created After Pending Work Exhausted

Setelah seluruh pending batch sebuah pile diselesaikan, batch production baru dimulai setelah nomor batch terbesar yang relevan.

Contoh:

```text
Last pending batch = 32

Next new batch:
33 / 001
```

---

# 8. Sampling Engine

## BR-SAMPLE-001 — Sampling Based on Rit Modulo Interval

Current workbook:

```text
IF MOD(Rit, SamplingInterval) = 0
THEN Sample = YES
ELSE Sample = NO
```

Contoh SAP:

```text
Interval = 2

Rit 1 → NO
Rit 2 → YES
Rit 3 → NO
Rit 4 → YES
```

Contoh LIM:

```text
Interval = 5

Rit 1–4 → NO
Rit 5   → YES
Rit 10  → YES
...
Rit 100 → YES
```

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-SAMPLE-002 — Sampling Decision Must Be Automatic

Operator tidak memilih manual:

```text
YES / NO
```

untuk normal workflow.

Sampling decision dihitung dari:

```text
Ore
Sampling Rule
Rit
```

Override, jika kelak diperlukan, harus menjadi fitur khusus dengan audit trail.

---

## BR-SAMPLE-003 — Increment Identity

Current workbook menampilkan combined representation:

```text
Batch / Rit
```

contoh:

```text
024 / 012
```

Representation tersebut adalah presentation value.

Domain harus menyimpan terpisah:

```text
batch = 24
rit = 12
```

Jangan menggunakan `"024 / 012"` sebagai primary data.

---

# 9. Fleet Rules

## BR-FLEET-001 — Front Identity

Current Front ID dibentuk dari:

```text
Sector + "/" + two digit Front Number
```

Contoh:

```text
BR1
Front 1

→ BR1/01
```

Front sebaiknya mempunyai internal ID sendiri, sementara `BR1/01` menjadi business/display code.

**Phase 18 confirmation:** Front Number adalah selector tertutup, nilai 1
sampai 25 — bukan free text. Operator tidak pernah mengetik kode
gabungan `BR1/01` secara manual; FrontId selalu diturunkan dari Sector
Shift aktif + Front Number yang dipilih (`createFrontId`,
`src/domain/fleet/front.ts`).

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-FLEET-002 — Fleet Belongs to Front

Fleet configuration mempunyai:

```text
Sector
Front Number
Hauler
Destination
Fleet Reference
Allowed Trucks
```

Truck validation bergantung pada front yang dipilih.

---

## BR-FLEET-003 — Truck Options Filtered by Hauler

Current workbook membentuk available truck list berdasarkan Hauler/PT.

Application UI harus sebisa mungkin hanya menampilkan truck yang relevan.

---

## BR-FLEET-004 — Fleet Reference Can Inherit Another Fleet

Current workbook mempunyai:

```text
Fleet Reff
```

Jika kosong:

```text
current front = master fleet
```

Jika berisi front lain:

```text
current front inherits the referenced fleet
```

---

## BR-FLEET-005 — Referenced Fleet Supports Truck Delta

Current Excel behavior:

Jika fleet menggunakan `Fleet Reff`, truck yang dimasukkan pada row current fleet bertindak sebagai perubahan terhadap base fleet.

Secara konseptual:

```text
Base Fleet
+
Added Trucks
-
Removed Trucks
=
Effective Fleet
```

Current formula menggunakan perbedaan antara base truck list dan current truck list untuk menghasilkan effective fleet.

Contoh:

```text
Base BR1/01:
A
B
C
D

BR1/04 references BR1/01

Current changes:
A
E
```

maka effective result current workbook secara konsep menjadi:

```text
B
C
D
E
```

Truck `A` yang sudah terdapat pada base dianggap dikeluarkan, sementara `E` ditambahkan.

Classification:

```text
CONFIRMED_CURRENT_BEHAVIOR
```

Catatan:

UI aplikasi baru sebaiknya tidak menggunakan interaction ambigu ini.

Lebih aman menyediakan explicit actions:

```text
Add Truck
Remove Truck
```

sementara effective result tetap sama.

---

# 10. Truck Validation Rules

## BR-TRUCK-001 — Truck Valid Against Effective Fleet

Untuk setiap haulage:

```text
Front_ID
+
Truck_ID
```

harus divalidasi terhadap Effective Fleet.

Jika truck terdapat pada fleet:

```text
VALID
```

Jika tidak:

```text
WRONG_TRUCK
```

---

## BR-TRUCK-002 — Front With Missing Truck Is Invalid

Current workbook juga menganggap kondisi:

```text
Front selected
Truck empty
```

sebagai validation problem.

New application sebaiknya mencegah transaksi selesai tanpa Truck ID jika front membutuhkan truck.

---

## BR-TRUCK-003 — Wrong Truck Does Not Disappear

Wrong Truck merupakan operational exception.

Data transaksi tetap harus disimpan sehingga dapat masuk ke:

```text
report
audit
history
```

Jangan hanya menampilkan warning lalu membuang transaksi.

**Phase 18 final correction (§6):** Truck checker pada layar Pile
Operation menampilkan truck efektif Front (effective fleet) lebih
dahulu, tetapi tetap membolehkan pencarian ke seluruh master truck di
luar effective fleet tersebut — operator dapat memilihnya, dan transaksi
tetap tersimpan dengan `truckValidation.status = WRONG_TRUCK`
(`src/domain/fleet/truck-validation.ts`). `recordHaulage`
(`src/application/haulage-operation/create-haulage-record.ts`) yang
sebelumnya menolak setiap klasifikasi non-`VALID` sebagai defensive
guard sudah dihapus — guard tersebut sebelumnya justru melanggar aturan
ini karena mem-block penyimpanan Wrong Truck sama sekali dari alur
checker normal.

---

# 11. Skipped Haulage Rules

## BR-SKIP-001 — Missing Entry Inside Sequence Can Become Skipped

Current workbook mendeteksi kondisi ketika sebuah haulage position belum mempunyai valid front, tetapi kemudian terdapat haulage berikutnya pada batch yang sama.

Contoh konseptual:

```text
Rit 10 → valid
Rit 11 → missing
Rit 12 → valid
```

Rit 11 dapat ditandai:

```text
Skipped
```

Current output report mengubahnya menjadi:

```text
TERLEWAT
```

---

## BR-SKIP-002 — Tail Entry Is Not Immediately Considered Skipped

Jika belum terdapat subsequent valid haulage, current formula tidak langsung menyimpulkan bahwa entry tersebut skipped.

Hal ini menghindari false positive pada rit yang sedang menunggu input.

Classification:

```text
CONFIRMED_CURRENT_BEHAVIOR
```

---

## BR-SKIP-003 — Stable Internal Code

Gunakan internal code:

```text
SKIPPED_HAULAGE
```

Presentation:

```text
ID: Terlewat
EN: Skipped
```

---

# 12. Sample Pending / Undelivered Rules

## BR-UND-001 — Sample YES Produces Sample Handling Requirement

Haulage dengan:

```text
Sample = YES
```

dan operational data valid menghasilkan sample yang harus ditangani.

Jika belum terdapat matching Sample Position, sample masuk ke daftar undelivered/pending sample.

---

## BR-UND-002 — Already Handled Sample Must Not Be Generated Again

Workbook membandingkan:

```text
Pile
Batch
Rit
```

dengan sample yang sudah terdapat pada `Sample_Pos`.

Jika sudah ditangani, sample tidak dimasukkan kembali ke undelivered list.

Aplikasi baru sebaiknya menggunakan `Sample_ID` unik daripada hanya composite matching.

---

# 13. Sample Position Rules

## BR-SP-001 — Sample Position References Existing Pile

Sample handling harus terhubung dengan:

```text
Pile_ID
Batch
```

dan range sampling:

```text
Rit From
Rit To
```

---

## BR-SP-002 — Ore Derived From Pile

Ore pada Sample Position tidak diketik manual.

Mapping:

```text
Pile_ID → Ore
```

---

## BR-SP-003 — Increment Range Follows Sampling Interval

Contoh SAP:

```text
Rit_F = 2
Rit_T = 20
Interval = 2
```

sequence:

```text
2, 4, 6, 8, 10, 12, 14, 16, 18, 20
```

Contoh LIM:

```text
5, 10, 15, ...
```

---

## BR-SP-004 — Overlap Is Invalid

Dua Sample Position untuk:

```text
same Pile
same Batch
```

tidak boleh memiliki sampling increment yang overlap.

Example:

```text
Entry A:
2–10

Entry B:
8–20
```

Result:

```text
OVERLAP
```

Current workbook status:

```text
VALID
OVERLAP!
```

New application internal values:

```text
VALID
OVERLAP
```

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 14. Sample Delivery Rules

## BR-DELIVERY-001 — Sample Can Remain Not Picked Up

Current value:

```text
Not Picked Up
```

merepresentasikan sample yang masih berada di Sampling House / location.

Internal code:

```text
NOT_PICKED_UP
```

---

## BR-DELIVERY-002 — Delivered Sample Records Destination

Jika sample telah dikirim:

```text
Deliver To
```

harus mencatat destination.

---

## BR-DELIVERY-003 — Dispatcher Recorded Where Applicable

Delivered sample dapat mempunyai dispatcher NIK.

NIK berasal dari employee master.

Jika required information seharusnya ada tetapi missing, current workbook dapat menghasilkan:

```text
Unknown
```

Aplikasi baru sebaiknya menggunakan explicit state:

```text
dispatcher_id = null
```

dan presentation layer dapat menampilkan:

```text
Unknown
```

jika diperlukan.

---

# 15. Sample Bag Rules

Current workbook menggunakan kombinasi:

```text
Sampling Interval
Packing
```

untuk menghitung jumlah bag.

Current sample contribution:

```text
Sampling Interval / Packing
```

per sampling event.

Current rules:

### SAP

```text
Interval = 2
Packing  = 2

Bag contribution per sampled rit = 1
```

Full SAP batch:

```text
10 sampling increments
→ 10 bags
```

### LIM

```text
Interval = 5
Packing  = 10

Bag contribution per sampled rit = 0.5
```

Full LIM batch:

```text
20 sampling increments
→ 10 bags
```

Sample Position kemudian mengagregasi contribution tersebut menjadi Total Bag.

Classification:

```text
CONFIRMED_CURRENT_BEHAVIOR
```

Business meaning dari `Packing` masih perlu didokumentasikan secara eksplisit sebelum implementation final.

---

# 16. Report Rules

Report mempunyai empat kelompok utama.

---

## BR-REPORT-001 — Header

Report current workbook memuat:

```text
DAILY ORE QUALITY ASSURANCE REPORT

Date
Shift
Week
```

Date/Shift berasal dari shift aktif.

Week menggunakan ISO week number.

---

## BR-REPORT-002 — Manpower Section

Report manpower memuat:

```text
Date
Shift
Location
Job Desk
NIK
Name
```

---

## BR-REPORT-003 — Production Summary Per Pile

Current aggregation per:

```text
Pile_ID
Ore
```

menghasilkan:

```text
Rit
Batch
Increment
Wrong Truck
```

Calculation current workbook:

### Rit

Jumlah haulage record.

### Batch

Jumlah distinct Batch.

### Increment

Jumlah haulage dengan:

```text
Sample = YES
```

### Wrong Truck

Jumlah transaction yang memiliki:

```text
WRONG_TRUCK
```

---

## BR-REPORT-004 — Production Total

Report menghasilkan total untuk:

```text
Rit
Batch
Increment
Wrong Truck
```

---

## BR-REPORT-005 — Sample Handling Section

Current fields:

```text
Status
Dispatcher
Ore
Pile_ID
Batch
Increment From
Increment To
Total Bag
```

---

## BR-REPORT-006 — Haulage Detail

Current report juga mempunyai haulage detail.

Data meliputi:

```text
Haulage_ID
Truck_ID
Ore
Stockpile
Pile_ID
Batch/Rit
Sample
Status
Remark
```

---

## BR-REPORT-007 — Fixed Report Is the Acceptance Contract (Phase 18 confirmation)

Struktur report pada §16 (Header, Manpower, Production Summary/Pile
Summary, Sample Handling, Haulage Detail) adalah business acceptance
contract yang tidak boleh berubah bentuk tanpa konfirmasi ulang.

Aturan tambahan yang dikonfirmasi pada Phase 18:

```text
Kolom Manpower TIDAK menyertakan PIC (BR-MAN-003).

Location pada Manpower = Sector/Sampling_House_Code
contoh: BR1/SH_01

Internal shift code tetap DS/NS.
Report display:
DS → D
NS → N

WhatsApp report menyertakan Haulage Detail — bukan lagi
supplementary yang dihilangkan.
```

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-REPORT-008 — Pile Page Is the Dynamic Checker Equivalent (Phase 18 confirmation)

Setiap Pile aktif pada shift menjadi halaman operasional checker yang
setara dengan sheet Excel `Pile_01` .. `Pile_06` — bukan fitur terpisah
per pile, dan tanpa batas jumlah pile (lihat §25, `src/domain/pile/pile.ts`).

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

## BR-REPORT-009 — New Pile Written to Shared Master (Phase 18 confirmation)

Pile_ID baru yang dibuat melalui New Pile Master (§6 spesifikasi UX)
harus ditulis ke Google Sheet `Pile_Areas` yang dipakai bersama, bukan
hanya disimpan lokal pada shift yang membuatnya — supaya shift
berikutnya juga dapat menggunakannya. Karena ini mengubah master
bersama, operasi ini hanya diperbolehkan saat online.

**Post-inspection correction (§4/§5) — write-then-verify transport:**
Apps Script Web App tidak reliably bisa dibaca response body-nya untuk
sebuah POST (redirect `script.google.com` → `script.googleusercontent.com`
yang sama yang membuat GET master-data harus JSONP), dan
`Content-Type: application/json` memicu CORS preflight yang gagal
terhadap Web App yang di-deploy. Karena itu penulisan Pile baru
menggunakan POST CORS-simple (`mode: "no-cors"`,
`Content-Type: text/plain;charset=utf-8`) yang fire-and-forget, lalu
**diverifikasi** dengan membaca ulang master data lewat JSONP reader
yang sudah ada dan mencocokkan baris baru persis
(Sector_Code/Stockpile_Code/Pile_ID/Ore). Pile baru **tidak pernah**
diaktifkan/dipilih secara lokal sebelum verifikasi ini berhasil — lihat
`docs/GOOGLE_APPS_SCRIPT_CONTRACT.md` untuk detail transport dan kontrak
server yang dikonfirmasi.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 17. Current Report Naming Issue

Pada workbook sekarang terdapat header detail:

```text
Batch
```

tetapi contoh nilainya:

```text
024 / 011
```

yang sebenarnya merupakan composite:

```text
Batch / Rit
```

Aplikasi baru tidak boleh mempertahankan ambiguity ini pada domain model.

Gunakan:

```text
batch = 24
rit = 11
```

dan report boleh menampilkan:

```text
024 / 011
```

jika format tersebut memang diinginkan.

Classification:

```text
LEGACY_NAMING_ISSUE
```

---

# 18. Haulage ID

Current workbook membangun identification berbasis:

```text
Date / Shift | Front
```

Contoh konseptual:

```text
46211/D|BR1/01
```

Ini tidak cukup kuat untuk menjadi unique transaction ID pada aplikasi baru karena beberapa haulage dapat memiliki Front yang sama.

New application harus mempunyai unique:

```text
Transaction_ID
```

sedangkan current formatted value dapat tetap digunakan sebagai report/reference field jika diperlukan.

---

# 19. Report Language

Report harus mendukung:

```text
Bahasa Indonesia
English
```

Business data tetap sama.

Contoh internal:

```text
status = NOT_PICKED_UP
```

Indonesian report:

```text
Belum Diambil
```

English report:

```text
Not Picked Up
```

Report language tidak boleh mengubah database value.

---

# 20. WhatsApp Output Rules

WhatsApp report merupakan human-readable representation dari finalized/current report data.

Flow:

```text
Generate
→ Preview
→ Copy / Share
```

Operator harus dapat melihat report sebelum mengirim.

WhatsApp text bukan source of truth.

---

# 21. Excel Export Rules

Excel hasil aplikasi mempunyai dua fungsi:

```text
Archive
Handover
```

Human-readable sheet boleh bilingual.

Machine-readable sheets harus stable.

Contoh:

```text
Haulage_Detail
Sampling_Detail
Pending_Sample
App_Data
```

tidak bergantung pada bahasa UI.

---

# 22. Previous Shift Import Rules

Saat previous shift Excel di-upload:

```text
Validate
→ Read metadata
→ Read pending state
→ Read unfinished sample handling
→ Read relevant history
→ Initialize current shift
```

Previous file bersifat read-only.

---

## BR-IMPORT-001 — Import Does Not Copy Previous Transactions Into Current Shift

Previous haulage tetap merupakan transaksi previous shift.

Current shift hanya menerima:

```text
carry-over state
```

dan historical reference.

Ini penting untuk mencegah double counting.

---

## BR-IMPORT-002 — Carry-over Keeps Origin Reference

Pending entity sebaiknya menyimpan:

```text
source_shift_id
```

sehingga aplikasi mengetahui pekerjaan berasal dari shift mana.

---

# 23. Data Correction Rules

Current Excel memungkinkan user mengubah cell secara langsung.

PWA tidak boleh meniru behavior ini tanpa kontrol.

Untuk data operasional yang sudah tersimpan:

```text
Edit
```

sebaiknya menghasilkan audit information.

Minimal:

```text
UpdatedAt
UpdatedBy
```

Untuk correction penting:

```text
PreviousValue
NewValue
Reason
```

---

# 24. Business Status Codes

Recommended internal values:

```text
CONTINUE
HOLD

VALID
OVERLAP

SAMPLE
NO_SAMPLE

VALID_TRUCK
WRONG_TRUCK
UNKNOWN_TRUCK

SKIPPED_HAULAGE

NOT_PICKED_UP
DELIVERED

ACTIVE
FINALIZED
```

Final enum naming dapat berubah ketika data model dibuat.

Prinsipnya:

> Internal status tidak menggunakan localized UI text.

---

# 25. Rules That Should Not Be Migrated Literally

Beberapa mekanisme workbook merupakan Excel implementation detail:

```text
Pile_01
Pile_02
...
Pile_06
```

Tidak boleh diterjemahkan menjadi:

```text
six hard-coded pile modules
```

Gunakan:

```text
Pile[]
```

tanpa fixed maximum.

---

Dynamic arrays seperti:

```text
VSTACK
HSTACK
FILTER
REDUCE
MAP
SCAN
XLOOKUP
```

bukan business rules.

Mereka hanya teknik Excel untuk menghasilkan behavior.

PWA harus mengimplementasikan result bisnisnya secara langsung.

---

# 26. Rule Requiring Confirmation — "Complete"

Dalam output haulage workbook terdapat logic yang mencoba menghasilkan status:

```text
Complete
```

Namun formula current workbook membandingkan field yang tampak tidak sejenis dengan Batch Size.

Karena itu rule ini tidak boleh langsung dipindahkan.

Status `Complete` harus dikonfirmasi secara operasional.

Kemungkinan intended rule:

```text
A batch becomes COMPLETE
when Rit reaches configured Batch Size
```

contoh:

```text
SAP:
Rit 20 → batch complete

LIM:
Rit 100 → batch complete
```

Tetapi ini masih:

```text
NEEDS_CONFIRMATION
```

sampai owner process memastikan definisinya.

---

# 27. Rule Requiring Confirmation — Packing

Workbook memastikan hubungan matematis antara:

```text
Sampling Interval
Packing
Total Bag
```

Namun arti operasional exact dari `Packing` perlu ditulis secara eksplisit.

Pertanyaan bisnis yang perlu dijawab sebelum implementation:

```text
Apakah Packing berarti:
- jumlah rit per bag,
- jumlah increment per bag,
- rasio sample terhadap bag,
- atau rule lain?
```

Current behavior dapat direplikasi, tetapi meaning harus dikonfirmasi agar test case benar.

Status:

```text
NEEDS_CONFIRMIRMATION
```

---

# 28. Rule Requiring Confirmation — Correction vs Delete

Perlu diputuskan:

```text
Apakah haulage yang salah boleh dihapus?
```

Recommended architecture:

```text
Do not hard-delete finalized operational data.
```

Gunakan correction / void dengan audit trail.

Status:

```text
NEEDS_CONFIRMATION
```

---

# 29. Rule Requiring Confirmation — Wrong Truck Blocking Level

Current Excel mendeteksi Wrong Truck, tetapi transaksi tetap terlihat pada report.

Perlu dikonfirmasi apakah PWA harus:

```text
A. Warning only
B. Require confirmation
C. Completely block transaction
```

Recommended initial behavior:

```text
Warning + explicit confirmation + audit
```

karena report current workbook tetap menghitung Wrong Truck sebagai kejadian operasional.

Status:

```text
NEEDS_CONFIRMATION
```

---

# 30. Rule Requiring Confirmation — Start Without Previous File

Architecture mengizinkan:

```text
Start Without Previous Shift
```

Perlu ditentukan authority:

```text
all users
supervisor only
or require reason
```

Recommended:

```text
Allowed,
but require reason and record audit event.
```

Status:

```text
NEEDS_CONFIRMATION
```

---

# 31. Core Domain Flow

Business process target:

```text
Start Shift
    │
    ├── Import Previous Shift
    │       │
    │       └── Pending State
    │
    ├── Register Manpower
    │
    ├── Configure Fleet
    │
    └── Activate Piles
            │
            ▼
        Haulage Entry
            │
            ├── Determine Batch
            ├── Determine Rit
            ├── Determine Sample
            ├── Validate Front
            ├── Validate Truck
            └── Detect Skipped
                    │
                    ▼
             Sampling Events
                    │
                    ▼
             Sample Position
                    │
                    ├── Validate Range
                    ├── Detect Overlap
                    ├── Dispatcher
                    └── Delivery
                            │
                            ▼
                         Report
                            │
              ┌─────────────┼────────────┐
              ▼             ▼            ▼
          WhatsApp        Excel      Shift Summary
```

---

# 32. Minimum Domain Entities

Initial entities:

```text
Shift

Employee

Truck
Hauler
Front
Fleet
FleetTruck

Pile
PendingBatch

HaulageTransaction

SamplingEvent

SampleHandling

ShiftReport
```

Possible relationships:

```text
Shift
 ├── Manpower[]
 ├── Fleet[]
 ├── Pile[]
 │    ├── PendingBatch[]
 │    └── HaulageTransaction[]
 │          └── SamplingEvent?
 │
 └── SampleHandling[]
```

---

# 33. Required Business Logic Tests

Sebelum UI dianggap selesai, minimum tests harus mencakup:

### SAP Normal Batch

```text
Batch size = 20
Interval = 2

Expected:
Rit 1 → NO
Rit 2 → YES
...
Rit 20 → YES
```

---

### LIM Normal Batch

```text
Batch size = 100
Interval = 5

Expected:
Rit 5 → YES
Rit 10 → YES
...
Rit 100 → YES
```

---

### Pending SAP

```text
Previous:
Batch 24
Rit 10

Expected current:
24/11
...
24/20
25/01
```

---

### Multiple Pending Batches

```text
24/10
25/03
31/18
32/14
```

Expected order:

```text
24 → complete
25 → complete
31 → complete
32 → complete
33 → new batch
```

---

### Wrong Truck

```text
Truck not in Effective Fleet

Expected:
transaction retained
WRONG_TRUCK flag created
report count +1
```

---

### Skipped

```text
Rit N missing
Rit N+1 later recorded

Expected:
N = SKIPPED_HAULAGE
```

---

### Sample Overlap

```text
Same Pile
Same Batch

Range A overlaps Range B

Expected:
OVERLAP
```

---

### Previous Shift Import

```text
Previous transactions:
must not count as current transactions.

Pending state:
must initialize current work.
```

---

### Duplicate Import

```text
Same Shift_ID imported twice

Expected:
no duplicate carry-over data.
```

---

# 34. Supervisory Development Rule

Claude Code must not implement a business rule simply because a complex Excel formula exists.

Required process:

```text
Excel Formula
    ↓
Identify Intent
    ↓
Map to BUSINESS_RULES.md
    ↓
Implement Domain Function
    ↓
Unit Test
    ↓
Connect to UI
```

If a formula cannot be mapped to an existing Business Rule:

```text
STOP
```

and document it before implementing.

---

# 35. Source of Truth Priority

During migration, conflict resolution priority:

```text
1. Confirmed operational requirement
2. BUSINESS_RULES.md
3. ARCHITECTURE.md
4. Observed workbook behavior
5. Excel formula implementation
```

Workbook behavior must not override a confirmed business requirement.

---

# 36. Current Confirmed Core Rules

The rules currently considered sufficiently understood are:

```text
Pile → Ore mapping

Ore → Sampling Interval / Batch / Packing

Pending CONT vs HOLD

Multiple pending batches per pile

Pending batch continuity

Automatic Batch/Rit progression

Automatic sampling based on Rit interval

Front/Fleet relationship

Fleet inheritance

Truck validation

Wrong Truck detection

Skipped haulage detection

Undelivered sample detection

Sample range generation

Sample overlap validation

Sample handling aggregation

Production summary

Excel archive handover

Bilingual presentation with language-neutral data

Staff (Employee) source → always PIC; Crew source → never PIC (§1)

Canonical new Pile_ID → Sector/Stockpile/Ore derivation (§3, BR-MASTER-004)

Fresh pile initial Batch/Rit default 001/001 with pre-first-DT override (§37)
```

Items still requiring explicit operational confirmation:

```text
Exact definition of Batch COMPLETE

Exact operational meaning of Packing

Wrong Truck blocking behavior

Correction / delete policy

Authorization for Start Without Previous Shift
```

---

# 37. Fresh Pile Initial Batch (post-inspection correction — CONFIRMED)

Ketika sebuah Pile aktif pada shift ini sama sekali tidak mempunyai
riwayat pending batch dari handover (bukan carry-over, dan belum pernah
ada haulage sebelumnya pada Pile tersebut), rule ini sebelumnya
`NEEDS_CONFIRMATION` — process owner sekarang mengonfirmasi:

```text
Batch Awal default = 001
Rit Awal default   = 001
```

tetapi operator/supervisor tetap mempunyai fleksibilitas untuk mengubah
posisi awal tersebut **sebelum haulage pertama disimpan**. Contoh:

```text
default:            001 / 001
supervisor override: 025 / 001
                      025 / 011
```

Setelah haulage pertama pada Pile tersebut disimpan, posisi awal
**terkunci** — tidak boleh di-reseed sembarangan. Progres selanjutnya
sepenuhnya mengikuti batch/haulage engine yang sudah ada (rollover,
sampling interval, dst — tidak ada rule baru).

Domain concept: `FreshPileStartPosition`
(`src/domain/pile/fresh-pile-start-position.ts`), factory default
`createDefaultFreshPileStartPosition()`, validasi memakai ulang
`BatchNumber`/`RitNumber` (tidak ada range rule baru). Persisted sebagai
field opsional pada `Pile.freshPileStartPosition`
(`src/domain/pile/pile.ts`) — field tambahan pada shape yang sudah ada,
bukan tabel/index Dexie baru, sehingga workspace lama tanpa field ini
tetap terbaca. Lock-setelah-haulage-pertama ditegakkan oleh
`confirmFreshPileStartPosition`
(`src/application/pile-workspace/confirm-fresh-pile-start-position.ts`),
bukan hanya disembunyikan di UI.

`derivePileHaulagePlan` (`src/application/haulage-operation/derive-pile-haulage-plan.ts`)
memakai `freshPileStartPosition` — jika tersedia dan Pile tidak punya
CONTINUE carry-over aktif — untuk membangun plan lewat
`remainingPositionsFromStart` (`src/domain/batch/batch-engine.ts`), bukan
`planContinuations([], ...)` yang tetap menghasilkan rencana kosong
untuk Pile yang benar-benar belum dikonfirmasi. `HAULAGE_PLAN_EMPTY`
karenanya tidak lagi menjadi blocking permanen untuk Pile baru yang
genuinely fresh — begitu default tersedia, layar checker Pile
menampilkan form "Initial Position" (Batch Awal/Rit Awal) alih-alih
pesan "hubungi supervisor" permanen.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 38. Active-Shift Fleet Continuation (CONFIRMED)

Fleet Setup tidak lagi write-once. Selama shift ACTIVE, checker/supervisor
dapat membuka loading point baru kapan pun titik muat berpindah, tanpa
mengulang shift.

## Front lineage

```text
BR1/01 -> BR1/04 -> BR1/07
```

Setiap Front memiliki paling banyak satu direct successor. Rantai selalu
linear — tidak pernah bercabang:

```text
BR1/01 -> BR1/04
        -> BR1/05   (INVALID — dua successor untuk satu predecessor)
```

Fleet Reference (`FleetDefinition.kind === 'DERIVED'`, lihat §9) pada
konteks ini ADALAH mekanisme continuation: Front baru mewarisi Hauler dan
effective truck membership Front sebelumnya lewat referensi Fleet, lalu
operator boleh Add/Remove truck di atasnya (§9 note BR-FLEET-004/005 tidak
berubah — tidak ada mekanisme fleet math baru).

ACTIVE vs HISTORICAL **tidak disimpan sebagai field terpisah** — keduanya
diturunkan murni dari graph Fleet Reference:

```text
Front yang direferensikan oleh satu successor -> HISTORICAL
Front yang tidak direferensikan siapa pun      -> ACTIVE
```

Domain: `deriveFrontLineage` (`src/domain/fleet/front-lineage.ts`).
Branching (>1 successor untuk satu predecessor) ditolak oleh
`createFleetSetup` sendiri dengan `FLEET_REFERENCE_BRANCHING`
(`src/domain/fleet/fleet-setup.ts`) — invariant ini berlaku untuk seluruh
FleetSetup, bukan hanya saat membuat continuation baru.

Historical transactions **tidak pernah** direvalidasi ulang. Haulage lama
tetap menunjuk `Front_ID`/`Fleet_ID` yang sama persis seperti saat
disimpan (lihat §16/§23 — HaulageTransaction adalah snapshot immutable).

## Nomor Front baru

Front No berikutnya = MAX nomor Front existing pada Sector shift ini + 1,
**bukan** gap pertama yang tersedia — Front No merepresentasikan urutan
kronologis operasional. Maksimum tetap 25; begitu 25 sudah dipakai,
`FRONT_NUMBER_LIMIT_REACHED`. Domain: `nextFrontNumber`
(`src/domain/fleet/front.ts`).

## Destination boleh berubah saat continuation

Front baru boleh mengganti Destination/Pile dari Front acuannya (dumping
area penuh, dsb). Saat Destination berubah:

```text
Pile lama    -> riwayat/pending state TIDAK dipindahkan, tetap seperti semula
Pile baru    -> jadi operational untuk Front successor
```

Jika Pile tujuan sudah ada di master tapi belum aktif di workspace shift
ini, Pile tersebut diaktifkan (bukan dibuat baru). Jika benar-benar
Pile_ID baru, alur New Pile Master yang sudah ada (Apps Script write +
JSONP verification) tetap dipakai — tidak ada mekanisme baru.

## Single-successor enforcement pada continuation

Sebelum menyimpan continuation, jika Front acuan sudah punya successor:

```text
FRONT_ALREADY_SUPERSEDED
```

Application layer: `appendFrontContinuation`
(`src/application/fleet-setup/append-front-continuation.ts`) — melakukan
seluruh validasi lewat `createFleetSetup`/`resolveEffectiveFleetAgainstMaster`
yang sudah ada (§9), tidak menduplikasi fleet math di layer manapun.

## Persistence

Write atomik baru: `LocalOperationalStore.appendFrontContinuation`
(`src/infrastructure/local-db/local-operational-store.ts`) — mengganti
`fleetSetup` yang tersimpan dan, bila perlu, mengaktifkan satu Pile baru
ke `piles`, dalam satu transaksi Dexie. Tidak ada Dexie schema version
bump — `fleetSetup`/`piles` adalah field yang sudah ada pada
`ShiftWorkspaceRecord`. `haulageTransactions` tidak pernah disentuh oleh
write ini.

## Pile checker Front options

Untuk Pile yang sedang dibuka, opsi Front pada layar haulage checker
adalah Front ACTIVE **dan** `destinationPileId`-nya cocok dengan Pile
tersebut (Front tanpa Destination terkonfigurasi tetap tersedia untuk
semua Pile — kompatibilitas mundur). Historical Front tidak pernah
muncul. Domain/application: `operationalFleetOptionsForPile`
(`src/application/haulage-operation/operational-fleet-options.ts`).

**Phase 18 final correction (§5):** Front tidak lagi dipilih di layar
checker itu sendiri — operator memilih Front di layar Pile List (lihat
§39 di bawah), dan checker hanya menerima satu Front yang sudah
divalidasi lewat `operationalFleetOptionForFront` (fungsi baru di file
yang sama, membungkus `operationalFleetOptionsForPile`). Aturan
kelayakan Front (ACTIVE + Destination cocok) tidak berubah — hanya titik
di mana validasi itu dijalankan yang berpindah dari dropdown checker ke
resolusi route `/piles/:pileId?front=...`.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```

---

# 39. Final MVP UX/Operational Correction (Phase 18 closing, CONFIRMED)

Kumpulan koreksi terakhir sebelum Phase 18 ditutup, semuanya UX/wiring —
tidak ada business rule baru yang bertentangan dengan §9/§29/§36-§38 di
atas; setiap koreksi di bawah hanya membuat implementasi lebih konsisten
dengan rule yang sudah dikonfirmasi.

## Front Number disembunyikan begitu terpakai (initial Fleet Setup)

Selama initial Fleet Setup (satu sesi entri sebelum shift ACTIVE),
selector Front No (§9/BR-FLEET-001, 1–25) tidak lagi menampilkan nomor
yang sudah dipakai oleh Front lain pada draft yang sama — mencegah
operator memilih nomor yang pasti akan gagal validasi
`DUPLICATE_FRONT_ID` (§9, `fleet-setup.ts`) setelah disimpan. Validasi
domain itu sendiri **tetap ada** sebagai defense-in-depth, bukan
dihapus. Implementasi: `src/features/fleet-setup/front-editor.tsx`.

## Fleet Reference "Tidak Ada" saat shift ACTIVE = Front BASE independen baru

§38 (Active-Shift Fleet Continuation) hanya mencakup mode continuation
(Fleet Reference = Front ACTIVE, mewarisi Hauler/Destination/effective
truck). Selama shift ACTIVE, "+ Tambah Front" sekarang juga mendukung
mode kedua: Fleet Reference = **Tidak Ada**, yang membangun Front BASE
independen baru — versi ringkas dari initial Fleet Setup, bukan model
fleet kedua:

```text
operator memilih Hauler sendiri
operator memilih Destination/Pile sendiri (wajib — tidak ada acuan untuk mewarisi)
operator menambah truck dari Hauler yang dipilih (bukan truck warisan)
tidak ada Front acuan yang menjadi HISTORICAL
```

Application layer: `appendNewBaseFront`
(`src/application/fleet-setup/append-new-base-front.ts`) — reuse
`createBaseFleetDefinition`/`createFleetSetup`/
`resolveEffectiveFleetAgainstMaster` yang sama seperti
`appendFrontContinuation` dan initial Fleet Setup's BASE branch, dengan
nomor Front baru diturunkan lewat rule yang sama
(`nextFrontNumber`/`frontNumberFromFrontId`, §38). UI:
`src/features/fleet/front-continuation-editor.tsx` (satu editor, dua
mode, diturunkan dari pilihan Fleet Reference — bukan dua layar
terpisah). "+ Tambah Front" tidak lagi disabled saat belum ada Front
ACTIVE sama sekali (mode BASE tidak membutuhkan satu pun).

## Pile List menampilkan Front ACTIVE per Destination, dan memilih Front di sana

Pile List (`src/features/piles/piles-list-page.tsx`) menampilkan, untuk
setiap Pile aktif pada workspace, seluruh Front ACTIVE
(`deriveFrontLineage`, §38) yang `destinationPileId`-nya adalah Pile
tersebut, sebagai chip yang dapat ditekan. Front HISTORICAL tidak pernah
muncul. Operator memilih Front di layar ini — bukan di dalam checker
(lihat §29/BR-TRUCK-003 di atas dan bagian "Pile checker Front options"
pada §38) — dan navigasi membawa **kedua** id secara eksplisit lewat
route query:

```text
/piles/:pileId?front=<FrontId>
```

Bukan mutable global UI state. Satu Front aktif untuk satu Pile berarti
satu chip — tetap satu tekan untuk masuk checker; lebih dari satu Front
berarti operator memilih salah satu chip terlebih dahulu. Pile tanpa
Front ACTIVE menampilkan catatan kosong, bukan chip kosong yang bisa
ditekan.

`PileDetailPage` (`src/features/piles/PileDetailPage.tsx`) memvalidasi
`front` dari query lewat `operationalFleetOptionForFront` (ada/ACTIVE/
Destination cocok — lihat "Pile checker Front options" di atas). Route
context yang hilang atau basi menampilkan pesan error yang stabil dan
sudah diterjemahkan, dengan aksi kembali ke Pile List — tidak pernah
menebak Front lain secara diam-diam.

## Checker tidak lagi bertanya Front — hanya Truck

Begitu Pile + Front diketahui dari route, `PileHaulagePage`
(`src/features/piles/pile-haulage-page.tsx`) menampilkan keduanya
sebagai konteks read-only (lihat `PileOperationalHeader`) dan input
operasional hanya tersisa Truck. Tidak ada logika validasi di React —
`operationalFleetOptionForFront` (application layer) tetap satu-satunya
tempat aturan kelayakan Front dijalankan.

## Riwayat posisi: TERSAMPEL vs TERCATAT

Riwayat posisi haulage yang tersimpan (`RecordedHaulageList`) menampilkan
label **TERSAMPEL** untuk posisi yang transaksinya punya
`samplingEvaluation.sampleRequired = true`, dan tetap **TERCATAT** untuk
posisi non-sample. Ini murni presentasi — sumbernya adalah hasil
transaksi/sample yang sudah ada (§4/Phase 4 sampling engine), bukan
status baru yang bisa diedit manual.

## Compact sample count pada ringkasan atas layar Pile Operation

Ringkasan atas (sebelumnya hanya Batch + Rit Berikutnya) bertambah satu
kolom compact "SAMPEL" berisi jumlah increment sample yang sudah tercatat
pada batch aktif saat ini dibanding maksimum increment sample batch itu
(`floor(BatchSize / SamplingInterval)`, mis. SAP 20/2 = 10). Domain:
`maxSampleIncrementsForBatch` (`src/domain/sampling/sampling-engine.ts`).
Application: `deriveCurrentBatchSampleCount`
(`src/application/haulage-operation/current-batch-sample-count.ts`) —
menghitung posisi distinct (bukan transaksi) sehingga transaksi
wrong-truck yang dicatat ulang pada Rit yang sama tidak terhitung dua
kali. Tidak ada card baru — terintegrasi ke `PileOperationalHeader` yang
sudah ada.

## Report page: satu preview operasional, bukan dua

Layar Report (`src/features/report/ReportPage.tsx`) hanya menampilkan
satu preview laporan operasional — `WhatsAppReportPreview` (format tetap
sesuai §19/§20, dengan aksi Copy/Share yang tidak berubah). Tampilan
`ReportSections` (tabel terstruktur duplikat dari laporan yang sama)
sudah dihapus sepenuhnya, bukan disembunyikan — file
`src/features/report/report-sections.tsx` dan test-nya tidak lagi ada.
Excel export (§21) tidak berubah.

Classification:

```text
CONFIRMED_BUSINESS_RULE
```
