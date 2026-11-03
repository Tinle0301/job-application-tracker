// email-scan — reads recent job emails from the user's connected Gmail and
// updates application statuses (docs/EMAIL_SYNC.md).
//   POST { timeZone? } with the user's JWT → scans that user's inbox now
//   POST {} with x-scan-secret header      → scans every connected inbox (for a schedule)
// Each scan first adds applications from "thanks for applying" emails about
// jobs that aren't tracked yet, then updates the statuses of tracked ones.
// Returns { data: { scanned, matched, applied, suggested, added, toAdd, complete }, error }.
// Deployed with verify_jwt = false so a scheduled call can authenticate with
// the shared secret alone; user calls are checked with getUser() below.
import { decryptToken } from '../_shared/crypto.ts'
import {
  FIRST_SCAN_DAYS,
  SCAN_OVERLAP_SECONDS,
  confirmationQuery,
  decideNewApplication,
  decideUpdate,
  gmailLink,
  gmailQuery,
  jobLinkFromEmail,
  localDate,
  looksLikeConfirmation,
  matchApplication,
  summarizeMessage,
  type EmailSummary,
  type TrackedApplication,
} from '../_shared/email.ts'
import {
  getMessage,
  GmailError,
  GoogleAuthError,
  listMessageIds,
  refreshAccessToken,
  type GoogleOAuth,
} from '../_shared/gmail.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { fetchPosting, PageReaderError } from '../_shared/posting.ts'
import { callLlmTool, DEFAULT_MODEL, LlmError } from '../_shared/llm.ts'
import {
  CONFIRM_SYSTEM,
  CONFIRM_TOOL,
  confirmUserMessage,
  EMAIL_SYSTEM,
  EMAIL_TOOL,
  emailUserMessage,
  validateConfirmations,
  validateEmailStages,
} from '../_shared/prompts.ts'
import { adminClient, currentUser, DAILY_AI_LIMIT, userClient } from '../_shared/supabase.ts'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

/** Messages looked at per scan, and how many matched ones the model reads. */
const MAX_MESSAGES = 100
const MAX_CLASSIFIED = 30
const BATCH = 10
/**
 * Supabase stops a function after 150 s (free plan) and answers with a bare
 * error page. The scan stops starting new work well before that, and the
 * next check picks up the rest.
 */
const TIME_BUDGET_MS = 100_000
/** A model call is only started with at least this long left. */
const AI_CALL_MS = 40_000
/** Job posting reads are only started with at least this long left (a page fetch plus the page reader can take 45 s). */
const POSTING_READ_MS = 50_000

