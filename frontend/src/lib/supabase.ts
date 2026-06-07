import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    // persistSession: false — our app manages its own session (pulseride.session.v1).
    // Supabase sessions are never written to localStorage so they can't auto-restore.
    persistSession: false,
    autoRefreshToken: false,
    // detectSessionInUrl must stay true so the SDK can process the PKCE code or
    // hash-based access_token that Supabase puts in the URL after email verification.
    detectSessionInUrl: true,
  },
});
