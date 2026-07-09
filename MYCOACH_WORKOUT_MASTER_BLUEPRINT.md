# MYCOACH — WORKOUT ENGINE MASTER BLUEPRINT
## Complete Extraction of the Training Subsystem: UI, State Machine, Data Contracts & Telemetry

**Source of truth:** `src/app/portal/page.tsx` (`TabWorkout` lines 3707–4585, lifted session state lines 7921–7940, handlers lines 7594–7726), `src/lib/db.ts` (routine parsers, `ExerciseLog`/`WorkoutSession` layer), `prisma/schema.prisma`, and the API routes under `src/app/api/student/workout-session*` + `/api/me/{logs,prs}`. Every class, constant, and formula is copied from live code. Companions: `MYCOACH_GLOBAL_MASTER_SPEC.md`, `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md`.

---

# 1. THE WORKOUT VIEW & TAILWIND UI REGISTRY

The workout tab is a two-view machine — `wView: "lobby" | "focus"` — cross-faded by `switchView()` (160 ms `opacity/translateY(8px)` transition on the outer wrapper, `animating` flag). Focus mode also calls `onFocusMode(true)` which hides the global portal header.

## 1.1 Routine Stream Header (lobby, lines 3976–3986)

```jsx
<div class="px-5 pt-1 pb-5">
  <p class="text-[9px] font-black uppercase tracking-[0.25em] mb-2 flex items-center gap-2" style="color:#CEFF00">
    <span class="w-1.5 h-1.5 rounded-full animate-pulse inline-block" style="background:#CEFF00" />
    FUERZA TOTAL · {totalEx} EJERCICIOS · 45 MIN            ← "45 MIN" is a fixed label, not computed
  </p>
  <h1 style="fontFamily:DS; fontWeight:900; fontStyle:italic; fontSize:clamp(40px,13vw,56px);
             lineHeight:0.9; textTransform:uppercase; letterSpacing:-0.03em; color:#fff">
    {day.muscleGroup.toUpperCase() ?? "TODO EL CUERPO"}     ← muscle-group tag IS the title
  </h1>
  <p class="text-[11px] mt-2" style="color:#fff">{day.label ?? "Rutina de hoy"} · Sesión activa</p>
</div>
```
Above it (lobby only): the `EXPORTAR RUTINA` button — `flex items-center gap-1.5 px-3 py-1.5 rounded-xl active:opacity-70`, bg `rgba(255,255,255,0.05)`, border 8% white, `Printer` 12 `#808080`, label DS 900 9px tracking 0.14em `#808080`; fires `window.print()`.

**Global timer interface:** the session clock renders in the Focus view's bottom card (§1.5) as `WORKOUT DURATION {MM:SS}`; `durationStr = padStart(floor(wDuration/60)) + ":" + padStart(wDuration%60)`.

**Lifecycle control buttons** (lobby, under the header — one visible per state):
| State | Button | Exact styling |
|---|---|---|
| IDLE | `▶ INICIAR ENTRENAMIENTO` | `w-full py-4 rounded-sm … active:scale-[0.98]`; bg `#CEFF00`; `boxShadow 0 0 28px rgba(206,255,0,0.28)`; DS italic 900 16px tracking 0.12em black |
| ACTIVE_TRACKING | `⏸ PAUSAR` | `flex-1 py-3 rounded-sm … active:scale-95`; DS italic 900 13px `#808080`; bg 4% white; border 8% white |
| PAUSED | `▶ REANUDAR ENTRENAMIENTO` | `w-full py-4 rounded-sm`; bg **amber `#f59e0b`**; `boxShadow 0 0 24px rgba(245,158,11,0.32)`; black text 15px |

**Biometric HUD** (visible while ACTIVE/PAUSED, lines 4032–4076): `bg-zinc-950 border border-zinc-800 p-4 rounded-md grid grid-cols-2 gap-4` — left cell `RITMO CARDÍACO` with a 2×2 pulsing red dot (`#ef4444`, `boxShadow 0 0 6px rgba(239,68,68,0.7)`, `animation: mc-hr-pulse 1.1s ease-in-out infinite`), value `font-mono text-xl font-black text-white` `{avgHeartRate || "—"} BPM`, subline `PICO {maxHeartRate} BPM` (9px zinc-600); right cell `ENERGÍA ACTIVA` `{activeCalories || "—"} KCAL` + truncated `deviceSource`.

**Overall progress bar** (lines 4078–4088): labels `{doneEx.size}/{totalEx} COMPLETADOS` (9px white) and `{overallPct}%` (9px Volt); track `h-1 w-full rounded-full` 6% white; fill `transition-all duration-700`, `linear-gradient(90deg, #00F0FF 0%, #CEFF00 100%)`, glow `0 0 8px rgba(206,255,0,0.6)`.

