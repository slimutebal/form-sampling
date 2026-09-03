# Form Sampling — Technical Stack

**Status:** Draft v0.1  
**Project:** Form Sampling  
**Target:** Mobile-first PWA for Android and iOS  
**Development:** VS Code + Claude Code  
**Source Control:** GitHub

**Related Documents:**
- `docs/ARCHITECTURE.md`
- `docs/BUSINESS_RULES.md`
- `docs/ROADMAP.md`
- `docs/UI_UX_SPEC.md`
- `docs/Form_Sampling.xlsx`

---

# 1. Purpose

Dokumen ini mengunci technical stack utama Form Sampling.

Pemilihan teknologi mengikuti requirement:

```text
Mobile-first
Android + iOS
PWA
Offline-first
Local operational database
Excel import/export
Shift handover
Bilingual ID/EN
GitHub CI/CD
Future Google Sheets integration
High business-rule testability
```

Prinsip utama:

> Technology serves the domain. Business rules must not depend on framework, database library, Excel library, or hosting provider.

---

# 2. Stack Summary

Recommended stack:

| Area | Technology |
|---|---|
| Runtime | Node.js 24 |
| Package Manager | npm |
| Language | TypeScript |
| UI Framework | React 19 |
| Build Tool | Vite 8 |
| Routing | React Router 8 |
| Styling | Tailwind CSS 4 |
| UI Components | shadcn/ui selectively |
| UI Primitive | Radix-based components |
| Icons | Lucide |
| Local Database | IndexedDB |
| IndexedDB Wrapper | Dexie.js |
| Form State | React Hook Form |
| Schema Validation | Zod 4 |
| i18n | i18next + react-i18next |
| Excel | SheetJS Community Edition |
| PWA | vite-plugin-pwa |
| Service Worker | Workbox via vite-plugin-pwa |
| Unit Tests | Vitest |
| Component Tests | Testing Library |
| E2E Tests | Playwright |
| IndexedDB Tests | fake-indexeddb |
| Lint | ESLint |
| Formatting | Prettier |
| Source Control | Git + GitHub |
| CI/CD | GitHub Actions |
| Hosting | Not locked yet |
| Google Integration | Adapter-based, decision deferred |

---

# 3. ADR-012 — Runtime

Use:

```text
Node.js 24
```

Development and CI must use the same major Node version.

Repository should contain:

```text
.nvmrc
```

or equivalent version declaration.

Example:

```text
24
```

`package.json` should also declare supported engine.

Example:

```json
{
  "engines": {
    "node": ">=24 <25"
  }
}
```

The exact patch version is controlled through development environment and CI where appropriate.

---

# 4. ADR-013 — Package Manager

Use:

```text
npm
```

Reason:

```text
widely available
minimal developer setup
works directly with Node
simple integration with Claude Code
first-class GitHub Actions support
package-lock provides reproducibility
```

Repository must commit:

```text
package-lock.json
```

CI must use:

```text
npm ci
```

not:

```text
npm install
```

to ensure deterministic dependency installation.

---

# 5. ADR-014 — Language

Use:

```text
TypeScript
```

with strict type checking.

Required:

```text
strict: true
```

Avoid:

```text
any
```

unless an explicit technical reason exists.

External/untrusted data must be parsed before becoming trusted domain data.

TypeScript types alone are not sufficient for runtime validation.

---

# 6. ADR-015 — Frontend Framework

Use:

```text
React 19
```

Reason:

```text
mature ecosystem
strong TypeScript support
good PWA compatibility
excellent testing ecosystem
large component ecosystem
well supported by Claude Code
```

React is a presentation/application orchestration layer.

React must not contain the core sampling calculations.

Wrong:

```text
PilePage.tsx
→ calculates sampling interval
→ calculates batch
→ validates truck
```

Correct:

```text
PilePage
→ calls application use case
→ domain engine calculates
→ page renders result
```

---

# 7. ADR-016 — Build Tool

Use:

```text
Vite 8
```

for:

```text
development server
TypeScript build
React bundling
PWA integration
production build
```

The project does not require a server-rendered React framework for the initial architecture.

Reason:

```text
Application is primarily client-side
Offline-first
Local database is primary during field work
No SEO requirement
Static deployment remains possible
```

---

# 8. ADR-017 — Routing

Use:

```text
React Router 8
```

Client-side routes conceptually:

