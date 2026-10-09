import type { FitAnalysis } from '@backend/models/types'
import { fitTone } from '../lib/fit'

export function FitBadge({ analysis }: { analysis: FitAnalysis | null }) {
  if (!analysis) return <span className="text-stone-400">—</span>
  return (
    <span
      title={`Resume match: ${analysis.score}/100`}
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${fitTone(analysis.score)}`}
    >
      {analysis.score}
    </span>
  )
}
