import { useCallback, useEffect, useState } from 'react'
import type { Application, ApplicationInput, FitAnalysis, Result, Status } from '@backend/models/types'
import type { TrackerApi } from '@backend/services/api'

/** Loads applications through a TrackerApi and keeps local state in sync. */
export function useApplications(api: TrackerApi) {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api.listApplications().then((res) => {
      if (cancelled) return
      if (res.error) setError(res.error.message)
      else setApps(res.data)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [api])

  /** Runs a call, surfaces its error message, and returns whether it succeeded. */
  const run = useCallback(async <T>(call: Promise<Result<T>>, onData: (data: T) => void): Promise<boolean> => {
    const res = await call
    if (res.error) {
      setError(res.error.message)
      return false
    }
    setError(null)
    onData(res.data)
    return true
  }, [])

  const replace = (next: Application) => setApps((prev) => prev.map((a) => (a.id === next.id ? next : a)))

  return {
    apps,
    loading,
    error,
    clearError: () => setError(null),
    create: (input: ApplicationInput) =>
      run(api.createApplication(input), (created) => setApps((prev) => [...prev, created])),
    update: (id: string, input: ApplicationInput) => run(api.updateApplication(id, input), replace),
    updateStatus: (id: string, status: Status) => run(api.updateStatus(id, status), replace),
    remove: (id: string) => run(api.deleteApplication(id), () => setApps((prev) => prev.filter((a) => a.id !== id))),
    importMany: (inputs: ApplicationInput[]) =>
      run(api.importApplications(inputs), (created) => setApps((prev) => [...prev, ...created])),
    /** Stores a fresh fit analysis on its application after the AI call returns. */
    setAnalysis: (id: string, analysis: FitAnalysis) =>
      setApps((prev) => prev.map((a) => (a.id === id ? { ...a, latestAnalysis: analysis } : a))),
  }
}
