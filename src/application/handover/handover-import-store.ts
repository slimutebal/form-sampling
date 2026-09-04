import type { Result } from '@/domain/common/result'

/**
 * Application-owned failure shape for this port. Only the stable `code`
 * is part of the contract — presentation maps it to translated copy,
 * never a raw infrastructure `.message`.
 */
export interface HandoverImportStoreError {
  readonly code: string
}

/**
 * The smallest slice of `LocalOperationalStore` the Handover import
 * preview step depends on, expressed purely in application/domain
 * types. Nothing in `src/application/**` may import from
 * `src/infrastructure/**` — `LocalOperationalStore` structurally
 * satisfies this port already, so the production singleton is passed
 * directly with no adapter (mirrors `SampleHandlingStore`).
 *
 * Deliberately read-only: there is no `recordImport`/write method on
 * this port. Durable duplicate-import protection is committed only as
 * part of `LocalOperationalStore.initializeShiftWorkspace`'s optional
 * `handoverImport` parameter, atomically with the Shift workspace/carry-
 * over write — never standalone. A standalone write method here would
 * let a fingerprint be "consumed" before its carry-over state is ever
 * durably attached to a Shift (the exact bug this port shape prevents
 * by construction). `hasImportedFingerprint` is a preview-time,
 * best-effort, non-destructive check only — the atomic write inside
 * `initializeShiftWorkspace` is the sole authoritative guard.
 */
export interface HandoverImportStore {
  hasImportedFingerprint(fingerprint: string): Promise<Result<boolean, HandoverImportStoreError>>
}
