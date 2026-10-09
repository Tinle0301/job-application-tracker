// match-resume — POST { applicationId } → { data: FitAnalysis, error }
// Scores the user's default resume against the application's job description
// and stores the result in ai_analyses (RLS: the caller must own both rows).
import { callLlmTool, LlmError } from '../_shared/llm.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { MATCH_SYSTEM, MATCH_TOOL, matchUserMessage, validateFit } from '../_shared/prompts.ts'
import { currentUser, overQuota, userClient } from '../_shared/supabase.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  let applicationId = ''
  try {
    applicationId = String((await req.json()).applicationId ?? '')
  } catch {
    return fail(400, 'INVALID_JSON', 'Request body must be JSON.')
  }
  if (!UUID.test(applicationId)) return fail(400, 'INVALID_ID', 'Unknown application.')

  // Both reads run as the user, so RLS hides other people's rows.
  const [{ data: app }, { data: resume }] = await Promise.all([
    db.from('applications').select('id, company, role, job_description').eq('id', applicationId).maybeSingle(),
    db.from('resumes').select('id, content').eq('is_default', true).maybeSingle(),
  ])
  if (!app) return fail(404, 'APPLICATION_NOT_FOUND', 'Unknown application.')
  if (!resume) return fail(400, 'NO_RESUME', 'Add your resume first (Resume tab).')
  if ((app.job_description ?? '').trim().length < 100)
    return fail(400, 'NO_JOB_DESCRIPTION', 'Add the job description to this application first.')

  if (await overQuota(db)) return fail(429, 'AI_DAILY_LIMIT', 'Daily AI limit reached. Try again tomorrow.')

  try {
    const { input, model: usedModel } = await callLlmTool({
      apiKey,
      model,
      system: MATCH_SYSTEM,
      user: matchUserMessage(resume.content, {
        company: app.company,
        role: app.role,
        description: app.job_description,
      }),
      tool: MATCH_TOOL,
      maxTokens: 1500,
    })
    const fit = validateFit(input)
    if (!fit) return fail(502, 'AI_BAD_OUTPUT', 'The AI returned an unusable answer. Please try again.')

    const { data: row, error } = await db
      .from('ai_analyses')
      .insert({
        application_id: app.id,
        resume_id: resume.id,
        kind: 'match',
        score: fit.score,
        matched_skills: fit.matchedSkills,
        missing_skills: fit.missingSkills,
        summary: fit.summary,
        suggestions: fit.suggestions,
        model: usedModel,
      })
      .select('id, created_at')
      .single()
    if (error) return fail(500, 'SAVE_FAILED', 'Could not save the analysis.')
    await db.from('ai_usage').insert({ kind: 'match' })
    return ok({ id: row.id, ...fit, model: usedModel, createdAt: row.created_at })
  } catch (e) {
    const status = e instanceof LlmError && e.status === 429 ? 429 : 502
    return fail(status, 'AI_REQUEST_FAILED', 'The AI service is unavailable right now. Please try again.')
  }
})
