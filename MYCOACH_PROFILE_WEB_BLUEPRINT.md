# MYCOACH — USER PROFILE & MISSION LOGS WEB BLUEPRINT
## Ground-Truth Extraction of the Perfil Ecosystem for the Mobile Rebuild

**Source repo:** `/Users/alatorre/Desktop/images/mycouch` (web), branch `nuevoultimo`.
**Primary source:** `src/app/portal/page.tsx` — `TabPerfil` (lines 4742–5413), `HRSparkline` (4705–4737), `CancelSubscriptionSheet` + `CANCEL_REASONS` (4595–4703), `BottomNav` (7399–7448), `GlobalHeader` (7454–7478), root wiring (8447–8458, 8482). Server side: `GET /api/student/workout-session/history`, `GET /api/me`, `POST /api/subscription/cancel`, `PATCH /api/me/wallet`, NextAuth `signOut`.
**Method:** all types, formulas, class strings, and copy below are verbatim from live code; simulated/hardcoded pieces are flagged. Networking is plain `fetch()` — no TRPC/React Query/Axios.
**Folder companions:** `MYCOACH_SALAS_WEB_BLUEPRINT.md`, `MYCOACH_STATS_WEB_BLUEPRINT.md`. Web-repo companions: `MYCOACH_GLOBAL_MASTER_SPEC.md`, `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md`, `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md`.

---

## ⚠ 0. SERVER-VS-SIMULATED TRUTH TABLE (read first)

| Module | Real? | Source |
|---|---|---|
| Streak headline (`{n} DÍAS`) | ✅ REAL (but manually maintained) | `student.streak` from `GET /api/me` — no server-side auto-increment exists anywhere |
| 7-day streak matrix (D1–D7 checkers) | ✅ REAL (local-week truth) | `nutritionHistory`/`workoutHistory` — localStorage-persisted daily Sets, flushed at midnight |
| Rank card (ATLETA/GUERRERO/BESTIA/LEYENDA) | ✅ DERIVED | pure function of `student.streak` |
| JERARQUÍA drawer 6-tier ladder | ❌ HARDCODED | inline array; only level 1 is ever `active: true` regardless of the user's actual rank (see §5.2) |
| BILLETERA TÁCTICA balance | ✅ REAL | root `walletBalance` (hydrated from `/api/me`, mutated via `PATCH /api/me/wallet`) |
| RÉCORDS PERSONALES grid | ✅ REAL | root `prs` (from `/api/me`, written via `PATCH /api/me/prs`) |
| ARCHIVO DE MISIONES // BITÁCORA TÁCTICA | ✅ REAL | `GET /api/student/workout-session/history` (Postgres `WorkoutSession` + `WorkoutBiometrics`) |
| HR sparkline | ✅ REAL when wearable data exists | `biometrics.heartRateSeries` |
| MURO DE HONOR — Correo / Suscripción rows | ✅ REAL | `student.email` / `student.paymentStatus` + stage-derived plan label |
| AJUSTES (Preferencias) overlay | ❌ LOCAL THEATER | notification toggles are `useState` only — `GUARDAR CAMBIOS` persists nothing, EMAIL row shows the literal `"configurado en perfil"` |
| PROGRESO MENSUAL bar | ✅ DERIVED | `min(100, round(streak/30×100))` |
| Cancel subscription flow | ✅ REAL | `POST /api/subscription/cancel` (Stripe `cancel_at_period_end` + local `paymentStatus:"inactive"`) |
| Hero banner image | ❌ HARDCODED | fixed Unsplash `photo-1534438327276-14e5300c3a48` |

---

# 1. THE NAVIGATION FOOTER & SESSION DESTRUCTION

## 1.1 Current web layout tree (`BottomNav`, lines 7391–7448)

```ts
const TABS: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "today",     label: "Dieta",   icon: Utensils      },
  { id: "progress",  label: "Stats",   icon: TrendingUp    },
  { id: "squads",    label: "Workout", icon: Dumbbell      },   // ⚠ id "squads" = Workout tab
  { id: "community", label: "Salas",   icon: MessageSquare },
  { id: "profile",   label: "Perfil",  icon: User          },
];
```
Shell: `fixed bottom-4 left-4 right-4 z-50`, safe-area padded; pill container `rounded-full max-w-md h-70px`, `rgba(9,9,11,0.82)` + `blur(24px)`, border 4% white, `boxShadow 0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.02)`. Active tab = 56px (`w-14 h-14`) **solid `#CEFF00` circle** with black icon (22/2.5) and glow `0 0 16px rgba(206,255,0,0.28)`, no label; inactive tabs = icon 19/1.5 `#808080` + 9px DS-900 uppercase label.

