# MYCOACH MOBILE — LUXURY UI OVERHAUL SPECIFICATION

**Companion to:** `MYCOACH_GLOBAL_MASTER_SPEC.md` (§3 Premium Design System) · **Target:** Expo RN 0.81 / expo-router 6 / NativeWind 4 · **Scope:** translate the web portal's dark-luxury identity into React Native primitives.

The web platform runs two deliberate visual languages (master spec §3.1): **SF Dark Pro** structural chrome and the **Tactical HUD / Volt** accent layer used *inside* the student portal's motivational modules. Mobile mirrors that split: system-sans luxury chrome everywhere, Volt accent modules re-injected surgically (directive banner, hydration engine, active states) — never as the whole-app identity.

## 0. Token registry (single source of truth for all modules below)

```ts
export const T = {
  bgRoot:        "#070708",                    // OLED near-black
  bgSurface:     "#0e0e10",                    // floating cards
  bgSurfaceHi:   "#161618",                    // raised iOS gray
  bgMealCard:    "#1A1A1A",                    // bento/meal surfaces
  bgSheet:       "#0d0d0d",                    // bottom sheets
  borderSubtle:  "rgba(255,255,255,0.07)",
  borderStrong:  "rgba(255,255,255,0.12)",
  textPrimary:   "#ffffff",
  textSecondary: "#e5e5ea",                    // silver body
  textTertiary:  "#8e8e93",                    // muted labels
  volt:          "#CEFF00",                    // portal accent (globals chrome uses #D4FF00)
  voltDim:       "#a3e635",                    // lime-400
  hudCyan:       "#00F0FF",
  success:       "#34d399", warning: "#fbbf24", danger: "#f87171", info: "#60a5fa",
  macroProtein:  "#34d399", macroCarbs: "#60a5fa", macroFat: "#fb923c",
};
```

Gradients are not native in RN. **Standard technique across this spec:** `react-native-svg` `<LinearGradient>` inside an absolutely-filled `<Svg>` (`StyleSheet.absoluteFill`) — already proven in `nutrition.tsx` (`MealCardShade`, `kcalGrad`). Do not add `expo-linear-gradient`; one gradient system only.

---

## 1. The Cyber Command Banner (`SYSTEM_ENFORCED_DIRECTIVE`)

Web source: master spec §3.2.1 (portal lines ~2596–2606). RN translation:

```
Container <View>:
  backgroundColor #0a0a0b (zinc-950)
  borderWidth 2 · borderColor #a3e635 (lime-400)
  borderRadius 4                      ← deliberately sharp; this module is the accent layer
  padding 20 · marginBottom 16 · overflow "hidden"
  shadowColor #a3e635 · shadowOpacity 0.05 · shadowRadius 25 (iOS) / elevation 4 (Android)

Corner brackets (two absolute 10×10 <View>s, borderColor rgba(163,230,53,0.25)):
  top-right:    { position:"absolute", top:0, right:0, width:10, height:10,
                  borderLeftWidth:1, borderBottomWidth:1 }
  bottom-left:  { position:"absolute", bottom:0, left:0, width:10, height:10,
                  borderRightWidth:1, borderTopWidth:1 }

Label <Text>:  fontSize 10 · fontWeight "900" · letterSpacing 2 · uppercase
               color #a3e635 → "SYSTEM_ENFORCED_DIRECTIVE"
Body  <Text>:  fontSize 16–18 · fontWeight "900" · fontStyle "italic" · uppercase
               color #fff · lineHeight ~22
               Neon glow: textShadowColor "rgba(255,255,255,0.15)"
                          textShadowRadius 8 · textShadowOffset {0,0}
```

**Content rule (verbatim from web):** latest coach notice rendered as
`MISSION: <SENDER> // STATUS: <first 60 chars of content, uppercased>`; when no notice
exists, a default directive (e.g. `MISSION: MYCOACH // STATUS: EJECUTA TU PLAN DE HOY`).
Mobile data source: `GET /api/mobile/community/notices` (mobile-token-safe; returns `[]`
for non-clients — render the default, never an error). Filter `role === "COACH" | "ADMIN"`,
take the newest.

---

## 2. Typography Oblique Overhaul

Goal: the web's `Barlow Condensed 900 italic uppercase` display voice (master spec §3.1.3 "DS font") on every screen header, without monospace anywhere.

