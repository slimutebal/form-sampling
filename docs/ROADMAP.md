# Form Sampling — Development Roadmap

**Status:** Draft v0.1  
**Project:** Form Sampling  
**Related Documents:**
- `docs/ARCHITECTURE.md`
- `docs/BUSINESS_RULES.md`
- `docs/Form_Sampling.xlsx`

---

# 1. Development Strategy

Pengembangan dilakukan bertahap dengan urutan:

```text
Documentation
    ↓
Project Foundation
    ↓
Domain Model
    ↓
Business Rule Engine
    ↓
Local Persistence
    ↓
Field Workflow
    ↓
Shift Handover
    ↓
Reporting / Excel
    ↓
Google Integration
    ↓
PWA / Offline Hardening
    ↓
Production Release
```

Prinsip utama:

> UI tidak boleh menjadi tempat business logic.

Setiap milestone harus selesai dan tervalidasi sebelum milestone berikutnya dianggap selesai.

---

# 2. Phase 0 — Documentation Baseline

## Goal

Mengunci pemahaman sistem sebelum coding.

## Deliverables

```text
docs/
├── ARCHITECTURE.md
├── BUSINESS_RULES.md
├── ROADMAP.md
└── Form_Sampling.xlsx
```

## Exit Criteria

- Architecture sudah terdokumentasi.
- Business rule utama sudah terdokumentasi.
- Rule yang belum pasti ditandai `NEEDS_CONFIRMATION`.
- Workbook sumber tersedia di repository/workspace.

---

# 3. Phase 1 — Project Foundation

## Goal

Membuat fondasi repository yang bersih dan siap dikembangkan.

## Tasks

- Initialize application project.
- Enable TypeScript strict mode.
- Setup linting.
- Setup formatting.
- Setup unit testing.
- Setup environment configuration.
- Setup path aliases.
- Setup Git ignore.
- Setup GitHub repository.
- Setup GitHub Actions basic validation.
- Setup basic PWA structure.
- Setup localization framework.

## Suggested Structure

```text
src/
├── app/
├── components/
├── domain/
├── application/
├── infrastructure/
├── storage/
├── integrations/
├── reports/
├── i18n/
├── types/
└── utils/
```

Domain code must not import UI modules.

---

## Internationalization

Initial locales:

```text
id
en
```

Example:

```text
src/i18n/
├── id.json
└── en.json
```

No user-visible application string should be hard-coded inside domain functions.

---

## CI Checks

GitHub Actions minimum:

```text
install
lint
typecheck
test
build
```

## Exit Criteria

The following must pass:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

No business feature is required yet.

---

# 4. Phase 2 — Domain Model

## Goal

Create application entities independent from UI, database, Excel, and Google Sheets.

## Core Entities

Initial model:

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

---

## Important Value Objects / Enums

Examples:

```text
ShiftType
OreType
PileStatus
TruckValidationStatus
SampleStatus
DeliveryStatus
ShiftStatus
```

Internal values must be language-neutral.

Example:

```text
CONTINUE
HOLD

VALID
WRONG_TRUCK

NOT_PICKED_UP
DELIVERED
```

---

## ID Strategy

Implement stable identifiers for:

```text
Shift_ID
Transaction_ID
Sample_ID
Pile_ID
```

Use internal unique identifiers separately from human-readable codes where required.

---

## Exit Criteria

Domain entities can be instantiated and validated without:

```text
React
browser UI
IndexedDB
Excel
Google APIs
```

Unit tests exist for entity invariants.

---

# 5. Phase 3 — Master Data Model

## Goal

Implement master/reference data used by operational rules.

## Required Master Data

```text
Employees
Staff
Crew
Sector
Location
Sampling House
Ore Class
Sampling Rule
Hauler
Truck
Truck Model
Pile Master
```

---

## Sampling Rule Model

Do not hard-code:

```text
SAP = ...
LIM = ...
```

Instead:

```text
SamplingRule {
    oreCode
    samplingInterval
    batchSize
    packingRule
}
```

