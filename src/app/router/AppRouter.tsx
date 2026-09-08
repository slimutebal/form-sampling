import { Navigate, Route, Routes, useParams } from 'react-router'
import { AppLayout } from '@/app/router/AppLayout'
import { WelcomePage } from '@/app/router/WelcomePage'
import { PreShiftShell } from '@/components/shared/PreShiftShell'
import { FleetPage } from '@/features/fleet/FleetPage'
import { HomePage } from '@/features/home/HomePage'
import { ManpowerEditRoute } from '@/features/manpower/ManpowerEditRoute'
import { PilesPage } from '@/features/piles/PilesPage'
import { ProductionBatchDetailPage } from '@/features/production/ProductionBatchDetailPage'
import { ProductionCorrectionsPage } from '@/features/production/ProductionCorrectionsPage'
import { ProductionEditRecordPage } from '@/features/production/ProductionEditRecordPage'
import { ProductionPage } from '@/features/production/ProductionPage'
import { ProductionPileDetailPage } from '@/features/production/ProductionPileDetailPage'
import { ProductionRecordPage } from '@/features/production/ProductionRecordPage'
import { ProductionRitDetailPage } from '@/features/production/ProductionRitDetailPage'
import { ProductionSwitchRecordPage } from '@/features/production/ProductionSwitchRecordPage'
import { RegistrationPage } from '@/features/registration/RegistrationPage'
import { ReportPage } from '@/features/report/ReportPage'
import { SamplesPage } from '@/features/samples/SamplesPage'
import { StartPage } from '@/features/shift/StartPage'

/**
 * `/piles/:pileId` (the old per-Pile haulage checker, Phase 18) is
 * retired by Phase 2 — Production > Record is now the single
 * authoritative path for recording new production transactions, so this
 * route no longer mounts a component that can write a HaulageTransaction.
 * A stale `?front=` query param is intentionally dropped rather than
 * translated: the Production Record screen re-asks for Front No itself.
 */
function RedirectPileDetailToProductionRecord() {
  const { pileId } = useParams<{ pileId: string }>()
  return <Navigate to={`/production/record/${encodeURIComponent(pileId ?? '')}`} replace />
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route
        path="/start"
        element={
          <PreShiftShell>
            <StartPage />
          </PreShiftShell>
        }
      />
      <Route element={<AppLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/regist" element={<RegistrationPage />} />
        <Route path="/manpower/edit" element={<ManpowerEditRoute />} />
        <Route path="/fleet" element={<FleetPage />} />
        <Route path="/piles" element={<PilesPage />} />
        <Route path="/piles/:pileId" element={<RedirectPileDetailToProductionRecord />} />
        <Route path="/production" element={<ProductionPage />} />
        <Route path="/production/record/:pileId" element={<ProductionRecordPage />} />
        <Route path="/production/detail/:pileId" element={<ProductionPileDetailPage />} />
        <Route path="/production/detail/:pileId/batch/:batchNumber" element={<ProductionBatchDetailPage />} />
        <Route
          path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber"
          element={<ProductionRitDetailPage />}
        />
        <Route
          path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber/edit"
          element={<ProductionEditRecordPage />}
        />
        <Route
          path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber/switch"
          element={<ProductionSwitchRecordPage />}
        />
        <Route
          path="/production/detail/:pileId/batch/:batchNumber/rit/:ritNumber/corrections"
          element={<ProductionCorrectionsPage />}
        />
        <Route path="/samples" element={<SamplesPage />} />
        <Route path="/report" element={<ReportPage />} />
      </Route>
    </Routes>
  )
}
