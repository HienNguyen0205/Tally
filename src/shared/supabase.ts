import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Public by design, not a secret to hide: Supabase's anon key only ever grants
// what Row Level Security lets it grant. Every table and bucket this app
// touches is locked to auth.uid(), so there is nothing this string protects
// on its own - it just names which project to talk to.
const SUPABASE_URL = 'https://nkdsxtbpxvgnjghklayp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4VDM1O6_e_sFAWLHIbwfPA_9t9i6jRM';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // There is no browser URL to parse on React Native, and leaving this on
    // makes supabase-js reach for `window.location`, which does not exist here.
    detectSessionInUrl: false,
  },
});

let signingIn: Promise<string | null> | null = null;

/**
 * The one auth call this app makes. No login screen: the first time anything
 * needs to write, the install signs in as one anonymous Supabase user, and
 * that session then persists in AsyncStorage exactly like a real login would.
 * Row Level Security keys every scan row and every storage object to this id,
 * so it is what actually keeps one install's history separate from another's
 * - not the client, which nothing stops from lying about a plain column.
 *
 * Safe to call from several places at once: concurrent calls share the same
 * in-flight sign-in instead of racing to create two anonymous users.
 */
export async function ensureUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  if (data.session != null) return data.session.user.id;

  if (signingIn == null) {
    signingIn = supabase.auth
      .signInAnonymously()
      .then(({ data: signIn, error }) => {
        if (error != null) {
          console.warn('[supabase] anonymous sign-in failed', error);
          return null;
        }
        return signIn.user?.id ?? null;
      })
      .finally(() => {
        signingIn = null;
      });
  }
  return signingIn;
}
