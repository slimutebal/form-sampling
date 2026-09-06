import { Route, Routes } from 'react-router'
import { AppLayout } from '@/app/router/AppLayout'
import { WelcomePage } from '@/app/router/WelcomePage'
import { PreShiftShell } from '@/components/shared/PreShiftShell'
import { FleetPage } from '@/features/fleet/FleetPage'
import { HomePage } from '@/features/home/HomePage'
import { PileDetailPage } from '@/features/piles/PileDetailPage'
import { PilesPage } from '@/features/piles/PilesPage'
import { ReportPage } from '@/features/report/ReportPage'
import { SamplesPage } from '@/features/samples/SamplesPage'
import { StartPage } from '@/features/shift/StartPage'

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
        <Route path="/fleet" element={<FleetPage />} />
        <Route path="/piles" element={<PilesPage />} />
        <Route path="/piles/:pileId" element={<PileDetailPage />} />
        <Route path="/samples" element={<SamplesPage />} />
        <Route path="/report" element={<ReportPage />} />
      </Route>
    </Routes>
  )
}
