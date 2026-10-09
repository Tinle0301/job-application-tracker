// api.ts — the operations the frontend can call (docs/API_CONTRACT.md).
// Two implementations: supabaseApi (production) and the frontend's demo API
// (localStorage). Components only ever see this interface.
import type { Application, ApplicationInput, ParsedJob, Result, Resume, Status, FitAnalysis } from '../models/types'

export interface TrackerApi {
  readonly mode: 'supabase' | 'demo'
  /** True only when the AI edge functions are deployed (VITE_ENABLE_AI=true). */
  readonly aiEnabled: boolean
  listApplications(): Promise<Result<Application[]>>
  createApplication(input: ApplicationInput): Promise<Result<Application>>
  updateApplication(id: string, input: ApplicationInput): Promise<Result<Application>>
  updateStatus(id: string, status: Status): Promise<Result<Application>>
  deleteApplication(id: string): Promise<Result<null>>
  importApplications(inputs: ApplicationInput[]): Promise<Result<Application[]>>
  getResume(): Promise<Result<Resume | null>>
  saveResume(content: string, title?: string): Promise<Result<Resume>>
  /** AI: extract structured fields from pasted posting text or a URL. */
  parseJobPosting(source: { text?: string; url?: string }): Promise<Result<ParsedJob>>
  /** AI: score the default resume against an application's job description. */
  analyzeFit(applicationId: string): Promise<Result<FitAnalysis>>
}
