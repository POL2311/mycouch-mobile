# MyCoach — Global Business Specification
Web repo: `/Users/alatorre/Desktop/images/mycouch`. Source of truth for every business rule below is the live code — `src/app/**`, `src/app/api/**`, `prisma/schema.prisma`. No rule here is aspirational; every behavior described is what the shipped code actually does today.

---

## 1. Role & Permission Matrix

### 1.1 The three roles
`prisma/schema.prisma` defines a single `Role` enum — `ADMIN`, `COACH`, `CLIENT` — stored on `User.role` (`@default(CLIENT)`). This is the **only** source of truth for permissions; there is no separate roles/scopes table.

| | **CLIENTE (CLIENT)** | **COACH** | **ADMIN** |
|---|---|---|---|
| **Identity link** | `User.student → Student.id` (`studentId`) | `User.coachProfile → Coach.id` (`coachId`) | none — role alone is authoritative |
| **Can self-register?** | Yes, only via a coach's `POST /api/students` (coach-created) or bulk `POST /api/coach/import` — never self-signup | No self-signup — created only by `POST /api/admin/coaches` (ADMIN-only) | No creation path in the API at all — must be seeded directly in the database |
| **Session mechanism** | NextAuth cookie (web) or 30-day mobile Bearer JWT — both resolve to the identical `SessionUser` shape | Same dual mechanism | Same dual mechanism |
| **Primary surface** | `/portal` (web) — a 5-tab app shell (Hoy / Progreso / Workout / Comunidad / Perfil) | `/coach` route group — 7-page dashboard (Resumen, Alumnos, Plantillas, Ejercicios, Pagos, Periodización, Sala, Actividad) | `/admin` — SaaS-level oversight (3 pages) |
| **Blocked-account behavior** | `Student.isActive === false` → `403 ACCOUNT_BLOCKED`, redirected client-side to `/portal/blocked` | N/A (coaches are never access-gated by `isActive`) | N/A |

### 1.2 Security context detail

There is **no `middleware.ts`** anywhere in the app and none of the three route-group layouts perform a server-side auth check — every layout (`(dashboard)/layout.tsx`, `admin/layout.tsx`, `portal/layout.tsx`) is a trivial visual shell. **All authorization is enforced per-API-endpoint**, inside each `route.ts` handler, via a single shared chokepoint:

```ts
// src/lib/session.ts
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();                 // 1) NextAuth cookie session (web)
  if (session?.user) return session.user as SessionUser;
  const authHeader = (await headers()).get("authorization");
  if (authHeader) return await verifyMobileToken(authHeader); // 2) Mobile Bearer JWT fallback
  return null;
}
```

Both paths converge on the identical `{ id, name?, email?, role, coachId?, studentId? }` shape, signed with the same `AUTH_SECRET`. This means **any web-session-guarded endpoint also accepts a valid mobile token transparently** — mobile is not a second, drift-prone auth system; it's the same rules with a different transport.

**Denial pattern** (uniform across ~50 handlers):
- No session at all → `401` (occasionally folded into `403`), body `{ error: "No autenticado" }`.
- Session present but wrong role → `403`, body varies per-endpoint (`"No autorizado"`, `"Forbidden"`, `"Sin ficha de alumno"`) but the status code is consistent.
- **No server-side page redirects exist anywhere.** `/portal/blocked` is reached by client code checking a fetch's error body, not by a guard.

### 1.3 CLIENTE capabilities

Identified by `role === "CLIENT"` **and** a non-null `studentId` — both are required together on nearly every client endpoint. Full self-service surface:

- **Own profile & plan**: read current diet/routine assignment, weight/body-fat/measurements, personal records (squat/deadlift/bench — write-once-increase-only), wallet balance.
- **Daily compliance tracking**: check off individual meals and individual routine exercises per day (`DailyCheck` rows, compound-keyed by `studentId+date+kind+itemKey` so re-checking is idempotent).
- **Biometric logging**: log a new body weight (20–500kg validated, one entry per calendar day — re-logging same day overwrites), log workout-session telemetry (heart rate, calories, device source) from a connected wearable.
- **Progress photos**: upload progress photos (JPEG/PNG/WebP, ≤5MB, 3-tier storage fallback: Vercel Blob → local disk → base64-in-DB).
- **Community**: join a coach's room by public directory or private join code (destructive — always replaces any prior coach link), leave a room, read the room's chat/notice feed, post chat messages are **not** available to CLIENT (read-only).
- **Subscription self-service**: cancel their own Stripe subscription; reactivate via a Stripe Checkout link if blocked.
- **Cannot**: see any other student's data, write to coach-owned resources (templates, exercise catalog, notices), or access `/coach/*` / `/admin/*` surfaces at all (hard role-gated).

### 1.4 COACH capabilities

Identified by `role === "COACH"` **and** a non-null `coachId` — `coachId` alone missing fails the guard even with the right role.

