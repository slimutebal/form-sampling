/**
 * One caller-supplied delivery destination option (docs/ROADMAP.md
 * Phase 11 §9). No current MasterData collection is confirmed as the
 * authoritative destination catalog, so this is deliberately an
 * explicit application/caller input rather than a MasterData lookup —
 * production `/samples` wiring is only added once a legitimate source
 * exists. `code` is the stable, language-neutral stored value; `label`
 * is optional presentation text.
 */
export interface DeliveryDestinationOption {
  readonly code: string
  readonly label?: string
}
