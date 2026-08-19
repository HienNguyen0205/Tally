import { createClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@env';

import { asyncStorage } from './storage';

// Public by design, not a secret to hide: Supabase's anon key only ever grants
// what Row Level Security lets it grant. Every table and bucket this app
// touches is locked to auth.uid(), so there is nothing this string protects
// on its own - it just names which project to talk to. Still kept out of the
// repo in .env (see .env.example) so it isn't hardcoded in source.

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // gotrue calls this through the async getItem/setItem/removeItem shape
    // regardless of what actually backs it - asyncStorage wraps MMKV's
    // synchronous calls to satisfy that, see shared/storage.ts.
    storage: asyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser URL to parse on React Native, and leaving this on
    // makes supabase-js reach for `window.location`, which does not exist here.
    detectSessionInUrl: false,
  },
});

/**
 * The id of whoever is signed in, or null.
 *
 * No anonymous fallback here on purpose: AuthScreen gates the whole app on a
 * real session (see App.tsx), so by the time anything in cloudSync.ts calls
 * this, a session is expected to already exist. This still returns null
 * rather than assuming that - a session can expire mid-use - and every
 * cloudSync function already no-ops on null rather than crashing.
 */
export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
