# MYCOACH — STATS / PERFORMANCE INTELLIGENCE WEB BLUEPRINT
## Ground-Truth Extraction of the Analytics & Biometrics Ecosystem for the Mobile Rebuild

**Source repo:** `/Users/alatorre/Desktop/images/mycouch` (web), branch `nuevoultimo`.
**Primary source:** `src/app/portal/page.tsx` — the Stats ecosystem is `TabProgreso` (lines ~2858–3625) plus root handlers (`handleWeightLog` 7728–7755, `handlePhotoUpload` 7799–7813, `startWeight` 8184, PR state 7687–7726) and the badge exporter `src/lib/badge.ts` (`downloadBadge`). Server side: `POST /api/me/biometrics`, `GET /api/me`, `POST /api/me/photos`, `PATCH /api/me/prs`, coach-side `POST|PATCH /api/students/[id]/measurements`, backed by `src/lib/db.ts` (`logDailyWeight`, `getStudentDetail`) and Prisma models `WeightEntry`, `Measurement`, `ProgressPhoto`.
**Method:** every type, endpoint, formula, SVG geometry, and copy string below is verbatim from live code. Simulated/hardcoded pieces are flagged. No TRPC / React Query / Axios exists — all networking is plain `fetch()` with optimistic state + rollback.
**Companions:** `MYCOACH_GLOBAL_MASTER_SPEC.md`, `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md`, `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md` (web repo root), `MYCOACH_SALAS_WEB_BLUEPRINT.md` (this folder).

---

## ⚠ 0. SERVER-VS-SIMULATED TRUTH TABLE (read first)

| Module | Real data? | Source |
|---|---|---|
| Weight success curve (line chart) | ✅ REAL | `detail.weightHistory` from `GET /api/me` (Postgres `WeightEntry`, asc) |
| `-X.Xkg TOTAL` delta pill / PÉRDIDA ACTIVA state | ✅ REAL | `student.currentWeight − startWeight` (first history node) |
| Weight logging modal (`LOG DE PESO`) | ✅ REAL | `POST /api/me/biometrics` — transactional, one node per day |
| `LUN MAR MIÉ HOY` footer tabs under the chart | ❌ DECORATIVE | `dayTab` state (init 2) only recolors the active label — it never re-slices the chart data |
| Biometric cards (BRAZO/CINTURA/PECHO/PIERNA) | ⚠ REAL WITH HARDCODED FALLBACKS | last two `detail.measurements` rows; every field falls back to a fixed demo value (e.g. `latest?.armR ?? 28.5`) when measurements are empty |
| Macro radar (`ANÁLISIS DE INGESTA`) | ✅ REAL (today only) | `checkedMeals` × `meals[].macros` vs. plan totals |
| 7-day `KCAL CORE TIMELINE` — INGESTA line | ✅ REAL | `nutritionHistory[1..7]` (per-day checked-meal Sets, localStorage-persisted, flushed at midnight) |
| 7-day timeline — GASTO EST. line | ❌ ESTIMATED FORMULA | `1800 + workoutHistory[d].length × 60` (no real energy data) |
| `MAX STRENGTH SCAN` PR bars | ✅ REAL | root `prs` state (hydrated from `/api/me`, written via `PATCH /api/me/prs`) |
| `REGISTRO VISUAL` photo carousel / gallery / comparison | ✅ REAL with seed fallback | `detail.photos` → `localPhotos` (optimistic); **6 hardcoded Unsplash entries render when the student has zero photos** |
| Photo upload | ✅ REAL | `POST /api/me/photos` (multipart, 3-tier storage) |
| Shareable badge (`onBadge`) | ✅ REAL, client-side | `downloadBadge()` canvas export — no API |
| Height / body-fat | ✅ REAL, read-only to student | `detail.height` / `detail.bodyFat` (coach-written) |

---

# 1. API HOOKS & TELEMETRY LAYER