interface ScanResult {
  scanned: number
  matched: number
  applied: number
  suggested: number
  /** Applications added from confirmation emails. */
  added: number
  /** Confirmation emails waiting for the user to add or dismiss. */
  toAdd: number
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

type Settings = NonNullable<ReturnType<typeof settings>>

/** False once today's AI quota is used up. */
async function aiQuotaLeft(db: SupabaseClient, userId: string): Promise<boolean> {
  const { count } = await db
    .from('ai_usage')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gt('created_at', new Date(Date.now() - 86400_000).toISOString())
  return (count ?? 0) < DAILY_AI_LIMIT
}

/** Milliseconds left before the scan has to wrap up. */
type Clock = () => number

/** One model call; null when the model is rate limited or slow (the scan stops and resumes next time). */
async function ask(
  db: SupabaseClient,
  userId: string,
  cfg: Settings,
  timeLeft: Clock,
  prompt: { system: string; user: string; tool: typeof EMAIL_TOOL | typeof CONFIRM_TOOL },
): Promise<{ input: unknown } | null> {
  if (timeLeft() < AI_CALL_MS) return null
  try {
    const { input } = await callLlmTool({
      apiKey: cfg.apiKey,
      model: cfg.model,
      ...prompt,
      maxTokens: 2000,
      // Retries included; a model still busy or slow is tried again on the next check.
      timeoutMs: Math.min(60_000, timeLeft() - 5_000),
      retryDelaysMs: [2000],
    })
    await db.from('ai_usage').insert({ user_id: userId, kind: 'email' })
    return { input }
  } catch (e) {
    // Out of quota or still busy after retries: keep what was found and finish on the next check.
    if (e instanceof LlmError && (e.status === 429 || e.status >= 500)) return null
    throw e
  }
}

const fromLine = (e: EmailSummary) => (e.fromName ? `${e.fromName} <${e.fromAddress}>` : e.fromAddress)

/** Lists emails under the applications they are about (one application per email). */
async function recordEmails(
  db: SupabaseClient,
  userId: string,
  account: string,
  emails: { email: EmailSummary; applicationId: string }[],
): Promise<void> {
  if (!emails.length) return
  await db.from('application_emails').upsert(
    emails.map(({ email, applicationId }) => ({
      user_id: userId,
      application_id: applicationId,
      message_id: email.id,
      from_name: email.fromName.slice(0, 200),
      from_address: email.fromAddress.slice(0, 320),
      subject: email.subject.slice(0, 500),
      received_at: email.receivedAt,
      link: gmailLink(email.id, account),
    })),
    { onConflict: 'user_id,message_id', ignoreDuplicates: true },
  )
}

/**
 * Adds applications from "thanks for applying" emails about jobs that aren't
 * tracked yet. Returns false when a limit cut it short.
 */
async function addFromConfirmations(
  db: SupabaseClient,
  userId: string,
  cfg: Settings,
  ctx: { accessToken: string; account: string; since: number; timeZone?: string; timeLeft: Clock },
  apps: TrackedApplication[],
  result: ScanResult,
): Promise<boolean> {
  const ids = await listMessageIds(ctx.accessToken, confirmationQuery(ctx.since), MAX_MESSAGES)
  if (!ids.length) return true
  const { data: seenRows } = await db
    .from('email_new_applications')
    .select('message_id')
    .eq('user_id', userId)
    .in('message_id', ids)
  const seen = new Set((seenRows ?? []).map((r) => r.message_id as string))

  const heads = await mapLimit(
    ids.filter((id) => !seen.has(id)),
    5,
    async (id) => summarizeMessage(await getMessage(ctx.accessToken, id, 'metadata'), false),
  )
  const candidates = heads
    .filter((h) => h.fromAddress !== ctx.account && looksLikeConfirmation(h))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt)) // oldest first, so a repeat confirmation is a duplicate
  const complete = candidates.length <= MAX_CLASSIFIED
  const toRead = candidates.slice(0, MAX_CLASSIFIED)
  await mapLimit(toRead, 5, async (e) => {
    e.body = summarizeMessage(await getMessage(ctx.accessToken, e.id, 'full')).body
  })

  for (let i = 0; i < toRead.length; i += BATCH) {
    if (!(await aiQuotaLeft(db, userId))) return false
    const batch = toRead.slice(i, i + BATCH)
    const answer = await ask(db, userId, cfg, ctx.timeLeft, {
      system: CONFIRM_SYSTEM,
      user: confirmUserMessage(
        batch.map((e) => ({
          id: e.id,
          from: fromLine(e),
          subject: e.subject,
          date: e.receivedAt,
          body: e.body || e.snippet,
        })),
      ),
      tool: CONFIRM_TOOL,
    })
    if (!answer) return false
    const found = validateConfirmations(
      answer.input,
      batch.map((e) => e.id),
    )

    for (const c of found) {
      const email = batch.find((e) => e.id === c.id)!
      const decision = decideNewApplication({ ...c, receivedAt: email.receivedAt }, apps)
      // Not a confirmation: keep only the id, and let the status pass read it.
      const row =
        decision.action === 'ignore'
          ? { message_id: email.id, received_at: email.receivedAt, state: 'ignored' }
          : {
              message_id: email.id,
              from_address: email.fromAddress.slice(0, 320),
              subject: email.subject.slice(0, 500),
              received_at: email.receivedAt,
              applied_on: localDate(email.receivedAt, ctx.timeZone),
              link: gmailLink(email.id, ctx.account),
              company: c.company,
              role: c.role,
              location: c.location,
              confidence: c.confidence,
              reason: c.reason,
              state: decision.action === 'duplicate' ? 'duplicate' : 'suggested',
              application_id: decision.action === 'duplicate' ? decision.application.id : null,
            }
      const { data: saved, error } = await db
        .from('email_new_applications')
        .upsert({ user_id: userId, ...row }, { onConflict: 'user_id,message_id', ignoreDuplicates: true })
        .select('id')
        .maybeSingle()
      if (error || !saved) continue

      if (decision.action === 'duplicate') {
        await recordEmails(db, userId, ctx.account, [{ email, applicationId: decision.application.id }])
        // Already tracked: a wishlist entry moves to applied; anything else stays as it is.
        const app = decision.application
        if (app.status !== 'wishlist') continue
        const action = decideUpdate(app.status, 'applied', c.confidence, false)
        const { data: upd } = await db
          .from('email_status_updates')
          .upsert(
            {
              user_id: userId,
              application_id: app.id,
              message_id: email.id,
              from_address: email.fromAddress.slice(0, 320),
              subject: email.subject.slice(0, 500),
              received_at: email.receivedAt,
              detected_status: 'applied',
              previous_status: 'wishlist',
              confidence: c.confidence,
              reason: c.reason,
              state: 'suggested',
            },
            { onConflict: 'user_id,message_id', ignoreDuplicates: true },
          )
          .select('id')
          .maybeSingle()
        if (!upd) continue
        if (action === 'apply' && !(await db.rpc('apply_email_update', { p_id: upd.id })).error) {
          app.status = 'applied'
          // A wishlist entry has no applied date yet: use the confirmation's.
          await db
            .from('applications')
            .update({ applied_on: localDate(email.receivedAt, ctx.timeZone) })
            .eq('id', app.id)
            .is('applied_on', null)
          result.applied++
        } else result.suggested++
        continue
      }

      if (decision.action === 'create') {
        const { data: appId, error: addError } = await db.rpc('add_email_application', { p_id: saved.id })
        if (!addError && appId) {
          await recordEmails(db, userId, ctx.account, [{ email, applicationId: appId as string }])
          // Later emails in this scan see it, so a second confirmation is a duplicate.
          apps.push({
            id: appId as string,
            company: c.company,
            role: c.role,
            status: 'applied',
            updatedAt: new Date().toISOString(),
          })
          result.added++
          continue
        }
      }
      if (decision.action !== 'ignore') result.toAdd++
    }
  }
  return complete
}