**The SALIR appendix (lines 7437–7444):** after the 5 mapped tabs, `BottomNav` renders a **sixth, hardcoded button** — `LogOut` icon 19/1.5 `#808080` + label `Salir` (identical inactive-tab styling) — wired as `onSignOut` and invoked from the page root as:
```tsx
<BottomNav active={activeTab} onChange={setActiveTab} onSignOut={() => signOut({ callbackUrl: "/" })} />
```

## 1.2 Session destruction logic — all three triggers

| Trigger | Location | Exact call |
|---|---|---|
| `Salir` nav button | BottomNav 6th slot | `signOut({ callbackUrl: "/" })` |
| `↪ CERRAR SESIÓN` | bottom of TabPerfil's Bitácora section (line 5404) | `signOut({ callbackUrl: "/" })` |
| `Cerrar sesión` underline link | blocked/error boot screen (line 8179) | `signOut({ callbackUrl: "/" })` |

Mechanics: `signOut` is `next-auth/react`'s — it destroys the NextAuth session cookie server-side and hard-redirects to `/` (login). **No local state cleanup accompanies it**: `localStorage` keys (`mc:water_ml`, `mc:active_day`, `mc:nutrition_history`, `mc:workout_history`, `mc:session_*`) intentionally survive logout — that is what powers the workout freeze-on-logout/restore-as-PAUSED behavior (see workout blueprint §2.3.3). Mobile equivalent: clear the Bearer token + navigate to login, but **preserve** the local tracking caches to keep parity.

## 1.3 🛑 REFACTOR DIRECTIVE (per product instruction, for the mobile build)
The `SALIR` trigger must be **completely purged from the core tab navigation layout tree**. In the port:
1. Render **only the 5 mapped tabs** (Dieta · Stats · Workout · Salas · Perfil) — do not reproduce the hardcoded 6th button block (web lines 7437–7444), and drop the `onSignOut` prop from the nav component contract entirely.
2. The **canonical logout surface becomes TabPerfil's `↪ CERRAR SESIÓN`** button (already positioned as the absolute bottom of the profile scroll — ghost button: `w-full bg-transparent border border-zinc-900 hover:border-red-950 hover:bg-red-950/10 text-zinc-500 hover:text-red-400 py-3 text-xs font-mono font-black tracking-widest uppercase rounded-sm`).
3. Keep the blocked-screen logout link as the only other session-destruction path.

---

# 2. DATA SCHEMAS & VERIFICATION CONTRACTS

## 2.1 Component contract — `TabPerfil` props (verbatim)
```ts
function TabPerfil({ student, detail, onCancelRequest, nutritionHistory, workoutHistory,
  activeDayIndex, prs, walletBalance }: {
  student: Student;                               // needs: name, email, streak, stage, stageNumber, paymentStatus, avatarColor
  detail: Detail;
  onCancelRequest: () => void;                    // opens CancelSubscriptionSheet (root-owned)
  nutritionHistory: Record<number, Set<number>>;  // day 1–7 → checked meal indices (this ISO week, local)
  workoutHistory: Record<number, string[]>;       // day 1–7 → completed exercise names
  activeDayIndex: number;                         // 1=Mon…7=Sun — today ring in the matrix
  prs: { squat: number; deadlift: number; bench: number };
  walletBalance: number;
})
```