Initial values may be seeded from workbook.

---

## Exit Criteria

Application can answer:

```text
Pile_ID → Ore
Ore → Sampling Rule
Truck_ID → Truck
Hauler → Trucks
```

using domain services.

---

# 6. Phase 4 — Sampling and Batch Engine

## Goal

Implement the critical Excel logic as tested domain functions.

This phase must be completed before haulage UI is built.

---

## 6.1 Sampling Decision

Implement:

```text
shouldSample(rit, samplingInterval)
```

Expected:

```text
SAP interval 2

1 → false
2 → true
3 → false
4 → true
```

---

## 6.2 Batch Progression

Implement:

```text
nextRit(...)
nextBatch(...)
```

including rollover.

Example:

```text
Batch 24 / Rit 20
→
Batch 25 / Rit 1
```

---

## 6.3 Pending Batch Continuity

Support:

```text
Pile
└── PendingBatch[]
```

Example:

```text
24 / 10
25 / 03
31 / 18
32 / 14
```

Engine must continue these in deterministic batch order.

---

## 6.4 Multiple Pending Batches

Test expected progression.

For SAP:

```text
24/11
...
24/20

25/04
...
25/20

31/19
31/20

32/15
...
32/20

33/01
```

---

## Exit Criteria

Business rule unit tests pass for:

```text
SAP
LIM
normal batch
batch rollover
single pending batch
multiple pending batches
new batch after pending completion
```

No UI dependency.

---

# 7. Phase 5 — Fleet and Truck Validation Engine

## Goal

Implement fleet logic from `Fleet_Det`.

---

## Features

- Front definition.
- Hauler assignment.
- Destination.
- Allowed trucks.
- Fleet reference.
- Fleet inheritance.
- Truck add/remove delta.
- Effective fleet calculation.

---

## Required Domain Function

Conceptually:

```text
getEffectiveFleet(frontId)
```

and:

```text
validateTruck(frontId, truckId)
```

Possible result:

```text
VALID
WRONG_TRUCK
UNKNOWN_TRUCK
```

---

## Exit Criteria

Unit tests cover:

```text
direct fleet
referenced fleet
added truck
removed truck
wrong truck
unknown truck
```

---

# 8. Phase 6 — Haulage Transaction Engine

## Goal

Combine:

```text
Pile
Batch
Rit
Sampling
Front
Truck
Validation
```

into operational transactions.

---

## Transaction Creation

Creating one haulage transaction should automatically determine:

```text
Batch
Rit
Sample status
Increment identity
Truck validation
Timestamp
Transaction ID
```

Operator should not manually calculate these values.

---

## Wrong Truck

Initial implementation:

```text
warning + explicit acknowledgement
```

until final operational decision is confirmed.

Transaction remains stored.

---

## Skipped Haulage

Implement skipped haulage detection separately from UI.

Required scenario:

```text
Rit 10 valid
Rit 11 incomplete/missing
Rit 12 valid

→ Rit 11 SKIPPED_HAULAGE
```

---

## Exit Criteria

Domain tests cover normal and exception workflows.

---

# 9. Phase 7 — Local Operational Database

## Goal

Allow complete field operation without internet.

Technology may use:

```text
IndexedDB
```

through an appropriate abstraction.

---

## Data Stored Locally

Minimum:

```text
Current Shift
Manpower
Fleet
Pile
PendingBatch
HaulageTransaction
SamplingEvent
SampleHandling
Cached Master Data
Application Settings
Import History
Sync State
```

---

## Requirements

Application survives:

```text
page refresh
browser restart
temporary network loss
device restart
```

as far as browser/PWA storage allows.

---

## Repository Pattern

Domain must not directly call IndexedDB.

Use interfaces conceptually like:

```text
ShiftRepository
HaulageRepository
PileRepository
MasterDataRepository
```

Infrastructure implementation handles IndexedDB.

---

## Exit Criteria

A test shift can:

```text
start
record transactions
close app
reopen app
restore current state
```

without server access.

---

# 10. Phase 8 — Shift Registration UI

