// posting.ts — fetches a job posting page as plain text (parse-job, and
// email-scan for jobs added from confirmation emails).
import { htmlToText, isSafePublicUrl } from './html.ts'
import { jobPostingFromJsonLd, knownSource, metaSummary, postingText, readKnownSource } from './jobSources.ts'

const MAX_INPUT = 30000
const MAX_REDIRECTS = 4
/** Jina Reader: opens a page in a real browser and returns its text. Free, no key, no AI. */
const PAGE_READER = 'https://r.jina.ai/'

/** The page reader is busy or unreachable: try the link again later. */
export class PageReaderError extends Error {}

/**
 * The page's text as a browser shows it, for careers sites that send servers
 * an empty or script-only page. '' when the reader opened it but found no text.
 */
export async function readRenderedPage(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (!isSafePublicUrl(url)) return ''
  let res: Response
  try {
    res = await fetchImpl(PAGE_READER + url, {
      headers: { accept: 'text/plain', 'x-return-format': 'text', 'x-timeout': '20' },
      signal: AbortSignal.timeout(30000),
    })
  } catch (e) {
    throw new PageReaderError(`page reader unreachable: ${e instanceof Error ? e.message : e}`)
  }
  if (res.status === 429 || res.status >= 500) {
    await res.body?.cancel()
    throw new PageReaderError(`page reader error ${res.status}`)
  }
  if (!res.ok) {
    await res.body?.cancel()
    return ''
  }
  const text = (await res.text()).replace(/\n{3,}/g, '\n\n').trim()
  return text.length >= 200 ? text.slice(0, MAX_INPUT) : ''
}

/** fetch() that follows redirects itself, re-checking every hop is a public host. */
async function safeFetch(url: string, accept: string): Promise<Response | null> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafePublicUrl(current)) return null
    const res = await fetch(current, {
      redirect: 'manual',
      headers: {
        accept,
        'accept-language': 'en-US,en;q=0.9',
        'user-agent':
          'Mozilla/5.0 (compatible; job-application-tracker/1.0; +https://github.com/Tinle0301/job-application-tracker)',
      },
      signal: AbortSignal.timeout(8000),
    })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (!next) return res
    await res.body?.cancel()
    current = new URL(next, current).toString()
  }
  return null
}

async function readBody(res: Response | null, types: string[]): Promise<string | null> {
  if (!res?.ok) return null
  const type = res.headers.get('content-type') ?? ''
  if (!types.some((t) => type.includes(t))) return null
  return await res.text()
}

/**
 * The posting's text, and the page it ended up on after redirects ('' text
 * when it can't be read). Throws PageReaderError when the browser reader
 * needed for a script-only page is busy. Known job boards go through their public data
 * endpoint; anything else through the page itself.
 */
export async function fetchPosting(url: string): Promise<{ text: string; url: string }> {
  const known = knownSource(url)
  if (known) {
    try {
      const body = await readBody(await safeFetch(known.fetchUrl, 'application/json, text/html'), ['json', 'html'])
      const fields = body ? readKnownSource(known, body) : null
      const text = fields ? postingText(fields) : ''
      if (text.length >= 200) return { text: text.slice(0, MAX_INPUT), url }
    } catch {
      /* fall back to the page */
    }
  }
  const page = await safeFetch(url, 'text/html, text/plain').catch(() => null)
  const final = page?.url || url
  const html = await readBody(page, ['text/html', 'text/plain']).catch(() => null)
  if (html) {
    const ld = jobPostingFromJsonLd(html)
    if (ld?.description && ld.description.length >= 100)
      return { text: postingText(ld).slice(0, MAX_INPUT), url: final }
    const body = htmlToText(html, MAX_INPUT)
    if (body.length >= 200) return { text: body, url: final }
  }
  // Turned away, or a JavaScript-rendered page that is mostly empty: read it in a real browser.
  const rendered = await readRenderedPage(url)
  if (rendered) return { text: rendered, url: final }
  // Its title and description still name the job.
  return { text: html ? `${metaSummary(html)}\n\n${htmlToText(html, MAX_INPUT)}`.trim() : '', url: final }
}
