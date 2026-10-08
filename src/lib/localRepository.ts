import type { Application, ApplicationInput, Status } from '../types'
import { type ApplicationRepository, nowIso, withStatus } from './repository'

const STORAGE_KEY = 'job-tracker:applications:v1'

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/** Demo-mode repository that persists to localStorage (or memory if unavailable). */
export class LocalRepository implements ApplicationRepository {
  readonly kind = 'local' as const
  private memory: Application[] = []
  private storage: Storage | null

  constructor(storage: Storage | null = safeLocalStorage()) {
    this.storage = storage
  }

  private read(): Application[] {
    if (!this.storage) return this.memory
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Application[]) : []
    } catch {
      return this.memory
    }
  }

  private write(apps: Application[]): void {
    this.memory = apps
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(apps))
    } catch {
      /* storage full or blocked: keep in memory */
    }
  }

  async list(): Promise<Application[]> {
    return this.read()
  }

  async create(input: ApplicationInput): Promise<Application> {
    const at = nowIso()
    const app: Application = {
      ...input,
      id: newId(),
      history: [{ status: input.status, changedAt: at }],
      createdAt: at,
      updatedAt: at,
    }
    this.write([...this.read(), app])
    return app
  }

  async update(id: string, input: ApplicationInput): Promise<Application> {
    const apps = this.read()
    const existing = apps.find((a) => a.id === id)
    if (!existing) throw new Error(`Application ${id} not found`)
    const at = nowIso()
    const next = withStatus({ ...existing, ...input, status: existing.status, updatedAt: at }, input.status, at)
    this.write(apps.map((a) => (a.id === id ? next : a)))
    return next
  }

  async updateStatus(id: string, status: Status): Promise<Application> {
    const apps = this.read()
    const existing = apps.find((a) => a.id === id)
    if (!existing) throw new Error(`Application ${id} not found`)
    const next = withStatus(existing, status)
    this.write(apps.map((a) => (a.id === id ? next : a)))
    return next
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().filter((a) => a.id !== id))
  }

  async importMany(inputs: ApplicationInput[]): Promise<Application[]> {
    const created: Application[] = []
    for (const input of inputs) created.push(await this.create(input))
    return created
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
