import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withDelay,
  withSpring,
  Easing,
  FadeIn,
  SlideInUp,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";
import { Logo } from "../../src/components/brand/Logo";

const C = {
  bg: "#111111",
  surface: "#161B27",
  border: "#1E2535",
  borderStrong: "#2D4059",
  textPrimary: "#E2E8F0",
  textMuted: "#334155",
  textDim: "#475569",
  accent: "#0D9488",
  accentLight: "#14B8A6",
} as const;

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithOtp, verifyOtp, pendingEmail } = useAuthStore();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<TextInput>(null);

  // Shimmer
  const shimmerX = useSharedValue(-1);
  useEffect(() => {
    shimmerX.value = withRepeat(
      withTiming(2, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
      -1,
      false
    );
  }, [shimmerX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 100 }],
  }));

  // Logo entrance
  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  useEffect(() => {
    logoOpacity.value = withTiming(1, { duration: 600 });
    logoScale.value = withSpring(1, { damping: 14, stiffness: 100 });
  }, [logoScale, logoOpacity]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const handleSignIn = useCallback(async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await signInWithOtp(trimmed);
      // For now, navigate to tabs — auth flow will be improved later
      router.replace("/(tabs)");
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [email, signInWithOtp, router]);

  const handleGuest = useCallback(() => {
    Haptics.selectionAsync();
    router.replace("/(tabs)");
  }, [router]);

  const canSubmit = email.trim().length > 0 && !loading;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.page}>
        {/* Logo */}
        <Animated.View style={[styles.logoArea, logoStyle]}>
          <Logo variant="stacked" width={220} color={C.textPrimary} />
        </Animated.View>

        {/* Form */}
        <View style={styles.form}>
          <Animated.View
            entering={FadeIn.delay(200).duration(400)}
            style={styles.inputGroup}
          >
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              placeholderTextColor={C.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(300).duration(400)}
            style={styles.inputGroup}
          >
            <TextInput
              ref={passwordRef}
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={C.textMuted}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={handleSignIn}
            />
          </Animated.View>

          <Animated.View
            entering={FadeIn.delay(400).duration(400)}
            style={styles.forgotRow}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Animated.View>

          {/* CTA */}
          <Animated.View entering={FadeIn.delay(500).duration(400)}>
            <TouchableOpacity
              style={[styles.cta, !canSubmit && styles.ctaDisabled]}
              onPress={handleSignIn}
              disabled={!canSubmit}
              activeOpacity={0.9}
            >
              <Animated.View style={[styles.ctaShimmer, shimmerStyle]} />
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.ctaText}>Sign In</Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          {/* Divider */}
          <Animated.View
            entering={FadeIn.delay(600).duration(400)}
            style={styles.divider}
          >
            <View style={styles.divLine} />
            <Text style={styles.divText}>or</Text>
            <View style={styles.divLine} />
          </Animated.View>

          {/* Social */}
          <Animated.View
            entering={FadeIn.delay(700).duration(400)}
            style={styles.socialRow}
          >
            <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
              <Text style={styles.socialIcon}></Text>
              <Text style={styles.socialName}>Apple</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
              <Text style={[styles.socialIcon, { fontSize: 14, fontWeight: "700" }]}>G</Text>
              <Text style={styles.socialName}>Google</Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Guest */}
          <Animated.View
            entering={FadeIn.delay(800).duration(400)}
            style={styles.guestRow}
          >
            <Text style={styles.guestText}>
              or{" "}
              <Text style={styles.guestLink} onPress={handleGuest}>
                continue as guest
              </Text>
            </Text>
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  page: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 32,
  },
  logoArea: {
    marginTop: 80,
    marginBottom: 40,
    alignItems: "center",
  },
  form: {
    width: "100%",
  },
  inputGroup: {
    marginBottom: 14,
  },
  input: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    color: C.textPrimary,
    fontSize: 15,
    fontWeight: "400",
  },
  forgotRow: {
    alignItems: "flex-end",
    marginBottom: 20,
    marginTop: -4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: "500",
    color: C.accent,
  },
  cta: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 24,
  },
  ctaDisabled: {
    opacity: 0.5,
  },
  ctaShimmer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: "25%",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  ctaText: {
    fontSize: 15,
    fontWeight: "700",
    color: "white",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 20,
  },
  divLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  divText: {
    fontSize: 12,
    fontWeight: "500",
    color: C.textMuted,
  },
  socialRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  socialBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  socialIcon: {
    fontSize: 16,
    color: "#94A3B8",
  },
  socialName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#94A3B8",
  },
  guestRow: {
    alignItems: "center",
  },
  guestText: {
    fontSize: 13,
    color: C.textMuted,
  },
  guestLink: {
    color: C.accent,
    fontWeight: "600",
  },
});
