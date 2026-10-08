import { beforeEach, describe, expect, it } from 'vitest'
import { LocalRepository } from './localRepository'
import type { ApplicationInput } from '../types'

const input: ApplicationInput = {
  company: 'Affirm',
  role: 'Analyst',
  location: 'Remote',
  url: '',
  status: 'applied',
  appliedOn: '2026-10-07',
  salary: '',
  notes: '',
}

describe('LocalRepository', () => {
  let repo: LocalRepository
  beforeEach(() => {
    localStorage.clear()
    repo = new LocalRepository(localStorage)
  })

  it('creates an application with an initial history entry', async () => {
    const created = await repo.create(input)
    expect(created.id).toBeTruthy()
    expect(created.history).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
  })

  it('records a history entry only when status changes', async () => {
    const created = await repo.create(input)
    await repo.updateStatus(created.id, 'applied')
    const moved = await repo.updateStatus(created.id, 'interviewing')
    expect(moved.history.map((h) => h.status)).toEqual(['applied', 'interviewing'])
  })

  it('persists across instances via storage', async () => {
    await repo.create(input)
    const reloaded = new LocalRepository(localStorage)
    expect(await reloaded.list()).toHaveLength(1)
  })

  it('removes an application', async () => {
    const created = await repo.create(input)
    await repo.remove(created.id)
    expect(await repo.list()).toHaveLength(0)
  })

  it('throws when updating a missing application', async () => {
    await expect(repo.updateStatus('missing', 'offer')).rejects.toThrow('not found')
  })
})
