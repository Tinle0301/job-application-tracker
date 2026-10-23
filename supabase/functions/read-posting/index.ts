// read-posting — POST { applicationId } → { data: { description }, error }
// Reads the application's posting link now (Get description in the row) and
// saves the text as its job description. No AI call.
import { fail, ok, preflight } from '../_shared/http.ts'
import { fetchPosting } from '../_shared/posting.ts'
import { currentUser, userClient } from '../_shared/supabase.ts'

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

  const db = userClient(req)
  if (!(await currentUser(db))) return fail(401, 'NOT_SIGNED_IN', 'Sign in first.')

  let body: { applicationId?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'INVALID_JSON', 'Request body must be JSON.')
  }
  if (typeof body.applicationId !== 'string') return fail(400, 'INVALID_INPUT', 'applicationId is required.')

  // Row level security limits this to the caller's own applications.
  const { data: app } = await db.from('applications').select('id, url').eq('id', body.applicationId).maybeSingle()
  if (!app) return fail(404, 'NOT_FOUND', 'Application not found.')
  if (!app.url) return fail(400, 'NO_LINK', 'Add the job posting link with Edit first.')

  let text = ''
  try {
    text = (await fetchPosting(app.url)).text
  } catch {
    return fail(503, 'READER_BUSY', 'The page reader is busy. Try again in a minute.')
  }
  if (text.length < 200)
    return fail(
      422,
      'FETCH_FAILED',
      "Couldn't read that page (it may need a login). Copy the description from the posting and paste it with Edit.",
    )

  const description = text.slice(0, 30000)
  const { error } = await db.from('applications').update({ job_description: description }).eq('id', app.id)
  if (error) return fail(500, 'SAVE_FAILED', 'Could not save the description. Please try again.')
  return ok({ description })
})