## 2.2 Streak & rank derivations (exact)
```ts
// Day-checker predicate (matrix cell "done"):
done    = (nutritionHistory[dayId]?.size ?? 0) > 0 || (workoutHistory[dayId]?.length ?? 0) > 0;
isToday = dayId === activeDayIndex;

// Rank ladder (profile card variant):
rankTitle = streak >= 60 ? "LEYENDA" : streak >= 30 ? "BESTIA" : streak >= 14 ? "GUERRERO" : "ATLETA";
rankSub   = streak >= 30 ? "ELITE"   : streak >= 14 ? "PRO"    : "NIVEL 1";

// Community variant (getRank, line 5420 — note the stage-based BERSERKER injection):
getRank(streak, stage) = streak>=60 ? "LEYENDA ELITE" : streak>=30 ? "BESTIA ELITE"
  : stage==="Volumen" ? "BERSERKER" : streak>=14 ? "GUERRERO PRO" : "ATLETA INIT";

// Plan label:
planLabel = stage==="Volumen" ? "Plan Berserker" : stage==="Definición" ? "Plan Shredder" : "Plan Performance";
// (⚠ the AJUSTES overlay's PLAN row uses a 2-branch variant: Volumen → "Plan Berserker", else "Plan Performance")

// Monthly progress:
monthPct = Math.min(100, Math.round((student.streak / 30) * 100));
```

## 2.3 The Rank-tier hierarchy contract (JERARQUÍA drawer inline array — the 6 Power Ranks)
```ts
{ level: 1, title: "ATLETA INIT",  sub: "NIVEL 1",      icon: "⬡", active: true,  desc: "RANGO ACTUAL",
  progress: "Estás a 150 XP o 3 entrenamientos perfectos de subir de nivel.",
  accentColor: "#CEFF00", borderColor: "rgba(206,255,0,0.4)" },
{ level: 2, title: "GUERRERO PRO", sub: "NIVEL 2",      icon: "◈", active: false, desc: "BLOQUEADO",
  progress: "Completa 14 días de racha continua." },
{ level: 3, title: "TITÁN",        sub: "NIVEL 3",      icon: "◆", active: false, desc: "BLOQUEADO",
  progress: "Alcanza 30 días de racha y 5 PRs." },
{ level: 4, title: "COMANDANTE",   sub: "NIVEL 4",      icon: "✦", active: false, desc: "BLOQUEADO",
  progress: "Mantén el 90% de asistencia por 2 meses." },
{ level: 5, title: "PREDADOR",     sub: "NIVEL 5",      icon: "⬢", active: false, desc: "BLOQUEADO",
  progress: "60 días de racha y liderazgo de equipo." },
{ level: 6, title: "BESTIA ÉLITE", sub: "NIVEL MÁXIMO", icon: "★", active: false, desc: "RANGO SUPREMO",
  progress: "Liderazgo de sala activo · Credenciales de equipo elite.",
  accentColor: "#CEFF00", borderColor: "rgba(206,255,0,0.2)", voltTheme: true },
// Locked tiers share: accentColor "rgba(255,255,255,0.25)", borderColor "rgba(255,255,255,0.06)"
```
**Shield style registry** (`RANK_SHIELD_CFG: Record<number, ShieldCfg>`, `ShieldCfg = { bg; border; shadow?; iconColor }`):
| Level | bg | border | shadow | iconColor |
|---|---|---|---|---|
| 1 | `rgba(120,53,15,0.25)` | `1.5px solid rgba(217,119,6,0.65)` | `0 0 15px rgba(217,119,6,0.2)` | `#d97706` |
| 2 | `rgba(24,24,27,0.5)` | `1px solid rgba(63,63,70,0.8)` | — | `#71717a` |
| 3 | `rgba(15,23,42,0.5)` | `1px solid rgba(100,116,139,0.5)` | `0 0 8px rgba(226,232,240,0.04)` | `#94a3b8` |
| 4 | `rgba(66,32,6,0.3)` | `1.5px solid rgba(234,179,8,0.5)` | `0 0 10px rgba(234,179,8,0.1)` | `#eab308` |
| 5 | `rgba(24,24,27,0.5)` | `1px solid rgba(63,63,70,0.7)` | — | `#71717a` |
| 6 | `rgba(26,46,5,0.5)` | `1.5px solid #a3e635` | `0 0 15px rgba(163,230,53,0.2)` | `#a3e635` |

## 2.4 Wallet contract
`walletBalance: number` — root state, hydrated once from `GET /api/me` (`d.student.walletBalance ?? 0`), mutated only through `PATCH /api/me/wallet { delta }` (optimistic credit/debit with rollback — full spec in the Salas blueprint §1.6; server blocks below-zero with `400 "Saldo insuficiente"`). Profile renders it read-only: `$ {walletBalance.toLocaleString()} USD` with the `ESCROW` trophy chip.

