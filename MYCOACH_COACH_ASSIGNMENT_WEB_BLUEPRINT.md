# MYCOACH — COACH PROGRAMMING & CLIENT ASSIGNMENT ENGINE WEB BLUEPRINT
## Ground-Truth Extraction of the Coach→Client Plan Pipeline for the Mobile Rebuild

**Source repo:** `/Users/alatorre/Desktop/images/mycouch` (web), branch `nuevoultimo`.
**Primary sources:** `prisma/schema.prisma` · `src/lib/db.ts` (the entire assignment engine: `applyStageChange`, `runAutoCron`, `stripTemplate`, `resolveDays`, `getTemplates`, `parseDiet/parseRoutine`) · API routes `src/app/api/{templates,students/change-stage,students/[id],ejercicios,coach/exercises/seed,me,mobile/portal}` · coach UI `src/app/(dashboard)/coach/{templates,students,periodization}/page.tsx`, `src/components/{template-editor,change-stage-modal,bulk-periodization-wizard,student-detail}.tsx` · client consumption `src/app/portal/page.tsx`.
**Method:** every model, payload, formula, and string below is verbatim from live code. No TRPC/React Query/Axios — plain `fetch()` everywhere.
**Folder companions:** `MYCOACH_SALAS_WEB_BLUEPRINT.md` · `MYCOACH_STATS_WEB_BLUEPRINT.md` · `MYCOACH_PROFILE_WEB_BLUEPRINT.md` (+ copies of the global/retina/workout specs).

---

## ⚠ 0. THE ONE ARCHITECTURAL FACT THAT GOVERNS EVERYTHING

**There is no `WorkoutPlan` or `DietPlan` table.** Plans are **denormalized JSON snapshots** stored as stringified `TEXT` on the `Student` row (`dietJson`, `routineJson`). The pipeline is:

```
Coach authors Template (dataJson) ──► assignment event copies a SNAPSHOT onto Student.dietJson/routineJson
      │                                        (stripTemplate: drops {id,type}; optional overrides merged)
      │                                        immediately, OR queued as ScheduledChange (1 per student)
      └─ Ejercicio catalog ◄──── routine exercises reference it LOOSELY by ejercicioId (no FK)
                                  resolved LIVE at every read (resolveDays)
Client reads GET /api/me | /api/mobile/portal ──► parseDiet/parseRoutine (never-throw fallbacks)
      └─ day selection is CLIENT-side: explicit `weekday` pin, else ordinal slot→weekday
```

Consequences the mobile layer must mirror:
1. Editing a **Template** later does **not** ripple to already-assigned students (snapshots, not references).
2. Editing a catalog **Ejercicio** *does* ripple into every routine referencing it by `ejercicioId` (live join at read time).
3. Weekday binding (`Lunes`, `Martes`, …) is a **display string** on each day plus an *optional* numeric `weekday` pin — actual scheduling is ordinal (slot 0 = Monday) unless the pin exists (§3.3).
4. A student has at most **one** pending future assignment (`ScheduledChange.studentId @unique`), drained lazily by traffic (§2.4).

---

# 1. DATABASE & SCHEMA GROUND TRUTH

## 1.1 The binding chain (Prisma, verbatim)

```prisma
model User {           // login identity
  id String @id @default(cuid())
  email String @unique
  passwordHash String
  name String
  role Role @default(CLIENT)          // enum Role { ADMIN COACH CLIENT }
  coachProfile Coach?  @relation("CoachUser")
  student      Student? @relation("StudentUser")
}

model Coach {          // the tenant: owner of students, templates, catalog
  id String @id @default(cuid())
  userId String @unique
  user User @relation("CoachUser", fields: [userId], references: [id], onDelete: Cascade)
  students   Student[]
  templates  Template[]
  ejercicios Ejercicio[]
  monthlyPrice Float @default(1200)
  joinCode String? @unique
  isPublic Boolean @default(false)
  stripeConnectId String?
  stripeOnboardingComplete Boolean @default(false)
}

model Student {        // THE PLAN LIVES HERE — no plan tables exist
  id String @id @default(cuid())
  name String
  email String
  stage       String   // "Volumen" | "Definición" | "Mantenimiento" | "Recomposición"
  stageNumber Int      // phase ordinal within the stage (rendered "E{n}")
  dietJson    String @default("")   // ← ASSIGNED DIET  (stringified JSON snapshot, §1.2)
  routineJson String @default("")   // ← ASSIGNED ROUTINE (stringified JSON snapshot, §1.3)
  nextStageDate String?             // display-only echo of the pending change date
  coachId String?
  coach   Coach? @relation(fields: [coachId], references: [id], onDelete: SetNull)
  userId  String? @unique
  user    User?  @relation("StudentUser", fields: [userId], references: [id], onDelete: SetNull)
  scheduledChange ScheduledChange?
  // …(full model in MYCOACH_GLOBAL_MASTER_SPEC.md §1.2)
}

model Template {       // the coach's reusable library — NOT bound to any student
  id String @id @default(cuid())
  type String          // plain string: "diet" | "routine" (no enum)
  name String
  dataJson String      // JSON body minus {id,type,name} (kept in columns)
  coachId String?      // nullable → global/shared template
  coach Coach? @relation(fields: [coachId], references: [id], onDelete: SetNull)
  createdAt DateTime @default(now())
}

model ScheduledChange { // the future-assignment queue — STRICT 1:1 per student
  id String @id @default(cuid())
  studentId String @unique
  student Student @relation(fields: [studentId], references: [id], onDelete: Cascade)
  executionDate String   // "YYYY-MM-DD", compared lexicographically (lte today)
  stage String
  stageNumber Int
  dietTemplateId    String?   // loose refs to Template (no FK)
  routineTemplateId String?
}

model Ejercicio {      // per-coach technical exercise catalog
  id String @id @default(cuid())
  coachId String
  coach Coach @relation(fields: [coachId], references: [id], onDelete: Cascade)
  name String
  muscleGroup String   // canonical: Pecho, Espalda, Pierna, Glúteo, Hombro, Brazo, Core, Cardio
  equipment String     // canonical: Barra, Mancuerna, Polea, Peso corporal, Máquina, Banda
  bodyweight Boolean @default(false)
  imageUrl String?
  videoUrl String?
  @@unique([coachId, name])   // makes the 30-exercise seed idempotent (upsert coachId_name)
}
```

## 1.2 `dietJson` — the assigned DietPlan snapshot (exact stored shape)

Authored by `TemplateEditorModal` (`DietData` type, verbatim):
```ts
type Macros = { protein: number; carbs: number; fat: number };
type Meal   = { name: string; time: string; calories: number;
                protein: number; carbs: number; fat: number;   // ← FLAT macro fields as authored/stored
                items: string[] };                              // one food per line
interface DietData { name: string; totalCalories: number; macros: Macros; meals: Meal[] }
```
Stored example (full production sample in the global spec §1.4.1): `{"name":"Hipocalórica Definición","totalCalories":1750,"macros":{"protein":140,"carbs":160,"fat":50},"meals":[{"name":"Desayuno","time":"07:00","calories":380,"protein":30,"carbs":40,"fat":10,"items":["3 claras + 1 huevo entero revuelto","½ taza avena con canela","½ plátano"]}, …]}`.
⚠ A newer variant with **nested** `macros:{}` per meal + optional `ingredients[]` also exists in the wild — every consumer must read `m.macros?.x ?? m.x ?? 0` (the mobile portal endpoint normalizes this for you, §2.5).

## 1.3 `routineJson` — the assigned WorkoutPlan snapshot, weekday-categorized

