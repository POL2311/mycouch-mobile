# MYCOACH — GLOBAL MASTER ARCHITECTURE SPECIFICATION

**Repository:** `/Users/alatorre/Desktop/images/mycouch` · **Branch:** `nuevoultimo` · **Generated:** 2026-07-02
**Method:** Every statement in this document was extracted from the live code — `prisma/schema.prisma`, `src/lib/db.ts` (1,443 lines), `src/lib/session.ts`, `src/lib/mock-data.ts`, `src/app/globals.css`, the 8,549-line client monolith `src/app/portal/page.tsx`, all coach/admin pages, and all 54 API route files under `src/app/api/` (77 exported HTTP handlers). Nothing here is aspirational; where the code disagrees with folklore (e.g. "53 routes / 91 handlers"), the code wins and the discrepancy is flagged.

**Verified surface counts (as of this audit):**
- **54** `route.ts` files under `src/app/api/`
- **77** exported HTTP handlers: 75 `export async function GET|POST|PUT|PATCH|DELETE` declarations + the 2 handlers re-exported by `export const { GET, POST } = handlers` in `auth/[...nextauth]/route.ts`
- **16** Prisma models + **2** enums
- **1** client monolith: `src/app/portal/page.tsx` at 8,549 lines
- **10** coach/admin dashboard pages + **17** shared components in `src/components/`

---

# 1. MODEL DATABASE & DATA CONTRACT LAYER

## 1.1 Datasource, Generator & Enums

`prisma/schema.prisma` targets **PostgreSQL on Neon** through two env vars — `DATABASE_URL` (pooled) and `DIRECT_URL` (direct, for migrations):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  ADMIN
  COACH
  CLIENT
}

enum MembershipTier {
  DIET_ONLY
  ROUTINE_ONLY
  FULL
}
```

`Role` lives on `User.role` and is the **only** permission primitive in the platform — there is no scopes/permissions table. `MembershipTier` lives on `Student.membershipTier` and defaults to `FULL`.

## 1.2 Full Model Blueprint (every model, field, relation, index — verbatim)

### `User` — authentication identity (all 3 roles)

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(CLIENT)
  createdAt    DateTime @default(now())

  coachProfile Coach?   @relation("CoachUser")
  student      Student? @relation("StudentUser")
  carreras     Carrera[]
}
```

- `passwordHash` is bcrypt (`bcryptjs`, cost 10).
- The two optional 1:1 bridges (`coachProfile`, `student`) are mutually exclusive **by convention only** — nothing at the DB level prevents a `User` from having both.
- `carreras` (Strava-style runs) hang off `User`, **not** `Student` — the only student-generated data keyed this way.

### `Coach` — multi-tenant owner of students, templates, exercise catalog

```prisma
model Coach {
  id                       String     @id @default(cuid())
  userId                   String     @unique
  user                     User       @relation("CoachUser", fields: [userId], references: [id], onDelete: Cascade)
  students                 Student[]
  templates                Template[]
  ejercicios               Ejercicio[]
  stripeConnectId          String?
  stripeOnboardingComplete Boolean    @default(false)
  monthlyPrice             Float      @default(1200)
  joinCode                 String?    @unique
  isPublic                 Boolean    @default(false)
  createdAt                DateTime   @default(now())
}
```

- `monthlyPrice` defaults to **1200 (MXN)** — the same number hardcoded as `MONTHLY_FEE` in `/api/admin/overview` MRR math.
- `joinCode` is globally `@unique` (private room entry key, stored uppercase, validated 4–24 chars by `PATCH /api/coach/profile`).
- `isPublic` gates appearance in the public room directory (`GET /api/community/public-rooms`).
- `stripeConnectId` + `stripeOnboardingComplete` track the Stripe Express Connect onboarding lifecycle; the flag is flipped only by the `account.updated` webhook.

### `Student` — the largest model; the true "client record"

```prisma
model Student {
  id             String @id @default(cuid())
  name           String
  email          String
  avatarInitials String
  avatarColor    String
  currentWeight  Float
  previousWeight Float
  lastWeighIn    String
  stage          String
  stageNumber    Int

  isActive             Boolean        @default(true)
  membershipTier       MembershipTier @default(FULL)
  paymentStatus        String         @default("inactive")
  stripeCustomerId     String?
  stripeSubscriptionId String?
  joinedDate           String
  streak               Int     @default(0)
  completionRate       Int     @default(0)

  height        Float?
  bodyFat       Float?
  photoName     String?
  notes         String  @default("")
  nextStageDate String?

  dietJson    String @default("")
  routineJson String @default("")

  prSquat       Float @default(0)
  prDeadlift    Float @default(0)
  prBench       Float @default(0)
  walletBalance Float @default(0)

  weightHistory    WeightEntry[]
  measurements     Measurement[]
  photos           ProgressPhoto[]
  scheduledChange  ScheduledChange?
  dailyChecks      DailyCheck[]
  exerciseLogs     ExerciseLog[]
  workoutSessions  WorkoutSession[]
  waterLogs        WaterLog[]

  coachId String?
  coach   Coach?  @relation(fields: [coachId], references: [id], onDelete: SetNull)

  userId String? @unique
  user   User?   @relation("StudentUser", fields: [userId], references: [id], onDelete: SetNull)

  createdAt DateTime @default(now())
}
```

Field-by-field semantics, exactly as the code treats them:

| Field | Type | Semantics observed in code |
|---|---|---|
| `avatarInitials` / `avatarColor` | String | UI-only; `avatarColor` stores a full CSS gradient string, e.g. `"linear-gradient(135deg, #8b5cf6, #ec4899)"` |
| `currentWeight` / `previousWeight` / `lastWeighIn` | Float/Float/String | `lastWeighIn` is a `YYYY-MM-DD` **string**, not a DateTime. `POST /api/me` shifts current→previous on each new weigh-in |
| `stage` / `stageNumber` | String/Int | `stage` is a plain string, canonical values: `"Volumen"`, `"Definición"`, `"Mantenimiento"`, `"Recomposición"`; `stageNumber` is the phase ordinal within the stage |
| `isActive` | Boolean | **The sole portal/mobile access gate.** `false` → `403 ACCOUNT_BLOCKED` on `/api/me` and `/api/mobile/portal`. Written ONLY by `PATCH /api/students/[id]` |
| `paymentStatus` | String | Billing display only — `"active" \| "inactive" \| "grace_period" \| "past_due"`. **Never** blocks access. Written by Stripe webhooks and `POST /api/coach/students/status` |
| `joinedDate` | String | `YYYY-MM-DD` string set at creation |
| `streak` / `completionRate` | Int | **Not automatically recalculated anywhere server-side.** Seeded at creation (`streak: 1, completionRate: 100` via the wizard `POST /api/students`; `streak: 0, completionRate: 0` via bulk import) and thereafter only rewritten when a coach PUT sends new scalar values. The portal *displays* `student.streak`; it never writes it |
| `dietJson` / `routineJson` | String | Opaque stringified JSON — full deconstruction in §1.4 |
| `prSquat` / `prDeadlift` / `prBench` | Float | Student-writable via `PATCH /api/me/prs`, monotonic-increase-only |
| `walletBalance` | Float | Written by `PATCH /api/me/wallet` with a `delta`; server blocks going below 0 |
| `coachId` | String? `onDelete: SetNull` | Nullable → a student can exist roster-less; unlinking never deletes history |
| `userId` | String? `@unique`, `onDelete: SetNull` | Bridge to the login account; `provisionUserForStudent()` creates the `User` (default password `"mycouchpassword"`) and links it |

### Progress children of `Student` (all `onDelete: Cascade`)

```prisma
model WeightEntry {
  id        String  @id @default(cuid())
  studentId String
  student   Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  date      String
  weight    Float
}

model Measurement {
  id        String  @id @default(cuid())
  studentId String
  student   Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  date      String
  chest     Float   @default(0)
  waist     Float   @default(0)
  hips      Float   @default(0)
  armL      Float   @default(0)
  armR      Float   @default(0)
  thighL    Float   @default(0)
  thighR    Float   @default(0)
}

model ProgressPhoto {
  id        String   @id @default(cuid())
  studentId String
  student   Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  url       String
  label     String   @default("")
  weight    Float?
  createdAt DateTime @default(now())
}

model ScheduledChange {
  id                String  @id @default(cuid())
  studentId         String  @unique
  student           Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  executionDate     String
  stage             String
  stageNumber       Int
  dietTemplateId    String?
  routineTemplateId String?
}
```

- `ScheduledChange` is a strict 1:1 (`studentId @unique`) — a student can have at most **one** pending future change; scheduling again upserts/replaces it. It is the queue that the lazy `runAutoCron()` drains (§4.4).
- `ProgressPhoto.url` may hold a `/uploads/...` path, a Vercel Blob URL, or a base64 `data:` URI (3-tier storage fallback, §2 `me/photos`).

### `Template` — reusable diet/routine library

```prisma
model Template {
  id        String   @id @default(cuid())
  type      String
  name      String
  dataJson  String
  coachId   String?
  coach     Coach?   @relation(fields: [coachId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
}
```

- `type` is a **plain string** (`"diet"` | `"routine"`), not an enum.
- `dataJson` holds the same shape as `dietJson`/`routineJson` minus `{id, type, name}` (they live in columns); `toTemplate()` re-spreads it, `stripTemplate()` removes `{id, type}` before a template snapshot is copied onto a student.
- Nullable `coachId` permits global/shared templates.

### `ExerciseLog` — per-exercise execution record (prescribed vs. actual)

```prisma
model ExerciseLog {
  id               String   @id @default(cuid())
  studentId        String
  student          Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  date             String   // YYYY-MM-DD
  ejercicioId      String?  // referencia al catálogo (si aplica)
  exerciseName     String
  muscleGroup      String?
  bodyweight       Boolean  @default(false)
  prescribedSets   Int      @default(0)
  prescribedReps   String   @default("")
  prescribedWeight String?
  setsJson         String   @default("[]") // [{ reps, weight, done }]
  completed        Boolean  @default(false)
  createdAt        DateTime @default(now())
}
```

- `ejercicioId` is a **loose reference** (no FK) to the coach's `Ejercicio` catalog.
- `setsJson` deconstruction in §1.4.3.

### `Ejercicio` — the coach's exercise catalog

```prisma
model Ejercicio {
  id          String   @id @default(cuid())
  coachId     String
  coach       Coach    @relation(fields: [coachId], references: [id], onDelete: Cascade)
  name        String
  muscleGroup String   // Pecho, Espalda, Pierna, Hombro, Brazo, Core...
  equipment   String   // Barra, Mancuerna, Polea, Peso corporal, Máquina...
  bodyweight  Boolean  @default(false)
  imageUrl    String?
  videoUrl    String?
  createdAt   DateTime @default(now())

  @@unique([coachId, name])
}
```

- The compound unique `@@unique([coachId, name])` makes the 30-exercise seed (`POST /api/coach/exercises/seed`) idempotent via `upsert({ where: { coachId_name: … } })`.
- Canonical seeded muscle groups: Pecho, Espalda, Hombro, Pierna, Glúteo, Brazo, Core, Cardio. Canonical equipment values: Barra, Mancuerna, Polea, Peso corporal, Máquina, Banda.

### `DailyCheck` — meal/exercise compliance ticks

```prisma
model DailyCheck {
  id        String   @id @default(cuid())
  studentId String
  student   Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  date      String   // YYYY-MM-DD
  kind      String   // "meal" | "exercise"
  itemKey   String   // identificador del ítem (nombre de comida, o "día|ejercicio")
  createdAt DateTime @default(now())

  @@unique([studentId, date, kind, itemKey])
}
```

- The 4-column compound unique key makes checking idempotent: check = `upsert` (empty update), uncheck = `deleteMany` on the same tuple.
- `itemKey` convention: for meals it is the meal name (e.g. `"Desayuno"`); for exercises it is `"<dayLabel>|<exerciseName>"`.

### `WorkoutSession` + `WorkoutBiometrics` — executed sessions & wearable telemetry

```prisma
model WorkoutSession {
  id           String              @id @default(cuid())
  studentId    String
  student      Student             @relation(fields: [studentId], references: [id], onDelete: Cascade)
  routineId    String?             // referencia opcional a la plantilla de rutina
  name         String              // ej. "Push Day · Lunes"
  date         String              // YYYY-MM-DD
  completed    Boolean             @default(false)
  exerciseLogs String              @default("[]") // JSON: SessionExercise[]
  notes        String?
  biometrics   WorkoutBiometrics?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
}

model WorkoutBiometrics {
  id              String         @id @default(cuid())
  sessionId       String         @unique
  session         WorkoutSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  avgHeartRate    Int?           // bpm – promedio durante la sesión
  maxHeartRate    Int?           // bpm – valor pico registrado
  activeCalories  Int?           // kcal – energía activa metabólica
  totalCalories   Int?           // kcal – gasto energético total
  deviceSource    String?        // "Apple Watch Ultra", "Garmin Forerunner", "Galaxy Watch", etc.
  heartRateSeries Json?          // [{ t: ISO8601, bpm: Int }] – serie temporal para gráficas futuras
  createdAt       DateTime       @default(now())
}
```

- `WorkoutBiometrics.heartRateSeries` is the **only native Postgres `Json` column in the entire schema** — every other structured payload is a stringified `String` column.
- The 1:1 is enforced by `sessionId @unique`; telemetry upserts against it.

### `FoodSubstitute`, `WaterLog`, `GroupMessage`, `Carrera`

