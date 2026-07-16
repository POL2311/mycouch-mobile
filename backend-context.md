# Backend Context — MyCoach (repo `mycouch`)

> Generado el 2026-07-16 a partir de una inspección directa del repo backend en
> `../mycouch` (Next.js App Router + Prisma + PostgreSQL/Neon).
> Fuente de verdad: `prisma/schema.prisma`, `src/app/api/students/**`,
> `src/lib/db.ts`, `src/lib/session.ts`, `src/lib/mobile-auth.ts`.

---

## 1. Esquema de Prisma (Student y relacionados)

```prisma
enum Role { ADMIN COACH CLIENT }
enum MembershipTier { DIET_ONLY ROUTINE_ONLY FULL }

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

model Student {
  id             String @id @default(cuid())
  name           String
  email          String
  avatarInitials String
  avatarColor    String
  currentWeight  Float          // ⚠️ NO tiene default ni es opcional en el schema
  previousWeight Float          // ⚠️ ídem
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

**Nota importante:** en el modelo `Student`, `currentWeight` y `previousWeight` son
`Float` **obligatorios** (sin `?` ni `@default`). Cualquier `prisma.student.create`
que no incluya un número ahí falla a nivel de base de datos (no solo de la API).
Ver §3 para cómo el endpoint `POST` evita este error con un fallback a `0`.

Otros modelos relacionados con el alumno (no pedidos explícitamente pero
presentes en el mismo schema): `Template`, `ExerciseLog`, `Ejercicio`,
`DailyCheck`, `WorkoutSession`, `WorkoutBiometrics`, `FoodSubstitute`,
`WaterLog`, `GroupMessage`, `Carrera`.

---

## 2. Autenticación / headers esperados

Archivo: `src/lib/session.ts` + `src/lib/mobile-auth.ts`.

`getSessionUser()` resuelve la identidad de dos formas, en este orden:

1. **Web:** cookie de sesión de NextAuth (`auth()`).
2. **App móvil:** header `Authorization: Bearer <JWT>`.
   - El JWT se firma con `AUTH_SECRET` (mismo secreto que usa NextAuth), algoritmo `HS256`.
   - `sub` = `user.id`.
   - Claims custom: `role` (`ADMIN|COACH|CLIENT`), `coachId`, `studentId`.
   - Expira a los 30 días (`signMobileToken`, `mobile-auth.ts`).
   - Si el header no matchea `/^Bearer\s+(.+)$/i` o el JWT no verifica, `getSessionUser()` devuelve `null` → **401 "No autenticado"**.

```ts
export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: "ADMIN" | "COACH" | "CLIENT";
  coachId?: string | null;
  studentId?: string | null;
};
```

El módulo `lib/api.ts` de este proyecto móvil **ya** agrega el header
`Authorization: Bearer ${token}` correctamente cuando hay token guardado.
Si un endpoint devuelve 403, el problema normalmente NO es la ausencia del
header sino el **rol** codificado en el JWT (ver §4, causa típica del 403 en
`PATCH`).

---

## 3. `POST /api/students` — creación de alumno

Archivo: `src/app/api/students/route.ts`

### Autorización
```ts
const user = await getSessionUser();
if (!user || (user.role !== "COACH" && user.role !== "ADMIN")) {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
```
Solo `COACH` o `ADMIN` pueden crear alumnos. `CLIENT` o sin sesión → 403/401.

### Body esperado
Acepta **dos formatos**, detectados por `content-type`:

- `multipart/form-data` (flujo normal, permite subir foto):
  campos leídos vía `formData.get(...)`: `name`, `email`, `stage`, `stageNumber`,
  `startingWeight`, `height`, `bodyFat`, `chest`, `waist`, `hips`, `photo` (File).
- `application/json` (fallback): se usa `data = await request.json()` tal cual,
  por lo que en este caso el body debe llegar **ya con los nombres de campo
  correctos** (`name`, `email`, `startingWeight`, etc.) porque no hay parseo
  adicional.

### Validación
```ts
if (!data.name || !data.email) {
  return NextResponse.json({ error: "Nombre y correo son requeridos" }, { status: 400 });
}
```
Es la **única** validación dura de body. `startingWeight` **no es obligatorio**
a nivel de validación explícita: si falta, `parseFloat(...) || 0` lo convierte
en `0` (ver línea `const startingWeight = parseFloat(formData.get("startingWeight") as string) || 0;`).//  Ese `0` es luego lo que llena `currentWeight`/`previousWeight`, que sí son
obligatorios en Prisma (§1). Es decir: el backend **no exige** `currentWeight`
directamente, pero si el cliente no manda `startingWeight`, el alumno queda
creado con peso `0`, lo cual puede ser el origen de un bug percibido como
"pide currentWeight".

### Qué hace con el body
1. Genera `avatarInitials` a partir de `name`.
2. Arma `newStudent` (peso actual = `previousWeight` = `startingWeight`) y
   `detail` (incluye `weightHistory[0]`, `diet`/`routine` vacíos con placeholders,
   `measurements[0]` con `chest/waist/hips` o `0`, `notes` por defecto).
3. `addStudent(newStudent, detail, coachId)` → `src/lib/db.ts:231`:
   - `prisma.student.create({ data: {...}, include: { scheduledChange: true } })`.
   - Crea anidados `weightHistory`, `measurements`, y `photos` (si hay `photoName`).
   - `coachId` = `user.coachId` si el creador es `COACH`; si no, `getDefaultCoachId()`.
4. **Auto-provisión de cuenta `User` CLIENT** para el alumno
   (`provisionUserForStudent`) — si falla, solo hace `console.error`, no aborta
   la respuesta.
5. **Stripe** (si `stripeEnabled()`): crea `customer`, actualiza
   `stripeCustomerId` en el `Student`, y genera una `checkout.session` de
   suscripción (usa Connect del coach si `stripeOnboardingComplete` es `true`).
   Errores de Stripe también solo se loguean, no rompen la respuesta.

### Respuesta
```ts
return NextResponse.json({ ...created, checkoutUrl });
```
`created` es el `Student` (vía `toStudent()`, ver §5) + `checkoutUrl` (string o `null`).

### Errores
- 401 si no hay sesión.
- 403 si el rol no es `COACH`/`ADMIN`.
- 400 si falta `name` o `email`.
- 500 con `{ error: error.message }` para cualquier excepción no controlada
  (incluyendo, potencialmente, una violación de constraint de Prisma).

---

## 4. `PATCH /api/students/[id]` — actualización (activar/desactivar)

Archivo: `src/app/api/students/[id]/route.ts`

```ts
const user = await getSessionUser();
if (!user || (user.role !== "COACH" && user.role !== "ADMIN")) {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
const body = await request.json();
if (typeof body.isActive !== "boolean") {
  return NextResponse.json({ error: "isActive (boolean) es requerido." }, { status: 400 });
}
```

**Causas típicas del 403 en este endpoint:**
1. El JWT decodificado por `verifyMobileToken` no trae `role` o trae
   `role: "CLIENT"` — revisar qué `role` se firmó al hacer login en el móvil.
2. Sesión expirada/token corrupto → `getSessionUser()` devuelve `null` → aquí
   cae también en la misma rama 403 (no hay branch separado para 401 en este
   PATCH; nota: la condición `!user || rol inválido` colapsa ambos casos al
   mismo mensaje "No autorizado" con status 403, a diferencia del `GET` y del
   `POST` de la colección que sí distinguen 401 vs 403).
3. Nota: **este `PATCH` es exclusivamente para cambiar `isActive`**. Si el
   móvil intenta mandar otros campos (ej. `currentWeight`, `stage`, etc.) por
   este verbo, el endpoint los ignora y solo exige `isActive: boolean` en el
   body — si ese campo falta o no es boolean, responde 400, no 403.
   Para actualizar otros campos del alumno existe **`PUT` en el mismo archivo**
   (`studentUpdates` / `detailUpdates` en el body), con la misma verificación
   de rol.

Lógica de escritura:
```ts
const updated = await prisma.student.update({
  where: { id },
  data: { isActive: body.isActive },
  select: { id: true, isActive: true },
});
return NextResponse.json(
  { success: true, student: updated },
  { headers: { "Cache-Control": "no-store, max-age=0" } },
);
```
Responde solo `{ id, isActive }` (select explícito), con header
`Cache-Control: no-store, max-age=0` tanto en éxito como en error.

---

## 5. `GET /api/students/[id]` — lectura de detalle

Archivo: `src/app/api/students/[id]/route.ts`

### Autorización
```ts
const user = await getSessionUser();
if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
if (user.role === "CLIENT" && user.studentId !== id) {
  return NextResponse.json({ error: "No autorizado" }, { status: 403 });
}
```
- Cualquier usuario autenticado puede pedir cualquier `id` **excepto** un
  `CLIENT` pidiendo un `id` que no sea el suyo (`user.studentId !== id` → 403).
- No hay chequeo de que un `COACH` solo vea a sus propios alumnos en este
  endpoint puntual (a diferencia de `GET /api/students`, que sí filtra por
  `coachId` — ver `getStudents`).

### Qué devuelve
```ts
const student = await getStudentById(id);   // include: { scheduledChange: true }
const detail = await getStudentDetail(id);  // include: scheduledChange, weightHistory, measurements, photos
if (!student || !detail) return 404 "Alumno no encontrado";
return NextResponse.json({ student, detail });
```

`getStudentById` (`db.ts:180`):
```ts
prisma.student.findUnique({ where: { id }, include: { scheduledChange: true } })
```
mapeado por `toStudent()` a:
```ts
{
  id, name, email, avatarInitials, avatarColor,
  currentWeight, previousWeight, lastWeighIn, stage, stageNumber,
  isActive, membershipTier, paymentStatus, joinedDate, coachId,
  streak, completionRate, prSquat, prDeadlift, prBench, walletBalance,
  scheduledChange: { executionDate, stage, stageNumber, dietTemplateId?, routineTemplateId? } | null
}
```

`getStudentDetail` (`db.ts:186`):
```ts
prisma.student.findUnique({
  where: { id },
  include: {
    scheduledChange: true,
    weightHistory: { orderBy: { date: "asc" } },
    measurements:   { orderBy: { date: "asc" } },
    photos:         { orderBy: { createdAt: "desc" } },
  },
})
```
mapeado por `toDetail()` a:
```ts
{
  weightHistory: [{ date, weight }],
  diet: JSON.parse(dietJson) || EMPTY_DIET,
  routine: JSON.parse(routineJson) || EMPTY_ROUTINE,  // días resueltos contra el catálogo Ejercicio del coach
  measurements: [{ id, date, chest, waist, hips, armL, armR, thighL, thighR }],
  nextStageDate, notes, height, bodyFat, photoName,
  photos: [{ id, url, label, weight, createdAt (ISO string) }],
  scheduledChange: {...} | null,
}
```

Nota: `routine.days` pasa por `resolveDays()`, que reemplaza nombre/grupo
muscular/bodyweight/imágenes de cada ejercicio usando el catálogo
`Ejercicio` del coach (por `ejercicioId`), con fallback a los valores ya
guardados en el JSON si no hay match.

`ExerciseLog`, `WorkoutSession`, `DailyCheck`, `WaterLog` **no** se incluyen
en este `GET` — tienen sus propios endpoints (`/api/students/[id]/checks`,
`/api/students/[id]/logs`, `/api/student/workout-session/*`, etc.).

---

## 6. Resumen rápido de contratos

| Endpoint | Método | Roles permitidos | Body mínimo | Respuesta |
|---|---|---|---|---|
| `/api/students` | GET | COACH (solo los suyos), ADMIN (todos), CLIENT ([]) | — | `Student[]` |
| `/api/students` | POST | COACH, ADMIN | `name`, `email` (resto opcional, defaults a `0`/vacío) | `Student & { checkoutUrl }` |
| `/api/students/[id]` | GET | cualquiera autenticado; CLIENT solo su propio `id` | — | `{ student, detail }` |
| `/api/students/[id]` | PATCH | COACH, ADMIN | `{ isActive: boolean }` | `{ success, student: { id, isActive } }` |
| `/api/students/[id]` | PUT | COACH, ADMIN | `{ studentUpdates?, detailUpdates? }` | `{ success: true }` |

Header de auth para el móvil: `Authorization: Bearer <JWT firmado con AUTH_SECRET>`,
con claims `role`, `coachId`, `studentId` y `sub` = userId.
