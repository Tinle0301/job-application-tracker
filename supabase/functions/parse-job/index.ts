// parse-job — POST { text?: string, url?: string } → { data: ParsedJob, error }
// Paste a job posting (or its URL) and get the form fields back.
import { callLlmTool, LlmError } from '../_shared/llm.ts'
import { htmlToText, isSafePublicUrl } from '../_shared/html.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { PARSE_SYSTEM, PARSE_TOOL, validateParsedJob } from '../_shared/prompts.ts'
import { currentUser, overQuota, userClient } from '../_shared/supabase.ts'

const MAX_INPUT = 30000

async function fetchPosting(url: string): Promise<string | null> {
  const res = await fetch(url, {
    redirect: 'manual', // a redirect could point somewhere private; refuse it
    headers: { 'user-agent': 'job-application-tracker/1.0 (+https://github.com/Tinle0301/job-application-tracker)' },
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) return null
  const type = res.headers.get('content-type') ?? ''
  if (!type.includes('text/html') && !type.includes('text/plain')) return null
  return htmlToText(await res.text(), MAX_INPUT)
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

  const db = userClient(req)
  const userId = await currentUser(db)
  if (!userId) return fail(401, 'NOT_SIGNED_IN', 'Sign in to use AI features.')

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  const model = Deno.env.get('ANTHROPIC_MODEL')
  if (!apiKey || !model) return fail(503, 'AI_NOT_CONFIGURED', 'AI is not configured on this server.')

  let body: { text?: unknown; url?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'INVALID_JSON', 'Request body must be JSON.')
  }
  let text = typeof body.text === 'string' ? body.text.trim() : ''
  const url = typeof body.url === 'string' ? body.url.trim() : ''

  if (!text && url) {
    if (!isSafePublicUrl(url)) return fail(400, 'INVALID_URL', 'That URL is not a public http(s) page.')
    try {
      text = (await fetchPosting(url)) ?? ''
    } catch {
      text = ''
    }
    if (text.length < 200)
      return fail(
        422,
        'FETCH_FAILED',
        "Couldn't read that page (it may need a login or JavaScript). Paste the text instead.",
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
    await db.from('ai_usage').insert({ kind: 'parse' })
    return ok({ ...parsed, description: text })
  } catch (e) {
    const status = e instanceof LlmError && e.status === 429 ? 429 : 502
    return fail(status, 'AI_REQUEST_FAILED', 'The AI service is unavailable right now. Please try again.')
  }
})
