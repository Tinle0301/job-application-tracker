// email.ts — the pure parts of inbox sync: reading Gmail message payloads,
// matching an email to a tracked application, and deciding whether a
// detected stage should change the application's status.
// No Deno APIs, so Vitest can test it.

import { htmlToText } from './html.ts'

export type Stage = 'wishlist' | 'applied' | 'assessment' | 'interviewing' | 'offer' | 'rejected' | 'withdrawn'

/** Stages the model may report for an email ('none' = not about an application's progress). */
export const EMAIL_STAGES = ['applied', 'assessment', 'interviewing', 'offer', 'rejected', 'none'] as const
export type EmailStage = (typeof EMAIL_STAGES)[number]

/** First scan looks this far back; later scans start a little before the previous one. */
export const FIRST_SCAN_DAYS = 30
export const SCAN_OVERLAP_SECONDS = 3600

const JOB_WORDS = [
  'application',
  'applied',
  'applying',
  'interview',
  'assessment',
  'offer',
  'candidate',
  'candidacy',
  'position',
  'role',
  'recruiter',
  'recruiting',
  'hiring',
  'unfortunately',
  '"next steps"',
  '"thank you for your interest"',
  '"coding challenge"',
  '"take-home"',
  'hackerrank',
  'codesignal',
]

/** Gmail search for job-related mail received after `afterEpochSeconds` (not sent by the user). */
export function gmailQuery(afterEpochSeconds: number): string {
  return `after:${Math.floor(afterEpochSeconds)} -from:me -in:chats -in:spam -in:trash (${JOB_WORDS.join(' OR ')})`
}

// ---------------------------------------------------------------- messages

export interface GmailPart {
  mimeType?: string
  headers?: { name: string; value: string }[]
  body?: { data?: string; size?: number }
  parts?: GmailPart[]
}

export interface GmailMessage {
  id: string
  internalDate?: string
  snippet?: string
  payload?: GmailPart
}

export interface EmailSummary {
  id: string
  fromName: string
  fromAddress: string
  subject: string
  receivedAt: string // ISO
  snippet: string
  body: string
}

export function decodeBase64Url(data: string): string {
  try {
    const bin = atob(data.replace(/-/g, '+').replace(/_/g, '/'))
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return new TextDecoder().decode(bytes)
  } catch {
    return ''
  }
}

/** "Acme Talent <jobs@acme.com>" → name and address. */
export function parseFrom(raw: string): { name: string; address: string } {
  const m = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/)
  if (m) return { name: m[1].trim(), address: m[2].trim().toLowerCase() }
  return { name: '', address: raw.trim().toLowerCase() }
}

function findPart(part: GmailPart | undefined, mime: string): string {
  if (!part) return ''
  if (part.mimeType === mime && part.body?.data) return decodeBase64Url(part.body.data)
  for (const p of part.parts ?? []) {
    const found = findPart(p, mime)
    if (found) return found
  }
  return ''
}

/** Plain-text body: the text/plain part, else the HTML part as text. */
export function messageBody(payload: GmailPart | undefined, maxChars = 4000): string {
  const plain = findPart(payload, 'text/plain')
  const text = plain || htmlToText(findPart(payload, 'text/html'))
  return text
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxChars)
}

export function summarizeMessage(m: GmailMessage, withBody = true): EmailSummary {
  const header = (name: string) =>
    m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
  const from = parseFrom(header('From'))
  const ms = Number(m.internalDate)
  return {
    id: m.id,
    fromName: from.name,
    fromAddress: from.address,
    subject: header('Subject').slice(0, 500),
    receivedAt: new Date(Number.isFinite(ms) && ms > 0 ? ms : Date.now()).toISOString(),
    snippet: htmlToText(m.snippet ?? ''),
    body: withBody ? messageBody(m.payload) : '',
  }
}

// ---------------------------------------------------------------- matching

export interface TrackedApplication {
  id: string
  company: string
  role: string
  status: Stage
  updatedAt: string
}

export interface EmailMatch {
  application: TrackedApplication
  /** More than one application fits equally well; never auto-apply. */
  ambiguous: boolean
}

const LEGAL_SUFFIXES = new Set([
  'inc',
  'incorporated',
  'llc',
  'ltd',
  'limited',
  'corp',
  'corporation',
  'co',
  'company',
  'gmbh',
  'plc',
  'ag',
  'sa',
  'bv',
  'pty',
  'the',
])

/** Domains that send on behalf of many companies (ATS, job boards, webmail). */
const SHARED_SENDER_DOMAINS = [
  'greenhouse.io',
  'greenhouse-mail.io',
  'lever.co',
  'hire.lever.co',
  'ashbyhq.com',
  'myworkday.com',
  'myworkdayjobs.com',
  'workday.com',
  'smartrecruiters.com',
  'icims.com',
  'jobvite.com',
  'workable.com',
  'workablemail.com',
  'bamboohr.com',
  'breezy.hr',
  'recruitee.com',
  'teamtailor.com',
  'successfactors.com',
  'taleo.net',
  'oraclecloud.com',
  'linkedin.com',
  'indeed.com',
  'indeedemail.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'hackerrank.com',
  'hackerrankforwork.com',
  'codesignal.com',
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'yahoo.com',
  'icloud.com',
]

