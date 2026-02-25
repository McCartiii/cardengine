import { createClient } from "@supabase/supabase-js";

// Guard: @supabase/supabase-js throws at module load time when supabaseUrl is "".
// Use a placeholder fallback so `next build` prerendering doesn't fail when the
// env vars aren't set (e.g. in CI). Auth will fail at runtime if they're absent.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
