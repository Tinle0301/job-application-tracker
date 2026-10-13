import { useCallback, useEffect, useRef, useState } from 'react'
import type { Application, EmailConnection, EmailUpdate } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'
import { StatusBadge } from './StatusBadge'

/** Scan by itself when the app opens and the last scan is older than this. */
export const AUTO_SCAN_AFTER_MS = 6 * 60 * 60 * 1000

/** What Google's redirect back to the app (?email=…) means. */
const OUTCOMES: Record<string, { kind: 'ok' | 'error'; text: string }> = {
  connected: { kind: 'ok', text: 'Gmail connected. Checking your inbox…' },
  denied: { kind: 'error', text: 'Gmail was not connected: access was not allowed.' },
  missing_scope: {
    kind: 'error',
    text: 'Gmail was not connected: tick "Read your email" on the Google screen so the tracker can read job emails.',
  },
  expired: { kind: 'error', text: 'That connect link expired. Try Connect Gmail again.' },
  error: { kind: 'error', text: "Couldn't connect Gmail. Please try again." },
}

/** The ?email=… outcome Google's redirect left in the URL, if any. */
function readOutcome(): string | null {
  if (typeof window === 'undefined') return null
  return new URL(window.location.href).searchParams.get('email')
}

/** Removes ?email=… so a reload doesn't show the message again. */
function clearOutcome() {
  const url = new URL(window.location.href)
  url.searchParams.delete('email')
  window.history.replaceState(window.history.state, '', url.toString())
}

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  if (hours < 48) return `${hours} h ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const button =
  'rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-stone-100 disabled:opacity-50'

interface Props {
  api: TrackerApi
  apps: Application[]
  /** Called after statuses may have changed, so the table reloads. */
  onStatusesChanged: () => void
}

/** Connect Gmail, check the inbox, and review the status changes emails led to. */
export function EmailSync({ api, apps, onStatusesChanged }: Props) {
  const [connection, setConnection] = useState<EmailConnection | null | undefined>(undefined)
  const [updates, setUpdates] = useState<EmailUpdate[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [outcome] = useState(readOutcome)
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(() =>
    outcome ? (OUTCOMES[outcome] ?? OUTCOMES.error) : null,
  )
  const started = useRef(false)

  const loadUpdates = useCallback(async () => {
    const res = await api.listEmailUpdates()
    if (res.data) setUpdates(res.data)
  }, [api])

  const scan = useCallback(async () => {
    setBusy('scan')
    const res = await api.scanEmail()
    setBusy(null)
    if (res.error) {
      setMessage({ kind: 'error', text: res.error.message })
      if (res.error.code === 'EMAIL_RECONNECT') setConnection((c) => (c ? { ...c, status: 'needs_reconnect' } : c))
      return
    }
    const { applied, suggested, complete } = res.data
    const parts = [
      applied ? `${applied} status${applied === 1 ? '' : 'es'} updated` : '',
      suggested ? `${suggested} to review` : '',
    ].filter(Boolean)
    setMessage({
      kind: 'ok',
      text:
        (parts.length ? `${parts.join(', ')}.` : 'No new status changes in your inbox.') +
        (complete ? '' : ' Some emails are left for the next check.'),
    })
    setConnection((c) => (c ? { ...c, lastScanAt: new Date().toISOString() } : c))
    await loadUpdates()
    if (applied) onStatusesChanged()
  }, [api, loadUpdates, onStatusesChanged])

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (outcome) clearOutcome()
    ;(async () => {
      const res = await api.getEmailConnection()
      const conn = res.data ?? null
      setConnection(conn)
      if (!conn) return
      await loadUpdates()
      const stale = !conn.lastScanAt || Date.now() - new Date(conn.lastScanAt).getTime() > AUTO_SCAN_AFTER_MS
      if (conn.status === 'connected' && (outcome === 'connected' || stale)) await scan()
    })()
  }, [api, loadUpdates, scan, outcome])

  const connect = async () => {
    setBusy('connect')
    const res = await api.startEmailConnect()
    if (res.error) {
      setBusy(null)
      setMessage({ kind: 'error', text: res.error.message })
      return
    }
    window.location.assign(res.data.url)
  }

  const disconnect = async () => {
    if (!window.confirm('Disconnect Gmail? Status changes already made stay as they are.')) return
    setBusy('disconnect')
    const res = await api.disconnectEmail()
    setBusy(null)
    if (res.error) setMessage({ kind: 'error', text: res.error.message })
    else {
      setConnection(null)
      setMessage({ kind: 'ok', text: 'Gmail disconnected.' })
    }
  }

  const act = async (id: string, call: (id: string) => Promise<{ error: { message: string } | null }>) => {
    setBusy(id)
    const res = await call(id)
    setBusy(null)
    if (res.error) setMessage({ kind: 'error', text: res.error.message })
    await loadUpdates()
    onStatusesChanged()
  }

  if (connection === undefined) return null

  const byId = new Map(apps.map((a) => [a.id, a]))
  const visible = updates.filter((u) => (u.state === 'applied' || u.state === 'suggested') && byId.has(u.applicationId))

  return (
    <section aria-label="Email updates" className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {connection ? (
          <div className="text-sm">
            <span className="font-medium">Inbox:</span> {connection.email}
            <span className="text-stone-500">
              {connection.status === 'needs_reconnect'
                ? ' · Google access expired'
                : connection.lastScanAt
                  ? ` · checked ${ago(connection.lastScanAt)}`
                  : ' · not checked yet'}
            </span>
          </div>
        ) : (
          <div className="text-sm">
            <p className="font-medium">Update statuses from your inbox</p>
            <p className="text-stone-500">
              Connect the Gmail you apply from. The tracker reads job emails only (read-only) and moves applications
              when an assessment, interview, offer or rejection arrives. You can undo any change.
            </p>
          </div>
        )}
        <div className="flex gap-2">
          {!connection || connection.status === 'needs_reconnect' ? (
            <button onClick={connect} disabled={busy !== null} className={button}>
              {busy === 'connect' ? 'Opening Google…' : connection ? 'Reconnect Gmail' : 'Connect Gmail'}
            </button>
          ) : (
            <button onClick={scan} disabled={busy !== null} className={button}>
              {busy === 'scan' ? 'Checking…' : 'Check inbox'}
            </button>
          )}
          {connection && (
            <button onClick={disconnect} disabled={busy !== null} className={button}>
              Disconnect
            </button>
          )}
        </div>
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={message.kind === 'error' ? 'text-sm text-rose-700' : 'text-sm text-emerald-700'}
        >
          {message.text}
        </p>
      )}

      {visible.length > 0 && (
        <ul className="divide-y divide-stone-100 text-sm">
          {visible.slice(0, 10).map((u) => {
            const app = byId.get(u.applicationId)!
            return (
              <li key={u.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="font-medium">{app.company}</span>
                <span className="flex items-center gap-1">
                  <StatusBadge status={u.previousStatus} />
                  <span aria-hidden="true">→</span>
                  <StatusBadge status={u.detectedStatus} />
                </span>
                <span className="min-w-0 flex-1 truncate text-stone-500" title={`${u.fromAddress}: ${u.subject}`}>
                  {u.state === 'suggested' ? 'Suggested from' : 'From'} “{u.subject || '(no subject)'}” ·{' '}
                  {ago(u.receivedAt)}
                  {u.reason && ` · ${u.reason}`}
                </span>
                {u.state === 'applied' ? (
                  <button
                    onClick={() => act(u.id, api.undoEmailUpdate)}
                    disabled={busy !== null}
                    className="text-stone-600 hover:text-stone-900 disabled:opacity-50"
                    aria-label={`Undo ${app.company} update`}
                  >
                    Undo
                  </button>
                ) : (
                  <span className="flex gap-3">
                    <button
                      onClick={() => act(u.id, api.applyEmailUpdate)}
                      disabled={busy !== null}
                      className="font-medium text-stone-900 hover:underline disabled:opacity-50"
                      aria-label={`Apply ${app.company} update`}
                    >
                      Apply
                    </button>
                    <button
                      onClick={() => act(u.id, api.dismissEmailUpdate)}
                      disabled={busy !== null}
                      className="text-stone-500 hover:text-stone-800 disabled:opacity-50"
                      aria-label={`Dismiss ${app.company} update`}
                    >
                      Dismiss
                    </button>
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