## Goal

Build the first operator-facing workflow.

---

## Screen

```text
Start Shift
```

Inputs:

```text
Date
Shift
Sector
Sampling Location
Manpower
```

Prefer dropdown/search selection from master data.

Minimize free typing.

---

## Language

User can choose:

```text
Bahasa Indonesia
English
```

Changing language must not change stored data.

---

## Exit Criteria

User can initialize a local shift correctly.

---

# 11. Phase 9 — Fleet Setup UI

## Goal

Replace complexity of Excel `Fleet_Det` with field-friendly controls.

---

## UX

User selects:

```text
Front
Hauler
Destination
Fleet Reference
```

Truck changes should use explicit actions:

```text
Add Truck
Remove Truck
```

Do not copy the ambiguous Excel fleet-delta interaction.

---

## Exit Criteria

User can configure fleet and view Effective Fleet.

---

# 12. Phase 10 — Pile / Haulage UI

## Goal

Implement primary field workflow.

---

## Pile Dashboard

Display clearly:

```text
Pile ID
Ore
Current Batch
Current Rit
Current Increment
Pending State
```

---

## Haulage Entry

Minimum operator action should ideally be:

```text
Select Front
Select Truck
Confirm
```

Application calculates the rest.

---

## Design Principles

- large touch targets;
- minimal typing;
- visible offline state;
- immediate validation;
- current pile obvious;
- wrong truck visible;
- accidental double-entry protection.

---

## Exit Criteria

An operator can perform a complete test batch using a mobile viewport.

---

# 13. Phase 11 — Sample Handling

## Goal

Implement replacement for `Sample_Pos`.

---

## Features

- select Pile;
- select Batch;
- Rit From;
- Rit To;
- automatic increment range;
- overlap detection;
- Deliver To;
- Dispatcher;
- Not Picked Up;
- total bag calculation.

---

## Exit Criteria

Tests cover:

```text
valid range
overlapping range
SAP range
LIM range
undelivered sample
delivered sample
```

---

# 14. Phase 12 — Shift Handover Excel Import

## Goal

Allow current shift to continue work from previous shift archive.

This is a critical feature.

---

## Import Flow

```text
Select Previous Shift Excel
        ↓
Read App_Data
        ↓
Validate File
        ↓
Read Shift_Info
        ↓
Read Pending_Sample
        ↓
Read relevant Sample Position
        ↓
Preview Handover
        ↓
Confirm Import
```

---

## Validation

Check:

```text
FileType
SchemaVersion
Shift_ID
Date
Shift relationship
Required sheets
Required columns
Duplicate import
Data integrity
```

---

## Import Result

Import:

```text
carry-over state
historical reference
```

Do not copy previous shift haulage as current shift transactions.

---

## Duplicate Protection

Store:

```text
source_shift_id
file fingerprint
imported_at
```

---

## Exit Criteria

Tests cover:

```text
valid previous shift
wrong date
wrong shift
invalid file
unsupported schema
duplicate import
multiple pending batches
no pending work
```

---

# 15. Phase 13 — Excel Export

## Goal

Generate complete immutable archive at end of shift.

---

## Required Sheets

Initial contract:

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

## Machine Contract

Machine-readable field names must remain stable regardless of app language.

Example:

```text
Pile_ID
Batch
Rit
Truck_ID
Sample_Status
```

---

## App_Data

Minimum:

```text
FileType
SchemaVersion
ApplicationVersion
Shift_ID
ExportTimestamp
```

---

## Exit Criteria

A generated Excel file must be importable into the application again.

Mandatory test:

```text
Export Shift A
    ↓
Import Shift A archive
    ↓
Carry-over reconstructed correctly
```

This is a round-trip test.

---

# 16. Phase 14 — Reporting Engine

## Goal

Replace current Excel `Report` logic.

---

## Output

Generate:

```text
Header
Manpower
Production Summary
Sample Handling
Wrong Truck
Pending Samples
Totals
```

---

## Production Summary

Minimum:

```text
Pile
Ore
Rit
Batch
Increment
Wrong Truck
```

---

## Required Languages

```text
Indonesian
English
```

Report generator receives language as input.

Business calculations remain identical.

---

## Exit Criteria

Report values match reference scenarios derived from workbook.

---

# 17. Phase 15 — WhatsApp-Friendly Report

## Goal

Provide field-ready communication output.

---

## Actions

```text
Preview
Copy
Share
```

Use native Web Share API where supported.

Do not make WhatsApp API a core dependency.

---

## Exit Criteria

On supported mobile browser/PWA:

```text
Generate
→ Share
→ device share sheet
```

works.

Copy fallback also works.

---

# 18. Phase 16 — Google Sheets Integration

## Goal

Add central master-data and shift-summary synchronization.

Do this only after core offline operation works.

---

## Google Sheets Responsibility

### Read

```text
Master data
```

### Write

```text
Shift summary
```

Google Sheets must not store an archive reference/link.

Do not send every haulage transaction by default.

---

## Offline Behavior

If Google access fails:

```text
shift operation continues
```

Sync status becomes pending.

---

## Sync Model

Conceptually:

```text
LOCAL_SAVE
   ↓
SYNC_PENDING
   ↓
SYNCED
```

or:

```text
SYNC_FAILED
```

with retry.

---

## Exit Criteria

Application remains fully usable when Google is unavailable.

---

# 19. Phase 17 — Archive Storage (CLOSED)

## Status

**CLOSED.** No managed cloud archive (Google Drive or otherwise) is implemented as part of the application. This phase does not require archive sync, outbox, or storage-service implementation.

## Confirmed Decision

The final Excel workbook generated at shift finalization remains the archive. It serves three roles simultaneously:

```text
shift archive
handover package
portable backup
```

The application does not upload, sync, or manage storage of this file.

## Operational Workflow

```text
Finalize Shift
      ↓
Export final XLSX
      ↓
User shares/stores it externally
(currently via the WhatsApp workflow)
      ↓
Next shift imports the previous XLSX when required
```

Google Drive automatic archive storage is explicitly **not** part of the application. Google Sheets integration remains limited to Master Data and Shift Summary (see Phase 16) and does not store an archive link/reference.

---

# 20. Phase 18 — PWA Hardening

## Goal

Make application reliable for field usage.

---

## PWA Requirements

```text
installable
manifest
service worker
offline application shell
cached assets
update handling
```

---

## Critical UX States

Display:

```text
Online
Offline
Unsynced Data
Sync Failed
Update Available
```

---

## Update Safety

A new service worker/application release must not silently destroy active shift data.

---

## Exit Criteria

Application can perform a test shift while device remains offline.

---

# 21. Phase 19 — Recovery and Data Safety

## Goal

Handle real field failure scenarios.

Test:

```text
browser refresh
app closed accidentally
device restart
network lost
network returns
duplicate button tap
invalid Excel import
duplicate Excel import
master data unavailable
```

---

## Recovery Features

Consider:

```text
Local backup
Export emergency backup
Recover active shift
```

---

# 22. Phase 20 — Audit and Correction

## Goal

Replace uncontrolled Excel cell editing with controlled corrections.

---

## Required Metadata

```text
createdAt
createdBy
updatedAt
updatedBy
```

For sensitive edits:

```text
previousValue
newValue
reason
```

---

## No Hard Delete

Finalized operational transactions should normally use:

```text
VOID
CORRECTED
```

rather than physical deletion.

Final behavior depends on confirmed operational policy.

---

# 23. Phase 21 — Finalization Workflow

## Goal

Define safe shift closing.

---

## Before Finalization

Application checks:

```text
Incomplete entries
Pending samples
Unsaved state
Invalid sample ranges
Critical warnings
```

---

## Finalization

Process:

```text
Validate
→ Generate Report
→ Generate Excel
→ Save Archive
→ Create Summary
→ Mark Shift FINALIZED
```

After finalized, editing must be restricted.

---

# 24. Phase 22 — Deployment Pipeline

## Goal

