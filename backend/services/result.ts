// result.ts — helpers for the { data, error } contract.
import type { Result, ServiceError } from '../models/types'

export const ok = <T>(data: T): Result<T> => ({ data, error: null })

export const fail = <T = never>(code: string, message: string): Result<T> => ({
  data: null,
  error: { code, message },
})

/**
 * Database limit errors are raised as 'CODE: friendly message'
 * (backend/migrations/0005_usage_limits.sql). Returns null for anything else.
 */
export function fromDbError(e: unknown): ServiceError | null {
  const message = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : ''
  const m = message.match(/^([A-Z][A-Z_]{2,}): (.+)$/s)
  return m ? { code: m[1], message: m[2] } : null
}

/** Converts anything thrown into a safe, user-facing ServiceError. */
export function toServiceError(e: unknown, fallbackCode = 'UNEXPECTED'): ServiceError {
  const limit = fromDbError(e)
  if (limit) return limit
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const err = e as { code: unknown; message: unknown }
    if (typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code)) {
      return { code: err.code, message: String(err.message) }
    }
  }
  return { code: fallbackCode, message: 'Something went wrong. Please try again.' }
}
