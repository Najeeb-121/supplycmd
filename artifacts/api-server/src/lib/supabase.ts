import { createClient } from "@supabase/supabase-js";

function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabasePublishableKey) {
    return null;
  }

  return createClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function verifySupabaseAccessToken(accessToken: string) {
  const supabase = getSupabaseClient();

  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}