import { describe, expect, it, vi } from 'vitest'
import { PageReaderError, readRenderedPage } from '../../../supabase/functions/_shared/posting.ts'

const url = 'https://careers.ibm.com/en_US/careers/JobDetail/Software-Developer-Intern-2027/128497'

describe('readRenderedPage', () => {
  it("asks the page reader for the page's text", async () => {
    const jd = 'Software Developer Intern\n\n\n\nBuild cloud tools. '.repeat(10)
    const fetchImpl = vi.fn().mockResolvedValue(new Response(jd, { status: 200 }))
    const text = await readRenderedPage(url, fetchImpl)
    expect(fetchImpl.mock.calls[0][0]).toBe(`https://r.jina.ai/${url}`)
    expect(text).toBe(jd.replace(/\n{3,}/g, '\n\n').trim())
  })

  it('returns nothing for a page without enough text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('Sign in', { status: 200 }))
    expect(await readRenderedPage(url, fetchImpl)).toBe('')
  })

  it('throws PageReaderError when the reader is busy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 429 }))
    await expect(readRenderedPage(url, fetchImpl)).rejects.toBeInstanceOf(PageReaderError)
  })

  it('never sends a private address to the reader', async () => {
    const fetchImpl = vi.fn()
    expect(await readRenderedPage('http://169.254.169.254/latest', fetchImpl)).toBe('')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