/** Job postings fetched per scan (each is a page fetch). */
const MAX_POSTINGS = 5

/**
 * Fills in job postings:
 * 1. for applications added from confirmation emails, looks for the job's
 *    link in the email once and sets it as the application's link;
 * 2. for any application with a link but no description (including a link
 *    the user added with Edit), fetches the posting once per link and fills
 *    in the description. Pages that turn away a plain fetch or only render
 *    with JavaScript (many careers sites) are read by a browser page reader
 *    instead; no AI call.
 */
async function fillPostings(db: SupabaseClient, userId: string, accessToken: string, timeLeft: Clock): Promise<void> {
  if (timeLeft() < POSTING_READ_MS) return
  const { data: rows } = await db
    .from('email_new_applications')
    .select('id, message_id, application_id')
    .eq('user_id', userId)
    .eq('state', 'created')
    .is('described_at', null)
    .not('application_id', 'is', null)
    .order('received_at', { ascending: false })
    .limit(MAX_POSTINGS)
  await mapLimit(rows ?? [], MAX_POSTINGS, async (r) => {
    let jobUrl = ''
    try {
      const { data: app } = await db.from('applications').select('url').eq('id', r.application_id).maybeSingle()
      if (app && !app.url) {
        const link = jobLinkFromEmail(await getMessage(accessToken, r.message_id, 'full'))
        if (/^https:\/\//i.test(link) && link.length <= 2000) {
          jobUrl = link
          await db.from('applications').update({ url: link }).eq('id', r.application_id)
        }
      }
    } catch (e) {
      // Gmail trouble: try again on the next check. Anything else: give up on this one.
      if (e instanceof GmailError || e instanceof GoogleAuthError) return
      console.error('email-scan posting link failed:', e instanceof Error ? e.message : e)
    }
    await db
      .from('email_new_applications')
      .update({ described_at: new Date().toISOString(), job_url: jobUrl })
      .eq('id', r.id)
  })

  const { data: apps } = await db
    .from('applications')
    .select('id, url, posting_checked_url')
    .eq('user_id', userId)
    .neq('url', '')
    .eq('job_description', '')
    .order('updated_at', { ascending: false })
    .limit(50)
  // Marked per link; bumping the version prefix gives every unfilled link one more try after a lookup change.
  const checked = (url: string) => `v4:${url}`.slice(0, 2000)
  const todo = (apps ?? []).filter((a) => checked(a.url) !== a.posting_checked_url).slice(0, MAX_POSTINGS)
  if (timeLeft() < POSTING_READ_MS) return
  await mapLimit(todo, MAX_POSTINGS, async (a) => {
    let text = ''
    try {
      text = (await fetchPosting(a.url)).text
    } catch (e) {
      // The page reader is busy: try this link again on the next check.
      console.warn('email-scan posting read waits:', e instanceof Error ? e.message : e)
      if (e instanceof PageReaderError) return
    }
    if (text.length < 200) {
      text = ''
      console.warn('email-scan posting read found no description for', new URL(a.url).hostname)
    }
    const fill: Record<string, string> = { posting_checked_url: checked(a.url) }
    if (text) fill.job_description = text.slice(0, 30000)
    await db.from('applications').update(fill).eq('id', a.id).eq('job_description', '')
  })
}