```text
/
├── /start
├── /handover
├── /home
├── /piles
├── /piles/:pileId
├── /samples
├── /samples/:sampleId
├── /report
└── /more
```

Routing must not become the place for domain calculations.

---

# 9. Hosting and Router Compatibility

Hosting has not been locked.

If normal static hosting with SPA fallback is used:

```text
Browser Router
```

is preferred.

If GitHub Pages is selected and SPA fallback behavior becomes problematic, evaluate:

```text
Hash Router
```

or an appropriate GitHub Pages SPA fallback configuration.

Do not make the entire architecture dependent on GitHub Pages routing behavior.

---

# 10. ADR-018 — Styling

Use:

```text
Tailwind CSS 4
```

Reason:

```text
fast mobile UI development
consistent spacing
responsive utilities
small production CSS
easy implementation of design tokens
good Vite integration
```

Tailwind classes belong to the presentation layer only.

---

# 11. Browser Compatibility Warning

Tailwind CSS 4 targets modern browsers.

Initial browser target:

```text
Android:
modern Chrome / Chromium-based browser

iOS:
Safari 16.4+
```

Before production rollout, actual field devices must be inventoried.

If company devices require significantly older browsers, browser support must be re-evaluated before UI implementation becomes extensive.

Do not discover this limitation during final field testing.

---

# 12. ADR-019 — UI Component Strategy

Use:

```text
shadcn/ui
```

selectively.

Do not install/use every available component.

Initial likely components:

```text
Button
Card
Dialog
AlertDialog
Input
Select
Tabs
Sheet
Progress
Badge
Toast/Sonner
Dropdown
Command/Search Picker
```

shadcn-generated components become source code inside the repository and may be modified to follow `UI_UX_SPEC.md`.

---

# 13. UI Component Rule

Default shadcn styling is not the product design.

Components must be adjusted for:

```text
mobile touch targets
field readability
one-handed use
safe area
large operational values
Android/iOS viewport
bilingual labels
```

Desktop-looking shadcn examples must not simply be copied into production screens.

---

# 14. UI Primitives

Prefer accessible Radix-based primitives through the chosen shadcn configuration for controls such as:

```text
Dialog
Alert Dialog
Select
Popover
Tabs
```

Avoid custom implementation of accessibility-sensitive components unless necessary.

---

# 15. ADR-020 — Icons

Use:

```text
Lucide
```

for application icons.

Example semantics:

```text
Home
Truck
Package
File
Alert
Wifi
WifiOff
Check
Chevron
Settings
```

Icons must not replace text for critical operational information.

Example:

Wrong:

```text
⚠
```

Correct:

```text
⚠ WRONG TRUCK
```

---

# 16. ADR-021 — Local Database

Use browser:

```text
IndexedDB
```

as the operational storage engine.

Use:

```text
Dexie.js
```

as the IndexedDB abstraction.

---

# 17. Why IndexedDB

Do not use `localStorage` for operational transactions.

`localStorage` is suitable only for very small preferences.

Operational data includes:

```text
Shift
Fleet
Pile
Pending Batch
Haulage
Sampling
Sample Handling
Import History
Sync Queue
```

which requires:

```text
structured storage
indexes
transactions
larger capacity
async access
migration capability
```

IndexedDB is appropriate for this.

---

# 18. Dexie Responsibility

Dexie handles:

```text
database schema
IndexedDB access
queries
transactions
schema migrations
reactive local queries
```

Domain objects must not call Dexie directly.

Required dependency direction:

```text
UI
↓
Application
↓
Repository Interface
↓
Dexie Repository Implementation
↓
IndexedDB
```

---

# 19. Local Database Is Source of Operational Truth

During an active shift:

```text
IndexedDB
```

is the primary operational source of truth.

Not:

```text
React state
Google Sheets
network cache
Excel file
```

React UI reads current state from repositories/local database.

This is critical for crash/reload recovery.

---

# 20. ADR-022 — Application State

Do not introduce Redux or Zustand initially.

Use:

```text
Dexie
```

for persistent operational state.

Use:

```text
React local state
React Context
```

for small ephemeral application/UI state such as:

```text
current language
temporary navigation context
open dialog
selected tab
temporary form state
```

If state complexity later demonstrates a real need for a separate state-management library, the decision can be revisited.

Do not add state libraries pre-emptively.

---

# 21. Domain State vs UI State

Examples:

Domain:

