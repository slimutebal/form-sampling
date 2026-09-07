import { useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router'
import type { ActiveWorkspaceContext } from '@/app/router/AppLayout'
import { localOperationalStore } from '@/app/local-operational-store'
import type { ManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import { manpowerErrorTranslationKey } from '@/features/manpower/error-messages'
import { ManpowerEditPage } from '@/features/manpower/manpower-edit-page'

/**
 * Router adapter for `/manpower/edit` (Field Finding 1 — mid-shift
 * Manpower roster edit, launched from Home). Wires the real workspace/
 * store: on Save, revalidated Manpower is persisted via
 * `LocalOperationalStore.updateShiftManpower` — which only ever replaces
 * the `manpower` field, leaving shift/piles/masterData/fleetSetup/
 * pendingBatches/pendingSamples untouched — then the shared workspace
 * context is refreshed and the operator is returned to Home. Cancel
 * discards the in-progress edit and returns to Home without writing
 * anything.
 */
export function ManpowerEditRoute() {
  const { workspace, refreshWorkspace } = useOutletContext<ActiveWorkspaceContext>()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [saveErrorKey, setSaveErrorKey] = useState<string>()

  async function handleSave(manpower: readonly ManpowerAssignment[]) {
    if (saving) return
    setSaving(true)
    setSaveErrorKey(undefined)
    try {
      const result = await localOperationalStore.updateShiftManpower(workspace.shiftId, manpower)
      if (!result.ok) {
        setSaveErrorKey(manpowerErrorTranslationKey(result.error.code))
        return
      }
      refreshWorkspace()
      navigate('/home')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ManpowerEditPage
      masterData={workspace.masterData}
      initialAssignments={workspace.manpower}
      onSave={(manpower) => void handleSave(manpower)}
      onCancel={() => navigate('/home')}
      saving={saving}
      saveErrorKey={saveErrorKey}
    />
  )
}