```prisma
model FoodSubstitute {
  id            String   @id @default(cuid())
  category      String   // "Carbohidratos" | "Proteínas" | "Grasas"
  originalFood  String   // alimento de referencia (etiqueta, no se usa como FK)
  substituteFood String  // nombre del sustituto a mostrar
  ratio         Float    // g de substituteFood por g del macro dominante (proteína o carbs)
  createdAt     DateTime @default(now())
}

model WaterLog {
  id        String   @id @default(cuid())
  studentId String
  student   Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  date      String   // YYYY-MM-DD
  amountMl  Int
  createdAt DateTime @default(now())
}

model GroupMessage {
  id         String   @id @default(cuid())
  coachId    String
  senderId   String
  senderName String
  role       String   @default("CLIENT")
  content    String
  imageUrl   String?
  createdAt  DateTime @default(now())

  @@index([coachId, createdAt])
}

model Carrera {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date        String
  distanceM   Float
  durationS   Int
  avgSpeedKmh Float
  trackJson   String   // JSON.stringify(GpsPoint[]) — puntos GPS de la silueta
  photoUrl    String?  // foto de fondo elegida para compartir
  createdAt   DateTime @default(now())
}
```

- `GroupMessage.coachId` is a **plain indexed column, not a declared relation** — the room key. The single `@@index([coachId, createdAt])` is the only explicit secondary index in the schema (everything else rides on `@id`/`@unique` implicit indexes).
- `GroupMessage` doubles as **both** the team chat and the coach notice board; the two feeds are distinguished purely by the `role` column (`role: "COACH"` rows = notices).
- `Carrera` (mobile-first run tracking) is keyed to `User`, so a coach resolves student runs by first mapping `Student.userId`.
- `FoodSubstitute` is static reference data, self-seeded with 13 rows on the first `GET /api/student/food-substitutes` (list in §2).

## 1.3 Relational Bridge & Cascade Map

| Relation | Cardinality | Delete behavior | Notes |
|---|---|---|---|
| `User ↔ Coach` | 1:1 optional (`Coach.userId @unique`) | Cascade (delete User → delete Coach) | |
| `User ↔ Student` | 1:1 optional (`Student.userId @unique`) | SetNull (delete User → orphan Student) | Student data survives account deletion |
| `Coach ↔ Student` | 1:N, nullable FK | SetNull | Soft-unlink is the only "removal" — history preserved |
| `Coach ↔ Template` | 1:N, nullable FK | SetNull | Null coachId = global template |
| `Coach ↔ Ejercicio` | 1:N | Cascade | Catalog dies with the coach |
| `Student ↔ WeightEntry / Measurement / ProgressPhoto / DailyCheck / ExerciseLog / WorkoutSession / WaterLog` | 1:N | Cascade | Hard student delete removes everything |
| `Student ↔ ScheduledChange` | 1:1 (`studentId @unique`) | Cascade | At most one pending change |
| `WorkoutSession ↔ WorkoutBiometrics` | 1:1 (`sessionId @unique`) | Cascade | |
| `User ↔ Carrera` | 1:N | Cascade | |
| `Routine/Diet ↔ Days/Meals/Exercises` | **not relational at all** | n/a | Entirely JSON-shape convention (§1.4); `Ejercicio` is joined into the JSON at read time by `resolveDays()` |

## 1.4 Opaque JSON Deconstruction — `dietJson` & `routineJson`

`Student.dietJson` and `Student.routineJson` are **opaque Postgres `TEXT` columns holding `JSON.stringify()`'d objects**. Neon never sees them as structured data; there is no `Meal`, `Day`, or `RoutineExercise` table. The contract lives entirely in application code:

- **Canonical authoring types:** `src/lib/mock-data.ts` (`Meal`, `Exercise`, `RoutineDay`, `StudentDetail`)
- **Write path:** `JSON.stringify(...)` inside `addStudent()`, `updateStudent()`, `applyStageChange()`, `runAutoCron()` in `src/lib/db.ts`
- **Read path:** `parseDiet()` / `parseRoutine()` → `resolveDays()` in `src/lib/db.ts`, plus the mobile normalizers in `src/app/api/mobile/portal/route.ts`

### 1.4.1 Exact production `dietJson` content (full, un-truncated)

This is the real seed/production shape (the "Hipocalórica Definición" plan from `mock-data.ts` `BASE_DETAIL`, which is what actually gets stringified into the column). Note the **flat legacy macro fields** (`protein`, `carbs`, `fat` directly on each meal) — this is the dominant stored shape:

```json
{
  "name": "Hipocalórica Definición",
  "totalCalories": 1750,
  "macros": { "protein": 140, "carbs": 160, "fat": 50 },
  "meals": [
    {
      "name": "Desayuno",
      "time": "07:00",
      "calories": 380,
      "protein": 30,
      "carbs": 40,
      "fat": 10,
      "items": ["3 claras + 1 huevo entero revuelto", "½ taza avena con canela", "½ plátano"]
    },
    {
      "name": "Snack AM",
      "time": "10:00",
      "calories": 200,
      "protein": 25,
      "carbs": 15,
      "fat": 5,
      "items": ["Yogur griego natural 150g", "10 almendras"]
    },
    {
      "name": "Comida",
      "time": "13:30",
      "calories": 520,
      "protein": 40,
      "carbs": 50,
      "fat": 15,
      "items": ["150g pechuga de pollo a la plancha", "¾ taza arroz integral", "Ensalada mixta con limón", "1 cda aceite de oliva"]
    },
    {
      "name": "Snack PM",
      "time": "16:30",
      "calories": 180,
      "protein": 25,
      "carbs": 10,
      "fat": 5,
      "items": ["Scoop de proteína whey con agua", "1 manzana"]
    },
    {
      "name": "Cena",
      "time": "20:00",
      "calories": 470,
      "protein": 35,
      "carbs": 45,
      "fat": 15,
      "items": ["150g salmón al horno", "Camote asado 120g", "Brócoli al vapor", "1 cda aceite de oliva"]
    }
  ]
}
```