```text
Batch 24
Rit 16
Pile L18_S09
WRONG_TRUCK
Pending Batch
```

stored in operational data/domain.

UI:

```text
dialogOpen
searchText
activeTab
drawerOpen
```

kept in React UI state.

Do not mix them.

---

# 22. ADR-023 — Forms

Use:

```text
React Hook Form
```

for form state where forms have enough complexity to justify it.

Examples:

```text
Shift Registration
Fleet Setup
Sample Delivery
Correction
```

For a simple one-field interaction, normal controlled/uncontrolled React input may be sufficient.

Do not force React Hook Form into every button interaction.

---

# 23. ADR-024 — Runtime Schema Validation

Use:

```text
Zod 4
```

at system boundaries.

Primary use cases:

```text
Excel import
Google response
Google request payload
configuration
master data import
environment variables
form structure where useful
```

---

# 24. Zod Is Not the Business Rule Engine

Example:

Zod may validate:

```text
rit is an integer
batch is positive
Pile_ID is a string
```

Domain engine determines:

```text
whether Rit 16 is a sample
whether Batch rolls over
whether truck belongs to fleet
whether sample range overlaps
```

Do not move operational business rules into giant Zod schemas.

---

# 25. ADR-025 — Internationalization

Use:

```text
i18next
react-i18next
```

Languages:

```text
id
en
```

Recommended structure:

```text
src/i18n/
├── index.ts
├── locales/
│   ├── id/
│   │   ├── common.json
│   │   ├── shift.json
│   │   ├── pile.json
│   │   ├── sample.json
│   │   └── report.json
│   └── en/
│       ├── common.json
│       ├── shift.json
│       ├── pile.json
│       ├── sample.json
│       └── report.json
```

Avoid one enormous translation file.

---

# 26. Translation Rule

Business status:

```text
WRONG_TRUCK
```

remains:

```text
WRONG_TRUCK
```

in domain/storage.

Translation only happens in presentation:

```text
id:
Unit DT Tidak Sesuai

en:
Wrong Truck
```

---

# 27. Application Language and Report Language

Store separately:

```text
applicationLanguage
reportLanguage
```

Example:

```text
applicationLanguage = id
reportLanguage = en
```

This allows Indonesian UI with English WhatsApp report.

---

# 28. ADR-026 — Date and Time

Avoid introducing a large date library initially.

Store:

Date-only operational value:

```text
YYYY-MM-DD
```

Example:

```text
2026-09-03
```

Timestamp:

```text
ISO 8601
```

or epoch timestamp where technically appropriate.

Display formatting uses:

```text
Intl.DateTimeFormat
```

Timezone-sensitive code must be explicit.

Do not rely on ambiguous date strings such as:

```text
03/09/26
```

inside domain/storage.

---

# 29. Shift Timezone

Shift data must carry or operate under an explicitly configured operational timezone.

Do not silently derive business date solely from device timezone if the device can be incorrectly configured.

Timezone configuration should become part of application/site configuration.

---

# 30. ADR-027 — IDs

Use browser cryptographic UUID generation:

```text
crypto.randomUUID()
```

for internal IDs where supported by target browser policy.

Examples:

```text
shiftId
transactionId
sampleId
auditEventId
```

Human-readable codes remain separate.

Example:

```text
Internal:
550e8400-e29b-41d4-a716-446655440000

Display:
20260903-DS-BR1
```

---

# 31. ADR-028 — Excel Library

Use:

```text
SheetJS Community Edition
```

as the initial Excel engine.

Responsibilities:

```text
Read previous shift XLSX
Validate workbook structure
Read machine-readable sheets
Generate XLSX archive
Generate handover sheets
Generate simple human-readable report sheet
```

---

# 32. Excel Design Principle

Do not use Excel formula evaluation as part of runtime application logic.

Generated Excel should mainly contain:

```text
values
structured records
human-readable formatting
machine-readable metadata
```

The PWA calculates business values before export.

Wrong:

```text
PWA exports formulas
→ Excel calculates business result
```

Correct:

```text
PWA domain engine calculates
→ Excel stores result
```

---

# 33. Excel Styling Scope

Initial Excel requirement prioritizes:

```text
correct data
stable schema
successful handover
readability
```

over advanced Excel visual formatting.

If later requirements demand:

```text
complex styled templates
images
advanced formatting
pivot/chart generation
```

