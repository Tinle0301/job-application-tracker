// email-connect — connects or disconnects the signed-in user's Gmail.
//   POST { action: 'start' }      → { data: { url } }  (open it to see Google's consent screen)
//   POST { action: 'disconnect' } → { data: null }     (revokes the token at Google and forgets it)
//   POST { action: 'read', messageId } → { data: EmailMessage } (one job email the tracker
//        already tied to the user's jobs, read from Gmail now; nothing is stored, no AI call)
//   GET  ?code&state              ← Google redirects here after consent, then back to APP_URL
// Deployed with verify_jwt = false because Google's redirect carries no
// Supabase session; the POST actions check the caller's JWT themselves and
// the GET is tied to the user by a signed, expiring `state`.
import { decryptToken, encryptToken, signState, verifyState } from '../_shared/crypto.ts'
import { gmailLink, messageBody, summarizeMessage } from '../_shared/email.ts'
import {
  authUrl,
  exchangeCode,
  getMessage,
  GMAIL_SCOPE,
  GmailError,
  GoogleAuthError,
  profileEmail,
  refreshAccessToken,
  revokeToken,
  type GoogleOAuth,
} from '../_shared/gmail.ts'
import { fail, ok, preflight } from '../_shared/http.ts'
import { adminClient, currentUser, userClient } from '../_shared/supabase.ts'

function config(): { oauth: GoogleOAuth; key: string; appUrl: string } | null {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  const key = Deno.env.get('EMAIL_TOKEN_KEY')
  const appUrl = Deno.env.get('APP_URL')
  if (!clientId || !clientSecret || !key || key.length < 32 || !appUrl) return null
  const redirectUri =
    Deno.env.get('GOOGLE_REDIRECT_URI') ||
    `${Deno.env.get('SUPABASE_URL')!.replace(/\/$/, '')}/functions/v1/email-connect`
  return { oauth: { clientId, clientSecret, redirectUri }, key, appUrl }
}

/** Back to the app with ?email=<outcome>, which the app turns into a message. */
function backToApp(appUrl: string, outcome: string): Response {
  const url = new URL(appUrl)
  url.searchParams.set('email', outcome)
  return new Response(null, { status: 302, headers: { location: url.toString(), 'cache-control': 'no-store' } })
}