## 2.5 The Bitácora Táctica array contract (mission log)
**Fetch (mount, abortable):**
```ts
fetch("/api/student/workout-session/history", { signal: ctrl.signal })
  .then(r => (r.ok ? r.json() as Promise<BioSession[]> : Promise.resolve([])))
  .then(data => { setBioHistory(data); setBioLoading(false); })
  .catch(() => setBioLoading(false));
```
**Client type (verbatim):**
```ts
type BioSession = {
  id: string; name: string; date: string; completed: boolean;
  biometrics: {
    avgHeartRate: number | null; maxHeartRate: number | null;
    activeCalories: number | null; totalCalories: number | null;
    deviceSource: string | null;
    heartRateSeries: { t: string; bpm: number }[] | null;
  } | null;
};
```
**Server:** CLIENT+studentId (denial → **`403 []`**, an empty array by design so the list renders empty); `getWorkoutSessionsWithBiometrics(studentId, 50)` → `prisma.workoutSession.findMany({ where: { studentId }, orderBy: { date: "desc" }, take: 50, include: { biometrics: true } })`. The full DTO also carries `studentId/routineId/exerciseLogs/notes/createdAt/updatedAt` — the profile consumes only the `BioSession` slice.
**Per-card derivations:** `dateLabel = "DD/MM/YYYY"` (split of the `YYYY-MM-DD` key); `hasHrData = Array.isArray(heartRateSeries) && length > 0`; `hasAnyBio = biometrics && (avgHeartRate != null || activeCalories != null || deviceSource)`.

## 2.6 HRSparkline model (verbatim algorithm)
```ts
function HRSparkline({ series }: { series: { t: string; bpm: number }[] }) {
  const maxBpm = Math.max(...bpm); const minBpm = Math.min(...bpm);
  const range  = Math.max(maxBpm - minBpm, 1);
  const SAMPLE = 80;                                            // downsample cap
  const step   = series.length > SAMPLE ? Math.ceil(series.length / SAMPLE) : 1;
  const points = series.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  // 28px-tall bar row, gap-px; per-bar:
  heightPct = Math.max(((p.bpm - minBpm) / range) * 100, 8);    // 8% floor
  color = p.bpm >= maxBpm*0.85 ? "#ef4444"                      // red zone ≥85% of peak
        : p.bpm >= maxBpm*0.65 ? "#a3e635"                      // lime zone ≥65%
        : "#3f3f46";                                            // zinc resting
  // bar: flex 1 1 0 · minWidth 2px · maxWidth 6px · borderRadius 1px
}
```

## 2.7 Cancel-subscription contract (account configuration)
Profile shows the `Cancelar` chip only when `paymentStatus ∈ {"active","grace_period"}` → `onCancelRequest()` opens the root-owned `CancelSubscriptionSheet`: header **`¿Por qué cancelas?`**, radio list `CANCEL_REASONS = ["Falta de tiempo", "Precio muy alto", "Lesión o problema de salud", "Logré mi objetivo", "Otra razón"]` (SF-Dark-Pro styling — this sheet is deliberately *not* HUD-themed), confirm disabled until a reason is picked → `POST /api/subscription/cancel` (Stripe `cancel_at_period_end: true`, non-fatal; always sets local `paymentStatus: "inactive"`). The chosen reason is **not sent to the server** — UX theater only.

---

# 3. MODAL COMPONENT LOGIC — STATE MACHINES

## 3.1 TabPerfil state registry (verbatim)
```ts
const [showSettings,   setShowSettings]   = useState(false);   // PREFERENCIAS overlay
const [notifWorkout,   setNotifWorkout]   = useState(true);    // toggle defaults: ON / ON / OFF
const [notifNutrition, setNotifNutrition] = useState(true);
const [notifCommunity, setNotifCommunity] = useState(false);
const [settingsSaved,  setSettingsSaved]  = useState(false);   // save-latch
const [showRankDrawer, setShowRankDrawer] = useState(false);   // JERARQUÍA Y RANGOS drawer
const [bioHistory, setBioHistory] = useState<BioSession[]>([]);
const [bioLoading, setBioLoading] = useState(true);
// Scroll lock: body.style.overflow = (showRankDrawer || showSettings) ? "hidden" : ""
```