the Excel implementation can be re-evaluated separately.

Do not introduce multiple Excel libraries unless a demonstrated requirement exists.

---

# 34. Excel Bundle Strategy

Spreadsheet processing libraries can be relatively large.

Excel module should be lazy-loaded.

Conceptually:

```text
Normal field operation
→ Excel library not loaded

Import / Export requested
→ dynamically load Excel module
```

This keeps startup and haulage workflow lighter.

---

# 35. Excel Service Boundary

Create interface such as:

```text
ExcelArchiveService
```

Responsibilities:

```text
importPreviousShift(file)
exportShift(shiftId)
validateArchive(file)
```

UI must not directly call SheetJS APIs.

---

# 36. Excel Schema Validation

Imported workbook is untrusted input.

Flow:

```text
File
↓
SheetJS parse
↓
Raw objects
↓
Zod schema validation
↓
Application import model
↓
Domain validation
```

Never:

```text
Excel
↓
direct database insert
```

---

# 37. ADR-029 — PWA

Use:

```text
vite-plugin-pwa
```

with Workbox integration.

Responsibilities:

```text
Web App Manifest
Service Worker
Offline application shell
Static asset caching
PWA installation support
Application update detection
```

---

# 38. Service Worker Strategy

Initial approach:

```text
cache application shell
cache versioned static assets
```

Operational data remains in:

```text
IndexedDB
```

not Service Worker cache.

Service Worker cache and IndexedDB have different responsibilities.

---

# 39. PWA Update Strategy

Do not force automatic application reload while an active shift is being recorded.

Preferred update behavior:

```text
New version detected
↓
Show Update Available
↓
User updates at safe point
```

Initial PWA registration should therefore favor:

```text
prompted update
```

rather than uncontrolled auto-reload.

---

# 40. Background Sync Rule

Do not make correctness depend on browser Background Sync API.

Reason:

```text
browser capability differs
iOS behavior may differ
PWA may be killed by operating system
```

Sync design:

```text
Save locally
↓
Mark SYNC_PENDING
↓
When application is online/active:
attempt sync
↓
SYNCED or SYNC_FAILED
```

Browser background capability can later optimize this process, but must not be required.

---

# 41. ADR-030 — Web Share

Use native:

```text
navigator.share()
```

where supported.

Use feature detection:

```text
if navigator.share ...
```

Do not detect behavior only by Android/iOS user-agent string.

Fallbacks:

WhatsApp text:

```text
Copy to Clipboard
```

Excel:

```text
Save / Download File
```

The app must remain usable when native sharing is unavailable.

---

# 42. ADR-031 — Unit Testing

Use:

```text
Vitest
```

for:

```text
domain tests
application tests
utility tests
repository tests
Excel parser tests
```

Business-rule tests are critical.

---

# 43. Domain Testing Priority

Highest test coverage priority:

```text
Sampling Engine
Batch Progression
Pending Batch
Fleet Validation
Wrong Truck
Skipped Haulage
Sample Overlap
Bag Calculation
Handover
Report Aggregation
```

UI snapshot coverage is lower priority than business logic correctness.

---

# 44. ADR-032 — Component Testing

Use:

```text
Testing Library
```

for React component and interaction tests.

Tests should query UI through user-observable semantics where possible.

Examples:

```text
button labels
form labels
roles
status messages
```

Avoid tests tightly coupled to internal component implementation.

---

# 45. ADR-033 — IndexedDB Testing

Use:

```text
fake-indexeddb
```

for automated Dexie repository tests where browser IndexedDB is not directly available.

Critical repository logic should be testable without requiring a physical phone.

---

# 46. ADR-034 — End-to-End Testing

Use:

```text
Playwright
```

for browser-level scenarios.

Target test projects should include at minimum:

```text
Chromium mobile
WebKit mobile
Desktop Chromium for debugging
```

Representative viewports should follow `UI_UX_SPEC.md`.

---

# 47. E2E Critical Flows

Automate where practical:

```text
Start Shift
Import Handover
Open Pile
Record Haulage
Wrong Truck
Sampling Event
Sample Handling
Report
Finalize
Excel Export
Resume after reload
```

---

# 48. Real Device Testing Still Required

Browser emulation does not replace actual device testing.

Before production:

```text
Physical Android device
Physical iPhone
```

must test:

