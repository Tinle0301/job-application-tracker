import type { Application, ApplicationInput, Status } from '../types'

/**
 * Storage-agnostic data access layer. The UI only talks to this interface,
 * so the app runs against Supabase in production and localStorage in demo mode.
 */
export interface ApplicationRepository {
  readonly kind: 'supabase' | 'local'
  list(): Promise<Application[]>
  create(input: ApplicationInput): Promise<Application>
  update(id: string, input: ApplicationInput): Promise<Application>
  updateStatus(id: string, status: Status): Promise<Application>
  remove(id: string): Promise<void>
  importMany(inputs: ApplicationInput[]): Promise<Application[]>
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Appends a history entry only when the status actually changes. */
export function withStatus(app: Application, status: Status, at = nowIso()): Application {
  if (app.status === status) return app
  return {
    ...app,
    status,
    history: [...app.history, { status, changedAt: at }],
    updatedAt: at,
  }
}
