import { useCallback, useEffect, useState } from 'react';
import type { AuthError } from '@supabase/supabase-js';

import { supabase } from '../shared/supabase';

export interface AuthState {
  /** True until the first session check has resolved. */
  loading: boolean;
  userId: string | null;
  /** Null when nobody is signed in - the only state AuthScreen shows for. */
  email: string | null;
}

/**
 * Tracks the current Supabase session and exposes the three account actions
 * the app offers. There is no anonymous fallback: App.tsx renders AuthScreen
 * whenever `email` is null instead of DetectorScreen, so the camera is never
 * reachable without a real signed-in session.
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    userId: null,
    email: null,
  });

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // Guards a leftover anonymous session from an earlier build of this app
      // (anonymous sign-in used to be the default before this screen existed)
      // from ever satisfying the gate: is_anonymous is the authoritative
      // signal, not email - an anonymous user's email is '' from Supabase,
      // not null, so `?? null` alone would have let it slip through.
      const real = session != null && session.user.is_anonymous !== true;
      setState({
        loading: false,
        userId: real ? session.user.id : null,
        email: real ? (session.user.email ?? null) : null,
      });
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /**
   * Creates a new account. Plain `auth.signUp` - there is no anonymous
   * session to upgrade in place any more, so this mints a fresh identity the
   * same way any other Supabase app would.
   *
   * Returns 'confirm' when Supabase's project settings require clicking an
   * email link before the account is live (no session comes back yet in that
   * case), 'done' when a session was issued immediately.
   */
  const register = useCallback(
    async (
      email: string,
      password: string,
    ): Promise<{ error: AuthError | null; status?: 'confirm' | 'done' }> => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error != null) return { error };
      return { error: null, status: data.session != null ? 'done' : 'confirm' };
    },
    [],
  );

  /** Signs into an existing account. */
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  }, []);

  /** Drops the session. App.tsx reacts by swapping back to AuthScreen. */
  const signOut = useCallback(() => supabase.auth.signOut(), []);

  return { ...state, register, signIn, signOut };
}
