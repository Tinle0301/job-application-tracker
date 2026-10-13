// gmail.ts — the few Google OAuth and Gmail API calls inbox sync needs.
// Read-only scope; tokens never reach the browser.

import type { GmailMessage } from './email.ts'

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me'

export interface GoogleOAuth {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Google refused the refresh token (revoked, expired, or app in testing for over 7 days). */
export class GoogleAuthError extends Error {}

export class GmailError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function authUrl(o: GoogleOAuth, state: string, loginHint?: string): string {
  const p = new URLSearchParams({
    client_id: o.clientId,
    redirect_uri: o.redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPE,
    access_type: 'offline',
    // Always ask, so Google returns a refresh token even on a reconnect.
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  })
  if (loginHint) p.set('login_hint', loginHint)
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`
}

async function tokenRequest(params: Record<string, string>, fetchImpl: typeof fetch) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string
    refresh_token?: string
    scope?: string
    error?: string
  }
  if (body.error === 'invalid_grant') throw new GoogleAuthError('Google access was revoked or expired.')
  if (!res.ok || !body.access_token) throw new GmailError(res.status, `Google token error ${res.status}`)
  return body
}

/** Trades the code from the consent screen for tokens. */
export async function exchangeCode(o: GoogleOAuth, code: string, fetchImpl: typeof fetch = fetch) {
  const t = await tokenRequest(
    {
      code,
      client_id: o.clientId,
      client_secret: o.clientSecret,
      redirect_uri: o.redirectUri,
      grant_type: 'authorization_code',
    },
    fetchImpl,
  )
  return { accessToken: t.access_token!, refreshToken: t.refresh_token ?? '', scope: t.scope ?? '' }
}

export async function refreshAccessToken(o: GoogleOAuth, refreshToken: string, fetchImpl: typeof fetch = fetch) {
  const t = await tokenRequest(
    { refresh_token: refreshToken, client_id: o.clientId, client_secret: o.clientSecret, grant_type: 'refresh_token' },
    fetchImpl,
  )
  return t.access_token!
}

export async function revokeToken(token: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  await fetchImpl('https://oauth2.googleapis.com/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined)
}

async function gmailGet<T>(accessToken: string, path: string, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${GMAIL}${path}`, { headers: { authorization: `Bearer ${accessToken}` } })
  if (res.status === 401) throw new GoogleAuthError('Gmail rejected the access token.')
  if (!res.ok) throw new GmailError(res.status, `Gmail API error ${res.status}`)
  return (await res.json()) as T
}

export async function profileEmail(accessToken: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const p = await gmailGet<{ emailAddress?: string }>(accessToken, '/profile', fetchImpl)
  return (p.emailAddress ?? '').toLowerCase()
}

/** Ids of messages matching `q`, newest first, at most `max`. */
export async function listMessageIds(
  accessToken: string,
  q: string,
  max: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const ids: string[] = []
  let pageToken = ''
  while (ids.length < max) {
    const p = new URLSearchParams({ q, maxResults: String(Math.min(100, max - ids.length)) })
    if (pageToken) p.set('pageToken', pageToken)
    const page = await gmailGet<{ messages?: { id: string }[]; nextPageToken?: string }>(
      accessToken,
      `/messages?${p}`,
      fetchImpl,
    )
    ids.push(...(page.messages ?? []).map((m) => m.id))
    if (!page.nextPageToken) break
    pageToken = page.nextPageToken
  }
  return ids.slice(0, max)
}

/** 'metadata' reads only From/Subject/Date and the snippet; 'full' adds the body. */
export async function getMessage(
  accessToken: string,
  id: string,
  format: 'metadata' | 'full',
  fetchImpl: typeof fetch = fetch,
): Promise<GmailMessage> {
  const p = new URLSearchParams({ format })
  if (format === 'metadata') for (const h of ['From', 'Subject', 'Date']) p.append('metadataHeaders', h)
  return await gmailGet<GmailMessage>(accessToken, `/messages/${encodeURIComponent(id)}?${p}`, fetchImpl)
}
