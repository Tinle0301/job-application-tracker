import { describe, expect, it } from 'vitest'
import { parseImport } from './importExport'

describe('parseImport', () => {
  it('fills defaults and normalizes unknown statuses to applied', () => {
    const [row] = parseImport(JSON.stringify([{ company: 'Quora', role: 'SWE', status: 'pending' }]))
    expect(row.status).toBe('applied')
    expect(row.notes).toBe('')
  })

  it('rejects rows without company or role', () => {
    expect(() => parseImport(JSON.stringify([{ company: 'X' }]))).toThrow('Row 1')
  })

  it('rejects non-array JSON', () => {
    expect(() => parseImport('{}')).toThrow('array')
  })
})