Automate releases through GitHub.

---

## Pipeline

```text
Push / Merge
      ↓
GitHub Actions
      ↓
Lint
Typecheck
Tests
Build
      ↓
Deploy
```

---

## Environments

Initially:

```text
development
production
```

Add staging if field-testing requirements justify it.

---

## Version

Every production release tagged:

```text
v0.x.x
v1.0.0
```

Application version embedded in generated Excel.

---

# 25. Phase 23 — Field Testing

## Goal

Verify application against real operational behavior.

Do not test only with ideal data.

---

## Test Scenarios

Minimum:

```text
normal SAP pile
normal LIM pile
multiple piles
multiple pending batches
wrong truck
skipped haulage
sample overlap
sample not picked up
shift with no pending
shift with pending
offline full shift
handover between devices
```

---

## Comparison

Run selected shifts using:

```text
Existing Excel
vs
New Application
```

Compare:

```text
Batch
Rit
Sample selection
Increment
Wrong Truck
Pending
Bag
Final Report
```

---

# 26. Phase 24 — Production Readiness

Before v1.0.0:

```text
Domain tests passing
Integration tests passing
Excel round-trip passing
Offline test passing
Bilingual UI complete
Bilingual report complete
Recovery tested
Deployment automated
Backup strategy documented
User guide available
```

---

# 27. Suggested Release Milestones

## v0.1 — Domain Prototype

Contains:

```text
Domain model
Sampling engine
Batch engine
Pending logic
Fleet validation
Unit tests
```

No production UI required.

---

## v0.2 — Offline Field Prototype

Contains:

```text
Shift registration
Fleet setup
Pile operations
Local database
Basic mobile UI
```

---

## v0.3 — Complete Sampling Workflow

Contains:

```text
Sample Position
Wrong Truck
Skipped haulage
Pending samples
Reporting
```

---

## v0.4 — Handover

Contains:

```text
Excel export
Excel import
Previous shift continuity
Round-trip tests
```

---

## v0.5 — Integration

Contains:

```text
Google master sync
Shift summary sync
```

---

## v0.6 — Field Beta

Contains:

```text
PWA install
Offline hardening
Recovery
Audit
Bilingual complete
```

---

## v1.0 — Production

Requires:

```text
field validation
data safety validation
documentation
release pipeline
production deployment
```

---

# 28. Priority Order

If scope or development time becomes constrained, priority is:

```text
1. Data correctness
2. Sampling rule correctness
3. Shift continuity
4. Offline reliability
5. Auditability
6. Excel archive
7. Report correctness
8. Mobile usability
9. Google synchronization
10. Visual polish
```

A visually polished application with incorrect sampling logic is considered failed.

---

# 29. Claude Code Implementation Rule

For every feature, Claude Code should work in this order:

```text
Read documentation
      ↓
Identify Business Rule IDs
      ↓
Design domain function
      ↓
Write test
      ↓
Implement logic
      ↓
Run tests
      ↓
Integrate storage
      ↓
Integrate UI
```

Do not start from page/component implementation for domain-heavy features.

---

# 30. Definition of Done

A feature is not considered complete merely because the UI works.

Definition of Done:

```text
Business rule mapped
Type-safe implementation
Unit tests
Error handling
Persistence considered
Offline behavior considered
i18n implemented
No hard-coded localized domain values
Documentation updated if behavior changes
Build passes
```

---

# 31. Supervisor Review Gates

Before proceeding between major milestones, review should occur at:

```text
GATE 1
Project Foundation

GATE 2
Domain + Sampling Engine

GATE 3
Fleet + Haulage Engine

GATE 4
Local Database + Field UI

GATE 5
Sample Handling

GATE 6
Excel Import / Export

GATE 7
Reporting

GATE 8
Google Integration

GATE 9
Offline/PWA Hardening

GATE 10
Production Release
```

At each gate:

```text
Review architecture compliance
Review business-rule compliance
Review tests
Review technical debt
Decide whether next phase may start
```

Claude Code should not independently redefine architecture decisions at these gates.