## 1.2 The Exercise Bento Card — three render states (lines 4090–4230)

**Sort rule** (comment-documented): pending/active first → completed last, stable:
```ts
exercises.map((_,i)=>i).sort((a,b) => {
  const aDone = doneEx.has(a) || (doneSets[a] ?? 0) >= (exercises[a]?.sets ?? Infinity);
  const bDone = …;
  return (aDone?1:0)-(bDone?1:0);
});
// per-card: doneSetsForEx = Math.min(doneSets[i] ?? 0, ex.sets)   ← clamp, never > totalSets
//           exDone = doneEx.has(i) || doneSetsForEx >= ex.sets    ← dual-source completion
```

### State 1 — ACTIVE HERO (the exercise currently in training, `i === activeExIdx && !exDone`)
```jsx
<div class="rounded-3xl overflow-hidden relative cursor-pointer active:scale-[0.98] transition-all"
     style="background:#000; border:1px solid rgba(206,255,0,0.32);
            boxShadow: 0 0 0 1px rgba(206,255,0,0.08), 0 32px 64px -16px rgba(0,0,0,0.9); minHeight:200"
     onClick={switchView("focus")}>
  <img src={GYM_IMGS[i % GYM_IMGS.length]} class="absolute inset-0 w-full h-full object-cover" style="opacity:0.52" />
  <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
  <div class="relative z-10 p-5 flex flex-col gap-3 h-full">
    <!-- top row: EN CURSO pill + muscle tag -->
    <div class="px-3 py-1.5 rounded-full flex items-center gap-2"
         style="background:rgba(206,255,0,0.12); border:1px solid rgba(206,255,0,0.42)">
      <div class="w-1.5 h-1.5 rounded-full animate-pulse" style="background:#CEFF00" />
      <span class="text-[9px] font-black uppercase tracking-widest" style="color:#CEFF00">EN CURSO</span>
    </div>
    <span class="text-[9px] font-black uppercase tracking-widest" style="color:#fff">{muscleGroup}</span>
    <!-- heavy title -->
    <h3 style="DS 900 italic · clamp(30px,9vw,42px) · lineHeight 0.88 · uppercase · letterSpacing -0.03em · #fff">{name}</h3>
    <!-- inline smartwatch HR (only if avgHeartRate > 0): ❤ pulsing + "{bpm} BPM" MONO 900 15px #ff7676 + "MAX {max}" 10px 50% -->
    <!-- bottom row -->
    SERIES label (8px Volt) · "{currentSet+1} / {sets}" (14px black tabular white)
      · appended " · {focusWeight} KG" (11px Volt) when weight entered
    ENTRENAR chip: px-4 py-2.5 rounded-2xl · bg #CEFF00 · boxShadow 0 8px 24px rgba(206,255,0,0.38)
      · Zap 13/2.5 black · DS italic 900 11px black
  </div>
</div>
```

### State 2 — PENDING PROGRESS CAPSULE (not active, not done)
```jsx
<div class="relative overflow-hidden bg-zinc-950 border border-zinc-800 p-4 rounded-md cursor-pointer
            active:scale-[0.98] transition-all" onClick={ setActiveExIdx(i); switchView("focus") }>
  <!-- liquid progress fill layer behind content -->
  <div class="absolute left-0 top-0 bottom-0 bg-lime-500/10 border-r border-lime-400/20
              transition-all duration-500 ease-out z-0" style="width:{fillPct}%" />
  <div class="relative z-10 flex items-center justify-between gap-4">
    <p class="text-[8px] font-mono font-black uppercase tracking-widest mb-0.5"
       style="color: capsuleDone ? #4ade80 : #71717a">{capsuleDone ? "COMPLETADO" : "PENDIENTE"}</p>
    <h3 style="DS 900 italic · clamp(18px,5.5vw,22px) · uppercase · letterSpacing -0.02em · #fff">{name}</h3>
    <!-- right column: set counter + reps -->
    <p class="text-[11px] font-mono font-black tabular-nums text-white">{doneSetsForEx}<span class="text-zinc-500">/{sets}</span></p>
    <p class="text-[10px] font-mono" style="color:#CEFF00">{reps}</p>
  </div>
</div>
```
`fillPct = round(doneSetsForEx / max(sets,1) × 100)` — the lime wash grows left→right per completed set.

### State 3 — COMPLETED CHIP (compressed, sinks to bottom)
```jsx
<div class="relative overflow-hidden bg-zinc-900/20 border border-zinc-800/40 py-2.5 px-4 rounded-md
            opacity-50 transition-all duration-300">
  <div class="w-5 h-5 rounded-full …" style="background:#CEFF00"><Check size=10 strokeWidth=3.5 color=#000 /></div>
  <span style="DS 900 italic · 14px · uppercase · rgba(255,255,255,0.55) · ellipsis">{name}</span>
  <span style="MONO · 8px · tracking 0.14em · rgba(255,255,255,0.22)">{sets} SETS ✓</span>
</div>
```
Completed-state grammar: whole chip at **50% opacity**, surface `zinc-900/20`, border `zinc-800/40`, solid-Volt 20px check disc, title at 55% white, `{sets} SETS ✓` receipt caption. Not clickable back into focus.

