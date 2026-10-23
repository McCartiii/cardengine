import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { CARD_ASPECT, color, radius, space } from "@/design/tokens";
import { font } from "@/design/fonts";
import { useAuthStore } from "@/store/authStore";
import { Button, CardArt, Floaty, FoilSweep, HoloRing, Screen, Text } from "@/ui";

const CODE_LENGTH = 6;

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithOtp, verifyOtp, continueAsGuest, pendingEmail } = useAuthStore();
  const [email, setEmail] = useState(pendingEmail ?? "");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">(pendingEmail ? "code" : "email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/(tabs)");
    } catch {
      setError("That code didn't work. Check it or request a new one.");
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.page}>
          <CardFan />

          <Animated.View entering={FadeInDown.duration(400)} style={styles.copy}>
            <Text variant="display">
              {step === "email" ? (
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
                : `Enter the ${CODE_LENGTH}-digit code we sent to ${normalizedEmail}.`}
            </Text>
          </Animated.View>

          <View style={styles.form}>
            {step === "email" ? (
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
                returnKeyType="send"
                onSubmitEditing={sendCode}
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

            {step === "email" && (
              <Button
                label="Continue without an account"
                variant="ghost"
                onPress={() => {
                  continueAsGuest();
                  router.replace("/(tabs)");
                }}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
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
  page: { flex: 1, paddingHorizontal: space.xxl, justifyContent: "flex-end", paddingBottom: space.xxl },
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
});
