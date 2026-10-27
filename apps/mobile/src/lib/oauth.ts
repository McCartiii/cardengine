import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseAnonKey, supabaseConfigured, supabaseUrl } from "./supabase";

export type SignInProvider = "apple" | "google" | "discord";

const ORDER: SignInProvider[] = ["apple", "google", "discord"];

/**
 * Sign-in providers switched on for this Supabase project (Authentication → Providers).
 * Asking Supabase means a provider shows up once it's configured, with no app update.
 */
export async function enabledProviders(): Promise<SignInProvider[]> {
  if (!supabaseConfigured) return [];
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, { headers: { apikey: supabaseAnonKey } });
    if (!res.ok) return [];
    const { external } = (await res.json()) as { external?: Partial<Record<SignInProvider, boolean>> };
    return ORDER.filter((p) => external?.[p]);
  } catch {
    return [];
  }
}

/** Where the provider sends the user back: cardengine://auth/callback, or exp://… in Expo Go. */
export const authRedirectUrl = () => Linking.createURL("auth/callback");

/**
 * Signs in with a provider. Returns null if the user backed out.
 * Apple uses the native sheet on iPhone; everything else opens the provider in a browser sheet.
 */
export async function signInWithProvider(provider: SignInProvider): Promise<Session | null> {
  if (provider === "apple" && Platform.OS === "ios" && (await AppleAuthentication.isAvailableAsync())) {
    return signInWithAppleNative();
  }
  return signInWithBrowser(provider);
}

async function signInWithBrowser(provider: SignInProvider): Promise<Session | null> {
  const redirectTo = authRedirectUrl();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== "success") return null;

  const { queryParams } = Linking.parse(result.url);
  const description = queryParams?.error_description ?? queryParams?.error;
  if (description) throw new Error(String(description));
  const code = queryParams?.code;
  if (typeof code !== "string") throw new Error("Sign-in didn't finish. Try again.");

  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) throw exchanged.error;
  return exchanged.data.session;
}

async function signInWithAppleNative(): Promise<Session | null> {
  // Apple signs a hash of the nonce; Supabase checks it against the raw value.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw e;
  }
  if (!credential.identityToken) throw new Error("Apple didn't return a sign-in token. Try again.");

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "apple",
    token: credential.identityToken,
    nonce: rawNonce,
  });
  if (error) throw error;

  // Apple only shares the name on the very first sign-in, so keep it.
  const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
  if (name) await supabase.auth.updateUser({ data: { full_name: name } }).catch(() => {});

  return data.session;
}
