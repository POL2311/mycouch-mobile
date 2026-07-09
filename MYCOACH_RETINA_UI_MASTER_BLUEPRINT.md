# MYCOACH — RETINA UI MASTER BLUEPRINT
## Pixel-Perfect Visual & Business-Logic Extraction of the Client Nutrition Experience

**Source of truth:** `src/app/portal/page.tsx` (8,549 lines, single client component), `src/app/globals.css`, `src/lib/db.ts` parsers. Every class string, hex value, gradient stop, animation curve, and formula below was copied from the live code — nothing is invented, rounded, or paraphrased. Line references point into `portal/page.tsx` as of branch `nuevoultimo`.
**Companion documents:** `MYCOACH_GLOBAL_MASTER_SPEC.md` (DB + API + system rules), `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md` (workout subsystem).

---

# 1. PIXEL-PERFECT VISUAL CHROMIUM & TAILWIND REGISTRY

## 1.1 The Core Shell & Background System

### 1.1.1 Global surface tokens (`src/app/globals.css`, verbatim)

| Token | Value | Role |
|---|---|---|
| `--bg-root` | `#070708` | App background ("Near-pure black — OLED extreme contrast") |
| `--bg-surface` | `#0e0e10` | Floating cards (dashboard chrome) |
| `--bg-surface-raised` | `#161618` | iOS-style elevated gray |
| `--border-subtle` | `rgba(255,255,255,0.07)` | Hairline card borders |
| `--border-default` / `--border-strong` | `rgba(255,255,255,0.08)` / `rgba(255,255,255,0.12)` | |
| `--text-primary` / `--text-secondary` / `--text-tertiary` | `#ffffff` / `#e5e5ea` / `#8e8e93` | Text hierarchy |
| `--accent-primary` (chrome Volt) | `#D4FF00` | Sidebar/dashboard accent |
| `--color-carbon` | `#0B0C0E` | |

### 1.1.2 Portal-local hardcoded palette (used inside the monolith, distinct from chrome tokens)

