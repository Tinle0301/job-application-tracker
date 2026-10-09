import { useEffect, useState } from 'react'
import type { TrackerApi } from '@backend/services/api'

/** The one resume the AI match compares against (plain text). */
export function ResumePanel({ api }: { api: TrackerApi }) {
  const [content, setContent] = useState('')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getResume().then((res) => {
      if (cancelled) return
      if (res.data) {
        setContent(res.data.content)
        setSavedAt(res.data.updatedAt)
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [api])

  const save = async () => {
    setSaving(true)
    const res = await api.saveResume(content)
    setSaving(false)
    if (res.error) setStatus({ kind: 'error', text: res.error.message })
    else {
      setSavedAt(res.data.updatedAt)
      setStatus({ kind: 'ok', text: 'Resume saved.' })
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>

  return (
    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-semibold">Your resume</h2>
        <p className="text-sm text-stone-500">
          Paste your resume as plain text. "Analyze fit" compares it with each job description.
        </p>
      </div>
      <label className="block text-sm font-medium">
        Resume text
        <textarea
          rows={16}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2 font-mono text-xs"
          placeholder="Name, contact, education, experience, projects, skills…"
        />
      </label>
      <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
        <span>
          {content.trim().length.toLocaleString()} / 20,000 characters
          {savedAt && ` · last saved ${new Date(savedAt).toLocaleString()}`}
        </span>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save resume'}
        </button>
      </div>
      {status && (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={status.kind === 'error' ? 'text-sm text-rose-700' : 'text-sm text-emerald-700'}
        >
          {status.text}
        </p>
      )}
    </section>
  )
}
