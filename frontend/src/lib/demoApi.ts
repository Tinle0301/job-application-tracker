// demoApi.ts — TrackerApi backed by localStorage, used when no Supabase env
// vars are set. Same validation and error codes as production; AI calls
// return AI_UNAVAILABLE_IN_DEMO because the API key must stay server-side.
import type { Application, ApplicationInput, Resume, Status } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'
import { fail, ok } from '@backend/services/result'
import { validateApplication, validateResume } from '@backend/services/validation'

const APPS_KEY = 'job-tracker:applications:v1'
const RESUME_KEY = 'job-tracker:resume:v1'

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const nowIso = () => new Date().toISOString()

/** Appends a history entry only when the status actually changes (mirrors the DB trigger). */
export function withStatus(app: Application, status: Status, at = nowIso()): Application {
  if (app.status === status) return app
  return { ...app, status, history: [...app.history, { status, changedAt: at }], updatedAt: at }
}

/** Fills fields added after v1 so older localStorage data keeps working. */
function upgrade(a: Partial<Application>): Application {
  return { jobDescription: '', latestAnalysis: null, history: [], ...a } as Application
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

const AI_UNAVAILABLE = fail(
  'AI_UNAVAILABLE_IN_DEMO',
  'AI features need the Supabase backend (the API key stays on the server). See docs/SETUP.md.',
)

export function createDemoApi(storage: Storage | null = safeLocalStorage()): TrackerApi {
  const memory = new Map<string, string>()
  const get = (k: string) => {
    try {
      return storage ? storage.getItem(k) : (memory.get(k) ?? null)
    } catch {
      return memory.get(k) ?? null
    }
  }
  const set = (k: string, v: string) => {
    memory.set(k, v)
    try {
      storage?.setItem(k, v)
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }
  const read = (): Application[] => {
    try {
      const raw = get(APPS_KEY)
      return raw ? (JSON.parse(raw) as Partial<Application>[]).map(upgrade) : []
    } catch {
      return []
    }
  }
  const write = (apps: Application[]) => set(APPS_KEY, JSON.stringify(apps))

  const create = (input: ApplicationInput): Application => {
    const at = nowIso()
    return {
      ...input,
      company: input.company.trim(),
      role: input.role.trim(),
      jobDescription: input.jobDescription ?? '',
      id: newId(),
      history: [{ status: input.status, changedAt: at }],
      latestAnalysis: null,
      createdAt: at,
      updatedAt: at,
    }
  }

  const getResume = async () => {
    try {
      const raw = get(RESUME_KEY)
      return ok(raw ? (JSON.parse(raw) as Resume) : null)
    } catch {
      return ok(null)
    }
  }

  return {
    mode: 'demo',

    async listApplications() {
      return ok(read())
    },

    async createApplication(input) {
      const invalid = validateApplication(input)
      if (invalid) return { data: null, error: invalid }
      const app = create(input)
      write([...read(), app])
      return ok(app)
    },

    async updateApplication(id, input) {
      const invalid = validateApplication(input)
      if (invalid) return { data: null, error: invalid }
      const apps = read()
      const existing = apps.find((a) => a.id === id)
      if (!existing) return fail('APPLICATION_NOT_FOUND', 'That application no longer exists.')
      const at = nowIso()
      const next = withStatus({ ...existing, ...input, status: existing.status, updatedAt: at }, input.status, at)
      write(apps.map((a) => (a.id === id ? next : a)))
      return ok(next)
    },

    async updateStatus(id, status) {
      const apps = read()
      const existing = apps.find((a) => a.id === id)
      if (!existing) return fail('APPLICATION_NOT_FOUND', 'That application no longer exists.')
      const next = withStatus(existing, status)
      write(apps.map((a) => (a.id === id ? next : a)))
      return ok(next)
    },

    async deleteApplication(id) {
      write(read().filter((a) => a.id !== id))
      return ok(null)
    },

    async importApplications(inputs) {
      for (const [i, input] of inputs.entries()) {
        const invalid = validateApplication(input)
        if (invalid) return fail(invalid.code, `Row ${i + 1}: ${invalid.message}`)
      }
      const created = inputs.map(create)
      write([...read(), ...created])
      return ok(created)
    },

    getResume,

    async saveResume(content, title = 'My resume') {
      const invalid = validateResume(content)
      if (invalid) return { data: null, error: invalid }
      const existing = (await getResume()).data
      const resume: Resume = { id: existing?.id ?? newId(), title, content, updatedAt: nowIso() }
      set(RESUME_KEY, JSON.stringify(resume))
      return ok(resume)
    },

    async parseJobPosting() {
      return AI_UNAVAILABLE
    },

    async analyzeFit() {
      return AI_UNAVAILABLE
    },
  }
}
