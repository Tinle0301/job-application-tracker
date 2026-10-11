// Unit tests for reading job postings from their links (parse-job).
import { describe, expect, it } from 'vitest'
import {
  jobPostingFromJsonLd,
  knownSource,
  metaSummary,
  postingText,
  readKnownSource,
} from '../../../supabase/functions/_shared/jobSources.ts'

const UUID = '0b2c6a5e-1f4d-4c1a-9d1e-7a3c2b1f0e9d'

describe('knownSource', () => {
  it.each([
    ['https://boards.greenhouse.io/acme/jobs/4012345', 'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345'],
    [
      'https://job-boards.greenhouse.io/acme/jobs/4012345?gh_src=x',
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345',
    ],
    [
      'https://boards.greenhouse.io/embed/job_app?for=acme&token=4012345',
      'https://boards-api.greenhouse.io/v1/boards/acme/jobs/4012345',
    ],
    [`https://jobs.lever.co/acme/${UUID}/apply`, `https://api.lever.co/v0/postings/acme/${UUID}`],
    [`https://jobs.eu.lever.co/acme/${UUID}`, `https://api.eu.lever.co/v0/postings/acme/${UUID}`],
    [`https://jobs.ashbyhq.com/acme/${UUID}`, 'https://api.ashbyhq.com/posting-api/job-board/acme'],
    [
      'https://acme.wd5.myworkdayjobs.com/en-US/Careers/job/Austin-TX/Data-Analyst_R123',
      'https://acme.wd5.myworkdayjobs.com/wday/cxs/acme/Careers/job/Austin-TX/Data-Analyst_R123',
    ],
    [
      'https://www.linkedin.com/jobs/view/data-analyst-at-acme-3912345678/',
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/3912345678',
    ],
    [
      'https://www.linkedin.com/jobs/collections/recommended/?currentJobId=3912345678',
      'https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/3912345678',
    ],
  ])('%s', (url, expected) => {
    expect(knownSource(url)?.fetchUrl.split('?')[0]).toBe(expected)
  })

  it.each([
    'https://example.com/careers/123',
    'https://boards.greenhouse.io/acme',
    'https://jobs.lever.co/acme',
    'https://www.linkedin.com/feed/',
    'not a url',
  ])('ignores %s', (url) => {
    expect(knownSource(url)).toBeNull()
  })
})

