// validation.ts — input checks shared by both API implementations, so demo
// mode and Supabase reject the same bad input with the same error codes.
import type { ApplicationInput, ServiceError } from '../models/types'
import { STATUSES } from '../models/types'

export function validateApplication(input: ApplicationInput): ServiceError | null {
  if (!input.company?.trim()) return { code: 'COMPANY_REQUIRED', message: 'Company is required.' }
  if (!input.role?.trim()) return { code: 'ROLE_REQUIRED', message: 'Role is required.' }
  if (!STATUSES.includes(input.status)) return { code: 'INVALID_STATUS', message: 'Unknown status.' }
  if (input.url && !/^https?:\/\//i.test(input.url))
    return { code: 'INVALID_URL', message: 'Job URL must start with http:// or https://.' }
  if (input.appliedOn && !/^\d{4}-\d{2}-\d{2}$/.test(input.appliedOn))
    return { code: 'INVALID_DATE', message: 'Date applied must be YYYY-MM-DD.' }
  if ((input.jobDescription ?? '').length > 30000)
    return { code: 'DESCRIPTION_TOO_LONG', message: 'Job description is limited to 30,000 characters.' }
  return null
}

export function validateResume(content: string): ServiceError | null {
  const len = content.trim().length
  if (len < 50) return { code: 'RESUME_TOO_SHORT', message: 'Paste at least 50 characters of your resume.' }
  if (len > 20000) return { code: 'RESUME_TOO_LONG', message: 'Resume text is limited to 20,000 characters.' }
  return null
}
