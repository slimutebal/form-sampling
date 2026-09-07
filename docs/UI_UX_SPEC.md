# Form Sampling — UI/UX Specification

**Status:** Draft v0.1  
**Project:** Form Sampling  
**Target:** Mobile PWA  
**Primary Devices:** Android phones and iPhones  
**Related Documents:**
- `docs/ARCHITECTURE.md`
- `docs/BUSINESS_RULES.md`
- `docs/ROADMAP.md`
- `docs/Form_Sampling.xlsx`

---

# 1. Purpose

Dokumen ini mendefinisikan prinsip, struktur layar, interaction pattern, dan UX requirement aplikasi Form Sampling.

Target utama adalah operator lapangan yang menggunakan smartphone dalam kondisi operasional nyata.

UI tidak boleh meniru struktur workbook Excel.

Workbook digunakan sebagai referensi business process, bukan reference visual design.

---

# 2. Primary UX Goal

Aplikasi harus memungkinkan operator menyelesaikan pekerjaan sampling dengan:

```text
Minimum typing
Minimum taps
Minimum navigation
Maximum context visibility
Immediate validation
Reliable offline operation
```

Operator harus selalu mengetahui:

```text
Shift apa yang aktif
Pile apa yang sedang aktif
Batch berapa
Rit berapa
Apakah rit berikutnya sample
Truck apa yang dipilih
Apakah data sudah tersimpan
Apakah aplikasi online/offline
```

---

# 3. Target Platform

Primary target:

```text
Android Smartphone
iPhone
```

Application type:

```text
Mobile-first Progressive Web App
```

Tablet dan desktop dapat didukung secara responsive, tetapi bukan primary UX target untuk versi pertama.

---

# 4. Target Orientation

Primary orientation:

```text
Portrait
```

Seluruh critical workflow harus dapat digunakan dalam portrait mode.

Landscape boleh digunakan, tetapi tidak boleh menjadi requirement.

---

# 5. Screen Size Strategy

Desain harus bekerja pada smartphone kecil hingga besar.

Reference design width:

```text
360–430 CSS px
```

UI tidak boleh didesain hanya untuk satu model perangkat.

Minimum supported viewport target:

```text
320px width
```

Tidak boleh ada horizontal scrolling pada workflow utama.

Exception dapat diberikan untuk:

```text
advanced report table
diagnostic view
```

tetapi bukan operational input.

---

# 6. Safe Area

Application harus memperhitungkan area sistem pada Android dan iOS.

Termasuk:

```text
Notch
Dynamic Island
Status bar
Home indicator
Browser/PWA navigation area
```

Critical button tidak boleh menempel pada bagian bawah physical screen tanpa safe-area spacing.

---

# 7. Touch Target

Minimum recommended interactive target:

```text
44 × 44 CSS px
```

Untuk primary field action:

```text
48–56px height
```

Examples:

```text
RECORD HAULAGE
CONFIRM DELIVERY
FINALIZE SHIFT
```

harus mudah ditekan dengan satu tangan.

---

# 8. One-Handed Operation

Primary controls ditempatkan pada area yang mudah dijangkau ibu jari.

Prioritas:

```text
middle screen
bottom screen
```

Critical primary actions tidak ditempatkan kecil di pojok atas.

---

# 9. Visual Hierarchy

Prioritas visual pada operational screen:

```text
1. Pile
2. Next Rit
3. Sampling Status
4. Batch Progress
5. Truck
6. Front
7. Primary Action
8. Secondary information
```

Nomor Batch/Rit dan sampling requirement harus terlihat jelas tanpa membaca tabel.

---

# 10. Color Usage

Warna hanya menjadi bantuan visual.

Meaning tidak boleh disampaikan hanya melalui warna.

Contoh salah:

```text
red background
```

tanpa text.

Contoh benar:

```text
⚠ WRONG TRUCK
```

dengan visual emphasis.

Status harus selalu mempunyai:

```text
icon + text
```

atau minimal text.

---

# 11. Recommended Status Semantics

Possible UI semantic categories:

```text
Normal
Information
Success
Warning
Critical
Disabled
```

Exact visual palette ditentukan ketika design system dibuat.

Business logic tidak boleh mengetahui warna.

---

# 12. Typography

Typography harus memprioritaskan readability di lapangan.

Recommended hierarchy:

```text
Screen Title          20–24px
Primary Operational   24–36px
Section Heading       16–18px
Normal Text           14–16px
Secondary Text        12–14px
```

Critical values seperti:

```text
Rit 16
Batch 24
SAMPLE
```

dapat menggunakan ukuran yang lebih besar.

Font decorative tidak digunakan.

Gunakan system-friendly sans-serif.

---

# 13. Navigation Model

Primary bottom navigation:

```text
Home
Piles
Samples
Report
More
```

Maximum primary navigation:

```text
5 items
```

Bottom navigation persistent selama shift aktif kecuali pada blocking modal / focused confirmation flow.

---

# 14. Navigation Structure

```text
APP
│
├── Start / Resume
│
├── Handover
│
└── Active Shift
    │
    ├── Home (+ Language, Master Data refresh, App version)
    │
    ├── Fleet
    │   ├── Active Fronts (+ Add Front / continuation)
    │   └── Front History (read-only)
    │
    ├── Piles
    │   ├── Pile List
    │   └── Pile Operation
    │
    ├── Samples
    │   ├── Pending
    │   ├── Delivered
    │   └── Handle Sample
    │
    └── Report
        ├── Shift Summary
        ├── WhatsApp Preview
        ├── Excel Export
        └── Finalization
```

**Phase 18 amendment:** Manpower Setup is a real Start Shift step
(Registration → Handover → Manpower → Fleet Setup → Home), not only a
read-only view under More.

