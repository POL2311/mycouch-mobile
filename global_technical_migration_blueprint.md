# MyCoach — Global Technical Migration Blueprint
Web repo: `/Users/alatorre/Desktop/images/mycouch`. Companion document to `global_business_specification.md`. Covers the database contract, the full API surface, a concrete gap audit against the mobile rebuild at `../mycoach-mobile`, and a module-by-module migration plan.

---

## 1. Database Schema & Data Hydration Contracts

### 1.1 Full Prisma model inventory

`prisma/schema.prisma` — PostgreSQL via `DATABASE_URL`/`DIRECT_URL` (Neon).

```prisma
enum Role { ADMIN COACH CLIENT }
enum MembershipTier { DIET_ONLY ROUTINE_ONLY FULL }
```

**`User`** — `id, email(unique), passwordHash, name, role(default CLIENT), createdAt` + `coachProfile Coach?`, `student Student?`, `carreras Carrera[]`.

**`Coach`** — `id, userId(unique)→User(Cascade), students Student[], templates Template[], ejercicios Ejercicio[], stripeConnectId?, stripeOnboardingComplete(default false), monthlyPrice(default 1200), joinCode?(unique), isPublic(default false), createdAt`.

**`Student`** (largest model) — Identity: `id, name, email, avatarInitials, avatarColor`. Weight/stage: `currentWeight, previousWeight, lastWeighIn, stage, stageNumber`. Status: `isActive(default true)` **← sole portal/mobile access gate**, `membershipTier(default FULL)`, `paymentStatus(default "inactive")` **← billing display only, never gates access**, `stripeCustomerId?, stripeSubscriptionId?, joinedDate, streak(default 0), completionRate(default 0)`. Body: `height?, bodyFat?, photoName?, notes(default ""), nextStageDate?`. Plan JSON: `dietJson(default ""), routineJson(default "")` — **stringified, not native Postgres Json**. PRs/wallet: `prSquat/prDeadlift/prBench(default 0), walletBalance(default 0)`. Relations: `weightHistory, measurements, photos, scheduledChange, dailyChecks, exerciseLogs, workoutSessions, waterLogs`. Bridges: `coachId? → Coach(SetNull)`, `userId?(unique) → User(SetNull)`.

**Progress children** (all `onDelete:Cascade` from `Student`): `WeightEntry(date,weight)`, `Measurement(chest/waist/hips/armL/armR/thighL/thighR, all Float @default(0))`, `ProgressPhoto(url,label,weight?,createdAt)`, `ScheduledChange` (1:1, `studentId` unique — `executionDate,stage,stageNumber,dietTemplateId?,routineTemplateId?`, the queue a lazy cron drains on every roster read).

**`Template`** — `id, type(String "diet"|"routine", not an enum), name, dataJson(String), coachId?→Coach(SetNull), createdAt`. Nullable `coachId` allows global/shared templates.

**`ExerciseLog`** — `studentId→Student(Cascade), date, ejercicioId?(loose ref, not an FK), exerciseName, muscleGroup?, bodyweight(default false), prescribedSets(default 0), prescribedReps(default ""), prescribedWeight?, setsJson(default "[]"), completed(default false), createdAt`.

**`Ejercicio`** — `id, coachId→Coach(Cascade), name, muscleGroup, equipment, bodyweight(default false), imageUrl?, videoUrl?, createdAt`. `@@unique([coachId, name])`.

**`DailyCheck`** — `studentId→Student(Cascade), date, kind("meal"|"exercise", plain String), itemKey, createdAt`. `@@unique([studentId, date, kind, itemKey])`.

**`WorkoutSession`** — `id, studentId→Student(Cascade), routineId?(loose ref), name, date, completed(default false), exerciseLogs(default "[]", stringified JSON), notes?, biometrics WorkoutBiometrics?(1:1), createdAt, updatedAt`.

**`WorkoutBiometrics`** (strict 1:1, `sessionId` unique) — `avgHeartRate?/maxHeartRate?(Int), activeCalories?/totalCalories?(Int), deviceSource?(String), heartRateSeries?(Json — the ONLY native Postgres Json column in the entire schema), createdAt`.

**`FoodSubstitute`** — static reference data, self-seeded on first read: `category, originalFood, substituteFood, ratio(Float), createdAt`.

**`WaterLog`** — `studentId→Student(Cascade), date, amountMl(Int), createdAt`.

