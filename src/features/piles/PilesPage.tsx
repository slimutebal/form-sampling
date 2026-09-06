import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { activateAppsScriptPile } from '@/app/pile-master/activate-apps-script-pile'
import { PilesListPage } from '@/features/piles/piles-list-page'

/**
 * Router adapter for `/piles` (Phase 18 wiring correction §11, "Add
 * Pile"/§6 New Pile Master correction). Wires the real workspace/store;
 * the testable list+add-pile UI lives in `PilesListPage`.
 */
export function PilesPage() {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()

  return (
    <PilesListPage
      workspace={workspace}
      store={localOperationalStore}
      onPileAdded={refreshWorkspace}
      createNewPile={(draft) =>
        activateAppsScriptPile({
          draft,
          shiftId: workspace.shiftId,
          sectorCode: workspace.shift.sectorCode,
          masterData: workspace.masterData,
        })
      }
    />
  )
}
