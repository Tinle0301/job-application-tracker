import type { SupabaseClient } from '@supabase/supabase-js'
import type { Application, ApplicationInput, Status, StatusChange } from '../types'
import type { ApplicationRepository } from './repository'

interface Row {
  id: string
  company: string
  role: string
  location: string
  url: string
  status: Status
  applied_on: string | null
  salary: string
  notes: string
  created_at: string
  updated_at: string
  status_history: { status: Status; changed_at: string }[]
}

const SELECT = '*, status_history(status, changed_at)'

function toApp(row: Row): Application {
  const history: StatusChange[] = (row.status_history ?? [])
    .map((h) => ({ status: h.status, changedAt: h.changed_at }))
    .sort((a, b) => a.changedAt.localeCompare(b.changedAt))
  return {
    id: row.id,
    company: row.company,
    role: row.role,
    location: row.location,
    url: row.url,
    status: row.status,
    appliedOn: row.applied_on,
    salary: row.salary,
    notes: row.notes,
    history,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toRow(input: ApplicationInput) {
  return {
    company: input.company,
    role: input.role,
    location: input.location,
    url: input.url,
    status: input.status,
    applied_on: input.appliedOn || null,
    salary: input.salary,
    notes: input.notes,
  }
}

/**
 * Production repository. Row-level security scopes every query to the signed-in
 * user, and a database trigger records status_history whenever status changes.
 */
export class SupabaseRepository implements ApplicationRepository {
  readonly kind = 'supabase' as const
  private readonly db: SupabaseClient
  constructor(db: SupabaseClient) {
    this.db = db
  }

  async list(): Promise<Application[]> {
    const { data, error } = await this.db.from('applications').select(SELECT)
    if (error) throw error
    return (data as Row[]).map(toApp)
  }

  async create(input: ApplicationInput): Promise<Application> {
    const { data, error } = await this.db.from('applications').insert(toRow(input)).select(SELECT).single()
    if (error) throw error
    return toApp(data as Row)
  }

  async update(id: string, input: ApplicationInput): Promise<Application> {
    const { data, error } = await this.db.from('applications').update(toRow(input)).eq('id', id).select(SELECT).single()
    if (error) throw error
    return toApp(data as Row)
  }

  async updateStatus(id: string, status: Status): Promise<Application> {
    const { data, error } = await this.db.from('applications').update({ status }).eq('id', id).select(SELECT).single()
    if (error) throw error
    return toApp(data as Row)
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.db.from('applications').delete().eq('id', id)
    if (error) throw error
  }

  async importMany(inputs: ApplicationInput[]): Promise<Application[]> {
    const { data, error } = await this.db.from('applications').insert(inputs.map(toRow)).select(SELECT)
    if (error) throw error
    return (data as Row[]).map(toApp)
  }
}
