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
```

Items still requiring explicit operational confirmation:

```text
Exact definition of Batch COMPLETE

Exact operational meaning of Packing

Wrong Truck blocking behavior

Correction / delete policy

Authorization for Start Without Previous Shift
```