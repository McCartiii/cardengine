import React, { useState, useRef } from "react";
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
import { useRouter } from "expo-router";
import { COLORS } from "../../src/lib/constants";
import { useAuthStore } from "../../src/store/authStore";

type Step = "email" | "otp";

export default function SignInScreen() {
  const router = useRouter();
  const { signInWithOtp, verifyOtp, pendingEmail } = useAuthStore();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const otpRef = useRef<TextInput>(null);

  const handleSendOtp = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes("@")) {
      Alert.alert("Invalid email", "Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      await signInWithOtp(trimmed);
      setStep("otp");
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e: unknown) {
      Alert.alert("Error", (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const trimmedOtp = otp.trim();
    if (trimmedOtp.length !== 6) {
      Alert.alert("Invalid code", "Enter the 6-digit code from your email.");
      return;
    }
    setLoading(true);
    try {
      await verifyOtp(pendingEmail ?? email.trim().toLowerCase(), trimmedOtp);
      // Auth state change will trigger redirect in root layout
    } catch (e: unknown) {
      Alert.alert("Wrong code", (e as Error).message ?? "The code was incorrect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.container}
    >
      <View style={styles.inner}>
        {/* Logo / branding */}
        <View style={styles.brand}>
          <Text style={styles.logo}>CardEngine</Text>
          <Text style={styles.tagline}>Scan. Collect. Master.</Text>
        </View>

        {step === "email" ? (
          <>
            <Text style={styles.heading}>Sign in</Text>
            <Text style={styles.subheading}>
              We'll send a one-time code to your email — no password needed.
            </Text>

            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={handleSendOtp}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.btn, (!email.trim() || loading) && styles.btnDisabled]}
              onPress={handleSendOtp}
              disabled={!email.trim() || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Send Code</Text>
              }
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.heading}>Check your email</Text>
            <Text style={styles.subheading}>
              We sent a 6-digit code to{"\n"}
              <Text style={styles.emailHighlight}>{pendingEmail ?? email}</Text>
            </Text>

            <TextInput
              ref={otpRef}
              style={[styles.input, styles.otpInput]}
              value={otp}
              onChangeText={(t) => setOtp(t.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="000000"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={handleVerifyOtp}
            />

            <TouchableOpacity
              style={[styles.btn, (otp.length !== 6 || loading) && styles.btnDisabled]}
              onPress={handleVerifyOtp}
              disabled={otp.length !== 6 || loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.btnText}>Verify Code</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => { setStep("email"); setOtp(""); }}
            >
              <Text style={styles.backText}>← Use a different email</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: { flex: 1, justifyContent: "center", padding: 32 },
  brand: { alignItems: "center", marginBottom: 48 },
  logo: {
    fontSize: 36,
    fontWeight: "900",
    color: COLORS.text,
    letterSpacing: -1,
  },
  tagline: { color: COLORS.textMuted, fontSize: 14, marginTop: 4 },
  heading: { color: COLORS.text, fontSize: 28, fontWeight: "800", marginBottom: 8 },
  subheading: { color: COLORS.textMuted, fontSize: 15, lineHeight: 22, marginBottom: 28 },
  emailHighlight: { color: COLORS.accent, fontWeight: "700" },
  input: {
    backgroundColor: COLORS.surface,
    color: COLORS.text,
    borderRadius: 14,
    padding: 16,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: COLORS.border ?? "#222",
  },
  otpInput: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: 12,
  },
  btn: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backBtn: { alignItems: "center", padding: 12 },
  backText: { color: COLORS.textMuted, fontSize: 14 },
});