**Empty state:** `rounded-3xl py-12` at `rgba(8,8,10,0.8)`; ghost `Dumbbell` 32/1 12% white; "Sin rutina asignada para hoy."

## 1.3 FINALIZAR CTA (lines 4281–4319)
Mounts only when `doneEx.size >= totalEx && totalEx > 0 && sessionLifecycle !== "IDLE"`:
`w-full py-4 rounded-2xl … active:scale-[0.98]`, bg `#CEFF00`, `boxShadow 0 0 32px rgba(206,255,0,0.3)`, DS italic 900 16px tracking 0.12em black, `Zap` 16 filled — `"FINALIZAR ENTRENAMIENTO"`. Click sequence (verbatim order): stop duration interval → `setSessionLifecycle("COMPLETED")` → `setWorkoutComplete(true)` → write the sealed `SavedSession` (with `date: todayDateStr()`) to localStorage (**key deliberately NOT removed** — same-day re-login must restore the completed layout) → fire-and-forget `POST /api/student/workout-session/telemetry` with `{ date: workoutDate, ...biometrics }`.

## 1.4 Focus View — the set-execution screen (lines 4324–4553)

- **Brand header:** back chevron (32px round, 4% white) + `Zap` 13 filled Volt + `MYCOACH` (DS 900 `clamp(14px,4vw,17px)`); right, a 36px settings button.
- **Context header** (lines 4346–4365): eyebrow `text-[8.5px] font-black uppercase tracking-[0.22em]`, color Volt while resting else white, with three copy states — `"REST FINISHED"` / `"RESTING — SET {n} COMPLETED ✓"` / `"{muscleGroup} · SERIE {min(currentSet+1,totalSets)} DE {totalSets}"`. Title: exercise name `DS 900 italic clamp(28px,8.5vw,40px) lineHeight 0.88 letterSpacing -0.03em`. Right column: `HEART RATE` (8px white) over **`❤ 142 BPM`** (DS 900 italic ~14px `#ff6b6b`) — ⚠ this readout is a **hardcoded constant**, unlike the lobby HUD which reads `biometrics` state.
- **Video canvas** (non-rest): `w-full rounded-3xl aspect-[16/9]` black, gym photo at `opacity 0.55, saturate(0.55)`, `bg-gradient-to-t from-black via-black/30 to-transparent`; bottom-left "▶ Watch Form Check" glass chip (32px round, `rgba(255,255,255,0.14)` + blur(10)); top-right live pill `"SEGUIMIENTO EN TIEMPO REAL"` — `rgba(0,0,0,0.72)` + blur(16), border `rgba(206,255,0,0.38)`, pulsing Volt dot with `0 0 6px rgba(206,255,0,0.9)`.

### The set-input row (SET / KG / REPS / CHECK equivalent, lines 4455–4500)
Two `rounded-3xl` input modules in `grid grid-cols-2 gap-3`:
```
PESO (KG) module:  background #1A1A1A · backdropFilter blur(32px) · border 1px rgba(255,255,255,0.08)
                   · boxShadow 0 20px 40px rgba(0,0,0,0.6)
  label 8px tracking 0.18em WHITE · <input type=number inputMode=decimal>
  value DS 900 clamp(38px,12vw,58px) WHITE centered · placeholder "0"
  steppers: − / + 36px rounds · step ±2.5 · floor 0 · toFixed(1)
    onChange: parseFloat(v) || 0        ← no upper bound; negatives coerced via the max(0,…) steppers only
REPS OBJETIVO module: same card but border rgba(206,255,0,0.2) + extra ring 0 0 0 1px rgba(206,255,0,0.05)
  label + value in VOLT #CEFF00 · placeholder = prescribed reps · steppers ±1 · floor 0 · parseInt(v) || 0
```
Confirm bar: `✓ SET COMPLETE` — `w-full py-5 rounded-3xl … active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed` (disabled when `currentSet >= totalSets`), bg `#CEFF00`, black, DS italic `clamp(15px,5vw,20px)` tracking 0.12em, `boxShadow 0 20px 40px rgba(206,255,0,0.32)`, `CheckCircle2` 20/2.5.

