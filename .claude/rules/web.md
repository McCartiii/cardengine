---
paths:
  - "apps/web/**/*.{ts,tsx,css}"
---

# Web

Tokens live in `apps/web/src/app/globals.css` under the Sapphire + Five-Jewel header. New UI uses those CSS variables. The April 2026 spec's Cinzel, Geist, and light theme did not ship; do not reintroduce them as the default.

Fonts loaded by the root layout are Space Grotesk and JetBrains Mono. Prices and counts use the mono face.

`AuthProvider` stays in the root layout. Without it, pages call the API with no Supabase access token.

Build with `next build --webpack`. The dev server is port 3000. The API fallback, when `NEXT_PUBLIC_API_URL` is missing, is port 3001.

`CardImage` should not unconditionally apply `aspect-[5/7]` on its outer wrapper. Foil tilt uses the `foil-visible` class and pointer handlers.

Deck list and collection image work is aimed at the 2026-04-08 perf spec: art on deck rows, manual collection add, and small-then-normal Scryfall images. Check the component before assuming that polish is complete.

`/life` on the web is its own counter. The premium life-counter redesign was mobile-only.