async function callback(req: Request): Promise<Response> {
  const cfg = config()
  if (!cfg) return new Response('Email sync is not configured on this server.', { status: 503 })
  const params = new URL(req.url).searchParams
  const userId = await verifyState(cfg.key, params.get('state') ?? '')
  if (!userId) return backToApp(cfg.appUrl, 'expired')
  if (params.get('error')) return backToApp(cfg.appUrl, 'denied')
  const code = params.get('code')
  if (!code) return backToApp(cfg.appUrl, 'error')

  try {
    const tokens = await exchangeCode(cfg.oauth, code)
    // Google lets people untick the Gmail box on the consent screen.
    if (!tokens.scope.split(' ').includes(GMAIL_SCOPE)) {
      await revokeToken(tokens.refreshToken || tokens.accessToken)
      return backToApp(cfg.appUrl, 'missing_scope')
    }
    if (!tokens.refreshToken) return backToApp(cfg.appUrl, 'error')
    const email = await profileEmail(tokens.accessToken)
    const { error } = await adminClient()
      .from('email_connections')
      .upsert(
        {
          user_id: userId,
          provider: 'gmail',
          email,
          refresh_token_enc: await encryptToken(cfg.key, tokens.refreshToken),
          status: 'connected',
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      )
    return backToApp(cfg.appUrl, error ? 'error' : 'connected')
  } catch {
    return backToApp(cfg.appUrl, 'error')
  }
}

/** Longest email body sent to the app. */
const MAX_BODY_CHARS = 20_000

/** True when the tracker already tied this email to one of the user's jobs (only those can be opened). */
async function isJobEmail(userId: string, messageId: string): Promise<boolean> {
  const admin = adminClient()
  const tables = ['application_emails', 'email_status_updates', 'email_new_applications']
  const found = await Promise.all(
    tables.map((t) =>
      admin.from(t).select('id').eq('user_id', userId).eq('message_id', messageId).limit(1).maybeSingle(),
    ),
  )
  return found.some((r) => r.data)
}

/** Reads one job email from Gmail so the app can show it. */
async function readEmail(cfg: { oauth: GoogleOAuth; key: string }, userId: string, messageId: unknown) {
  if (typeof messageId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(messageId))
    return fail(400, 'INVALID_MESSAGE', 'That email id is not valid.')
  if (!(await isJobEmail(userId, messageId))) return fail(404, 'EMAIL_NOT_FOUND', 'That email is not in your tracker.')

  const admin = adminClient()
  const { data: conn } = await admin
    .from('email_connections')
    .select('email, refresh_token_enc, status')
    .eq('user_id', userId)
    .maybeSingle()
  if (!conn) return fail(409, 'EMAIL_NOT_CONNECTED', 'Connect your Gmail to read this email.')
  const reconnect = () => fail(409, 'EMAIL_RECONNECT', 'Google access expired. Connect your Gmail again.')
  if (conn.status === 'needs_reconnect') return reconnect()

  try {
    const refreshToken = await decryptToken(cfg.key, conn.refresh_token_enc)
    if (!refreshToken) throw new GoogleAuthError('Token could not be decrypted.')
    const accessToken = await refreshAccessToken(cfg.oauth, refreshToken)
    const message = await getMessage(accessToken, messageId, 'full')
    const s = summarizeMessage(message, false)
    return ok({
      fromName: s.fromName,
      fromAddress: s.fromAddress,
      subject: s.subject,
      receivedAt: s.receivedAt,
      body: messageBody(message.payload, MAX_BODY_CHARS),
      link: gmailLink(messageId, conn.email),
    })
  } catch (e) {
    if (e instanceof GoogleAuthError) {
      await admin.from('email_connections').update({ status: 'needs_reconnect' }).eq('user_id', userId)
      return reconnect()
    }
    if (e instanceof GmailError && e.status === 404)
      return fail(404, 'EMAIL_NOT_FOUND', 'This email is no longer in your Gmail.')
    console.error('email-connect read failed:', e instanceof Error ? e.message : e)
    return fail(502, 'EMAIL_READ_FAILED', "Couldn't read this email from Gmail. Please try again.")
  }
}

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method === 'GET') return await callback(req)
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

  const userId = await currentUser(userClient(req))
  if (!userId) return fail(401, 'NOT_SIGNED_IN', 'Sign in to connect your email.')
  const cfg = config()
  if (!cfg) return fail(503, 'EMAIL_NOT_CONFIGURED', 'Email sync is not configured on this server.')

  let body: { action?: unknown; messageId?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail(400, 'INVALID_JSON', 'Request body must be JSON.')
  }

  if (body.action === 'start') {
    return ok({ url: authUrl(cfg.oauth, await signState(cfg.key, userId)) })
  }

  if (body.action === 'disconnect') {
    const admin = adminClient()
    const { data } = await admin
      .from('email_connections')
      .select('refresh_token_enc')
      .eq('user_id', userId)
      .maybeSingle()
    const token = data ? await decryptToken(cfg.key, data.refresh_token_enc) : null
    if (token) await revokeToken(token)
    const { error } = await admin.from('email_connections').delete().eq('user_id', userId)
    if (error) return fail(500, 'DISCONNECT_FAILED', "Couldn't disconnect your email. Please try again.")
    return ok(null)
  }

  if (body.action === 'read') return await readEmail(cfg, userId, body.messageId)

  return fail(400, 'UNKNOWN_ACTION', "Use action 'start', 'disconnect' or 'read'.")
})