const GENERIC_DOMAIN_LABELS = new Set([
  'mail',
  'email',
  'e',
  'em',
  'jobs',
  'careers',
  'career',
  'recruiting',
  'talent',
  'hr',
  'notifications',
  'notify',
  'noreply',
  'no-reply',
  'www',
  'us',
  'eu',
  'corp',
  'team',
])

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)

/** "Northwind Labs, Inc." → ['northwind', 'labs'] */
export function companyWords(company: string): string[] {
  const w = words(company)
  while (w.length > 1 && LEGAL_SUFFIXES.has(w[w.length - 1])) w.pop()
  return w
}

const containsPhrase = (haystack: string[], phrase: string[]) => {
  if (!phrase.length) return false
  outer: for (let i = 0; i <= haystack.length - phrase.length; i++) {
    for (let j = 0; j < phrase.length; j++) if (haystack[i + j] !== phrase[j]) continue outer
    return true
  }
  return false
}

/** Labels of the sender's own domain that can name a company ("careers.acme.co.uk" → ['acme']). */
function senderLabels(address: string): string[] {
  const domain = address.split('@')[1] ?? ''
  if (!domain || SHARED_SENDER_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return []
  return domain
    .split('.')
    .slice(0, -1)
    .filter((l) => l.length >= 2 && !GENERIC_DOMAIN_LABELS.has(l) && !['co', 'com', 'org', 'net'].includes(l))
    .map((l) => l.replace(/-/g, ''))
}

/** How strongly an email points at a company (0 = not at all). */
export function companyScore(email: EmailSummary, company: string): number {
  const phrase = companyWords(company)
  if (!phrase.length) return 0
  const compact = phrase.join('')
  // A distinctive first word ("Northwind" for "Northwind Labs") counts for a little less.
  const head = phrase.length > 1 && phrase[0].length >= 4 ? [phrase[0]] : null

  let score = 0
  const labels = senderLabels(email.fromAddress)
  if (labels.some((l) => l === compact || (head && l === head[0]))) score = Math.max(score, 3)

  const fields: [string, number][] = [
    [email.fromName, 3],
    [email.subject, 2],
    [`${email.snippet} ${email.body}`, 1],
  ]
  for (const [text, weight] of fields) {
    const w = words(text)
    if (containsPhrase(w, phrase) || w.includes(compact)) score = Math.max(score, weight)
    else if (head && containsPhrase(w, head)) score = Math.max(score, weight - 1)
  }
  return score
}

const ROLE_STOPWORDS = new Set([
  'i',
  'ii',
  'iii',
  'the',
  'a',
  'an',
  'of',
  'and',
  'for',
  'to',
  'in',
  'at',
  'new',
  'grad',
])

/** Share of the role's words found in the email (0–1). */
export function roleOverlap(email: EmailSummary, role: string): number {
  const want = words(role).filter((w) => !ROLE_STOPWORDS.has(w))
  if (!want.length) return 0
  const have = new Set(words(`${email.subject} ${email.snippet} ${email.body}`))
  return want.filter((w) => have.has(w)).length / want.length
}

const ACTIVE: Stage[] = ['wishlist', 'applied', 'assessment', 'interviewing']

/**
 * The application an email is about, or null. Emails that name several
 * different companies (job alerts, digests) are skipped.
 */
export function matchApplication(email: EmailSummary, apps: TrackedApplication[]): EmailMatch | null {
  const scored = apps.map((app) => ({ app, score: companyScore(email, app.company) })).filter((s) => s.score >= 2)
  if (!scored.length) return null
  const companies = new Set(scored.map((s) => companyWords(s.app.company).join(' ')))
  if (companies.size > 2) return null

  const ranked = scored
    .map((s) => ({ ...s, total: s.score + (roleOverlap(email, s.app.role) >= 0.6 ? 2 : 0) }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        Number(ACTIVE.includes(b.app.status)) - Number(ACTIVE.includes(a.app.status)) ||
        b.app.updatedAt.localeCompare(a.app.updatedAt),
    )
  const [best, next] = ranked
  return { application: best.app, ambiguous: Boolean(next && next.total === best.total) }
}

// ---------------------------------------------------------------- decision

const RANK: Partial<Record<Stage, number>> = { wishlist: 0, applied: 1, assessment: 2, interviewing: 3, offer: 4 }

/** Below this the model's answer is only offered as a suggestion. */
export const AUTO_APPLY_CONFIDENCE = 0.75

/**
 * What to do with a detected stage:
 * - 'apply': move the application now (it can be undone);
 * - 'suggest': show it and let the user decide;
 * - 'skip': nothing to record (no change, or a step backwards like a late
 *   "we received your application" after an interview invite).
 */
export function decideUpdate(
  current: Stage,
  detected: EmailStage,
  confidence: number,
  ambiguous: boolean,
): 'apply' | 'suggest' | 'skip' {
  if (detected === 'none' || detected === current) return 'skip'
  let action: 'apply' | 'suggest' | 'skip'
  if (current === 'rejected' || current === 'withdrawn') action = 'suggest'
  else if (detected === 'rejected') action = current === 'offer' ? 'suggest' : 'apply'
  else action = (RANK[detected] ?? 0) > (RANK[current] ?? 0) ? 'apply' : 'skip'
  if (action === 'apply' && (ambiguous || confidence < AUTO_APPLY_CONFIDENCE)) action = 'suggest'
  return action
}