**Active-shift Fleet management amendment (CONFIRMED):** the bottom nav's
final five items are Beranda / Fleet / Pile / Sample / Laporan
— **More is removed**. (Mobile hardening pass, pre-v1.0.0: the Samples
label was further shortened from "Penanganan Sampel"/"Sample Handling" to
"Sample" in both languages so it reliably fits one line at 360px width —
see §107. The Samples screen's own heading is unaffected.) Fleet Setup is no longer a one-time, write-once
step: it gets its own top-level `/fleet` destination because moving a
loading point mid-shift is a critical operational workflow, not a
secondary setting (§57 already said "critical operational workflow tidak
disembunyikan di More" — the old read-only Fleet summary living only in
More was itself the violation this amendment fixes). More's remaining
useful actions (Language, Master Data refresh, App version) moved into
Home as secondary controls below the primary dashboard/quick actions; the
Sync Status card was dropped entirely there — it duplicated what
`GlobalStatusBar` (rendered above every active-shift page, not just Home)
already shows. Pile doubles as both the active-pile list and, per pile,
the operational checker page (see §58/§59 for the Fleet Setup fields this
step now exposes, §24 for Manpower Setup's confirmed UX, and §105 for the
active-shift Fleet page itself).

---

# 15. Global Shift Context

Selama shift aktif, aplikasi harus menampilkan compact shift context.

Example:

```text
03 Sep 2026 • Day Shift
BR1 • Sampling House 1

Offline • 3 Unsynced
```

Context dapat berada pada app header atau dashboard header.

User tidak perlu membuka settings untuk mengetahui current shift.

---

# 16. Connectivity Indicator

Status connectivity harus terlihat namun tidak mengganggu.

Minimum state:

```text
ONLINE
OFFLINE
SYNC_PENDING
SYNC_FAILED
```

Contoh:

```text
Offline
```

atau:

```text
3 changes pending sync
```

Local save success tidak boleh bergantung pada status internet.

---

# 17. Application Entry

Jika tidak ada active shift:

```text
FORM SAMPLING

No active shift

[ START SHIFT ]

Recent Shift
03 Sep 2026 • Day Shift
Completed
```

Jika terdapat active shift:

```text
FORM SAMPLING

Active Shift
03 Sep 2026 • Day Shift
BR1

[ RESUME SHIFT ]
```

Operator tidak boleh secara tidak sengaja membuat shift baru ketika active shift belum selesai.

---

# 18. Start Shift Flow

Recommended flow:

```text
Start Shift
   ↓
Previous Shift Handover
   ↓
Current Shift Setup
   ↓
Manpower
   ↓
Review
   ↓
Start
```

Step count harus dijaga minimum.

---

# 19. Previous Shift Screen

Initial screen:

```text
PREVIOUS SHIFT

Import previous shift archive
to continue pending work.

[ SELECT EXCEL FILE ]

or

[ START WITHOUT PREVIOUS FILE ]
```

Start Without Previous File bukan primary visual action.

---

# 20. Import Progress

Setelah file dipilih:

```text
CHECKING FILE

✓ File recognized
✓ Shift metadata valid
✓ Schema supported
✓ Data integrity valid

Reading pending work...
```

User tidak perlu melihat technical details kecuali terjadi error.

---

# 21. Handover Summary

Setelah import:

```text
HANDOVER

Previous Shift
03 Sep 2026 • Day Shift

Pending Piles
3

Pending Samples
5
```

Pile cards:

```text
L18_S09
SAP

Batch 24
Last Rit 10
Next Rit 11

CONTINUE
```

Jika multiple pending batch:

```text
L18_S09
SAP

4 Pending Batches

24 → 11–20
25 → 04–20
31 → 19–20
32 → 15–20

[ VIEW DETAILS ]
```

Operator tidak perlu memahami formula yang menghasilkan urutan ini.

---

# 22. Handover Warning

Jika previous shift archive tidak sesuai:

```text
⚠ SHIFT MISMATCH

Imported:
01 Sep 2026 • Night Shift

Expected:
03 Sep 2026 • Day Shift

This file may not be the previous shift.
```

Actions:

```text
[ CHOOSE ANOTHER FILE ]
[ CONTINUE WITH REASON ]
```

Second action hanya ditampilkan jika business policy mengizinkan.

---

# 23. Current Shift Setup

Fields:

```text
Date
Shift
Sector
Sampling Location
```

Defaults dapat diberikan berdasarkan context.

Example:

```text
Date
03 Sep 2026

Shift
[ Night Shift ▼ ]

Sector
[ BR1 ▼ ]

Sampling House
[ House 1 ▼ ]
```

Free-text harus diminimalkan.

---

# 24. Manpower Setup

User memilih personel melalui searchable selector.

Example:

```text
MANPOWER

Sampling Officer
[ Search name / NIK ]

Sampler
[ + Add Sampler ]

Dispatcher
[ + Add Dispatcher ]
```

Selected person:

```text
12345
John Doe
Sampler
```

Name tidak diketik manual jika master tersedia.

**Phase 18 confirmed implementation, corrected post-inspection §1**
(`src/features/manpower/manpower-setup-page.tsx`): one search box against
both the Employee and Crew master, a selected-personnel list where each
row has an editable Job Desk field, and a "+ Tambah Personel" flow.
There is **no PIC checkbox** — Penanggung Jawab / PIC is derived
automatically from which master the person resolved against
(Employee/Staff → always PIC; Crew → never PIC), never a manual toggle.
A Staff row shows a read-only "Penanggung Jawab" label; a Crew row shows
none. Example:

```text
SCM0333
Raharjo Rahman
Penanggung Jawab
```

Multiple Staff rows may be added at once, all automatically PIC — this
is intentional, not a bug to constrain to one. Job Desk prefills from the
Crew master's `jobCode` when known; a Crew with a blank master job still
requires the operator to type one. A Staff/Employee Job Desk may remain
blank — the Employee master has no exact Job field, so the app never
invents whether a Staff member is e.g. SPV or Foreman. Continuing with
zero personnel selected is allowed (Manpower is not mandatory to start a
shift).

---

# 25. Start Shift Review

Sebelum mulai:

```text
READY TO START

03 Sep 2026
Night Shift
BR1
Sampling House 1

Previous Shift
Imported

Pending Piles
3

Manpower
5 people

[ START SHIFT ]
```

---

# 26. Home Dashboard

Dashboard harus memberikan current operational state dalam beberapa detik.

Example:

```text
NIGHT SHIFT
03 Sep 2026

BR1
Sampling House 1

Active Piles        4
Total Rit         182
Samples             31
Pending Samples      4

⚠ Wrong Truck        2

[ OPEN ACTIVE PILE ]
```

---

# 27. Dashboard Priority

Dashboard bukan tempat menampilkan semua detail.

Prioritas hanya:

```text
Current shift
Current activity
Exception
Pending work
Fast navigation
```

Historical charts bukan prioritas v1.

---

# 28. Pile List Screen

Display active pile sebagai card, bukan spreadsheet table.

Example:

```text
ACTIVE PILES

L18_S09
SAP
Batch 24 • Rit 16/20
Next: Rit 17
[ OPEN ]

L18_S12
LIM
Batch 07 • Rit 65/100
Next Sample: Rit 70
[ OPEN ]
```

---

# 29. Pile Card Information

Minimum:

```text
Pile ID
Ore
Current Batch
Current Rit
Batch Progress
Next Sample
Pile Status
```

Possible status:

```text
ACTIVE
HOLD
COMPLETE
PENDING
```

**Phase 18 final correction (§3/§4) — active Fronts shown per Pile, Front
chosen here:** the confirmed implementation
(`src/features/piles/piles-list-page.tsx`) keeps the card compact —
Pile_ID + Ore only, no Batch/Rit/Progress column on this list — but adds
every ACTIVE Front whose Destination is that Pile as a small tappable
chip underneath, so the operator picks the Front *here*, not inside the
checker:

```text
BR-C4_S06                         SAP
[BR1/03]  [BR1/05]

L9_27                              LIM
[BR1/04]
```

Each chip is a link carrying both ids explicitly in the route —
`/piles/:pileId?front=<FrontId>` — never a mutable global "current
Front" variable. A Pile with exactly one active Front still shows one
chip (one tap into the checker); a Pile with no active Front shows a
muted "Tidak ada Front aktif" note instead of a chip. HISTORICAL Fronts
(BUSINESS_RULES.md §38) never appear. Front grouping:
`deriveFrontLineage` (`src/domain/fleet/front-lineage.ts`), never
recomputed ad hoc in this component.

---

# 30. Add Pile

Action:

```text
[ + ADD PILE ]
```

Flow:

```text
Select Pile ID
      ↓
Ore automatically determined
      ↓
Check existing/pending state
      ↓
Activate
```

Do not ask operator to enter Ore manually.

**Phase 18 amendment — New Pile Master, corrected post-inspection §2/§3:**
when a searched Pile_ID matches no existing master row, the search offers
"+ Tambah Pile Baru 'L18_S99'" (the searched query) instead of
dead-ending. The New Pile form (`src/features/pile-master/new-pile-form.tsx`)
takes only the Pile ID (from the query) — Sector, Stockpile, and Ore are
all **read-only, system-derived** from the Pile ID's confirmed canonical
naming grammar (BR-MASTER-004), never a free-text Stockpile field or an
Ore dropdown:

```text
Pile ID
[ DS-C4_L06 ]

Sector      DS
Stockpile   DS-C_04
Ore         LIM

[ TAMBAH PILE ]
```

If the searched Pile_ID does not match a confirmed canonical family, the
form shows a stable validation message (`PILE_ID_PATTERN_NOT_SUPPORTED`)
instead of falling back to manual Stockpile/Ore selection — the operator
can still select an existing exact master Pile, just not invent a new
naming pattern. Because creation writes to the shared Google `Pile_Areas`
master (`docs/GOOGLE_APPS_SCRIPT_CONTRACT.md`), submission is blocked
outright while offline, with an explicit message — never a
silently-disabled button. The Pile is only activated locally after the
remote write is **verified** (write-then-verify via the existing JSONP
master-data reader — see the contract doc), never merely sent. Existing
cached piles and in-progress operational work remain usable offline
regardless.

This same New Pile Master creation is also available one step earlier,
directly from Fleet Setup's Destination/Pile field (§58) — see that
section for the pre-workspace mechanism.

---

# 31. Pile Operation Screen

Ini adalah critical operational screen.

Example normal rit:

```text
L18_S09
SAP

BATCH
24

NEXT RIT
15 / 20

NO SAMPLE

70% Batch Progress

Front
BR1/01

Truck
[ DT-2045 ▼ ]

[ RECORD HAULAGE ]
```

**Post-inspection correction §6 — fresh Pile Initial Position:** the
previous permanent blocking message ("Batch awal untuk pile baru ini
belum dikonfirmasi…") is now confirmed and replaced with an editable
form for a genuinely fresh Pile (no handover carry-over, no prior
haulage):

```text
INITIAL POSITION

Batch Awal
[ 001 ]

Rit Awal
[ 001 ]

[ CONFIRM ]
```

Both fields are prefilled with the confirmed default (Batch 001 / Rit
001) but freely editable — a supervisor may override to e.g. 025/001 or
025/011 before the first haulage. After confirmation, the normal Pile
Operation screen renders using that exact confirmed position:

```text
PILE DS-C4_L06

Batch aktif / Rit berikutnya
001 / 001

Front
[...]

Truck
[...]

Sample
AUTO

[ SIMPAN DT ]
```

A "Ubah Posisi Awal" (Change Starting Position) secondary action remains
available on this same screen for as long as no haulage has been
recorded yet for this Pile — reopening the Initial Position form,
prefilled with the current confirmed value. Once the first haulage
transaction is saved, this action disappears entirely: the starting
position is locked, and all subsequent progression comes from the
existing batch/haulage engine (no new calculation rule). A Pile with
real handover/continuation carry-over never shows this Initial Position
form at all.

**Phase 18 final correction (§5/§6/§8) — Front is read-only context, no
dropdown; compact Sample count; searchable Truck checker:** the Front is
already known once the operator reaches this screen (chosen on the Pile
List, §29) — it is never asked again here. The confirmed layout
(`src/features/piles/pile-operational-header.tsx`,
`src/features/piles/haulage-entry-form.tsx`):

```text
PILE
BR-C4_S06

FRONT
BR1/03

BATCH        RIT BERIKUTNYA       SAMPEL
1            4 / 20               1 / 10

Truck
[ search or tap: STM-A40_0012 ]

[ CATAT HAULAGE ]
```

Truck is a search-then-select field (`SearchableCombobox`, §60), not a
plain dropdown as the earlier example above still shows: the Front's
effective-fleet Trucks are offered first as one-tap chips, and searching
reaches every other known master Truck. Selecting a Truck outside the
effective fleet is allowed — it is never refused — and the resulting
transaction is simply classified `WRONG_TRUCK` by the domain
(BUSINESS_RULES.md §BR-TRUCK-003, and see §38 below). If the route's
Front context is missing or stale (e.g. it was superseded by a
continuation, §38, since the operator last had this Pile open), the
screen shows a stable translated error and a way back to the Pile List
— it never falls back to guessing another Front.

---

# 32. Sample Required State

Jika next rit adalah sampling point:

```text
L18_S09
SAP

BATCH
24

NEXT RIT
16 / 20

SAMPLE REQUIRED
Increment 08

Front
BR1/01

Truck
DT-2045

[ RECORD SAMPLE HAULAGE ]
```

Sample state harus visually prominent.

---

# 33. Automatic Values

Operator tidak boleh menginput secara normal:

```text
Batch
Rit
Sampling YES/NO
Increment
Ore
Timestamp
Transaction ID
```

Semua dihitung otomatis.

---

# 34. Sticky Operational Context

Pada pile operation screen, pile identifier dan next rit harus tetap terlihat saat scrolling.

Jika layar memerlukan scroll:

```text
L18_S09 • Batch 24 • Next Rit 16
```

dapat menggunakan sticky compact header.

---

# 35. Fast Repeated Entry

Karena haulage input dilakukan berulang, aplikasi harus mengingat context yang aman untuk dipertahankan.

Possible retained values:

```text
Pile
Front
```

Truck behavior harus mengikuti operational requirement.

Jika truck sering berubah:

```text
Truck selector remains focus point
```

Normal flow ideal:

```text
Select Truck
      ↓
Record
```

Maximum primary interaction per normal rit harus diminimalkan.

---

# 36. Successful Record Feedback

Setelah record:

```text
✓ Rit 15 recorded
```

Feedback harus singkat.

Screen langsung update:

```text
Next Rit
16

SAMPLE REQUIRED
```

Jangan tampilkan blocking success modal setiap rit.

---

# 37. Double Tap Protection

Primary transaction buttons harus melindungi duplicate input.

Ketika ditekan:

```text
RECORDING...
```

button sementara disabled.

Transaction creation juga harus idempotent atau memiliki duplicate protection di domain/storage layer.

---

# 38. Wrong Truck Flow

Example:

```text
⚠ WRONG TRUCK

DT-8812 is not assigned
to BR1/01.

Expected Fleet:
DT-2045
DT-2071
DT-2098
```

Actions:

```text
[ CHANGE TRUCK ]

[ CONTINUE ANYWAY ]
```

Jika user memilih continue:

```text
Confirm wrong truck entry?
```

dan event dicatat dalam audit.

Exact permission mengikuti final business decision.

**Phase 18 final correction (§6) — confirmed, simpler than the mockup
above:** there is no separate "⚠ WRONG TRUCK" interstitial screen and no
"CONTINUE ANYWAY" confirm dialog. The Truck checker (§31) simply lets
the operator search and select any known master Truck, including one
outside the Front's effective fleet — the selection itself is the only
action, and `createHaulageTransaction` classifies it `WRONG_TRUCK`
transparently on save (`src/domain/fleet/truck-validation.ts`). The
transaction is recorded exactly like a normal one (BR-TRUCK-003 — Wrong
Truck Does Not Disappear); it surfaces afterward in the Wrong Truck
section of the report (§50) and Excel export, not through a blocking
prompt at entry time. A truck that does not exist in master data at all
(§39 below) is a different, still-blocking case.

---

# 39. Unknown Truck

Jika truck tidak ada pada master:

```text
⚠ UNKNOWN TRUCK

DT-9999 is not registered.
```

Possible actions tergantung policy:

```text
Choose another truck
Request/use exception
```

Tidak boleh diam-diam dianggap valid.

---

# 40. Skipped Haulage UI

Skipped haulage harus terlihat sebagai exception.

Example history:

```text
Rit 10    DT-2010    Recorded
Rit 11               SKIPPED
Rit 12    DT-2045    Recorded
```

Operator dapat membuka detail exception.

---

# 41. Recent Transactions

Pile operation dapat menampilkan beberapa latest transaction saja.

Example:

```text
RECENT

Rit 15
DT-2045
No Sample
21:43

Rit 14
DT-2071
Sample
21:39
```

Jangan menampilkan ratusan row sekaligus pada layar utama.

Full history tersedia melalui separate view.

**Phase 18 final correction (§7) — TERSAMPEL vs TERCATAT:** the
confirmed recorded-position history (`RecordedHaulageList`,
`src/features/piles/recorded-haulage-list.tsx`) labels a position
**TERSAMPEL** when its transaction's `samplingEvaluation.sampleRequired`
is true, and **TERCATAT** otherwise — replacing a single generic
"Recorded" status for every row:

```text
Batch 1 • Rit 2     TERSAMPEL
STM-A40_0012

Batch 1 • Rit 1     TERCATAT
STM-A40_0011
```

Presentation only — the source is the existing transaction/sample
result (Phase 4 sampling engine), never a separately editable status.

---

# 42. Undo / Correction

Jika user baru saja salah input, aplikasi dapat menyediakan short-lived correction action.

Example:

```text
Rit 15 recorded

[ CORRECT ]
```

Correction tidak boleh hard-delete tanpa audit.

Final policy mengikuti business rules.

---

# 43. Samples Main Screen

Navigation:

```text
Pending
Delivered
History
```

Default:

```text
Pending
```

Karena pending sample membutuhkan tindakan.

---

# 44. Pending Sample Card

Example:

```text
L18_S09
SAP • Batch 24

Increment
02 → 10

5 Bags

NOT PICKED UP

[ HANDLE SAMPLE ]
```

---

# 45. Sample Handling Flow

Example:

```text
HANDLE SAMPLE

Pile
L18_S09

Batch
24

Increment
02 → 10

Total Bag
5

Deliver To
[ Select destination ▼ ]

Dispatcher
[ Search NIK / name ]

[ CONFIRM DELIVERY ]
```

---

# 46. Increment Range Selection

Operator tidak perlu menghitung increment manually.

Jika user menentukan:

```text
Rit From
Rit To
```

application shows computed range.

Example:

```text
Rit
02 → 10

Sampling increments:
02, 04, 06, 08, 10
```

---

# 47. Overlap Warning

Example:

```text
⚠ OVERLAPPING RANGE

This range overlaps with
an existing sample record.

Existing
02 → 10

Current
08 → 16

[ VIEW EXISTING ]
[ CHANGE RANGE ]
```

Overlap harus dicegah sesuai business rule.

---

# 48. Not Picked Up State

Sample yang belum dikirim:

```text
NOT PICKED UP
```

User tidak perlu mengisi dummy dispatcher atau destination.

Database menggunakan nullable/explicit status.

---

# 49. Report Screen

Main report screen:

```text
SHIFT REPORT

03 Sep 2026
Night Shift

Production
─────────────
Piles             4
Rit             428
Batches          21
Samples          54
Wrong Truck       2
Pending Sample    3
Total Bags       31

[ VIEW DETAILS ]
```

**Phase 18 final correction (§9) — this structured view was removed, not
just hidden:** this screen and §50's stacked Production Detail view were
implemented as a standalone `ReportSections` component
(`src/features/report/report-sections.tsx`) rendered above the WhatsApp
report preview (§51) — a second, duplicate presentation of the exact
same `ShiftReport` data. `ReportPage`
(`src/features/report/ReportPage.tsx`) now renders only §51's WhatsApp
preview as the single operational report screen; `report-sections.tsx`
and its test have been deleted rather than left unused. The fixed report
text format (§19/§20) and the Copy/Share/Excel-export actions are
unchanged.

---

# 50. Production Detail

Mobile view menggunakan stacked list/card.

Example:

```text
L18_S09
SAP

Rit           82
Batch          4
Increment     41
Wrong Truck    1
```

Avoid wide desktop-style tables.

**Phase 18 final correction (§9):** this per-Pile production breakdown
was part of the same removed `ReportSections` view — see §49's
correction note above. This data still exists inside the WhatsApp report
text (§51) and the Excel export (§53); it is not lost, only no longer
duplicated as a separate structured screen.

---

# 51. WhatsApp Report Preview

Example:

```text
WHATSAPP REPORT

Report Language
[ English ▼ ]

────────────────

DAILY ORE QUALITY ASSURANCE

Date: ...
Shift: ...

...

────────────────

[ COPY REPORT ]
[ SHARE ]
```

Preview harus sama dengan text yang akan dicopy/share.

**Phase 18 final correction (§9):** this is now the ONLY report preview
rendered on `/report` — see §49/§50's correction notes. Copy/Share
remain exactly as implemented (`WhatsAppReportPreview`,
`src/features/report/WhatsAppReportPreview.tsx`).

---

# 52. Report Language

Application language dan report language merupakan setting terpisah.

Example:

```text
Application
Bahasa Indonesia

Report
English
```

Changing report language tidak mengubah domain data.

---

# 53. Excel Export UX

User tidak perlu mengatur workbook structure.

Action:

```text
[ EXPORT EXCEL ]
```

Application generates standardized archive.

After generation:

```text
Excel archive ready

Sampling_2026-09-03_NS.xlsx

[ SHARE FILE ]
[ SAVE FILE ]
```

Actual available system action mengikuti capability browser/device.

---

# 54. Finalize Shift Screen

Before finalize:

```text
FINALIZE SHIFT

Production
428 Rit

Pending Samples
3

Wrong Truck
2

Checks
✓ Data stored locally
✓ Report generated
✓ Excel archive ready
⚠ Pending samples will carry over
```

Primary action:

```text
[ FINALIZE SHIFT ]
```

---

# 55. Finalize Confirmation

Karena finalization merupakan destructive state transition:

```text
Finalize this shift?

After finalization,
editing will be restricted.
```

Actions:

```text
[ CANCEL ]
[ FINALIZE ]
```

---

# 56. Completed Shift Screen

Example:

```text
SHIFT COMPLETED

03 Sep 2026
Night Shift

✓ Excel generated
✓ Handover prepared
✓ Report ready

[ SHARE REPORT ]
[ SHARE EXCEL ]
[ VIEW SUMMARY ]
```

---

# 57. More Screen (REMOVED — CONFIRMED)

Originally proposed to contain:

```text
Fleet Setup
Manpower
Handover History
Sync Status
Language
Application Settings
About / Version
```

Critical operational workflow tidak disembunyikan di More — that
principle is exactly why More itself was removed once active-shift Fleet
management became a real, frequently-used workflow (§105): a read-only
Fleet summary buried in More was already a violation. `MorePage` no
longer exists. Its content was redistributed:

```text
Fleet Setup summary  -> replaced by the real /fleet page (§105)
Language              -> moved into Home, secondary section
Master Data refresh   -> moved into Home, secondary section
About / Version        -> moved into Home, secondary section
Sync Status            -> dropped — duplicated GlobalStatusBar (§16),
                          which is already visible above every
                          active-shift page, not just Home
Manpower / Handover
History                -> never implemented as a More sub-screen; still
                          NEEDS_CONFIRMATION if a dedicated view is
                          wanted later
```

---

# 58. Fleet Setup UI

Fleet setup must simplify Excel behavior.

Example:

```text
FRONT
BR1/01

Hauler
PT ABC

Destination
L18

Fleet Reference
None

TRUCKS
DT-2045
DT-2071
DT-2098

[ + ADD TRUCK ]
```

**Phase 18 confirmed implementation** (`src/features/fleet-setup/front-editor.tsx`):

- Front is a closed selector "01".."25", never free text — the combined
  `Sector/FrontNo` code (`BR1/01`) is always derived, shown read-only,
  never typed (BR-FLEET-001).
- **Phase 18 final correction (§1):** a Front Number already used by
  another Front in this same Fleet Setup session is hidden from the
  selector — once `BR1/01` exists, "01" no longer appears among "02".."25".
  The DUPLICATE_FRONT_ID domain guard (BUSINESS_RULES.md §9) still runs
  as defense-in-depth; it is simply unreachable through this selector
  now. Editing a Front keeps its own current number visible.
- The user-facing "Tipe Fleet" concept is removed entirely — whether a
  Front is BASE or DERIVED is implied by whether Fleet Reference is
  "Tidak Ada"/"None" or a specific Front, with no separate selector.
- Destination/Pile is a searchable combobox (`SearchableCombobox`,
  `src/components/shared/SearchableCombobox.tsx`) over the current
  shift's Sector piles only — never a giant native select — and its
  Ore/Stockpile are always derived from the selected master row, never
  retyped. A search with no match offers "+ Tambah Pile Baru" (New Pile
  Master, §30 amendment).

**Post-inspection correction §2 — New Pile Master creation from inside
Fleet Setup:** the same New Pile Master form (§30) can be reached
directly from this Destination/Pile field's "no results" state, without
leaving Fleet Setup. This matters because Fleet Setup always runs
*before* `initializeShiftWorkspace` in the Start Shift flow
(Registration → Handover → Manpower → Fleet Setup → workspace init once
→ `/home`) — there is no `ShiftWorkspace` row yet at this point, so this
path cannot reuse `activateNewMasterPile`/`activateNewPile` (built around
an already-initialized shift). Instead a setup-time-only operation
(`createPileAreaForSetup` / `createAppsScriptPileAreaForSetup`,
`src/application/pile-master/create-pile-area-for-setup.ts`) writes to
the shared Google master, verifies it (write-then-verify, same as §30),
and returns a merged/re-validated in-memory `MasterData` — which
`StartPage`/`FleetSetupPage` keep in state and immediately select as this
Front's Destination. `initializeShiftWorkspace` is never called early
just to create a Pile; the final initialized workspace's `MasterData`
snapshot already contains the newly created pile because it is this same
updated in-memory snapshot, not the original one.

---

# 59. Fleet Reference UI

If inheritance:

```text
Fleet Reference
BR1/01

Inherited Trucks
8

Changes

Removed
DT-2045

Added
DT-8812
```

Use explicit:

```text
ADD
REMOVE
```

Do not reproduce ambiguous Excel delta behavior.

---

# 60. Searchable Selector

For long lists such as:

```text
Employee
Truck
Pile
```

use searchable picker.

Example:

```text
SELECT TRUCK

[ Search truck ID ]

Recent
DT-2045
DT-2071

All
...
```

Recent/frequent item support can be added after initial version.

---

# 61. Keyboard Behavior

Mobile keyboard should appear only when necessary.

Prefer:

```text
picker
search
numeric keypad
```

instead of unrestricted text field.

For numeric Rit/Batch correction:

```text
inputmode="numeric"
```

or equivalent web behavior.

---

# 62. Confirmation Policy

Do not show confirmation modal for routine reversible action.

Do show confirmation for:

```text
Finalize Shift
Continue Wrong Truck
Start Without Previous File
Discard Active Change
Critical Correction
```

Excessive confirmations increase field friction.

---

# 63. Modal Usage

Modal should be limited.

Preferred for:

```text
critical confirmation
small focused selection
blocking warning
```

Avoid multi-step form inside nested modals.

---

# 64. Bottom Sheet

On mobile, bottom sheet can be used for:

```text
Truck selection
Front selection
Quick action
Small detail
```

where supported by chosen UI architecture.

It should not contain critical long workflow.

---

# 65. Toast / Snackbar

Use non-blocking feedback for:

```text
Saved
Copied
Synced
Export ready
```

Example:

```text
✓ Haulage saved
```

Do not use toast for critical errors that require action.

---

# 66. Error Presentation

Errors classified:

```text
INFO
WARNING
BLOCKING
```

### INFO

Does not interrupt workflow.

### WARNING

Requires awareness or confirmation.

### BLOCKING

User cannot continue until corrected.

---

# 67. Offline UX

Offline state is normal, not an error.

Example:

```text
Offline
Your work is being saved on this device.
```

Do not repeatedly show error dialogs because network is absent.

---

# 68. Sync UX

Possible states:

```text
All data synced
3 changes pending
Syncing...
Sync failed
```

Manual retry available:

```text
[ RETRY SYNC ]
```

Core field workflow remains available.

---

# 69. PWA Update UX

If a newer version is available during active shift:

```text
Update available

Your current shift will not be interrupted.

[ UPDATE LATER ]
```

Do not force reload during active operational entry unless necessary for security/corruption prevention.

---

# 70. Resume After App Close

If app/browser closes during active shift:

```text
ACTIVE SHIFT FOUND

03 Sep 2026
Night Shift

Last saved
22:41

[ RESUME ]
```

No need to repeat setup.

---

# 71. Local Data Safety Indicator

Where useful:

```text
Saved on device
```

or:

```text
Saved locally • Waiting for sync
```

This helps operator understand difference between local save and cloud sync.

---

# 72. Empty States

Examples:

### No Piles

```text
No active piles

[ ADD PILE ]
```

**Phase 18 confirmed copy:** "Belum ada pile aktif pada shift ini." (id) /
"No active piles for this shift yet." (en).

### No Pending Samples

```text
No pending samples
```

**Phase 18 confirmed copy** (explanatory, not just a label — Sample
Handling has no manual "create sample" screen, so the empty state must
say why): "Belum ada sample untuk ditangani. Sample akan muncul otomatis
setelah rit sampling tercatat pada Pile." (id) / "No samples to handle
yet. Samples appear automatically once a sampling rit is recorded on a
Pile." (en).

### No Wrong Trucks

```text
No wrong truck recorded
```

Empty state should be explicit rather than blank screen.

---

# 73. Loading States

Use skeleton/simple loading indicator for non-local data.

Critical local workflow should avoid unnecessary loading states.

Master sync can happen separately.

---

# 74. Accessibility

Minimum requirements:

```text
Readable contrast
Text labels for icons
Large touch targets
Screen-reader meaningful labels
Do not rely only on color
Logical focus order
```

Font scaling should not catastrophically break layout.

---

# 75. Bilingual UI

Supported:

```text
id = Bahasa Indonesia
en = English
```

Every user-visible static string must come from translation resources.

Example:

```text
pile.nextRit
sample.pending
shift.finalize
truck.wrongTruck
```

Do not hard-code translated UI strings inside domain functions.

---

# 76. Translation Length

English and Indonesian labels may have different lengths.

UI must tolerate this.

Do not design button width tightly around one language.

Example:

```text
Finalize Shift
Selesaikan Shift
```

Layout must support both.

---

# 77. Date and Time Display

Internal values remain standardized.

UI formatting follows locale.

Examples:

```text
ID
3 September 2026
22.41

EN
3 September 2026
10:41 PM
```

Exact time display convention may be configured.

Operational timestamps should remain unambiguous.

---

# 78. Mobile Hardware Considerations

Application should assume field devices may have:

```text
mid-range CPU
limited RAM
limited storage
poor network
older browser version
```

Avoid unnecessarily heavy animation and large UI libraries.

Performance is UX.

---

# 79. Animation

Animation should be minimal and functional.

Allowed:

```text
small page transition
progress change
success feedback
bottom sheet movement
```

Avoid decorative animation in repeated operational workflow.

---

# 80. Pile Progress

Batch progression should be visually understandable.

Example:

```text
Batch 24

16 / 20

████████████████░░░░
80%
```

Exact rendering may use progress bar.

Do not make operator calculate remaining rit mentally.

---

# 81. Next Sample Indicator

Especially useful for LIM.

Example:

```text
Current Rit
65 / 100

Next Sample
Rit 70
```

For sampling rit:

```text
SAMPLE NOW
```

This is operationally more useful than simply displaying YES/NO history.

---

# 82. Pending Batch UX

When pile contains multiple carried batches:

```text
PENDING WORK

Batch 24
10 rit remaining

Batch 25
17 rit remaining

Batch 31
2 rit remaining

Batch 32
6 rit remaining
```

Current active pending batch should be emphasized.

Engine determines progression automatically.

---

# 83. History UX

Historical records should be available but not dominate operational screen.

Possible:

```text
Pile Operation
    ↓
Recent
    ↓
View Full History
```

History filter:

```text
Current Shift
Previous Shift
All Available
```

---

# 84. Audit Information

Correction detail can display:

```text
Corrected

Previous:
DT-2045

New:
DT-2071

By:
NIK 12345

Time:
22:16
```

This is secondary detail, not primary operational UI.

---

# 85. Irreversible Action Styling

Actions such as:

```text
Finalize
Void
Discard
```

must be visually distinct from normal action.

Do not place irreversible button immediately adjacent to common tap action without separation.

---

# 86. Primary Action Rule

Each screen should normally have only one dominant primary action.

Examples:

```text
START SHIFT
RECORD HAULAGE
CONFIRM DELIVERY
FINALIZE SHIFT
```

Secondary actions use lower visual emphasis.

---

# 87. Home Screen Quick Action

Possible quick action:

```text
[ CONTINUE LAST PILE ]
```

Useful when operator repeatedly returns to same active pile.

Example:

```text
Continue
L18_S09
Batch 24 • Next Rit 16
```

This reduces navigation taps.

---

# 88. Device-Specific Behavior

The application must avoid UX that depends exclusively on Android or iOS behavior.

Functions requiring OS integration should have fallback.

Example:

```text
Share Report
```

Fallback:

```text
Copy Report
```

Excel sharing/download should similarly have a fallback compatible with standard browser behavior.

---

# 89. Installation UX

PWA installation is optional for operation unless technical requirements later dictate otherwise.

Application should work through browser and installed PWA mode.

When useful, installation guidance can be shown unobtrusively.

Do not block operational work simply because application is not installed.

---

# 90. Authentication UX

Authentication method is not yet decided.

When implemented, login must not introduce unnecessary repeated authentication during a shift.

Session expiration during offline work must not result in loss of local operational data.

---

# 91. First-Use UX

First use may require:

```text
Language
Authentication
Master Data Sync
Basic local initialization
```

After configuration, daily operation should open directly into:

```text
Resume Shift
```

or:

```text
Start Shift
```

---

# 92. Settings

Minimum initial settings:

```text
Application Language
Report Language
Sync
About
Application Version
```

Developer/debug settings must not appear in normal operator interface.

---

# 93. UI Component Categories

Potential reusable components:

```text
AppHeader
ShiftContext
BottomNavigation

PrimaryButton
SecondaryButton

StatusBadge
WarningBanner

SearchPicker
TruckPicker
EmployeePicker
PilePicker

PileCard
SampleCard
SummaryCard

ProgressBar
OfflineIndicator
SyncIndicator

ConfirmationDialog
BottomSheet
Toast
```

Components remain presentation-oriented.

Business rules stay outside components.

---

# 94. Page Responsibility

Pages may orchestrate use cases but should not directly implement business calculations.

Example wrong:

```text
PilePage
→ calculates MOD(rit, interval)
```

Correct:

```text
PilePage
→ calls SamplingEngine
→ receives SAMPLE_REQUIRED
→ renders result
```

---

# 95. UI State vs Domain State

UI state:

```text
selected tab
modal open
search text
temporary form value
```

Domain state:

```text
current batch
current rit
haulage transaction
sample status
pending batch
```

These must not be mixed.

---

# 96. Critical Operational Performance

Expected interactions should feel immediate.

Local actions such as:

```text
open pile
select truck
record haulage
navigate samples
```

should not wait for remote network request.

Network synchronization happens separately.

---

# 97. No Spreadsheet UI Principle

Application must not use spreadsheet/grid input as primary UX.

Avoid screens like:

```text
| Batch | Rit | Truck | Front | Sample |
|-------|-----|-------|-------|--------|
```

for repeated mobile entry.

Tables may exist for:

```text
report review
history
advanced supervisor view
```

but should be adapted to mobile.

---

# 98. Field Workflow Priority

Development review should prioritize these screens in order:

```text
1. Start / Resume Shift
2. Handover
3. Home
4. Pile List
5. Pile Operation
6. Wrong Truck Warning
7. Samples
8. Sample Handling
9. Report
10. Finalize
11. Fleet / More
```

If these work well, most field UX is covered.

---

# 99. Mobile Acceptance Tests

Minimum UX tests should be performed at widths:

```text
320px
360px
390px
430px
```

and representative Android/iOS browsers.

Check:

```text
No horizontal scroll
No clipped primary button
Readable labels
Safe bottom spacing
Keyboard does not hide critical field
Bottom navigation remains usable
Modal fits screen
Long translations wrap correctly
```

---

# 100. Operational Scenario Test

UI must be tested through complete realistic flows rather than isolated pages.

### Scenario A — Normal SAP

```text
Start Shift
→ Open Pile
→ Record 20 rit
→ Samples generated correctly
→ Handle samples
→ Report
```

### Scenario B — LIM

```text
Record through multiple sampling intervals
→ Next Sample indicator correct
```

### Scenario C — Wrong Truck

```text
Select wrong truck
→ warning
→ acknowledge
→ transaction retained
```

### Scenario D — Offline

```text
Disconnect network
→ record haulage
→ handle sample
→ close app
→ reopen
→ data remains
```

### Scenario E — Handover

```text
Import previous shift
→ pending pile appears
→ continue correct batch/rit
```

---

# 101. UI/UX Non-Goals v1

Not required for first production version:

```text
Complex dashboards
Production graphs
Advanced analytics
Desktop spreadsheet replacement
Animations
Custom themes
Large supervisor BI screens
```

Focus remains field execution.

---

# 102. Core UI Principle

The operator should not need to understand how Excel used to calculate the process.

The application should answer the operational questions automatically:

```text
What pile am I working on?

What rit is next?

Is this a sample rit?

What batch am I in?

Is this truck valid?

Is there any pending sample?

Is my work saved?

What needs attention before shift ends?
```

If those answers are immediately visible, the UI is fulfilling its purpose.

---

# 103. Target Experience

Normal repetitive haulage should approach:

```text
Open active pile
      ↓
Select / confirm truck
      ↓
RECORD
      ↓
Next rit automatically prepared
```

The application handles:

```text
Batch
Rit
Sampling interval
Increment
Fleet validation
Pending continuity
Timestamp
ID
Persistence
```

without requiring operator calculation.

---

# 104. UI Supervisor Rule

Claude Code must not introduce a new major screen, navigation model, or operational interaction without checking this specification.

When implementation conflicts with this document:

```text
Business correctness
>
Data safety
>
Operational simplicity
>
Visual preference
```

---

# 105. Active-Shift Fleet Page (CONFIRMED)

`/fleet` (`src/features/fleet/FleetPage.tsx` → `FleetActivePage`), the
extension of §58/§59's pre-shift Fleet Setup into ACTIVE-shift territory
(BUSINESS_RULES.md §38). Available throughout the active shift via the
bottom nav (§14).

```text
FLEET AKTIF

BR1/02
Destination: ...
Hauler: ...
Units: 5
[Detail]

BR1/07
Reference: BR1/04
Destination: L18_S10
Units: 7
[Detail]

[ + TAMBAH FRONT ]

RIWAYAT FRONT

BR1/01
Dilanjutkan oleh BR1/04
```

Active Fronts list every Front `deriveFrontLineage` (BUSINESS_RULES.md
§38) classifies as ACTIVE, independent lineages included side by side.
"[Detail]" expands an inline truck-chip list (`EffectiveFleetPreview`,
reused from §58) rather than navigating to a separate screen. History
rows are read-only — no Edit/Remove affordance exists on a HISTORICAL
Front, mirroring §58's "never revalidate historical state" rule.

**+ Tambah Front** opens a continuation editor
(`src/features/fleet/front-continuation-editor.tsx`):

```text
Front Baru
BR1/07

Referensi
BR1/04

Destination
L18_S09   [editable]

Unit Referensi
A
B
D
E

Perubahan Unit
+ Tambah
- Keluarkan

Fleet Efektif
A
B
E
F

[SIMPAN FRONT]
```

Front No is always auto-derived (MAX + 1, BUSINESS_RULES.md §38) — unlike
§58's pre-shift editor, there is no manual 01–25 selector here. Fleet
Reference only offers ACTIVE Fronts (a HISTORICAL Front is never an
offerable reference target). Destination defaults to the reference
Front's own Destination but stays editable, reusing the same
`SearchableCombobox` + New Pile Master fallback as §58/§59 — no separate
Destination UI was invented. Every validation and fleet-math step
(inherited trucks, Add/Remove delta, effective fleet preview,
single-successor enforcement) is delegated to
`appendFrontContinuation`/`resolveEffectiveFleetAgainstMaster` — this
screen never computes fleet membership itself (§97 no-spreadsheet-UI
principle).

UI must adapt to domain requirements, but domain rules must not be embedded into UI code.

---

# 106. New Independent BASE Front During an Active Shift (Phase 18 final correction §2)

§105's continuation editor only ever moves a loading point that already
exists (Fleet Reference = an ACTIVE Front). A completely new, unrelated
Front sometimes opens mid-shift instead — a second Hauler starts hauling
to a different Pile, say — with no predecessor to move from at all. The
same "+ Tambah Front" editor (`front-continuation-editor.tsx`) now
supports this as a second mode, selected the same way §58's pre-shift
`FrontEditor` distinguishes BASE from DERIVED: Fleet Reference = **Tidak
Ada**.

```text
Front Baru
BR1/05

Fleet Reference
Tidak Ada

Hauler
STM

Destination/Pile
L9_27

Truck
+ STM-A40_xxxx
+ STM-A40_xxxx

Fleet Efektif
2 unit

[SIMPAN FRONT]
```

This is a compact version of §58's initial Fleet Setup BASE branch, not
a second fleet model — same `createBaseFleetDefinition`, same
`TruckAction`/`SelectedTrucks` add-truck controls, same
`SearchableCombobox` Destination field. Differences from CONTINUATION
mode:

```text
Hauler        operator picks it — nothing to inherit
Destination   required — no reference to default from
Trucks        added fresh from the chosen Hauler — no inherited list, no Add/Remove delta
Predecessor   none — no Front becomes HISTORICAL from this save
```

Front No is still auto-derived by the same MAX+1 rule (BUSINESS_RULES.md
§38) — a BASE Front opened mid-shift is still the next chronological
Front for its Sector. "+ Tambah Front" (§105) is never disabled for
having zero ACTIVE Fronts — BASE mode needs none. Application layer:
`appendNewBaseFront` (`src/application/fleet-setup/append-new-base-front.ts`).
The resulting Front appears on `/fleet` and the Pile List (§29) exactly
like any other ACTIVE Front, with its own independent lineage.

---

# 107. Mobile Presentation Hardening (Pre-v1.0.0)

Real-iPhone testing ahead of the v1.0.0 GitHub Pages release surfaced
presentation-only issues — status-bar overlap, an over-scaled/"scaled
website" feel, and a bottom nav that behaved like a web footer rather
than a native app bar. This section is presentation/UX only: no
business rule, schema, or workflow changed.

**Viewport / zoom lock (CONFIRMED, intentional for field use):**
`index.html`'s viewport meta is
`width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
Pinch/accidental browser zoom is disabled deliberately — this is a field
app, not a document viewer — while `viewport-fit=cover` still lets the
app draw under the iPhone notch/Dynamic Island so the safe-area policy
below can control it precisely. No Safari input-zoom workaround
(`font-size: 16px` was already the input/select text size — see below)
was added; real-device testing confirmed it was unnecessary.

**Safe-area policy — one shell per entry point, no per-page patches:**

```text
GlobalStatusBar   owns the top inset for every active-shift route
                  (AppLayout): safe-top padding, since it is the first
                  element painted at the true top of the screen there.

PageHeader        owns the top inset everywhere else it is the topmost
                  element (every pre-shift Start Shift step: Shift
                  Start/Resume, Handover, Manpower, Fleet Setup) *and*
                  covers the case where GlobalStatusBar has scrolled out
                  of view on an AppLayout route. It does this via
                  `sticky top-[env(safe-area-inset-top)]` rather than a
                  fixed `top-0` + padding — the sticky offset itself
                  clears the notch only once PageHeader is actually the
                  element resting at the screen edge, so its own normal
                  in-flow position (already below GlobalStatusBar) never
                  gets a second, wasted top inset stacked underneath the
                  first. **Corrected by §108:** this assumption ("already
                  below GlobalStatusBar") does not hold on pre-shift
                  routes, where PageHeader has no GlobalStatusBar above
                  it — see §108 for the fix (`PreShiftShell`).

AppLayout /       own left/right insets (`safe-x`) and, respectively,
WelcomePage       top+bottom insets, for their own root shells.

BottomNav         owns the bottom inset (`safe-bottom`) plus left/right
                  (`safe-x`) so it clears the iPhone home indicator and
                  stays clear of Android gesture-nav cutouts in
                  landscape.
```

`safe-top` / `safe-bottom` / `safe-x` are small utility classes in
`src/styles/globals.css` wrapping the four `env(safe-area-inset-*)`
values — introduced so no individual page hand-rolls its own inset
math for the shell edges above (per-page bottom padding that already
existed for in-page spacing, e.g. `pb-[calc(1rem+env(safe-area-inset-bottom))]`
on individual forms, is unrelated and untouched).

**Dynamic viewport height:** `AppLayout` and `WelcomePage` (the two full
-height shells) already used `min-h-dvh`; no `100vh`/`min-h-screen`
usage existed anywhere else in the app to convert. Nothing else needed
scroll behavior changes beyond BottomNav's below.

**Typography/density (targeted, not a blanket scale transform):**
measured against actual rendered sizes, most of the app already sat
inside or below the field-readable ranges this pass targets (§12).
Adjustments were made only where a shared primitive was measurably off:

```text
PageHeader title      20px -> 22px, header vertical padding tightened
Card                  p-4 -> p-3.5 (a touch more compact)
CardTitle             16px -> 17px
Button (all sizes)    14px -> 15px base font
Home dashboard KPI    24px -> 28px (primary-metric emphasis, §12)
```

Inputs/selects (16px, avoids iOS auto-zoom), field labels (14px), and
touch target heights (44px minimum via existing `h-11`) were already on
target and left unchanged.

**GlobalStatusBar:** unchanged states (offline / pending / failed /
update-available / offline-ready) — only the normal healthy row (online
+ fully synced) got tighter padding and a compact "Online · All synced"
reading via a plain middle-dot separator between the existing
online/sync text nodes (not a merged string, so nothing here changed
GlobalStatusBar's queryable text).

**Bottom navigation — mobile hardening (supersedes the plain fixed bar
originally described earlier in this document):**

```text
Label:        Beranda | Fleet | Pile | Sample | Laporan (§14 amendment
              above) — "Sample" replaces "Penanganan Sampel"/"Sample
              Handling" in both languages so it fits one line at 360px.
              The Samples screen's own heading is a separate key and is
              unaffected.

Visibility:   visible by default; hides on a deliberate downward
              scroll of the document (this app scrolls the document
              itself, not an inner container) past a 16px direction
              threshold (absorbs rubber-band/jitter); returns
              immediately on upward scroll past the same threshold;
              forced visible within 8px of the top or whenever the
              page's content is shorter than the viewport (nothing to
              scroll); resets to visible on every route change. Animated
              via `translateY` + a short transition, not a layout
              reflow — BottomNav is `fixed`, so hiding it never
              reclaims/jumps page content, and `AppLayout`'s `<main>`
              keeps a constant bottom reserve sized to the nav's own
              height + safe-area inset regardless of visibility.

Contrast:     translucent `bg-background` + backdrop blur, a top
              border, and a subtle upward drop shadow separate the nav
              from page content without a decorative gradient. The
              active item keeps its existing color differentiation
              (primary vs. muted-foreground) plus a soft rounded
              highlight behind its icon.
```

---

# 108. Real-Device Follow-Up Hardening (Pre-v1.0.0, Part 2)

A second real-iPhone pass on top of §107 found two remaining
presentation bugs and confirmed the typography still read oversized.
Presentation/UX only — no business rule, schema, or workflow changed.

**Bug 1 — pre-shift content rendering under PageHeader:** §107 assumed
PageHeader's `sticky top-[env(safe-area-inset-top)]` offset was always
"free" because the element's own in-flow position was already past the
inset (true on AppLayout routes, where GlobalStatusBar's `safe-top`
padding runs first). On `/start` (Shift Start/Resume, Handover,
Manpower, Fleet Setup — and their loading/error phases), PageHeader is
the *first* element with nothing above it reserving that space. A
sticky offset shifts an element's *painted* position without reserving
extra room for it in the document flow — flow space is still based on
the element's un-shifted static position — so the header visually
slides down into the safe area while the content after it starts
exactly where the header's un-shifted top would have been, one inset's
worth too high, landing underneath the header.

Fix — `PreShiftShell` (`src/components/shared/PreShiftShell.tsx`)
wraps the entire `/start` route (in `AppRouter`, around `StartPage`)
with `safe-top` padding, mirroring what `GlobalStatusBar` already does
on AppLayout routes: it reserves the inset in flow *before* PageHeader,
so PageHeader's natural position already clears the threshold and its
sticky offset never has to move it. One shell, mounted once at the
route level — no per-page change inside `ShiftStartPage` /
`HandoverPage` / `ManpowerSetupPage` / `FleetSetupPage`.

**Bug 2 — transparent top safe-area while scrolling:** on both
AppLayout and pre-shift routes, whatever reserves the top inset in flow
(`GlobalStatusBar`, `PreShiftShell`'s `safe-top` padding) is itself
ordinary scrolling content — once it scrolls out of view, nothing
painted the status-bar/Dynamic-Island strip, so scrolled page content
became visible behind the physical status bar.

Fix — `SafeAreaTopCap` (`src/components/shared/SafeAreaTopCap.tsx`): a
`fixed`, `aria-hidden` `bg-background` layer pinned to the top of the
viewport, exactly `env(safe-area-inset-top)` tall, above PageHeader in
stacking order. Being `fixed` (not in flow), it adds no extra inset of
its own — no double safe-area spacing. Mounted once per shell
(`AppLayout` and `PreShiftShell`), not per page, and works identically
for an Android status-bar/cutout since it reads the same `env()` value.

**Header composition (PageHeader):** real-device testing also showed
the title sitting flush against the screen edge — traced to `PageHeader`
previously combining `safe-x` (`env(safe-area-inset-left/right)`, `0`
on most portrait phones) and a fixed `px-4` on the *same* `<header>`
element; both set `padding-left`/`padding-right`, and `safe-x`'s `0`
was winning the cascade. Fixed by splitting the element in two: the
outer `<header>` carries `safe-x` (+ `sticky`/border/background) alone,
and an inner `div` carries the visual `px-5 py-3` content padding —
composing the same way `GlobalStatusBar`/`AppLayout` already do
(safe-area clearance outside, visual padding inside). `px-5` (20px)
matches the page-content wrapper padding below it (also raised from
`px-4` to `px-5` app-wide, see below) so the title lines up with
cards/forms rather than sitting off from them.

**Typography — tightened further (targeted, per shared primitive):**

```text
PageHeader title        22px -> 19px, vertical padding 10px -> 12px
CardTitle               17px -> 16px
Button (lg size)        16px -> 15px (default size was already 15px)
Home dashboard KPI      28px -> 26px
Section heading (h2)    18px -> 16px (Manpower/Fleet Setup/Fleet Active)
Page-content horizontal
padding (app-wide)      px-4 (16px) -> px-5 (20px), matching PageHeader
```

Inputs/selects were deliberately **left at 16px**, not tightened to the
newer 15px target — 16px is the documented iOS Safari no-auto-zoom
threshold (§107), and dropping below it would reintroduce the exact
zoom-on-focus behavior that pass avoided. Field labels and general body
text (`text-sm`, 14px) were also left unchanged: they are inline
Tailwind utility classes repeated across ~20 files for several
different purposes (labels, helper text, body copy), not a single
shared primitive, and the 1px gap to the new 13px target did not
warrant a wide, unverifiable-without-a-device sweep. Critical
operational status text (e.g. the Pile Haulage "SAMPLE REQUIRED"/"NO
SAMPLE" banner, §31/§32) was left untouched — those are deliberately
larger per §12's "critical values may use a larger size," not a plain
section heading.

---

# 109. Field Trial Fix — Mid-Shift Manpower Edit & Persistent Active Fleet Adjustment

Two field trial findings, both extending existing screens rather than
introducing a new workflow (BUSINESS_RULES.md §5 BR-MAN-004/005, §9
BR-FLEET-006, §10 BR-TRUCK-004).

**Home — Manpower edit (Field Finding 1).** §26's Home Dashboard gains
one compact row above the existing stat-tile grid, reusing the same
Card primitive:

```text
MANPOWER
1 Staff · 1 Crew                              [Ubah Manpower]
```

"Ubah Manpower" links to `/manpower/edit`
(`src/features/manpower/ManpowerEditRoute.tsx` →
`src/features/manpower/manpower-edit-page.tsx`), a full-screen editor —
not a route back through Start/Registrasi Shift/Fleet Setup. It reuses
§24's exact search/add/remove/Job-Desk-edit behavior and validation
(`useManpowerRoster`, `PersonnelSearchField`, `SelectedPersonnelList` —
`src/features/manpower/manpower-roster-fields.tsx`), pre-filled from the
current shift's already-saved roster instead of starting empty:

```text
UBAH MANPOWER SHIFT

[ Search NIK / Name ]

Personel Terpilih
SCM0333
Raharjo Rahman
Penanggung Jawab
Job Desk [ ]

260225
Andri Tani Kusuma
Job Desk [ Sampler ]

[ Batal ]   [ Simpan ]
```

Save/Cancel replace Continue/Back: **Save** revalidates the roster
(`createManpowerFromDraft`, unchanged) and persists it via
`LocalOperationalStore.updateShiftManpower`, then returns to Home;
**Cancel** discards every in-progress change and returns to Home
without writing anything. No accidental shift restart is possible from
this screen — it never touches shift date/code/sector/Sampling House,
fleet, pile workspace, haulage, or sample handling.

**Fleet — "Atur Unit" (Field Finding 2).** §105's Active Fronts card
gains a second action next to "[Detail]":

```text
BR1/04
Hauler: H1
Destination: L18_S09
Units: 3
[Detail]   [Atur Unit]
```

"Atur Unit" opens `FrontFleetAdjustmentEditor`
(`src/features/fleet/front-fleet-adjustment-editor.tsx`) in the same
place §105's "+ Tambah Front" editor renders — this is deliberately
**not** that editor: Front No, Hauler, Fleet Reference, and Destination
are shown read-only, and only the truck list is editable.

```text
ATUR UNIT — BR1/04

Hauler: H1
Destination: L18_S09

Truck Saat Ini
DT01                                          [Hapus]
DT03                                          [Hapus]

Tambah Truck
[ DT04 ▾ ]  [Tambah Truck]

Fleet Efektif
DT01  DT03  DT04

[ Batal ]   [ Simpan Unit ]
```

Delegated entirely to `adjustFrontFleet`
(`src/application/fleet-setup/adjust-front-fleet.ts`, BUSINESS_RULES.md
BR-FLEET-006) — this screen never computes fleet membership itself
(§97). Saving never changes the Front ID (BR1/04 stays BR1/04, this is
not a continuation) and never touches lineage: a BASE Front's
`truckIds` is replaced outright, a DERIVED Front's `referenceFleetId`
is preserved and only its own Add/Remove delta is recomputed. Persisted
via `LocalOperationalStore.updateActiveFrontFleet`, which shares
`appendFrontContinuation`'s atomic replace-and-persist write path.

Only ACTIVE Fronts show "Atur Unit" — a HISTORICAL Front stays entirely
read-only, mirroring §105's existing "never revalidate historical
state" rule (`FRONT_NOT_ACTIVE` if attempted anyway).

**Minimum 1 unit (BR-FLEET-006 amendment).** An ACTIVE Front must always
retain at least 1 effective truck. The operator can remove trucks freely
down to exactly 1, but `adjustFrontFleet` rejects a save that would
leave 0 (`FRONT_MINIMUM_UNIT_REQUIRED`) — enforced in the domain/
application layer, not as UI-only validation, so the same guard applies
however the screen is driven. The Save button stays enabled; instead the
editor's live Effective Fleet preview and the Save attempt both surface
the fixed Indonesian message:

```text
Front aktif harus memiliki minimal 1 unit.
```

This never marks the Front inactive and introduces no new Front status
model — ACTIVE/HISTORICAL stays purely derived from the Fleet Reference
graph (`deriveFrontLineage`), unrelated to unit count.

**Temporary vs persistent, restated for this screen (BR-TRUCK-004):**
Pile's existing Truck checker (§38/§39) still lets the operator select
and record a truck outside the effective fleet as an ad-hoc WRONG_TRUCK
transaction — that capability is unchanged and is never a substitute
for "Atur Unit." Only a save through this Fleet-page editor changes
what counts as VALID/expected for the Front going forward; a Pile-page
wrong-truck entry never does.
