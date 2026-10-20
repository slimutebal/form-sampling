import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { I18nextProvider } from 'react-i18next'
import { parseEmployeeId } from '@/domain/common/identifiers'
import { createMasterData, type MasterData } from '@/domain/master/master-data'
import { parseCrewCode } from '@/domain/master/master-codes'
import { createCrewReference, createEmployeeReference } from '@/domain/master/references'
import i18n from '@/i18n'
import { WorkSetupManpower, type WorkSetupManpowerSelection } from './work-setup-manpower'

function must<T>(result: { ok: boolean; value?: T }): T {
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value as T
}

function buildMasterData(): MasterData {
  return must(
    createMasterData({
      employees: [
        createEmployeeReference(must(parseEmployeeId('SCM0333')), 'Raharjo Rahman', 'Supervisor'),
        createEmployeeReference(must(parseEmployeeId('SCM0444')), 'Nia Lestari', 'Staff'),
      ],
      crews: [createCrewReference(must(parseCrewCode('260225')), 'Andri Tani Kusuma', 'Sampler')],
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

function Harness() {
  const [value, setValue] = useState<WorkSetupManpowerSelection>({ selected: [] })
  return <WorkSetupManpower masterData={buildMasterData()} value={value} onChange={setValue} />
}

async function addPerson(user: ReturnType<typeof userEvent.setup>, query: string, name: string) {
  await user.type(screen.getByLabelText('Search NIK / Name'), query)
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }))
}

describe('WorkSetupManpower', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
  })

  it('searches the master by partial NIK/name, adds people once, and renders compact grouped roster rows', async () => {
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n}><Harness /></I18nextProvider>)

    await addPerson(user, '033', 'Raharjo Rahman')
    await addPerson(user, 'Andri', 'Andri Tani Kusuma')

    expect(screen.getByRole('heading', { name: 'Lead' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Crew' })).toBeInTheDocument()
    expect(screen.getByText(/Raharjo Rahman/)).toHaveTextContent(/Raharjo Rahman.*SCM0333/)
    expect(screen.getByText(/Andri Tani Kusuma/)).toHaveTextContent(/Andri Tani Kusuma.*260225/)
    expect(screen.getByText('Supervisor')).toBeInTheDocument()
    expect(screen.getByText('1 Lead')).toBeInTheDocument()
    expect(screen.getByText('1 Crew')).toBeInTheDocument()
    expect(screen.queryByText('Valid')).not.toBeInTheDocument()
    expect(screen.queryByText(/PIC/)).not.toBeInTheDocument()
    expect(screen.getByTestId('work-setup-roster')).toHaveClass('overflow-y-auto')
    expect(screen.queryByText(/Job Desk/i)).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Search NIK / Name'), 'SCM0333')
    expect(screen.queryByText('Add')).not.toBeInTheDocument()
  })

  it('does not render a Checker selector because Checker comes from Landing', async () => {
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n}><Harness /></I18nextProvider>)

    await addPerson(user, 'Raharjo', 'Raharjo Rahman')
    await addPerson(user, 'Nia', 'Nia Lestari')

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('Checker')).not.toBeInTheDocument()
  })

  it('shows the missing Crew warning inside the selected roster', async () => {
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n}><Harness /></I18nextProvider>)

    await addPerson(user, 'Raharjo', 'Raharjo Rahman')

    expect(screen.getByText('Add at least 1 Crew.')).toBeInTheDocument()
  })

  it('keeps ordinary Staff visible without counting it as a Shift Lead', async () => {
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n}><Harness /></I18nextProvider>)

    await addPerson(user, 'Nia', 'Nia Lestari')

    expect(screen.getByRole('heading', { name: 'Lead' })).toBeInTheDocument()
    expect(screen.getByText('0 Lead')).toBeInTheDocument()
  })

  it('opens search candidates above the lower search input', async () => {
    const user = userEvent.setup()
    render(<I18nextProvider i18n={i18n}><Harness /></I18nextProvider>)
    await user.type(screen.getByLabelText('Search NIK / Name'), 'Raharjo')
    expect(screen.getByRole('button', { name: /Raharjo Rahman/ }).closest('ul')).toHaveClass('bottom-full')
  })

  it('does not let a Crew-sourced Checker satisfy the separate Crew requirement', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WorkSetupManpower
          masterData={buildMasterData()}
          value={{
            checkerPersonId: '260225',
            selected: [{ personId: '260225', name: 'Andri Tani Kusuma', source: 'CREW', jobDeskCode: 'Checker' }],
          }}
          onChange={() => undefined}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('Add at least 1 Crew.')).toBeInTheDocument()
  })

  it('shows subdued work context without attribute labels and expands the shift code', () => {
    render(
      <I18nextProvider i18n={i18n}>
        <WorkSetupManpower
          masterData={buildMasterData()}
          value={{ selected: [] }}
          workContext={{
            sectorCode: 'BR1',
            samplingHouseCode: 'SH_01',
            shiftDate: '2026-10-09',
            shiftCode: 'D',
          }}
          onChange={() => undefined}
        />
      </I18nextProvider>,
    )

    expect(screen.getByText('BR1 · SH_01')).toBeInTheDocument()
    expect(screen.getByText('09-Oct-2026')).toBeInTheDocument()
    expect(screen.getByText('Day Shift')).toBeInTheDocument()
    expect(screen.queryByText('Loc')).not.toBeInTheDocument()
    expect(screen.queryByText('Date · Shift')).not.toBeInTheDocument()
  })
})
