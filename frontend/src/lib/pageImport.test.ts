import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Application } from '@backend/models/types'
import { bookmarkletHref, findApplicationForPage, readPageImport } from './pageImport'

const app = (id: string, url: string) => ({ id, url }) as Application

describe('readPageImport', () => {
  it('reads the page the bookmark sent', () => {
    const hash = '#jd=' + encodeURIComponent(JSON.stringify({ u: 'https://jobs.example.com/1', t: ' About the role ' }))
    expect(readPageImport(hash)).toEqual({ url: 'https://jobs.example.com/1', text: 'About the role' })
  })

  it.each(['', '#access_token=x', '#jd=%E0', '#jd=' + encodeURIComponent('{"u":"javascript:x","t":"a"}')])(
    'ignores %s',
    (hash) => expect(readPageImport(hash)).toBeNull(),
  )
})

describe('findApplicationForPage', () => {
  const apps = [
    app('a', 'https://boards.greenhouse.io/acme/jobs/1'),
    app('ibm', 'https://careers.ibm.com/en_US/careers/JobDetail/Software-Developer-Intern-2027/128497'),
  ]

  it('matches the same link, ignoring query, fragment, case and a trailing slash', () => {
    expect(findApplicationForPage(apps, 'https://boards.greenhouse.io/acme/jobs/1/?src=x#top')?.id).toBe('a')
  })

  it('matches the same site and job number', () => {
    expect(findApplicationForPage(apps, 'https://careers.ibm.com/en_GB/careers/JobDetail/128497')?.id).toBe('ibm')
  })

  it('finds nothing for another site', () => {
    expect(findApplicationForPage(apps, 'https://example.com/jobs/128497')).toBeUndefined()
  })
})

describe('bookmarkletHref', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens the tracker with the page link and text', () => {
    Object.defineProperty(HTMLElement.prototype, 'innerText', {
      configurable: true,
      get() {
        return this.textContent
      },
    })
    document.body.innerHTML = `<nav>Menu</nav><main>${'Build software. '.repeat(20)}</main>`
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    new Function(bookmarkletHref('https://tracker.example').slice('javascript:'.length))()
    const target = open.mock.calls[0][0] as string
    expect(target.startsWith('https://tracker.example/#jd=')).toBe(true)
    const sent = readPageImport(target.slice('https://tracker.example/'.length))
    expect(sent?.url).toBe(window.location.href)
    expect(sent?.text).toBe('Build software. '.repeat(20).trim())
  })
})