## 3.2 "JERARQUÍA Y RANGOS DE PODER" drawer — toggle rules
- **Open trigger:** the entire RANGO card is a `<button>` (`col-span-2`, `hover:scale-[1.01] active:scale-[0.97]`, minHeight 110) → `setShowRankDrawer(true)`. Its footer cue: `VER JERARQUÍA ›`.
- **Mount:** `createPortal(document.body)` — comment-documented "portal-mounted to escape layout stacking". Container: `fixed inset-0 z-[70] bg-black/90 backdrop-blur-md flex flex-col overflow-y-auto pb-16`, `animation: mc-overlay-in 0.25s cubic-bezier(0.16,1,0.3,1) both`. Body scroll locks while open.
- **Close:** the volt `CERRAR` pill (X 12 + 8px MONO label, `rgba(206,255,0,0.08)` bg / `rgba(206,255,0,0.25)` border, `active:scale-90`) → `setShowRankDrawer(false)`. No backdrop-tap close, no swipe — the pill is the only exit.
- **Inner lock/active state machine (3 visual states per tier):**
  1. **ACTIVE** (`active: true` — hardcoded to level 1): card bg `rgba(206,255,0,0.06)`, border `1.5px rgba(206,255,0,0.4)`, opacity 1; shield uses `RANK_SHIELD_CFG[level]` (bronze) and renders the tier **icon glyph** (20px, `iconColor`); title white; solid-Volt chip `ACTIVO` (7px MONO 900, black text); sub-line in `accentColor`.
  2. **LOCKED** (default): opacity **0.55**; shield forced to the zinc config (`rgba(24,24,27,0.5)` / `1px rgba(63,63,70,0.8)`) and renders a **`Lock` icon (14px, `#52525b`)** instead of the glyph; title at 40% white; sub-line at 20% white reading `NIVEL {n} · BLOQUEADO`; progress line = the unlock requirement.
  3. **VOLT-THEME SUPREME** (`voltTheme: true` — level 6 only): opacity 1, bg `rgba(206,255,0,0.03)`, border `rgba(206,255,0,0.2)`; shield uses `RANK_SHIELD_CFG[6]` (lime) with the ★ glyph at `#a3e635`; title at 60% white; outlined chip `ELITE` (`1px rgba(206,255,0,0.3)` border, `rgba(206,255,0,0.6)` text) — renders only because `voltTheme && !active`.
- ⚠ **The ladder is static:** `active` never derives from `student.streak` — a 45-day-streak BESTIA user still sees `ATLETA INIT · RANGO ACTUAL`. The mobile build should bind `active` to the real rank derivation (§2.2) — flagged in §5.

## 3.3 "PREFERENCIAS" (AJUSTES) overlay
- Open: the AJUSTES row button → `setShowSettings(true)`. Container: `fixed inset-0 z-50 bg-[#070708]/95 backdrop-blur-md`, same `mc-overlay-in`; volt `CERRAR` pill exits.
- **Toggle switch spec:** 44×24 (`w-11 h-6 rounded-full`); ON = track `#CEFF00` + **black** 20px knob at `left: calc(100% − 22px)`; OFF = track `rgba(255,255,255,0.08)` + 30%-white knob at `left: 2px`; knob transition 200 ms.
- **Save latch:** `GUARDAR CAMBIOS` → `settingsSaved = true` (button morphs to outlined-volt `✓ PREFERENCIAS GUARDADAS`) → after **1600 ms** both `settingsSaved=false` and `setShowSettings(false)`. **Nothing is persisted** — toggles reset on remount.
- Static CUENTA rows: `NOMBRE {student.name}` · `EMAIL "configurado en perfil"` (literal string) · `PLAN {Plan Berserker | Plan Performance}`.

