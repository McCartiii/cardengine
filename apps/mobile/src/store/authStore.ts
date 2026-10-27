import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { signInWithProvider as providerSignIn, type SignInProvider } from "../lib/oauth";
import { setAuthToken } from "../lib/api";
import { forgetPushToken } from "../lib/push";

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  initialized: boolean;
  /** Email waiting for OTP verification */
  pendingEmail: string | null;
  /** Browsing without an account; cleared on sign-in or sign-out. */
  guest: boolean;

  /**
   * Subscribe to auth state changes and restore persisted session.
   * Call once in the root layout. Returns an unsubscribe fn.
   */
  initialize: () => () => void;

  /** Step 1: Send a one-time password to the given email. */
  signInWithOtp: (email: string) => Promise<void>;

  /** Step 2: Verify the 6-digit OTP and sign in. */
  verifyOtp: (email: string, token: string) => Promise<void>;

  /** For accounts that set a password (e.g. on the web app). */
  signInWithPassword: (email: string, password: string) => Promise<void>;

  /** Apple, Google or Discord. Resolves false if the user backed out. */
  signInWithProvider: (provider: SignInProvider) => Promise<boolean>;

  signOut: () => Promise<void>;

  continueAsGuest: () => void;
}

const GUEST_KEY = "cardengine-guest";

/** Every sign-in method ends here: store the session and leave guest mode. */
function signedIn(sess: Session | null) {
  useAuthStore.setState({ session: sess, user: sess?.user ?? null, pendingEmail: null, guest: false });
  AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
  setAuthToken(sess?.access_token ?? null);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  loading: true,
  initialized: false,
  pendingEmail: null,
  guest: false,

  initialize() {
    // Restore existing session from AsyncStorage
    // A guest stays a guest across launches instead of meeting sign-in every time.
    Promise.all([supabase.auth.getSession(), AsyncStorage.getItem(GUEST_KEY).catch(() => null)])
      .then(([{ data }, guest]) => {
        const sess = data?.session ?? null;
        set({ session: sess, user: sess?.user ?? null, loading: false, initialized: true, guest: !sess && guest === "1" });
        setAuthToken(sess?.access_token ?? null);
      })
      .catch(() => {
        set({ loading: false, initialized: true });
        setAuthToken(null);
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
    signedIn(data.session);
  },

  async signInWithPassword(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    signedIn(data.session);
  },

  async signInWithProvider(provider: SignInProvider) {
    const sess = await providerSignIn(provider);
    if (!sess) return false;
    signedIn(sess);
    return true;
  },

  async signOut() {
    // This phone shouldn't get the old account's alerts.
    await forgetPushToken();
    await supabase.auth.signOut();
    set({ session: null, user: null, guest: false });
    AsyncStorage.removeItem(GUEST_KEY).catch(() => {});
    setAuthToken(null);
  },

  continueAsGuest() {
    set({ guest: true });
    AsyncStorage.setItem(GUEST_KEY, "1").catch(() => {});
  },
}));
