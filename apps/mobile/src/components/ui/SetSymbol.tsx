// apps/mobile/src/components/ui/SetSymbol.tsx
import React, { useEffect, useState, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { SvgXml } from "react-native-svg";
import { rarityColors } from "../../theme";

interface SetSymbolProps {
  setCode: string;
  rarity: string | null | undefined;
  size?: number;
}

const svgCache = new Map<string, string>();

function getRarityColor(rarity: string | null | undefined): string {
  switch (rarity?.toLowerCase()) {
    case "mythic":   return rarityColors.mythic;
    case "rare":     return rarityColors.rare;
    case "uncommon": return rarityColors.uncommon;
    default:         return rarityColors.common;
  }
}

function injectColor(svgText: string, color: string): string {
  return svgText
    .replace(/fill="(?!none\b)([^"]*)"/g, `fill="${color}"`)
    .replace(/stroke="(?!none\b)([^"]*)"/g, `stroke="${color}"`)
    .replace(/fill:(?!\s*none)\s*[^;"}]*/g, `fill:${color}`)
    .replace(/stroke:(?!\s*none)\s*[^;"}]*/g, `stroke:${color}`);
}

export function SetSymbol({ setCode, rarity, size = 16 }: SetSymbolProps) {
  const [svgXml, setSvgXml] = useState<string | null>(null);
  const isMythic = rarity?.toLowerCase() === "mythic";
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const abortRef = useRef<AbortController | null>(null);
  const color = getRarityColor(rarity);
  const cacheKey = `${setCode.toLowerCase()}:${color}`;

  useEffect(() => {
    const code = setCode.toLowerCase();
    if (!/^[a-z0-9_-]{1,12}$/.test(code)) return;

    if (svgCache.has(cacheKey)) {
      setSvgXml(svgCache.get(cacheKey)!);
      return;
    }

    let mounted = true;
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    fetch(`https://svgs.scryfall.io/sets/${code}.svg`, {
      signal: abortRef.current.signal,
    })
      .then((r) => r.text())
      .then((text) => {
        const colored = injectColor(text, color);
        svgCache.set(cacheKey, colored);
        if (mounted) setSvgXml(colored);
      })
      .catch(() => {});

    return () => {
      mounted = false;
      abortRef.current?.abort();
    };
  }, [cacheKey, setCode, color]);

  useEffect(() => {
    if (!isMythic || !svgXml) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.6, duration: 1000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isMythic, svgXml, pulseAnim]);

  if (!svgXml) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color + "66" },
        ]}
      />
    );
  }

  if (isMythic) {
    return (
      <Animated.View style={{ opacity: pulseAnim, width: size, height: size }}>
        <SvgXml xml={svgXml} width={size} height={size} />
      </Animated.View>
    );
  }

  return <SvgXml xml={svgXml} width={size} height={size} />;
}

const styles = StyleSheet.create({
  fallback: {
    opacity: 0.5,
  },
});