| Value | Usage |
|---|---|
| `#070708` | Page background, gradient floors, sheet scrims |
| `#0d0d0d` | `BottomSheet` panel surface |
| `#1A1A1A` | Meal/ingredient/stat card surface (the dominant nutrition-card gray) |
| `rgba(18,18,20,0.80)` + `backdrop-blur-md` | Streak card glass |
| `rgba(8,8,10,0.95)` + `backdropFilter: blur(40px)` | MacroSummaryCard glass |
| `#CEFF00` | Portal Volt (note: intentionally 2 points off the chrome's `#D4FF00`) |
| `#00F0FF` | HUD cyan (protein, water) |
| `#acd600` | Carb ring/pill green |
| `#c8c6c5` | Fat ring silver |
| `#34d399` / `#60a5fa` / `#fb923c` | emerald/blue/orange macro bar trio (CalorieRing variant) |
| `#808080` | Muted HUD gray text |
| `#52525b` | zinc-600 micro-labels |

**Fonts:** `DS = "var(--font-display,'Barlow Condensed',sans-serif)"` (declared locally ~24×; always used with `fontWeight: 900`, `textTransform: uppercase`, frequently `fontStyle: italic`) and `MONO = "'Courier New',monospace"` for terminal captions.

### 1.1.3 Glassmorphism opacity registry (every rgba glass recipe in the nutrition views)

| Recipe | Where |
|---|---|
| `background: rgba(0,0,0,0.68)` + `backdropFilter: blur(12px)` + `border: 1px solid rgba(255,255,255,0.1)` | Bento-card macro pills (kcal pill) |
| same bg/blur + `border: 1px solid rgba(0,240,255,0.22)` | Protein pill (cyan-bordered) |
| `rgba(20,20,20,0.86)` + `blur(16px)` + `border rgba(255,255,255,0.06)` | MealSheet hero macro pills |
| `rgba(0,0,0,0.55)` + `blur(16px)` + `border rgba(255,255,255,0.12)` | FitiaMealCard kcal capsule |
| `rgba(0,240,255,0.12)` + `blur(12px)` + `border rgba(0,240,255,0.28)` | FitiaMealCard P-capsule |
| `rgba(172,214,0,0.1)` + `blur(12px)` + `border rgba(172,214,0,0.28)` | FitiaMealCard C-capsule |
| `rgba(255,255,255,0.08)` + `blur(12px)` + `border rgba(255,255,255,0.15)` | FitiaMealCard swap toggle (40×40 round) |
| `rgba(255,255,255,0.05)` + `blur(16px)` + `border rgba(255,255,255,0.08)` | "PROTOCOLO RECOMENDADO" inset panel |
| `bg-black/75 backdrop-blur-sm` | BottomSheet scrim |
| `bg-black/60` + `backdropFilter: blur(4px)` | Swap-drawer scrim (z-70) |
| `rgba(7,7,8,0.98)` + `blur(24px)` | Swap-drawer sheet (z-80) |

## 1.2 The Hoy/Nutrición View — top-to-bottom block registry

Tab shell: 5 tabs (`today | progress | squads | profile | community`), content wrapper `pb-40` above the fixed bottom nav.

### Block A — Tactical OS Directive Card (lines 2596–2606)
```html
<div class="w-full bg-zinc-950 border-2 border-lime-400 p-5 mb-4 relative overflow-hidden rounded-sm
            shadow-[0_0_25px_rgba(163,230,53,0.05)]">
  <div class="absolute top-0 right-0 w-10 h-10 border-l border-b border-lime-400/25 pointer-events-none" />
  <div class="absolute bottom-0 left-0 w-10 h-10 border-r border-t border-lime-400/25 pointer-events-none" />
  <span class="text-[10px] font-mono tracking-[0.2em] text-lime-400 font-black uppercase block mb-2">
    SYSTEM_ENFORCED_DIRECTIVE
  </span>
  <p class="text-base sm:text-lg font-black italic uppercase tracking-normal text-white leading-snug
            drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]">
    MISSION: {SENDER} // STATUS: {first 60 chars of latest coach notice, uppercased}
  </p>
</div>
```

### Block B — Micro-Calendar Weekday Strip (lines 2608–2627)
Container: `flex items-center justify-between gap-1.5 w-full bg-zinc-900/40 p-1.5 border border-zinc-800/80 rounded-sm mb-5`.
Seven `flex-1` buttons labeled `["L","M","MI","J","V","S","D"]` (dayNum = index+1):
- **Active:** `flex-1 py-2 text-center text-xs font-mono font-black border border-lime-400 text-lime-400 bg-lime-400/10 shadow-[0_0_12px_rgba(163,230,53,0.15)] rounded-sm transition-all`
- **Inactive:** `flex-1 py-2 text-center text-xs font-mono font-bold border border-transparent text-zinc-500 hover:text-zinc-300 transition-all`
- Click handler: `onAdvanceDay(dayNum - activeDayIndex)` — relative jump.

### Block C — Nutrition Header + Day Carousel + Kcal Bar (lines 2629–2702)
- Carousel chevrons: 32×32 (`w-8 h-8`) `rounded-xl active:scale-90`, bg `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.08)`; disabled at bounds (`opacity 0.3`, `cursor-not-allowed`); the **forward** chevron when enabled tints Volt: bg `rgba(206,255,0,0.08)`, border `rgba(206,255,0,0.25)`, icon `#CEFF00`.
- Title `<h2>`: `fontFamily: DS, fontWeight: 900, fontSize: clamp(22px,6.5vw,28px), uppercase, letterSpacing: -0.01em, color: #fff, lineHeight: 1` → `"{WEEKDAY} · NUTRICIÓN"`.
- EXPORTAR button: `flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:opacity-70`, bg `rgba(255,255,255,0.05)`, `Printer` icon 12px `#808080`, label `DS 900 · 9px · letterSpacing 0.14em · uppercase · #808080`; fires `window.print()`.
- Subline: `text-[11px]`, `#808080`, MONO — `Alimenta tu disciplina. <b white>{remaining}</b> kcal restantes.`
- Kcal labels: `text-[9px] font-black uppercase tracking-[0.14em]` `#808080` — `"{totalConsumed} KCAL CONSUMIDAS"` / `"{totalTarget} KCAL OBJETIVO"`.
- Kcal bar: track `h-2 w-full rounded-full overflow-hidden` bg `rgba(255,255,255,0.06)` + `boxShadow: inset 0 1px 2px rgba(0,0,0,0.5)`; fill `h-full rounded-full transition-all duration-500 ease-out`, `width: ${caloricPct*100 || 2}%` (2% floor so the bar never disappears), `background: linear-gradient(90deg, #00F0FF 0%, #CEFF00 100%)`, `boxShadow: 0 0 10px rgba(206,255,0,0.6), 0 0 4px rgba(0,240,255,0.4)`.
- **Perfect-day transform** (see §4.2).

### Block D — Racha Card (lines 2704–2719)
`rounded-3xl flex items-center gap-4 px-5 py-4 mb-5 backdrop-blur-md`; bg `rgba(18,18,20,0.80)`, border `1px rgba(255,255,255,0.07)`, `borderLeft: 3px solid #CEFF00`, glow `0 0 20px rgba(206,255,0,0.06)`. Icon tile `w-10 h-10 rounded-2xl` (`rgba(206,255,0,0.08)` bg, border `rgba(206,255,0,0.18)`, `Utensils` 20/2.5 `#CEFF00`). Headline `DS 900 clamp(18px,5.8vw,23px) uppercase letterSpacing 0.04em #CEFF00`: `"{WEEKDAY} · {streak} DÍAS DE RACHA"` (singular-aware). Subline `text-[9px] font-black uppercase tracking-[0.28em]` `rgba(255,255,255,0.28)`: `"RACHA ACTIVA · {ISO date}"`.

## 1.3 The Cinema Bento Meal Cards (Hoy list variant, lines 2721–2816)

**Sort rule:** `meals.map((_,i)=>i).sort((a,b) => (checked(a)?1:0)-(checked(b)?1:0))` — pending first, completed sink to the bottom (stable sort preserves meal order within groups).

**Card height rule:** `isSnack = name includes "snack" || "merienda"` → `cardH = 155`; otherwise `225`.

### 1.3.1 Pending (full cinematic) card — complete structure
```jsx
<div class="rounded-3xl overflow-hidden relative cursor-pointer active:scale-[0.99] transition-all"
     style="background:#000; minHeight:{cardH}" onClick={openMealSheet}>
  {/* Layer 1 — food photo */}
  <img class="absolute inset-0 w-full h-full object-cover"
       style="opacity:0.58; transition: all 0.4s ease" />       ← 0.22 + grayscale when checked (legacy path)
  {/* Layer 2 — vertical dark mask */}
  <div class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
  {/* Layer 3 — content */}
  <div class="relative z-10 p-5 h-full flex flex-col justify-between" style="minHeight:{cardH}">
    {/* Top row */}
    <div class="flex items-start justify-between gap-2">
      <div class="flex flex-wrap gap-1.5">
        <!-- kcal pill --> <div class="flex items-center px-2.5 py-1.5 rounded-xl"
             style="background:rgba(0,0,0,0.68); backdropFilter:blur(12px); border:1px solid rgba(255,255,255,0.1)">
          <span style="DS 900 · 13px · #fff">{calories} kcal</span></div>
        <!-- protein pill (only if macros.protein > 0) --> border:1px solid rgba(0,240,255,0.22); text #00F0FF → "{p}g P"
        <!-- carbs pill  (only if macros.carbs > 0)  --> border:1px solid rgba(255,255,255,0.07); text #fff → "{c}g C"
      </div>
      <!-- check button 32×32 -->
      <button class="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90 shrink-0"
              style="background:rgba(0,0,0,0.68); border:1px solid rgba(255,255,255,0.18); backdropFilter:blur(12px)">
        <Check size=14 strokeWidth=3 color=#fff />
      </button>
    </div>
    {/* Bottom */}
    <div class="mt-auto pt-4">
      <h3 style="DS 900 italic · fontSize: isSnack ? clamp(32px,9.5vw,42px) : clamp(44px,13vw,58px)
                 · lineHeight 0.86 · uppercase · letterSpacing 0.03em · #fff">{name}</h3>
      <p class="text-[11px] mt-1.5 leading-relaxed" style="color:#808080">{items.slice(0,3).join(", ")}.</p>
    </div>
  </div>
</div>
```

### 1.3.2 Completed (checked) state — the compact sunk card
When `checkedMeals.has(i)` the card **completely re-renders** as a slim receipt row (it does not merely dim):
```jsx
<div class="rounded-xl overflow-hidden relative transition-all duration-300"
     style="background:rgba(18,18,20,0.55); border:1px solid rgba(255,255,255,0.05)">
  <div class="flex items-center gap-3 py-2.5 px-4">
    <button class="w-6 h-6 rounded-full ... active:scale-90" style="background:#CEFF00; border:1px solid #CEFF00">
      <Check size=11 strokeWidth=3 color=#000 />          ← solid Volt disc, black check
    </button>
    <span style="DS 900 italic · 15px · uppercase · letterSpacing 0.02em
                 · color rgba(255,255,255,0.38) · flex:1 · ellipsis">{name}</span>
    <span style="MONO · 9px · rgba(255,255,255,0.2)">{calories} kcal ✓</span>
  </div>
</div>
```
Completed-state grammar, exhaustively: title dims to **38% white**, kcal caption to **20% white** with a trailing `✓`, surface flattens to `rgba(18,18,20,0.55)`, radius shrinks `rounded-3xl → rounded-xl`, height collapses from 155/225px to a single `py-2.5` row, the check disc inverts to **solid `#CEFF00` with a black check**, and the sort pushes it below all pending cards. On the legacy full-card path the image treatment for checked is `opacity: 0.22` + `filter: grayscale(60%) saturate(0.6)`; tapping the Volt disc calls `onToggleMeal(i)` to un-check (restores the cinematic card).

### 1.3.3 Empty state
`rounded-3xl py-12 flex flex-col items-center gap-3`, bg `#1A1A1A`, border `rgba(255,255,255,0.06)`; ghost `Utensils` 32/1 at `rgba(255,255,255,0.1)`; caption 12px `#808080`: "Tu coach aún no asigna tu dieta."

## 1.4 FitiaMealCard — the time-aware 3-state variant (lines 1443–1624)

An alternate meal-card system driven by clock time. State machine:
```ts
mealState = checked ? "past"
  : mealH < 0            ? "active"      // unparseable time
  : nowH >= mealH + 1.5  ? "past"        // 90 min past meal time
  : nowH >= mealH - 0.25 ? "active"      // within 15 min before
  : "upcoming";
```

**MEAL_GRADIENT registry (full, verbatim)** — photographic multi-layer radial backgrounds keyed by lowercase meal name:
```ts
desayuno:   "radial-gradient(ellipse 90% 60% at 75% 15%, rgba(251,191,36,0.45) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 15% 80%, rgba(234,88,12,0.3) 0%, transparent 55%), #0d0700"
almuerzo:   "radial-gradient(ellipse 90% 60% at 65% 20%, rgba(20,184,166,0.4) 0%, transparent 55%), radial-gradient(ellipse 55% 45% at 25% 75%, rgba(6,182,212,0.25) 0%, transparent 55%), #010c09"
comida:     "radial-gradient(ellipse 90% 55% at 60% 15%, rgba(15,160,110,0.45) 0%, transparent 55%), radial-gradient(ellipse 60% 50% at 80% 75%, rgba(6,182,212,0.22) 0%, transparent 55%), #010c07"
cena:       "radial-gradient(ellipse 80% 55% at 50% 15%, rgba(99,102,241,0.38) 0%, transparent 55%), radial-gradient(ellipse 55% 45% at 75% 80%, rgba(139,92,246,0.25) 0%, transparent 55%), #03030c"
"colación": "radial-gradient(ellipse 80% 55% at 45% 20%, rgba(168,85,247,0.38) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 75% 75%, rgba(236,72,153,0.22) 0%, transparent 55%), #08000f"
snack:      (same as colación)
merienda:   "radial-gradient(ellipse 75% 55% at 50% 20%, rgba(236,72,153,0.32) 0%, transparent 55%), radial-gradient(ellipse 50% 45% at 25% 70%, rgba(168,85,247,0.2) 0%, transparent 55%), #0a0008"
fallback:   "radial-gradient(ellipse 80% 55% at 50% 20%, rgba(100,100,100,0.3) 0%, transparent 55%), #0a0a0c"
```

**ACTIVE/HERO state** (minHeight 340): `mx-4 mb-3 rounded-3xl`, gradient bg, `border rgba(255,255,255,0.1)`, `boxShadow: 0 40px 80px -20px rgba(0,0,0,0.9)`; overlay `linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.1) 100%)`; plus an SVG `feTurbulence fractalNoise baseFrequency 0.9` **noise texture at `opacity-[0.03]`, 256px tile** for photo realism. Content: glass macro capsules (§1.1.3), 40×40 swap toggle, eyebrow `"{time} · TURNO ACTIVO"` (9px, tracking 0.22em, `#CEFF00`), hero title `DS 900 italic clamp(52px,16vw,72px) lineHeight 0.85 letterSpacing -0.03em`, "PROTOCOLO RECOMENDADO" inset glass panel listing `items.slice(0,3)` with 1×1 Volt dot bullets, then the action row: full-width Volt CTA `"REGISTRAR AHORA ⚡"` (`py-4 rounded-2xl`, `boxShadow 0 8px 32px rgba(206,255,0,0.4)`) + a 56×56 (`w-14 h-14 rounded-2xl`) emerald check (`rgba(52,211,153,0.12)` bg / `1.5px rgba(52,211,153,0.3)` border / `CheckCircle2` 18 `#34d399`).

**PAST/COMPLETED state:** same gradient card overlaid `rgba(0,0,0,0.72)`, **emerald** border `rgba(52,211,153,0.2)`; 32px badge (`rgba(52,211,153,0.15)` bg, `1.5px #34d399` border, `CheckCircle2` 15 `#34d399`); eyebrow `"✓ COMPLETO · {time}"` in `#34d399`; title `clamp(20px,6vw,26px)` at 35% white **with `textDecoration: line-through`**; kcal at 20% white; a 28px undo button (`↩` glyph, 20% white).

**UPCOMING state:** whole card `opacity: 0.55`, overlay `rgba(0,0,0,0.68)`; 32px moon badge (`🌙`); eyebrow `"PENDIENTE · {time}"` at 30% white; same dimmed title; no actions.

## 1.5 MacroSummaryCard — the 4-ring "loop reactor" HUD (lines 1348–1436)

Container: `mx-4 mt-1 mb-2 rounded-3xl overflow-hidden`, bg `rgba(8,8,10,0.95)`, `backdropFilter: blur(40px)`, border `rgba(255,255,255,0.06)`, `boxShadow: 0 40px 80px -20px rgba(0,0,0,0.8)`. Status row: pulsing 1.5×1.5 Volt dot + `"SISTEMA TÁCTICO ACTIVO"` (9px, tracking 0.2em, `#52525b`).

**Protein-deficit alert** (renders when `proPct < 0.5 && target > 0`): `mx-4 mt-3 px-3 py-2 rounded-xl`, bg `rgba(239,68,68,0.08)`, border `rgba(239,68,68,0.3)`, text `"COMBUSTIBLE CRÍTICO: PROTEÍNA REQUERIDA"` (9px, tracking 0.18em, `#f87171`).

**Ring geometry** — 190×190 rendered, `viewBox="0 0 240 240"`, `rotate(-90deg)`, `overflow: visible`; each metric = track circle (`rgba(255,255,255,0.05)`) + progress circle (`strokeLinecap="round"`, `strokeDasharray = circumference`, `strokeDashoffset = circ × (1 − pct)`, transition `stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)`):

| Ring | r | circumference | strokeWidth | Color | Glow filter |
|---|---|---|---|---|---|
| Calories | 100 | 628.3 | 12 | `#CEFF00` | `#vg` = feGaussianBlur stdDeviation 4 + merge |
| Protein | 75 | 471.2 | 8 | `#00F0FF` | `#cg` = feGaussianBlur stdDeviation 3 + merge |
| Carbs | 60 | 377.0 | 8 | `#acd600` | none |
| Fat | 45 | 282.7 | 8 | `#c8c6c5` | none |

Pct math: `calPct = min(consumed/target, 1)` per metric (0 when target is 0). Center stack: `"TOTAL KCAL"` (8px, `#52525b`) / consumed `DS 900 italic clamp(24px,8vw,32px) #fff letterSpacing -0.04em` / `"/ {target}"` (9px, `rgba(206,255,0,0.7)`).

Right column — three macro rows, each `pl-3` with `borderLeft: 4px solid {color}`: label 8px `#52525b`; value `16px bold #e4e4e7` + `/{target}g` in the macro color; right-aligned `{pct}%` 14px black in the macro color. Colors: PROTEÍNA `#00F0FF`, CARBOHIDRATOS `#acd600`, GRASAS `#c8c6c5`.

(The compact sibling `CalorieRing` — r=44 in a 100 viewBox at 108px, stroke 5.5 `#34d399`, + 3 `MacroBar`s at `#34d399/#60a5fa/#fb923c` with 3px tracks — is documented in `MYCOACH_GLOBAL_MASTER_SPEC.md` §3.2.5.)

---

# 2. THE WATER & HYDRATION LOGIC SPECIFICATION

## 2.1 State engine (lines 398, 7494–7519) — the hard-cap rules

```ts
const WATER_TARGET_ML = 3000;                                  // module-scope constant (line 398)

// Date-anchored shared state — resets at midnight of a new calendar day
const todayISO = new Date().toISOString().split("T")[0];
const [waterMl, setWaterMl] = useState<number>(() => {
  // hydrate from localStorage "mc:water_ml" = { ml, date } — ONLY if date === today, else 0
});
useEffect(() => { localStorage.setItem("mc:water_ml", JSON.stringify({ ml: waterMl, date: todayISO })); }, [waterMl, todayISO]);

const addWater = () => {
  setWaterMl(w => Math.min(w + 250, WATER_TARGET_ML));         // ← THE HARD CAP: clamp at 3000
  fetch("/api/student/water", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amountMl: 250, date: todayISO }) }).catch(() => {});
};
```

The complete boundary behavior, exhaustively:
1. **Increment quantum is fixed at 250 ml** — there is no other amount anywhere in the UI.
2. **Client clamp:** `Math.min(w + 250, 3000)` — state can never exceed 3000.
3. **UI freeze at the cap:** every `+ 250ML` button carries `disabled={waterMl >= waterTarget}` and the Tailwind `disabled:opacity-30` — at 3.0 L the button dims to 30% opacity and becomes inert.
4. **Cap transform:** a confirmation glyph mounts inside the disabled button — Hoy variant appends `<span style="fontSize:10; color:#CEFF00">✓</span>`; Workout variant appends `✓ Meta alcanzada` (`ml-2 text-[10px] font-normal normal-case tracking-normal`, non-italic override).
5. **Fire-and-forget server sync:** each tap POSTs `{ amountMl: 250, date }` to `/api/student/water` (`prisma.waterLog.create`); errors are swallowed — the localStorage value is the session's optimistic truth. Note: the server itself has **no cap** — rows accumulate; only the client clamps.
6. **Midnight reset:** `waterMl` re-hydrates to 0 when the stored date ≠ today (the localStorage guard), independent of the 60-second midnight poll.
7. **Derived:** `waterPct = Math.min(waterMl / WATER_TARGET_ML, 1)` (MealSheet) or the unclamped `waterMl / waterTarget` (workout ring — safe because state is pre-clamped).

## 2.2 Hoy-tab HIDRATACIÓN section (lines 2819–2847) — the 10-segment Volt bar

```jsx
<div class="mt-5 rounded-3xl p-5" style="background:#1A1A1A; border:1px solid rgba(255,255,255,0.06)">
  {/* header */}
  <Droplet size=14 strokeWidth=1.5 color=#00F0FF />
  <span style="DS 900 · 14px · uppercase · letterSpacing 0.14em · #fff">HIDRATACIÓN</span>

  {/* 10 responsive fill cells — one per 250 ml, gap-2, equal flex width, 36px tall */}
  <div class="flex gap-2 mb-4">
    {Array.from({length:10}).map((_, idx) => {
      const filled = waterMl >= (idx + 1) * 250;
      return <div class="flex-1 h-9 rounded-xl overflow-hidden transition-all duration-300"
        style="background: filled ? #CEFF00 : rgba(255,255,255,0.04);
               border: 1px solid (filled ? #CEFF00 : rgba(255,255,255,0.06));
               boxShadow: filled ? 0 0 6px rgba(206,255,0,0.25) : none" />;
    })}
  </div>

  {/* footer: litres readout + button */}
  <p style="DS 900 · 20px · #fff">{(waterMl/1000).toFixed(1)}<span style="13px · #808080 · ml:4px">/ 3.0 L</span></p>
  <button disabled={waterMl >= waterTarget}
    class="flex items-center gap-2 px-4 py-2.5 rounded-2xl cursor-pointer active:scale-95 transition-all disabled:opacity-30"
    style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
           DS 900 · 13px · uppercase · letterSpacing 0.08em · #fff">
    <Droplet size=12 strokeWidth=2 color=#00F0FF /> + 250ML
    {waterMl >= waterTarget && <span style="fontSize:10; color:#CEFF00">✓</span>}
  </button>
</div>
```
Cell semantics: cell *idx* lights when cumulative intake reaches `(idx+1)×250` ml — 10 cells × 250 ml = the 2.5 L visual scale of this variant (readout still `/ 3.0 L`). Fill state = **solid `#CEFF00`** with matching border and a `0 0 6px rgba(206,255,0,0.25)` glow; empty = 4% white with 6% border. `transition-all duration-300` animates each cell's flip. No hover states are defined (touch-first); the only pressed affordance is `active:scale-95` on the button.

## 2.3 Workout-tab "HIDRATACIÓN TÁCTICA" (lines 4232–4278) — ring + 12 cyan vials

Container: `mx-4 mt-5 rounded-3xl p-5`, bg `#1A1A1A`, border `rgba(255,255,255,0.07)`, `boxShadow: 0 24px 48px -12px rgba(0,0,0,0.8)`.

- **Readout:** label `"HIDRATACIÓN TÁCTICA"` (9px, tracking 0.2em, white); litres `text-[22px] font-black tabular-nums #00F0FF` with `/ 3.0 L` suffix at `rgba(0,240,255,0.5)` 13px.
- **Progress ring:** 88×88 rendered, `viewBox="0 0 96 96"`, `rotate(-90deg)`; `waterR = 40`, `waterCirc = 2π×40 = 251.3`; track stroke `rgba(0,240,255,0.06)` width 6; progress stroke `#00F0FF` width 6, `strokeLinecap round`, `strokeDashoffset = (circ × (1 − waterPct))`, `filter: drop-shadow(0 0 6px rgba(0,240,255,0.6))`, transition `stroke-dashoffset 0.6s cubic-bezier(0.4,0,0.2,1)`. Center: `Droplet` 13/1.5 cyan + `{round(waterPct×100)}%` (11px black cyan).
- **12 vial cells** (`overflow-x-auto pb-1` row): each `w-9 h-14 rounded-xl flex items-end justify-center shrink-0 transition-all duration-300`; empty = bg `rgba(255,255,255,0.03)` border `rgba(255,255,255,0.05)`; filled = bg `rgba(0,240,255,0.1)` border `rgba(0,240,255,0.28)` **plus an inner liquid div**: `height: 75%`, `background: linear-gradient(to top, rgba(0,240,255,0.5), rgba(0,240,255,0.12))`, `borderRadius: 0 0 10px 10px`, `transition-all duration-500`. Fill rule identical: `waterMl >= (idx+1)*250` — 12 × 250 = the full 3.0 L.
- **Button:** `w-full py-3.5 rounded-2xl … disabled:opacity-30`, bg `rgba(0,240,255,0.08)`, border `rgba(0,240,255,0.25)`, text cyan `DS italic 900 13px tracking 0.1em` — `+ 250ML`, cap suffix `✓ Meta alcanzada`.

## 2.4 MealSheet hydration widgets (lines 1099–1120)
Stat tile: `flex-1 rounded-2xl p-4` `#1A1A1A` (border `rgba(255,255,255,0.02)`), `Droplet` 18 cyan, value `{waterMl}ml` (`DS 900 · 22px · #fff`), label `HIDRATACIÓN` (8px, tracking 0.18em, `#808080`). Below: a slim track `w-full h-1.5 rounded-full` bg `rgba(255,255,255,0.06)` with fill `width: max(waterPct×100, 2)%`, solid `#CEFF00`, glow `0 0 8px rgba(206,255,0,0.4)`, `transition-all duration-500`.

---

# 3. ITEMIZATION OVERLAY & THE MATHEMATICAL CONVERSION ENGINE

## 3.1 The MealSheet — "CONFIRMAR COMIDA" overlay (lines 890–1219)

Opened by tapping any pending bento card (`onMealOpen(m)` → `activeMeal` state → rendered inside `BottomSheet`).

### 3.1.1 BottomSheet host structure (lines 487–527)
```
fixed inset-0 z-[60] flex flex-col justify-end
├── scrim: absolute inset-0 bg-black/75 backdrop-blur-sm · animation bsFadeIn 0.2s ease · onClick=close
└── panel: relative rounded-t-3xl overflow-y-auto
    background:#0d0d0d · border:1px solid rgba(255,255,255,0.06) · borderBottom:none
    maxHeight:90vh · animation: bsSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)
    paddingBottom: env(safe-area-inset-bottom,0px)
    ├── sticky handle row (top-0, bg #0d0d0d): w-9 h-[3px] rounded-full · rgba(255,255,255,0.12)
    ├── close: absolute top-3.5 right-4 · w-8 h-8 rounded-full · rgba(255,255,255,0.07) · X 13px @45% white
    └── content: px-5 pb-10
@keyframes bsFadeIn  { from{opacity:0} to{opacity:1} }
@keyframes bsSlideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
@keyframes fadeSlideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
```

### 3.1.2 Ingredient synthesis fallback (lines 892–906)
When a meal has no explicit `ingredients[]`, the sheet **fabricates** them from `items[]` deterministically by index:
```ts
grams:    [250, 180, 120, 200, 150][i % 5]
calories: round(meal.calories / items.length)
icon:     ["egg", "wheat", "beef", "salad", "chicken"][i % 5]
unitQty:  [1, 2, 1.5, 1, 1][i % 5]
unit:     ["pieza", "piezas", "tazas", "porción", "porción"][i % 5]
macros:   { protein: round(mealP/items.length), carbs: round(mealC/items.length), fat: round(mealF/items.length) }
```
Meal-level macro fallback when absent: `macros = meal.macros ?? { protein: 32, carbs: 48, fat: 14 }`.

### 3.1.3 Hero (lines 937–981)
`relative -mx-5 mb-6` full-bleed, minHeight 260; food photo `object-cover` at **opacity 0.48**; mask `linear-gradient(to top, #070708 0%, rgba(7,7,8,0.2) 60%, transparent 100%)`; content `px-5 pt-10 pb-6 justify-end`: eyebrow `"ELITE NUTRITION"` (9px DS 900, tracking 0.24em, `#CEFF00`); title `DS 900 italic clamp(32px,9.5vw,44px) lineHeight 0.9 letterSpacing 0.03em`; macro pill row `H_MACROS = [{PROT · #00F0FF}, {CARBS · #808080}, {GRASA · #808080}]` — each `px-3 py-2 rounded-2xl`, bg `rgba(20,20,20,0.86)`, `blur(16px)`, border `rgba(255,255,255,0.06)`, label 9px tracking 0.12em in its color + value 15px white. Section header row: `"COMPONENTES DE LA COMIDA"` (`clamp(14px,4.2vw,17px)`) + `"BETA v2.4"` chip (9px, `#CEFF00`).

### 3.1.4 Ingredient Row Compositing — the template-exact card (lines 1014–1061)
```jsx
<div class="w-full bg-[#1A1A1A] rounded-[20px] p-4 flex items-center justify-between mb-3 border relative overflow-hidden"
     style="borderColor: isSub ? #CEFF00 : rgba(255,255,255,0.02);
            boxShadow:  isSub ? 0 0 22px rgba(206,255,0,0.09) : none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease">
  {isSub && <div class="absolute top-2.5 right-3 z-10 px-2 py-[3px] rounded-md" style="background:#CEFF00">
    <span style="DS 900 · 7px · letterSpacing 0.18em · uppercase · #000">SUSTITUYENDO</span></div>}
  <!-- LEFT: 56×56 icon slot + text stack -->
  <div class="flex items-center gap-4">
    <div class="w-14 h-14 rounded-xl overflow-hidden bg-zinc-900 border border-white/[0.06] flex-shrink-0">
      <img src={getIngrImg(icon)} class="w-full h-full object-cover" /></div>
    <div class="flex flex-col">
      <span class="text-[10px] text-[#808080] font-mono tracking-widest uppercase">{subLabel}</span>
      <span class="text-xl font-bold text-white uppercase tracking-tight"
            style="fontFamily:DS; paddingTop: isSub ? 14 : 0">{DISPLAY NAME}</span>
    </div>
  </div>
  <!-- RIGHT: massive weight + kebab -->
  <div class="flex items-center gap-3">
    <span class="text-3xl font-black text-white tracking-tight" style="fontFamily:DS">{amountDisplay}</span>  ← e.g. "150g"
    <div class="text-[#808080] p-1 opacity-40 hover:opacity-100">⋮⋮ (6-dot 16×16 SVG grid)</div>
  </div>
</div>
```
`subLabel` grammar: normal row → `"PROT {p}G · CARB {c}G"` (per-ingredient macros); substituted row → `"BASE PROTEIN"` or `"BASE CARB"`. Substituted grams: `round(ingProt × gramsPerProtein)` or `round(ingCarb × gramsPerCarb ?? 3.3)`; name renders uppercase from the substitute.

**Inter-row Volt swap button** (rendered between consecutive rows, `-mt-1.5` overlapping): 36×36 round; idle = solid `#CEFF00` bg + `2px solid #070708` ring + `ArrowLeftRight` 14/2.5 black; open (`swapDrawerIdx === i`) = `rgba(206,255,0,0.14)` bg + `2px solid #CEFF00` + Volt icon; constant glow `0 0 16px rgba(206,255,0,0.32), 0 2px 8px rgba(0,0,0,0.5)`; `active:scale-90`.

### 3.1.5 Stats row + CONFIRMAR COMIDA CTA (lines 1085–1139)
Two `flex-1 rounded-2xl p-4` `#1A1A1A` tiles: `Flame` 18 Volt + `{calories}` (`DS 900 22px`) / `"KCAL TOTAL"`; `Droplet` 18 cyan + `{waterMl}ml` / `"HIDRATACIÓN"`. Then the hydration mini-track (§2.4). CTA — one-way latch (`confirmed` state, cannot un-confirm from the sheet):
```
w-full py-5 rounded-2xl flex items-center justify-center gap-3 active:scale-[0.98]
DS 900 · clamp(15px,4.5vw,18px) · letterSpacing 0.14em · uppercase
UNCONFIRMED: background #CEFF00 · color #000 · boxShadow 0 0 32px rgba(206,255,0,0.25) · icon CheckCircle2 18/2.5 · "CONFIRMAR COMIDA"
CONFIRMED:   background rgba(206,255,0,0.1) · color #CEFF00 · border 1px rgba(206,255,0,0.3) · no shadow · icon Check 18/3 · "COMIDA CONFIRMADA"
```
`onConfirm` → `handleSheetConfirm()` (§4.1) which checks the meal and fires the celebration chain.

### 3.1.6 The Swap Drawer portal (lines 1142–1216)
Rendered via `createPortal(document.body)` **above** the meal sheet:
- Scrim: `fixed inset-0 z-[70] bg-black/60`, `backdropFilter: blur(4px)`, `bsFadeIn 0.2s`.
- Sheet: `fixed bottom-0 left-0 right-0 z-[80] w-full overflow-y-auto`; bg `rgba(7,7,8,0.98)`; `borderTop: 1px solid rgba(255,255,255,0.08)`; `backdropFilter: blur(24px)`; `borderRadius: 32px 32px 0 0`; `maxHeight: 85vh`; `bsSlideUp 0.3s cubic-bezier(0.32,0.72,0,1)`; `paddingBottom: calc(24px + env(safe-area-inset-bottom,0px))`; 36×3 grab handle at 12% white.
- Header: `"SUSTITUCIÓN"` (`DS 900 clamp(16px,5vw,20px)`) over `"MOTOR DE CONVERSIÓN AUTOMÁTICA"` (10px MONO, `#808080`); 36px round close.
- Target pill: 44×44 icon + `"{PROTEÍNA|CARBOHIDRATO} — BUSCANDO ALTERNATIVAS"` (9px MONO) + ingredient name (15px DS bold).
- Body: `<EquivCatalog>` with the locked `macroType`.

## 3.2 Macro-class lock inference — `lockedMacroType(idx)` (lines 911–925, full lists)

Resolution order:
1. **Icon whitelist:** `PROTEIN_ICONS = {egg, chicken, beef, tuna, fish, milk}`; `CARB_ICONS = {oats, wheat, rice, sweet-potato, potato, tortilla, bread, banana, salad, corn}`.
2. **Name keywords** (name lowercased + NFD accent-stripped): `PROTEIN_KEYS = [huevo, pollo, pechuga, carne, atun, salmon, cerdo, res, pescado, proteina, clara, albumina]`; `CARB_KEYS = [avena, arroz, camote, papa, platano, tortilla, pan, maiz, yam, pasta, quinoa, frijol, lenteja]`.
3. **Macro comparison fallback:** `p = ing.macros?.protein ?? round(mealP / nIngredients)`; `c = ing.macros?.carbs ?? …`; → `p >= c ? "protein" : "carb"`.

## 3.3 The Substitution Algorithm & Delta Calculators (lines 674–713 — exact formulas)

**Base macro estimation** (when the ingredient lacks explicit macros — the fallback estimation behaviors):
```ts
baseCarbs   = ing.macros?.carbs   ?? Math.round(ing.calories * 0.45 / 4);   // 45% of kcal as carbs @ 4 kcal/g
baseProtein = ing.macros?.protein ?? Math.round(ing.calories * 0.25 / 4);   // 25% of kcal as protein @ 4 kcal/g
baseFat     = ing.macros?.fat     ?? Math.round(ing.calories * 0.30 / 9);   // 30% of kcal as fat @ 9 kcal/g
```
(`IngredientRow`'s inline variant uses `0.5` for carbs instead of `0.45` — a documented internal inconsistency.)

**Gram conversion — the dominant-macro lock:**
```ts
calcGrams(eq) = eq.macroType === "protein"
  ? Math.round(baseProtein * (eq.gramsPerProtein ?? 5))
  : Math.round(baseCarbs   * (eq.gramsPerCarb   ?? 3.3));
```

**"DIFERENCIA CALÓRICA" (calorie offset):**
```ts
calcCalOffset(eq) = eq.calsPer100g
  ? Math.round(calcGrams(eq) * eq.calsPer100g / 100) - ingredient.calories
  : null;
```

**"VARIANZA DE GRASA" (fat delta, 1-decimal):**
```ts
calcFatDelta(eq) = eq.fatPer100g
  ? Math.round(((calcGrams(eq) * eq.fatPer100g / 100) - baseFat) * 10) / 10
  : null;
```

**Match percentage & label:**
```ts
calcMatchPct(eq): target   = macroType === "protein" ? baseProtein : baseCarbs;
                  divisor  = gramsPerProtein ?? 5 | gramsPerCarb ?? 3.3;
                  delivered = Math.round(calcGrams(eq) / divisor);
                  return Math.min(100, Math.round(delivered / Math.max(target,1) * 100));
matchLabel(pct) = pct >= 98 ? "COINCIDENCIA PERFECTA 100%"
                : pct >= 90 ? `COINCIDENCIA ALTA ${pct}%`
                : `COINCIDENCIA PARCIAL ${pct}%`;
```

**The full equivalence catalog** (module constants `EQUIV_PROTEIN` + `EQUIV_CARBS`, all rows):

| Name | ratio (g per g macro) | kcal/100g | fat/100g | note |
|---|---|---|---|---|
| Pechuga de Pollo | gramsPerProtein 4.5 | 165 | 3.6 | Proteína magra #1 |
| Carne magra | 5.0 | 250 | 12.0 | Rica en zinc y B12 |
| Atún en agua | 4.0 | 116 | 0.5 | Omega-3 y bajo en grasa |
| Salmón | 5.3 | 208 | 13.0 | Grasa saludable omega-3 |
| Huevo entero | 8.0 | 155 | 11.0 | Proteína completa |
| Leche descremada | 10.0 | 34 | 0.1 | Calcio + proteína |
| Lomo de Cerdo | 4.8 | 242 | 14.0 | Alto en B1 y zinc |
| Arroz blanco | gramsPerCarb 3.3 | 130 | 0.3 | Digestión rápida, post-entreno |
| Avena | 5.3 | 389 | 6.9 | Alta en beta-glucanos |
| Camote | 5.8 | 86 | 0.1 | Alto en potasio y vitamina A |
| Papa cocida | 6.25 | 77 | 0.1 | Versátil y saciante |
| Tortilla de maíz | 4.0 | 218 | 4.0 | 2 tortillas pequeñas por porción |
| Pan integral | 4.35 | 247 | 3.5 | 100% integral preferible |
| Plátano | 4.35 | 89 | 0.3 | Ideal pre-entreno |

(The server's authoritative copy is the self-seeded 13-row `FoodSubstitute` table — same ratios, minus Lomo de Cerdo.)

## 3.4 EquivCatalog UI (lines 674–884)

- **Header:** `"CONVERSIÓN AUTOMÁTICA"` (9px DS 900 tracking 0.2em Volt) + live match badge (`px-2 py-[3px] rounded-md`, ≥98% → solid `#CEFF00`/black text, else 8% white/`#808080`); RESET button (RefreshCw 9px, 38–40% white) clears selection.
- **Comparison block** (when selected): `flex items-center gap-3 px-4 py-3 rounded-2xl`, 3% white bg — ORIGINAL column (label 8px `#808080`, grams 18px DS 900 white, name 9px 35% white) ↔ `ArrowLeftRight` 14 Volt ↔ SUSTITUTO column (all Volt).
- **Locked filter chip:** `px-3 py-1.5 rounded-lg`, bg `rgba(206,255,0,0.08)`, border `rgba(206,255,0,0.18)`, `Zap` 9 filled Volt, `"PROTEÍNA — FILTRO ACTIVO"` / `"CARBOHIDRATO — FILTRO ACTIVO"` (9px, tracking 0.16em).
- **Horizontal carousel** (`flex overflow-x-auto gap-4 pb-4 -mx-1 px-1`, scrollbars hidden): each candidate = `w-[160px] bg-[#1A1A1A] rounded-2xl p-4 flex-shrink-0 border … active:scale-95 transition-all duration-200`, minHeight 160; borderColor active `#CEFF00` (+ `0 0 18px rgba(206,255,0,0.14)` glow) else `rgba(255,255,255,0.04)`; active check = 20px solid-Volt disc top-right (Check 10/3 black); 56×56 `rounded-xl` photo tile (Unsplash photo w/ `onError` hide → `FoodIllu` SVG fallback); name `DS bold clamp(12px,3.5vw,14px)`; macro metric `{round(grams/divisor)}g Prot|Carb` (11px, `#00F0FF`); kcal offset chip (9px, `≤0 → #CEFF00`, `>0 → rgba(255,100,100,0.85)`, signed `+`); active adds the match label line (8px, ≥98 Volt else `#808080`).
- **Telemetry grid** (`grid grid-cols-2 gap-3`): two `rounded-2xl p-3.5` tiles at 3% white — `DIFERENCIA CALÓRICA` (label 10px MONO `#808080`; value 22px DS 900, `≤0 → #CEFF00`, `>0 → rgba(255,100,100,0.9)`; suffix `KCAL`) and `VARIANZA DE GRASA` (same, positive color `rgba(255,180,60,0.9)`; suffix `GRAMOS`). Both animate in with `fadeSlideIn 0.18s ease`.
- **CTA:** `bg-[#CEFF00] text-black font-black uppercase py-4 rounded-xl tracking-wider w-full … active:scale-[0.98]`, `clamp(14px,4vw,16px)`, letterSpacing 0.14em, `boxShadow: 0 0 28px rgba(206,255,0,0.22)` — `"CONFIRMAR SUSTITUCIÓN ⚡"` → closes the drawer, keeping the swap in `swaps[idx]`.
- **Swap state is client-only:** `swaps: Record<number, Equivalent|null>` lives in `MealSheet` React state — substitutions are **not persisted** to the server; they re-render the row (Volt border, SUSTITUYENDO badge, recomputed grams) for the session only.

---

# 4. THE 100% COMPLIANCE CELEBRATION PROTOCOLS

## 4.1 Trigger chain — exact state evaluation (lines 7903–7919, 8203–8257)

Two entry points converge on one chain:

**A. Card check** — `handleToggleMeal(i)`:
```ts
const snapshotDay = activeDayIndex;                       // day snapshot for in-flight rollback safety
const isAdding = !(nutritionHistory[snapshotDay] ?? new Set()).has(i);
setNutritionHistory(prev => {
  const daySet = new Set(prev[snapshotDay] ?? []);
  isAdding ? daySet.add(i) : daySet.delete(i);
  if (isAdding) triggerMealChain(meals[i]?.macros ?? {protein:32,carbs:48,fat:14}, daySet.size, meals.length);
  return { ...prev, [snapshotDay]: daySet };
});
// optimistic server sync — POST /api/me/checks { date: realDateForDayIndex(snapshotDay),
//   kind:"meal", itemKey: String(i), done: isAdding }  → .catch() rolls the exact day back
```
⚠ Contract note: the portal sends **`itemKey: String(mealIndex)`** (e.g. `"0"`, `"1"`), not the meal name.

**B. Sheet confirm** — `handleSheetConfirm()`: resolves `idx` by `name+time`, no-ops if already checked, otherwise identical add + chain + POST(+rollback).

**The chain itself:**
```ts
const triggerMealChain = (macros, nextCheckedCount, totalMeals) => {
  setMealToast(macros);                                   // 1. deploy toast immediately
  mealToastRef.current = setTimeout(() => {
    setMealToast(null);                                   // 2. toast lives exactly 2000 ms
    if (nextCheckedCount >= totalMeals && totalMeals > 0) // 3. THE 100% GATE
      setDietComplete(true);                              // 4. full-screen takeover mounts
  }, 2000);
};
```
So the full-screen celebration fires **only when the just-added check makes `checkedCount === totalMeals`**, and only **after** the 2-second toast completes. Un-checking never fires anything. Independently, the header's `isDayPerfect = meals.length > 0 && checkedMeals.size === meals.length` (line 2572) drives the persistent header transform — it reverts live if a meal is unchecked.

## 4.2 The `isDayPerfect` header transform (lines 2630–2682)
Container gains ` scale-[1.02] shadow-[0_0_30px_rgba(206,255,0,0.15)]` + `borderColor: rgba(206,255,0,0.4)` (transition `duration-500 ease-out`), and mounts the chip:
```
animate-mc-hud-scan inline-flex items-center gap-1 font-mono font-black uppercase rounded-sm px-2.5 py-1
background:#CEFF00 · color:#000 · fontSize:8 · letterSpacing:0.1em · boxShadow: 0 0 18px rgba(206,255,0,0.5)
⚡ DÍA PERFECTO COMPLETE
```

## 4.3 MealToast — "MISIÓN CUMPLIDA" (lines 2231–2260)
Portal at `position:fixed; top:20; z-index:9999`, centered, `pointerEvents:none` wrapper. Card: bg `#1A1A1A`, border 8% white, `boxShadow: 0 25px 50px -12px rgba(0,0,0,0.9)`, `padding 14px 16px`, `borderRadius 20px`, maxWidth 380 / `calc(100vw - 32px)`, `animation: mc-toast-lifecycle 2s cubic-bezier(0.16,1,0.3,1) forwards`. Left: a 46×46 **hexagon** — SVG `polygon points="23,2 42,12 42,34 23,44 4,34 4,12" fill="#CEFF00"` with `drop-shadow(0 0 8px rgba(206,255,0,0.5))`, `CheckCircle2` 20/3 black centered. Right: `"MISIÓN CUMPLIDA"` (DS 900 17px), `"COMIDA REGISTRADA"` (MONO 8.5px tracking 0.18em Volt), macro line `P: {p}g | C: {c}g | G: {f}g` (MONO 8px 40% white) + chip `100% OK` (MONO 7.5px Volt, `rgba(206,255,0,0.1)` bg, `rgba(206,255,0,0.25)` border, radius 6, `1px 7px`).

## 4.4 DietCompleteModal — the "OBJETIVO DIARIO ALCANZADO" screen (lines 2262–2337, every property)

Full-screen portal: `position:fixed; inset:0; background:#070708; zIndex:9998; overflowY:auto`; column flex `justify-content:space-between; align-items:center; text-align:center; padding:32px 20px 48px`.

**Header** (maxWidth 420): flanked divider — two 1px lines `linear-gradient(to right|left, transparent, #CEFF00)` around `"PROTOCOLO DIARIO"` (MONO 8.5px, tracking 0.22em, Volt); then the title:
```
h1 · fontFamily DS · fontWeight 900 · fontStyle italic · fontSize clamp(28px,8vw,40px)
uppercase · letterSpacing 0.02em · color #fff · lineHeight 1 · marginBottom 8px
"OBJETIVO DIARIO<br/>ALCANZADO"
```

**The central 100% loop reactor** — exact geometry:
```
wrapper: 200×200, margin 8px auto
svg: width/height 200 · viewBox "0 0 200 200" · transform rotate(-90deg)
defs: <linearGradient id="dcGaugeGrad" x1=0% y1=0% x2=100% y2=0%>
        <stop 0%  #00F0FF /> <stop 100% #CEFF00 />
track:    <circle cx=100 cy=100 r=80 stroke rgba(255,255,255,0.05) strokeWidth=10 />
progress: <circle cx=100 cy=100 r=80 stroke url(#dcGaugeGrad) strokeWidth=10
           strokeLinecap="round" strokeDasharray="{CIRC} 0"          ← R=80, CIRC=2π·80=502.65 — full lap, zero gap
           filter: drop-shadow(0 0 8px rgba(206,255,0,0.6)) />       ← the neon glow layer
center stack: "100%" (DS 900 italic 44px #fff) ·
              "STATUS: ELITE" (MONO 7px tracking 0.18em #CEFF00) ·
              "PREMIUM SYNCHRONIZED" (MONO 6.5px tracking 0.14em 30% white)
```
Note: dasharray is statically `${CIRC} 0` — the ring mounts already complete (no sweep animation on this screen; the sweep affordance lives in the MacroSummaryCard's 0.9 s dashoffset transitions).

**Summary paragraph:** DS 15px, 55% white, maxWidth 320, lineHeight 1.5 — "Has cumplido con tu protocolo nutricional al 100%. / Recuperación optimizada."

**Three telemetry rings** (flex gap 20px): each a 60×60 circle `border: 2px solid {color}` + `boxShadow: 0 0 12px {color}44`, content 18px DS 900 in-color; ring 1 `{(totalCals/1000).toFixed(1)}k / KCAL / #CEFF00`; ring 2 `{protein}g / PROT / #00F0FF`; ring 3 `CheckCircle2 24 / OK / #4ade80`; labels MONO 7.5px tracking 0.15em 35% white.

**Footer** (maxWidth 420): motto `DS 900 italic clamp(14px,4vw,18px) uppercase letterSpacing 0.04em #CEFF00 lineHeight 1.3` with `textShadow: 0 0 20px rgba(206,255,0,0.4)` — "TU CONSISTENCIA ES TU SUPERPODER. / MANTENTE EN LA MISIÓN." Close button: `rgba(255,255,255,0.06)` bg, 10% white border, radius 16, `padding 14px 28px`, DS 900 14px tracking 0.12em white, `X` 14 icon — `"CONTINUAR"` → `setDietComplete(false)` (state-only; checks persist).

## 4.5 Related protocol — the workout twin
The workout celebration (`WorkoutCompleteModal`, trigger `doneEx.size >= totalEx` → FINALIZAR) is specified exhaustively in `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md` §3; its toast twin `WorkoutToast` ("MÓDULO COMPLETADO / SERIE REGISTRADA CORRECTAMENTE", cyan-bordered `rgba(0,15,20,0.96)` glass) shares the same `mc-toast-lifecycle 2s` animation.

---

*End of blueprint. This document + `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md` + `MYCOACH_GLOBAL_MASTER_SPEC.md` together form the complete design & business source of truth for a pixel-perfect mobile rebuild.*
