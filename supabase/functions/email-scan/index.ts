// email-scan — reads recent job emails from the user's connected Gmail and
// updates application statuses (docs/EMAIL_SYNC.md).
//   POST {} with the user's JWT        → scans that user's inbox now
//   POST {} with x-scan-secret header  → scans every connected inbox (for a schedule)
// Returns { data: { scanned, matched, applied, suggested, complete }, error }.
// Deployed with verify_jwt = false so a scheduled call can authenticate with
// the shared secret alone; user calls are checked with getUser() below.
import { decryptToken } from '../_shared/crypto.ts'
import {
  FIRST_SCAN_DAYS,
  SCAN_OVERLAP_SECONDS,
  decideUpdate,
  gmailQuery,
  matchApplication,
  summarizeMessage,
  type EmailSummary,
  type TrackedApplication,
} from '../_shared/email.ts'
import { getMessage, GoogleAuthError, listMessageIds, refreshAccessToken, type GoogleOAuth } from '../_shared/gmail.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { callLlmTool, DEFAULT_MODEL, LlmError } from '../_shared/llm.ts'
import { EMAIL_SYSTEM, EMAIL_TOOL, emailUserMessage, validateEmailStages } from '../_shared/prompts.ts'
import { adminClient, currentUser, DAILY_AI_LIMIT, userClient } from '../_shared/supabase.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Messages looked at per scan, and how many matched ones the model reads. */
const MAX_MESSAGES = 100
const MAX_CLASSIFIED = 30
const BATCH = 10

interface ScanResult {
  scanned: number
  matched: number
  applied: number
  suggested: number
  /** False when a limit cut the scan short; the next scan picks up the rest. */
  complete: boolean
}

