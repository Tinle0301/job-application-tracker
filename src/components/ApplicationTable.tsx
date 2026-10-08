import { useState } from 'react'
import type { Application, Status } from '../types'
import { StatusSelect } from './StatusSelect'
import { StatusBadge } from './StatusBadge'

interface Props {
  apps: Application[]
  onStatusChange: (id: string, status: Status) => void
  onEdit: (app: Application) => void
  onDelete: (app: Application) => void
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function ApplicationTable({ apps, onStatusChange, onEdit, onDelete }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)

  if (apps.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
        No applications yet. Add your first one to start tracking.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Role</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Applied</th>
            <th className="px-4 py-3 font-medium">Updated</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {apps.map((app) => (
            <Row
              key={app.id}
              app={app}
              open={expanded === app.id}
              onToggle={() => setExpanded(expanded === app.id ? null : app.id)}
              onStatusChange={onStatusChange}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Row({
  app,
  open,
  onToggle,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  app: Application
  open: boolean
  onToggle: () => void
} & Omit<Props, 'apps'>) {
  return (
    <>
      <tr className="hover:bg-stone-50">
        <td className="px-4 py-3">
          <button onClick={onToggle} className="text-left font-medium hover:underline" aria-expanded={open}>
            {app.company}
          </button>
          {app.location && <div className="text-xs text-stone-500">{app.location}</div>}
        </td>
        <td className="px-4 py-3">
          {app.url ? (
            <a href={app.url} target="_blank" rel="noreferrer" className="hover:underline">
              {app.role}
            </a>
          ) : (
            app.role
          )}
        </td>
        <td className="px-4 py-3">
          <StatusSelect
            label={`Status for ${app.company}`}
            value={app.status}
            onChange={(s) => onStatusChange(app.id, s)}
          />
        </td>
        <td className="px-4 py-3 tabular-nums text-stone-600">{formatDate(app.appliedOn)}</td>
        <td className="px-4 py-3 tabular-nums text-stone-600">{formatDate(app.updatedAt)}</td>
        <td className="px-4 py-3 text-right">
          <button onClick={() => onEdit(app)} className="mr-3 text-stone-600 hover:text-stone-900">
            Edit
          </button>
          <button onClick={() => onDelete(app)} className="text-rose-600 hover:text-rose-800">
            Delete
          </button>
        </td>
      </tr>
      {open && (
        <tr className="bg-stone-50/60">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Timeline</h4>
                <ol className="space-y-2">
                  {app.history.map((h, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <StatusBadge status={h.status} />
                      <span className="text-xs text-stone-500">{formatDate(h.changedAt)}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="space-y-2 text-sm">
                {app.salary && (
                  <p>
                    <span className="text-stone-500">Salary: </span>
                    {app.salary}
                  </p>
                )}
                <p className="whitespace-pre-wrap text-stone-700">
                  {app.notes || <span className="text-stone-400">No notes</span>}
                </p>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
