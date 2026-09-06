import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { SampleHandlingPage } from '@/features/samples/sample-handling-page'

/**
 * Router adapter for `/samples` (Phase 18 wiring correction §12). Wires
 * the existing Phase 11 `SampleHandlingPage` to the current workspace.
 * `deliveryDestinations` is deliberately `[]` — `DeliveryDestinationOption`'s
 * own doc comment states no MasterData collection is yet confirmed as
 * the authoritative destination catalog, so no destination list may be
 * invented here.
 */
export function SamplesPage() {
  const { workspace } = useOutletContext<ActiveWorkspaceContext>()

  return (
    <SampleHandlingPage
      shift={workspace.shift}
      piles={workspace.piles}
      masterData={workspace.masterData}
      deliveryDestinations={[]}
      store={localOperationalStore}
    />
  )
}