- **Roster ownership**: create students (individually via a 4-step wizard, or in bulk via `.xlsx`+`.zip` import), edit any owned student's full record, reset a student's password, soft-unlink a student (sets `coachId: null`, preserves all historical data — never a hard delete).
- **Plan authoring**: create/edit/delete diet and routine **templates** (shared library, not per-student), assign a template to one or many students at once via a bulk "change stage" operation (immediate or scheduled for a future date), maintain a personal exercise catalog (with images/video) referenced by name inside routine JSON.
- **Progress monitoring**: view every student's weight history, measurements, adherence % (`completionRate`), streak, and a computed team-wide "adherence curve" chart; see daily team telemetry (how many students checked something in today).
- **Communication**: exclusive right to **post** to the room's group-chat/notice feed (students can only read); manage the room's public/private visibility and join code.
- **Billing**: set their own monthly subscription price, view MRR/payment-status breakdown of their roster, onboard to Stripe Connect (Express account) to receive payouts, manually flag a student's `paymentStatus` (distinct from — and does **not** affect — the `isActive` access gate).
- **Access gate control**: the **sole** write path for `Student.isActive` is a coach/admin `PATCH /api/students/[id]` — this is the only thing that actually blocks/unblocks a student's portal access, independent of billing status.
- **Cannot**: touch another coach's students or exercise catalog (ownership re-checked after the role gate on every mutating endpoint), access `/admin/*`, or access any `/api/me/*` client-only surface.

### 1.5 ADMIN capabilities

Role alone is sufficient (no linked entity) — cannot be created through any API path, must be seeded directly in Postgres.

- **Platform-wide oversight**: `GET /api/admin/overview` — total coaches, total students, total clients, active students, platform-wide MRR (hardcoded `$1200 MXN` monthly-fee assumption).
- **Coach account management**: create new coach accounts (`POST /api/admin/coaches` — name/email/password, hashed with bcrypt), drill into any individual coach's student roster read-only.
- **Coach-or-admin superset access**: on nearly every coach-owned resource (students, exercises, templates, Stripe Connect, bulk import), ADMIN passes the same gate as COACH but **bypasses the `coachId` ownership scoping** — sees/edits across all coaches, not just one.
- **Cannot**: access any CLIENT-only endpoint (`/api/me/*`, `/api/student/*`) — those check `role === "CLIENT"` exactly, ADMIN included would still be rejected.

---

## 2. Client Portal Ecosystem

The entire client-facing product lives in one 8,549-line client component (`src/app/portal/page.tsx`), a 5-tab SPA shell. All workflows below describe what a logged-in `CLIENT` actually does inside it.

### 2.1 Workout tracker & exercise check-offs
- The active day is derived from the real ISO weekday by default (Monday = slot 0), but the student can manually advance/rewind 1–7 within the current week; the choice persists in `localStorage`.
- Starting a session opens a state machine (`IDLE → in-progress → complete`) that survives switching tabs — the workout doesn't reset if the student checks their nutrition mid-session.
- Each exercise is logged set-by-set with a rest timer (default 90s) between sets; a "focus mode" walks through one exercise at a time.
- Completing all exercises for the day fires a celebration modal with an animated duration/exercise-count counter, and the full cumulative day's completion list is POSTed to the server — **the server upsert is replace-semantics, not merge**: whatever the client sends for that date fully replaces what was there (deliberate design, not a bug).
- If the phone is connected to a wearable, live biometrics (heart rate, calories) stream in during the session and are POSTed as telemetry attached to that day's session record — but **a `WorkoutSession` row must already exist for that date** before telemetry can attach (telemetry-before-session fails with 404).
- **Midnight rollover**: a 60-second poll detects the date changing while the app is open and hard-resets the entire in-progress session state, clears local caches, and re-points the active day at "today" — explicitly, past dates' data in Postgres is never touched by this reset.

### 2.2 Biometrics logger
- Weight: single numeric entry per calendar day (20–500kg range-validated); logging again the same day overwrites, it does not create a second row.
- Body-fat %, height: set by the coach when building the student's profile, read-only to the student in the current implementation.
- Personal records (squat/deadlift/bench): student-submitted, but the server enforces **monotonic increase only** — submitting a lower number than the current PR is silently ignored (no error, just returns the unchanged current value).
- Progress photos: labeled (default "FRONTAL"), timestamped, used to build a before/after comparison gallery in the Progress tab.

### 2.3 Caloric/macro targets & meal verification
- Each assigned diet has a name, a total daily calorie target, and macro targets (protein/carbs/fat in grams).
- Meals are individually checkable; checking a meal adds its calories/macros to a running "consumed" total shown against the target in a circular progress ring.
- Un-checking is allowed (toggling, not a one-way action) up until the day rolls over.
- A food-substitution catalog lets the student swap a prescribed ingredient for a nutritionally-equivalent alternative (matched by macro ratio, not calorie-for-calorie) without breaking the day's macro math.
- Completing every meal for the day fires its own celebration modal, separate from the workout one.

