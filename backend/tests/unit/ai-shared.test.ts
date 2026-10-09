// Unit tests for the pure helpers the edge functions share.
import { describe, expect, it, vi } from 'vitest'
import { htmlToText, isSafePublicUrl } from '../../../supabase/functions/_shared/html.ts'
import { matchUserMessage, validateFit, validateParsedJob } from '../../../supabase/functions/_shared/prompts.ts'
import { callLlmTool, LlmError } from '../../../supabase/functions/_shared/llm.ts'
import { PARSE_TOOL } from '../../../supabase/functions/_shared/prompts.ts'

describe('htmlToText', () => {
  it('drops scripts/styles, keeps structure and decodes entities', () => {
    const html = `<html><head><title>x</title></head><body><script>alert(1)</script>
      <h1>Data&nbsp;Analyst</h1><p>Pay: $90K &amp; up</p><ul><li>SQL</li><li>Python</li></ul>&#39;ok&#x27;</body></html>`
    const text = htmlToText(html)
    expect(text).not.toContain('alert')
    expect(text).toContain('Data Analyst')
    expect(text).toContain('Pay: $90K & up')
    expect(text).toMatch(/- SQL\n- Python/)
    expect(text).toContain("'ok'")
  })

  it('truncates to maxChars', () => {
    expect(htmlToText('<p>' + 'a'.repeat(100) + '</p>', 10)).toHaveLength(10)
  })
})

describe('isSafePublicUrl', () => {
  it.each([
    ['https://boards.greenhouse.io/acme/jobs/1', true],
    ['http://jobs.example.com/x', true],
    ['ftp://example.com', false],
    ['http://localhost:3000', false],
    ['http://127.0.0.1', false],
    ['http://10.1.2.3', false],
    ['http://172.20.0.1', false],
    ['http://192.168.1.1', false],
    ['http://169.254.169.254/latest/meta-data', false],
    ['http://[::1]/', false],
    ['http://user:pass@example.com', false],
    ['http://metadata.internal', false],
    ['not a url', false],
  ])('%s → %s', (url, expected) => {
    expect(isSafePublicUrl(url)).toBe(expected)
  })
})

describe('validateParsedJob', () => {
  it('normalises and trims model output', () => {
    const out = validateParsedJob({
      company: ' Acme ',
      role: 'SWE',
      requirements: ['React', '', 3, ...Array(20).fill('x')],
      salary: null,
    })
    expect(out?.company).toBe('Acme')
    expect(out?.salary).toBe('')
    expect(out?.requirements).toHaveLength(12)
    expect(out?.requirements[0]).toBe('React')
  })

  it('rejects output with neither company nor role', () => {
    expect(validateParsedJob({ company: '', role: '' })).toBeNull()
    expect(validateParsedJob('nope')).toBeNull()
  })
})

describe('validateFit', () => {
  const good = {
    score: 81.6,
    matchedSkills: ['SQL'],
    missingSkills: [],
    summary: 'Good.',
    suggestions: Array(9).fill('s'),
  }

  it('rounds the score and caps suggestions at 5', () => {
    const out = validateFit(good)
    expect(out?.score).toBe(82)
    expect(out?.suggestions).toHaveLength(5)
  })

  it.each([{ ...good, score: 101 }, { ...good, score: -1 }, { ...good, score: '80' }, { ...good, summary: '' }, null])(
    'rejects invalid output %#',
    (bad) => expect(validateFit(bad)).toBeNull(),
  )
})

describe('matchUserMessage', () => {
  it('wraps both documents in tags and neutralises quotes in attributes', () => {
    const msg = matchUserMessage('RESUME', { company: 'A "B"', role: 'R', description: 'JD' })
    expect(msg).toContain(`<job company="A 'B'" role="R">`)
    expect(msg).toContain('<resume>\nRESUME\n</resume>')
  })
})

describe('callLlmTool', () => {
  it('forces the tool and returns its input', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'test-model',
          content: [{ type: 'tool_use', name: PARSE_TOOL.name, input: { company: 'A' } }],
        }),
      ),
    )
    const out = await callLlmTool({
      apiKey: 'k',
      system: 's',
      user: 'u',
      model: 'test-model',
      tool: PARSE_TOOL,
      fetchImpl,
    })
    expect(out).toEqual({ input: { company: 'A' }, model: 'test-model' })
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.tool_choice).toEqual({ type: 'tool', name: PARSE_TOOL.name })
    expect(fetchImpl.mock.calls[0][1].headers['x-api-key']).toBe('k')
  })

  it('throws LlmError on HTTP errors', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{}', { status: 429 }))
    await expect(
      callLlmTool({ apiKey: 'k', system: 's', user: 'u', model: 'test-model', tool: PARSE_TOOL, fetchImpl }),
    ).rejects.toBeInstanceOf(LlmError)
  })
})
