// Preferences kept on the phone: display currency (with the last exchange
// rates, so prices convert offline), haptics, price-alert notifications and
// recent searches.
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setDisplayCurrency, type DisplayCurrency } from "../design/format";
import { setHapticsEnabled } from "../lib/haptics";
import { getFxRates } from "../lib/api";

const RATES_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_RECENT = 8;

interface SettingsState {
  currency: DisplayCurrency;
  rates: Partial<Record<DisplayCurrency, number>>;
  ratesAt: number;
  haptics: boolean;
  /** Price alerts on this phone. Null until we've asked. */
  pushAlerts: boolean | null;
  /** The push token this phone registered, so sign-out can remove it. */
  pushToken: string | null;
  recentSearches: string[];

  setCurrency: (c: DisplayCurrency) => void;
  refreshRates: () => Promise<void>;
  setHaptics: (on: boolean) => void;
  setPush: (on: boolean, token?: string | null) => void;
  addRecentSearch: (q: string) => void;
  clearRecentSearches: () => void;
}

const apply = (s: Pick<SettingsState, "currency" | "rates" | "haptics">) => {
  setDisplayCurrency(s.currency, s.rates[s.currency] ?? 0);
  setHapticsEnabled(s.haptics);
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      currency: "USD",
      rates: {},
      ratesAt: 0,
      haptics: true,
      pushAlerts: null,
      pushToken: null,
      recentSearches: [],

      setCurrency(currency) {
        set({ currency });
        apply(get());
        if (currency !== "USD") get().refreshRates();
      },

      async refreshRates() {
        if (Date.now() - get().ratesAt < RATES_TTL_MS && get().rates[get().currency]) return;
        try {
          const { rates } = await getFxRates();
          set({ rates, ratesAt: Date.now() });
          apply(get());
        } catch {
          // keep the last rates
        }
      },

      setHaptics(haptics) {
        set({ haptics });
        apply(get());
      },

      setPush(on, token) {
        set({ pushAlerts: on, ...(token !== undefined ? { pushToken: token } : {}) });
      },

      addRecentSearch(q) {
        const t = q.trim();
        if (t.length < 2) return;
        const rest = get().recentSearches.filter((r) => r.toLowerCase() !== t.toLowerCase());
        set({ recentSearches: [t, ...rest].slice(0, MAX_RECENT) });
      },

      clearRecentSearches() {
        set({ recentSearches: [] });
      },
    }),
    {
      name: "cardengine-settings",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        apply(state);
        if (state.currency !== "USD") state.refreshRates();
      },
    }
  )
);
