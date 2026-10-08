import { useState, type FormEvent } from 'react'
import type { Application, ApplicationInput } from '../types'
import { STATUSES } from '../types'
import { STATUS_LABELS } from '../lib/statuses'

const EMPTY: ApplicationInput = {
  company: '',
  role: '',
  location: '',
  url: '',
  status: 'applied',
  appliedOn: new Date().toISOString().slice(0, 10),
  salary: '',
  notes: '',
}

interface Props {
  initial?: Application
  onSubmit: (input: ApplicationInput) => void
  onCancel: () => void
}

export function ApplicationForm({ initial, onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<ApplicationInput>(initial ? { ...initial } : EMPTY)
  const set = <K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.company.trim() || !form.role.trim()) return
    onSubmit({ ...form, company: form.company.trim(), role: form.role.trim() })
  }

  const input = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm'

  return (
    <div
      className="fixed inset-0 z-10 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <form onSubmit={submit} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">{initial ? 'Edit application' : 'Add application'}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Company *
            <input required className={input} value={form.company} onChange={(e) => set('company', e.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Role *
            <input required className={input} value={form.role} onChange={(e) => set('role', e.target.value)} />
          </label>
          <label className="text-sm font-medium">
            Status
            <select
              className={input}
              value={form.status}
              onChange={(e) => set('status', e.target.value as ApplicationInput['status'])}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Date applied
            <input
              type="date"
              className={input}
              value={form.appliedOn ?? ''}
              onChange={(e) => set('appliedOn', e.target.value || null)}
            />
          </label>
          <label className="text-sm font-medium">
            Location
            <input
              className={input}
              value={form.location}
              onChange={(e) => set('location', e.target.value)}
              placeholder="Remote, US"
            />
          </label>
          <label className="text-sm font-medium">
            Salary
            <input
              className={input}
              value={form.salary}
              onChange={(e) => set('salary', e.target.value)}
              placeholder="$90K–$110K"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Job posting URL
            <input
              type="url"
              className={input}
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://"
            />
          </label>
          <label className="text-sm font-medium sm:col-span-2">
            Notes
            <textarea rows={3} className={input} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
          >
            {initial ? 'Save changes' : 'Add application'}
          </button>
        </div>
      </form>
    </div>
  )
}
