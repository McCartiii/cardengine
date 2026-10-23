import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { CARD_ASPECT, color, radius, space } from "@/design/tokens";
import { useAuthStore } from "@/store/authStore";
import { Button, Screen, Text } from "@/ui";

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
              {step === "email" ? "Know what\nyour cards are worth" : "Check your email"}
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

/** Three fanned card silhouettes in place of a logo. */
function CardFan() {
  const cards = [
    { rotate: "-14deg", x: -54, colors: ["#3B2340", "#160E18"] as const },
    { rotate: "12deg", x: 54, colors: ["#22324A", "#0D141E"] as const },
    { rotate: "0deg", x: 0, colors: ["#5A4216", "#1B1300"] as const },
  ];
  return (
    <View style={styles.fan} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {cards.map((c, i) => (
        <LinearGradient
          key={i}
          colors={c.colors}
          style={[styles.fanCard, { transform: [{ translateX: c.x }, { rotate: c.rotate }] }, i === 2 && styles.fanCardFront]}
        >
          {i === 2 && <Ionicons name="diamond" size={28} color={color.accent} />}
        </LinearGradient>
      ))}
    </View>
  );
}

const FAN_CARD_WIDTH = 92;

const styles = StyleSheet.create({
  page: { flex: 1, paddingHorizontal: space.xxl, justifyContent: "flex-end", paddingBottom: space.xxl },
  fan: { height: FAN_CARD_WIDTH / CARD_ASPECT + space.xxxl, alignItems: "center", justifyContent: "center", marginBottom: space.xl },
  fanCard: {
    position: "absolute",
    width: FAN_CARD_WIDTH,
    aspectRatio: CARD_ASPECT,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  fanCardFront: { borderColor: "rgba(255,178,36,0.5)" },
  copy: { marginBottom: space.xxl },
  form: { gap: space.md },
  input: {
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: color.surface2,
    paddingHorizontal: space.lg,
    color: color.text,
    fontSize: 17,
    fontWeight: "500",
  },
  codeInput: { fontSize: 26, letterSpacing: 10, textAlign: "center", fontWeight: "700", fontVariant: ["tabular-nums"] },
  error: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