async function scanUser(db: SupabaseClient, userId: string, cfg: Settings, timeZone?: string): Promise<ScanResult> {
  const { data: conn } = await db
    .from('email_connections')
    .select('email, refresh_token_enc, status, last_scan_at, confirmations_scanned_at, emails_scanned_at')
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
  const timeLeft: Clock = () => startedAt.getTime() + TIME_BUDGET_MS - Date.now()
  const result: ScanResult = { scanned: 0, matched: 0, applied: 0, suggested: 0, added: 0, toAdd: 0, complete: true }
  let confirmationsComplete = true
  let emailsListed = false
  const finish = async () => {
    const done: Record<string, string> = {}
    if (confirmationsComplete) done.confirmations_scanned_at = startedAt.toISOString()
    if (emailsListed) done.emails_scanned_at = startedAt.toISOString()
    if (result.complete) done.last_scan_at = startedAt.toISOString()
    if (Object.keys(done).length) await db.from('email_connections').update(done).eq('user_id', userId)
    result.complete &&= confirmationsComplete
    return result
  }
  const sinceFor = (last: string | null) =>
    last ? new Date(last).getTime() / 1000 - SCAN_OVERLAP_SECONDS : startedAt.getTime() / 1000 - FIRST_SCAN_DAYS * 86400

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

  const own = conn.email.toLowerCase()
  confirmationsComplete = await addFromConfirmations(
    db,
    userId,
    cfg,
    { accessToken, account: own, since: sinceFor(conn.confirmations_scanned_at), timeZone, timeLeft },
    apps,
    result,
  )
  await fillPostings(db, userId, accessToken, timeLeft)
  if (!apps.length) return await finish()

  // Every matched email is listed under its application. While the look-back
  // cursor is unset (first scan, or an application was added since), that
  // goes back further than the status check, so earlier emails show up too.
  const statusSince = sinceFor(conn.last_scan_at)
  const ids = await listMessageIds(
    accessToken,
    gmailQuery(Math.min(statusSince, sinceFor(conn.emails_scanned_at))),
    MAX_MESSAGES,
  )
  result.scanned = ids.length
  emailsListed = true
  if (!ids.length) return await finish()

  // Skip emails already handled here or as a confirmation (those that turned
  // out not to be confirmations still get read for a status change).
  const [{ data: seenRows }, { data: confirmedRows }, { data: listedRows }] = await Promise.all([
    db.from('email_status_updates').select('message_id').eq('user_id', userId).in('message_id', ids),
    db
      .from('email_new_applications')
      .select('message_id')
      .eq('user_id', userId)
      .neq('state', 'ignored')
      .in('message_id', ids),
    db.from('application_emails').select('message_id').eq('user_id', userId).in('message_id', ids),
  ])
  const seen = new Set([...(seenRows ?? []), ...(confirmedRows ?? [])].map((r) => r.message_id as string))
  const listed = new Set((listedRows ?? []).map((r) => r.message_id as string))

  // Headers and snippet first; only matched emails get their body fetched.
  const heads = await mapLimit(
    ids.filter((id) => !seen.has(id) || !listed.has(id)),
    5,
    async (id) => summarizeMessage(await getMessage(accessToken, id, 'metadata'), false),
  )
  const allMatched = heads
    .filter((h) => h.fromAddress !== own)
    .map((email) => ({ email, match: matchApplication(email, apps) }))
    .filter((m): m is { email: EmailSummary; match: NonNullable<typeof m.match> } => m.match !== null)
  await recordEmails(
    db,
    userId,
    own,
    allMatched
      .filter((m) => !listed.has(m.email.id))
      .map((m) => ({ email: m.email, applicationId: m.match.application.id })),
  )

  // Only new emails since the last status check are read for a status change.
  const statusFrom = new Date(statusSince * 1000).toISOString()
  const matched = allMatched
    .filter((m) => !seen.has(m.email.id) && m.email.receivedAt >= statusFrom)
    .sort((a, b) => a.email.receivedAt.localeCompare(b.email.receivedAt)) // oldest first, so the latest email wins
  result.matched = matched.length
  if (matched.length > MAX_CLASSIFIED) result.complete = false
  const toRead = matched.slice(0, MAX_CLASSIFIED)
  await mapLimit(toRead, 5, async (m) => {
    m.email.body = summarizeMessage(await getMessage(accessToken, m.email.id, 'full')).body
  })

  const statusOf = new Map<string, TrackedApplication['status']>(apps.map((a) => [a.id, a.status]))
  for (let i = 0; i < toRead.length; i += BATCH) {
    if (!(await aiQuotaLeft(db, userId))) {
      result.complete = false
      break
    }

    const batch = toRead.slice(i, i + BATCH)
    const answer = await ask(db, userId, cfg, timeLeft, {
      system: EMAIL_SYSTEM,
      user: emailUserMessage(
        batch.map(({ email, match }) => ({
          id: email.id,
          company: match.application.company,
          role: match.application.role,
          from: fromLine(email),
          subject: email.subject,
          date: email.receivedAt,
          body: email.body || email.snippet,
        })),
      ),
      tool: EMAIL_TOOL,
    })
    if (!answer) {
      result.complete = false
      break
    }
    const stages = validateEmailStages(
      answer.input,
      batch.map((b) => b.email.id),
    )

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

function errorResponse(e: unknown) {
  if (e instanceof ScanError) return fail(e.status, e.code, e.message)
  if (e instanceof GoogleAuthError)
    return fail(409, 'EMAIL_RECONNECT', 'Google access expired. Connect your Gmail again.')
  // Logged so the cause shows up in the function's logs on the dashboard.
  console.error('email-scan failed:', e instanceof Error ? e.message : e)
  if (e instanceof GmailError && e.status === 403)
    return fail(
      502,
      'EMAIL_GMAIL_DISABLED',
      'Gmail refused the request. Turn on the Gmail API in your Google Cloud project.',
    )
  if (e instanceof LlmError && [400, 401, 403].includes(e.status))
    return fail(502, 'EMAIL_AI_REJECTED', 'The AI service rejected the request. Check the GEMINI_API_KEY secret.')
  return fail(502, 'EMAIL_SCAN_FAILED', "Couldn't read your inbox right now. Please try again.")
}

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
    const summary = { users: 0, applied: 0, suggested: 0, added: 0, toAdd: 0, failed: 0 }
    for (const u of users ?? []) {
      try {
        const r = await scanUser(db, u.user_id, cfg)
        summary.users++
        summary.applied += r.applied
        summary.suggested += r.suggested
        summary.added += r.added
        summary.toAdd += r.toAdd
      } catch {
        summary.failed++
      }
    }
    return ok(summary)
  }

  const userId = await currentUser(userClient(req))
  if (!userId) return fail(401, 'NOT_SIGNED_IN', 'Sign in to scan your email.')
  const body = (await req.json().catch(() => ({}))) as { timeZone?: unknown }
  const timeZone = typeof body.timeZone === 'string' ? body.timeZone.slice(0, 64) : undefined
  try {
    return ok(await scanUser(db, userId, cfg, timeZone))
  } catch (e) {
    return errorResponse(e)
  }
})