### 2.4 Community notice interactions
- A student belongs to at most one coach's "room" at a time; joining a new room (by public directory listing or private join code) **immediately and unconditionally replaces** any existing room link — there is no confirmation step or merge.
- The room has two distinct message streams sharing one underlying table (`GroupMessage`, distinguished only by `role`): coach-authored **broadcast notices** (student-read-only, surfaced in a dedicated "Coach Broadcast / Intel Feed" terminal-styled drawer) and general team chat (both coach and students can read; **only the coach can post** — students cannot send chat messages through the current API).
- Leaving a room clears the link (`coachId: null`) but does not delete any of the student's historical data.

---

## 3. Coach Dashboard Ecosystem

### 3.1 Client assignment
Three paths onto a coach's roster, in increasing order of scale:
1. **Manual creation** — a 4-step wizard (Registro → Físico → Medidas → Fotos) for one student at a time, optionally kicking off a Stripe subscription checkout immediately.
2. **Bulk `.xlsx` import** — a downloadable template with 15 required Spanish-labeled columns; rows are validated and inserted transactionally one at a time, with a photo `.zip` fuzzy-matched by filename against 4 photo columns (month-1/month-2, front/profile). Duplicate emails are skipped with a warning, not treated as an error for the whole batch.
3. **Self-join via room code** — a student who already has a login joins a coach's room using a public directory listing or a private join code; this **sets** `Student.coachId`, effectively assigning them to that coach.

Unassigning is always a soft operation (`coachId: null`) — historical logs, weights, and photos are never deleted when a student leaves or is unlinked.

### 3.2 Routine generation & diet assignment writing
- Diets and routines are authored as reusable **templates** (shared library per coach, or global if `coachId` is null), not written per-student from scratch each time.
- A routine template is a list of days, each with a muscle-group focus and a list of exercises (name, sets, reps, optional weight/rest); exercises can reference the coach's own exercise catalog by ID (so name/image/video/muscle-group stay in sync if the catalog entry is edited later) or be freeform text.
- Assigning a template to students is a **bulk operation** — select any number of students, pick a target stage + optional diet/routine template, and choose either immediate application or a future execution date. Future-dated assignments queue as a `ScheduledChange` row that a background-style cron (actually triggered lazily on the next roster read) applies once the date arrives.
- Macro/weight-limit overrides can be layered on top of a template at assignment time without editing the template itself (merged into the resulting JSON per-student).

### 3.3 Progress analytics monitoring
- Per-student: weight trend, adherence % (`completionRate`), day-streak, payment status — all visible in the main roster table, sortable by any column.
- Team-wide: a custom-built (no charting library) adherence curve plotting every student's completion rate sorted descending, and a live "today" telemetry snapshot (how many of today's `DailyCheck`/`WorkoutSession` rows exist across the roster right now).
- Periodization view: a stage-distribution breakdown (Volumen/Definición/Mantenimiento/Recomposición) plus a forward-looking timeline of everyone with a pending scheduled stage change.

### 3.4 Broadcasting team notices
- A coach posts a notice to their room's notice board; it immediately appears in every linked student's "Coach Broadcast" drawer, most-recent-first, with the newest entry visually highlighted as "live."
- Notices can be deleted individually from the coach's "Sala" panel; deletion is ownership-checked (a coach can only delete their own room's notices).
- The notice board and the general team chat share one table but are functionally separate feeds by convention (`role: "COACH"` rows = notices; mixed-role rows = chat).

---

## 4. Admin Control Panel Ecosystem

### 4.1 System configuration
The admin surface is intentionally thin — there is no global feature-flag system, no platform-wide settings page, and no audit log. The only "configuration" surface is per-coach account creation.

### 4.2 Global user management
- Admin creates coach accounts directly (name/email/password) — this is the **only** account-creation path that doesn't require a coach already existing (chicken-and-egg: the very first coach on the platform must be created by an admin).
- Admin can view (read-only) any coach's full student roster by drilling into `/admin/coach/[coachId]`, and from there navigate straight into the same student-detail view a coach would use (`/coach/students/[id]`) — admin doesn't have a parallel student-detail UI, it reuses the coach one.
- There is no user-deletion or user-suspension workflow anywhere in the admin surface — the only account state control that exists at all is the coach-level `isActive` toggle on individual students.

### 4.3 Core administrative workflows
- **Platform health snapshot**: total coaches, total students/clients, active-student count, and a hardcoded-fee MRR estimate — refreshed on page load, not real-time.
- **Per-coach financial rollup**: for each coach in the SaaS, their own student count, active count, and estimated MRR contribution, computed the same way as the coach's own dashboard would compute it.
- Admin's own account management is limited to viewing their name/email and signing out — there's no admin-to-admin management (no way to create a second admin through the UI; must be done at the database level).