Authored by `TemplateEditorModal` (`RoutineData`, verbatim):
```ts
type Exercise = { ejercicioId?: string | null;   // loose ref → Ejercicio catalog
                  name: string; bodyweight?: boolean;
                  sets: number; reps: string;    // reps is a STRING: "10", "AMRAP", "12 c/lado", "45s"
                  weight?: string; rest?: string };  // display strings: "40 kg", "60s"
type RoutineDay = { day: string;                 // weekday DISPLAY name — editor dropdown:
                                                 // DAYS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]
                    label: string;               // e.g. "Push"
                    muscleGroup: string;         // free text, e.g. "Pecho · Hombro · Tríceps"
                    exercises: Exercise[] };
interface RoutineData { name: string; daysPerWeek: number; days: RoutineDay[] }
// Optional per-day: weekday?: 0|1|2|3|4|5|6  (ISO pin, 0=Sun — declared in mock-data.ts RoutineDay; NOT set by the current editor)
// Optional root keys merged by assignment overrides: splitBlock?, phaseWeek?, phaseTotalWeeks?, trackRpe?, weightLimits?
```
Editor authoring defaults when picking from the catalog (`addExercises`): `{ ejercicioId: e.id, name: e.name, bodyweight: e.bodyweight, sets: 3, reps: "10", weight: "", rest: "60s" }`. `daysPerWeek` is recomputed on save as `routine.days.length`. New days default `day: DAYS[days.length % 7]` (Lunes-first cycling). Muscle-group filter chips: `MUSCLE_GROUPS = ["Pecho","Espalda","Pierna","Glúteo","Hombro","Brazo","Core","Cardio"]`.

---

# 2. API DATA CONTRACT LAYER (the full pipeline, coach → DB → client)

## 2.1 Template library CRUD
- **`GET /api/templates?type=diet|routine`** (any authenticated — mobile JWT works) → `StoredTemplate[]` = `{ id, type, name, ...JSON.parse(dataJson) }`; routine templates arrive **pre-resolved** against the coach's catalog (`resolveDays`, one `ejercicio.findMany` per coachId). Coach UI consumers: templates page, ChangeStageModal, BulkPeriodizationWizard.
- **`POST /api/templates`** (COACH/ADMIN) — body `{ type, name, ...data }`; server strips `{id,type,name}` off `data` and stores `dataJson = JSON.stringify(payload)`, `coachId` from session.
- **`PUT /api/templates/[id]`** — `{ name, ...data }`, re-stringify. **`DELETE /api/templates/[id]`** — students keep their snapshots.

## 2.2 The assignment mutation — `POST /api/students/change-stage` (COACH/ADMIN)
**Exact payload sent by BOTH coach UIs** (ChangeStageModal single/multi + BulkPeriodizationWizard 3-step):
```ts
{
  studentIds: string[],                       // one or many
  stage: "Volumen" | "Definición" | "Mantenimiento" | "Recomposición",
  stageNumber: number,                        // min 1
  dietTemplateId:    string | undefined,      // "" → undefined → keep current diet
  routineTemplateId: string | undefined,
  executionDate:     string | undefined,      // "YYYY-MM-DD"; undefined = immediate
}
```
UI defaults: modal timing default `"immediate"`, wizard default `"scheduled"`; both pre-fill `executionDate = today + 10 days`. ⚠ **`macroOverrides` and `routineSettings` are accepted by the API but NOT sent by any current UI** — they're server capability awaiting a front-end (see §2.3).

## 2.3 Server engine — `applyStageChange(studentIds, changeData)` (verbatim behavior)
```
targetDate = executionDate || todayStr (UTC);  templates pre-fetched once by id
FOR EACH student:
  IF targetDate <= todayStr:                                   // IMMEDIATE
    data = { stage, stageNumber }
    IF dietTemplate:    dietData = stripTemplate(t)            // drops {id,type}; name stays
      + macroOverrides? → patch dietData.macros.{protein,carbs,fat} and dietData.totalCalories
      data.dietJson = JSON.stringify(dietData)
    ELSE IF macroOverrides && student.dietJson: parse current → patch → re-stringify (silent skip on parse fail)
    IF routineTemplate: routineData = stripTemplate(t)
      + routineSettings? → Object.assign(routineData, { splitBlock?, phaseWeek?, phaseTotalWeeks?, trackRpe?, weightLimits? })
      data.routineJson = JSON.stringify(routineData)
    ELSE IF routineSettings && student.routineJson: parse → assign → re-stringify
    prisma.student.update({ where:{id}, data })
    prisma.scheduledChange.deleteMany({ where:{ studentId } })  // immediate apply clears any pending queue
  ELSE:                                                         // FUTURE → queue (upsert = replace pending)
    prisma.scheduledChange.upsert({ where:{ studentId },
      create/update: { executionDate: targetDate, stage, stageNumber,
                       dietTemplateId ?? null, routineTemplateId ?? null } })
```