### Interactive set-row state transitions — exactly what changes on check-off
Completing a set (`handleSetComplete`, §2.3) produces, line-by-line:
1. `doneSets[activeExIdx]` increments → the context eyebrow flips to `"RESTING — SET {n} COMPLETED ✓"` and turns **Volt**.
2. The lobby capsule's lime fill layer (`bg-lime-500/10 border-r border-lime-400/20`) widens by `100/sets`% (`duration-500 ease-out`); its counter re-renders `{n}/{sets}` (white over zinc-500).
3. `WorkoutToast` mounts for 2 s — cyan glass card (`rgba(0,15,20,0.96)`, border `rgba(0,240,255,0.15)`, blur 20), `Dumbbell` tile 44px (`rgba(0,240,255,0.08)` bg, `0 0 12px rgba(0,240,255,0.2)`), `"MÓDULO COMPLETADO"` (DS 900 17px) / `"SERIE REGISTRADA CORRECTAMENTE"` (MONO 8.5px cyan).
4. Non-final set → the rest panel replaces the video/inputs (§1.4.1). Final set → exercise flagged done: dot-navigator dot turns **`#34d399`**, chip compresses to State 3 at 50% opacity with the Volt check disc, view auto-returns to lobby after the 2 s toast, and the eyebrow/`ENTRENAR` affordances move to the next pending exercise.
5. If a set weight was entered and beats a tracked PR, the PR pipeline fires in parallel (§4).

### 1.4.1 Rest Timer Panel (lines 4398–4428) & REST FINISHED (4370–4396)
```
Panel: rounded-[32px] · background rgba(6,6,8,0.97) · border 2px solid #CEFF00 · boxShadow 0 0 30px rgba(206,255,0,0.2)
Header: "RESTING TIME REMAINING" (8px Volt) + chip "DESCANSANDO" (rgba(206,255,0,0.08) bg / 0.22 border)
Clock: {MM:SS} · DS 900 · clamp(72px,22vw,100px) · #CEFF00 · letterSpacing -0.02em
       textShadow: 0 0 48px rgba(206,255,0,0.55)                     ← the volt neon clock
Pip matrix: 18 pips · 12×4 px rounded-full · gap [3px] · maxWidth 260
       filled when idx < round((90 − restSecs) / 5)                  ← one pip per 5 s elapsed
       filled: #CEFF00 + 0 0 4px rgba(206,255,0,0.6) · empty: rgba(255,255,255,0.07)
SKIP REST → : w-full py-3.5 rounded-2xl · 4% white bg · 10% border · white DS 900 13px
```
REST FINISHED swap-in: same `rounded-[32px]` volt-bordered shell (glow 0.25); header gains a 28px solid-Volt check disc; centered 80px ring (`rgba(206,255,0,0.08)` bg, `2px rgba(206,255,0,0.3)` border) around `CheckCircle2` 36 Volt; caption `"00:00 — DESCANSO COMPLETADO"` (11px, tracking 0.2em, 40% white); CTA `START NEXT SET` (`py-5 rounded-2xl`, solid Volt, `Zap` 18, `boxShadow 0 12px 32px rgba(206,255,0,0.4)`).

### 1.4.2 Dot navigator + footer (lines 4504–4541)
Chevron buttons 32px round (20% opacity when disabled at ends); center dots: `height 6`, width **24px pill** for active / 6px otherwise, colors `#34d399` done · `#CEFF00` active · `rgba(255,255,255,0.15)` pending, `transition-all duration-300`; dots are tappable (`setActiveExIdx(idx)`). Footer card `rounded-3xl px-5 py-4` at `rgba(8,8,10,0.85)`: `WORKOUT DURATION {MM:SS}` (17px DS italic white) | `PROGRESO GENERAL {overallPct}%` (Volt); track `h-1.5` with the same cyan→volt fill, `width: overallPct || 2%`.

**No-exercise fallback:** centered `Dumbbell` 40/0.75 + "No hay ejercicio activo." + `← VOLVER AL LOBBY` ghost button.

---

# 2. THE DATA CONTRACT & STATE ENGINE (`routineJson`)

## 2.1 The raw `routineJson` payload in Neon

