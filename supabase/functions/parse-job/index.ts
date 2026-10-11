// parse-job — POST { text?: string, url?: string } → { data: ParsedJob, error }
// Paste a job posting (or its URL) and get the form fields back.
import { callLlmTool, DEFAULT_MODEL, LlmError } from '../_shared/llm.ts'
import { htmlToText, isSafePublicUrl } from '../_shared/html.ts'
import { jobPostingFromJsonLd, knownSource, metaSummary, postingText, readKnownSource } from '../_shared/jobSources.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { PARSE_SYSTEM, PARSE_TOOL, validateParsedJob } from '../_shared/prompts.ts'
import { AUTOFILL_LIMIT_MESSAGE, autofillsLeft, currentUser, overQuota, userClient } from '../_shared/supabase.ts'

const MAX_INPUT = 30000
const MAX_REDIRECTS = 4

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

/** Known job boards go through their public data endpoint; anything else through the page itself. */
async function fetchPosting(url: string): Promise<string> {
  const known = knownSource(url)
  if (known) {
    try {
      const body = await readBody(await safeFetch(known.fetchUrl, 'application/json, text/html'), ['json', 'html'])
      const fields = body ? readKnownSource(known, body) : null
      const text = fields ? postingText(fields) : ''
      if (text.length >= 200) return text.slice(0, MAX_INPUT)
    } catch {
      /* fall back to the page */
    }
  }
  const html = await readBody(await safeFetch(url, 'text/html, text/plain'), ['text/html', 'text/plain'])
  if (!html) return ''
  const ld = jobPostingFromJsonLd(html)
  if (ld?.description && ld.description.length >= 100) return postingText(ld).slice(0, MAX_INPUT)
  const body = htmlToText(html, MAX_INPUT)
  // A JavaScript-rendered page is mostly empty; its title and description still name the job.
  return body.length >= 200 ? body : `${metaSummary(html)}\n\n${body}`.trim()
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

  const db = userClient(req)
  const userId = await currentUser(db)
  if (!userId) return fail(401, 'NOT_SIGNED_IN', 'Sign in to use AI features.')

  const apiKey = Deno.env.get('GEMINI_API_KEY')
  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL
  if (!apiKey) return fail(503, 'AI_NOT_CONFIGURED', 'AI is not configured on this server.')

  let body: { text?: unknown; url?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'INVALID_JSON', 'Request body must be JSON.')
  }
  let text = typeof body.text === 'string' ? body.text.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''

  // Checked first so a used-up account never costs a page fetch or model call.
  const left = await autofillsLeft(db)
  if (left === null) return fail(503, 'AI_REQUEST_FAILED', 'Auto-fill is unavailable right now. Please try again.')
  if (left <= 0) return fail(429, 'AUTOFILL_LIMIT', AUTOFILL_LIMIT_MESSAGE)

  if (!text && url) {
    if (!isSafePublicUrl(url)) return fail(400, 'INVALID_URL', 'That URL is not a public http(s) page.')
    try {
      text = await fetchPosting(url)
    } catch {
      text = ''
    }
    if (text.length < 200)
      return fail(
        422,
        'FETCH_FAILED',
        "Couldn't read that page (it may need a login). Copy the job description from the page and paste it instead.",
      )
  }
  if (text.length < 50) return fail(400, 'NOTHING_TO_PARSE', 'Paste a job description or a job posting URL.')
  text = text.slice(0, MAX_INPUT)

  if (await overQuota(db)) return fail(429, 'AI_DAILY_LIMIT', 'Daily AI limit reached. Try again tomorrow.')

  try {
    const { input } = await callLlmTool({
      apiKey,
      model,
      system: PARSE_SYSTEM,
      user: `<posting${url ? ` source="${url.replace(/"/g, '')}"` : ''}>\n${text}\n</posting>`,
      tool: PARSE_TOOL,
      maxTokens: 1000,
    })
    const parsed = validateParsedJob(input)
    if (!parsed) return fail(422, 'PARSE_FAILED', "That doesn't look like a job posting.")
    // The database enforces the cap on this insert too (parallel requests).
    const { error } = await db.from('ai_usage').insert({ kind: 'parse' })
    if (error?.message?.startsWith('AUTOFILL_LIMIT:')) return fail(429, 'AUTOFILL_LIMIT', AUTOFILL_LIMIT_MESSAGE)
    return ok({ ...parsed, description: text })
  } catch (e) {
    const status = e instanceof LlmError && e.status === 429 ? 429 : 502
    return fail(status, 'AI_REQUEST_FAILED', 'The AI service is unavailable right now. Please try again.')
  }
})