## 3.4 Bitácora list states
`bioLoading` → 3 skeleton rows (`h-[72px] rounded-sm bg-zinc-900/60 animate-pulse`) → empty (`bioHistory.length === 0`) → cards. Card grammar: left column ✓-prefixed `DD/MM/YYYY` date (lime check), session name (DS 900 italic uppercase), optional `HR CURVE · {n} PTS` + sparkline; right column telemetry chips (`❤ {avg} BPM` stacked over `MAX {max} BPM`, `⚡ {kcal} KCAL`, `◈ {deviceSource.slice(0,20)}`) or the fallback `[ SIN REGISTRO TELEMÉTRICO ]`. Chip shell: `bg-zinc-900/60 border-zinc-800/80 px-2.5 py-1 font-mono font-black uppercase rounded-sm`.

## 3.5 Layout order of TabPerfil (top → bottom, the full tree)
1. Hero banner (280px, full-bleed `-mx-4`, grayscale(0.4)/brightness(0.55) image, 4-stop `to bottom` scrim `rgba(7,7,8,0.25)→0.15@40%→0.85@85%→1`, tagline block, glass avatar chip top-right with `{FIRSTNAME}` + `{stage} · E{stageNumber}`)
2. RACHA DE DÍAS matrix card (headline `{n} DÍAS` + glowing Flame; 7 checker cells 28px: done = solid `#CEFF00` black `✓` with `0 0 15px rgba(206,255,0,0.25)` glow + 55 ms staggered `mc-hud-scan` entrance; pending = dark cell showing the day number; today = `2px solid #00F0FF` ring + `animate-pulse`, labels `D1…D7`)
3. RANGO card (→ Jerarquía drawer)
4. BILLETERA TÁCTICA card
5. RÉCORDS PERSONALES 3-col grid (each column `borderLeft: 2px solid {accent}` — SQUAT `#CEFF00` / DEADLIFT `#00F0FF` / BENCH `#808080`; value or `—`, unit `KG` or `SIN LOG`)
6. MURO DE HONOR section (Correo row · Suscripción row with conditional `Cancelar` chip · Ajustes row)
7. PROGRESO MENSUAL bar (h-3 track, fill `linear-gradient(to right, rgba(206,255,0,0.5), #CEFF00)` + `0 0 10px rgba(206,255,0,0.35)`, 700 ms transition)
8. ARCHIVO DE MISIONES // BITÁCORA TÁCTICA list
9. `↪ CERRAR SESIÓN` ghost button (mt-8, absolute bottom of scroll)

---

# 4. VERBATIM TEXT & STRINGS (every literal)

## 4.1 Hero & identity
- Tagline: `UNA SERIE MÁS,` / `UNA COMIDA MÁS.` (white) / `DISCIPLINA ABSOLUTA.` (volt italic)
- Avatar chip: `{FIRSTNAME}` · `{stage} · E{stageNumber}`

## 4.2 Streak & rank
- `RACHA DE DÍAS` · `{n} DÍAS` · day labels `D1 D2 D3 D4 D5 D6 D7` · done glyph `✓`
- Rank card: `RANGO · ATLETA` (static eyebrow) · `{ATLETA|GUERRERO|BESTIA|LEYENDA}` · `{NIVEL 1|PRO|ELITE}` · `VER JERARQUÍA ›`

## 4.3 Wallet & PRs
- `BILLETERA TÁCTICA` · `${n} USD` · `ESCROW`
- `RÉCORDS PERSONALES` · `SQUAT / DEADLIFT / BENCH` · `{n} KG` or `— SIN LOG`

## 4.4 Muro de Honor & settings
- `MURO DE HONOR` · `CORREO` (fallback email literal `atleta@elite.com`) · `SUSCRIPCIÓN` · plan labels `Plan Berserker / Plan Shredder / Plan Performance` · `Cancelar` · `AJUSTES` / `Preferencia de cuenta`
- Overlay: `PREFERENCIAS` · `CERRAR` · `🔔 NOTIFICACIONES` · toggle rows: `Recordatorios de Entrenamiento` / `Push al inicio de tu sesión programada` · `Alertas de Nutrición` / `Recordatorio de comidas y macros` · `Actividad de Comunidad` / `Nuevos posts y retos del equipo` · `👤 CUENTA` · rows `NOMBRE / EMAIL ("configurado en perfil") / PLAN` · `GUARDAR CAMBIOS` → `✓ PREFERENCIAS GUARDADAS`
- Cancel sheet: `¿Por qué cancelas?` · reasons `Falta de tiempo / Precio muy alto / Lesión o problema de salud / Logré mi objetivo / Otra razón`

