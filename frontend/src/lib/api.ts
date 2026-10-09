// api.ts — picks the TrackerApi implementation for this build.
import { createSupabaseApi } from '@backend/services/supabaseApi'
import { createDemoApi } from './demoApi'
import { supabase } from './supabase'

// AI stays off until the edge functions are deployed (docs/AI_FEATURES.md).
const aiEnabled = import.meta.env.VITE_ENABLE_AI === 'true'

export const api = supabase ? createSupabaseApi(supabase, { aiEnabled }) : createDemoApi()