```text
PWA install
offline startup
keyboard
safe areas
file picker
Excel import
Excel export
share sheet
clipboard
app resume
storage persistence
service worker update
```

---

# 49. ADR-035 — Linting

Use:

```text
ESLint
```

with TypeScript and React appropriate rules.

Lint should detect issues such as:

```text
unused code
unsafe TypeScript patterns
React hook misuse
accidental imports
```

Domain layer boundary rules may later be reinforced with lint rules.

---

# 50. ADR-036 — Formatting

Use:

```text
Prettier
```

Formatting is automated.

Code review should focus on:

```text
logic
architecture
data correctness
tests
```

not whitespace preferences.

---

# 51. Architecture Import Boundaries

Recommended dependency direction:

```text
domain
↑
application
↑
infrastructure / storage / integrations
↑
features / UI
```

More precisely:

```text
domain
```

must not import:

```text
React
Dexie
SheetJS
i18next
Google APIs
```

---

# 52. Proposed Source Structure

```text
src/
├── app/
│   ├── router/
│   ├── providers/
│   └── startup/
│
├── domain/
│   ├── shift/
│   ├── pile/
│   ├── haulage/
│   ├── sampling/
│   ├── fleet/
│   ├── sample-handling/
│   └── report/
│
├── application/
│   ├── use-cases/
│   ├── ports/
│   └── services/
│
├── infrastructure/
│   ├── database/
│   ├── repositories/
│   └── device/
│
├── integrations/
│   ├── excel/
│   └── google/
│
├── features/
│   ├── shift/
│   ├── handover/
│   ├── home/
│   ├── piles/
│   ├── samples/
│   ├── report/
│   └── settings/
│
├── components/
│   ├── ui/
│   └── shared/
│
├── i18n/
│
├── schemas/
│
├── styles/
│
├── test/
│
└── main.tsx
```

---

# 53. Domain Folder Rule

Domain code should be framework-neutral.

Example:

```text
src/domain/sampling/
├── sampling-rule.ts
├── sampling-engine.ts
├── sampling-event.ts
└── sampling-engine.test.ts
```

A file in this directory should generally be understandable without knowing React.

---

# 54. Application Layer

Application layer coordinates use cases.

Example:

```text
recordHaulage()
```

may:

```text
Load current pile
Load sampling rule
Determine next batch/rit
Validate truck
Create transaction
Persist transaction
Return result
```

Individual domain calculations remain in domain services/functions.

---

# 55. Repository Interfaces

Define repository contracts in application/domain boundary.

Examples:

```text
ShiftRepository
PileRepository
HaulageRepository
FleetRepository
SampleRepository
MasterDataRepository
```

Dexie implements these contracts.

This allows future storage changes without rewriting business logic.

---

# 56. ADR-037 — Remote Data / Google State

Do not use remote server cache as the operational database.

Initial Google integration should be behind:

```text
MasterDataGateway
ShiftSummaryGateway
ArchiveGateway
```

Application code calls interfaces, not Google SDK directly.

---

# 57. Google Integration Is Deferred

The exact implementation is not locked yet.

Possible approaches may include:

```text
Google Sheets API with user OAuth
lightweight trusted backend
serverless API
Google Apps Script
```

Selection occurs during Google Integration roadmap phase after requirements for:

```text
authentication
permissions
organization accounts
security
archive ownership
```

are understood.

---

# 58. Critical Google Security Rule

Never place:

```text
Google service account private key
private OAuth client secret
server credentials
```

inside the PWA source code.

A static frontend is distributed to users and cannot safely protect server-side secrets.

Environment variables included in a Vite client bundle are not secret merely because they are stored in `.env`.

---

# 59. Public Configuration vs Secret

Safe client configuration may include items intended to be public, depending on provider:

```text
public application identifiers
public API endpoint
feature flags
```

Secret:

```text
private keys
service account credential
backend signing secret
```

must never ship to browser code.

---

# 60. ADR-038 — Remote Sync Architecture

Sync state should live locally.

Example:

```text
SyncQueue {
    id
    entityType
    entityId
    action
    createdAt
    attemptCount
    lastError
    status
}
```

Possible states:

```text
PENDING
SYNCING
SYNCED
FAILED
```

Network connectivity must not determine whether a local transaction can be recorded.

---

# 61. ADR-039 — Backend

Initial application phases:

```text
NO REQUIRED CUSTOM BACKEND
```

Core application must be able to perform:

