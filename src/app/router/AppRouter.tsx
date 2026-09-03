import { Route, Routes } from 'react-router'
import { AppLayout } from '@/app/router/AppLayout'
import { WelcomePage } from '@/app/router/WelcomePage'
import { HomePage } from '@/features/home/HomePage'
import { PilesPage } from '@/features/piles/PilesPage'
import { ReportPage } from '@/features/report/ReportPage'
import { SamplesPage } from '@/features/samples/SamplesPage'
import { MorePage } from '@/features/settings/MorePage'
import { StartPage } from '@/features/shift/StartPage'

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/start" element={<StartPage />} />
      <Route element={<AppLayout />}>
        <Route path="/home" element={<HomePage />} />
        <Route path="/piles" element={<PilesPage />} />
        <Route path="/samples" element={<SamplesPage />} />
        <Route path="/report" element={<ReportPage />} />
        <Route path="/more" element={<MorePage />} />
      </Route>
    </Routes>
  )
}
