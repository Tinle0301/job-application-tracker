// jobSources.ts — reads a job posting from its link.
// Most job boards render with JavaScript, so a plain page fetch often returns
// an empty shell. The big applicant-tracking systems publish the same postings
// through public JSON endpoints; this file maps a pasted link to that endpoint
// and turns the response into plain text for the model. Anything else falls
// back to the page itself, preferring its schema.org JobPosting data.
// Pure functions (no Deno APIs) so Vitest can test them.

import { htmlToText } from './html.ts'

export type SourceKind = 'greenhouse' | 'lever' | 'ashby' | 'workday' | 'linkedin'

export interface KnownSource {
  kind: SourceKind
  /** Where to fetch the posting data from. */
  fetchUrl: string
  /** The job id inside the response (Ashby returns the whole board). */
  jobId?: string
  /** Company name when the response does not carry one. */
  company?: string
}

export interface PostingFields {
  title?: string
  company?: string
  location?: string
  salary?: string
  employmentType?: string
  description?: string
}

const segments = (u: URL) => u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
const titleCase = (slug: string) => slug.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

/** Maps a job link to the public data endpoint behind it, or null for an unknown site. */
export function knownSource(raw: string): KnownSource | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  const host = u.hostname.toLowerCase()
  const seg = segments(u)

  // boards.greenhouse.io/acme/jobs/123, job-boards.greenhouse.io/acme/jobs/123,
  // boards.greenhouse.io/embed/job_app?for=acme&token=123
  if (/(^|\.)greenhouse\.io$/.test(host)) {
    let board = ''
    let id = ''
    if (seg[0] === 'embed') {
      board = u.searchParams.get('for') ?? ''
      id = u.searchParams.get('token') ?? ''
    } else if (seg[1] === 'jobs') {
      board = seg[0]
      id = seg[2] ?? ''
    }
    if (/^[\w-]+$/.test(board) && /^\d+$/.test(id))
      return {
        kind: 'greenhouse',
        fetchUrl: `https://boards-api.greenhouse.io/v1/boards/${board}/jobs/${id}?pay_transparency=true`,
      }
    return null
  }

  // jobs.lever.co/acme/<uuid>[/apply], jobs.eu.lever.co/…
  if (host === 'jobs.lever.co' || host === 'jobs.eu.lever.co') {
    const [company, id] = seg
    if (company && /^[0-9a-f-]{36}$/i.test(id ?? ''))
      return {
        kind: 'lever',
        fetchUrl: `https://${host === 'jobs.eu.lever.co' ? 'api.eu.lever.co' : 'api.lever.co'}/v0/postings/${encodeURIComponent(company)}/${id}`,
        company: titleCase(company),
      }
    return null
  }

  // jobs.ashbyhq.com/acme/<uuid>[/application]
  if (host === 'jobs.ashbyhq.com') {
    const [org, id] = seg
    if (org && /^[0-9a-f-]{36}$/i.test(id ?? ''))
      return {
        kind: 'ashby',
        fetchUrl: `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(org)}?includeCompensation=true`,
        jobId: id.toLowerCase(),
        company: titleCase(org),
      }
    return null
  }

  // acme.wd5.myworkdayjobs.com/[en-US/]Careers/job/City/Title_R123
  const wd = host.match(/^([\w-]+)\.(wd\d+)\.myworkdayjobs\.com$/)
  if (wd) {
    const rest = /^[a-z]{2}-[A-Z]{2}$/.test(seg[0] ?? '') ? seg.slice(1) : seg
    const [site, kind, ...path] = rest
    if (site && kind === 'job' && path.length)
      return {
        kind: 'workday',
        fetchUrl: `https://${host}/wday/cxs/${wd[1]}/${encodeURIComponent(site)}/job/${path.map(encodeURIComponent).join('/')}`,
      }
    return null
  }

  // linkedin.com/jobs/view/123, /jobs/view/some-title-at-acme-123, or any
  // LinkedIn jobs page with ?currentJobId=123. The guest endpoint needs no login.
  if (host === 'linkedin.com' || host.endsWith('.linkedin.com')) {
    const fromQuery = u.searchParams.get('currentJobId')
    const fromPath = seg[0] === 'jobs' && seg[1] === 'view' ? seg[2]?.match(/(\d{6,})\/?$/)?.[1] : undefined
    const id = fromQuery && /^\d+$/.test(fromQuery) ? fromQuery : fromPath
    if (id) return { kind: 'linkedin', fetchUrl: `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}` }
    return null
  }

  return null
}

/** Greenhouse escapes the HTML in `content`; decode once before stripping tags. */
const unescapeHtml = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown) => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})

function money(min: unknown, max: unknown, currency: unknown, per?: unknown): string {
  const fmt = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('en-US') : '')
  const range = [fmt(min), fmt(max)].filter(Boolean).join(' - ')
  if (!range) return ''
  // Lever says 'per-year-salary', schema.org says 'YEAR'.
  const unit = s(per)
    .toLowerCase()
    .replace(/^per[-_ ]/, '')
    .replace(/[-_ ](salary|wage)$/, '')
    .replace(/[-_]/g, ' ')
  return [s(currency), range, unit ? `per ${unit}` : ''].filter(Boolean).join(' ')
}

