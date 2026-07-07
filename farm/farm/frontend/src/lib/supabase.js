import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If Supabase env vars are not set, create a no-op client that logs a warning
// instead of crashing the app. Supabase is only used for realtime features,
// so the app should still work without it (falling back to polling).
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[SUPABASE] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set. " +
    "Supabase realtime features will be disabled. " +
    "Set these in your .env file or Vercel dashboard."
  );
}

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
