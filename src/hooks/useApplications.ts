import { useCallback, useEffect, useState } from 'react'
import type { Application, ApplicationInput, Status } from '../types'
import type { ApplicationRepository } from '../lib/repository'

export function useApplications(repo: ApplicationRepository) {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    try {
      setError(null)
      return await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return undefined
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    repo
      .list()
      .then((list) => {
        if (!cancelled) setApps(list)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [repo])

  const replace = (next: Application) => setApps((prev) => prev.map((a) => (a.id === next.id ? next : a)))

  return {
    apps,
    loading,
    error,
    create: (input: ApplicationInput) =>
      run(async () => {
        const created = await repo.create(input)
        setApps((prev) => [...prev, created])
      }),
    update: (id: string, input: ApplicationInput) => run(async () => replace(await repo.update(id, input))),
    updateStatus: (id: string, status: Status) => run(async () => replace(await repo.updateStatus(id, status))),
    remove: (id: string) =>
      run(async () => {
        await repo.remove(id)
        setApps((prev) => prev.filter((a) => a.id !== id))
      }),
    importMany: (inputs: ApplicationInput[]) =>
      run(async () => {
        const created = await repo.importMany(inputs)
        setApps((prev) => [...prev, ...created])
      }),
  }
}