```text
shift operation
sampling
local persistence
handover
report
Excel import/export
```

without a custom server.

Backend introduction must have a concrete requirement.

Possible future reasons:

```text
secure Google write access
central authentication
central audit
managed archive
multi-device synchronization
administration portal
```

---

# 62. ADR-040 — Hosting

Hosting provider remains:

```text
TBD
```

Requirements:

```text
HTTPS
static PWA support
service worker support
SPA routing support
reliable deployment
GitHub Actions integration
```

Candidates can be evaluated later.

GitHub repository remains independent from the hosting target.

---

# 63. GitHub Pages

GitHub Pages remains a candidate if final production architecture is primarily static.

Before selecting it, verify:

```text
routing strategy
PWA base path
service worker scope
organization access requirements
Google OAuth redirect requirements
production domain requirements
```

Do not select hosting purely because source code is stored in GitHub.

---

# 64. ADR-041 — GitHub Actions

Minimum CI pipeline:

```text
Checkout
↓
Setup Node
↓
npm ci
↓
Lint
↓
Type Check
↓
Unit Tests
↓
Build
```

Commands:

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

---

# 65. E2E CI

Playwright can run separately:

```text
npm run test:e2e
```

E2E may initially run:

```text
pull request
main branch
release
```

depending on runtime cost.

Critical release pipeline should eventually require E2E success.

---

# 66. Build Failure Rule

Production deployment must not proceed when:

```text
lint fails
typecheck fails
unit tests fail
build fails
required E2E fails
```

Do not deploy a known failing build manually.

---

# 67. Dependency Policy

Do not add a dependency just because it simplifies a few lines of code.

Before adding package:

```text
Is it necessary?
Is it actively maintained?
Does browser support match?
What is bundle impact?
Can platform API solve it?
Does it introduce domain coupling?
```

Critical dependencies must have a clear responsibility.

---

# 68. Dependency Update Policy

Use lockfile-controlled versions.

Dependency updates should:

```text
occur intentionally
run CI
run domain tests
run Excel round-trip tests where relevant
run PWA build
```

Do not automatically merge dependency updates into production without validation.

---

# 69. Excel Round-Trip Test

A mandatory integration test:

```text
Create Shift A
↓
Export XLSX
↓
Read exported XLSX
↓
Validate schema
↓
Reconstruct carry-over
↓
Compare expected state
```

This test protects shift handover compatibility.

---

# 70. Schema Versioning

Excel archive contains:

```text
SchemaVersion
ApplicationVersion
```

Database also has its own migration version.

These are separate concepts.

Example:

```text
App version:
0.4.0

Excel schema:
1

IndexedDB schema:
3
```

Do not assume they always change together.

---

# 71. IndexedDB Migration Rule

Dexie schema upgrades must be explicit.

Production data may exist locally when a new application version loads.

A schema migration must not silently destroy an active shift.

Migration tests are required once production data exists.

---

# 72. Service Worker vs Database Migration

New application release sequence must consider:

```text
new JavaScript bundle
new service worker
existing IndexedDB
active shift
```

Application startup should detect migration problems and fail safely.

Never clear IndexedDB as a routine fix for version mismatch.

---

# 73. Offline Development Requirement

A feature is not complete if it works only with development server/network connectivity when that feature is part of operational field workflow.

Field-critical features must be testable after:

```text
production build
PWA installation
network disconnected
```

---

# 74. Performance Strategy

Keep initial operational bundle small.

Strategies:

```text
lazy-load Excel module
route-level code splitting where useful
avoid large dashboard libraries
avoid heavy chart libraries
avoid unnecessary state libraries
cache static assets
query IndexedDB efficiently
```

---

# 75. No Chart Library Initially

Do not install:

```text
Chart.js
Recharts
ECharts
```

during initial development.

Charts are not a v1 core requirement.

Add only if later operational requirements justify them.

---

# 76. No Data Grid Initially

Do not install a large desktop data-grid library for primary field workflow.

Examples not needed initially:

```text
AG Grid
DataTables-style interface
```

Mobile field entry uses cards and focused workflows.

Supervisor/history screens can later evaluate a table solution if required.

---

# 77. No Native Mobile Framework Initially

Do not use initially:

```text
React Native
Flutter
Capacitor native shell
```

Target remains:

```text
PWA
```

If future field testing proves browser/PWA limitations unacceptable, native wrapping can be evaluated separately.

