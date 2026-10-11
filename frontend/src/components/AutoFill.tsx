import { useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import type { ParsedJob } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'

const isUrl = (value: string) => /^https?:\/\/\S+$/i.test(value)

interface Props {
  api: TrackerApi
  autoFocus?: boolean
  /** Called as soon as a link is entered, so the form keeps it even if reading the page fails. */
  onLink: (url: string) => void
  onParsed: (job: ParsedJob, url?: string) => void
}

/**
 * Link-first auto-fill: paste a job link and the parse-job function reads the
 * posting and fills the form. If the page can't be read (login walls), it
 * switches to pasting the posting text, keeping the link.
 */
export function AutoFill({ api, autoFocus, onLink, onParsed }: Props) {
  const [mode, setMode] = useState<'link' | 'text'>('link')
  const [link, setLink] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parse = async (source: { url?: string; text?: string }, url?: string) => {
    setBusy(true)
    setError(null)
    const res = await api.parseJobPosting(source)
    setBusy(false)
    if (res.error) {
      setError(res.error.message)
      if (res.error.code === 'FETCH_FAILED') setMode('text')
      return
    }
    onParsed(res.data, url)
    setLink('')
    setText('')
    setMode('link')
  }

  const runLink = (raw = link) => {
    const value = raw.trim()
    if (!value || busy) return
    // Someone pasted the whole posting into the link box: read it as text.
    if (!isUrl(value)) return parse({ text: value })
    onLink(value)
    return parse({ url: value }, value)
  }

  const runText = () => {
    const value = text.trim()
    if (!value || busy) return
    const url = isUrl(link.trim()) ? link.trim() : undefined
    return parse(url ? { text: value, url } : { text: value }, url)
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').trim()
    if (!isUrl(pasted) || link.trim()) return
    e.preventDefault()
    setLink(pasted)
    void runLink(pasted)
  }

  // Enter would otherwise submit the whole application form.
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    void runLink()
  }

  const button =
    'shrink-0 rounded-lg bg-violet-700 px-3 py-2 text-sm font-medium text-white hover:bg-violet-600 disabled:opacity-50'
  const toggle = 'text-xs font-medium text-violet-800 underline-offset-2 hover:underline'

  return (
    <div className="space-y-2 rounded-xl border border-violet-200 bg-violet-50/50 p-3">
      {mode === 'link' ? (
        <>
          <label htmlFor="autofill-link" className="block text-sm font-medium text-violet-900">
            Paste a job link
          </label>
          <div className="flex gap-2">
            <input
              id="autofill-link"
              type="text"
              inputMode="url"
              autoComplete="off"
              autoFocus={autoFocus}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              onPaste={onPaste}
              onKeyDown={onKeyDown}
              placeholder="https://jobs.lever.co/…"
              className="w-full min-w-0 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
            />
            <button type="button" onClick={() => void runLink()} disabled={busy || !link.trim()} className={button}>
              {busy ? 'Reading…' : 'Auto-fill'}
            </button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-violet-900/70">
              Fills company, role, location, salary and the description. Works with LinkedIn, Greenhouse, Lever, Ashby,
              Workday and most career pages.
            </p>
            <button type="button" onClick={() => setMode('text')} className={toggle}>
              Paste the text instead
            </button>
          </div>
        </>
      ) : (
        <>
          <label className="block text-sm font-medium text-violet-900">
            Or paste the posting text
            <textarea
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Copy the job description from the page and paste it here"
              className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => setMode('link')} className={toggle}>
              Use a job link instead
            </button>
            <button type="button" onClick={() => void runText()} disabled={busy || !text.trim()} className={button}>
              {busy ? 'Reading…' : 'Auto-fill'}
            </button>
          </div>
        </>
      )}
      {error && (
        <p role="alert" className="text-xs text-rose-700">
          {error}
        </p>
      )}
    </div>
  )
}
