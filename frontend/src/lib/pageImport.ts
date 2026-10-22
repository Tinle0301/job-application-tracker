// pageImport.ts — the "Save job description" bookmark. Clicked on a job
// posting in the user's own browser, it copies the page's text (or the
// selected text) and opens the tracker with it in the URL fragment, which
// never reaches a server. No page fetch and no AI call: it works for careers
// sites that turn away servers.
import type { Application } from '@backend/models/types'

export interface PageImport {
  url: string
  text: string
}

const PREFIX = '#jd='
const MAX_TEXT = 30000

/** The bookmark's code, opening the tracker at `origin`. */
export function bookmarkletHref(origin: string): string {
  const code = `(()=>{const s=String(getSelection()).trim();const m=document.querySelector('main,[role=main],article');const t=(s.length>=200?s:m&&m.innerText.trim().length>=200?m.innerText:document.body.innerText).trim().slice(0,${MAX_TEXT});window.open(${JSON.stringify(origin + '/' + PREFIX)}+encodeURIComponent(JSON.stringify({u:location.href,t})),'_blank')})()`
  return `javascript:${code}`
}

/** The page the bookmark sent, or null when the fragment isn't one. */
export function readPageImport(hash: string): PageImport | null {
  if (!hash.startsWith(PREFIX)) return null
  try {
    const data = JSON.parse(decodeURIComponent(hash.slice(PREFIX.length))) as { u?: unknown; t?: unknown }
    const url = typeof data.u === 'string' ? data.u : ''
    const text = typeof data.t === 'string' ? data.t.trim().slice(0, MAX_TEXT) : ''
    if (!/^https?:\/\//i.test(url) || !text) return null
    return { url, text }
  } catch {
    return null
  }
}

function linkKey(url: string): { host: string; path: string; id: string } | null {
  try {
    const u = new URL(url)
    const path = u.pathname.replace(/\/+$/, '').toLowerCase()
    return {
      host: u.hostname.replace(/^www\./, '').toLowerCase(),
      path,
      id: path.match(/(\d{4,})(?!.*\d{4,})/)?.[1] ?? '',
    }
  } catch {
    return null
  }
}

/** The application whose posting link is this page: same address, or the same site and job number. */
export function findApplicationForPage(apps: Application[], pageUrl: string): Application | undefined {
  const page = linkKey(pageUrl)
  if (!page) return undefined
  const keyed = apps.map((a) => ({ a, k: a.url ? linkKey(a.url) : null }))
  return (
    keyed.find(({ k }) => k && k.host === page.host && k.path === page.path)?.a ??
    keyed.find(({ k }) => k && page.id && k.host === page.host && k.id === page.id)?.a
  )
}