Domain and application layers should remain reusable if this occurs.

---

# 78. No Next.js Initially

Do not use Next.js for initial architecture.

Reason:

```text
No SSR requirement
No SEO requirement
Offline client is central
Static PWA deployment is desirable
Server architecture not yet required
```

Adding a full-stack framework now would add complexity without a demonstrated requirement.

---

# 79. No Firebase Initially

Do not introduce Firebase merely to obtain a backend.

Current architecture intentionally uses:

```text
local operational database
Google master/summary integration later
Excel archive
```

If future requirements introduce real-time centralized multi-user state, backend technology can be reconsidered.

---

# 80. No Google Sheets as Local State

React components must never behave like:

```text
Record Haulage
↓
Write Google Sheet
↓
Wait
↓
Show success
```

Correct flow:

```text
Record Haulage
↓
Domain validation
↓
IndexedDB transaction
↓
Show success
↓
Sync later if applicable
```

---

# 81. Error Handling Technology

Use typed application errors/results where meaningful.

Examples:

```text
WrongTruckError
InvalidHandoverError
UnsupportedSchemaError
DuplicateImportError
SampleOverlapError
```

Do not depend on raw library exception messages for user-facing UI.

Infrastructure error:

```text
QuotaExceededError
```

must be mapped to an application-understandable failure state.

---

# 82. Logging

Production logging strategy remains intentionally light initially.

Do not log operational data blindly to browser console.

Potentially sensitive operational data should not be sent to third-party telemetry without explicit architectural decision.

For development:

```text
structured development logging
```

is acceptable.

Remote telemetry is:

```text
TBD
```

---

# 83. Testing Folder Strategy

Tests should normally sit near the logic they protect.

Example:

```text
sampling-engine.ts
sampling-engine.test.ts
```

E2E:

```text
e2e/
├── shift.spec.ts
├── haulage.spec.ts
├── handover.spec.ts
├── offline.spec.ts
└── report.spec.ts
```

Test fixtures:

```text
test/
├── fixtures/
└── factories/
```

---

# 84. Test Data Factories

Create reusable factories:

```text
createShift()
createPile()
createTruck()
createFleet()
createSamplingRule()
createPendingBatch()
createHaulage()
```

Avoid hundreds of manually duplicated test objects.

---

# 85. Golden Reference Tests

For high-risk Excel migration rules, create reference scenarios based on known workbook results.

Example:

```text
SAP pending batch scenario
LIM batch scenario
multiple pending batch scenario
fleet reference scenario
```

Expected values should be committed to tests.

This protects against accidental business-rule regression.

---

# 86. Recommended Initial package Categories

Runtime:

```text
react
react-dom
react-router
dexie
dexie-react-hooks
react-hook-form
zod
i18next
react-i18next
lucide-react
```

UI/styling:

```text
tailwindcss
shadcn-generated dependencies as required
```

Excel:

```text
SheetJS CE
```

PWA:

```text
vite-plugin-pwa
```

Development:

```text
typescript
vite
@vitejs/plugin-react
vitest
Testing Library packages
fake-indexeddb
@playwright/test
eslint
prettier
```

Do not treat this as permission to install every possible companion package.

---

# 87. SheetJS Installation Note

SheetJS Community Edition distribution should follow its official installation guidance.

Do not assume the `xlsx` package from an arbitrary package registry is the latest authoritative release.

During bootstrap, Claude Code must check the official SheetJS installation method before installing.

The exact dependency source must be recorded in `package.json` and lockfile.

---

# 88. Feature Detection

For browser-specific features use capability detection.

Examples:

```text
navigator.share
navigator.canShare
serviceWorker
IndexedDB
clipboard
```

Do not build the application around:

```text
if Android ...
if iPhone ...
```

unless an actual platform-specific workaround is required.

---

# 89. Browser Storage Risk

Browser storage is robust but not equivalent to an enterprise server database.

Therefore application must eventually provide:

```text
shift Excel archive
handover export
sync status
recovery workflow
```

Operational data should not remain indefinitely only on one device.

---

# 90. Data Persistence Rule

Routine app actions must never call:

```text
localStorage.clear()
indexedDB.deleteDatabase()
```

as error recovery.

Any destructive data reset must be explicit, protected, and unavailable during active operational state unless a controlled recovery process exists.

---

# 91. Security Baseline

Initial client application must follow:

```text
No secrets in repository
No service account secrets in browser
Validate imported files
Escape/render user text safely
Use HTTPS in production
Limit dependency count
Audit dependency vulnerabilities
```

Authentication and authorization will receive a separate specification when integration requirements are confirmed.

---

# 92. File Import Safety

Excel upload constraints should include:

```text
.xlsx expected
reasonable file-size limit
schema validation
file type metadata validation
required sheets
required columns
supported schema version
```

A file with `.xlsx` extension alone is not considered trusted.

---

# 93. Mobile Download / Share Behavior

File generation should use:

```text
Blob
```

and appropriate browser APIs.

Because Android and iOS browser behavior differs, implementation must provide fallback.

Conceptual:

```text
Generate Excel Blob
↓
If file sharing supported
    Share
Else
    Download/save
```

---

# 94. CI Browser Matrix

Initial CI does not need every browser for every unit test.

Recommended:

Unit/domain:

```text
Node/Vitest
```

E2E:

```text
Chromium
WebKit
```

Firefox can be added if browser support requirement expands.

Physical devices remain part of release testing.

---

# 95. Technical Non-Goals v1

Do not build initially:

```text
Microservices
GraphQL
WebSockets
Real-time collaboration
Native mobile app
SSR
Complex backend
Data warehouse
BI dashboard
Custom authentication server
```

These technologies do not currently solve the core field problem.

---

# 96. Architecture Guardrail

Claude Code must not replace selected technologies without explicit approval.

Examples requiring review:

```text
React → Vue
Dexie → Firebase
Vite → Next.js
SheetJS → another Excel engine
Vitest → Jest
Tailwind → another CSS framework
```

A proposed change must document:

```text
problem
reason
impact
migration cost
benefit
```

before implementation.

---

# 97. Dependency Guardrail

Claude Code must not add packages for business calculations that can be implemented cleanly in domain code.

Example:

Do not add a package to calculate:

```text
rit % samplingInterval
```

Simple deterministic business logic belongs in the project.

---

# 98. Initial Technology Sequence

Bootstrap order:

```text
1. Node + npm
2. Vite + React + TypeScript
3. ESLint + Prettier
4. Vitest
5. Tailwind
6. shadcn base components
7. React Router
8. i18next
9. Zod
10. Dexie
11. React Hook Form
12. PWA plugin
13. Testing Library
14. Playwright
15. SheetJS only when Excel milestone begins
```

Important:

> Do not install every future dependency on day one.

Dependencies should be introduced when their phase begins.

---

# 99. Initial Bootstrap Scope

The first Claude Code implementation should only establish:

```text
React
Vite
TypeScript strict
Router
Tailwind
minimal shadcn
i18n ID/EN
Vitest
ESLint
Prettier
GitHub-ready scripts
basic application shell
```

It should not yet implement:

```text
Excel
Google Sheets
full IndexedDB schema
sampling workflow
report
```

Those follow roadmap gates.

---

# 100. Definition of Technical Foundation Done

Foundation is ready when:

```text
npm ci
npm run lint
npm run typecheck
npm run test
npm run build
```

all pass.

Additionally:

```text
Android-sized viewport works
iPhone-sized viewport works
ID/EN switch works
router works
no horizontal scrolling
basic app shell renders
CI configuration passes
```

No business feature needs to exist yet.

---

# 101. Final Stack Decision

Initial approved stack:

```text
Node.js 24
npm

TypeScript

React 19
Vite 8
React Router 8

Tailwind CSS 4
shadcn/ui selectively
Radix-based primitives
Lucide

IndexedDB
Dexie.js

React Hook Form
Zod 4

i18next
react-i18next

SheetJS Community Edition

vite-plugin-pwa / Workbox

Vitest
Testing Library
fake-indexeddb
Playwright

ESLint
Prettier

Git
GitHub
GitHub Actions
```

Deferred decisions:

```text
Production hosting
Authentication
Google Sheets access architecture
Archive cloud storage implementation
Remote telemetry
Custom backend
```

---

# 102. Core Technical Principle

The application architecture must remain:

```text
React UI
    ↓
Application Use Cases
    ↓
Domain Engine
    ↓
Repository Interfaces
    ↓
Dexie / IndexedDB
```

External systems remain adapters:

```text
Excel
Google Sheets
Cloud Archive
Native Share
```

None of these external systems may become the owner of the core sampling business logic.