`Student.routineJson` is an opaque stringified-JSON `TEXT` column. Canonical production shape (full example in `MYCOACH_GLOBAL_MASTER_SPEC.md` §1.4.2):
```jsonc
{
  "name": "PPL Definición 5 días",
  "daysPerWeek": 5,
  // optional root-level coach settings merged by applyStageChange():
  //   splitBlock?, phaseWeek?, phaseTotalWeeks?, trackRpe?, weightLimits?
  "days": [
    {
      "day": "Lunes", "label": "Push", "muscleGroup": "Pecho · Hombro · Tríceps",
      "weekday": 1,                       // OPTIONAL explicit ISO weekday pin (0=Sun…6=Sat)
      "exercises": [
        { "name": "Press Banca", "sets": 4, "reps": "10", "weight": "40 kg", "rest": "90s",
          "ejercicioId": "cku…"          // OPTIONAL loose ref → coach's Ejercicio catalog
        },
        { "name": "Fondos en Paralelas", "sets": 3, "reps": "AMRAP", "rest": "60s" }
      ]
    }
  ]
}
```
**Contract truths, exhaustively:**
- `reps` is a **string** — free-form: `"10"`, `"12 c/lado"`, `"45s"`, `"AMRAP"`. The client coerces with `parseInt(String(reps)) || 10`.
- `weight`/`rest` are **display strings**, not numbers (`"40 kg"`, `"90s"`); the actual working weight is entered live in the Focus view (`focusWeight`).
- **There is no warm-up/working/drop-set taxonomy in the stored schema.** Sets are a single integer count; set-type differentiation does not exist anywhere in `routineJson`, `ExerciseLog.setsJson`, or the UI. (Any mobile rebuild adding warm-up/drop sets is extending, not porting.)
- Server read path: `parseRoutine(json)` (never throws; empty/corrupt → `{name:"Rutina no asignada", daysPerWeek:0, days:[]}`) → `resolveDays(days, catalog)` which, per exercise, overwrites `name/muscleGroup/bodyweight/imageUrl/videoUrl` from the live `Ejercicio` catalog when `ejercicioId` matches, and injects defaults `sets ?? 3, reps ?? "10", weight ?? "", rest ?? "60s"`.
- Day→weekday resolution (client, lines 448–452): explicit `weekday` field wins (`days.find(d => d.weekday === jsWeekday)`), else ordinal `days[dayIdx − 1]` (slot 0 = Monday). `resolveRoutineDay` returns `undefined` past the routine's length → empty-state card.

## 2.2 Execution records — `ExerciseLog.setsJson` / `WorkoutSession.exerciseLogs`

Canonical `SetEntry`: `{ setNumber, targetReps, actualReps, weight, completed }` (numbers + boolean); legacy `{ reps, weight, done }` rows are bridged on read (`actualReps = done ? parseInt(reps) : 0`, etc.). `WorkoutSession.exerciseLogs` stores `SessionExercise[] = { exerciseName, muscleGroup, sets: SetEntry[], completed }`. Server upsert key: `(studentId, date)` for sessions, `(studentId, date, exerciseName)` for logs — both **replace-semantics**.

## 2.3 Client State Mechanics — the live workout state machine

### 2.3.1 Lifted session state (portal root, lines 7925–7940)
```ts
const [wView, setWView]                     = useState<"lobby" | "focus">("lobby");
const [activeExIdx, setActiveExIdx]         = useState(0);
const [doneSets, setDoneSets]               = useState<Record<number, number>>({});  // exerciseIdx → completed set count
const [doneEx, setDoneEx]                   = useState<Set<number>>(new Set());      // fully-completed exercise indices
const [workoutComplete, setWorkoutComplete] = useState(false);                       // summary-modal mount flag
const [wDuration, setWDuration]             = useState(0);                           // seconds
// All reset to zero whenever activeDayIndex changes (effect line 7933) — switching days abandons the session view state.
```
State lives in the **root**, not `TabWorkout`, so switching to Nutrición mid-set never loses the session ("survives tab switches").

### 2.3.2 The lifecycle machine (lines 3745–3900)
```
type SessionLifecycle = "IDLE" | "ACTIVE_TRACKING" | "PAUSED" | "COMPLETED";
// NATIVE_BRIDGE: transitions map 1:1 to HealthKit HKWorkoutSession states —
//   INICIAR → HKWorkoutSessionStart() · PAUSAR → .pause() · REANUDAR → .resume() · FINALIZAR → HKWorkoutSessionEnd()
```
- **Session clock:** a 1 Hz `setInterval` increments `wDuration` **only while `ACTIVE_TRACKING`**; any other state clears the interval (effect keyed on `sessionLifecycle`).
- **Biometrics snapshot:** `{ avgHeartRate, maxHeartRate, activeCalories, totalCalories, deviceSource }` — initialized to zeros/`"—"`, intended to be populated by the native wearable bridge; mirrored into refs (`lifecycleRef`, `biometricsRef`) so the unmount closure reads fresh values.

