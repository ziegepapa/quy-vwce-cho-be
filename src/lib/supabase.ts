import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon && url.startsWith("http"));

/** Single shared client. Null when env missing (local without secrets). */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anon!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        // AuthProvider registers the recovery-event subscriber before calling
        // initialize(), so a password-recovery callback cannot emit before the
        // UI has a listener. This remains the standard Supabase client flow.
        skipAutoInitialize: true,
        storage: typeof window !== "undefined" ? window.localStorage : undefined,
      },
    })
  : null;
