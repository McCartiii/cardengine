import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { LC } from "../../lib/lifeConstants";

interface CoinFlipProps {
  result: "HEADS" | "TAILS";
  onDismiss: () => void;
}

export function CoinFlip({ result, onDismiss }: CoinFlipProps) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Pop in with spring animation
    scale.value = withSpring(1, {
      damping: 12,
      stiffness: 200,
    });
    opacity.value = withTiming(1, { duration: 150 });

    // Auto-dismiss after 2.5s
    const dismissTimer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 300 }, () => {
        runOnJS(onDismiss)();
      });
    }, 2500);

    return () => clearTimeout(dismissTimer);
  }, [result, scale, opacity, onDismiss]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.content}>
        <Text style={styles.text}>{result}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    backgroundColor: LC.surfaceRaised,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LC.borderStrong,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  text: {
    fontSize: 13,
    fontWeight: "800",
    color: LC.textPrimary,
    letterSpacing: 1,
  },
});