A **newer authored variant** also exists in the wild (the portal's own `Meal` interface, `portal/page.tsx` lines 42–49): meals may instead carry `macros: { protein, carbs, fat }` nested, plus an optional `ingredients: Ingredient[]` array where each ingredient is `{ name, grams, calories, unit?, unitQty?, icon?, macros?: { protein, carbs, fat } }`. **Both shapes coexist in production rows.** Every consumer must therefore read macros as `m.macros?.protein ?? m.protein ?? 0` — which is exactly what the mobile normalizer does (§1.4.4).

### 1.4.2 Exact production `routineJson` content (full 5-day PPL, un-truncated)

```json
{
  "name": "PPL Definición 5 días",
  "daysPerWeek": 5,
  "days": [
    {
      "day": "Lunes",
      "label": "Push",
      "muscleGroup": "Pecho · Hombro · Tríceps",
      "exercises": [
        { "name": "Press Banca", "sets": 4, "reps": "10", "weight": "40 kg", "rest": "90s" },
        { "name": "Press Inclinado Mancuernas", "sets": 3, "reps": "12", "weight": "14 kg", "rest": "75s" },
        { "name": "Aperturas en Polea", "sets": 3, "reps": "15", "weight": "10 kg", "rest": "60s" },
        { "name": "Press Militar", "sets": 4, "reps": "10", "weight": "25 kg", "rest": "90s" },
        { "name": "Elevaciones Laterales", "sets": 3, "reps": "15", "weight": "6 kg", "rest": "45s" },
        { "name": "Fondos en Paralelas", "sets": 3, "reps": "AMRAP", "rest": "60s" }
      ]
    },
    {
      "day": "Martes",
      "label": "Pull",
      "muscleGroup": "Espalda · Bíceps",
      "exercises": [
        { "name": "Jalón al Pecho", "sets": 4, "reps": "10", "weight": "45 kg", "rest": "90s" },
        { "name": "Remo con Barra", "sets": 4, "reps": "10", "weight": "35 kg", "rest": "90s" },
        { "name": "Remo Mancuerna", "sets": 3, "reps": "12", "weight": "14 kg", "rest": "75s" },
        { "name": "Face Pull", "sets": 3, "reps": "15", "weight": "12 kg", "rest": "60s" },
        { "name": "Curl Bíceps Barra", "sets": 3, "reps": "12", "weight": "20 kg", "rest": "60s" },
        { "name": "Curl Martillo", "sets": 3, "reps": "12", "weight": "8 kg", "rest": "45s" }
      ]
    },
    {
      "day": "Miércoles",
      "label": "Legs",
      "muscleGroup": "Pierna · Glúteo",
      "exercises": [
        { "name": "Sentadilla", "sets": 4, "reps": "10", "weight": "50 kg", "rest": "120s" },
        { "name": "Prensa", "sets": 4, "reps": "12", "weight": "100 kg", "rest": "90s" },
        { "name": "Extensión de Pierna", "sets": 3, "reps": "15", "weight": "30 kg", "rest": "60s" },
        { "name": "Curl Femoral", "sets": 3, "reps": "12", "weight": "25 kg", "rest": "60s" },
        { "name": "Hip Thrust", "sets": 4, "reps": "12", "weight": "60 kg", "rest": "90s" },
        { "name": "Elevación de Talones", "sets": 3, "reps": "20", "weight": "40 kg", "rest": "45s" }
      ]
    },
    {
      "day": "Jueves",
      "label": "Push",
      "muscleGroup": "Pecho · Hombro · Tríceps",
      "exercises": [
        { "name": "Press Inclinado Barra", "sets": 4, "reps": "10", "weight": "35 kg", "rest": "90s" },
        { "name": "Aperturas Mancuerna", "sets": 3, "reps": "12", "weight": "10 kg", "rest": "60s" },
        { "name": "Press Arnold", "sets": 3, "reps": "12", "weight": "12 kg", "rest": "75s" },
        { "name": "Elevación Frontal", "sets": 3, "reps": "12", "weight": "6 kg", "rest": "45s" },
        { "name": "Extensión Tríceps Polea", "sets": 3, "reps": "15", "weight": "15 kg", "rest": "60s" },
        { "name": "Patada Tríceps", "sets": 3, "reps": "12", "weight": "6 kg", "rest": "45s" }
      ]
    },
    {
      "day": "Viernes",
      "label": "Pull + Legs",
      "muscleGroup": "Espalda · Pierna",
      "exercises": [
        { "name": "Peso Muerto Rumano", "sets": 4, "reps": "10", "weight": "45 kg", "rest": "120s" },
        { "name": "Jalón Agarre Cerrado", "sets": 3, "reps": "12", "weight": "40 kg", "rest": "75s" },
        { "name": "Remo en Polea Baja", "sets": 3, "reps": "12", "weight": "35 kg", "rest": "75s" },
        { "name": "Zancadas Caminando", "sets": 3, "reps": "12 c/lado", "weight": "10 kg", "rest": "60s" },
        { "name": "Abductora", "sets": 3, "reps": "15", "weight": "35 kg", "rest": "45s" },
        { "name": "Plancha", "sets": 3, "reps": "45s", "rest": "30s" }
      ]
    }
  ]
}
```

Additional per-day / per-routine fields that can legally appear:
- `weekday?: 0|1|2|3|4|5|6` — explicit ISO weekday binding per day (0=Sunday). When present, `resolveRoutineDay()` binds the slot to that exact weekday; when absent, ordinal mapping applies (slot 0 → Monday). Declared in `mock-data.ts` `RoutineDay`.
- `ejercicioId?: string` per exercise — the loose reference into the coach's `Ejercicio` catalog; resolved at read time (§1.4.5).
- Routine-level extras merged in by `applyStageChange()`'s `routineSettings`: `splitBlock?, phaseWeek?, phaseTotalWeeks?, trackRpe?, weightLimits?` — spread onto the root object with `Object.assign`.
- Per-exercise optional `muscleGroup`, `tips: string[]` (portal's own `Exercise` interface consumes them).

### 1.4.3 The other stringified payloads

**`ExerciseLog.setsJson`** — canonical `SetEntry[]` (from `src/lib/db.ts`):

```json
[
  { "setNumber": 1, "targetReps": 10, "actualReps": 10, "weight": 40,   "completed": true },
  { "setNumber": 2, "targetReps": 10, "actualReps": 10, "weight": 40,   "completed": true },
  { "setNumber": 3, "targetReps": 10, "actualReps": 8,  "weight": 42.5, "completed": true },
  { "setNumber": 4, "targetReps": 10, "actualReps": 0,  "weight": 0,    "completed": false }
]
```

A **legacy shape** `[{ reps, weight, done }]` also exists; `toLog()` bridges it: `actualReps` falls back to `done ? parseInt(reps) : 0`, `completed` falls back to `done`, `weight` is coerced through `parseFloat(String(weight)) || 0`.

**`WorkoutSession.exerciseLogs`** — `SessionExercise[]`:

```json
[
  {
    "exerciseName": "Press Banca",
    "muscleGroup": "Pecho",
    "sets": [
      { "setNumber": 1, "targetReps": 10, "actualReps": 10, "weight": 40, "completed": true },
      { "setNumber": 2, "targetReps": 10, "actualReps": 10, "weight": 40, "completed": true },
      { "setNumber": 3, "targetReps": 10, "actualReps": 9,  "weight": 40, "completed": true },
      { "setNumber": 4, "targetReps": 10, "actualReps": 8,  "weight": 40, "completed": true }
    ],
    "completed": true
  }
]
```

**`WorkoutBiometrics.heartRateSeries`** (native Json): `[{ "t": "2026-07-02T18:03:11.000Z", "bpm": 142 }, { "t": "2026-07-02T18:03:41.000Z", "bpm": 151 }]`

**`Carrera.trackJson`**: `JSON.stringify(GpsPoint[])` where `GpsPoint = { lat: number, lng: number, t: number }` (epoch-millis timestamp).

**`Template.dataJson`**: identical to the diet/routine body **minus** `id`, `type`, `name` (kept in columns). `addTemplate`/`updateTemplate` destructure those keys off before stringifying; `toTemplate()` spreads them back: `{ id: t.id, type: t.type, name: t.name, ...JSON.parse(t.dataJson) }`.

### 1.4.4 Read path — parsers, fallbacks, and the mobile normalizers

`src/lib/db.ts`:

```ts
const EMPTY_DIET    = { name: "Dieta no asignada", totalCalories: 0, macros: { protein: 0, carbs: 0, fat: 0 }, meals: [] };
const EMPTY_ROUTINE = { name: "Rutina no asignada", daysPerWeek: 0, days: [] };

function parseDiet(json)    { if (!json) return EMPTY_DIET;    try { return JSON.parse(json); } catch { return EMPTY_DIET; } }
function parseRoutine(json) { if (!json) return EMPTY_ROUTINE; try { return JSON.parse(json); } catch { return EMPTY_ROUTINE; } }
```

**Never throws.** Empty string (the column default) and corrupt JSON both degrade to the "not assigned" placeholder object.

`src/app/api/mobile/portal/route.ts` re-normalizes on the way out so mobile always receives one guaranteed shape:

```ts
function normaliseMeals(meals) {
  return meals.map((m) => ({
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
  return days.map((d) => ({
    label:    d.label ?? d.day ?? "DÍA",
    focus:    d.focus ?? d.muscleGroup ?? undefined,
    dayIndex: d.dayIndex ?? undefined,
    exercises: (d.exercises ?? []).map((ex) => ({
      name: ex.name ?? "Ejercicio", sets: ex.sets ?? 3, reps: String(ex.reps ?? "10"),
      muscleGroup: ex.muscleGroup ?? ex.focus ?? undefined,
      tips: Array.isArray(ex.tips) ? ex.tips : undefined,
    })),
  }));
}
```

`GET /api/mobile/portal` is therefore **the only endpoint guaranteed to hand back clean, nested, defaulted diet/routine objects.** Any other consumer of `dietJson`/`routineJson` must re-implement this dual-shape tolerance.

### 1.4.5 `resolveDays()` — the catalog live-join

For every exercise in every day, if `ejercicioId` is set, `resolveDays(days, catalog)` looks it up in the coach's live `Ejercicio` rows and **overwrites** `name`, `muscleGroup`, `bodyweight`, `imageUrl`, `videoUrl` from the catalog — so editing a catalog exercise retroactively updates every routine that references it by ID. Inline values are the fallback for legacy routines. It also injects defaults: `sets ?? 3`, `reps ?? "10"`, `weight ?? ""`, `rest ?? "60s"`. Applied in `getStudentDetail()` (per student, using `s.coachId`) and in `getTemplates()` (per template's `coachId`, one catalog read per coach).

### 1.4.6 Write path

Every write goes through `JSON.stringify`:
- `addStudent()` → `dietJson: JSON.stringify(detail.diet)`, `routineJson: JSON.stringify(detail.routine)` (empty string if absent).
- `updateStudent()` → re-stringifies whichever of `detailUpdates.diet` / `detailUpdates.routine` is present.
- `applyStageChange()` → `stripTemplate(template)` (drops `{id, type}`) + optional `macroOverrides` merge (`macros.protein/carbs/fat`, `totalCalories`) + optional `routineSettings` `Object.assign` — then stringify. When no template is given but overrides exist, it parses the student's **current** JSON, patches it, and re-stringifies (silently leaves as-is on parse failure).
- `runAutoCron()` → same `stripTemplate` + stringify when draining `ScheduledChange` rows.

---
# 2. BACKEND & API ARCHITECTURE LOGBOOK (ALL 54 ROUTE FILES / 77 HANDLERS)

> Note on counts: the request brief cited "53 routes / 91 handlers." The audited tree contains **54 `route.ts` files** and **77 exported handlers** (75 function declarations + NextAuth's re-exported `GET`/`POST`). Everything below is the verified list — no route is omitted.

## 2.0 The Authentication Chokepoint (read this before any route)

There is **no `middleware.ts`** and no server-side layout guard anywhere. Every route enforces auth itself through one shared function:

```ts
// src/lib/session.ts
export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "COACH" | "CLIENT";
  coachId?: string | null;
  studentId?: string | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  // 1) Web: NextAuth cookie session.
  const session = await auth();
  if (session?.user) return session.user as SessionUser;

  // 2) Mobile: Bearer token in the Authorization header (deferred jose import).
  try {
    const h = await headers();
    const authHeader = h.get("authorization");
    if (authHeader) {
      const { verifyMobileToken } = await import("@/lib/mobile-auth");
      return await verifyMobileToken(authHeader);
    }
  } catch { /* headers() unavailable outside a request → ignore */ }
  return null;
}
```

- **Web path:** NextAuth Credentials provider; `authorize()` runs `prisma.user.findUnique({ where: { email }, include: { coachProfile: true, student: true } })` → `bcrypt.compare` → returns `{ id, name, email, role, coachId, studentId }` or `null`.
- **Mobile path:** `verifyMobileToken()` validates an HS256 JWT signed with the same `AUTH_SECRET`, 30-day expiry, carrying the identical claims.
- **Consequence:** any endpoint guarded by `getSessionUser()` transparently accepts a mobile Bearer token — mobile is not restricted to `/api/mobile/*`. Only the four `/api/mobile/*` routes call `verifyMobileToken()` directly (skipping the cookie branch).
- **Uniform denial pattern:** no session → `401 {"error":"No autenticado"}` (occasionally folded into 403); wrong role or missing linked id (`coachId`/`studentId`) → `403` with `"No autorizado"` / `"Forbidden"` / `"Sin ficha de alumno"`. Client-only endpoints require **both** `role === "CLIENT"` **and** a non-null `studentId`; coach endpoints require `role === "COACH" && coachId` (ADMIN usually passes the role gate and bypasses ownership scoping).
- Routes marked **NO_STORE** below send `Cache-Control: no-store, max-age=0` and `export const dynamic = "force-dynamic"`.

---

## 2.1 `admin/` — platform oversight (3 handlers)

### `src/app/api/admin/coaches/[id]/students/route.ts` — **GET**
- **Auth:** `getSessionUser()`, `role === "ADMIN"` only → else 403.
- **DB ops:** `prisma.coach.findUnique({ where: { id }, include: { user: true } })` (404 `{"error":"Coach no encontrado"}` if missing) → `getStudents(id)` which internally fires `runAutoCron()` (`prisma.scheduledChange.findMany` + per-row `student.update`/`scheduledChange.delete`) then `prisma.student.findMany({ where: { coachId: id }, include: { scheduledChange: true }, orderBy: { createdAt: "desc" } })`.
- **200:** `{ coach: { id, name, email }, students: Student[] }` (Student = the `toStudent()` DTO: all scalar fields + `scheduledChange`).

### `src/app/api/admin/coaches/route.ts` — **POST**
- **Auth:** ADMIN only.
- **Request:** `{ name: string, email: string, password: string }` — any missing → 400.
- **DB ops:** `prisma.user.findUnique({ where: { email: email.toLowerCase() } })` → duplicate → **409** `{"error":"Ya existe un usuario con ese email"}`; else `prisma.user.create({ data: { name, email, passwordHash: bcrypt, role: "COACH", coachProfile: { create: {} } } })`.
- **200:** `{ id, name, email }` of the created coach account.

### `src/app/api/admin/overview/route.ts` — **GET**
- **Auth:** ADMIN only.
- **DB ops:** `prisma.coach.findMany({ include: { user, _count: { students } } })`, `prisma.student.count()`, `prisma.user.count({ where: { role: "CLIENT" } })`, `prisma.student.count({ where: { paymentStatus: "active" } })`.
- **200:** `{ metrics: { totalCoaches, totalStudents, totalClients, activeStudents, mrr }, coaches: [{ id, name, email, studentCount, activeCount, mrr }] }` — MRR computed with the hardcoded `MONTHLY_FEE = 1200` (MXN) per active student.

## 2.2 `auth/` — NextAuth (2 handlers)

### `src/app/api/auth/[...nextauth]/route.ts` — **GET, POST**
```ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```
Credentials provider as described in §2.0. Session strategy: JWT cookie. This is the entire web login/logout/session surface.

## 2.3 `carreras/` — Strava-style run module (5 handlers)

### `src/app/api/carreras/route.ts` — **GET, POST**
- **GET** — any authenticated user (401 else). Role-scoped via `getCarrerasFor(user)`:
  - CLIENT → `prisma.carrera.findMany({ where: { userId: user.id }, orderBy: { date: "desc" } })`
  - COACH → first `prisma.student.findMany({ where: { coachId }, select: { userId } })`, then `carrera.findMany({ where: { userId: { in: studentUserIds } } })`
  - ADMIN → unfiltered `carrera.findMany`
  - **200:** `CarreraDTO[]` = `{ id, userId, date, distanceM, durationS, avgSpeedKmh, track: GpsPoint[], photoUrl }` (trackJson parsed, `[]` on corrupt).
- **POST** — any authenticated. Body `{ date?, distanceM, durationS, avgSpeedKmh?, track? }`; numeric validation → 400 on non-numeric distance/duration. `prisma.carrera.create` (durationS rounded, track stringified, date defaults to today). **201:** the created `CarreraDTO`.

### `src/app/api/carreras/[id]/route.ts` — **GET, PATCH, DELETE**
- **GET** — 401 unauthenticated; `getCarreraById` → 404 if missing; CLIENT may only read their own (`carrera.userId === user.id`, else 403). **200:** `CarreraDTO`.
- **PATCH** — owner-or-ADMIN (403 else). Multipart with a `photo` file → written to `public/uploads/run_${id}_${timestamp}${ext}` → `prisma.carrera.update({ data: { photoUrl } })` (via `setCarreraPhoto`). **200:** updated DTO.
- **DELETE** — same owner-or-ADMIN guard → `prisma.carrera.delete`. **200:** `{ ok: true }`.

## 2.4 `coach/` — coach operations (11 handlers)

### `src/app/api/coach/connect/route.ts` — **GET, POST**
- **Auth:** COACH or ADMIN with `coachId`.
- **GET** — `prisma.coach.findUnique` → returns Stripe Connect status `{ connected, onboardingComplete, stripeConnectId }`.
- **POST** — creates a Stripe **Express** account if `stripeConnectId` is null (`stripe.accounts.create`), persists it via `prisma.coach.update({ data: { stripeConnectId } })`, then returns either an onboarding link (`stripe.accountLinks.create`) or a login link for already-onboarded accounts. **200:** `{ url }`. Stripe failure → 500 `{ error }`.

### `src/app/api/coach/exercises/seed/route.ts` — **POST**
- **Auth:** COACH with `coachId` (403 else).
- **DB ops:** `seedDefaultEjercicios(coachId)` — loops the 30-exercise hardcoded catalog (Pecho ×4, Espalda ×4, Hombro ×4, Pierna ×4, Glúteo ×3, Brazo ×5, Core ×4, Cardio ×3 — each with `name`, `muscleGroup`, `equipment`, `bodyweight`, YouTube `videoUrl`), each through `prisma.ejercicio.upsert({ where: { coachId_name: { coachId, name } } })` — idempotent, no duplicates.
- **200:** `{ seeded: 30 }`.

### `src/app/api/coach/import/route.ts` — **GET, POST**
- **GET** — **no auth check.** Streams a generated `.xlsx` template (via `xlsx` lib) with the 15 required Spanish-labeled columns and 3 example rows. Response headers: `Content-Disposition: attachment`.
- **POST** — COACH or ADMIN. Multipart: `excel` (required), `zip` (optional photo bundle). Per row: email-duplicate skip (`prisma.student.findFirst({ where: { email } })` → warning, not batch failure), stage validation (invalid → defaults `"Volumen"`), fuzzy photo filename matching from the zip against 4 photo columns (mes-1/mes-2 × frontal/perfil). Each row inserts inside `prisma.$transaction(async (tx) => { tx.student.create(...); ... })` with `streak: 0, completionRate: 0`, followed by `provisionUserForStudent()` (creates/links a CLIENT `User` with default password `"mycouchpassword"`).
- **200 always** (even with row failures): `{ total, created, skipped, warnings: string[] }`.

### `src/app/api/coach/notices/route.ts` — **GET**
- **Auth:** COACH with `coachId`.
- **DB ops:** `getCoachNoticesAdmin(coachId, 50)` → `prisma.groupMessage.findMany({ where: { coachId }, orderBy: { createdAt: "desc" }, take: 50, select: { id, senderName, role, content, createdAt } })`.
- **200:** `{ notices: [...] }`. (Note: **no POST here** — notice creation goes through `POST /api/community/messages`.)

### `src/app/api/coach/notices/[id]/route.ts` — **DELETE**
- **Auth:** COACH with `coachId`.
- **DB ops:** `deleteNotice(id, coachId)` — `prisma.groupMessage.findUnique` ownership check (`msg.coachId === coachId`, else 404/403) → `prisma.groupMessage.delete`.
- **200:** `{ success: true }`.

### `src/app/api/coach/profile/route.ts` — **GET, PATCH**
- **Auth:** COACH with `coachId`.
- **GET** — `getCoachRoomProfile(coachId)` → `prisma.coach.findUnique({ select: { isPublic, joinCode, monthlyPrice } })`. **200:** that object.
- **PATCH** — body may carry `monthlyPrice` (must be ≥ 0 → 400), `isPublic` (boolean), `joinCode` (4–24 chars, stored uppercase → 400 outside range). Writes via `updateCoachMonthlyPrice` / `updateCoachRoomSettings` (`prisma.coach.update`). Unique-violation on `joinCode` (Prisma `P2002`) → **409** `{"error":"Código ya en uso"}`.

### `src/app/api/coach/students/[id]/route.ts` — **DELETE**
- **Auth:** COACH with `coachId`.
- **DB ops:** `unlinkStudentFromCoach(studentId, coachId)` — ownership check then `prisma.student.update({ data: { coachId: null } })`. **Soft unlink, never a hard delete.**
- **200:** `{ success: true }` / 404 when not owned.

### `src/app/api/coach/students/status/route.ts` — **POST**
- **Auth:** COACH or ADMIN.
- **Request:** `{ studentId, paymentStatus }` (one of `active|inactive|grace_period|past_due`).
- **DB ops:** `prisma.student.findUnique` (404) → `prisma.student.update({ data: { paymentStatus } })`. **Mutates `paymentStatus`, deliberately NOT `isActive`.**
- **200:** updated student summary.

### `src/app/api/coach/telemetry/route.ts` — **GET**
- **Auth:** COACH with `coachId`.
- **DB ops:** `getTeamTelemetry(coachId, todayStr)`:
```ts
prisma.student.findMany({ where: { coachId }, select: { id: true } });
Promise.all([
  prisma.dailyCheck.findMany({ where: { date, studentId: { in: ids } }, distinct: ["studentId"], select: { studentId: true } }),
  prisma.workoutSession.findMany({ where: { date, studentId: { in: ids } }, distinct: ["studentId"], select: { studentId: true } }),
]);
```
- **200:** `{ totalStudents, activeToday, streakPct }` — `activeToday` = size of the union set; `streakPct = round(activeToday/total*100)`.

## 2.5 `community/` — rooms, chat & notices (4 handlers)

### `src/app/api/community/join/route.ts` — **POST** · NO_STORE
- **Auth:** CLIENT with `studentId` (403 else).
- **Three body branches** (evaluated in order):
  1. `{ roomId }` — public join: `findPublicCoachById(roomId)` (`prisma.coach.findFirst({ where: { id, isPublic: true }, include: { user: { select: { name } } } })`); not found/not public → **422** `{"error":"SALA NO DISPONIBLE O NO PÚBLICA"}`.
  2. `{ code }` — private join: trimmed + uppercased → `findCoachByJoinCode` (`prisma.coach.findFirst({ where: { joinCode: { equals: CODE } } })`); no match → **422** `{"error":"CÓDIGO NO COINCIDE CON NINGÚN RADAR"}`.
  3. `{}` — hydration only: reads current `student.coachId`, **no mutation**.
- Branches 1–2 call `linkStudentToCoach` → `prisma.student.update({ data: { coachId } })` — **DESTRUCTIVE: unconditionally replaces any prior room link** (1-room-at-a-time invariant, no confirmation step server-side).
- **200:** `{ ok: true, coachId, coachName?, notices: [...] }` — notices = `getRecentCoachNotices(coachId, 20)` (`groupMessage.findMany({ where: { coachId, role: "COACH" }, orderBy: { createdAt: "desc" }, take: 20 })`).

### `src/app/api/community/messages/route.ts` — **GET, POST**
- **GET** — any authenticated (401 else). Query `?coachId=`. `prisma.groupMessage.findMany({ where: { coachId }, orderBy: { createdAt: "asc" }, take: 100 })`. **200:** message array `{ id, coachId, senderId, senderName, role, content, imageUrl, createdAt }`.
- **POST** — **COACH-exclusive** (`role !== "COACH"` → 403 — this is why students cannot post chat). Body `{ content, imageUrl? }` → `prisma.groupMessage.create({ data: { coachId: user.coachId, senderId: user.id, senderName: user.name, role: "COACH", content, imageUrl } })`. **201/200:** created message.

### `src/app/api/community/public-rooms/route.ts` — **GET**
- **Auth:** CLIENT with `studentId`.
- **DB ops:** `Promise.all([ getPublicRooms(), prisma.student.findUnique({ where: { id: studentId }, select: { coachId, coach… } }) ])` where `getPublicRooms()` = `prisma.coach.findMany({ where: { isPublic: true }, include: { user: { select: { name } }, _count: { select: { students } } }, orderBy: { createdAt: "asc" } })`.
- **200:** `{ rooms: [{ id, name, memberCount }], currentRoom: { coachId, name } | null }` — the current room is included **even if that coach has since gone private**.

## 2.6 `ejercicios/` — exercise catalog CRUD (4 handlers)

### `src/app/api/ejercicios/route.ts` — **GET, POST**
- **GET** — COACH or ADMIN. `getEjercicios(coachId?)`: COACH scoped to own catalog, ADMIN unscoped. `prisma.ejercicio.findMany({ where: coachId ? { coachId } : undefined, orderBy: { name: "asc" } })`. **200:** `EjercicioDTO[]`.
- **POST** — COACH with `coachId`. Accepts multipart (with image upload to `/uploads`) or JSON: `{ name, muscleGroup, equipment, bodyweight, imageUrl?, videoUrl? }`. `bodyweight: true` **forces** `equipment = "Peso corporal"`. `prisma.ejercicio.create`. Duplicate `(coachId, name)` → P2002 → 409. **201/200:** created DTO.

### `src/app/api/ejercicios/[id]/route.ts` — **PUT, DELETE**
- **PUT** — COACH or ADMIN; for COACH, `getEjercicioById(id)` ownership check (`coachId` match, 403 else). Same body/`bodyweight` rule as POST. `prisma.ejercicio.update`. **200:** updated DTO.
- **DELETE** — same guard → `prisma.ejercicio.delete`. **200:** `{ success: true }`. Routine JSON referencing the deleted `ejercicioId` degrades gracefully (falls back to inline values via `resolveDays`).

## 2.7 `me/` — client self-service (12 handlers)

### `src/app/api/me/route.ts` — **GET, POST** · NO_STORE · `force-dynamic`
- **GET** — 401 unauthenticated; `role !== "CLIENT" || !studentId` → **404** `{"error":"Sin ficha de alumno asociada"}`.
  - **THE ACCESS GATE (verbatim rule from the code comments):** `prisma.student.findUnique({ select: { isActive: true } })` — `isActive === false` → **403 `{"error":"ACCOUNT_BLOCKED"}`** regardless of `paymentStatus`; `isActive === true` → full access, **no Stripe check**. Stripe webhooks never touch `isActive`; only a coach `PATCH /api/students/[id]` can.
  - Then `getStudentById` + `getStudentDetail` (each triggers `runAutoCron()`; detail includes `weightHistory` asc, `measurements` asc, `photos` desc, catalog-resolved routine).
  - **200:** `{ student: Student, detail: FullStudentDetail }`.
- **POST** — CLIENT+studentId (403). Multipart (`weight`, `label`, `photo` file → `public/uploads/progress_${Date.now()}${ext}`) or JSON (`{ weight }`).
  - Weight > 0: rebuilds `weightHistory` replacing today's entry, sorts by date, `updateStudent(id, { previousWeight: current, currentWeight: weight, lastWeighIn: today }, { weightHistory })` (full `deleteMany` + `createMany` replacement).
  - Photo: `addProgressPhoto` (`progressPhoto.create`; also sets `student.photoName` if it was empty — first photo becomes the cover).
  - **200:** `{ success: true }`. NOTE: `today` here is `new Date().toISOString().split("T")[0]` — **UTC-derived** (§4.1 timezone caveat).

### `src/app/api/me/biometrics/route.ts` — **POST**
- **Auth:** CLIENT+studentId.
- **Request:** `{ weight: number }` — validated **20 ≤ weight ≤ 500** kg → 400 `{"error":"Peso fuera de rango"}` otherwise.
- **DB ops:** `logDailyWeight` — a true transaction:
```ts
prisma.$transaction([
  prisma.weightEntry.deleteMany({ where: { studentId, date } }),  // one node per calendar day
  prisma.weightEntry.create({ data: { studentId, date, weight } }),
  prisma.student.update({ where: { id: studentId }, data: { currentWeight: weight } }),
]);
```
- **200:** `{ date, weight }`. Same-day re-log **overwrites** (delete-then-create), never duplicates.

### `src/app/api/me/checks/route.ts` — **GET, POST**
- **Auth:** CLIENT+studentId.
- **GET** `?date=YYYY-MM-DD` — `getDailyChecks` → `prisma.dailyCheck.findMany({ where: { studentId, date } })`. **200:** `{ checks: [{ kind, itemKey }] }`.
- **POST** — `{ date, kind: "meal"|"exercise", itemKey, done: boolean }` → `setDailyCheck`: `done=true` → `prisma.dailyCheck.upsert({ where: { studentId_date_kind_itemKey: {...} }, create: {...}, update: {} })` (idempotent); `done=false` → `prisma.dailyCheck.deleteMany` on the same tuple. **200:** `{ success: true }`.

### `src/app/api/me/coach-price/route.ts` — **GET**
- **Auth:** loose — any session; **no student → `200 { monthlyPrice: null }`** (not an error).
- **DB ops:** `getCoachMonthlyPriceForStudent` → `prisma.student.findUnique({ select: { coach: { select: { monthlyPrice } } } })`.
- **200:** `{ monthlyPrice: number | null }`.

### `src/app/api/me/logs/route.ts` — **GET, POST, PATCH**
- **Auth:** CLIENT+studentId.
- **GET** — `getExerciseLogs` → `prisma.exerciseLog.findMany({ where: { studentId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] })`. **200:** `ExerciseLogDTO[]` (setsJson parsed to `SetEntry[]`, legacy `{reps,weight,done}` bridged).
- **POST** — `{ date, ejercicioId?, exerciseName, muscleGroup?, bodyweight?, prescribedSets?, prescribedReps?, prescribedWeight?, sets: SetEntry[], completed? }` → `addExerciseLog` (`prisma.exerciseLog.create`, sets stringified). **201/200:** created DTO.
- **PATCH** — same body → `upsertExerciseLog`: `prisma.exerciseLog.findFirst({ where: { studentId, date, exerciseName }, orderBy: { createdAt: "desc" } })` → `update` if found else `create`. `completed` defaults to `sets.every(s => s.completed)`. **200:** DTO.

### `src/app/api/me/photos/route.ts` — **POST**
- **Auth:** CLIENT+studentId.
- **Request:** multipart, `photo` file + optional `label` (default `"FRONTAL"`/`"Progreso"`) + optional `weight`. Validation: **≤ 5 MB**, MIME ∈ {`image/jpeg`, `image/png`, `image/webp`} → 400 otherwise.
- **Storage — 3-tier fallback:** ① Vercel Blob (`@vercel/blob put`) when `BLOB_READ_WRITE_TOKEN` present → ② local disk `public/uploads/` → ③ base64 `data:` URI stored directly in `ProgressPhoto.url`.
- **DB ops:** `addProgressPhoto` → `prisma.progressPhoto.create` (+ conditional `student.update photoName`).
- **200:** `{ success: true, url }`.

### `src/app/api/me/prs/route.ts` — **PATCH**
- **Auth:** CLIENT+studentId.
- **Request:** `{ lift: "squat"|"deadlift"|"bench", kg: number > 0 }` → 400 on bad lift/kg.
- **DB ops:** `prisma.student.findUnique({ select: { prSquat, prDeadlift, prBench } })` → **monotonic-increase rule:** if `kg <= current`, **silent no-op** returning the unchanged value (no error); else `prisma.student.update({ data: { [prField]: kg } })`.
- **200:** `{ prSquat, prDeadlift, prBench }` (post-state).

### `src/app/api/me/reactivate/route.ts` — **POST**
- **Auth:** CLIENT+studentId.
- **DB ops:** `prisma.student.findUnique` (needs coach + price) → creates Stripe Customer if missing (`stripe.customers.create` → `prisma.student.update({ data: { stripeCustomerId } })`) → creates a Stripe Checkout Session (subscription mode, coach's `monthlyPrice`, success/cancel URLs back to the portal) → persists `stripeSubscriptionId` when applicable via a second `prisma.student.update`.
- **200:** `{ url }` (the Checkout URL). Stripe errors → 500 `{ error }`.

### `src/app/api/me/wallet/route.ts` — **PATCH**
- **Auth:** CLIENT+studentId.
- **Request:** `{ delta: number ≠ 0 }` → 400 if zero/non-numeric.
- **DB ops:** `prisma.student.findUnique({ select: { walletBalance } })` → negative result blocked (`balance + delta < 0` → 400 `{"error":"Saldo insuficiente"}`) → `prisma.student.update({ data: { walletBalance: newBalance } })`.
- **200:** `{ walletBalance }`. (PATCH is the only method — wallet reads arrive embedded in the `/api/me` student payload.)

## 2.8 `mobile/` — dedicated mobile endpoints (4 handlers)

All four call `verifyMobileToken(request.headers.get("authorization"))` **directly** (no cookie branch); invalid/absent token → raw `401 {"error":"No autenticado"}`.

### `src/app/api/mobile/login/route.ts` — **POST**
- **Auth:** none (this mints the token).
- **Request:** `{ email, password }` — trimmed/lowercased; missing → 400 `{"error":"Correo y contraseña requeridos"}`.
- **DB ops:** `prisma.user.findUnique({ where: { email }, include: { coachProfile: true, student: true } })` → `bcrypt.compare`. **Anti-enumeration:** unknown user and wrong password return the identical `401 {"error":"Credenciales inválidas"}`.
- **Token:** `signMobileToken({ id, role, coachId, studentId })` — HS256, `AUTH_SECRET`, 30-day expiry.
- **200:** `{ token, user: { id, name, email, role, coachId, studentId } }`. 500 `{ error }` on unexpected failure.
- **⚠ Hygiene flag:** the handler currently contains four `console.log("… [BACKEND IMPACT] …")` lines left over from a connectivity diagnostic (visible at lines 13, 21, 26, 29, 31) — strip before production.

### `src/app/api/mobile/me/route.ts` — **GET**
- **DB ops:** `prisma.user.findUnique({ where: { id: token.id }, include: { coachProfile, student } })` — token valid but user deleted → **404**.
- **200:** `{ user: { id, name, email, role, coachId, studentId } }` (fresh from DB, not from token claims).

### `src/app/api/mobile/portal/route.ts` — **GET** · `force-dynamic`
- **Guards:** token → 401; `role !== "CLIENT" || !studentId` → 403 `{"error":"Sin ficha de alumno"}`; `prisma.student.findUnique({ select: { isActive } })` → missing 404, `isActive === false` → **403 `{"error":"ACCOUNT_BLOCKED"}`** (mirrors `/api/me` exactly).
- **DB ops:** `Promise.all([getStudentById, getStudentDetail])` (both trigger `runAutoCron`).
- **200 (the canonical mobile contract):**
```json
{
  "student": { "id": "...", "name": "...", "email": "...", "currentWeight": 0, "streak": 0, "stage": "", "stageNumber": 1, "prSquat": 0, "prDeadlift": 0, "prBench": 0 },
  "detail": {
    "height": null, "bodyFat": null,
    "routine": { "name": "Rutina sin asignar", "daysPerWeek": 0, "days": [ { "label": "DÍA", "focus": "...", "dayIndex": 1, "exercises": [ { "name": "Ejercicio", "sets": 3, "reps": "10", "muscleGroup": "...", "tips": ["..."] } ] } ] },
    "diet": { "name": "Plan nutricional", "totalCalories": 0, "macros": { "protein": 0, "carbs": 0, "fat": 0 }, "meals": [ { "name": "", "time": "", "calories": 0, "items": ["..."], "macros": { "protein": 0, "carbs": 0, "fat": 0 } } ] },
    "weightHistory": [ { "date": "YYYY-MM-DD", "weight": 0 } ],
    "measurements": [ { "id": "...", "date": "YYYY-MM-DD", "chest": 0, "waist": 0, "hips": 0, "armL": 0, "armR": 0, "thighL": 0, "thighR": 0 } ]
  }
}
```
The **only** endpoint that returns fully normalized diet/routine JSON (`normaliseMeals` / `normaliseRoutineDays`, §1.4.4).

### `src/app/api/mobile/community/notices/route.ts` — **GET**
- Non-CLIENT roles → **`200 []`** (empty array, deliberately not an error). `prisma.student.findUnique({ select: { coachId } })` — no room → `200 []`. Else `getRecentCoachNotices(coachId, 20)`.
- **200:** `[{ id, senderName, role, content, createdAt }]`.

## 2.9 `student/` — client workout/hydration surface (9 handlers)

### `src/app/api/student/food-substitutes/route.ts` — **GET**
- **Auth:** none — public.
- **DB ops:** `getFoodSubstitutes()` — `prisma.foodSubstitute.findMany({ orderBy: [{ category: "asc" }, { substituteFood: "asc" }] })`; **self-seeds 13 default rows** via `createMany` when the table is empty: 7 Carbohidratos (Arroz blanco 3.30, Avena 5.30, Camote cocido 5.80, Papa cocida 6.25, Tortilla de maíz 4.00, Pan integral 4.35, Plátano maduro 4.35) + 6 Proteínas (Pechuga de pollo 4.50, Carne magra 5.00, Atún en agua 4.00, Salmón 5.30, Huevo entero 8.00, Leche descremada 10.00).
- **200:** `FoodSubstituteDTO[]`.

### `src/app/api/student/latest-notice/route.ts` — **GET**
- **Auth:** CLIENT+studentId, but failure returns **`403 { notice: null }`** (non-error-shaped body, by design so the portal banner just hides).
- **DB ops:** `prisma.student.findUnique({ select: { coachId } })` → `prisma.groupMessage.findFirst({ where: { coachId, role: "COACH" }, orderBy: { createdAt: "desc" } })`.
- **200:** `{ notice: { id, senderName, content, createdAt } | null }`.

### `src/app/api/student/leave-room/route.ts` — **POST**
- **Auth:** CLIENT+studentId.
- **DB ops:** `prisma.student.update({ data: { coachId: null } })`. History untouched.
- **200:** `{ ok: true }`.

### `src/app/api/student/water/route.ts` — **GET, POST**
- **Auth:** CLIENT (own studentId) **or COACH passing an explicit `studentId`** — note: the coach path has **no ownership check** on the target student (flagged risk).
- **GET** `?date=` → `getTodayWaterTotal` (`prisma.waterLog.findMany({ where: { studentId, date } })` summed). **200:** `{ totalMl }`.
- **POST** `{ amountMl, date? }` → `addWaterLog` (`prisma.waterLog.create`). **200:** `WaterLogDTO`.

### `src/app/api/student/workout-session/route.ts` — **GET, POST, PATCH**
- **Auth:** CLIENT+studentId.
- **GET** `?date=` → `getWorkoutSession` (`prisma.workoutSession.findFirst({ where: { studentId, date }, orderBy: { createdAt: "desc" } })`). **200:** `WorkoutSessionDTO | null`.
- **POST** `{ date, name, routineId?, exerciseLogs?, notes?, completed? }` — dual mode:
  - explicit `exerciseLogs` → `upsertWorkoutSession` (findFirst by `{studentId,date}` → update or create; `completed` defaults to `exerciseLogs.every(e => e.completed)`; **replace-semantics, not merge**);
  - omitted → `finalizeWorkoutSession`: aggregates that date's `prisma.exerciseLog.findMany({ where: { studentId, date }, orderBy: { createdAt: "asc" } })` rows into `SessionExercise[]` (legacy setsJson bridged) then upserts.
  - **200:** `WorkoutSessionDTO`.
- **PATCH** — same upsert path for partial updates (notes/completed). **200:** DTO.

### `src/app/api/student/workout-session/history/route.ts` — **GET**
- **Auth:** CLIENT+studentId, but denial returns **`403 []`** (empty array, not an error object — deliberate so the mobile/web history list renders empty instead of crashing).
- **DB ops:** `getWorkoutSessionsWithBiometrics(studentId, 50)` → `prisma.workoutSession.findMany({ where: { studentId }, orderBy: { date: "desc" }, take: 50, include: { biometrics: true } })`.
- **200:** `WorkoutSessionWithBiometricsDTO[]` (each with `biometrics: { avgHeartRate, maxHeartRate, activeCalories, totalCalories, deviceSource, heartRateSeries, createdAt } | null`).

### `src/app/api/student/workout-session/telemetry/route.ts` — **POST**
- **Auth:** CLIENT+studentId.
- **Request:** `{ date, avgHeartRate?, maxHeartRate?, activeCalories?, totalCalories?, deviceSource?, heartRateSeries? }` — bad numeric fields are **silently coerced to `null`**, not rejected.
- **DB ops:** `prisma.workoutSession.findFirst({ where: { studentId, date } })` — **404 if no session exists for that date** (ordering constraint: session first, telemetry second) → `prisma.workoutBiometrics.upsert({ where: { sessionId }, create: {...}, update: {...} })`.
- **200:** the biometrics row.

## 2.10 `students/` — coach-side roster surface (13 handlers)

### `src/app/api/students/route.ts` — **GET, POST**
- **GET** — role-scoped roster: ADMIN → `getStudents()` (all); COACH → `getStudents(coachId)`; **CLIENT → `200 []` always** (never an error). Every call triggers `runAutoCron()` — the lazy cron fires on **every roster read, including plain reads** (a polling client is a cron trigger).
- **POST** — COACH or ADMIN. Multipart (photo → `/uploads`) or JSON. Creates via `addStudent()` (nested `weightHistory.create`, `measurements.create`, optional first `photos.create`; `coachId` defaults to `getDefaultCoachId()` = `prisma.coach.findFirst()` when caller is ADMIN without one). Seeds `streak: 1, completionRate: 100`. Then `provisionUserForStudent()` (CLIENT `User` with password `"mycouchpassword"`, or link to existing email). **Non-fatal Stripe:** attempts `stripe.customers.create` + Checkout subscription (`prisma.student.update` with `stripeCustomerId`; coach lookup via `prisma.coach.findUnique` for the Connect account/price); failures are swallowed with a warning — the student is created regardless.
- **200/201:** created `Student` DTO (plus `checkoutUrl` when Stripe succeeded).

### `src/app/api/students/[id]/route.ts` — **GET, PATCH, PUT**
- **GET** — authenticated; **CLIENT may only fetch their own id** (`user.studentId === id`, else 403); COACH/ADMIN pass. `getStudentById` + `getStudentDetail`. **200:** `{ student, detail }`.
- **PATCH** — COACH or ADMIN. **Sole accepted field: `{ isActive: boolean }`** → `setStudentActive` (`prisma.student.update({ data: { isActive } })`). **This is the only write path for the access gate in the entire codebase.** **200:** `{ success: true }`.
- **PUT** — COACH or ADMIN. Full-record replace via `updateStudent()`: scalar whitelist (`name, email, currentWeight, previousWeight, lastWeighIn, stage, stageNumber, paymentStatus, joinedDate, streak, completionRate, avatarInitials, avatarColor`) + detail fields (`height, bodyFat, photoName, notes, nextStageDate, diet→dietJson, routine→routineJson`) + **full-replace semantics** for `weightHistory` (`weightEntry.deleteMany` + `createMany`) and `measurements` (`measurement.deleteMany` + per-row `create`) + `scheduledChange` upsert/`deleteMany`(when `null`). **200:** `{ success: true }`.

### `src/app/api/students/[id]/carreras/route.ts` — **GET**
- Authenticated; CLIENT own-id-only; COACH/ADMIN unrestricted (**no coach-ownership check on the target** — flagged). `getCarrerasByStudent`: `prisma.student.findUnique({ select: { userId } })` → `prisma.carrera.findMany({ where: { userId }, orderBy: { date: "desc" } })`. **200:** `CarreraDTO[]`.

### `src/app/api/students/[id]/checks/route.ts` — **GET**
- Same guard pattern. `getDailyChecksAll` → `prisma.dailyCheck.findMany({ where: { studentId }, orderBy: { date: "desc" } })`. **200:** `[{ date, kind, itemKey }]` — the raw material for coach-side adherence math.

### `src/app/api/students/[id]/logs/route.ts` — **GET**
- Same guard pattern. `getExerciseLogs(id)`. **200:** `ExerciseLogDTO[]`.

### `src/app/api/students/[id]/measurements/route.ts` — **POST, PATCH**
- **Auth:** COACH or ADMIN.
- **POST** — body = measurement fields → `prisma.measurement.create({ data: { studentId, date, chest, waist, hips, armL, armR, thighL, thighR } })`. **200/201:** created row.
- **PATCH** — `{ id, ...fields }` → `prisma.measurement.update`. **200:** updated row.

### `src/app/api/students/[id]/photos/route.ts` — **POST, DELETE**
- **Auth:** COACH or ADMIN.
- **POST** — multipart upload → storage → `addProgressPhoto` (`progressPhoto.create` + conditional cover `student.update`). **200.**
- **DELETE** — `{ photoId }` → `deleteProgressPhoto` (`prisma.progressPhoto.delete`). **200:** `{ success: true }`.

### `src/app/api/students/[id]/reset-password/route.ts` — **POST**
- **Auth:** COACH or ADMIN.
- **Request:** `{ password }` — **min 6 chars** → 400.
- **DB ops:** `prisma.student.findUnique` (404) → if `student.userId` exists: `prisma.user.update({ data: { passwordHash: bcrypt } })`; **else creates the login on the spot**: `prisma.user.create({ role: "CLIENT", passwordHash })` + `prisma.student.update({ data: { userId } })`.
- **200:** `{ success: true }`.

### `src/app/api/students/change-stage/route.ts` — **POST**
- **Auth:** COACH or ADMIN.
- **Request:** `{ studentIds: string[], stage, stageNumber, dietTemplateId?, routineTemplateId?, executionDate?, macroOverrides?: { protein?, carbs?, fat?, calories? }, routineSettings?: { splitBlock?, phaseWeek?, phaseTotalWeeks?, trackRpe?, weightLimits? } }`.
- **DB ops:** `applyStageChange()` — per student: `executionDate <= today` → immediate `prisma.student.update` (template snapshot via `stripTemplate` + override merge, §1.4.6) + `scheduledChange.deleteMany`; future date → `prisma.scheduledChange.upsert` (replaces any pending change — 1 pending per student).
- **200:** `{ success: true }`.

## 2.11 `subscription/` (1 handler)

### `src/app/api/subscription/cancel/route.ts` — **POST**
- **Auth:** CLIENT+studentId.
- **DB ops:** `prisma.student.findUnique` → if `stripeSubscriptionId` present, `stripe.subscriptions.update(id, { cancel_at_period_end: true })` — **non-fatal** if Stripe errors → **always** `prisma.student.update({ data: { paymentStatus: "inactive" } })` locally.
- **200:** `{ success: true }`.

## 2.12 `templates/` (4 handlers)

### `src/app/api/templates/route.ts` — **GET, POST**
- **GET** — any authenticated. `?type=diet|routine`. `getTemplates(type)` → `prisma.template.findMany({ where: type ? { type } : undefined, orderBy: { createdAt: "asc" } })` + per-coach `prisma.ejercicio.findMany` to `resolveDays()` routine templates. **200:** `StoredTemplate[]` (`{ id, type, name, ...parsedDataJson }`).
- **POST** — COACH or ADMIN. `{ type, name, ...data }` → `addTemplate` (`prisma.template.create`, dataJson = stringify minus id/type/name, `coachId` from session). **200/201:** created template.

### `src/app/api/templates/[id]/route.ts` — **PUT, DELETE**
- **PUT** — COACH or ADMIN → `updateTemplate` (`prisma.template.update`, re-stringify). **200.**
- **DELETE** — COACH or ADMIN → `deleteTemplate` (`prisma.template.delete`). **200:** `{ success: true }`. Students keep their snapshots (copies, not references).

## 2.13 `webhooks/` (1 handler)

### `src/app/api/webhooks/stripe/route.ts` — **POST**
- **Auth:** Stripe signature — `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`; missing secret → 500; bad signature → 400 `{"error":"Firma inválida"}`.
- **Event dispatch (exact `updateMany` writes):**

| Event | Guard | Write |
|---|---|---|
| `invoice.paid` | `extractId(obj.customer)` non-null (string or expanded `{id}` both handled) | `prisma.student.updateMany({ where: { stripeCustomerId }, data: { paymentStatus: "active", stripeSubscriptionId? } })` |
| `invoice.payment_failed` | same | `prisma.student.updateMany({ …, data: { paymentStatus: "past_due" } })` |
| `customer.subscription.deleted` | same | `prisma.student.updateMany({ …, data: { paymentStatus: "inactive", stripeSubscriptionId: null } })` |
| `account.updated` | `obj.details_submitted === true` | `prisma.coach.updateMany({ where: { stripeConnectId: obj.id }, data: { stripeOnboardingComplete: true } })` |
| anything else | — | logged and ignored |

- `updateMany.count === 0` (CLI-simulated customers) → logged, **200 anyway** so Stripe doesn't retry. Genuine Prisma errors are re-thrown → **500** → Stripe retries.
- **200:** `{ received: true }`.
- **Critical invariant restated:** webhooks write `paymentStatus` only — they **never** touch `isActive`, so a payment failure alone never locks a student out.

## 2.14 Cross-cutting API rules (every client must honor these)

1. **`isActive` vs `paymentStatus` are fully independent.** Only `isActive` gates access (`ACCOUNT_BLOCKED`); `paymentStatus` is billing display. Never infer blocked state from billing state.
2. **A mobile Bearer JWT works on every `getSessionUser()` route** — `/api/carreras`, `/api/community/messages`, `/api/templates`, `/api/me/*` all accept it; `/api/mobile/*` is a convenience/normalization layer, not a boundary.
3. **`runAutoCron()` fires on every roster read** (`getStudents`, `getStudentById`, `getStudentDetail`) and applies **all globally-due** `ScheduledChange` rows — any polling client is the platform's de-facto cron scheduler.
4. **Soft-failure response shapes are intentional** on student-facing convenience endpoints: `403 []` (history), `403 { notice: null }` (latest-notice), `200 []` (mobile notices for non-clients), `200 { monthlyPrice: null }` (coach-price). Clients should treat these as "render empty," not "show error."
5. **Replace-semantics upserts:** workout-session POST and student PUT (`weightHistory`/`measurements`) fully replace prior content for their scope — deliberate design, not a bug.

---
# 3. PREMIUM DESIGN SYSTEM & UI BLUEPRINT

The platform runs **two deliberate, coexisting visual languages**:

1. **"SF Dark Pro"** (Apple HIG dark-luxury) — declared source of truth in `ROADMAP.md` §3, implemented as CSS custom properties in `src/app/globals.css`, and used as the chrome for the coach dashboard, admin panel, and the portal's structural surfaces.
2. **"Tactical HUD / Volt"** accent layer — the gamified terminal aesthetic (lime `#CEFF00`, cyan `#00F0FF`, `Barlow Condensed` display type, monospace captions, corner brackets) layered **inside** `portal/page.tsx` for the student experience's motivational modules.

## 3.1 Visual Token Registry (exact values)

### 3.1.1 Root CSS variables — `src/app/globals.css` (verbatim)

```css
--bg-root:            #070708;   /* Near-pure black — OLED extreme contrast */
--bg-sidebar:         var(--glass);
--bg-surface:         #0e0e10;   /* Tarjetas flotantes sobre el negro */
--bg-surface-raised:  #161618;   /* Gris elevado estilo iOS */
--bg-surface-overlay: #161618;
--bg-hover:           rgba(212, 255, 0, 0.05);  /* Volt hover tint */
--bg-active:          rgba(212, 255, 0, 0.08);  /* Volt active tint */

--border-subtle:      rgba(255, 255, 255, 0.07);
--border-default:     rgba(255, 255, 255, 0.08);
--border-strong:      rgba(255, 255, 255, 0.12);

--text-primary:       #ffffff;   /* Títulos en Blanco Puro */
--text-secondary:     #e5e5ea;   /* Texto de lectura en Plata Brillante */
--text-tertiary:      #8e8e93;   /* Secundarios / etiquetas en Gris Apagado */
--text-inverse:       #000000;   /* Texto negro sobre botones blancos */

--accent-primary:        #D4FF00;               /* Volt — botón principal */
--accent-primary-hover:  #c4ef00;
--accent-primary-subtle: rgba(212, 255, 0, 0.08);

--text-sidebar-primary:   #ffffff;
--text-sidebar-secondary: #8e8e93;
--text-sidebar-active:    #D4FF00;
--bg-sidebar-active:      rgba(212, 255, 0, 0.08);
--bg-sidebar-hover:       rgba(255, 255, 255, 0.04);
--border-sidebar-subtle:  rgba(255, 255, 255, 0.05);

--color-success: #34d399;  --color-success-subtle: rgba(52, 211, 153, 0.10);   /* emerald-400 */
--color-warning: #fbbf24;  --color-warning-subtle: rgba(251, 191, 36, 0.10);   /* amber-400 */
--color-danger:  #f87171;  --color-danger-subtle:  rgba(248, 113, 113, 0.10);  /* red-400 */
--color-info:    #60a5fa;  --color-info-subtle:    rgba(96, 165, 250, 0.10);   /* blue-400 */

--color-volt:   #D4FF00;
--color-carbon: #0B0C0E;
```

### 3.1.2 ROADMAP.md §3 directives ("Directrices de Rediseño: Estilo App de Apple") — normative rules

- **App background:** pure black `#000000` or deep charcoal `#08080A` (implemented as `#070708`).
- **Cards/containers:** subtle gray `#121214` or `#1C1C1E` floating over black, with near-imperceptible borders (`border-zinc-800/30` or `border-white/5`).
- **Text hierarchy:** titles pure white `#FFFFFF`; body silver `#E5E5EA`; secondary/labels muted gray `#8E8E93`.
- **Accents — surgical use only:** no rainbow palettes; primary CTAs are high-contrast **white button / black text** (Apple action-button style); state chips use subtle transparencies, canonical example `bg-emerald-500/10 text-emerald-400` for "Activo."
- **Radii:** `rounded-2xl` for large cards, `rounded-xl` for buttons/inputs.
- **Breathing room:** doubled padding — table rows and diet cards at `py-6 px-6`.
- **Glassmorphism:** BulkActionBar and top Header use `backdrop-blur-md bg-black/40 border-white/5`.
- **Mobile-first:** `md:hidden` bottom tab bar with large Lucide icons (Hoy, Progreso, Salas, Perfil); Daily Card Stack checklists; macro mini-grid blocks `bg-zinc-900/50 text-center rounded-xl p-3` — big white number (e.g. **140g**), gray type label below.

### 3.1.3 Tactical HUD accent tokens (portal monolith, exact values from code)

| Token | Value | Where |
|---|---|---|
| Volt lime (portal) | `#CEFF00` (globals uses `#D4FF00` for chrome; the portal accent layer hardcodes `#CEFF00`) | streak card, weekday strip active state, perfect-day chip, progress-bar gradients |
| HUD cyan | `#00F0FF` | gradient partner, avatars, water visualizations |
| Progress gradient | `linear-gradient(90deg, #00F0FF 0%, #CEFF00 100%)` + glow `box-shadow: 0 0 8–10px rgba(206,255,0,0.5–0.6)` | nutrition kcal bar, workout overall bar, day-progress bars |
| Display font `DS` | `var(--font-display,'Barlow Condensed',sans-serif)`, weight 900, uppercase, often italic | all HUD headings (declared locally ~24× through the monolith) |
| Mono font `MONO` | monospace stack | terminal captions, directive card, weekday strip |
| Lime border glow | `border-2 border-lime-400` + `shadow-[0_0_25px_rgba(163,230,53,0.05)]` | Tactical OS directive card |
| Meal-card surface | `#1A1A1A` with `border: 1px solid rgba(255,255,255,0.06)` | empty states, bento cards |
| Sheet surface | `#0d0d0d` | BottomSheet |
| Rank gradient avatars | e.g. `linear-gradient(135deg,#CEFF00,#00F0FF)`, `linear-gradient(135deg,#8b5cf6,#ec4899)` | avatars store full gradient strings in `Student.avatarColor` |
| Macro colors | Proteína `#34d399`, Carbos `#60a5fa`, Grasa `#fb923c` | CalorieRing/MacroBar |
| Stage colors (coach) | Volumen `#a78bfa`, Definición `#2dd4bf`, Mantenimiento `#facc15`, Recomposición `#f472b6` | coach dashboard `STAGE_COLORS` |
| Payment chips (coach) | active `#34d399` "Al día", grace_period `#fbbf24` "Pago pendiente", past_due `#fbbf24` "Pago vencido", inactive `#f87171` "Suspendido" | `PAYMENT_LABELS` |

## 3.2 The Monolith Layout Breakdown — `src/app/portal/page.tsx` (8,549 lines)

One client component, five tabs (`TabId = "today" | "progress" | "squads" | "profile" | "community"`), fixed bottom navigation, everything padded `pb-40` above the bar. Composition of the flagship **Hoy/Nutrición** view, top to bottom:

### 3.2.1 Module 1 — Tactical OS Directive Card (lines ~2596–2606)

```
w-full bg-zinc-950 border-2 border-lime-400 p-5 mb-4 relative overflow-hidden rounded-sm
shadow-[0_0_25px_rgba(163,230,53,0.05)]
+ two 10×10 corner-bracket divs: border-l border-b border-lime-400/25 (top-right),
  border-r border-t border-lime-400/25 (bottom-left)
label: text-[10px] font-mono tracking-[0.2em] text-lime-400 font-black uppercase → "SYSTEM_ENFORCED_DIRECTIVE"
body:  text-base sm:text-lg font-black italic uppercase text-white leading-snug
       drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]
```
Content: the latest coach notice (`MISSION: <SENDER> // STATUS: <first 60 chars uppercased>`) or a default directive.

### 3.2.2 Module 2 — Micro-Calendar Weekday Pill Strip (lines ~2608–2627) — the "L M MI J V S D" row

```tsx
<div className="flex items-center justify-between gap-1.5 w-full bg-zinc-900/40 p-1.5
                border border-zinc-800/80 rounded-sm mb-5">
  {(["L","M","MI","J","V","S","D"] as const).map((label, i) => {
    const dayNum = i + 1;                       // 1=Lunes … 7=Domingo
    const isActive = activeDayIndex === dayNum;
    // ACTIVE pill:
    //   flex-1 py-2 text-center text-xs font-mono font-black
    //   border border-lime-400 text-lime-400 bg-lime-400/10
    //   shadow-[0_0_12px_rgba(163,230,53,0.15)] rounded-sm transition-all   ← the "active glow"
    // INACTIVE pill:
    //   flex-1 py-2 text-center text-xs font-mono font-bold
    //   border border-transparent text-zinc-500 hover:text-zinc-300 transition-all
    // onClick: onAdvanceDay(dayNum - activeDayIndex)  → jumps the active day
  })}
</div>
```
Each pill is an equal-width (`flex-1`) tap target; tapping re-anchors the whole day context (nutrition + workout) to that weekday via the calendar engine (§4.1).

### 3.2.3 Nutrition header + kcal progress (lines ~2629–2702)

- Day carousel: `ChevronLeft/Right` in 32×32 `rounded-xl` buttons (`rgba(255,255,255,0.05)` bg, `active:scale-90`), disabled below day 1 / above day 7 (opacity 0.3, `cursor-not-allowed`); the forward button tints Volt (`rgba(206,255,0,0.08)` bg, `border rgba(206,255,0,0.25)`).
- Title: `fontFamily: DS, fontWeight 900, fontSize clamp(22px,6.5vw,28px), uppercase, letterSpacing -0.01em` → e.g. "MIÉRCOLES · NUTRICIÓN".
- "EXPORTAR" print button: `window.print()`, 9px 900-weight uppercase `letterSpacing 0.14em`, `Printer` icon.
- Perfect-day state: container gains `scale-[1.02] shadow-[0_0_30px_rgba(206,255,0,0.15)]` + `borderColor rgba(206,255,0,0.4)`, and an animated chip `background:#CEFF00; color:#000; fontSize:8; boxShadow:0 0 18px rgba(206,255,0,0.5)` reading "⚡ DÍA PERFECTO COMPLETE".
- Kcal bar: labels `9px font-black uppercase tracking-[0.14em] #808080` ("N KCAL CONSUMIDAS" / "M KCAL OBJETIVO"); track `h-2 rounded-full` `rgba(255,255,255,0.06)` with `inset 0 1px 2px rgba(0,0,0,0.5)`; fill `width: caloricPct*100 || 2%` (2% minimum so the bar is never invisible), cyan→lime gradient + double glow `0 0 10px rgba(206,255,0,0.6), 0 0 4px rgba(0,240,255,0.4)`, `transition-all duration-500 ease-out`.

### 3.2.4 Racha (streak) card (lines ~2704–2719)

`rounded-3xl px-5 py-4 backdrop-blur-md`, `background rgba(18,18,20,0.80)`, `border 1px rgba(255,255,255,0.07)` with a **3px Volt left border** and glow `0 0 20px rgba(206,255,0,0.06)`. Icon tile 40×40 `rounded-2xl` (`rgba(206,255,0,0.08)` bg, `Utensils` 20px Volt). Headline `DS 900 clamp(18px,5.8vw,23px)` in `#CEFF00`: `"MIÉRCOLES · 12 DÍAS DE RACHA"` (singular-aware); subline `9px tracking-[0.28em] rgba(255,255,255,0.28)`: `"RACHA ACTIVA · <ISO date>"`.

### 3.2.5 CalorieRing + MacroBars — the target-metric visualizer (lines ~533–578)

The daily macro visualizer is **one SVG progress ring (calories) + three horizontal macro bars** (protein/carbs/fat) — exact geometry:

```tsx
function CalorieRing({ consumed, protein, carbs, fat, maxP = 60, maxC = 100, maxF = 40 }) {
  const R = 44, circ = 2 * Math.PI * R;                       // r=44 in a 100×100 viewBox
  const dash = Math.min(consumed / (consumed || 1), 1) * circ;
  // 108×108 px rendered, rotate(-90deg) so progress starts at 12 o'clock
  // Track:    <circle r=44 stroke="rgba(255,255,255,0.06)" strokeWidth=5.5 />
  // Progress: <circle r=44 stroke="#34d399" strokeWidth=5.5 strokeLinecap="round"
  //            strokeDasharray={`${dash} ${circ - dash}`}
  //            transition: stroke-dasharray 0.6s cubic-bezier(0.4,0,0.2,1) />
  // Center:   19px font-light tabular-nums white number + 8px uppercase "kcal" at 28% white
}
function MacroBar({ label, value, max, color }) {
  // header row: 9px uppercase tracking-wider label (28% white)
  //             12px tabular-nums value in the macro color + 8px "g" suffix (22% white)
  // track: h-[3px] rounded-full rgba(255,255,255,0.06)
  // fill:  width pct, transition width 0.5s cubic-bezier(0.4,0,0.2,1)
}
// Colors: Proteína #34d399 · Carbos #60a5fa · Grasa #fb923c
```

(The mobile rebuild's `MacroRing` renders these as concentric rings; on web the canonical form is ring + bars.)

### 3.2.6 Cinema Bento Meal Cards + hero (lines ~937–1009, 1546, 2721+)

Meal detail hero — the "image + vertical dark gradient mask" pattern:

```
container: relative -mx-5 mb-6 overflow-hidden, minHeight 260
image:     absolute inset-0 object-cover, opacity 0.48
mask:      absolute inset-0
           background: linear-gradient(to top, #070708 0%, rgba(7,7,8,0.2) 60%, transparent 100%)
content:   relative z-10 px-5 pt-10 pb-6 flex flex-col justify-end
  eyebrow: 9px DS 900 letterSpacing 0.24em color #CEFF00 → "ELITE NUTRITION"
  title:   DS 900 italic clamp(32px,9.5vw,44px) lineHeight 0.9 uppercase white
  macro pills (horizontal row, gap-2 mt-4):
           px-3 py-2 rounded-2xl · background rgba(20,20,20,0.86)
           backdrop-filter blur(16px) · border 1px rgba(255,255,255,0.06)
           label 9px DS 900 tracking .12em (PROT #00F0FF / CARBS #808080 / GRASA #808080)
           value 15px DS 900 white
```

Card-level gradient masks used across the bento/meal/progress cards (all `to top`):
- `rgba(0,0,0,0.95) 0% → rgba(0,0,0,0.55) 45% → rgba(0,0,0,0.1) 100%` (meal list card)
- `rgba(0,0,0,0.9) 0% → rgba(0,0,0,0.3) 50% → transparent 72%`
- `rgba(0,0,0,0.92) 0% → rgba(0,0,0,0.25) 55% → transparent 75%` (photo comparison tiles)
- Profile header scrim (`to bottom`): `rgba(7,7,8,0.25) 0% → rgba(7,7,8,0.15) 40% → rgba(7,7,8,0.85) 85% → rgba(7,7,8,1) 100%`

Meal cards sort **unchecked (pending) first → checked (done) last**; empty state is a `rounded-3xl py-12` `#1A1A1A` card with a ghosted `Utensils` icon and "Tu coach aún no asigna tu dieta."

### 3.2.7 Ingredient rows, food illustrations & the swap drawer (lines ~60–830)

- ~20 hand-drawn 40×40 flat SVG food illustrations (`IlluChicken`, `IlluBeef`, `IlluEgg`, `IlluBread`, …) rendered at 28px inside 48px tiles — Fitia-style.
- `IngredientRow`: `px-4 py-3.5` flex row — illustration tile, name (15px medium white, line-through at 28% white when checked), right-aligned `grams g` + `kcal` stack, optional swap button (28×28 `rounded-xl`, blue `#60a5fa` when active), 24px check circle (emerald `rgba(52,211,153,0.12)` bg + `1.5px rgba(52,211,153,0.5)` border when done). Swapped rows get `background rgba(96,165,250,0.04)` + `borderLeft 2px rgba(96,165,250,0.3)` + "↔ sustituido" caption.
- `EquivCatalog` (swap drawer): filters the 14-item equivalence catalog by `macroType` (`protein`/`carb`), recomputes grams via `gramsPerProtein`/`gramsPerCarb` ratios, shows kcal offset and fat delta per candidate (formulas in §4.3.4). Presented inside `BottomSheet`.
- `BottomSheet`: fixed z-60 backdrop `bg-black/75 backdrop-blur-sm` (fade 0.2s); panel `rounded-t-3xl` `#0d0d0d`, border `rgba(255,255,255,0.06)`, `maxHeight 90vh`, slide-up `0.3s cubic-bezier(0.32,0.72,0,1)`, iOS grab-handle (`w-9 h-[3px]` at 12% white), safe-area padding, body scroll-lock.

### 3.2.8 Workout tab

- Per-day progress bars: `width = done/total%`, same cyan→lime glow gradient.
- Session state machine UI (IDLE → in-progress → complete) with sticky bottom CTA zone: `position: sticky; bottom: 0; padding: 16px 0 40px; background: linear-gradient(to bottom, rgba(7,7,8,0) 0%, #070708 38%)` — content scrolls under a fading floor.
- Rest-timer, focus-mode walkthrough, celebration modal with animated counters; water tracker with cyan fill `linear-gradient(to top, rgba(0,240,255,0.5), rgba(0,240,255,0.12))` toward `WATER_TARGET_ML = 3000`.
- Section dividers: 1px lines fading into Volt — `background: linear-gradient(to right, transparent, #CEFF00)` (mirrored pair around a label).

### 3.2.9 Profile tab

- Full-bleed avatar header under the `to bottom` scrim (§3.2.6); avatar ring `1.5px solid rgba(206,255,0,0.5)` over the stored gradient.
- **Rank ladder (derived purely from streak):** `LEYENDA` ≥ 60 · `BESTIA` ≥ 30 · `GUERRERO` ≥ 14 · else base; sub-rank `ELITE` ≥ 30 / `PRO` ≥ 14 / `NIVEL 1`. Community variant (`getRank`): `LEYENDA ELITE` ≥ 60, `BESTIA ELITE` ≥ 30, `GUERRERO PRO` ≥ 14.
- Monthly progress = `min(100, round(streak / 30 × 100))`.
- Streak matrix card (full-width), PR tiles (squat/deadlift/bench), wallet balance, workout history list, cancel-subscription flow.

### 3.2.10 Community tab

- Real room join/leave (public directory + code entry) per §2.5; roster list with rank badges, online dots, gradient avatars.
- **Coach Broadcast / Intel Feed drawer:** terminal-styled notices feed (most-recent-first, newest highlighted "live").
- The squads/leaderboard/duel widgets (`SEED_SQUAD`, duel "stakes" cards) are **hardcoded demo data** inside the monolith — rendered UI, no API behind them yet (matches ROADMAP §4.B "Gym Squads" future phase).

## 3.3 Coach & Admin Interface Grids

Chrome: SF Dark Pro via CSS variables; sidebar (desktop) is glass (`--bg-sidebar: var(--glass)`), active item Volt-tinted (`--text-sidebar-active: #D4FF00`, `--bg-sidebar-active: rgba(212,255,0,0.08)`); mobile gets a bottom bar (`pb-24 md:pb-8` page padding).

**Coach pages** (`src/app/(dashboard)/coach/…`): `page.tsx` (Resumen), `students/page.tsx` + `students/[id]/page.tsx`, `templates/page.tsx`, `exercises/page.tsx`, `payments/page.tsx`, `periodization/page.tsx`, `sala/page.tsx`, `activity/page.tsx`.

### 3.3.1 Resumen (coach dashboard, `coach/page.tsx`)

- `PageHeader title="Resumen" hint="Estado de tu negocio: ingresos, adherencia y alertas."`; content `px-4 md:px-8 py-6 space-y-4`.
- **KPI grid:** `grid grid-cols-2 md:grid-cols-4 gap-4`; each `Kpi` card `rounded-2xl p-5`, `background var(--bg-surface)`, `border 1px var(--border-subtle)`. KPIs: **MRR** (`$ active×1200 + grace×600` MXN, `toLocaleString("es-MX")`), **Adherencia** (mean `completionRate`; accent success ≥ 80 else warning), **Activos** (`n de total`), **Alertas** (grace+inactive; danger accent when > 0).
- **Curva de adherencia:** `rounded-2xl` card, header `text-[10px] font-black uppercase tracking-widest` tertiary; a custom-built SVG chart (no charting library) plotting every student's completion rate sorted descending — skeletons (`ChartSkeleton`/`RowSkeleton`) while loading.
- **Alumnos list:** same card, header counts with the display font (`Barlow Condensed` 900 14px), `StudentRow` items with gradient avatar (regex-extracts the first hex from `avatarColor` for solid fallback `#3b82f6`), stage chip in `STAGE_COLORS`, payment chip in `PAYMENT_LABELS`.

### 3.3.2 Alumnos table & bulk operations

- `StatsRow` (`src/components/stats-row.tsx`): monochrome typographic strip — `grid grid-cols-2 md:grid-cols-4 gap-px rounded-xl overflow-hidden` where the **container background is `var(--border-subtle)` and the 1px gap becomes hairline dividers** (gap-px trick); tiles: Total / Al día (success accent) / Atención (warning, clickable filter) / Programados.
- `student-table.tsx`: sortable roster (weight trend, adherence %, streak, payment status), `filter-bar.tsx` quick filters by account state and stage.
- `bulk-action-bar.tsx`: the floating glass bar (`backdrop-blur-md bg-black/40 border-white/5` per ROADMAP) that appears on multi-select → opens `change-stage-modal.tsx` / `bulk-periodization-wizard.tsx` (immediate vs. scheduled application, template pickers, macro overrides).
- `add-student-modal.tsx`: the 4-step wizard (Registro → Físico → Medidas → Fotos) with step-locked submission.
- `student-detail.tsx` + `detail-overlay.tsx`: weight SVG chart, measurements grid, diet/routine visualizer, zoomable photo viewer, scheduled-change cancellation banner.

### 3.3.3 Remaining coach panels

- **Plantillas** (`templates/page.tsx` + `template-editor.tsx`): diet library broken down by macros/meal times; routine library (day builder with catalog-linked exercises).
- **Ejercicios** (`exercises/page.tsx`): catalog CRUD grid with image/video, muscle-group filters, one-click 30-exercise seed.
- **Pagos** (`payments/page.tsx`): recurring-billing monitor (per-student `paymentStatus`, manual status override → `POST /api/coach/students/status`), Stripe Connect onboarding entry.
- **Periodización** (`periodization/page.tsx`): stage-distribution breakdown (Volumen/Definición/Mantenimiento/Recomposición) + forward timeline of pending `ScheduledChange`s.
- **Sala** (`sala/page.tsx`): room settings (public toggle, join code, price), notice composer (posts via `POST /api/community/messages`), notice deletion, team telemetry snapshot.
- **Actividad** (`activity/page.tsx`): student activity feed (checks/sessions/runs).

### 3.3.4 Admin panel (`src/app/admin/…`)

- `admin/page.tsx`: platform overview — total coaches/students/clients/actives + hardcoded-fee MRR; coach cards with per-coach student counts and MRR contribution; "create coach" form (name/email/password → `POST /api/admin/coaches`).
- `admin/coach/[coachId]/page.tsx`: read-only drill-down into any coach's roster (reuses the coach's student-detail view for individual students — admin has no parallel detail UI).
- `admin/profile/page.tsx`: admin's own name/email + sign-out. No settings page, no feature flags, no audit log, no user deletion/suspension — intentionally thin.

### 3.3.5 Login & gateway

- `login/page.tsx`: single credentials screen (NextAuth), SF Dark Pro styling, white-CTA/black-text.
- `_gateway.tsx` + `providers.tsx`: role-based client-side routing after login (ADMIN → `/admin`, COACH → `/coach`, CLIENT → `/portal`); `/portal/blocked/page.tsx` is the `ACCOUNT_BLOCKED` landing (reached by client-side fetch-error detection — there are **no** server-side redirects).

---
# 4. FUNCTIONAL BUSINESS RULES, CALENDAR LOGIC & SYSTEM CONCEPTS

## 4.1 Calendar & Time Workflows

### 4.1.1 Date representation — strings, not timestamps

Every date key in the database (`WeightEntry.date`, `DailyCheck.date`, `ExerciseLog.date`, `WorkoutSession.date`, `WaterLog.date`, `Carrera.date`, `Student.lastWeighIn/joinedDate/nextStageDate`, `ScheduledChange.executionDate`, `Measurement.date`) is a **plain `YYYY-MM-DD` string**, compared lexicographically (`executionDate: { lte: todayStr }` works because ISO strings sort correctly). Only `createdAt`/`updatedAt` audit columns are real `DateTime`s.

### 4.1.2 The client-side calendar engine (portal, lines ~400–458 — verbatim semantics)

```ts
// app dayIdx convention: 1=Monday … 6=Saturday … 7=Sunday (ISO week).

const todayDateStr = (): string => {
  const d = new Date();   // DEVICE-LOCAL calendar, explicitly not UTC
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

const appDayToJsWeekday = (dayIdx) => (dayIdx === 7 ? 0 : dayIdx);   // app-Sunday(7) → JS-Sunday(0)

const realDateForDayIndex = (dayIdx) => {
  // Finds this ISO week's Monday by local arithmetic, then Monday + (dayIdx - 1).
  // dayIdx 1 → this week's Monday … dayIdx 7 → this week's Sunday.
};

const todayAsDayIndex = () => { const js = new Date().getDay(); return js === 0 ? 7 : js; };

const resolveRoutineDay = (dayIdx, days) => {
  const jsWeekday = appDayToJsWeekday(dayIdx);
  const explicit  = days.find(d => d.weekday === jsWeekday);  // explicit weekday binding wins
  return explicit ?? days[dayIdx - 1];                        // else ordinal slot mapping
};

const WEEKDAY_SHORT = { 1:"LUNES", 2:"MARTES", 3:"MIÉRCOLES", 4:"JUEVES", 5:"VIERNES", 6:"SÁBADO", 7:"DOMINGO" };
```

**Routine↔weekday anchoring rule:** a `RoutineDay` with an explicit `weekday: 0–6` field is pinned to that exact calendar weekday; routines without it map ordinally — slot 0 = Monday, slot 1 = Tuesday, etc. The student can freely browse days 1–7 via the pill strip/carousel; every check and log written while browsing day *N* is keyed to `realDateForDayIndex(N)` — the **real calendar date of that weekday in the current ISO week**, so browsing tomorrow writes tomorrow's date, not today's.

### 4.1.3 Timezone truth table (documented divergence)

| Layer | "Today" computed as | Effective timezone |
|---|---|---|
| Portal client (all reads/writes it initiates) | `todayDateStr()` — local `getFullYear/getMonth/getDate` | **Device-local** |
| Server: `runAutoCron()`, `applyStageChange()`, `/api/me POST` weigh-in | `new Date().toISOString().split("T")[0]` | **UTC** |

Consequence: between local midnight and UTC midnight (e.g. 18:00–00:00 in Mexico City, UTC-6) the server's "today" can differ from the device's by one day. In practice the client sends its own `date` field on checks/logs/sessions (so those are device-truth); the drift only touches server-initiated dating: scheduled-change execution timing and the `/api/me` weigh-in date. Documented as an accepted quirk, not a crash risk — but any future server-side streak engine must pick one clock.

### 4.1.4 Midnight rollover (portal)

A **60-second poll** compares the mounted date against `todayDateStr()`. On change it: hard-resets the in-progress workout state machine, clears the session `localStorage` caches, and re-anchors `activeDayIndex` to `todayAsDayIndex()`. Past dates' Postgres data is **never** touched by this reset — it is purely a client-state hygiene mechanism.

### 4.1.5 Streaks — what is real today

`Student.streak` is **display state, not a computed metric**: seeded `1` by the creation wizard, `0` by bulk import, mutated only when a coach PUT sends a new value. No API increments it on activity, and no cron decays it. Everything gamified that *consumes* it (rank titles, monthly %, "N DÍAS DE RACHA") is live; the *producer* is manual/future work. The same is true of `completionRate` (seeded 100 wizard / 0 import). The **team-level** live metric that does exist is `getTeamTelemetry`'s `streakPct` = distinct students with ≥1 `DailyCheck` **or** `WorkoutSession` today ÷ roster size.

## 4.2 The Access-Gate Doctrine (`isActive` vs `paymentStatus`)

The single most load-bearing business rule, enforced identically at `/api/me` and `/api/mobile/portal`:

1. `Student.isActive` (default `true`) is the **sole** access gate. `false` → `403 {"error":"ACCOUNT_BLOCKED"}`; the portal client catches it and routes to `/portal/blocked`.
2. The **only** write path is `PATCH /api/students/[id]` `{ isActive }` — a deliberate coach/admin manual switch.
3. `paymentStatus` (`active|inactive|grace_period|past_due`) is billing telemetry: written by Stripe webhooks and the coach's manual status endpoint, displayed in dashboards, **never** consulted by any access check.
4. Therefore: a student in `past_due` still trains; a paid student flipped to `isActive:false` is locked out instantly. The coach's manual override always wins, immediately, with no Stripe round-trip.
5. Coaches and admins are never access-gated at all (`isActive` exists only on `Student`).

## 4.3 Client Lifecycle Logic

### 4.3.1 Checking off a meal (end-to-end)

1. Student taps a meal card's check control on app-day *N* → client computes `date = realDateForDayIndex(N)`.
2. `POST /api/me/checks` `{ date, kind: "meal", itemKey: <mealName>, done: true }` → `dailyCheck.upsert` on the compound key `(studentId, date, "meal", mealName)` — re-checking is a no-op, unchecking is `deleteMany` (toggling allowed until the day rolls over by convention).
3. UI adds the meal's kcal + macros to the consumed totals (ring/bars §3.2.5), re-sorts cards (pending first), and — when every meal of the day is checked — fires the "DÍA PERFECTO" celebration (independent of the workout celebration).
4. Coach sees it two ways: today's tick in `GET /api/coach/telemetry`, historical rows via `GET /api/students/[id]/checks`.

### 4.3.2 Logging biometrics

- **Weight:** `POST /api/me/biometrics` `{ weight }` — hard range check **20 ≤ kg ≤ 500** → the `logDailyWeight` transaction (`deleteMany` today's entry → `create` → `student.currentWeight` update). Exactly one node per calendar day; same-day re-log overwrites. (The legacy `POST /api/me` multipart path additionally maintains `previousWeight`/`lastWeighIn` and accepts a photo.)
- **Session telemetry (wearable):** only after a `WorkoutSession` row exists for that date — `POST /api/student/workout-session/telemetry` upserts the 1:1 `WorkoutBiometrics` (avg/max HR, active/total kcal, device source, HR time series). Telemetry-before-session → 404 by design.

### 4.3.3 Personal records (PRs)

`PATCH /api/me/prs` `{ lift: "squat"|"deadlift"|"bench", kg }` — server-enforced **monotonic increase**: a submission ≤ current PR is silently ignored (200 with unchanged values, no error). UI should always allow submission and trust the response rather than pre-validating.

### 4.3.4 Food substitution math

The swap engine preserves the **dominant macro**, not calories. For an ingredient with `P` g protein / `C` g carbs: substitute grams = `round(P × gramsPerProtein)` for protein-class swaps, `round(C × gramsPerCarb)` for carb-class. Displayed deltas: kcal offset = `round(newGrams × calsPer100g / 100) − ingredient.calories`; fat delta = `round((newGrams × fatPer100g/100 − baseFat) × 10)/10`. When an ingredient lacks explicit macros, the client estimates: protein ≈ `calories × 0.25 / 4`, carbs ≈ `calories × 0.45–0.5 / 4`, fat ≈ `calories × 0.30 / 9`. Macro-class inference: keyword lists first (`PROTEIN_KEYS`/`CARB_KEYS` against the name), then `protein ≥ carbs` comparison. The authoritative ratio bank is the self-seeded `FoodSubstitute` table (§2.9); the portal additionally ships a richer inline catalog with photos/notes (7 carbs + 7 proteins).

### 4.3.5 Checking off exercise sets & finishing a session

1. Set-by-set logging: `PATCH /api/me/logs` upserts that date+exercise's `ExerciseLog` (sets array with `setNumber/targetReps/actualReps/weight/completed`), rest timer (default 90s) between sets, optional focus mode.
2. In-progress state persists in `localStorage` (`sessionCacheKey`) and survives tab switches; restored on mount.
3. "Finalizar" → `POST /api/student/workout-session` — either the client's explicit cumulative `exerciseLogs` snapshot (**replace-semantics** for that date) or the server-side aggregation of that date's `ExerciseLog` rows. `completed` derives from `every(e => e.completed)` unless explicitly sent.
4. Celebration modal (duration + exercise-count counters); wearable summary then posts to telemetry (§4.3.2).
5. History renders from `GET /api/student/workout-session/history` (last 50 with biometrics).

### 4.3.6 Hydration, wallet, photos, subscription self-service

- **Water:** `POST /api/student/water` appends `WaterLog` rows (multiple per day); the portal fills a cyan gauge toward `WATER_TARGET_ML = 3000`.
- **Wallet:** `PATCH /api/me/wallet` `{ delta }`; server blocks below-zero; balance surfaces in the Perfil tab (gamified currency — no purchase flow wired yet).
- **Photos:** `POST /api/me/photos` (≤5MB jpeg/png/webp, 3-tier storage §2.7); first-ever photo auto-becomes `photoName` (cover); gallery powers the before/after comparison and the shareable badge export (`downloadBadge`).
- **Subscription:** `POST /api/subscription/cancel` (Stripe `cancel_at_period_end`, local `paymentStatus:"inactive"` always) and `POST /api/me/reactivate` (Checkout link) — neither touches `isActive`.

## 4.4 Coach Lifecycle Logic

### 4.4.1 Assigning a diet/routine — templates, snapshots, and the lazy cron

- Plans are authored once as `Template` rows and **copied** onto students (`stripTemplate` snapshot) — students never hold live references, so editing a template later does not ripple into assigned plans. The exception is the exercise catalog: `ejercicioId` references resolve live at read time (§1.4.5).
- **Bulk change-stage** (`POST /api/students/change-stage`): any number of students, target stage + optional diet/routine templates + optional macro overrides (`protein/carbs/fat/calories` patched into the resulting JSON) + optional routine settings (`splitBlock/phaseWeek/phaseTotalWeeks/trackRpe/weightLimits`). `executionDate` today-or-past → applied immediately; future → queued as the student's single `ScheduledChange`.
- **AutoCron is lazy:** `runAutoCron()` runs at the top of `getStudents()`, `getStudentById()`, `getStudentDetail()` — i.e., on virtually every roster/profile read by anyone. It drains **all** due `ScheduledChange` rows platform-wide (`executionDate lte today`, UTC), applying stage + template snapshots then deleting the queue row. There is no real scheduler; traffic is the scheduler.

### 4.4.2 Parsing student tracking data

Coach-side adherence/analytics are computed client-side from raw feeds: `GET /api/students/[id]/checks` (all `DailyCheck` rows), `/logs` (all `ExerciseLog`s), `/carreras` (runs via the `userId` bridge), plus the detail payload (weights, measurements, photos, plan JSON). The dashboard's adherence curve sorts every student's stored `completionRate` descending; per-student weight trends chart `weightHistory`.

### 4.4.3 Real-time student telemetry

`GET /api/coach/telemetry` — "who did anything today": union of distinct `studentId`s with a `DailyCheck` or `WorkoutSession` dated today, over the coach's roster → `{ totalStudents, activeToday, streakPct }`. Surfaced in the Sala panel as the live team pulse.

### 4.4.4 Broadcasting notices

Creation: `POST /api/community/messages` (COACH-only) → a `GroupMessage` with `role:"COACH"`. Consumption: students see the newest in the portal's directive card + Intel Feed drawer (`/api/student/latest-notice`, `/api/community/join` hydration, `/api/mobile/community/notices`); management: `GET /api/coach/notices` (last 50) + ownership-checked `DELETE /api/coach/notices/[id]`. Notices and chat share one table, separated only by `role`.

### 4.4.5 Roster acquisition paths (3)

1. **Wizard** (`POST /api/students`): 4 steps, optional immediate Stripe checkout (non-fatal), auto-provisions the CLIENT login (default password `"mycouchpassword"` — a known onboarding convention worth rotating).
2. **Bulk import** (`POST /api/coach/import`): 15-column Spanish `.xlsx` + optional photo `.zip` (fuzzy filename match), transactional per row, duplicate emails skipped with warnings, invalid stages default to `"Volumen"`.
3. **Self-join** (`POST /api/community/join`): student-initiated by public directory or join code — this *is* roster assignment, since `coachId` is the room membership.

Removal is always the soft unlink (`coachId:null`) — from the coach side (`DELETE /api/coach/students/[id]`) or the student side (`POST /api/student/leave-room`); all history survives.

## 4.5 Community Room Rules

1. **A room = a coach.** `GroupMessage.coachId` is the room key; membership = `Student.coachId`. One room per student, ever.
2. **Joining is destructive and unconditional** — any prior `coachId` is overwritten with no server-side confirmation (the UI is expected to warn). Branch semantics of `POST /api/community/join`: `{roomId}` public-only (422 `"SALA NO DISPONIBLE O NO PÚBLICA"`), `{code}` uppercase-normalized join-code lookup (422 `"CÓDIGO NO COINCIDE CON NINGÚN RADAR"`), `{}` pure hydration (returns current room + notices, mutates nothing).
3. **Posting is COACH-exclusive.** `POST /api/community/messages` rejects CLIENT (403) — students are read-only in both feeds. Any client UI implying students can post is ahead of the backend.
4. **Reading requires only authentication + the `coachId` query param** — the messages endpoint does not verify the reader belongs to that room (flagged: any authenticated user who knows a coachId can read that room's feed).
5. **Discovery:** `GET /api/community/public-rooms` lists `isPublic` coaches with member counts, plus the student's current room even if it has since gone private. Room identity/visibility/join code are managed by the coach via `PATCH /api/coach/profile` (joinCode unique, 4–24 chars, uppercase; P2002 → 409).
6. **Notices vs chat:** same table, `role:"COACH"` rows are the broadcast feed (take 20 on hydration endpoints, 50 on the management endpoint, 100 on the full chat read).
7. **Token dependency:** a coach's mobile/web token carries `coachId` — message creation stamps `coachId`, `senderId`, `senderName` from the session, never from the body (no room spoofing).

## 4.6 Money Flows (Stripe)

1. **Platform ↔ Coach:** Express Connect onboarding (`/api/coach/connect` → account + onboarding/login links); `account.updated` webhook flips `stripeOnboardingComplete` once `details_submitted`.
2. **Coach ↔ Student:** `Coach.monthlyPrice` (default $1,200 MXN) drives Checkout subscriptions created at student-creation (non-fatal) or reactivation. `Student.stripeCustomerId`/`stripeSubscriptionId` bind the Stripe objects.
3. **Webhook state machine (paymentStatus only):** `invoice.paid` → `active` · `invoice.payment_failed` → `past_due` · `customer.subscription.deleted` → `inactive` (+ subscription id cleared). Unmatched customers (CLI tests) acknowledged with 200; real DB errors → 500 → Stripe retry.
4. **Dashboards:** coach MRR = `active×1200 + grace×600`; admin MRR uses flat `MONTHLY_FEE = 1200` per active student (does **not** read per-coach `monthlyPrice` — known simplification).
5. **Blocking is human:** no money event ever locks a student out (§4.2).

## 4.7 Known Sharp Edges (verified, for any migration/rebuild to preserve or fix deliberately)

1. `mobile/login` ships `[BACKEND IMPACT]` console.log diagnostics — strip.
2. `student/water` COACH path lacks target-ownership validation; `students/[id]/{checks,logs,carreras}` let any COACH read any student (no roster scoping); `community/messages` GET lacks room-membership checks.
3. Server-UTC vs device-local "today" drift (§4.1.3).
4. `streak`/`completionRate` have no producer (§4.1.5) — the UI is ready for an engine that doesn't exist yet.
5. Admin MRR ignores per-coach pricing (§4.6.4).
6. `GET /api/coach/import` (the xlsx template download) is unauthenticated.
7. Squads/leaderboard/duels in the portal are seeded demo data (ROADMAP §4.B future phase), not API-backed.
8. Default provisioning password `"mycouchpassword"` is universal for coach-created students.

---

*End of specification. Companion documents in this repo: `global_business_specification.md` (business-rule narrative) and `global_technical_migration_blueprint.md` (mobile-rebuild gap audit & module plan) — this master spec supersedes both on any point of conflict, being the most recent full-code audit.*
