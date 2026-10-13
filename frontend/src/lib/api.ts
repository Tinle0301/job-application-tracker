// api.ts — picks the TrackerApi implementation for this build.
import { createSupabaseApi } from '@backend/services/supabaseApi'
import { createDemoApi } from './demoApi'
import { supabase } from './supabase'

// AI stays off until the edge functions are deployed (docs/AI_FEATURES.md).
const aiEnabled = import.meta.env.VITE_ENABLE_AI === 'true'
// Inbox sync stays off until its edge functions and Google client are set up (docs/EMAIL_SYNC.md).
const emailSyncEnabled = import.meta.env.VITE_ENABLE_EMAIL_SYNC === 'true'

export const api = supabase ? createSupabaseApi(supabase, { aiEnabled, emailSyncEnabled }) : createDemoApi()