## 1.1 `GET /api/me` — the single hydration source (boot fetch)
`{ student, detail }` where the stats tab consumes: `student.currentWeight/previousWeight/lastWeighIn/streak/stage/stageNumber/prSquat/prDeadlift/prBench`, `detail.weightHistory` (**asc by date**), `detail.measurements` (**asc**), `detail.photos` (**desc by createdAt**), `detail.height`, `detail.bodyFat`, `detail.photoName`. Server: `getStudentDetail()` → `prisma.student.findUnique({ include: { weightHistory: { orderBy: { date: "asc" } }, measurements: { orderBy: { date: "asc" } }, photos: { orderBy: { createdAt: "desc" } }, scheduledChange: true } })`. NO_STORE + `force-dynamic`. Root derivations after hydration:
```ts
const startWeight = detail.weightHistory[0]?.weight ?? student.currentWeight;   // line 8184
setPrs({ squat: d.student.prSquat ?? 0, deadlift: d.student.prDeadlift ?? 0, bench: d.student.prBench ?? 0 });
setWalletBalance(d.student.walletBalance ?? 0);
```

## 1.2 `POST /api/me/biometrics` — weight telemetry write
**Client — `handleWeightLog(kg, date)` (root, optimistic + rollback):**
```ts
const prevStudent = student; const prevDetail = detail;                 // rollback snapshots
setStudent(s => s ? { ...s, currentWeight: kg } : s);                   // optimistic display
setDetail(d => {                                                        // optimistic chart node
  const existsAt = d.weightHistory.findIndex(e => e.date === date);
  const newHistory = existsAt >= 0
    ? d.weightHistory.map((e, i) => i === existsAt ? { ...e, weight: kg } : e)  // same-day: replace
    : [...d.weightHistory, { date, weight: kg }];                                // else: append
  return { ...d, weightHistory: newHistory };
});
const res = await fetch("/api/me/biometrics", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weight: kg, date }) });
if (!res.ok) throw new Error("api");   // catch → restore prevStudent/prevDetail → return false
return true;
```
**Client pre-validation** (`handleWeightSave`, TabProgreso line 2935): `kg = Math.round(parseFloat(weightInput) × 10) / 10` (1-decimal), reject `!Number.isFinite(kg) || kg < 20 || kg > 500` → `weightSaveState = "error"` (no network call); `date = new Date().toISOString().split("T")[0]` (**UTC-derived** — known drift vs. device-local, see global spec §4.1.3). Success → `"done"` state, modal auto-closes after **900 ms**.
**Server** (CLIENT+studentId): validates 20–500 → 400; `logDailyWeight` transaction:
```ts
prisma.$transaction([
  prisma.weightEntry.deleteMany({ where: { studentId, date } }),   // exactly one node per calendar day
  prisma.weightEntry.create({ data: { studentId, date, weight } }),
  prisma.student.update({ where: { id: studentId }, data: { currentWeight: weight } }),
]);
```
**200:** `{ date, weight }`. Same-day re-log overwrites (mirrors the client's `existsAt` branch). ⚠ Note: this endpoint does **not** maintain `previousWeight`/`lastWeighIn` — only the legacy `POST /api/me` multipart path does.

## 1.3 `POST /api/me/photos` — progress photo upload
**Client — `handlePhotoUpload(file, label)`:** `FormData` with fields **`file`** and **`label`**; `!res.ok || throw → null`; **200 returns `{ url, label, createdAt }`** which the tab appends to `localPhotos` optimistically. Tab always uploads with `label: "FRONTAL"`.
**Server** (CLIENT+studentId): field `file` required (400 `"No se recibió ningún archivo"`); MIME ∈ {jpeg,png,webp} else **422** `"Tipo de archivo no permitido. Usa JPEG, PNG o WebP."`; > 5 MB → **413** `"El archivo excede el límite de 5 MB."`; filename `progress_${studentId}_${Date.now()}.{ext}`; 3-tier storage (Vercel Blob → `public/uploads` → base64 data-URI) → `prisma.progressPhoto.create` (+ first photo becomes `student.photoName` cover).
**Upload state machine (tab):** `photoUploadState: "idle" | "uploading" | "done" | "error"` — `done` auto-resets after 2200 ms; `error` sets `photoUploadError = "Error al transmitir. Verifica la conexión."` and auto-resets after 3500 ms.

## 1.4 `PATCH /api/me/prs` — feeds the MAX STRENGTH SCAN
Root `onNewPR` pipeline (optimistic monotonic bump → PATCH `{ lift: "squat"|"deadlift"|"bench", kg }` → server enforces increase-only → on failure re-fetch `/api/me` + toast). Full spec in `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md` §4.1.

## 1.5 Coach-side biometric writes (the measurements the student reads)
- `POST /api/students/[id]/measurements` (COACH/ADMIN): `prisma.measurement.create({ data: { studentId, date, chest, waist, hips, armL, armR, thighL, thighR } })`.
- `PATCH /api/students/[id]/measurements`: `{ id, ...fields }` → `prisma.measurement.update`.
- Bulk replace also happens through the student PUT (`updateStudent`: `measurement.deleteMany` + per-row create).
- **There is no student-side write path for measurements** — BRAZO/CINTURA/PECHO/PIERNA are read-only telemetry from the coach.

## 1.6 Badge export (no API)
`onBadge` → `downloadBadge({ name, photoUrl: detail.photoName, currentWeight, startWeight, streak, height, bodyFat, stage: "${stage} · E${stageNumber}", weightHistory })` — `src/lib/badge.ts` renders a shareable image client-side.

---

# 2. CHART DATA MAPPING MODELS

## 2.1 Chart 1 — Weight Success Curve (the hero line chart)

**Data → geometry pipeline (verbatim math, lines 2949–2964):**
```ts
const history = detail.weightHistory;                    // [{ date: "YYYY-MM-DD", weight }] asc
const PW = 320, PH = 80, PAD = 10;                       // viewBox 320×80, 10px inner padding
const weights = history.map(h => h.weight);
const minW = Math.min(...weights) - 0.8;                 // ±0.8 kg breathing room
const maxW = Math.max(...weights) + 0.8;
// INVERTED Y: low weight (fat-loss success) → top of SVG; high weight → bottom.
// Maps a weight-loss timeline to an ASCENDING left→right success curve.
const toY = (w) => PAD + ((w - minW) / Math.max(maxW - minW, 0.01)) * (PH - PAD*2);
const toX = (i) => PAD + (i / Math.max(weights.length - 1, 1)) * (PW - PAD*2);
const pts      = weights.map((w, i) => `${toX(i).toFixed(1)},${toY(w).toFixed(1)}`);
const linePath = `M ${pts.join(" L ")}`;
const areaPath = `${linePath} L ${toX(weights.length-1)},${PH-PAD} L ${toX(0)},${PH-PAD} Z`;  // close to bottom baseline
const latestW  = weights[weights.length - 1] ?? maxW;
```
⚠ Design intent (comment-documented): the Y axis is **deliberately not flipped back** — losing weight draws the line *upward*. X spacing is **index-based (equidistant nodes), not date-proportional**.

**Gradient fill + glow population (SVG defs, verbatim):**
```svg
<linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%"   stopColor="#CEFF00" stopOpacity="0.25" />
  <stop offset="60%"  stopColor="#CEFF00" stopOpacity="0.08" />
  <stop offset="100%" stopColor="#CEFF00" stopOpacity="0" />
</linearGradient>
<filter id="chartGlow">
  <feGaussianBlur stdDeviation="2.5" result="b" />
  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
<path d={areaPath} fill="url(#wGrad)" />                                   ← volt→transparent area under the line
<path d={linePath} fill="none" stroke="#CEFF00" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" filter="url(#chartGlow)" />
<circle cx={toX(last)} cy={toY(latestW)} r="4" fill="#CEFF00" filter="url(#chartGlow)" />   ← live end-node dot
```
Rendered at `height: 80`, `preserveAspectRatio="none"`, `overflow: visible`. The header pill computes `diff = +(currentWeight − startWeight).toFixed(1)` → pill text `-X.Xkg TOTAL` / `+X.Xkg TOTAL` / `0kg TOTAL`; state caption `▼ PÉRDIDA ACTIVA` (`#CEFF00`, diff<0) / `▲ GANANCIA` (`#f87171`, diff>0) / `— SIN CAMBIO` (`#808080`).

**Footer time-frame strip:** `DAY_TABS = ["LUN", "MAR", "MIÉ", "HOY"]`, `dayTab` init **2** (MIÉ); a 4-column grid divided by 1px `rgba(255,255,255,0.06)` borders; active label `#CEFF00`, inactive `rgba(255,255,255,0.22)` (DS 900, 11px, tracking 0.1em). **Selecting a tab changes only the highlight — the chart always plots the full history.** (Port decision: keep as decoration or wire real range slicing.)

## 2.2 Chart 2 — Macro Distribution Radar ("ANÁLISIS DE INGESTA")

**Inputs (today only):**
```ts
todayProtein = Σ meals[idx].macros.protein for idx ∈ checkedMeals   (same for carbs/fat)
tgtP = max(1, Σ all meals' protein)                                  (tgtC, tgtF alike — plan totals)
TOTAL kcal readout = todayProtein*4 + todayCarbs*4 + todayFat*9
```
**Geometry:** 3-axis radar, `viewBox 200×216`, center `CX=100, CY=108`, radius `R=72`; axis *i* at angle `-π/2 + (2π/3)·i` (PROTEÍNA top, CARBS bottom-right, GRASA bottom-left):
```ts
radarPt(axisIdx, frac) = `${CX + R*frac*cos(angle)},${CY + R*frac*sin(angle)}`
fracs    = [min(P/tgtP,1), min(C/tgtC,1), min(F/tgtF,1)]
consumed = fracs.map((f,i) => radarPt(i, Math.max(f, 0.04))).join(" ")   // 4% floor so the shape never vanishes
target   = full-R triangle · grid rings at fracs [0.25, 0.5, 0.75, 1]
```
**Fill/glow:** `radialGradient id="radarFill"` — `#CEFF00` opacity 0.35 → 0.06; consumed polygon `stroke #CEFF00 width 2 strokeLinejoin round`; target polygon `fill rgba(255,255,255,0.03) stroke rgba(255,255,255,0.1) width 1.5`; grid/axes at 6–7% white; vertex dots r=3.5 `#CEFF00` (opacity 0.2 when frac=0). Axis labels (MONO 7.5px, letterSpacing 1.5, `#808080`): `PROTEÍNA` at `(CX, CY−R−10)`, `CARBS` at `(CX+R·0.5+22, CY+R·0.866+10)`, `GRASA` mirrored left. Legend dots: PROTEÍNA `#CEFF00` · CARBS `#00F0FF` · GRASA `#808080`, values `{val}g/{tgt}g` (denominator `#404040`).

## 2.3 Chart 3 — 7-Day KCAL CORE TIMELINE (dual line)

**Data mapping (weekly view, app day indices 1=Mon…7=Sun):**
```ts
dayKcal(d) = Σ over nutritionHistory[d] (checked meal indices) of (protein*4 + carbs*4 + fat*9)   // REAL
dayBurn(d) = 1800 + (workoutHistory[d] ?? []).length * 60                                          // ESTIMATE: 1800 base + 60/exercise
data  = [{ d: 1..7, intake, burn }]
minV  = max(0, min(all values) − 150);  maxV = max(all values) + 150       // ±150 kcal padding
CW = 288, CH = 72, CP = 12
toX(i) = CP + (i/6)·(CW − 2CP)                                             // 7 equidistant columns
toY(v) = CP + (1 − (v−minV)/max(maxV−minV,1))·(CH − 2CP)
intakePath = "M " + points joined " L "                                    // solid volt line
burnPath   = same, stroke #00F0FF strokeDasharray "5,3"                    // dashed cyan line
```
Grid: horizontal hairlines at fracs 0.25/0.5/0.75 (`rgba(255,255,255,0.04)`). Node dots: intake only — `r = 4.5` on **today** (`todayIdx = todayAsDayIndex() − 1`) else `2.5`; `fill = intake > 0 ? "#CEFF00" : "#1A1A1A"` with volt stroke 1.5. Day labels `DAY_LABELS = ["L","M","X","J","V","S","D"]` (⚠ different from the weekday-strip's `["L","M","MI","J","V","S","D"]` — Wednesday is `X` here), today's label volt. Legend: 18×2 volt bar `INGESTA` · dashed cyan line `GASTO EST.` (`strokeDasharray "4,2.5"` in the legend swatch).

## 2.4 Chart 4 — MAX STRENGTH SCAN (PR bars)
```ts
maxPR = Math.max(prs.squat || 1, prs.deadlift || 1, prs.bench || 1, 1);
width = barsReady && maxPR > 0 ? `${Math.round((bar.kg / maxPR) * 100)}%` : "0%";
// barsReady flips true 120 ms after mount → bars sweep in
// transition: width 0.7s cubic-bezier(0.22,1,0.36,1)
```
Rows: `SQUAT #CEFF00 / glow rgba(206,255,0,0.35)` · `DEADLIFT #00F0FF / rgba(0,240,255,0.35)` · `BENCH rgba(255,255,255,0.75) / transparent`. Track `height 6, rgba(255,255,255,0.06)`; value `{kg} kg` or `—` when 0.

## 2.5 Biometric delta model (BRAZO/CINTURA/PECHO/PIERNA cards)
```ts
const latest = detail.measurements[detail.measurements.length - 1];   // newest (asc array)
const prev   = detail.measurements[detail.measurements.length - 2];   // previous
bioCards = [
  { label: "BRAZO",   curr: latest?.armR   ?? 28.5, base: prev?.armR   ?? 28,   unit: "cm", goodIfPos: true  },
  { label: "CINTURA", curr: latest?.waist  ?? 68,   base: prev?.waist  ?? 71,   unit: "cm", goodIfPos: false },
  { label: "PECHO",   curr: latest?.chest  ?? 88,   base: prev?.chest  ?? 89,   unit: "cm", goodIfPos: true  },
  { label: "PIERNA",  curr: latest?.thighR ?? 55,   base: prev?.thighR ?? 55.5, unit: "cm", goodIfPos: true  },
];
delta = +(curr − base).toFixed(1);
isGood = goodIfPos ? delta >= 0 : delta <= 0;      // waist shrinking = good; muscle growing = good
deltaColor = delta === 0 ? "#808080" : isGood ? "#4ade80" : "rgba(248,113,113,0.9)";
// rendered as "+X.Xcm" / "-X.Xcm" (always signed when ≥ 0)
```
⚠ Only `armR`/`waist`/`chest`/`thighR` are surfaced — `armL`, `hips`, `thighL` exist in the schema but are not rendered here. The `??` fallbacks are demo values shown to measurement-less students.

## 2.6 VISUAL_LOG photo model + comparison
```ts
type PhotoEntry = { photo: string; mes: string; angle: string };
VISUAL_LOG = localPhotos.length > 0
  ? localPhotos.map(p => ({ photo: p.url,
      mes: new Date(p.createdAt).toLocaleDateString("es-MX", { month: "long", year: "numeric" }).toUpperCase(),
      angle: p.label || "FRONTAL" }))
  : [ /* 6 hardcoded Unsplash entries: MES 1 · ENERO (FRONTAL, POSTERIOR), MES 2 · MARZO (FRONTAL, LATERAL), MES 3 · JUNIO (FRONTAL, POSTERIOR) */ ];
months = [...new Set(VISUAL_LOG.map(v => v.mes))];               // gallery grouping
// Comparison slots: beforeIdx (init 0) / afterIdx (auto-pinned to last photo via effect on VISUAL_LOG.length)
cycleBefore/After = idx => (idx + 1) % VISUAL_LOG.length;         // tap-to-cycle
imgStyle = { filter: "grayscale(0.45) brightness(0.82)" };        // uniform desaturation
// PhotoCard scrim: linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.3) 50%, transparent 72%)
// Comparison scrims: linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.25) 55%, transparent 75%)
```
Carousel shows `VISUAL_LOG.slice(0, 3)` at 220×300; gallery groups by month (2-col, height 200); comparison is a split-screen with tap-to-cycle progress pips (`flex: 2` on the active pip) and the weight-delta footer (`PESO INICIAL {startWeight}kg ↔ PESO ACTUAL {currentWeight}kg`).

---

# 3. DATA SCHEMAS & TYPE SPECS

## 3.1 Component contract — `TabProgreso` props (verbatim)
```ts
function TabProgreso({ student, detail, startWeight, onBadge, prs, nutritionHistory,
  workoutHistory, checkedMeals, meals, onWeightLog, onPhotoUpload }: {
  student: Student;                       // src/lib/mock-data.ts shape
  detail: Detail;                         // StudentDetail + height?/bodyFat?/photoName?/photos?
  startWeight: number;                    // detail.weightHistory[0]?.weight ?? student.currentWeight
  onBadge: () => void;
  prs: { squat: number; deadlift: number; bench: number };
  nutritionHistory: Record<number, Set<number>>;   // day 1–7 → Set of checked meal indices
  workoutHistory: Record<number, string[]>;        // day 1–7 → completed exercise names
  checkedMeals: Set<number>;                       // today's slice
  meals: Array<{ name: string; macros?: MealMacros }>;
  onWeightLog: (kg: number, date: string) => Promise<boolean>;
  onPhotoUpload: (file: File, label: string) => Promise<{ url: string; label: string; createdAt: string } | null>;
})
type MealMacros = { protein: number; carbs: number; fat: number };
```

## 3.2 Internal state registry (TabProgreso)
```ts
const [dayTab, setDayTab]                     = useState(2);        // decorative LUN/MAR/MIÉ/HOY highlight
const [isGalleryOpen, setIsGalleryOpen]       = useState(false);
const [isComparisonOpen, setIsComparisonOpen] = useState(false);
const [beforeIdx, setBeforeIdx]               = useState(0);
const [afterIdx, setAfterIdx]                 = useState(0);        // effect pins it to VISUAL_LOG.length−1
const [barsReady, setBarsReady]               = useState(false);    // 120 ms mount delay → PR bar sweep
const [showWeightModal, setShowWeightModal]   = useState(false);
const [weightInput, setWeightInput]           = useState("");
const [weightSaveState, setWeightSaveState]   = useState<"idle" | "saving" | "done" | "error">("idle");
const photoInputRef                            = useRef<HTMLInputElement>(null);   // hidden <input type=file accept="image/jpeg,image/png,image/webp">
const [photoUploadState, setPhotoUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);
const [localPhotos, setLocalPhotos]           = useState<{ url; label; createdAt }[]>(
  (detail.photos ?? []).map(p => ({ url: p.url, label: p.label || "FRONTAL", createdAt: p.createdAt })));
```

## 3.3 Domain types (canonical, `src/lib/mock-data.ts` + `db.ts`)
```ts
interface WeightEntry { date: string; weight: number }                      // date = "YYYY-MM-DD" string
interface BodyMeasurements { id?: string; date: string; chest: number; waist: number;
  hips: number; armL: number; armR: number; thighL: number; thighR: number }
type Detail = StudentDetail & {
  height?: number; bodyFat?: number; photoName?: string;
  photos?: { id: string; url: string; label: string; weight: number | null; createdAt: string }[];
};
```

## 3.4 Prisma models behind the tab
```prisma
model WeightEntry   { id, studentId → Student(Cascade), date String, weight Float }
model Measurement   { id, studentId → Student(Cascade), date String,
                      chest/waist/hips/armL/armR/thighL/thighR Float @default(0) }
model ProgressPhoto { id, studentId → Student(Cascade), url String, label String @default(""),
                      weight Float?, createdAt DateTime @default(now()) }
// On Student: currentWeight, previousWeight Float · lastWeighIn String ·
//             height Float? · bodyFat Float? · prSquat/prDeadlift/prBench Float @default(0)
```

## 3.5 Backend JSON contracts
```jsonc
// GET /api/me → 200 (stats-relevant slice)
{ "student": { "currentWeight": 62.5, "previousWeight": 64.0, "lastWeighIn": "2026-07-07",
    "prSquat": 80, "prDeadlift": 100, "prBench": 60, "streak": 12, "stage": "Definición", "stageNumber": 2 },
  "detail": {
    "weightHistory": [{ "date": "2026-01-15", "weight": 66.0 }],
    "measurements": [{ "id": "ckx…", "date": "2026-06-01", "chest": 88, "waist": 68, "hips": 96,
                       "armL": 28, "armR": 28.5, "thighL": 54.5, "thighR": 55 }],
    "photos": [{ "id": "ckx…", "url": "/uploads/progress_….jpg", "label": "FRONTAL",
                 "weight": null, "createdAt": "2026-07-01T…Z" }],
    "height": 165, "bodyFat": 22.5, "photoName": "/uploads/…" } }

// POST /api/me/biometrics  { "weight": 62.3, "date": "2026-07-07" }
//   → 200 { "date": "2026-07-07", "weight": 62.3 }
//   → 400 weight outside 20–500
// POST /api/me/photos (multipart: file, label)
//   → 200 { "url": "…", "label": "FRONTAL", "createdAt": "…" }
//   → 400 "No se recibió ningún archivo" · 422 "Tipo de archivo no permitido. Usa JPEG, PNG o WebP."
//   → 413 "El archivo excede el límite de 5 MB."
// PATCH /api/me/prs { "lift": "squat", "kg": 85 } → 200 { "prSquat": 85, "prDeadlift": 100, "prBench": 60 }
```

---

# 4. EXACT COPY & SEMANTICS (every string, verbatim)

## 4.1 Header & weight bento
- Eyebrow: `PERFORMANCE INTELLIGENCE` · Title: `ANÁLISIS DE<br/>RENDIMIENTO`
- Chart card label: `PROGRESO HACIA LA META` · value `{currentWeight} KG` · caption `Eficiencia de Quema ↑`
- Delta pill: `-{X}kg TOTAL` / `+{X}kg TOTAL` / `0kg TOTAL` · state caption: `▼ PÉRDIDA ACTIVA` / `▲ GANANCIA` / `— SIN CAMBIO`
- Footer tabs: `LUN` `MAR` `MIÉ` `HOY`

## 4.2 Weight modal ("LOG TELEMETRY")
- Trigger button: `LOG TELEMETRY // REGISTRAR PESO` (Scale icon)
- Modal eyebrow: `TELEMETRÍA BIOMÉTRICA` · title: `LOG DE PESO`
- Helper copy: `Registra tu peso matutino. Se actualiza en el historial y recalcula la curva de progreso inmediatamente.`
- Input: `type=number step=0.1 min=20 max=500`, placeholder = current weight, suffix `KG`, `caretColor #CEFF00`, autoFocus, Enter submits
- Error line: `✕ VALOR INVÁLIDO — INGRESA UN PESO ENTRE 20 Y 500 KG`
- Success line: `⚡ TELEMETRÍA SINCRONIZADA`
- Buttons: `CANCELAR` · `CONFIRMAR` → `GUARDANDO...` → `⚡ LISTO`
- Container: bottom-anchored `max-w-sm rounded-[28px] #1A1A1A`, scrim `rgba(7,7,8,0.88)+blur(18px)`, `float-up 0.26s cubic-bezier(0.16,1,0.3,1)`; input shell border trichotomy: error `#f87171` / done `#CEFF00` / idle `rgba(206,255,0,0.22)`

## 4.3 Biometrics
- Section label: `MEDICIONES BIOMÉTRICAS`
- Card labels: `BRAZO` · `CINTURA` · `PECHO` · `PIERNA` (unit `cm`, delta `±X.Xcm`)

## 4.4 Analytics charts
- Radar: eyebrow `DISTRIBUCIÓN MACRO HOY` · title `ANÁLISIS DE INGESTA` · `TOTAL {n}kcal` · axes/legend `PROTEÍNA / CARBS / GRASA` · legend values `{val}g/{tgt}g`
- Timeline: eyebrow `CICLO 7 DÍAS` · title `KCAL CORE TIMELINE` · legend `INGESTA` / `GASTO EST.` · day labels `L M X J V S D`
- PR bars: eyebrow `REGISTROS PERSONALES` · title `MAX STRENGTH SCAN` · rows `SQUAT / DEADLIFT / BENCH` · `{n} kg` or `—`

## 4.5 Visual log & comparison
- Section label: `REGISTRO VISUAL` · link `Ver Todo`
- Upload button states: `SUBIR FOTO` → `TRANSMITIENDO...` → `GUARDADA` / `ERROR` · error line `⚠ Error al transmitir. Verifica la conexión.`
- Master CTA: `COMPARA TU EVOLUCIÓN` (Camera icon)
- Gallery overlay: eyebrow `REGISTRO VISUAL` · title `HISTORIAL COMPLETO` (month groups with volt tick bars)
- Comparison overlay: back `VOLVER` · header `COMPARATIVA VISUAL` · instruction `Toca cada tarjeta para cambiar el mes` · slot chips `ANTES` (neutral) / `DESPUÉS` (volt) · footer `PESO INICIAL {n}kg` ↔ `PESO ACTUAL {n}kg`
- Seed photo labels: `MES 1 · ENERO` / `MES 2 · MARZO` / `MES 3 · JUNIO` · angles `FRONTAL / POSTERIOR / LATERAL`; live photo month format: `toLocaleDateString("es-MX", { month: "long", year: "numeric" }).toUpperCase()`

## 4.6 Related gates
- `PremiumGate` (workout-tier lock, same file): `ACCESO RESTRINGIDO` · `SECCIÓN BLOQUEADA` · `DISPONIBLE EN PLAN BERSERKER ⚡` · `ACTUALIZAR PLAN`
- Bottom-nav label for this tab (global `TABS`): **`Stats`** (id `"progress"`, icon `TrendingUp`)

---

# 5. VERIFIED SHARP EDGES (port deliberately)
1. **`LUN/MAR/MIÉ/HOY` tabs are decorative** — they never filter the chart. Decide: reproduce as-is or implement real range slicing.
2. **Biometric fallbacks lie to new users** — a student with zero measurements sees demo values (28.5 cm arm, 68 cm waist…). Mobile should show an empty state instead.
3. **Weight-date UTC drift** — `handleWeightSave` stamps `toISOString().split("T")[0]` (UTC), while all nutrition/workout dates use device-local `realDateForDayIndex`. Evening logs (UTC-6) land on tomorrow's date.
4. **`GASTO EST.` is a fiction** — `1800 + 60×exercises`; real wearable calories exist in `WorkoutBiometrics` but are not consumed here.
5. **The inverted weight axis is intentional** (success curve) — do not "fix" it without product sign-off.
6. **`weight` field on ProgressPhoto is never populated by the tab's upload path** (only the legacy `POST /api/me` combo path sets it).
7. **Only right-side limbs render** (`armR`, `thighR`) — `armL/thighL/hips` are collected by the coach wizard but invisible to the student.
8. **`POST /api/me/biometrics` doesn't update `previousWeight`/`lastWeighIn`** — coach dashboards reading those fields see stale values for students who only log via the Stats modal.

---
*Saved for the mobile rebuild. Folder companion: `MYCOACH_SALAS_WEB_BLUEPRINT.md`. Web repo companions: `MYCOACH_GLOBAL_MASTER_SPEC.md` · `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md` · `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md`.*
