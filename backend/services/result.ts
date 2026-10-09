// result.ts — helpers for the { data, error } contract.
import type { Result, ServiceError } from '../models/types'

export const ok = <T>(data: T): Result<T> => ({ data, error: null })

export const fail = <T = never>(code: string, message: string): Result<T> => ({
  data: null,
  error: { code, message },
})

/** Converts anything thrown into a safe, user-facing ServiceError. */
export function toServiceError(e: unknown, fallbackCode = 'UNEXPECTED'): ServiceError {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) {
    const err = e as { code: unknown; message: unknown }
    if (typeof err.code === 'string' && /^[A-Z_]+$/.test(err.code)) {
      return { code: err.code, message: String(err.message) }
    }
  }
  return { code: fallbackCode, message: 'Something went wrong. Please try again.' }
}
