import { createClient } from "@supabase/supabase-js";

// Fallback to placeholder so the static build doesn't throw at module-init time.
// Real requests only happen in the browser where env vars are injected.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder"
);