### 2.3.3 The persistence cache (lines 3795–3888) — exact serialization schema
```ts
const sessionCacheKey = `mc:session_${student.id}_${workoutDate}`;   // student+date bound — days never collide
type SavedSession = {
  sessionLifecycle: SessionLifecycle;
  elapsedSeconds:   number;
  date?:            string;   // YYYY-MM-DD seal — written only on FINALIZAR
  exercises:        { id: string; completedSets: number }[];  // keyed by exercise NAME, not index →
                                                              // routine re-ordering/edits never corrupt hydration
  biometrics?:      BiometricsSnapshot;
};
```
Rules, in order:
1. **Mount-restore:** parse the key; `IDLE` → ignore. Rebuild `doneSets` via `Math.min(saved.completedSets, ex.sets)` (clamp) and `doneEx` where clamped ≥ sets. `COMPLETED` → restore the locked completed layout (`workoutComplete = true`). Anything in-progress → **always land as `PAUSED`** — "the user must explicitly hit REANUDAR"; the clock and watch bridge never auto-resume on re-login.
2. **Write-through:** every change to `{sessionLifecycle, doneSets, wDuration, biometrics}` re-serializes — except while `IDLE` or `COMPLETED` (COMPLETED is written once, at FINALIZAR, with the `date` seal).
3. **Freeze-on-unmount:** a run-once cleanup — if still `ACTIVE_TRACKING` at teardown (logout/close), atomically rewrite the cache as `PAUSED` + latest biometrics.
4. **Midnight purge** (root, lines 7671–7678): the 60 s rollover poll scans localStorage for `mc:session_*` keys not ending in `_${today}` and removes them, alongside resetting all session state and `mc:nutrition_history`/`mc:workout_history`. Postgres rows are never touched.

### 2.3.4 Set completion flow — `handleSetComplete()` (lines 3939–3970, verbatim logic)
```ts
if (currentSet >= totalSets) return;                      // guard: can't over-complete
const newSets = currentSet + 1;
const isLast  = newSets >= totalSets;
setDoneSets(d => ({ ...d, [activeExIdx]: newSets }));
// PR check — fires on EVERY set when a weight is entered (see §4)
if (focusWeight > 0 && activeEx) { const lift = detectLift(activeEx.name);
  if (lift && focusWeight > prs[lift]) onNewPR(lift, focusWeight); }
setWorkoutToast(true);                                    // 2 s toast
if (isLast) {
  setDoneEx(d => new Set([...d, activeExIdx]));
  onLogExercise(activeDayIndex, activeEx.name);           // ← server persistence (§2.3.6)
  setTimeout(() => { setWorkoutToast(false); switchView("lobby"); }, 2000);
} else {
  startRest();                                            // ← 90 s rest timer
  setTimeout(() => setWorkoutToast(false), 2000);
}
```

### 2.3.5 Rest timer mechanics (lines 3909–3925)
`startRest()`: `restOn=true, restSecs=90, restDone=false`; 1 Hz interval decrements; at ≤1 it clears itself, sets `restDone=true`, clock shows `00:00` and the REST FINISHED panel swaps in. `skipRest()` / `startNextSet()` both clear/reset to 90. **Rest duration is a fixed 90 s** — the routine's per-exercise `rest` string (e.g. `"60s"`) is displayed in plans/print but not wired into this timer.

### 2.3.6 Server persistence — `onLogExercise` (root, lines 7594–7621)
On each exercise completion the root appends the name to the day's `workoutHistory[dayIdx]` (ref-guarded dedupe, localStorage-persisted) and POSTs the **cumulative** list:
```ts
fetch("/api/student/workout-session", { method: "POST", body: JSON.stringify({
  date: realDateForDayIndex(dayIdx),                 // the real calendar date of that weekday slot
  name: detail.routine.days[dayIdx-1]?.label ?? "Entrenamiento",
  exerciseLogs: cumulative.map(n => ({ name: n })),  // name-only entries; server replace-semantics = intentional
})}).catch(() => {});
```
Set-by-set granularity (weights/reps per set) is available via `PATCH /api/me/logs` (upsert by `date+exerciseName` with a full `SetEntry[]`), and telemetry attaches at FINALIZAR via `POST /api/student/workout-session/telemetry` (requires the session row to exist — 404 otherwise).

### 2.3.7 Input validation thresholds — the truth
- **Focus set inputs:** `focusWeight = parseFloat(v) || 0` with stepper floor `Math.max(0, w − 2.5)` — **no upper bound and no 20–500 check on set weight**; `focusReps = parseInt(v) || 0`, floor 0.
- **The 20–500 kg range check applies to BODY-WEIGHT logging**, not sets: client `handleWeightSave` (line 2937: `!Number.isFinite(kg) || kg < 20 || kg > 500 → error`) mirrored by the server in `POST /api/me/biometrics`. Any spec that says set weights are clamped 20–500 is wrong — only the biometric scale entry is.
- PR submissions are validated server-side as `kg > 0` + monotonic-increase (silent no-op below current PR).

---

# 3. MATHEMATICAL VOLUME & TELEMETRY CALCULATORS

## 3.1 The live equations that actually exist (client-side, exact)

