/**
 * Supabase client for frontend auth (OAuth only).
 * Uses the publishable anon key — safe to expose in the browser.
 * All DB operations still go through the backend service role key.
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  throw new Error('VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set in .env');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
