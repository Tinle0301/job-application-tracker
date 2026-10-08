import type { Status } from '../types'
import { STATUSES } from '../types'
import { STATUS_LABELS, STATUS_STYLES } from '../lib/statuses'

interface Props {
  value: Status
  onChange: (status: Status) => void
  label: string
}

/** Inline dropdown styled like a status badge, for one-click status updates. */
export function StatusSelect({ value, onChange, label }: Props) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as Status)}
      className={`cursor-pointer rounded-full border-0 py-1 pl-3 pr-8 text-xs font-medium ring-1 ring-inset focus:ring-2 focus:ring-stone-900 ${STATUS_STYLES[value]}`}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  )
}
