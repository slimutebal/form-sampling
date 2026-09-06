import type { FleetId, FrontId } from '../common/identifiers'
import type { FleetDefinition } from './fleet-definition'
import type { FrontDefinition } from './front'

/**
 * The subset of a FleetSetup (or raw FleetSetupInput) this module needs.
 * Structurally compatible with both, so a validated `FleetSetup` can be
 * passed directly without unwrapping its brand.
 */
export interface FrontLineageInput {
  readonly fronts: readonly FrontDefinition[]
  readonly fleets: readonly FleetDefinition[]
}

/**
 * Pure, no-stored-status derivation of Front continuation state (Fleet
 * Reference = continuation semantics): a Front referenced by exactly one
 * successor Front's DERIVED fleet is HISTORICAL; every other Front is
 * ACTIVE. `successorFrontIdByFrontId`/`predecessorFrontIdByFrontId` expose
 * the single direct link on each side of a continuation, for a Front that
 * has one. Independent lineages (Fronts with no reference relationship at
 * all) each resolve independently — there is no single shift-wide chain.
 */
export interface FrontLineage {
  readonly activeFrontIds: readonly FrontId[]
  readonly historicalFrontIds: readonly FrontId[]
  readonly successorFrontIdByFrontId: ReadonlyMap<FrontId, FrontId>
  readonly predecessorFrontIdByFrontId: ReadonlyMap<FrontId, FrontId>
}

/**
 * Maps each Front that is referenced (via one of its Fleets) by at least
 * one DERIVED fleet to the distinct set of successor FrontIds doing the
 * referencing. A referenced Front with more than one entry in its set has
 * branched — two or more Fronts both continuing from it — which violates
 * the "at most one direct successor" lineage invariant. Two DERIVED
 * fleets belonging to the SAME successor Front and referencing two
 * different Fleets on the same predecessor Front count as one successor,
 * not two (they still represent a single continuation relationship).
 */
function buildSuccessorFrontIdsByReferencedFrontId(input: FrontLineageInput): Map<FrontId, Set<FrontId>> {
  const fleetOwnerFrontId = new Map<FleetId, FrontId>(input.fleets.map((fleet) => [fleet.fleetId, fleet.frontId]))
  const result = new Map<FrontId, Set<FrontId>>()
  for (const fleet of input.fleets) {
    if (fleet.kind !== 'DERIVED') {
      continue
    }
    const referencedFrontId = fleetOwnerFrontId.get(fleet.referenceFleetId)
    if (referencedFrontId === undefined) {
      continue
    }
    const successors = result.get(referencedFrontId) ?? new Set<FrontId>()
    successors.add(fleet.frontId)
    result.set(referencedFrontId, successors)
  }
  return result
}

/**
 * Finds a FrontId with more than one distinct successor Front — a
 * branching Fleet Reference graph, which must always be rejected (§2).
 * Returns the first such FrontId found, or undefined when the graph is
 * branch-free. Used by `createFleetSetup` as a general graph invariant,
 * independent of any specific continuation-creation call site.
 */
export function findFrontReferenceBranching(input: FrontLineageInput): FrontId | undefined {
  const successorsByFrontId = buildSuccessorFrontIdsByReferencedFrontId(input)
  for (const [referencedFrontId, successors] of successorsByFrontId) {
    if (successors.size > 1) {
      return referencedFrontId
    }
  }
  return undefined
}

/**
 * Derives ACTIVE/HISTORICAL status for every Front in `input` purely from
 * the Fleet Reference graph — no `active` boolean is ever stored. Assumes
 * the graph is already acyclic and branch-free (createFleetSetup); result
 * is unspecified otherwise.
 */
export function deriveFrontLineage(input: FrontLineageInput): FrontLineage {
  const successorsByFrontId = buildSuccessorFrontIdsByReferencedFrontId(input)
  const successorFrontIdByFrontId = new Map<FrontId, FrontId>()
  const predecessorFrontIdByFrontId = new Map<FrontId, FrontId>()
  for (const [referencedFrontId, successors] of successorsByFrontId) {
    for (const successorFrontId of successors) {
      successorFrontIdByFrontId.set(referencedFrontId, successorFrontId)
      predecessorFrontIdByFrontId.set(successorFrontId, referencedFrontId)
      break
    }
  }

  const activeFrontIds: FrontId[] = []
  const historicalFrontIds: FrontId[] = []
  for (const front of input.fronts) {
    if (successorFrontIdByFrontId.has(front.frontId)) {
      historicalFrontIds.push(front.frontId)
    } else {
      activeFrontIds.push(front.frontId)
    }
  }

  return { activeFrontIds, historicalFrontIds, successorFrontIdByFrontId, predecessorFrontIdByFrontId }
}
