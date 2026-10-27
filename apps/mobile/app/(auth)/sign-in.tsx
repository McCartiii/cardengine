import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { haptic } from "@/lib/haptics";
import { CARD_ASPECT, color, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { useAuthStore } from "@/store/authStore";
import { enabledProviders, type SignInProvider } from "@/lib/oauth";
import { Button, CardArt, Floaty, FoilSweep, HoloRing, Screen, Text, Touchable } from "@/ui";
import { Logo } from "@/components/brand/Logo";

const CODE_LENGTH = 6;

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithOtp, verifyOtp, signInWithPassword, signInWithProvider, continueAsGuest, pendingEmail } = useAuthStore();
  const [email, setEmail] = useState(pendingEmail ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"email" | "code" | "password">(pendingEmail ? "code" : "email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only providers switched on in Supabase get a button.
  const [providers, setProviders] = useState<SignInProvider[]>([]);
  const [providerBusy, setProviderBusy] = useState<SignInProvider | null>(null);

  useEffect(() => {
    enabledProviders().then(setProviders);
  }, []);

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);

  const sendCode = async () => {
    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signInWithOtp(normalizedEmail);
      setStep("code");
    } catch (e: unknown) {
      setError((e as Error).message || "Couldn't send the code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (code.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(normalizedEmail, code);
      haptic.success();
      router.replace("/(tabs)");
    } catch {
      setError("That code didn't work. Check it or request a new one.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  const passwordSignIn = async () => {
    if (!emailValid) {
      setError("Enter a valid email address.");
      return;
    }
    if (!password) return;
    setBusy(true);
    setError(null);
    try {
      await signInWithPassword(normalizedEmail, password);
      haptic.success();
      router.replace("/(tabs)");
    } catch {
      setError("That email and password didn't match. Try again, or get a code by email.");
    } finally {
      setBusy(false);
    }
  };

  const providerSignIn = async (provider: SignInProvider) => {
    setProviderBusy(provider);
    setError(null);
    try {
      if (await signInWithProvider(provider)) {
        haptic.success();
        router.replace("/(tabs)");
      }
    } catch (e: unknown) {
      setError((e as Error).message || "Couldn't sign in. Try again.");
    } finally {
      setProviderBusy(null);
    }
  };

  const showEmailInput = step !== "code";
  // On short phones (iPhone SE) the card fan would push the form off screen.
  const { height } = useWindowDimensions();
  const roomForFan = height >= 760;

  return (
    <Screen>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brand}>
            <Logo variant="horizontal" width={176} color={color.text} />
          </View>
          {roomForFan && <CardFan />}

          <Animated.View entering={FadeInDown.duration(400)} style={styles.copy}>
            <Text variant="display">
              {step !== "code" ? (
                <>
                  Know what your cards are <Text variant="display" color={color.accent}>worth</Text>
                </>
              ) : (
                "Check your email"
              )}
            </Text>
            <Text variant="body" color={color.textSecondary} style={{ marginTop: space.sm }}>
              {step === "email"
                ? "Scan, price and organize your collection. We'll email you a sign-in code, no password needed."
                : step === "password"
                  ? "Sign in with the email and password you set up on CardEngine."
                  : `Enter the ${CODE_LENGTH}-digit code we sent to ${normalizedEmail}.`}
            </Text>
          </Animated.View>

          <View style={styles.form}>
            {showEmailInput ? (
              <TextInput
                key="email"
                style={styles.input}
                value={email}
                onChangeText={(t) => {
                  setEmail(t);
                  setError(null);
                }}
                placeholder="you@example.com"
                placeholderTextColor={color.textTertiary}
                selectionColor={color.accent}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType={step === "password" ? "next" : "send"}
                onSubmitEditing={step === "password" ? undefined : sendCode}
                accessibilityLabel="Email address"
              />
            ) : (
              <TextInput
                key="code"
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(t) => {
                  setCode(t.replace(/\D/g, "").slice(0, CODE_LENGTH));
                  setError(null);
                }}
                placeholder={"•".repeat(CODE_LENGTH)}
                placeholderTextColor={color.textTertiary}
                selectionColor={color.accent}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                maxLength={CODE_LENGTH}
                onSubmitEditing={verify}
                accessibilityLabel="Sign-in code"
              />
            )}

            {step === "password" && (
              <TextInput
                key="password"
                style={styles.input}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  setError(null);
                }}
                placeholder="Password"
                placeholderTextColor={color.textTertiary}
                selectionColor={color.accent}
                secureTextEntry
                textContentType="password"
                autoComplete="current-password"
                autoFocus
                returnKeyType="go"
                onSubmitEditing={passwordSignIn}
                accessibilityLabel="Password"
              />
            )}

            {error && (
              <View style={styles.error} accessibilityLiveRegion="polite">
                <Ionicons name="alert-circle" size={16} color={color.negative} />
                <Text variant="callout" color={color.negative} style={{ flex: 1 }}>
                  {error}
                </Text>
              </View>
            )}

            {step === "email" ? (
              <Button label="Email me a code" size="lg" onPress={sendCode} loading={busy} disabled={!email.trim()} />
            ) : step === "password" ? (
              <Button label="Sign in" size="lg" onPress={passwordSignIn} loading={busy} disabled={!email.trim() || !password} />
            ) : (
              <>
                <Button label="Sign in" size="lg" onPress={verify} loading={busy} disabled={code.length !== CODE_LENGTH} />
                <Button
                  label="Use a different email"
                  variant="ghost"
                  onPress={() => {
                    setStep("email");
                    setCode("");
                    setError(null);
                  }}
                />
              </>
            )}

            {step !== "code" && providers.length > 0 && (
              <>
                <View style={styles.divider}>
                  <View style={styles.rule} />
                  <Text variant="caption" color={color.textTertiary}>
                    or continue with
                  </Text>
                  <View style={styles.rule} />
                </View>
                <View style={styles.providers}>
                  {providers.map((p) => (
                    <ProviderButton key={p} provider={p} busy={providerBusy === p} disabled={providerBusy != null} onPress={() => providerSignIn(p)} />
                  ))}
                </View>
              </>
            )}

            {step !== "code" && (
              <View style={styles.links}>
                <Button
                  label={step === "password" ? "Email me a code" : "Use a password"}
                  variant="ghost"
                  onPress={() => {
                    setStep(step === "password" ? "email" : "password");
                    setPassword("");
                    setError(null);
                  }}
                />
                <Button
                  label="Skip for now"
                  variant="ghost"
                  onPress={() => {
                    continueAsGuest();
                    router.replace("/(tabs)");
                  }}
                />
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const PROVIDER_STYLE: Record<SignInProvider, { label: string; bg: string; fg: string; border?: string }> = {
  apple: { label: "Continue with Apple", bg: "#000000", fg: "#FFFFFF" },
  google: { label: "Continue with Google", bg: "#FFFFFF", fg: color.text, border: color.border },
  discord: { label: "Continue with Discord", bg: "#5865F2", fg: "#FFFFFF" },
};

/** Logo-only sign-in button, styled to each provider's brand rules. */
function ProviderButton({ provider, busy, disabled, onPress }: { provider: SignInProvider; busy: boolean; disabled: boolean; onPress: () => void }) {
  const c = PROVIDER_STYLE[provider];
  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={c.label}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      pressedScale={0.96}
      style={[styles.provider, { backgroundColor: c.bg, borderColor: c.border ?? c.bg, opacity: disabled && !busy ? 0.5 : 1 }]}
    >
      {busy ? (
        <ActivityIndicator color={c.fg} />
      ) : provider === "google" ? (
        <GoogleG size={22} />
      ) : (
        <Ionicons name={provider === "apple" ? "logo-apple" : "logo-discord"} size={24} color={c.fg} />
      )}
    </Touchable>
  );
}

/** Google's four-colour "G", which its branding guidelines ask for on sign-in buttons. */
function GoogleG({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <Path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <Path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <Path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </Svg>
  );
}

/** A fanned hand of three cards; the front one is foil. */
function CardFan() {
  const cards = [
    { name: "Scan", rotate: "-15deg", x: -62, y: 14 },
    { name: "Build", rotate: "13deg", x: 62, y: 12 },
    { name: "Collect", rotate: "0deg", x: 0, y: 0, foil: true },
  ];
  return (
    <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">

      {cards.map((c) =>
        c.foil ? (
          <Floaty key={c.name} style={styles.fanCard}>
            <HoloRing radius={9} thickness={3}>
              <View style={{ borderRadius: 6, overflow: "hidden" }}>
                <CardArt uri={null} name={c.name} />
                <FoilSweep width={FAN_CARD_WIDTH} />
              </View>
            </HoloRing>
          </Floaty>
        ) : (
          <View key={c.name} style={[styles.fanCard, { transform: [{ translateX: c.x }, { translateY: c.y }, { rotate: c.rotate }] }]}>
            <CardArt uri={null} name={c.name} />
          </View>
        )
      )}
    </View>
  );
}

const FAN_CARD_WIDTH = 104;

const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: space.xxl, justifyContent: "flex-end", paddingBottom: space.xxl },
  // Auto top margin keeps the logo at the top while the rest sits at the bottom.
  brand: { marginBottom: "auto", paddingTop: space.lg },
  fan: { height: FAN_CARD_WIDTH / CARD_ASPECT + space.xxxl, alignItems: "center", justifyContent: "center", marginBottom: space.xl },
  fanCard: {
    position: "absolute",
    width: FAN_CARD_WIDTH,
    shadowColor: "#2A1E6E",
    shadowOpacity: 0.7,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  glow: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
  copy: { marginBottom: space.xxl },
  form: { gap: space.md },
  input: {
    height: 54,
    borderRadius: radius.pill,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.lg,
    color: color.text,
    fontSize: 16,
    fontFamily: font.medium,
  },
  codeInput: { fontSize: 26, letterSpacing: 10, textAlign: "center", fontFamily: font.bold, fontVariant: ["tabular-nums"] },
  error: { flexDirection: "row", alignItems: "center", gap: space.sm },
  divider: { flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xs },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: color.border },
  providers: { flexDirection: "row", gap: space.md },
  provider: { flex: 1, height: 54, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  links: { flexDirection: "row", justifyContent: "space-between" },
});