class ScanError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function settings() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const key = Deno.env.get('EMAIL_TOKEN_KEY')
  const apiKey = Deno.env.get('GEMINI_API_KEY')
  if (!clientId || !clientSecret || !key || !apiKey) return null
  const redirectUri =
    Deno.env.get('GOOGLE_REDIRECT_URI') ||
    `${Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '')}/functions/v1/email-connect`
  const oauth: GoogleOAuth = { clientId, clientSecret, redirectUri }
  return { oauth, key, apiKey, model: Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

async function scanUser(
  db: SupabaseClient,
  userId: string,
  cfg: NonNullable<ReturnType<typeof settings>>,
): Promise<ScanResult> {
  const { data: conn } = await db
    .from('email_connections')
    .select('email, refresh_token_enc, status, last_scan_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (!conn) throw new ScanError(400, 'EMAIL_NOT_CONNECTED', 'Connect your Gmail first.')
  if (conn.status !== 'connected')
    throw new ScanError(409, 'EMAIL_RECONNECT', 'Google access expired. Connect your Gmail again.')

  const refreshToken = await decryptToken(cfg.key, conn.refresh_token_enc)
  let accessToken: string
  try {
    if (!refreshToken) throw new GoogleAuthError('Token could not be decrypted.')
    accessToken = await refreshAccessToken(cfg.oauth, refreshToken)
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      await db.from('email_connections').update({ status: 'needs_reconnect' }).eq('user_id', userId)
      throw new ScanError(409, 'EMAIL_RECONNECT', 'Google access expired. Connect your Gmail again.')
    }
    throw e
  }

  const startedAt = new Date()
  const result: ScanResult = { scanned: 0, matched: 0, applied: 0, suggested: 0, complete: true }
  const finish = async () => {
    if (result.complete)
      await db.from('email_connections').update({ last_scan_at: startedAt.toISOString() }).eq('user_id', userId)
    return result
  }

  const { data: appRows, error: appError } = await db
    .from('applications')
    .select('id, company, role, status, updated_at')
    .eq('user_id', userId)
  if (appError) throw appError
  const apps: TrackedApplication[] = (appRows ?? []).map((a) => ({
    id: a.id,
    company: a.company,
    role: a.role,
    status: a.status,
    updatedAt: a.updated_at,
  }))
  if (!apps.length) return await finish()

  const since = conn.last_scan_at
    ? new Date(conn.last_scan_at).getTime() / 1000 - SCAN_OVERLAP_SECONDS
    : startedAt.getTime() / 1000 - FIRST_SCAN_DAYS * 86400
  const ids = await listMessageIds(accessToken, gmailQuery(since), MAX_MESSAGES)
  result.scanned = ids.length
  if (!ids.length) return await finish()

  const { data: seenRows } = await db
    .from('email_status_updates')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', ids)
  const seen = new Set((seenRows ?? []).map((r) => r.message_id as string))

  // Headers and snippet first; only matched emails get their body fetched.
  const own = conn.email.toLowerCase()
  const heads = await mapLimit(
    ids.filter((id) => !seen.has(id)),
    5,
    async (id) => summarizeMessage(await getMessage(accessToken, id, 'metadata'), false),
  )
  const matched = heads
    .filter((h) => h.fromAddress !== own)
    .map((email) => ({ email, match: matchApplication(email, apps) }))
    .filter((m): m is { email: EmailSummary; match: NonNullable<typeof m.match> } => m.match !== null)
    .sort((a, b) => a.email.receivedAt.localeCompare(b.email.receivedAt)) // oldest first, so the latest email wins
  result.matched = matched.length
  if (matched.length > MAX_CLASSIFIED) result.complete = false
  const toRead = matched.slice(0, MAX_CLASSIFIED)
  await mapLimit(toRead, 5, async (m) => {
    m.email.body = summarizeMessage(await getMessage(accessToken, m.email.id, 'full')).body
  })

  const statusOf = new Map(apps.map((a) => [a.id, a.status]))
  for (let i = 0; i < toRead.length; i += BATCH) {
    const { count } = await db
      .from('ai_usage')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gt('created_at', new Date(Date.now() - 86400_000).toISOString())
    if ((count ?? 0) >= DAILY_AI_LIMIT) {
      result.complete = false
      break
    }

    const batch = toRead.slice(i, i + BATCH)
    let stages
    try {
      const { input } = await callLlmTool({
        apiKey: cfg.apiKey,
        model: cfg.model,
        system: EMAIL_SYSTEM,
        user: emailUserMessage(
          batch.map(({ email, match }) => ({
            id: email.id,
            company: match.application.company,
            role: match.application.role,
            from: email.fromName ? `${email.fromName} <${email.fromAddress}>` : email.fromAddress,
            subject: email.subject,
            date: email.receivedAt,
            body: email.body || email.snippet,
          })),
        ),
        tool: EMAIL_TOOL,
        maxTokens: 2000,
      })
      stages = validateEmailStages(
        input,
        batch.map((b) => b.email.id),
      )
    } catch (e) {
      if (e instanceof LlmError && e.status === 429) {
        result.complete = false
        break
      }
      throw e
    }
    await db.from('ai_usage').insert({ user_id: userId, kind: 'email' })

    for (const stage of stages) {
      const m = batch.find((b) => b.email.id === stage.id)!
      const app = m.match.application
      const current = statusOf.get(app.id) ?? app.status
      const action = decideUpdate(current, stage.stage, stage.confidence, m.match.ambiguous)
      if (action === 'skip' || stage.stage === 'none') continue

      const { data: row, error } = await db
        .from('email_status_updates')
        .upsert(
          {
            user_id: userId,
            application_id: app.id,
            message_id: m.email.id,
            from_address: m.email.fromAddress.slice(0, 320),
            subject: m.email.subject.slice(0, 500),
            received_at: m.email.receivedAt,
            detected_status: stage.stage,
            previous_status: current,
            confidence: stage.confidence,
            reason: stage.reason,
            state: 'suggested',
          },
          { onConflict: 'user_id,message_id', ignoreDuplicates: true },
        )
        .select('id')
        .maybeSingle()
      if (error || !row) continue

      if (action === 'apply') {
        const { error: applyError } = await db.rpc('apply_email_update', { p_id: row.id })
        if (!applyError) {
          statusOf.set(app.id, stage.stage)
          result.applied++
          continue
        }
      }
      result.suggested++
    }
  }
  return await finish()
}

const errorResponse = (e: unknown) =>
  e instanceof ScanError
    ? fail(e.status, e.code, e.message)
    : e instanceof GoogleAuthError
      ? fail(409, 'EMAIL_RECONNECT', 'Google access expired. Connect your Gmail again.')
      : fail(502, 'EMAIL_SCAN_FAILED', "Couldn't read your inbox right now. Please try again.")

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

  const cfg = settings()
  if (!cfg) return fail(503, 'EMAIL_NOT_CONFIGURED', 'Email sync is not configured on this server.')
  const db = adminClient()

  // Scheduled run: every connected inbox, one at a time.
  const secret = Deno.env.get('EMAIL_SCAN_SECRET')
  const given = req.headers.get('x-scan-secret')
  if (given !== null) {
    if (!secret || secret.length < 32 || given !== secret) return fail(401, 'BAD_SECRET', 'Wrong scan secret.')
    const { data: users } = await db.from('email_connections').select('user_id').eq('status', 'connected')
    const summary = { users: 0, applied: 0, suggested: 0, failed: 0 }
    for (const u of users ?? []) {
      try {
        const r = await scanUser(db, u.user_id, cfg)
        summary.users++
        summary.applied += r.applied
        summary.suggested += r.suggested
      } catch {
        summary.failed++
      }
    }
    return ok(summary)
  }

  const userId = await currentUser(userClient(req))
  if (!userId) return fail(401, 'NOT_SIGNED_IN', 'Sign in to scan your email.')
  try {
    return ok(await scanUser(db, userId, cfg))
  } catch (e) {
    return errorResponse(e)
  }
})