**`GroupMessage`** — `coachId(plain indexed column, not a declared relation), senderId, senderName, role(default "CLIENT", plain String), content, imageUrl?, createdAt`. `@@index([coachId, createdAt])`. Doubles as both chat and coach notices, distinguished only by `role`.

**`Carrera`** (Strava-style run tracking, mobile-first, newest model) — `userId→User(Cascade)` — **keyed to `User`, not `Student`** — `date, distanceM, durationS, avgSpeedKmh, trackJson(String), photoUrl?, createdAt`.

### 1.2 Relational bridge map
- **Coach ↔ Student**: one-to-many, nullable FK, `SetNull` on unlink — students are never hard-deleted when unlinked from a coach.
- **User ↔ Coach / User ↔ Student**: two optional 1:1 bridges off `User`, mutually exclusive by convention but **not DB-enforced** — nothing stops a `User` row from having both set.
- **Routine/Diet ↔ Days/Exercises**: **not modeled relationally at all.** No `Day`, `RoutineExercise`, or `Meal` Prisma models exist — this is answered entirely by JSON shape convention in application code (§1.3 below), with the `Ejercicio` catalog resolved into that JSON by name/id lookup only at read time.
- **Session ↔ Biometrics**: the only other true 1:1 (besides Coach/Student↔User), Cascade-deleted with the session.
- Everything else hanging off `Student` (`WeightEntry`, `Measurement`, `ProgressPhoto`, `DailyCheck`, `ExerciseLog`, `WorkoutSession`, `WaterLog`) is a simple Cascade-deleted one-to-many.

### 1.3 `dietJson` / `routineJson`: exact stringified shape and hydration path

These two `Student` columns are **opaque `TEXT` columns holding `JSON.stringify()`'d objects** — Postgres never sees them as structured data. The canonical TypeScript shapes (`src/lib/mock-data.ts`) that both API layers agree on:

```ts
interface Meal {
  name: string; time: string; calories: number;
  protein: number; carbs: number; fat: number;   // ← flat, legacy shape as actually stored
  items: string[];
}
interface Exercise {
  name: string; sets: number; reps: string; weight?: string; rest?: string;
}
interface RoutineDay {
  day: string; label: string; muscleGroup: string;
  weekday?: 0|1|2|3|4|5|6;   // optional explicit ISO weekday binding; falls back to ordinal slot→weekday mapping
  exercises: Exercise[];
}
// The full stored objects:
type Diet    = { name: string; totalCalories: number; macros: {protein,carbs,fat}; meals: Meal[] };
type Routine = { name: string; daysPerWeek: number; days: RoutineDay[] };
```

**Read path** (`src/lib/db.ts`):
1. `parseDiet(json)` / `parseRoutine(json)` — `JSON.parse`, with a hardcoded empty-shape fallback (`{name:"Dieta no asignada",...}` / `{name:"Rutina no asignada",...}`) on empty string or parse failure. **Never throws.**
2. `resolveDays(days, catalog)` — for every exercise in every day, if `ejercicioId` is set, looks it up in the coach's live `Ejercicio` catalog and **overwrites** `name`/`muscleGroup`/`bodyweight`/`imageUrl`/`videoUrl` from the catalog (so editing a catalog exercise retroactively updates every routine that references it by ID); falls back to whatever's inline in the JSON for legacy routines authored before the catalog existed. Also fills in defaults: `sets ?? 3, reps ?? "10", weight ?? "", rest ?? "60s"`.