/** Turns the JSON (or HTML, for LinkedIn) a known source returned into posting fields. */
export function readKnownSource(src: KnownSource, body: string): PostingFields | null {
  if (src.kind === 'linkedin') {
    const text = htmlToText(body)
    return text ? { description: text } : null
  }
  let json: unknown
  try {
    json = JSON.parse(body)
  } catch {
    return null
  }
  const o = obj(json)

  if (src.kind === 'greenhouse') {
    const pay = Array.isArray(o.pay_input_ranges) ? obj(o.pay_input_ranges[0]) : {}
    const cents = (n: unknown) => (typeof n === 'number' ? n / 100 : undefined)
    return {
      title: s(o.title),
      company: s(o.company_name),
      location: s(obj(o.location).name),
      salary: money(cents(pay.min_cents), cents(pay.max_cents), pay.currency_type),
      description: htmlToText(unescapeHtml(s(o.content))),
    }
  }

  if (src.kind === 'lever') {
    const cat = obj(o.categories)
    const lists = Array.isArray(o.lists)
      ? o.lists.map((l) => `${s(obj(l).text)}\n${htmlToText(s(obj(l).content))}`).join('\n\n')
      : ''
    const pay = obj(o.salaryRange)
    return {
      title: s(o.text),
      company: src.company,
      location: [s(cat.location), s(o.workplaceType) === 'remote' ? 'Remote' : ''].filter(Boolean).join(', '),
      salary: money(pay.min, pay.max, pay.currency, pay.interval),
      employmentType: s(cat.commitment),
      description: [s(o.descriptionPlain), lists, s(o.additionalPlain)].filter(Boolean).join('\n\n'),
    }
  }

  if (src.kind === 'ashby') {
    const jobs = Array.isArray(o.jobs) ? o.jobs.map(obj) : []
    const job = jobs.find((j) => s(j.id).toLowerCase() === src.jobId)
    if (!job) return null
    return {
      title: s(job.title),
      company: src.company,
      location: [s(job.location), job.isRemote === true ? 'Remote' : ''].filter(Boolean).join(', '),
      salary: s(obj(job.compensation).compensationTierSummary),
      employmentType: s(job.employmentType).replace(/([a-z])([A-Z])/g, '$1-$2'),
      description: s(job.descriptionPlain) || htmlToText(s(job.descriptionHtml)),
    }
  }

  // workday
  const info = obj(o.jobPostingInfo)
  return {
    title: s(info.title),
    company: s(obj(o.hiringOrganization).name),
    location: s(info.location),
    employmentType: s(info.timeType),
    description: htmlToText(s(info.jobDescription)),
  }
}

/** Finds a schema.org JobPosting in a page's JSON-LD (many career sites embed one). */
export function jobPostingFromJsonLd(html: string): PostingFields | null {
  const blocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  for (const [, raw] of blocks) {
    let data: unknown
    try {
      data = JSON.parse(raw.trim())
    } catch {
      continue
    }
    const graph = obj(data)['@graph']
    const candidates = (Array.isArray(data) ? data : [data, ...(Array.isArray(graph) ? graph : [])]).map(obj)
    const job = candidates.find((c) => [c['@type']].flat().includes('JobPosting'))
    if (!job) continue

    const places = [job.jobLocation].flat().filter(Boolean).map(obj)
    const location = places
      .map((p) => {
        const a = obj(p.address)
        return [s(a.addressLocality), s(a.addressRegion), s(a.addressCountry) || s(obj(a.addressCountry).name)]
          .filter(Boolean)
          .join(', ')
      })
      .filter(Boolean)
      .join('; ')
    const remote = s(job.jobLocationType) === 'TELECOMMUTE' ? 'Remote' : ''
    const pay = obj(job.baseSalary)
    const value = obj(pay.value)
    const salary =
      typeof pay.value === 'number'
        ? money(pay.value, undefined, pay.currency, value.unitText)
        : money(value.minValue ?? value.value, value.maxValue, pay.currency, value.unitText)

    return {
      title: s(job.title),
      company: s(obj(job.hiringOrganization).name),
      location: [location, remote].filter(Boolean).join(', '),
      salary,
      employmentType: [job.employmentType].flat().filter(Boolean).map(String).join(', '),
      description: htmlToText(unescapeHtml(s(job.description))),
    }
  }
  return null
}

/** Open Graph title/description: enough to name the role when the page body is empty. */
export function metaSummary(html: string): string {
  const meta = (name: string) =>
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i'))?.[1] ??
    html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i'))?.[1] ??
    ''
  const title = meta('og:title') || html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || ''
  return htmlToText([meta('og:site_name'), title, meta('og:description') || meta('description')].join('\n'))
}

/** Lays posting fields out as labelled text: what the model reads and what gets saved as the description. */
export function postingText(f: PostingFields): string {
  const head = [
    ['Job title', f.title],
    ['Company', f.company],
    ['Location', f.location],
    ['Salary', f.salary],
    ['Employment type', f.employmentType],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
  return [head, f.description?.trim()].filter(Boolean).join('\n\n')
}
