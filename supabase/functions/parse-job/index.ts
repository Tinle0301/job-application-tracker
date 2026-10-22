// parse-job — POST { text?: string, url?: string } → { data: ParsedJob, error }
// Paste a job posting (or its URL) and get the form fields back.
import { callLlmTool, DEFAULT_MODEL, LlmError } from '../_shared/llm.ts'
import { isSafePublicUrl } from '../_shared/html.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { fetchPosting } from '../_shared/posting.ts'
import { PARSE_SYSTEM, PARSE_TOOL, validateParsedJob } from '../_shared/prompts.ts'
import { AUTOFILL_LIMIT_MESSAGE, autofillsLeft, currentUser, overQuota, userClient } from '../_shared/supabase.ts'

const MAX_INPUT = 30000

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
      text = (await fetchPosting(url)).text
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