```ts
overallPct  = Math.round((doneEx.size / Math.max(totalEx, 1)) * 100);           // lobby + focus footer
fillPct     = Math.round((doneSetsForEx / Math.max(ex.sets, 1)) * 100);          // per-capsule lime wash
durationStr = `${floor(wDuration/60).pad(2)}:${(wDuration%60).pad(2)}`;          // MM:SS
waterPct    = waterMl / 3000;                                                    // hydration ring
targetReps  = parseInt(String(activeEx.reps)) || 10;                             // reps coercion
currentSet  = doneSets[activeExIdx] ?? 0;
restPipsFilled = Math.round((90 − restSecs) / 5);                                // 18-pip matrix
// Squads/duel scoring inputs (root):
nutritionTotal      = Σ meals[i].calories where checkedMeals.has(i);
streakCompletedDays = count of days 1–7 with (nutritionHistory[d].size > 0 || workoutHistory[d].length > 0);
```

**⚠ Honesty finding — tonnage volume does NOT exist.** There is no `sets × reps × weight` accumulation anywhere in the codebase (verified by exhaustive grep for volume/tonelaje/weight-product patterns). Per-muscle-group volume aggregation likewise does not exist. The raw material to compute it *is* persisted (`SetEntry.actualReps × weight` per set in `ExerciseLog.setsJson` / `WorkoutSession.exerciseLogs`), so a mobile rebuild can add true volume math on top of the existing contract — but it would be new functionality, not a port.

## 3.2 Post-Workout Summary — `WorkoutCompleteModal` (lines 2376–2527, full layout + logic)

**Trigger:** `workoutComplete === true` (set by FINALIZAR, restored by same-day cache re-login). Props: `{ durationStr, exerciseCount = exercises.length }`.

**Counter animation:** `useCountUp(target, duration=1000)` — rAF loop, ease-out cubic `1 − (1−p)³`, `round(target × eased)`.

**The metric formulas (all aesthetic estimates — no biometric inputs):**
```ts
kcal      = useCountUp(exerciseCount * 8);                    // ~8 kcal per exercise
intensity = useCountUp(Math.min(60 + exerciseCount * 2, 99)); // 60 base + 2/exercise, capped 99
VO2 block: "54.2" · "+2.4 INCREMENTO" · bar animates 0 → 72%  // ALL fixed constants
Record badges: PESO BANCA +15 KG · PRESS INCLINADO +10 KG · SENTADILLA +5 KG   // HARDCODED demo values
```

**Layout, top to bottom** (fullscreen portal `#070708`, z-9998, `animate-mc-overlay-in`, maxWidth 440, staggered `animate-mc-slide-up-0…4`):
1. Brand mark: `Zap` 13 filled Volt + `MYCOACH` (DS 900 italic 14px).
2. Session badge pill: `rgba(248,113,113,0.10)` bg, `rgba(248,113,113,0.28)` border, `• RESUMEN DE SESIÓN` (MONO 8px, tracking 0.22em, `#f87171`).
3. Massive two-line title `clamp(44px,13vw,64px)` DS 900 italic lineHeight 0.86: `ENTRENAMIENTO` (Volt) / `FINALIZADO` (white).
4. Volt badge: solid `#CEFF00`, `padding 11px 28px`, radius 14, `boxShadow 0 0 32px rgba(206,255,0,0.4), 0 0 8px rgba(206,255,0,0.2)` — `LÍMITE SUPERADO` (DS 900 italic 19px black).
5. Stats bento `grid 1fr 1fr gap 12px`, shared card style `CARD = { background:#111, border:1px rgba(255,255,255,0.06), borderRadius:22px, padding:20px 16px }`: **CALORÍAS** (`Flame` 20 Volt; count-up 48px DS italic Volt; `KCAL QUEMADAS`) | **PICO** (`BarChart3` 20 cyan; `{intensity}%` 48px cyan; `NIVEL INTENSIDAD`).
6. VO2 MAX block (CARD + cyan border `rgba(0,240,255,0.14)`): `PROGRESIÓN VO2 MAX`; `54.2` (52px DS italic white) beside `+2.4 INCREMENTO` chip (`rgba(52,211,153,0.09)` bg, `#34d399` text); animated 7px bar → 72% width, `linear-gradient(90deg,#00F0FF,#CEFF00)`, glow `0 0 10px rgba(0,240,255,0.55)`, `transition width 1.1s cubic-bezier(0.16,1,0.3,1)`; caption `72% HACIA SIGUIENTE UMBRAL ÉLITE`.
7. `🏆 INSIGNIAS DE RÉCORD` — 3-col grid of CARD tiles: delta (26px DS italic Volt) over pre-line label (MONO 7px).
8. Sticky footer CTA over `linear-gradient(to bottom, rgba(7,7,8,0) 0%, #070708 38%)`: `CERRAR RESUMEN` — `w-full bg-[#CEFF00] text-black font-black uppercase py-4 rounded-xl`, DS italic 18px tracking 0.14em, `boxShadow 0 0 36px rgba(206,255,0,0.3), 0 4px 16px rgba(0,0,0,0.6)` → `setWorkoutComplete(false)`.

