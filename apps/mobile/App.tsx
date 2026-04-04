import React, { useState } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View, StyleSheet } from "react-native";
import { AuthProvider, useAuth } from "./src/contexts/AuthContext";
import { LoginScreen } from "./src/screens/LoginScreen";
import { RegisterScreen } from "./src/screens/RegisterScreen";
import { MainApp } from "./src/screens/MainApp";
import { colors } from "./src/theme";

const t = colors.light;

function AuthGate() {
  const { user, loading } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.accent} />
      </View>
    );
  }

  if (!user) {
    if (authMode === "login") {
      return <LoginScreen onSwitchToRegister={() => setAuthMode("register")} />;
    }
    return <RegisterScreen onSwitchToLogin={() => setAuthMode("login")} />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <AuthProvider>
      <AuthGate />
      <StatusBar style="dark" />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: t.bg,
    alignItems: "center",
    justifyContent: "center",
  },
});
