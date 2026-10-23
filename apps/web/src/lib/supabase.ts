import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./supabase/config";

// Guard: @supabase/supabase-js throws at module load time when supabaseUrl is "".
// Use a placeholder fallback so `next build` prerendering doesn't fail when the
// env vars aren't set (e.g. in CI). Auth will fail at runtime if they're absent.
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
