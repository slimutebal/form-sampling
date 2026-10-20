import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ProductionSourcePage } from './production-source-page'

function renderPage() {
  const onImportFile = vi.fn()
  const onPasteReport = vi.fn()
  const onCreateNew = vi.fn()
  render(<ProductionSourcePage onImportFile={onImportFile} onPasteReport={onPasteReport} onCreateNew={onCreateNew} onBack={vi.fn()} />)
  return { onImportFile, onPasteReport, onCreateNew }
}

describe('ProductionSourcePage', () => {
  it('routes import, pasted text, and new production into the shared setup flow', async () => {
    const user = userEvent.setup()
    const actions = renderPage()

    await user.click(screen.getByRole('button', { name: /^Import File\b/i }))
    expect(actions.onImportFile).toHaveBeenCalledOnce()

    await user.type(screen.getByLabelText('Paste Text Report'), 'PILE-1 Batch 1 Last Trip 1')
    await user.click(screen.getByRole('button', { name: 'Analyze Text Report' }))
    expect(actions.onPasteReport).toHaveBeenCalledWith('PILE-1 Batch 1 Last Trip 1')

    await user.click(screen.getByRole('button', { name: /^Create New Production\b/i }))
    expect(actions.onCreateNew).toHaveBeenCalledOnce()
  })

  it('keeps the paste flow visible as the primary production-data method', () => {
    renderPage()

    expect(screen.getByRole('heading', { name: 'Production Data Setup' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Paste text laporan produksi sebelumnya...')).toBeVisible()
  })
})
