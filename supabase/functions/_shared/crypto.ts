// crypto.ts — encrypts Gmail refresh tokens at rest and signs the OAuth
// `state` parameter. Both keys derive from one secret (EMAIL_TOKEN_KEY), so
// a database dump alone can't read anyone's mail.
// WebCrypto only (no Deno APIs) so Vitest can test it.

const enc = new TextEncoder()
const dec = new TextDecoder()

function b64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** A 256-bit key for `purpose`, derived from the secret. */
async function rawKey(secret: string, purpose: string): Promise<ArrayBuffer> {
  if (secret.length < 32) throw new Error('EMAIL_TOKEN_KEY must be at least 32 characters')
  return await crypto.subtle.digest('SHA-256', enc.encode(`${purpose}:${secret}`))
}

export async function encryptToken(secret: string, plain: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', await rawKey(secret, 'token'), 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plain)))
  return `v1.${b64url(iv)}.${b64url(sealed)}`
}

/** Returns null when the value was not sealed with this secret. */
export async function decryptToken(secret: string, sealed: string): Promise<string | null> {
  const [v, iv, data] = sealed.split('.')
  if (v !== 'v1' || !iv || !data) return null
  try {
    const key = await crypto.subtle.importKey('raw', await rawKey(secret, 'token'), 'AES-GCM', false, ['decrypt'])
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64url(iv) }, key, fromB64url(data)))
  } catch {
    return null
  }
}

async function hmac(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    await rawKey(secret, 'state'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(payload))))
}

/** OAuth state: who started the connect flow, valid for `ttlSeconds`. */
export async function signState(secret: string, userId: string, ttlSeconds = 600, now = Date.now()): Promise<string> {
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(12)))
  const payload = b64url(enc.encode(JSON.stringify({ u: userId, e: Math.floor(now / 1000) + ttlSeconds, n: nonce })))
  return `${payload}.${await hmac(secret, payload)}`
}

/** Returns the user id from a valid, unexpired state, else null. */
export async function verifyState(secret: string, state: string, now = Date.now()): Promise<string | null> {
  const [payload, sig] = state.split('.')
  if (!payload || !sig) return null
  const expected = await hmac(secret, payload)
  // Constant-time compare.
  if (expected.length !== sig.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
  if (diff !== 0) return null
  try {
    const { u, e } = JSON.parse(dec.decode(fromB64url(payload))) as { u?: unknown; e?: unknown }
    if (typeof u !== 'string' || typeof e !== 'number' || e * 1000 < now) return null
    return u
  } catch {
    return null
  }
}