## 4.5 Progress & Jerarquía drawer
- `PROGRESO MENSUAL {n}% COMPLETADO`
- Drawer: `🏅 SISTEMA DE RANGO` · `JERARQUÍA Y / RANGOS DE PODER` · `CERRAR` · chips `ACTIVO` / `ELITE`
- Tiers (title · sub · desc · progress):
  - `ATLETA INIT · NIVEL 1 · RANGO ACTUAL` — `Estás a 150 XP o 3 entrenamientos perfectos de subir de nivel.` (icon ⬡)
  - `GUERRERO PRO · NIVEL 2 · BLOQUEADO` — `Completa 14 días de racha continua.` (◈)
  - `TITÁN · NIVEL 3 · BLOQUEADO` — `Alcanza 30 días de racha y 5 PRs.` (◆)
  - `COMANDANTE · NIVEL 4 · BLOQUEADO` — `Mantén el 90% de asistencia por 2 meses.` (✦)
  - `PREDADOR · NIVEL 5 · BLOQUEADO` — `60 días de racha y liderazgo de equipo.` (⬢)
  - `BESTIA ÉLITE · NIVEL MÁXIMO · RANGO SUPREMO` — `Liderazgo de sala activo · Credenciales de equipo elite.` (★)

## 4.6 Bitácora & logout
- Section header: `ARCHIVO DE MISIONES // BITÁCORA TÁCTICA`
- Empty state: `SIN SESIONES REGISTRADAS` / `Tus sesiones apareceran aqui tras completar tu primer entrenamiento.` (sic — no accents in source)
- Card strings: `✓ {DD/MM/YYYY}` · `HR CURVE · {n} PTS` · chips `❤ {n} BPM` / `MAX {n} BPM` / `⚡ {n} KCAL` / `◈ {device}` · fallback `[ SIN REGISTRO TELEMÉTRICO ]`
- Logout: `↪ CERRAR SESIÓN`
- Nav labels (global): `Dieta · Stats · Workout · Salas · Perfil` + the to-be-purged `Salir`

---

# 5. VERIFIED SHARP EDGES (port deliberately)
1. **The Jerarquía ladder ignores the user's real rank** — `active` is hardcoded to level 1. Bind it to the §2.2 derivation in mobile (and reconcile the two rank vocabularies: profile card uses ATLETA/GUERRERO/BESTIA/LEYENDA + sub, drawer uses the 6-tier INIT/PRO/TITÁN/COMANDANTE/PREDADOR/BESTIA ÉLITE ladder, community adds BERSERKER — three overlapping systems).
2. **`RANGO · ATLETA` eyebrow is static** even when the derived title is GUERRERO/BESTIA/LEYENDA.
3. **Preferences persist nothing** — toggles are session-local; `GUARDAR CAMBIOS` is a 1.6 s animation. EMAIL row is the literal `"configurado en perfil"`. Mobile should wire real push-permission storage or drop the screen.
4. **XP does not exist** — the level-1 progress copy references `150 XP` but no XP system exists anywhere (ROADMAP §4.B future phase).
5. **`streak` has no producer** — displayed everywhere, incremented nowhere server-side (seeded 1 by the wizard, 0 by import; only coach PUT rewrites it). The 7-day matrix is *local-week* activity, not the streak's source of truth.
6. **The streak matrix uses `D1–D7` slot labels**, not weekday names — a third labeling scheme after `L/M/MI/J/V/S/D` (nutrition strip) and `L/M/X/J/V/S/D` (stats timeline).
7. **Bitácora shows up to 50 sessions with no pagination**; sessions logged by the workout tab carry name-only exercise lists (see workout blueprint §2.3.6), so `completed` may be true with empty per-set data.
8. **Cancel reason is never transmitted** — collected client-side, dropped on confirm.
9. **Logout preserves localStorage by design** (workout freeze/restore) — replicate, don't "clean up".

---
*Saved for the mobile rebuild. Folder companions: `MYCOACH_SALAS_WEB_BLUEPRINT.md` · `MYCOACH_STATS_WEB_BLUEPRINT.md`. Web-repo companions: `MYCOACH_GLOBAL_MASTER_SPEC.md` · `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md` · `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md`.*
