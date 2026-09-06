import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { parseSamplingHouseCode, parseSectorCode, parseShiftCode } from '@/domain/common/codes'
import { parseEmployeeId, parseShiftId } from '@/domain/common/identifiers'
import { parseShiftDate } from '@/domain/common/shift-date'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseCrewCode } from '@/domain/master/master-codes'
import { createCrewReference, createEmployeeReference } from '@/domain/master/references'
import { createShift, type Shift } from '@/domain/shift/shift'
import { ManpowerSetupPage } from '@/features/manpower/manpower-setup-page'
import i18n from '@/i18n'

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}

function shift(): Shift {
  return createShift({
    id: value(parseShiftId('SHIFT-1')),
    date: value(parseShiftDate('2026-09-04')),
    shiftCode: value(parseShiftCode('D')),
    sectorCode: value(parseSectorCode('BR1')),
    samplingHouseCode: value(parseSamplingHouseCode('SH_01')),
    status: 'NEW',
  })
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

function renderPage(onManpowerReady = vi.fn()) {
  const result = render(
    <ManpowerSetupPage shift={shift()} masterData={masterData()} onManpowerReady={onManpowerReady} />,
  )
  return { ...result, onManpowerReady }
}

beforeEach(async () => {
  await i18n.changeLanguage('en')
})

describe('ManpowerSetupPage', () => {
  it('searches by NIK/name and adds a person from the Employee master', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    await user.click(await screen.findByRole('button', { name: /Raharjo Rahman/ }))

    expect(screen.getByText('SCM0333')).toBeInTheDocument()
    expect(screen.queryByText('No personnel added yet.')).not.toBeInTheDocument()
  })

  it('automatically marks every Staff/Employee entry as PIC — no checkbox, allowing multiple Staff at once', async () => {
    const onManpowerReady = vi.fn()
    const user = userEvent.setup()
    renderPage(onManpowerReady)

    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    await user.click(await screen.findByRole('button', { name: /Raharjo Rahman/ }))
    await user.type(screen.getAllByLabelText('Job Desk')[0], 'Checker')

    await user.type(screen.getByLabelText('Search NIK / Name'), 'Wahyudin')
    await user.click(await screen.findByRole('button', { name: /Wahyudin Madilao/ }))
    await user.type(screen.getAllByLabelText('Job Desk')[1], 'Checker')

    expect(screen.getAllByText('Penanggung Jawab')).toHaveLength(2)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onManpowerReady).toHaveBeenCalledWith([
      { personId: 'SCM0333', name: 'Raharjo Rahman', jobDeskCode: 'Checker', isPic: true },
      { personId: 'SCM0627', name: 'Wahyudin Madilao', jobDeskCode: 'Checker', isPic: true },
    ])
  })

  it('prefills Job Desk from the Crew master jobCode and does not show a PIC label for Crew', async () => {
    const onManpowerReady = vi.fn()
    const user = userEvent.setup()
    renderPage(onManpowerReady)

    await user.type(screen.getByLabelText('Search NIK / Name'), 'Andri')
    await user.click(await screen.findByRole('button', { name: /Andri Tani Kusuma/ }))

    expect(screen.getAllByLabelText('Job Desk')[0]).toHaveValue('Sampler')
    expect(screen.queryByText('Penanggung Jawab')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onManpowerReady).toHaveBeenCalledWith([
      { personId: '260225', name: 'Andri Tani Kusuma', jobDeskCode: 'Sampler', isPic: false },
    ])
  })

  it('does not add the same person twice — a selected person no longer appears in search results', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    await user.click(await screen.findByRole('button', { name: /Raharjo Rahman/ }))

    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    expect(screen.getByText('No matching personnel.')).toBeInTheDocument()
  })

  it('continuing with an empty selection is allowed — Manpower is not mandatory', async () => {
    const onManpowerReady = vi.fn()
    const user = userEvent.setup()
    renderPage(onManpowerReady)

    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(onManpowerReady).toHaveBeenCalledWith([])
  })
})
