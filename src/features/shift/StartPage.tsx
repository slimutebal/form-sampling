import { localOperationalStore } from '@/app/local-operational-store'
import { ShiftStartPage } from '@/features/shift-registration/shift-start-page'

export function StartPage() {
  return <ShiftStartPage store={localOperationalStore} />
}
