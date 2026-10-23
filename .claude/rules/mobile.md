---
paths:
  - "apps/mobile/**/*.{ts,tsx,json}"
---

# Mobile

`apps/mobile` is outside the root npm workspaces and has its own `package-lock.json`. Install and start it from that directory. Add native-module dependencies with Expo so the version matches SDK 52. A missing dependency in `package.json` still typechecks on a machine that already has it and then crashes EAS.

`EXPO_PUBLIC_API_URL` is a LAN IP in local device builds. `localhost` points at the phone. Production values belong in `eas.json` profile env, not only in `.env`.

The life counter follows `docs/superpowers/specs/2026-04-11-life-counter-redesign.md`: starting life 20/30/40/60, 2–6 players, chess clocks, counters, coin flip, elimination, no emoji. Colors are the teal set in `src/lib/lifeConstants.ts`, not the web sapphire tokens.

Hash scanning notes are in `.claude/rules/scanner.md`. The frame processor must throttle with a Reanimated shared value; a React ref inside the worklet does not persist, and OCR then runs every frame.

`apps/mobile/src/screens/` still has older tab screens beside the Expo Router app in `apps/mobile/app/`. Edit the screen the router actually mounts.
