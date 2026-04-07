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

interface LoginScreenProps {
  onSwitchToRegister: () => void;
}

export function LoginScreen({ onSwitchToRegister }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter email and password");
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      Alert.alert("Login Error", error.message);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>Card Engine</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

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
            autoComplete="password"
          />

          <Button
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading}
            onPress={handleLogin}
            style={styles.button}
          >
            Sign In
          </Button>
        </View>

        <TouchableOpacity onPress={onSwitchToRegister}>
          <Text style={styles.linkText}>
            Don&apos;t have an account?{" "}
            <Text style={styles.linkBold}>Sign up</Text>
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
