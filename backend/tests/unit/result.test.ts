import { describe, expect, it } from 'vitest'
import { fromDbError, toServiceError } from '../../services/result'

describe('fromDbError', () => {
  it('splits CODE: message from database exceptions', () => {
    expect(fromDbError({ message: 'RATE_LIMITED: Slow down.' })).toEqual({
      code: 'RATE_LIMITED',
      message: 'Slow down.',
    })
  })

  it('ignores ordinary database errors', () => {
    expect(fromDbError({ message: 'new row violates row-level security policy' })).toBeNull()
    expect(toServiceError({ code: '42501', message: 'permission denied' }, 'SAVE_FAILED')).toEqual({
      code: 'SAVE_FAILED',
      message: 'Something went wrong. Please try again.',
    })
  })
})