**Write path**: `JSON.stringify(payload)` on every `student.update`/`create` that touches diet/routine. `stripTemplate()` strips `{id, type}` off a `Template` row before writing it onto a student (so the student's copy is a clean snapshot, not a live reference to the template).

**Mobile-specific re-normalization** (`src/app/api/mobile/portal/route.ts`) — because the flat legacy `Meal.protein/carbs/fat` shape and a newer nested `macros:{protein,carbs,fat}` shape can **both** exist across different templates/students, mobile responses always normalize to the nested shape client-side is guaranteed to receive:
```ts
function normaliseMeals(meals) {
  return meals.map(m => ({
    name: m.name ?? "", time: m.time ?? "", calories: m.calories ?? 0,
    items: Array.isArray(m.items) ? m.items : [],
    macros: {
      protein: m.macros?.protein ?? m.protein ?? 0,
      carbs:   m.macros?.carbs   ?? m.carbs   ?? 0,
      fat:     m.macros?.fat     ?? m.fat     ?? 0,
    },
  }));
}
function normaliseRoutineDays(days) {
  return days.map(d => ({
    label: d.label ?? d.day ?? "DÍA",
    focus: d.focus ?? d.muscleGroup ?? undefined,
    dayIndex: d.dayIndex ?? undefined,
    exercises: (d.exercises ?? []).map(ex => ({
      name: ex.name ?? "Ejercicio", sets: ex.sets ?? 3, reps: String(ex.reps ?? "10"),
      muscleGroup: ex.muscleGroup ?? ex.focus ?? undefined,
      tips: Array.isArray(ex.tips) ? ex.tips : undefined,
    })),
  }));
}
```
**This is the exact contract any mobile client must code against** — `GET /api/mobile/portal` is the only endpoint guaranteed to hand back clean, nested, defaulted objects. Consuming `dietJson`/`routineJson` directly (or the web-only `getStudentDetail()` shape) requires re-implementing this normalization, which is exactly the gap identified in §3 below.

---

## 2. Global API Contract Logbook

53 route files, 91 exported HTTP handlers, all under `src/app/api/`. Two auth mechanisms converge on one `SessionUser` shape (see business spec §1.2); role-guard pattern is uniformly `if (!user || user.role !== "X") return 403`. Routes marked **NO_STORE** set `Cache-Control: no-store, max-age=0`.

### `admin/`
- **`GET /api/admin/coaches/[id]/students`** — ADMIN only. `coach.findUnique+include:user` (404 if missing) → `getStudents(id)` (includes lazy `runAutoCron()`). **200:** `{coach:{id,name,email}, students:Student[]}`.
- **`POST /api/admin/coaches`** — ADMIN only. Body `{name,email,password}` (400 if missing). Duplicate email → 409. Creates `User{role:"COACH"}` + empty `Coach` profile. **200:** `{id,name,email}`.
- **`GET /api/admin/overview`** — ADMIN only. Aggregates coach/student/client counts + `MONTHLY_FEE=1200` hardcoded MRR. **200:** `{metrics:{...}, coaches:[...]}`.

### `auth/`
- **`GET,POST /api/auth/[...nextauth]`** — re-exports NextAuth `handlers`. `authorize()`: `findUnique+include` → `bcrypt.compare` → `{id,name,email,role,coachId,studentId}` or `null`.

### `carreras/`
- **`GET /api/carreras`** — any authenticated (401 else). Role-scoped: CLIENT→own; COACH→union of students'; ADMIN→all. **200:** `CarreraDTO[]`.
- **`POST /api/carreras`** — Body `{date?,distanceM,durationS,avgSpeedKmh?,track?}`, numeric-validated (400 else). **201.**
- **`GET /api/carreras/[id]`** — 401/404; CLIENT owner-only (403 else). **200:** `CarreraDTO`.
- **`PATCH /api/carreras/[id]`** — owner-or-ADMIN. Multipart `photo` → `public/uploads/run_${id}_${ts}${ext}`. **200.**
- **`DELETE /api/carreras/[id]`** — same guard. **200:** `{ok:true}`.

### `coach/`
- **`GET/POST /api/coach/connect`** — COACH/ADMIN. Stripe Express account creation/login-link/onboarding-link flow.
- **`POST /api/coach/exercises/seed`** — COACH+coachId. Upserts ~30 hardcoded exercises (compound key `coachId_name`). **200:** `{seeded:count}`.
- **`GET /api/coach/import`** — no auth. Streams a generated `.xlsx` template (15 columns, 3 examples).
- **`POST /api/coach/import`** — COACH/ADMIN. Multipart `excel`(req)+`zip`(opt). Per-row: dup-email skip, stage-validated (defaults "Volumen"), fuzzy photo-match from zip. Transactional per row. **200 always:** `{total,created,skipped,warnings:[...]}`.
- **`DELETE /api/coach/notices/[id]`** — COACH+coachId, ownership-checked. **200:** `{success:true}`.
- **`GET /api/coach/notices`** — COACH+coachId. `take:50`. **200:** `{notices:[...]}`.
- **`GET/PATCH /api/coach/profile`** — COACH+coachId. PATCH validates `monthlyPrice≥0`, `isPublic` boolean, `joinCode` 4-24 chars; unique violation → 409.
- **`DELETE /api/coach/students/[id]`** — COACH+coachId. Soft-unlink (`coachId:null`).
- **`POST /api/coach/students/status`** — COACH/ADMIN. Mutates **`paymentStatus`**, not `isActive`.
- **`GET /api/coach/telemetry`** — COACH+coachId. Today's active-student union of `dailyCheck`+`workoutSession`.

### `community/`
- **`POST /api/community/join`** — CLIENT+studentId. 3 body shapes (`{roomId}`/`{code}`/`{}`); join is **destructive**, replaces prior `coachId` unconditionally.
- **`GET /api/community/messages?coachId=`** — any authenticated. `take:100`.
- **`POST /api/community/messages`** — COACH-exclusive send (403 else).
- **`GET /api/community/public-rooms`** — CLIENT+studentId. Public coaches + current room (even if since made private).

### `ejercicios/`
- **`GET/POST /api/ejercicios`** — COACH/ADMIN (GET), COACH+coachId (POST). Multipart or JSON; bodyweight forces `equipment="Peso corporal"`.
- **`PUT/DELETE /api/ejercicios/[id]`** — COACH/ADMIN, ownership-checked for COACH.

### `me/`
- **`POST /api/me/biometrics`** — CLIENT+studentId. Weight 20-500 validated, transaction: delete-then-create today's entry + update `currentWeight`.
- **`GET/POST /api/me/checks?date=`** — CLIENT+studentId. Upsert(done)/delete(not-done) via compound key.
- **`GET /api/me/coach-price`** — loose auth; no-student → `200 {monthlyPrice:null}`.
- **`GET/POST/PATCH /api/me/logs`** — CLIENT+studentId. PATCH = find-then-update-or-create.
- **`POST /api/me/photos`** — CLIENT+studentId. Multipart, ≤5MB, jpeg/png/webp. 3-tier storage fallback.
- **`PATCH /api/me/prs`** — CLIENT+studentId. `{lift,kg>0}`; PR only increases (silent no-op otherwise).
- **`GET /api/me`** — auth required. **Access gate:** `isActive===false` → `403 ACCOUNT_BLOCKED`; `paymentStatus` never gates. **200:** `{student,detail}`.
- **`POST /api/me`** — CLIENT+studentId. Multipart/JSON weight+photo.
- **`PATCH /api/me/wallet`** — CLIENT+studentId. `{delta≠0}`, negative blocked below 0.

### `mobile/`
All use `verifyMobileToken` directly, raw 401 on invalid token.
- **`GET /api/mobile/community/notices`** — non-CLIENT → `200 []` (not error).
- **`POST /api/mobile/login`** — no auth. Identical 401 for no-user vs bad-password (no enumeration leak). 30-day HS256 JWT. **⚠ Currently carries debug `console.log("[BACKEND IMPACT]")` instrumentation from a prior diagnostic session — should be stripped before shipping.**
- **`GET /api/mobile/me`** — token valid but user deleted → 404.
- **`GET /api/mobile/portal`** — mirrors `/api/me`'s `isActive` gate exactly. **The only endpoint that returns fully-normalized diet/routine JSON (§1.3).**

### `student/`
- **`GET /api/student/food-substitutes`** — no auth, public. Self-seeds 13 default rows if empty.
- **`GET /api/student/latest-notice`** — CLIENT+studentId else `403 {notice:null}` (non-error-shaped body).
- **`POST /api/student/leave-room`** — CLIENT+studentId. `coachId:null`.
- **`GET/POST /api/student/water`** — CLIENT or COACH (COACH passes explicit `studentId`, **no ownership check**).
- **`GET /api/student/workout-session/history`** — CLIENT+studentId else `403 []` (empty array, not error object, by design).
- **`GET/POST/PATCH /api/student/workout-session`** — CLIENT+studentId. POST: explicit logs → upsert; else auto-aggregate from that date's `ExerciseLog` rows.
- **`POST /api/student/workout-session/telemetry`** — CLIENT+studentId. Requires a pre-existing session for that date (404 else). Bad numeric fields silently coerced to `null`, not rejected.

### `students/`
- **`GET /api/students/[id]/{carreras,checks,logs}`** — authenticated; CLIENT own-id-only, COACH/ADMIN unrestricted (no coach-ownership check on target).
- **`POST/PATCH /api/students/[id]/measurements`** — COACH/ADMIN.
- **`POST/DELETE /api/students/[id]/photos`** — COACH/ADMIN.
- **`POST /api/students/[id]/reset-password`** — COACH/ADMIN, min 6 chars, creates a `User` if none exists yet.
- **`GET /api/students/[id]`** — CLIENT own-id-only.
- **`PATCH /api/students/[id]`** — COACH/ADMIN. **Sole field:** `{isActive:boolean}` — the **only** write path for the access gate.
- **`PUT /api/students/[id]`** — COACH/ADMIN. Full-replace `weightHistory`/`measurements`, upsert/delete `ScheduledChange`.
- **`POST /api/students/change-stage`** — COACH/ADMIN. Bulk; immediate or `ScheduledChange` upsert.
- **`GET /api/students`** — CLIENT → `200 []` always. Triggers global `runAutoCron()` on **every** call, including reads.
- **`POST /api/students`** — COACH/ADMIN. Multipart/JSON creation; non-fatal Stripe customer+checkout.

### `subscription/`
- **`POST /api/subscription/cancel`** — CLIENT+studentId. Stripe `cancel_at_period_end` (non-fatal if fails) + always sets local `paymentStatus:"inactive"`.

### `templates/`
- **`GET /api/templates?type=`** — authenticated.
- **`POST/PUT/DELETE /api/templates[/id]`** — COACH/ADMIN.

### `webhooks/`
- **`POST /api/webhooks/stripe`** — Stripe-signature-verified. `invoice.paid`→active, `invoice.payment_failed`→past_due, `customer.subscription.deleted`→inactive, `account.updated`→onboarding complete. **500** triggers Stripe retry.

### Cross-cutting rules for any client (mobile included)
1. **`isActive` vs `paymentStatus`** are independent — only `isActive` gates access; `paymentStatus` is billing-display-only. A mobile client must check `isActive`/`ACCOUNT_BLOCKED`, never infer blocked state from `paymentStatus`.
2. **`getSessionUser()` accepts a mobile Bearer token on web-only-looking routes too** — mobile isn't restricted to `/api/mobile/*`; e.g. `/api/carreras`, `/api/community/messages`, `/api/templates` all work with a mobile JWT.
3. **`runAutoCron()`** fires on every roster read (`getStudents`/`getStudentById`/`getStudentDetail`), applying *all* globally-due scheduled changes — a mobile client polling any of these endpoints can trigger this side effect.

---

## 3. The Global Contrast Audit — Web Monolith vs Mobile Stubs

Compared against the actual sibling project at `../mycoach-mobile/app/` (Expo Router + NativeWind + Moti + `react-native-svg`), **not** the older `mycouch/mobile/` folder inside this repo. `mycoach-mobile` is a from-scratch rebuild: 13 screen files, 3 shared UI components, 4 lib files.

### 3.1 Design-system divergence (the headline finding)
`ROADMAP.md` §3 ("Directrices de Rediseño: Estilo App de Apple") is the web project's declared design source of truth: **"SF Dark Pro"** — pure/near-black backgrounds (`#000000`/`#08080A`), subtle `#121214`/`#1C1C1E` cards, white/silver/gray text hierarchy, high-contrast white-button-black-text CTAs, `rounded-2xl`/`rounded-xl` soft corners, generous padding, glassmorphism (`backdrop-blur-md bg-black/40`). This is the intended primary aesthetic for the **whole product**.

`mycoach-mobile` instead implements, app-wide, a **"tactical HUD / terminal" aesthetic**: `'Courier New'` monospace everywhere, lime-green accent `#CEFF00`/`#a3e635`, uppercase text with heavy letter-spacing (`tracking-widest` / explicit `letterSpacing: 3-5`), bracket-styled button labels (`[ 🔓 DESTRABAR SESIÓN ]`), `//`-prefixed captions, sharp `rounded-sm`/`borderRadius:2` corners (the *opposite* of ROADMAP's soft-corner directive), military/tactical copy ("MISIÓN TÁCTICA", "CALIBRAR CHASIS", "OPERADOR").

**This is not a random deviation** — the exact same terminal aesthetic exists in the web app, but only as a deliberately gamified *accent* layer inside `portal/page.tsx` (the "Coach Broadcast / Intel Feed" drawer, Community roster badges — see business spec, and the earlier full audit's Module 2 §6.11/6.14). Mobile has taken web's secondary/accent design language and promoted it to the *entire app's* primary identity, while the actual primary identity (SF Dark Pro) doesn't exist in mobile at all. Any migration work must either (a) get explicit sign-off that mobile intentionally diverges from `ROADMAP.md`, or (b) rebuild mobile's chrome against SF Dark Pro and demote the terminal aesthetic back to an accent layer, matching web.

### 3.2 Screen-by-screen feature gap

| Web (`portal/page.tsx`, `(dashboard)/coach/*`) | Mobile (`mycoach-mobile/app/`) | Gap |
|---|---|---|
| **Hoy tab** — meal cards, water tracker (posts to `/api/student/water`), day-advance controls, coach-notice banner, macro summary | *No equivalent screen exists.* | **Missing entirely** — no "today" dashboard, no water tracking UI at all. |
| **Progreso tab** — weight chart, photo gallery + before/after comparison, weight-logging form, photo upload, shareable badge export | `profile.tsx` has a read-only weight sparkline + weight-history list, but **no weight-entry form and no photo upload UI** | Read-only fraction only; the two primary write actions (log weight, upload photo) are absent. |
| **Workout tab** — session state machine posts to `/api/student/workout-session` + `/api/student/workout-session/telemetry`, real HealthKit-bound biometrics (comment: "populated via native adapter"), workout history read from `/api/student/workout-session/history` | `(portal)/index.tsx` has an equivalent local state machine (rest timer, set tracking, AsyncStorage persistence) **but never calls any workout-session API** — `NATIVE_BRIDGE` heart-rate is hardcoded-simulated (`142`/`158` bpm constants), and completing a workout only writes to `AsyncStorage`, never to Postgres | **No server persistence at all** — a completed mobile workout is invisible to the coach dashboard and lost on app reinstall/logout. This is the single biggest functional gap. |
| **Perfil tab** — PRs (editable via `PATCH /api/me/prs`), wallet balance, workout history, cancel-subscription flow | `profile.tsx` shows PRs **read-only** (no edit UI), no wallet display, no workout-history list, no cancel-subscription entry point | PRs/history/wallet/cancellation all missing or read-only. |
| **Comunidad tab** — real room join/leave (`/api/community/join`, `/api/student/leave-room`), real notice feed, coach-authored broadcast drawer, roster with rank/streak filters | `community.tsx` fetches real notices (`/api/mobile/community/notices`) correctly, but the "feed" below it is a **hardcoded local array** (`SEED_FEED`) — posting a message only appends to local state, never hits any API; no room-join/leave UI, no roster/rank view | Notices work; everything else (posting, joining/leaving rooms, roster) is fake/local or missing. |
| **Food substitution catalog** (`EquivCatalog`, ingredient swap drawer) | Not present anywhere in mobile | **Missing entirely.** |
| **Coach dashboard** (7 pages: Resumen, Alumnos table, Plantillas, Ejercicios, Pagos, Periodización, Sala) | `(coach)/index.tsx` shows 3 hardcoded `"—"` stat tiles and a static "SIN ALUMNOS REGISTRADOS" empty state — **no data fetching at all, not even a `GET /api/students` call**; `sessions.tsx` and `profile.tsx` are literal `"PRÓXIMAMENTE"` (coming soon) placeholder screens | **~95% missing.** Coach mobile experience is a shell with zero live data, zero roster, zero template/exercise/payment/notice management. |
| **Admin panel** (`/admin`, `/admin/coach/[id]`, `/admin/profile`) | No `(admin)` route group exists in mobile at all | **Missing entirely** — no admin mobile experience, not even a stub. |
| Login / auth | Web: NextAuth cookie, single login screen. Mobile: a 5-step "onboarding calibration" gateway (mission/BMI/TDEE calculator) that funnels into the same `/api/mobile/login` call | Functionally equivalent end result, but mobile's gateway computes and displays BMI/TDEE/mission data (`GRASA`/`MUSCULO`/etc.) **that is never sent to the server or persisted anywhere** — purely decorative onboarding theater right now. |

### 3.3 Code-quality / correctness issues found in `mycoach-mobile` worth fixing during migration, not just noting
- `lib/api.ts` hardcodes the LAN fallback `http://192.168.3.67:3000` and both `lib/session.tsx`'s `login()` and `app/index.tsx`'s `handleLogin()` still carry `console.log("🔘 [DIAGNOSTIC ...]")` / `alert(...)` debug instrumentation from a prior connectivity investigation — should be removed before any release build.
- `lib/session.tsx` line 37's comment says `// Verify token by fetching /api/auth/mobile/me` but the actual call target is the correct `/api/mobile/me` — stale/misleading comment, not a functional bug, but worth cleaning up since it's already caused confusion once.
- Nutrition tab's `checkedMeals` state is **component-local** (`useState`, no `AsyncStorage`, no API) — unlike web, which persists every check via `POST /api/me/checks` and hydrates from `localStorage`/server on load. In mobile, switching tabs or reopening the app silently loses all of today's meal-check progress.
- No `PortalProvider`-level refresh-on-focus — `usePortal()`'s `refresh()` only runs once on mount; if a coach updates a student's plan mid-session, the mobile app won't see it until a manual pull or app restart (web's `portal/page.tsx` has the same limitation, so this isn't strictly a *regression*, just a shared gap worth fixing once during the rebuild rather than porting forward).

---

## 4. Global Step-by-Step Modular Action Plan

Each module below is scoped to be handed to a mobile-focused coding agent independently, in order — later modules assume earlier ones are done. Every module lists its exact API contract dependencies (§2) so the agent doesn't need to re-derive them.

### Module 1 — Global Auth & Session Restore
**Goal:** solidify what's already ~80% working; remove debug cruft; fix the environment-configuration gap that caused the original login-hang incident.
- Move `http://192.168.3.67:3000` out of `lib/api.ts` and into `.env`/`app.config` as `EXPO_PUBLIC_API_URL`, matching how `mycouch/mobile/lib/data/config.ts` already does it correctly — no code should hardcode a LAN IP.
- Strip all `console.log("[DIAGNOSTIC ...]")` and `alert(...)` calls from `lib/session.tsx` and `app/index.tsx`.
- Verify token restore + role-based routing (`(coach)` vs `(portal)`) against all three roles, including ADMIN (currently untested — mobile has no admin routes to route ADMIN into; decide whether ADMIN gets a web-only redirect message or a future admin module).
- Contract: `POST /api/mobile/login`, `GET /api/mobile/me` (§2 `mobile/`).

### Module 2 — Client Nutrition & SVG Macro Rings
**Goal:** bring `nutrition.tsx` from decorative to persisted.
- Wire meal check/uncheck to `POST /api/me/checks` (`{date, kind:"meal", itemKey: mealName, done}`) instead of local-only state; hydrate initial checked-state from `GET /api/me/checks?date=` on mount.
- Add the food-substitution catalog screen/drawer, backed by `GET /api/student/food-substitutes`, matching web's `EquivCatalog` swap flow.
- Keep the existing `MacroRing` SVG component as-is — it's already a faithful, well-built equivalent of web's `CalorieRing`/`MacroBar`.
- Contract: `GET /api/mobile/portal` (diet/meals — already normalized, §1.3), `GET/POST /api/me/checks`, `GET /api/student/food-substitutes`.

### Module 3 — Client Workout Engine (server persistence)
**Goal:** close the single biggest gap — mobile workouts currently never reach Postgres.
- On `handleFinalizar()`, POST the completed session to `POST /api/student/workout-session` (`{date, name, exerciseLogs}` — or omit `exerciseLogs` to use the server's auto-aggregate-from-`ExerciseLog` fallback path, matching web's dual-mode behavior).
- Replace the simulated `NATIVE_BRIDGE` heart-rate constants with a real HealthKit/Health Connect adapter, and POST real readings to `POST /api/student/workout-session/telemetry` — remember the ordering constraint: the `WorkoutSession` row must exist (i.e., finalize or at least create the session) before telemetry POSTs will succeed (404 otherwise).
- Add a workout-history screen backed by `GET /api/student/workout-session/history`, mirroring web's Perfil-tab history list.
- Keep `AsyncStorage` as the in-progress local cache (for offline/background resilience — this part of the existing design is good) but treat server POST as the source of truth once a session completes, not `AsyncStorage`.
- Contract: `GET/POST/PATCH /api/student/workout-session`, `POST /api/student/workout-session/telemetry`, `GET /api/student/workout-session/history`.

### Module 4 — Client Profile Completion
**Goal:** make `profile.tsx` a write-capable screen, not read-only.
- Add a weight-logging form → `POST /api/me/biometrics` (20-500kg client-side pre-validation matching server rules, one-entry-per-day semantics).
- Add photo upload (camera/library picker → multipart `POST /api/me/photos`, mirroring the 5MB/jpeg-png-webp constraints).
- Make PR tiles tappable/editable → `PATCH /api/me/prs`; since the server enforces monotonic-increase, the UI should just always allow submission and trust the (silent) no-op response rather than pre-checking client-side.
- Add wallet balance display (`GET /api/me/wallet`) and a cancel-subscription entry point (`POST /api/subscription/cancel`) with the same confirmation-dialog pattern already used for logout.
- Contract: `POST /api/me/biometrics`, `POST /api/me/photos`, `PATCH /api/me/prs`, `GET/PATCH /api/me/wallet`, `POST /api/subscription/cancel`.

### Module 5 — Community: Real Rooms, Not a Fake Feed
**Goal:** replace `SEED_FEED` and hardcoded avatars with real data.
- Add room join/leave UI (public directory + private code entry) → `POST /api/community/join`, `POST /api/student/leave-room`, `GET /api/community/public-rooms`. Surface the "joining replaces your current room" destructive-action warning in the UI, since the API has no confirmation step of its own.
- Chat posting is CLIENT-read-only per the current API contract (only COACH can `POST /api/community/messages`) — do **not** build a client post-composer that hits that endpoint; either remove the mobile post composer for CLIENT users or repurpose it purely as a "message your coach" pattern if a future endpoint is added. Flag this explicitly to product/design since the current mobile UI implies students can post freely, which the backend does not support.
- Keep the existing notice-fetching logic (`GET /api/mobile/community/notices`) — it's already correct.
- Contract: `POST /api/community/join`, `POST /api/student/leave-room`, `GET /api/community/public-rooms`, `GET /api/community/messages`, `GET /api/mobile/community/notices`.

### Module 6 — Coach Portal Integration (the largest module — build from near-zero)
**Goal:** `(coach)/index.tsx`, `sessions.tsx`, `profile.tsx` currently have no live data at all; this is effectively new construction, not porting.
- **Roster** (`(coach)/index.tsx`): replace the hardcoded `"—"` stats and empty-state with `GET /api/students` (role-scoped server-side already — no client filtering needed), matching web's sortable-table feature set at a mobile-appropriate information density (card list, not a data table).
- **Sessions** (`sessions.tsx`, currently a stub): repurpose as the "Sala" equivalent — telemetry (`GET /api/coach/telemetry`), notices management (`GET/POST via web's coach/notices` pattern — note there's no `POST /api/coach/notices` in the current route list; only `GET`+`DELETE` exist, so notice **creation** must go through `POST /api/community/messages` with `role` implicitly COACH, or a new endpoint must be added — flag this contract gap before building).
- **Profile** (`profile.tsx`, currently a stub): coach pricing (`GET/PATCH /api/coach/profile`), Stripe Connect onboarding (`GET/POST /api/coach/connect`), room public/private + join-code management.
- **Student creation/import**: at minimum the manual-creation wizard (`POST /api/students`, multipart); bulk `.xlsx`/`.zip` import is lower priority for a first mobile coach release given its complexity, but the contract (`POST /api/coach/import`) is documented in §2 when ready.
- **Templates/exercises**: lowest priority for mobile v1 — these are content-authoring-heavy workflows that are plausibly web-only for the foreseeable future; explicitly scope them out of the mobile coach MVP unless product says otherwise.
- Contract: `GET /api/students`, `GET /api/coach/telemetry`, `GET/PATCH /api/coach/profile`, `GET/POST /api/coach/connect`, `POST /api/students`.

### Module 7 — Admin (lowest priority, currently zero mobile surface)
**Goal:** decide scope before building anything.
- Given the admin surface is thin even on web (§4 of the business spec — no settings page, no audit log, read-only drill-down), recommend **not** building a dedicated admin mobile experience in an early phase; instead route ADMIN-role logins to a "please use the web dashboard" screen, or reuse Module 6's roster screen read-only if admin mobile access turns out to be needed.
- If built later: `GET /api/admin/overview`, `GET /api/admin/coaches/[id]/students`, `POST /api/admin/coaches` are the only three endpoints available — same as web's entire admin API surface, nothing more exists to build against.

### Module 8 — Design System Reconciliation
**Goal:** resolve §3.1's divergence before (or alongside) the functional modules above, since every screen touched in Modules 2-7 will otherwise need re-skinning twice.
- Get explicit product sign-off: is mobile's tactical-HUD identity the *new* intended primary aesthetic (in which case `ROADMAP.md` should be updated to reflect it), or should mobile converge on SF Dark Pro with the terminal look demoted to an accent (matching web's actual current split)?
- Either decision should be made once, at the top, rather than discovered piecemeal per-module.