1. **Load the real font** (the `font-condensed` Tailwind class currently falls back to
   system sans because `app.json`'s `expo-font` plugin has `fonts: []`). Ship
   `BarlowCondensed-Black.ttf` + `BarlowCondensed-BlackItalic.ttf` in `assets/fonts/` and
   register them in the plugin. Until the files land, the recipe below degrades gracefully
   to heavy system sans.
2. **Display recipe** (all screen titles, meal titles, stat values):
   `className="font-condensed font-black uppercase"` +
   `style={{ fontStyle:"italic", letterSpacing:-0.5 … -1, lineHeight: fontSize+1 }}`.
3. **Oblique without an italic cut:** RN synthesizes italics poorly on Android for custom
   fonts — when the BlackItalic cut is absent, apply
   `transform:[{ skewX:"-6deg" }]` to the *wrapping View* (not the Text) for a true
   oblique. Never skew body copy; display headlines only.
4. **Hierarchy:** eyebrow 9–10px / 900 / letterSpacing 2–2.4 / Volt or tertiary →
   title 24–34px condensed black italic white → supporting line 11px tertiary.
   Body copy stays system sans (SF/Roboto), never condensed, never italic.

---

## 3. The Hydration Engine (`HIDRATACIÓN` row)

Backend contract (master spec §2 `student/water`, §4.3.6): `GET /api/student/water?date=` →
`{ totalMl }` (sum of that date's `WaterLog` rows); `POST { amountMl, date? }` appends a row
(multiple per day is the design); target `WATER_TARGET_ML = 3000`. Dose = **250 ml → 12 indicator circles**.

```
Section container <View>: rounded-3xl (24) · backgroundColor rgba(18,18,20,0.8)
  borderWidth 1 · borderColor rgba(255,255,255,0.07) · padding 16
  borderLeftWidth 3 · borderLeftColor #CEFF00        ← Volt spine, racha-card pattern
  shadowColor #CEFF00 · shadowOpacity 0.06 · shadowRadius 20

Header row (space-between):
  "HIDRATACIÓN"  → 10px · letterSpacing 1.2 · #8e8e93 · uppercase
  "{totalMl} / 3000 ML" → 13px · 900 · white · tabular

Indicator strip: 12 × <View> 16×16 · borderRadius 8 · gap 6 · flex-row
  filled  (i < floor(min(totalMl,3000)/250)):
     backgroundColor #CEFF00
     shadowColor #CEFF00 · shadowOpacity 0.5 · shadowRadius 6   ← the "lit" state
  empty:  borderWidth 1.5 · borderColor rgba(255,255,255,0.15) · transparent fill

Action pill <Pressable> (right-aligned under the strip):
  "+ 250ML" → rounded-full · backgroundColor #CEFF00 · px 14 · py 8
  label 11px · 900 · uppercase · letterSpacing 0.8 · color #000
  pressed: backgroundColor #D4FF00 · disabled while POST in flight (opacity 0.5 + spinner)
```

Behavior: optimistic `totalMl += 250` on tap → `POST /api/student/water
{ amountMl: 250, date: activeDate }` → rollback + error banner on failure. The row is
keyed to the browsed day (`realDateForDayIndex`, master spec §4.1.2) exactly like meal
checks; switching the weekday pill re-hydrates from GET. Overfill past 3000 keeps counting
in the label; the circles cap at 12.

---

## 4. Floating Luxury Dock (bottom tab bar)

Replace the default tab bar with a custom `tabBar` render prop on `<Tabs>` in
`app/(portal)/_layout.tsx` — do **not** fight `tabBarStyle`; take over rendering entirely:

```tsx
<Tabs tabBar={(props) => <LuxuryDock {...props} />} screenOptions={{ headerShown: false }}>
```

```
LuxuryDock <View> (the floating capsule):
  position "absolute" · left 16 · right 16 · bottom insets.bottom + 12
  height 68 · borderRadius 34                       ← fully curved, detached from edges
  backgroundColor rgba(10,10,11,0.92)
  borderWidth 1 · borderColor rgba(255,255,255,0.08)
  shadowColor #000 · shadowOpacity 0.6 · shadowRadius 24 · shadowOffset {0,8}
  flexDirection "row" · alignItems "center" · justifyContent "space-around"
  (Android: elevation 16; true blur needs expo-blur — optional, the 0.92 alpha reads
   as glass on OLED black without it)

Standard items: Ionicons 20px + 9px 600-weight uppercase label,
  focused → white icon/label; unfocused → #52525b. Each item = flex-1 Pressable
  calling props.navigation.navigate(route.name) (guard with emit("tabPress") canPreventDefault).

Center action button (the WORKOUT/tracker tab — route "index"):
  64×64 circle · borderRadius 32 · translateY -22 (floats above the dock line)
  backgroundColor #CEFF00 · Ionicons "barbell" 26px black
  neon halo: shadowColor #CEFF00 · shadowOpacity 0.45 · shadowRadius 22
  active session state (lifecycle === "ACTIVE_TRACKING"): Moti pulse loop
  scale 1 → 1.06 · duration 900 · repeatReverse — the dock "breathes" while tracking.

Content clearance: every portal screen's ScrollView contentContainerStyle needs
paddingBottom ≥ 68 + 12 + insets.bottom + 24 so content scrolls clear of the dock
(web equivalent: the monolith's pb-40 rule, master spec §3.2).
```

Rollout note: implement `LuxuryDock` once in `(portal)/_layout.tsx`, then mirror in
`(coach)/_layout.tsx` with `people` as the center action. Ship after the per-screen
padding audit — a dock over unpadded content clips the last card.

---

## 5. Cinematic meal-card mandate (already live, kept normative)

All meal cards render full-bleed `<ImageBackground>` heroes under the §3.2.6 mask —
SVG gradient stops (top→bottom) `0.10 → 0.55 @ 55% → 0.95`, condensed-black italic title,
glass macro pills (`rgba(20,20,20,0.86)`, border white/6, 9px label / 15px value, PROT
label in HUD cyan). Until the coach-side API emits `meal.imageUrl`, cards fall back to
keyword-matched stock templates (desayuno/snack/comida/cena) — **placeholder art only;
swap for brand-owned photography before release.** A failed image load degrades to the
dark `#1A1A1A` surface with the same overlay, so contrast never breaks.
