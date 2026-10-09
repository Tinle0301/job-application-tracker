// api.ts — picks the TrackerApi implementation for this build.
import { createSupabaseApi } from '@backend/services/supabaseApi'
import { createDemoApi } from './demoApi'
import { supabase } from './supabase'

export const api = supabase ? createSupabaseApi(supabase) : createDemoApi()