describe('readKnownSource', () => {
  it('reads Greenhouse, decoding its escaped HTML and pay range', () => {
    const src = knownSource('https://boards.greenhouse.io/acme/jobs/1')!
    const out = readKnownSource(
      src,
      JSON.stringify({
        title: 'Data Analyst',
        company_name: 'Acme',
        location: { name: 'Austin, TX' },
        content: '&lt;p&gt;Build dashboards &amp;amp; reports&lt;/p&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;',
        pay_input_ranges: [{ min_cents: 9000000, max_cents: 11000000, currency_type: 'USD' }],
      }),
    )
    expect(out).toMatchObject({ title: 'Data Analyst', company: 'Acme', location: 'Austin, TX' })
    expect(out?.salary).toBe('USD 90,000 - 110,000')
    expect(out?.description).toBe('Build dashboards & reports\n- SQL')
  })

  it('reads Lever, naming the company from the link', () => {
    const src = knownSource(`https://jobs.lever.co/north-wind/${UUID}`)!
    const out = readKnownSource(
      src,
      JSON.stringify({
        text: 'Backend Engineer',
        categories: { location: 'Berlin', commitment: 'Full-time' },
        workplaceType: 'remote',
        descriptionPlain: 'About the role.',
        lists: [{ text: 'Requirements', content: '<li>Go</li><li>Postgres</li>' }],
        salaryRange: { min: 80000, max: 95000, currency: 'EUR', interval: 'per-year-salary' },
      }),
    )
    expect(out).toMatchObject({
      title: 'Backend Engineer',
      company: 'North Wind',
      location: 'Berlin, Remote',
      employmentType: 'Full-time',
      salary: 'EUR 80,000 - 95,000 per year',
    })
    expect(out?.description).toContain('Requirements\n- Go\n- Postgres')
  })

  it('picks the right job from an Ashby board', () => {
    const src = knownSource(`https://jobs.ashbyhq.com/acme/${UUID.toUpperCase()}`)!
    const body = JSON.stringify({
      jobs: [
        { id: 'other', title: 'Nope' },
        {
          id: UUID,
          title: 'Product Designer',
          location: 'New York',
          isRemote: true,
          employmentType: 'FullTime',
          descriptionPlain: 'Design things.',
          compensation: { compensationTierSummary: '$120K – $150K' },
        },
      ],
    })
    expect(readKnownSource(src, body)).toMatchObject({
      title: 'Product Designer',
      company: 'Acme',
      location: 'New York, Remote',
      employmentType: 'Full-Time',
      salary: '$120K – $150K',
    })
    expect(readKnownSource(src, JSON.stringify({ jobs: [] }))).toBeNull()
  })

  it('reads Workday', () => {
    const src = knownSource('https://acme.wd1.myworkdayjobs.com/Careers/job/Remote/Analyst_R1')!
    const out = readKnownSource(
      src,
      JSON.stringify({
        jobPostingInfo: { title: 'Analyst', location: 'Remote', timeType: 'Full time', jobDescription: '<p>Hi</p>' },
        hiringOrganization: { name: 'Acme Corp' },
      }),
    )
    expect(out).toMatchObject({
      title: 'Analyst',
      company: 'Acme Corp',
      employmentType: 'Full time',
      description: 'Hi',
    })
  })

  it('returns null for a response that is not JSON', () => {
    expect(readKnownSource(knownSource('https://boards.greenhouse.io/a/jobs/1')!, '<html>')).toBeNull()
  })
})

describe('jobPostingFromJsonLd', () => {
  it('finds a JobPosting, including inside @graph', () => {
    const ld = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage' },
        {
          '@type': 'JobPosting',
          title: 'QA Engineer',
          hiringOrganization: { '@type': 'Organization', name: 'Contoso' },
          jobLocation: { address: { addressLocality: 'Seattle', addressRegion: 'WA', addressCountry: 'US' } },
          employmentType: ['FULL_TIME'],
          baseSalary: { currency: 'USD', value: { minValue: 100000, maxValue: 130000, unitText: 'YEAR' } },
          description: '&lt;p&gt;Test all the things&lt;/p&gt;',
        },
      ],
    }
    const html = `<html><script type="application/ld+json">${JSON.stringify(ld)}</script></html>`
    expect(jobPostingFromJsonLd(html)).toEqual({
      title: 'QA Engineer',
      company: 'Contoso',
      location: 'Seattle, WA, US',
      salary: 'USD 100,000 - 130,000 per year',
      employmentType: 'FULL_TIME',
      description: 'Test all the things',
    })
  })

  it('skips broken or unrelated JSON-LD', () => {
    const html =
      '<script type="application/ld+json">{oops</script><script type="application/ld+json">{"@type":"Organization"}</script>'
    expect(jobPostingFromJsonLd(html)).toBeNull()
  })
})

describe('metaSummary and postingText', () => {
  it('uses Open Graph tags when the page body is empty', () => {
    const html =
      '<head><meta property="og:site_name" content="Acme Careers"><meta property="og:title" content="Data Analyst"><meta name="description" content="Join our data team."></head><body><div id="root"></div></body>'
    expect(metaSummary(html)).toBe('Acme Careers\nData Analyst\nJoin our data team.')
  })

  it('labels the fields above the description and skips empty ones', () => {
    expect(postingText({ title: 'SWE', company: 'Acme', salary: '', description: 'Body' })).toBe(
      'Job title: SWE\nCompany: Acme\n\nBody',
    )
  })
})
