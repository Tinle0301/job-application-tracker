// api.ts — the operations the frontend can call (docs/API_CONTRACT.md).
// Two implementations: supabaseApi (production) and the frontend's demo API
// (localStorage). Components only ever see this interface.
import type {
  Application,
  ApplicationInput,
  ParsedJob,
  Result,
  Resume,
  Status,
  FitAnalysis,
  Usage,
  EmailApplication,
  EmailConnection,
  EmailScanResult,
  EmailUpdate,
} from '../models/types'

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
  /** Usage against the per-user limits (docs/LIMITS.md). */
  getUsage(): Promise<Result<Usage>>
  getResume(): Promise<Result<Resume | null>>
  saveResume(content: string, title?: string): Promise<Result<Resume>>
  /** AI: extract structured fields from pasted posting text or a URL. */
  parseJobPosting(source: { text?: string; url?: string }): Promise<Result<ParsedJob>>
  /** AI: score the default resume against an application's job description. */
  analyzeFit(applicationId: string): Promise<Result<FitAnalysis>>

  /** True only when the email edge functions are deployed (VITE_ENABLE_EMAIL_SYNC=true). */
  readonly emailSyncEnabled: boolean
  /** The connected inbox, or null when none is connected. */
  getEmailConnection(): Promise<Result<EmailConnection | null>>
  /** Google's consent page for read-only Gmail access; the app navigates there. */
  startEmailConnect(): Promise<Result<{ url: string }>>
  disconnectEmail(): Promise<Result<null>>
  /** Reads new job emails: adds applications from confirmations and updates statuses. */
  scanEmail(): Promise<Result<EmailScanResult>>
  /** Recent email updates, newest first. */
  listEmailUpdates(): Promise<Result<EmailUpdate[]>>
  /** Accepts a suggestion (or re-applies an undone update). */
  applyEmailUpdate(id: string): Promise<Result<null>>
  undoEmailUpdate(id: string): Promise<Result<null>>
  dismissEmailUpdate(id: string): Promise<Result<null>>
  /** Applications added from confirmation emails and suggestions to add, newest first. */
  listEmailApplications(): Promise<Result<EmailApplication[]>>
  /** Adds a suggested application, optionally with a corrected company and role. */
  addEmailApplication(id: string, fix?: { company?: string; role?: string }): Promise<Result<null>>
  /** Deletes an application an email added (only while it is still at applied). */
  undoEmailApplication(id: string): Promise<Result<null>>
  dismissEmailApplication(id: string): Promise<Result<null>>
}
