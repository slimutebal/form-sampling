# Form Sampling — GitHub Development Workflow

**Status:** v0.1  
**Repository:** `slimutebal/form-sampling`  
**Repository Visibility:** Private  
**Application Deployment:** Public URL

## 1. Purpose

GitHub digunakan sebagai:

- Source control
- Version history
- Pull request review
- Issue tracking
- CI/CD
- Release management
- Deployment pipeline

Repository merupakan source of truth untuk source code aplikasi.

Operational shift data dan production Excel archives tidak disimpan di Git repository.

## 2. Repository

```text
Owner: slimutebal
Repository: form-sampling
Visibility: PRIVATE
Default Branch: main
```

Target deployment:

```text
Source Code       PRIVATE
Application URL   PUBLIC
Operational Data  PRIVATE
Google Sheets     PRIVATE
Excel Archives    PRIVATE
```

## 3. Local Workspace

Primary development workspace:

```text
D:\Workspace\form-sampling
```

Remote repository:

```text
origin
https://github.com/slimutebal/form-sampling.git
```

## 4. Branch Strategy

Default branch:

```text
main
```

Development dilakukan menggunakan short-lived branch:

```text
feature/*
fix/*
refactor/*
docs/*
chore/*
```

Examples:

```text
feature/project-foundation
feature/sampling-engine
feature/excel-handover
fix/wrong-truck-validation
docs/update-business-rules
```

Substantial feature development tidak dilakukan langsung pada `main`.

## 5. Development Flow

```text
main
  ↓
create feature branch
  ↓
implementation
  ↓
tests
  ↓
commit
  ↓
push
  ↓
Pull Request
  ↓
review
  ↓
CI passes
  ↓
merge
  ↓
main
```

## 6. Claude Code Rule

Claude Code harus bekerja pada dedicated branch untuk substantial implementation.

Example:

```bash
git switch main
git pull

git switch -c feature/project-foundation
```

Claude Code tidak boleh mengubah architecture decision atau business rule secara sepihak.

## 7. Commit Convention

Gunakan Conventional Commit style.

Recommended types:

```text
feat
fix
docs
test
refactor
chore
ci
build
```

Examples:

```text
feat: implement sampling interval engine

fix: prevent duplicate haulage transaction

docs: update architecture decisions

test: add SAP pending batch scenarios

refactor: extract fleet validation service

chore: configure vitest
```

Hindari commit message seperti:

```text
update
changes
fix stuff
```

## 8. Pull Requests

Major implementation menggunakan Pull Request.

PR minimal menjelaskan:

- What changed
- Why
- Relevant Business Rule IDs
- Tests performed
- Architecture impact
- Known limitations

Example:

```text
Business Rules:
BR-SAMPLE-001
BR-SAMPLE-002
BR-BATCH-001
```

## 9. Review Gate

Sebelum merge:

```text
Architecture compliant
Business rule mapped
Tests added
Tests passing
TypeScript passing
No unnecessary dependency
No secrets committed
Documentation updated when required
```

## 10. Main Branch Protection

Setelah CI tersedia, `main` harus dilindungi.

Recommended rules:

```text
Require pull request before merge
Require status checks
Block force pushes
Block branch deletion
```

Untuk solo development, mandatory reviewer dapat tetap optional.

CI tetap harus menjadi merge gate.

## 11. Required CI Checks

Initial:

```text
lint
typecheck
test
build
```

Later:

```text
e2e
```

dapat menjadi required check sebelum production release.

## 12. Merge Strategy

Recommended:

```text
Squash Merge
```

Feature branch dapat mempunyai beberapa development commit, tetapi `main` mempertahankan high-level history yang bersih.

Example:

```text
feat: implement sampling and batch engine (#12)
```

## 13. Branch Cleanup

Setelah PR berhasil di-merge:

```text
delete merged feature branch
```

Feature branches bersifat short-lived.

## 14. Secrets

Never commit:

```text
.env
Google credentials
OAuth secrets
Service account keys
API private keys
Tokens
Passwords
Production credentials
```

Jika secret dibutuhkan oleh deployment:

```text
GitHub Actions Secrets
```

atau secret storage dari hosting provider harus digunakan.

Vite frontend environment variables tidak dianggap secret jika nilainya masuk ke client bundle.

## 15. Excel Files

Project reference workbook:

```text
docs/Form_Sampling.xlsx
```

boleh berada di repository private.

Production archive seperti:

```text
Sampling_2026-09-03_DS.xlsx
Sampling_2026-09-03_NS.xlsx
```

tidak boleh di-commit.

Local operational export directories:

```text
exports/
archives/
```

harus di-ignore oleh Git.

Microsoft Office temporary files:

```text
~$*
```

juga harus di-ignore.

## 16. Documentation

Version-controlled project documentation:

```text
docs/
├── ARCHITECTURE.md
├── BUSINESS_RULES.md
├── ROADMAP.md
├── UI_UX_SPEC.md
├── TECH_STACK.md
├── GITHUB_SETUP.md
└── Form_Sampling.xlsx
```

Perubahan architecture atau confirmed business rule harus diikuti perubahan dokumentasi yang relevan.

## 17. GitHub Issues

Issues dapat digunakan untuk:

```text
confirmed bugs
business-rule questions
architecture decisions
technical debt
field-test findings
future enhancements
```

Suggested prefixes:

```text
[BUG]
[RULE]
[UX]
[TECH]
[FIELD]
```

Example:

```text
[RULE] Confirm exact Batch Complete definition
```

Setelah requirement dikonfirmasi, source of truth tetap harus diperbarui pada documentation.

## 18. Releases

Application menggunakan semantic versioning:

```text
v0.1.0
v0.2.0
v0.4.0
v1.0.0
```

Production deployment harus dapat ditelusuri ke:

```text
Git commit
+
Application version
```

Application version juga disimpan pada generated Excel archive melalui:

```text
App_Data.ApplicationVersion
```

## 19. Operational Data Boundary

GitHub repository dapat menyimpan:

```text
Application source code
Tests
Documentation
Configuration templates
Reference workbook
```

Repository tidak menyimpan:

```text
Production shift transactions
Production Excel archives
Google credentials
Employee operational exports
Device database backups
Secrets
```

## 20. Initial Repository Baseline

Initial commit:

```text
docs: establish project architecture baseline
```

Expected contents:

```text
.gitignore
docs/ARCHITECTURE.md
docs/BUSINESS_RULES.md
docs/Form_Sampling.xlsx
docs/ROADMAP.md
docs/TECH_STACK.md
docs/UI_UX_SPEC.md
docs/GITHUB_SETUP.md
```

Application code belum masuk initial baseline.

## 21. First Development Branch

Setelah baseline berhasil di-push:

```text
feature/project-foundation
```

digunakan untuk Phase 1.

Scope:

```text
Vite
React
TypeScript
Router
Tailwind
i18n ID/EN
Vitest
ESLint
Prettier
Basic mobile application shell
GitHub Actions CI
```

Tidak termasuk:

```text
Sampling business logic
Excel import/export
Google Sheets
Full IndexedDB schema
Production report
```

## 22. Supervisor Rule

Sebelum major feature di-merge, review harus memeriksa:

```text
Architecture
Business Rules
Roadmap Gate
Tests
Dependencies
Data Safety
Offline Implications
```

Feature yang technically working tetap dapat ditolak jika melanggar architecture atau business rule.