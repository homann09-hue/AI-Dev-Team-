import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://lutbicxvaupjmmxgtkjn.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_qXwHvaKvJR5JA1LQY0xp6Q_6Xeatyuo";

let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}

export async function getAccessToken(): Promise<string | undefined> {
  const { data } = await getSupabaseBrowserClient().auth.getSession();
  return data.session?.access_token;
}

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY };
