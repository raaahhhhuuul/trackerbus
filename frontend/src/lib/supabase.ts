import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    // Our app manages its own session (pulseride.session.v1 in localStorage).
    // Disabling Supabase's own session persistence prevents the Supabase SDK
    // from auto-restoring a previous user session on every page load, which
    // was causing "still logged in on other devices/sessions" behaviour.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
