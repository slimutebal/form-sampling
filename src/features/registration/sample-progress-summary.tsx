import {
  deriveSampleProgressBarSegments,
  type SampleBatchProgress,
} from '@/application/sample-handling/sample-batch-progress'

interface SampleProgressSummaryProps {
  readonly progress?: SampleBatchProgress
  readonly countFormat?: 'fraction' | 'of'
  readonly physicalInHouse?: number
  readonly showDerivedInHouse?: boolean
}

export function SampleProgressSummary({
  progress,
  countFormat = 'fraction',
  physicalInHouse,
  showDerivedInHouse = true,
}: SampleProgressSummaryProps) {
  const separator = countFormat === 'of' ? 'of' : '/'
  if (!progress) {
    return (
      <div className="flex flex-col gap-1.5" role="group" aria-label="Sample progress">
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          <span data-testid="sample-progress-neutral" className="w-full bg-muted-foreground/35" />
        </div>
        <div className="flex justify-end text-xs text-muted-foreground">
          <span>0 {separator} — Incr</span>
        </div>
      </div>
    )
  }
  const displayedPhysicalInHouse =
    physicalInHouse ?? (showDerivedInHouse ? progress.inHouseBagCount : 0)
  const segments = deriveSampleProgressBarSegments(progress, displayedPhysicalInHouse)

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-label="Sample progress">
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        <span
          data-testid="sample-progress-delivered"
          aria-label="Produced samples outside physical In House"
          className="bg-emerald-600"
          style={{ width: `${segments.greenPercent}%` }}
        />
        <span
          data-testid="sample-progress-in-house"
          aria-label="Produced samples physically In House"
          className="bg-red-500"
          style={{ width: `${segments.redPercent}%` }}
        />
        <span
          data-testid="sample-progress-remaining"
          aria-label="Unproduced batch capacity"
          className="bg-muted-foreground/35"
          style={{ width: `${segments.grayPercent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {progress.producedIncrementCount} {separator} {progress.totalIncrementCount} Incr
        </span>
        <span>{displayedPhysicalInHouse} Sample In House</span>
      </div>
    </div>
  )
}
