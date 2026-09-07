import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseEmployeeId } from '@/domain/common/identifiers'
import { createManpowerAssignment } from '@/domain/manpower/manpower-assignment'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseCrewCode } from '@/domain/master/master-codes'
import { createCrewReference, createEmployeeReference } from '@/domain/master/references'
import { ManpowerEditPage } from '@/features/manpower/manpower-edit-page'
import i18n from '@/i18n'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function masterData(): MasterData {
  return value(
    createMasterData({
      employees: [
        createEmployeeReference(value(parseEmployeeId('SCM0333')), 'Raharjo Rahman'),
        createEmployeeReference(value(parseEmployeeId('SCM0627')), 'Wahyudin Madilao'),
      ],
      crews: [createCrewReference(value(parseCrewCode('260225')), 'Andri Tani Kusuma', 'Sampler')],
      sectors: [],
      locations: [],
      samplingHouses: [],
      pileAreas: [],
      haulers: [],
      trucks: [],
      oreSamplingConfigs: [],
    }),
  )
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('ManpowerEditPage', () => {
  it('pre-fills the roster from the current shift and shows Staff as PIC without a checkbox', () => {
    render(
      <ManpowerEditPage
        masterData={masterData()}
        initialAssignments={[createManpowerAssignment('SCM0333', 'Raharjo Rahman', '', true)]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('Raharjo Rahman')).toBeInTheDocument()
    expect(screen.getByText('Penanggung Jawab')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('adds Staff, removes Crew, and updates Crew Job Desk, then saves the revalidated roster', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <ManpowerEditPage
        masterData={masterData()}
        initialAssignments={[createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false)]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    // Remove the pre-filled Crew.
    await user.click(screen.getByRole('button', { name: 'Remove Andri Tani Kusuma' }))
    expect(screen.getByText('No personnel added yet.')).toBeInTheDocument()

    // Add a Staff member — automatically PIC.
    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    await user.click(await screen.findByRole('button', { name: /Raharjo Rahman/ }))

    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith([
      { personId: 'SCM0333', name: 'Raharjo Rahman', jobDeskCode: '', isPic: true },
    ])
  })

  it('re-adding a Crew and changing Job Desk saves the updated value', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <ManpowerEditPage
        masterData={masterData()}
        initialAssignments={[createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false)]}
        onSave={onSave}
        onCancel={vi.fn()}
      />,
    )

    await user.clear(screen.getAllByLabelText('Job Desk')[0])
    await user.type(screen.getAllByLabelText('Job Desk')[0], 'Checker')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(onSave).toHaveBeenCalledWith([
      { personId: '260225', name: 'Andri Tani Kusuma', jobDeskCode: 'Checker', isPic: false },
    ])
  })

  it('Cancel discards the in-progress edit without saving', async () => {
    const onCancel = vi.fn()
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <ManpowerEditPage
        masterData={masterData()}
        initialAssignments={[createManpowerAssignment('260225', 'Andri Tani Kusuma', 'Sampler', false)]}
        onSave={onSave}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('surfaces a store save error passed by the caller', () => {
    render(
      <ManpowerEditPage
        masterData={masterData()}
        initialAssignments={[]}
        onSave={vi.fn()}
        onCancel={vi.fn()}
        saveErrorKey="manpower.errors.storeContextInvalid"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('The active shift workspace could not be found.')
  })
})
