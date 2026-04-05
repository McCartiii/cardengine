import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from "react-native";
import { COLORS } from "../lib/constants";
import type { PendingScan } from "../store/scanStore";

interface Props {
  scan: PendingScan;
  totalCount: number;
  onViewMore: () => void;
}

export function LastScannedThumb({ scan, totalCount, onViewMore }: Props) {
  const slideAnim = useRef(new Animated.Value(120)).current;

  // Slide up when mounted
  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 5,
    }).start();
  }, [slideAnim]);

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
    >
      {/* Card thumbnail */}
      <TouchableOpacity onPress={onViewMore} activeOpacity={0.85} style={styles.thumbWrap}>
        {scan.candidate.imageUri ? (
          <Image
            source={{ uri: scan.candidate.imageUri }}
            style={styles.thumb}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.thumb, styles.thumbPlaceholder]}>
            <Text style={styles.placeholderText}>
              {scan.candidate.name.slice(0, 2).toUpperCase()}
            </Text>
          </View>
        )}

        {/* Quantity badge */}
        {totalCount > 1 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{totalCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* View More pill */}
      <TouchableOpacity style={styles.viewMoreBtn} onPress={onViewMore} activeOpacity={0.8}>
        <Text style={styles.viewMoreText}>View More</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 48,
    left: 16,
    alignItems: "center",
    gap: 6,
  },
  thumbWrap: {
    position: "relative",
  },
  thumb: {
    width: 64,
    height: 89, // ~0.72 aspect ratio (standard card)
    borderRadius: 6,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: "700",
  },
  badge: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  viewMoreBtn: {
    backgroundColor: "rgba(0,0,0,0.65)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  viewMoreText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
});