## 2.4 The lazy cron — `runAutoCron()` (how queued plans actually land)
Runs at the top of **every** `getStudents()` / `getStudentById()` / `getStudentDetail()` call (i.e., any roster or profile read by anyone, including the client's own `GET /api/me` and `GET /api/mobile/portal`):
```ts
const due = await prisma.scheduledChange.findMany({ where: { executionDate: { lte: todayStr } } }); // GLOBAL, all coaches
for (const change of due) {
  studentUpdate = { stage, stageNumber };
  if (change.dietTemplateId)    { t = getTemplateById(...); if (t) studentUpdate.dietJson    = JSON.stringify(stripTemplate(t)); }
  if (change.routineTemplateId) { t = getTemplateById(...); if (t) studentUpdate.routineJson = JSON.stringify(stripTemplate(t)); }
  await prisma.student.update(...); await prisma.scheduledChange.delete(...);
  console.log(`[AutoCron] Cambio aplicado para alumno ${change.studentId}`);
}
```
There is **no real scheduler** — traffic is the scheduler. `todayStr` is UTC-derived. A deleted template between scheduling and execution silently skips that half of the change (stage still applies). Note: the AutoCron path does **not** re-apply `macroOverrides`/`routineSettings` (those exist only on the immediate path).

## 2.5 Client retrieval — what the mobile app must call

**Canonical mobile endpoint: `GET /api/mobile/portal`** (Bearer JWT) — the ONLY endpoint returning fully normalized plans:
```jsonc
{ "student": { "id","name","email","currentWeight","streak","stage","stageNumber","prSquat","prDeadlift","prBench" },
  "detail": {
    "diet": { "name": "Plan nutricional", "totalCalories": 1750,
      "macros": { "protein":140, "carbs":160, "fat":50 },
      "meals": [ { "name","time","calories","items":[…],
                   "macros": { "protein","carbs","fat" } } ] },          // ← ALWAYS nested (normaliseMeals)
    "routine": { "name": "Rutina sin asignar", "daysPerWeek": 5,
      "days": [ { "label": "Push",                                       // label ?? day ?? "DÍA"
                  "focus": "Pecho · Hombro · Tríceps",                    // focus ?? muscleGroup
                  "dayIndex": 1,                                          // passthrough if present
                  "exercises": [ { "name":"Press Banca", "sets":4, "reps":"10",
                                   "muscleGroup":"Pecho", "tips":[…] } ] } ] },  // sets??3, reps String(..??"10")
    "weightHistory": […], "measurements": […], "height": null, "bodyFat": null } }
```
Guards: 401 no token · 403 `{"error":"Sin ficha de alumno"}` non-client · **403 `{"error":"ACCOUNT_BLOCKED"}`** when `isActive === false` · 404 missing.
**Web-parity endpoint: `GET /api/me`** — same `{ student, detail }` but **raw parsed shapes** (flat or nested meal macros; routine days carry `day/label/muscleGroup/weekday?/ejercicioId`-resolved fields + defaults `weight ?? ""`, `rest ?? "60s"`, `imageUrl/videoUrl` from the catalog). Consumers of `/api/me` must implement the dual-shape macro read themselves.
Both trigger `runAutoCron()` — polling the portal IS the assignment executor.

## 2.6 Catalog CRUD & seed (the "technical exercises" source)
`GET /api/ejercicios` (COACH own / ADMIN all) → `EjercicioDTO[] = { id, name, muscleGroup, equipment, bodyweight, imageUrl?, videoUrl? }` — fetched by the template editor to drive the ExercisePicker. `POST /api/ejercicios` (multipart or JSON; `bodyweight:true` forces `equipment:"Peso corporal"`; dup name → 409). `PUT/DELETE /api/ejercicios/[id]` (ownership-checked). `POST /api/coach/exercises/seed` → 30 canonical exercises upserted by `coachId_name` (full list with YouTube URLs in the global spec §1.2 / db.ts `DEFAULT_EJERCICIOS`).

## 2.7 Per-student direct edit (student-detail view)
`PUT /api/students/[id]` (COACH/ADMIN) — `updateStudent()` accepts `detailUpdates.diet` / `detailUpdates.routine` objects and re-stringifies them onto the student (used by the coach's per-student plan editor via the same `TemplateEditorModal` in edit mode), plus full-replace `weightHistory`/`measurements` and `scheduledChange` upsert/null-delete. Reads for the detail view: `GET /api/students/[id]` (+ `/logs`, `/carreras`, `/checks`).

---

# 3. STATE & VALIDATION MODELS

## 3.1 Never-throw parse fallbacks (server, `src/lib/db.ts` — the empty/unassigned detectors)
```ts
const EMPTY_DIET    = { name: "Dieta no asignada",  totalCalories: 0,
                        macros: { protein: 0, carbs: 0, fat: 0 }, meals: [] };
const EMPTY_ROUTINE = { name: "Rutina no asignada", daysPerWeek: 0, days: [] };
parseDiet(json)    = !json ? EMPTY_DIET    : try JSON.parse : EMPTY_DIET;     // empty string (column default) OR corrupt → placeholder
parseRoutine(json) = !json ? EMPTY_ROUTINE : try JSON.parse : EMPTY_ROUTINE;  // NEVER throws
// Mobile-portal name fallbacks layered on top: routine.name ?? "Rutina sin asignar", diet.name ?? "Plan nutricional"
```
**The unassigned-state contract:** a student with no plan gets a *valid object* with `meals: []` / `days: []` — clients detect emptiness by **array length, never by null-checking** the plan.

## 3.2 Client-side empty/fallback states (portal, verbatim)
| Condition | UI fallback |
|---|---|
| `meals.length === 0` (Hoy tab) | `#1A1A1A` rounded-3xl empty card, ghost Utensils — `"Tu coach aún no asigna tu dieta."` |
| `resolveRoutineDay(dayIdx, days) === undefined` or `exercises.length === 0` (Workout tab) | ghost Dumbbell card — `"Sin rutina asignada para hoy."` |
| No active exercise (Focus view) | `"No hay ejercicio activo."` + `← VOLVER AL LOBBY` |
| Missing per-exercise fields | server defaults on read: `sets ?? 3`, `reps ?? "10"`, `weight ?? ""`, `rest ?? "60s"`; client re-coerces `parseInt(String(reps)) \|\| 10` |
| Missing per-meal macros | portal fallback `meal.macros ?? { protein: 32, carbs: 48, fat: 14 }` (MealSheet) |
| Missing meal fields (mobile) | `normaliseMeals`: `name ?? ""`, `time ?? ""`, `calories ?? 0`, `items` array-checked |

## 3.3 Day resolution — how "today's assigned routine" is picked (client, verbatim)
```ts
// app dayIdx: 1=Lunes … 7=Domingo (ISO)
const appDayToJsWeekday = (dayIdx) => (dayIdx === 7 ? 0 : dayIdx);
const resolveRoutineDay = (dayIdx, days) => {
  const jsWeekday = appDayToJsWeekday(dayIdx);
  const explicit  = days.find(d => d.weekday === jsWeekday);   // 1) explicit numeric pin wins
  return explicit ?? days[dayIdx - 1];                          // 2) else ORDINAL: slot 0 → Lunes, slot 1 → Martes…
};
```
⚠ **The `day: "Lunes"` display string is NOT used for scheduling.** A 3-day routine authored `Lunes/Miércoles/Viernes` still renders on slots Mon/Tue/Wed unless `weekday` pins are present — and the current template editor never writes `weekday`. The editor's day dropdown is labeling only. Mobile must reproduce this exactly (or fix it consciously). Weekend browsing beyond `days.length` yields `undefined` → empty state. Writes are keyed to `realDateForDayIndex(dayIdx)` — the real calendar date of that weekday in the current ISO week (device-local).

## 3.4 Coach-UI state machines & validation
- **TemplateEditorModal:** `canSave = name.trim().length > 0` (only validation); diet save filters blank items (`items.filter(i => i.trim())`); routine save recomputes `daysPerWeek = days.length`; numeric inputs coerce `+e.target.value`; catalog fetched only for `type === "routine"`; ExercisePicker: multi-select, search + group filter (`"Todos"` + the 8 canonical groups), empty-catalog copy `"Tu catálogo está vacío. Créalo en Plantillas → Catálogo."`, `"Sin resultados"`, confirm `"Agregar (n)"`.
- **ChangeStageModal:** open-reset (`stage:"Volumen"`, `stageNumber:1`, template ids `""`, timing `"immediate"`, `executionDate = today+10d`); `stageNumber = parseInt || 1`, `min 1 required`; date `required` only when `timing==="scheduled"`; submit → error `alert("Hubo un error al guardar los cambios.")`; buttons `Guardando... / Programar Cambio / Aplicar Cambio`.
- **BulkPeriodizationWizard (3 steps: Alumnos → Configuración → Programar):** `canNext = step===1 ? selected.size>0 : true`; stage-filter chips + select-all toggle over visible students; timing default `"scheduled"`; error `alert("Hubo un error al guardar la programación masiva.")`.
- **Pending-change surfaces:** the roster/detail views show `scheduledChange` (banner + Periodización timeline); cancellation = `PUT /api/students/[id]` with `scheduledChange: null` → `deleteMany`. The Periodización page renders the stage distribution (Volumen/Definición/Mantenimiento/Recomposición) + upcoming-changes timeline from the same `Student.scheduledChange` includes.

## 3.5 Plan-refresh semantics (staleness model)
The client hydrates plans **once on mount** (`/api/me` | `/api/mobile/portal`); there is no push, no polling, no refresh-on-focus. A mid-session assignment lands on the student's next app load — or at the 60 s midnight rollover only if the app re-fetches. AutoCron guarantees queued changes apply no later than the student's own next read.

---

# 4. VERBATIM BUSINESS-LOGIC SPECS (naming conventions the mobile DB must mirror)

## 4.1 Canonical vocabularies
```
Stage:        "Volumen" | "Definición" | "Mantenimiento" | "Recomposición"   (stageNumber ≥ 1, rendered "E{n}")
Template.type: "diet" | "routine"                          (plain strings)
DAYS:          ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]
MUSCLE_GROUPS: ["Pecho","Espalda","Pierna","Glúteo","Hombro","Brazo","Core","Cardio"]
equipment:     "Barra" | "Mancuerna" | "Polea" | "Peso corporal" | "Máquina" | "Banda"
reps examples: "10" · "12" · "15" · "20" · "AMRAP" · "12 c/lado" · "45s"
weight/rest:   display strings — "40 kg" · "14 kg" · "" · "90s" · "75s" · "60s" · "45s" · "30s" · "120s"
bodyweight UI suffix: " · pc" (peso corporal)
day labels:    "Push" · "Pull" · "Legs" · "Pull + Legs" (free text)
muscleGroup day strings: "Pecho · Hombro · Tríceps" (middle-dot separated, free text)
```

## 4.2 Assignment-event data structures (copy exactly)
```ts
// UI → API (what the two coach modals actually send):
{ studentIds, stage, stageNumber, dietTemplateId?, routineTemplateId?, executionDate? }
// API capability not yet exposed in UI (server accepts):
macroOverrides?:  { protein?: number; carbs?: number; fat?: number; calories?: number }
routineSettings?: { splitBlock?: string; phaseWeek?: number; phaseTotalWeeks?: number;
                    trackRpe?: boolean; weightLimits?: boolean }
// Snapshot transform:
stripTemplate(t) = (({ id, type, ...rest }) => rest)(t)     // name INCLUDED in the snapshot
// Queue row:
ScheduledChange { executionDate, stage, stageNumber, dietTemplateId?, routineTemplateId? }  // 1 per student, upsert-replace
```

## 4.3 Catalog resolution (`resolveDays(days, catalog)` — the live join, verbatim)
```ts
byId = Map(catalog by id);
day.exercises.map(ex => { const cat = ex.ejercicioId ? byId.get(ex.ejercicioId) : null; return {
  ejercicioId: ex.ejercicioId ?? null,
  name:        cat?.name        ?? ex.name        ?? "Ejercicio",     // catalog OVERWRITES inline
  muscleGroup: cat?.muscleGroup ?? ex.muscleGroup ?? "",
  bodyweight:  cat?.bodyweight  ?? ex.bodyweight  ?? false,
  sets: ex.sets ?? 3, reps: ex.reps ?? "10", weight: ex.weight ?? "", rest: ex.rest ?? "60s",
  imageUrl: cat?.imageUrl ?? ex.imageUrl ?? undefined,
  videoUrl: cat?.videoUrl ?? ex.videoUrl ?? undefined,
}});
// Applied in getStudentDetail (per student's coachId) AND getTemplates (per template's coachId).
// Deleted catalog entry → byId miss → graceful fallback to the inline values.
```

## 4.4 Verbatim UI strings (coach assignment surfaces)
- ChangeStageModal: `Cambiar Etapa del Alumno` / `Cambiar Etapa de Alumnos ({n})` · `Define los nuevos objetivos, planes de dieta/rutina y cuándo ejecutarlos.` · labels `Nueva Etapa` · `Número de Etapa` · `Asignar Plantilla de Dieta (Opcional)` · `Asignar Plantilla de Rutina (Opcional)` · null options `Mantener dieta actual o sin cambios` / `Mantener rutina actual o sin cambios` · option suffixes `({n} kcal)` / `({n} días/sem)` · `Fecha de Ejecución` · `Inmediato` / `Programar` · `Cancelar` · `Guardando...` / `Programar Cambio` / `Aplicar Cambio`
- Wizard: `Programación masiva` · steps `Alumnos / Configuración / Programar`
- Template editor: `Nombre de la dieta` (placeholder `Ej. Déficit Calórico (Definición)`) · `Kcal / Prot (g) / Carb (g) / Gra (g)` · `Comidas ({n})` / `Añadir comida` · meal placeholders `Nombre (Desayuno)` / `Hora` / `kcal P C G` / `Un alimento por línea` · `Nombre de la rutina` (placeholder `Ej. PPL 5 días`) · `Días ({n})` / `Añadir día` · `Etiqueta (Push)` · `Grupo muscular (Pecho · Hombro · Tríceps)` · exercise placeholders `Sets / Reps / Peso` · `+ Ejercicio (del catálogo)` · picker: `Elegir ejercicios` / `Buscar…` / `Todos` / `· peso corporal` / `Agregar ({n})`
- Client fallbacks: `Dieta no asignada` · `Rutina no asignada` · `Plan nutricional` · `Rutina sin asignar` · `Tu coach aún no asigna tu dieta.` · `Sin rutina asignada para hoy.`

---

# 5. VERIFIED SHARP EDGES (port deliberately)
1. **`day: "Lunes"` doesn't schedule** — ordinal slots do; the `weekday` pin exists in the type system but no authoring UI writes it (§3.3). The mobile build should either add weekday-pin authoring or faithfully reproduce ordinal mapping.
2. **`macroOverrides`/`routineSettings` are dark API surface** — accepted by `POST /api/students/change-stage` and fully implemented in `applyStageChange`, but no web UI sends them, and the AutoCron (scheduled) path drops them entirely.
3. **Template deletion between scheduling and execution** silently skips that plan half — the stage change still applies with the old plan intact.
4. **AutoCron is global and traffic-driven** — any authenticated roster/profile read applies ALL coaches' due changes; UTC dating means changes can land up to several hours "early/late" vs. device-local midnight.
5. **`nextStageDate` on Student is a display echo, not the queue** — the queue is `ScheduledChange`; keep them distinct in the mobile schema.
6. **Two macro shapes coexist in stored diets** (flat legacy vs nested) — mirror the `macros?.x ?? x ?? 0` read or consume only `/api/mobile/portal`.
7. **`stageNumber` has no upper bound** and `stage` is a free string column — the 4-value vocabulary is convention (import validates it; direct PUTs don't).
8. **No plan versioning/history** — assignment overwrites `dietJson`/`routineJson` destructively; the only trace is `ExerciseLog`/`WorkoutSession` snapshots the student already generated.

---
*Saved for the mobile rebuild. Folder companions: `MYCOACH_SALAS_WEB_BLUEPRINT.md` · `MYCOACH_STATS_WEB_BLUEPRINT.md` · `MYCOACH_PROFILE_WEB_BLUEPRINT.md` · global/retina/workout specs.*
