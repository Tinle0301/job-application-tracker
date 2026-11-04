import { useEffect, useState, type FormEvent } from 'react'
import type { EmailMessage, Status } from '@backend/models/types'
import { STATUSES } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'
import { STATUS_LABELS } from '../lib/statuses'

/** What the email did, and what Edit lets the user fix about it. */
export type EmailEdit =
  | {
      kind: 'stage'
      messageId: string
      company: string
      /** Stage the email moved the job to. */
      stage: Status
      /** Stage the job was at before the email. */
      previous: Status
      /** What the app already knows, shown until (or if) Gmail answers. */
      fallback: { fromAddress: string; subject: string; receivedAt: string }
    }
  | {
      kind: 'application'
      messageId: string
      company: string
      role: string
      fallback: { fromAddress: string; subject: string; receivedAt: string; link?: string }
    }

/** Choice value for "this email didn't change the stage". */
const NO_CHANGE = 'none'

const STAGE_CHOICES = STATUSES.filter((s) => s !== 'wishlist')

function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface Props {
  api: TrackerApi
  edit: EmailEdit
  busy: boolean
  /** stage: the corrected stage (null = not a stage change). application: the corrected company and role. */
  onSave: (fix: { stage: Status | null } | { company: string; role: string }) => void
  onClose: () => void
}

/** Shows one job email and lets the user correct what it did to their tracker. */
export function EmailEditor({ api, edit, busy, onSave, onClose }: Props) {
  const [email, setEmail] = useState<EmailMessage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stage, setStage] = useState<string>(edit.kind === 'stage' ? edit.stage : '')
  const [company, setCompany] = useState(edit.company)
  const [role, setRole] = useState(edit.kind === 'application' ? edit.role : '')

  useEffect(() => {
    let live = true
    api.readEmail(edit.messageId).then((res) => {
      if (!live) return
      if (res.error) setLoadError(res.error.message)
      else setEmail(res.data)
    })
    return () => {
      live = false
    }
  }, [api, edit.messageId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const from = email
    ? email.fromName
      ? `${email.fromName} <${email.fromAddress}>`
      : email.fromAddress
    : edit.fallback.fromAddress
  const subject = (email?.subject ?? edit.fallback.subject) || '(no subject)'
  const receivedAt = email?.receivedAt ?? edit.fallback.receivedAt
  const link = email?.link ?? (edit.kind === 'application' ? edit.fallback.link : undefined)

  const unchanged =
    edit.kind === 'stage'
      ? stage === edit.stage
      : company.trim() === edit.company.trim() && role.trim() === edit.role.trim()
  const incomplete = edit.kind === 'application' && (!company.trim() || !role.trim())

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (unchanged || incomplete) return
    if (edit.kind === 'stage') onSave({ stage: stage === NO_CHANGE ? null : (stage as Status) })
    else onSave({ company: company.trim(), role: role.trim() })
  }

  const field = 'mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 text-sm'

  return (
    <div
      className="fixed inset-0 z-10 flex items-end justify-center bg-stone-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={`Email from ${edit.company}`}
    >
      <form
        onSubmit={submit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col gap-4 overflow-hidden rounded-2xl bg-white p-6 shadow-xl"
      >
        <h2 className="text-lg font-semibold">Email from {edit.company}</h2>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-stone-500">From</dt>
          <dd className="min-w-0 break-words">{from}</dd>
          <dt className="text-stone-500">Date</dt>
          <dd>{fullDate(receivedAt)}</dd>
          <dt className="text-stone-500">Subject</dt>
          <dd className="min-w-0 font-medium break-words">{subject}</dd>
        </dl>

        <div
          aria-label="Email text"
          className="min-h-24 flex-1 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm whitespace-pre-wrap text-stone-800"
        >
          {email ? (
            email.body || <span className="text-stone-500">This email has no text.</span>
          ) : loadError ? (
            <span className="text-rose-700">{loadError}</span>
          ) : (
            <span className="text-stone-500">Loading the email…</span>
          )}
        </div>
        {link && (
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="-mt-2 text-sm text-stone-600 underline decoration-stone-300 hover:text-stone-900"
          >
            Open in Gmail
          </a>
        )}

        {edit.kind === 'stage' ? (
          <label className="text-sm font-medium">
            Stage this email shows
            <select className={field} value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGE_CHOICES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
              <option value={NO_CHANGE}>Not a stage change (remove from timeline)</option>
            </select>
            <span className="mt-1 block font-normal text-stone-500">
              Changing it fixes this email's step in the timeline. No new step is added.
              {edit.previous !== 'wishlist' && ` Before this email the job was at ${STATUS_LABELS[edit.previous]}.`}
            </span>
          </label>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-medium">
              Company
              <input className={field} value={company} onChange={(e) => setCompany(e.target.value)} />
            </label>
            <label className="text-sm font-medium">
              Role
              <input className={field} value={role} onChange={(e) => setRole(e.target.value)} />
            </label>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium hover:bg-stone-100"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={busy || unchanged || incomplete}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}
