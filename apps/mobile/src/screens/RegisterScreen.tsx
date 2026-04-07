import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { useAuth } from "../contexts/AuthContext";
import { colors, spacing, radii, typography, shadows } from "../theme";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";

const t = colors.light;

interface RegisterScreenProps {
  onSwitchToLogin: () => void;
}

export function RegisterScreen({ onSwitchToLogin }: RegisterScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Error", "Passwords do not match");
      return;
    }
    if (password.length < 6) {
      Alert.alert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    const { error } = await signUp(email, password);
    setLoading(false);

    if (error) {
      Alert.alert("Registration Error", error.message);
    } else {
      Alert.alert("Success", "Check your email to confirm your account", [
        { text: "OK", onPress: onSwitchToLogin },
      ]);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Join Card Engine</Text>

        <View style={styles.card}>
          <Input
            label="Email"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Input
            label="Password"
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <Input
            label="Confirm Password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
            autoComplete="new-password"
          />

          <Button
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading}
            onPress={handleRegister}
            style={styles.button}
          >
            Create Account
          </Button>
        </View>

        <TouchableOpacity onPress={onSwitchToLogin}>
          <Text style={styles.linkText}>
            Already have an account?{" "}
            <Text style={styles.linkBold}>Sign in</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: t.bg,
  },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: spacing["3xl"],
  },
  title: {
    ...typography.title,
    fontSize: 32,
    color: t.textPrimary,
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: t.textSecondary,
    textAlign: "center",
    marginBottom: spacing["3xl"],
  },
  card: {
    backgroundColor: t.surface,
    borderRadius: radii.lg,
    padding: spacing["2xl"],
    gap: spacing.lg,
    marginBottom: spacing["2xl"],
    ...shadows.card,
  },
  button: {
    marginTop: spacing.sm,
  },
  linkText: {
    ...typography.caption,
    color: t.textSecondary,
    textAlign: "center",
  },
  linkBold: {
    color: t.accent,
    fontWeight: "600",
  },
});
