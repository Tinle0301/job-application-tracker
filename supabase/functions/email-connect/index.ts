// email-connect — connects or disconnects the signed-in user's Gmail.
//   POST { action: 'start' }      → { data: { url } }  (open it to see Google's consent screen)
//   POST { action: 'disconnect' } → { data: null }     (revokes the token at Google and forgets it)
//   GET  ?code&state              ← Google redirects here after consent, then back to APP_URL
// Deployed with verify_jwt = false because Google's redirect carries no
// Supabase session; the POST actions check the caller's JWT themselves and
// the GET is tied to the user by a signed, expiring `state`.
import { decryptToken, encryptToken, signState, verifyState } from '../_shared/crypto.ts'
import { authUrl, exchangeCode, GMAIL_SCOPE, profileEmail, revokeToken, type GoogleOAuth } from '../_shared/gmail.ts'
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

Deno.serve(async (req) => {
  const pre = preflight(req)
  if (pre) return pre
  if (req.method === 'GET') return await callback(req)
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST.')

  const userId = await currentUser(userClient(req))
  if (!userId) return fail(401, 'NOT_SIGNED_IN', 'Sign in to connect your email.')
  const cfg = config()
  if (!cfg) return fail(503, 'EMAIL_NOT_CONFIGURED', 'Email sync is not configured on this server.')

  let body: { action?: unknown }
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

  return fail(400, 'UNKNOWN_ACTION', "Use action 'start' or 'disconnect'.")
})
