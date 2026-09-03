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
    ├── Home
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
    ├── Report
    │   ├── Shift Summary
    │   ├── WhatsApp Preview
    │   ├── Excel Export
    │   └── Finalization
    │
    └── More
        ├── Fleet
        ├── Manpower
        ├── Handover History
        ├── Sync
        ├── Language
        └── Settings
```

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

# 57. More Screen

Contains secondary functions:

```text
Fleet Setup
Manpower
Handover History
Sync Status
Language
Application Settings
About / Version
```

Critical operational workflow tidak disembunyikan di More.

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

### No Pending Samples

```text
No pending samples
```

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

UI must adapt to domain requirements, but domain rules must not be embedded into UI code.