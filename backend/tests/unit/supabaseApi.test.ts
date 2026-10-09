// Tests the Supabase TrackerApi against a tiny fake client, checking row
// mapping and that every failure comes back as { data: null, error }.
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseApi, toApplication } from '../../services/supabaseApi'
import type { ApplicationInput } from '../../models/types'

type Reply = { data: unknown; error: unknown }

/** A chainable query builder that resolves to `reply` and records calls. */
function fakeDb(replies: Record<string, Reply>, invoke?: (name: string, opts: unknown) => Promise<Reply>) {
  const calls: { table: string; op: string; args: unknown[] }[] = []
  const from = (table: string) => {
    const chain: Record<string, unknown> = {}
    for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'single', 'maybeSingle']) {
      chain[op] = (...args: unknown[]) => {
        calls.push({ table, op, args })
        return chain
      }
    }
    chain.then = (resolve: (r: Reply) => void) => resolve(replies[table] ?? { data: null, error: null })
    return chain
  }
  const db = { from, functions: { invoke: vi.fn(invoke ?? (async () => ({ data: null, error: null }))) } }
  return { db: db as unknown as SupabaseClient, calls, invoke: db.functions.invoke }
}

const row = {
  id: 'a1',
  company: 'Northwind',
  role: 'Analyst',
  location: '',
  url: '',
  status: 'interviewing',
  applied_on: '2026-10-01',
  salary: '',
  notes: '',
  job_description: 'JD',
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-03T00:00:00Z',
  status_history: [
    { status: 'interviewing', changed_at: '2026-10-03T00:00:00Z' },
    { status: 'applied', changed_at: '2026-10-01T00:00:00Z' },
  ],
  ai_analyses: [
    {
      id: 'old',
      score: 40,
      matched_skills: [],
      missing_skills: [],
      summary: 'old',
      suggestions: [],
      model: 'm',
      created_at: '2026-10-02T00:00:00Z',
    },
    {
      id: 'new',
      score: 85,
      matched_skills: ['SQL'],
      missing_skills: [],
      summary: 'new',
      suggestions: [],
      model: 'm',
      created_at: '2026-10-04T00:00:00Z',
    },
  ],
}

const input: ApplicationInput = {
  company: '  Northwind ',
  role: 'Analyst',
  location: '',
  url: '',
  status: 'applied',
  appliedOn: '',
  salary: '',
  notes: '',
  jobDescription: '',
}

describe('toApplication', () => {
  it('sorts history oldest-first and picks the newest analysis', () => {
    const app = toApplication(row as never)
    expect(app.history.map((h) => h.status)).toEqual(['applied', 'interviewing'])
    expect(app.latestAnalysis?.id).toBe('new')
    expect(app.latestAnalysis?.matchedSkills).toEqual(['SQL'])
    expect(app.jobDescription).toBe('JD')
  })
})

describe('createSupabaseApi', () => {
  it('lists applications', async () => {
    const { db } = fakeDb({ applications: { data: [row], error: null } })
    const res = await createSupabaseApi(db).listApplications()
    expect(res.data?.[0].company).toBe('Northwind')
  })

  it('maps database errors to a stable code without leaking details', async () => {
    const { db } = fakeDb({
      applications: { data: null, error: { code: '42501', message: 'permission denied for table' } },
    })
    const res = await createSupabaseApi(db).listApplications()
    expect(res).toEqual({
      data: null,
      error: { code: 'LOAD_FAILED', message: 'Something went wrong. Please try again.' },
    })
  })

  it('validates before writing and trims / nulls fields in the row', async () => {
    const { db, calls } = fakeDb({ applications: { data: row, error: null } })
    const api = createSupabaseApi(db)
    expect((await api.createApplication({ ...input, role: '' })).error?.code).toBe('ROLE_REQUIRED')
    expect(calls).toHaveLength(0)
    await api.createApplication(input)
    const insert = calls.find((c) => c.op === 'insert')!
    expect(insert.args[0]).toMatchObject({ company: 'Northwind', applied_on: null, job_description: '' })
  })

  it('returns null (not an error) when there is no resume', async () => {
    const { db } = fakeDb({ resumes: { data: null, error: null } })
    expect(await createSupabaseApi(db).getResume()).toEqual({ data: null, error: null })
  })

  it('inserts the first resume as the default', async () => {
    const saved = { id: 'r1', title: 'My resume', content: 'x'.repeat(60), updated_at: 't' }
    const { db, calls } = fakeDb({ resumes: { data: null, error: null } })
    const api = createSupabaseApi(db)
    // first call (getResume) → null; then the insert resolves with the saved row
    let n = 0
    const realFrom = db.from.bind(db)
    ;(db as unknown as { from: unknown }).from = (t: string) => {
      const chain = realFrom(t) as unknown as Record<string, unknown>
      chain.then = (resolve: (r: Reply) => void) =>
        resolve(n++ === 0 ? { data: null, error: null } : { data: saved, error: null })
      return chain
    }
    const res = await api.saveResume('x'.repeat(60))
    expect(res.data?.id).toBe('r1')
    expect(calls.find((c) => c.op === 'insert')?.args[0]).toMatchObject({ is_default: true })
  })

  it('rejects empty parse requests without calling the function', async () => {
    const { db, invoke } = fakeDb({})
    expect((await createSupabaseApi(db).parseJobPosting({ text: ' ' })).error?.code).toBe('NOTHING_TO_PARSE')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('unwraps edge function { data } and { error } bodies', async () => {
    const { db } = fakeDb({}, async () => ({ data: { data: { score: 90 }, error: null }, error: null }))
    expect((await createSupabaseApi(db).analyzeFit('a1')).data).toEqual({ score: 90 })

    const httpError = {
      context: new Response(
        JSON.stringify({ data: null, error: { code: 'NO_RESUME', message: 'Add your resume first.' } }),
      ),
    }
    const { db: db2 } = fakeDb({}, async () => ({ data: null, error: httpError }))
    expect((await createSupabaseApi(db2).analyzeFit('a1')).error).toEqual({
      code: 'NO_RESUME',
      message: 'Add your resume first.',
    })

    const { db: db3 } = fakeDb({}, async () => ({ data: null, error: new Error('network') }))
    expect((await createSupabaseApi(db3).analyzeFit('a1')).error?.code).toBe('AI_REQUEST_FAILED')
  })
})
