import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { setAuthToken } from "../lib/api";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  /** Email waiting for OTP verification */
  pendingEmail: string | null;

  /**
   * Subscribe to auth state changes and restore persisted session.
   * Call once in the root layout. Returns an unsubscribe fn.
   */
  initialize: () => () => void;

  /** Step 1: Send a one-time password to the given email. */
  signInWithOtp: (email: string) => Promise<void>;

  /** Step 2: Verify the 6-digit OTP and sign in. */
  verifyOtp: (email: string, token: string) => Promise<void>;

  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,
  pendingEmail: null,

  initialize() {
    // Restore existing session from AsyncStorage
    supabase.auth.getSession().then(({ data }) => {
      const sess = data?.session ?? null;
      set({ session: sess, user: sess?.user ?? null, loading: false, initialized: true });
      setAuthToken(sess?.access_token ?? null);
    });

    // Listen for future changes (token refresh, sign-out, etc.)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, sess) => {
      set({ session: sess, user: sess?.user ?? null });
      setAuthToken(sess?.access_token ?? null);
    });

    return () => listener.subscription.unsubscribe();
  },

  async signInWithOtp(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
    set({ pendingEmail: email });
  },

  async verifyOtp(email: string, token: string) {
    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    if (error) throw error;
    const sess = data.session;
    set({ session: sess, user: sess?.user ?? null, pendingEmail: null });
    setAuthToken(sess?.access_token ?? null);
  },

  async signOut() {
    await supabase.auth.signOut();
    set({ session: null, user: null });
    setAuthToken(null);
  },
}));