**Real telemetry** (HR/kcal from the wearable) is not shown in this modal — it flows through the `biometrics` snapshot → FINALIZAR telemetry POST → `WorkoutBiometrics` row → surfaced later in the Perfil history (`GET /api/student/workout-session/history` includes `biometrics`).

---

# 4. PERSONAL RECORDS (PRs) & CLIENT-COACH LIFECYCLE LOGIC

## 4.1 PR Triggering System (lines 3931–3953, 7687–7726)

**Lift detection** — keyword mapping on the exercise name (lowercased):
```ts
detectLift(name): "squat"    if includes "squat" | "sentadilla"
                  "deadlift" if includes "deadlift" | "peso muerto"
                  "bench"    if includes "bench" | "press de banca" | "pecho"   ← broad: any "pecho" exercise counts
                  else null
```
**Trigger:** inside `handleSetComplete`, on **every completed set** where `focusWeight > 0` and the lift maps: `focusWeight > prs[lift]` → `onNewPR(lift, focusWeight)`. Weight-only comparison — volume/reps never factor into PRs.

**`onNewPR` pipeline (root):**
1. Optimistic: `setPrs(p => kg > p[lift] ? { ...p, [lift]: kg } : p)`.
2. `PATCH /api/me/prs { lift, kg }` — server re-validates monotonic increase (`prisma.student.findUnique` → conditional `update` of `prSquat|prDeadlift|prBench`; lower values are a silent no-op).
3. Success → overwrite all three PRs from the response. Failure → re-fetch `/api/me` to restore authoritative values + fire the system error toast (`"⚠️ Error al guardar el récord…"` / `"⚠️ Sin conexión — récord no guardado."`, 3.5 s).

**Milestone badge truth:** there is **no dedicated real-time "NEW PR" badge** at the moment of detection — the set completion shows the standard `WorkoutToast`; the summary modal's `INSIGNIAS DE RÉCORD` tiles are hardcoded demo deltas; the live PR values render in the Perfil tab's `RÉCORDS PERSONALES` section (line 4984) and feed the mobile portal payload (`prSquat/prDeadlift/prBench`). A rebuild wanting a true PR-moment celebration must add it.

## 4.2 Coach Assignment Contracts — how the client receives/overrides templates

1. **Authoring:** coach builds `Template` rows (`type:"routine"`, `dataJson`) in the Plantillas panel; exercises may carry `ejercicioId` refs into the coach's catalog.
2. **Assignment:** `POST /api/students/change-stage` (bulk) or student PUT — the template is **snapshotted** (`stripTemplate` drops `{id,type}`) into `Student.routineJson`, optionally merged with `routineSettings` (`splitBlock/phaseWeek/phaseTotalWeeks/trackRpe/weightLimits`) and diet `macroOverrides`. Future-dated assignments queue as the student's single `ScheduledChange`, drained by the lazy `runAutoCron()` on any roster read.
3. **Delivery:** client fetches `GET /api/me` (or `GET /api/mobile/portal` for the normalized shape) → `parseRoutine` → `resolveDays` (live catalog join) → `detail.routine.days`; the day slot is picked by `resolveRoutineDay(activeDayIndex, days)` (explicit `weekday` pin → else ordinal).
4. **Client override surface:** the student can override nothing in the plan itself — no client write path touches `routineJson`. What the student *does* own: live set weight/reps entries (`focusWeight`/`focusReps` → `ExerciseLog`/`WorkoutSession`), day browsing (±7 within the ISO week), and PRs. Editing a catalog `Ejercicio` (coach-side) retroactively updates every routine referencing it by `ejercicioId` at the next read; editing a `Template` does **not** ripple (snapshots).
5. **Refresh limitation (known):** the portal hydrates the routine once on mount — a mid-session coach re-assignment is invisible until reload; the only forced resync is the midnight rollover.

## 4.3 Sharp edges specific to this subsystem (verified, for the rebuild to fix deliberately)
1. Focus header `❤ 142 BPM` is hardcoded; the lobby HUD reads real `biometrics` state (which itself awaits the native bridge — defaults are zeros).
2. Summary-modal kcal/intensity/VO2/record-badges are aesthetic constants (§3.2) — do not present them as measured data in a rebuild.
3. `onLogExercise` sends name-only `exerciseLogs` (`{name}` entries) — set-level detail reaches the server only if the `PATCH /api/me/logs` path is also wired (the current portal does not call it from the focus flow).
4. Rest timer ignores the prescribed per-exercise `rest` string (fixed 90 s).
5. `detectLift`'s `"pecho"` keyword over-matches (e.g. "Aperturas de pecho" would register bench PRs).
6. Set weight input has no upper sanity bound (the 20–500 clamp is body-weight only).

---

*End of blueprint. Cross-references: `MYCOACH_GLOBAL_MASTER_SPEC.md` (schema, API logbook, calendar engine), `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md` (nutrition/hydration/celebration UI).*
