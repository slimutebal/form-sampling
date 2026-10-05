import { useState } from 'react'
import { useOutletContext } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import { activateAppsScriptPile } from '@/app/pile-master/activate-apps-script-pile'
import { generateFleetId } from '@/application/fleet-setup/fleet-id-generator'
import { Button } from '@/components/ui/button'
import { FrontContinuationEditor } from '@/features/fleet/front-continuation-editor'

interface ActiveFleetAddSheetProps {
  readonly onClose: () => void
}

/** Reuses the active Front/Fleet editor inside Setup's three-quarter sheet. */
export function ActiveFleetAddSheet({ onClose }: ActiveFleetAddSheetProps) {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const [fleetId] = useState(generateFleetId)
  const [saving, setSaving] = useState(false)

  return (
    <>
      <button type="button" aria-label="Dismiss Add Fleet" className="fixed inset-0 z-40 cursor-default bg-black/35" onClick={onClose} />
      <section role="dialog" aria-modal="true" aria-label="Add Fleet" className="fixed inset-x-0 bottom-0 z-50 mx-auto flex h-[75dvh] max-w-md flex-col rounded-t-2xl bg-background shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <h2 className="font-semibold">Add Fleet</h2>
          <Button type="submit" form="active-fleet-setup-form" className="h-9 px-3" disabled={saving}>Save Fleet</Button>
        </div>
        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-3">
          <FrontContinuationEditor
            shift={workspace.shift}
            masterData={workspace.masterData}
            fleetSetup={workspace.fleetSetup}
            workspacePiles={workspace.piles}
            pileRegistrations={workspace.pileRegistrations}
            fleetId={fleetId}
            formId="active-fleet-setup-form"
            hideActions
            compactSelectedTrucks
            onCancel={onClose}
            onPileActivated={() => refreshWorkspace()}
            createNewPile={(draft) => activateAppsScriptPile({ draft, shiftId: workspace.shiftId, sectorCode: workspace.shift.sectorCode, masterData: workspace.masterData })}
            onSave={(result, activatePile) => {
              if (saving) return
              setSaving(true)
              void localOperationalStore.appendFrontContinuation(workspace.shiftId, { fleetSetup: result.fleetSetup, activatePile }).then((saved) => {
                setSaving(false)
                if (!saved.ok) return
                refreshWorkspace()
                onClose()
              })
            }}
          />
        </div>
      </section>
    </>
  )
}
