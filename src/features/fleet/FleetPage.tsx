import { useLocation, useNavigate, useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { activateAppsScriptPile } from '@/app/pile-master/activate-apps-script-pile'
import { FleetActivePage } from '@/features/fleet/fleet-active-page'

/**
 * Router adapter for `/fleet` (active-shift Fleet management). Wires the
 * real workspace/store and the post-init New Pile Master flow
 * (`activateAppsScriptPile` — the same one `PilesPage` uses); the
 * testable list+continuation UI lives in `FleetActivePage`.
 */
export function FleetPage() {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const location = useLocation()
  const navigate = useNavigate()
  const addFromSetup = Boolean((location.state as { readonly add?: boolean } | null)?.add)
  const adjustFrontId = (location.state as { readonly adjustFrontId?: string } | null)
    ?.adjustFrontId
  const returnTo =
    (location.state as { readonly returnTo?: string } | null)?.returnTo === '/regist'
      ? '/regist'
      : undefined

  return (
    <FleetActivePage
      workspace={workspace}
      store={localOperationalStore}
      initialAdding={addFromSetup}
      initialAdjustingFrontId={adjustFrontId}
      onCancelInitialAdjustment={returnTo ? () => navigate(returnTo) : undefined}
      onFleetUpdated={() => {
        refreshWorkspace()
        if (returnTo) navigate(returnTo)
      }}
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
