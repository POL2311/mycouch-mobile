# MYCOACH — SALAS / SYNDICATE WEB BLUEPRINT
## Ground-Truth Extraction of the Community Ecosystem for the Mobile Rebuild

**Source repo:** `/Users/alatorre/Desktop/images/mycouch` (web), branch `nuevoultimo`.
**Primary source file:** `src/app/portal/page.tsx` — the Salas ecosystem lives inside `TabComunidad` (lines ~5415–7385) plus root-level lifted state/handlers (lines ~7757–7940, 8276–8356, 8417–8445). Server side: `src/app/api/community/*`, `src/app/api/student/{leave-room,latest-notice}`, `src/app/api/me/wallet`, `src/app/api/coach/notices*`, `src/app/api/mobile/community/notices`, backed by `src/lib/db.ts` + `prisma/schema.prisma` (`GroupMessage`, `Coach.joinCode/isPublic`, `Student.coachId/walletBalance`).
**Method:** every type, endpoint, formula, class string, and copy string below is copied verbatim from live code. Where a feature is client-simulated (not server-backed), it is flagged explicitly — this is the single most important thing to know before porting.
**Companions:** `MYCOACH_GLOBAL_MASTER_SPEC.md` (full API logbook), `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md`, `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md` (in the web repo root).

---

## ⚠ 0. THE SERVER-VS-SIMULATED TRUTH TABLE (read first)

There is **no TRPC, no React Query, no Axios, no SWR** anywhere — every network call is a plain `fetch()` with optimistic React state + manual rollback. And only part of the Salas surface is real:

| Module | Backed by server? | Source of data |
|---|---|---|
| Lobby gate: public rooms directory | ✅ REAL | `GET /api/community/public-rooms` |
| Lobby gate: private code injection | ✅ REAL | `POST /api/community/join { code }` |
| Join by public room / leave room | ✅ REAL | `POST /api/community/join { roomId }` / `POST /api/student/leave-room` |
| Avisos: coach notices history | ✅ REAL | `GET /api/community/messages?coachId=` filtered `role === "COACH"` |
| Avisos: pinned COACH LUIS YÁÑEZ card + reaction counts (🔥 128 / 💪 94) | ❌ HARDCODED | JSX literal + `SALA_AVISOS` seed |
| Coach broadcast ticker ("GESTIÓN DE EMISIÓN", Intel Feed drawer) | ❌ LOCAL STATE | `broadcastMessages: string[]` (root `useState`, seeded with 4 strings, never POSTed) |
| Feed: metrics ribbon, activity cards, likes, comments, new post | ❌ LOCAL/SEED | `SALA_METRICS`, `SALA_ACTIVITY_FEED`, `likedActivity`/`activityFeed` state |
| Leaderboard podium + ranks | ❌ SEED | `SALA_LEADERBOARD` (6 hardcoded rows, `isMe` on rank 4) |
| Roster grid + member profiles | ❌ SEED | `SALA_ROSTER` (8 hardcoded rows) via `rosterMembers` state |
| Retos: stake wallet debit/credit | ✅ REAL (wallet only) | `PATCH /api/me/wallet { delta }` — the money moves in Postgres |
| Retos: rival acceptance, rival scores, challenge persistence | ❌ SIMULATED | 3500 ms timer flips PENDIENTE→EN COMBATE; `rivalScore` static; stakes live only in React state (lost on reload) |
| Retos: MY score binding | ✅ DERIVED FROM REAL DATA | `nutritionTotal` (checked meals kcal), `streakCompletedDays`, `totalWorkoutExercises` — all computed from live tracking state |
| Room identity "FELLS TEAM PRO / HIGH PERFORMANCE UNIT", "SALA: TITANS_ELITE_04" | ❌ HARDCODED | JSX literals (real room name arrives in join response `coachName` but is **not** rendered in the shell) |

**Porting rule:** anything marked ❌ is demo theater matching ROADMAP §4.B ("Gym Squads" future phase). A mobile port must either reproduce the simulation faithfully or (preferably) build the missing endpoints — but must not assume they exist.

---

# 1. API HOOKS & FETCHING LAYER

All calls are inline `fetch()`; auth rides the NextAuth cookie (web) or a Bearer JWT (mobile — every endpoint below accepts it via `getSessionUser()`).

## 1.1 `GET /api/community/public-rooms` — lobby directory
**Caller:** `TabComunidad` effect, fires only while the gate shows (`if (hasTeam) return`), re-fires when `hasTeam` flips false (leave).
```ts
fetch("/api/community/public-rooms")
  .then(async r => {
    if (r.status === 403 || r.status === 401) { setRoomsFetchErr("AUTH"); return null; }
    if (!r.ok)                               { setRoomsFetchErr("NET");  return null; }
    return r.json() as Promise<{ rooms: PublicRoom[]; currentRoom: CurrentRoom }>;
  })
  .then(d => { if (!d) return;
    setPublicRooms(Array.isArray(d.rooms) ? d.rooms : []);
    setCurrentRoom(d.currentRoom ?? null);
    if (d.currentRoom) setHasTeam(true);        // already linked → skip the gate
  })
  .catch(() => setRoomsFetchErr("NET"))
  .finally(() => setRoomsLoading(false));
```
**Server (CLIENT+studentId):** `prisma.coach.findMany({ where: { isPublic: true }, include: { user: { select: { name } }, _count: { select: { students } } }, orderBy: { createdAt: "asc" } })` + the student's current room (returned even if that coach went private since).
**200 JSON:** `{ "rooms": [{ "id": "<coachId>", "name": "<coach user name | 'COACH ROOM'>", "memberCount": 42 }], "currentRoom": { "id", "name" } | null }`

## 1.2 `POST /api/community/join` — code injection / public join / hydration
**Caller:** root `handleCommunityJoin(payload)` (passed down as `onJoin`):
```ts
const res = await fetch("/api/community/join", { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
const data = await res.json();
if (!res.ok) return { ok: false, error: data?.error ?? "ERROR_DESCONOCIDO" };
if (data.coachId) setStudent(s => s ? { ...s, coachId: data.coachId } : s);
return { ok: true, coachId: data.coachId ?? null, notices: data.notices ?? [] };
// network throw → { ok: false, error: "SIN_CONEXIÓN" }
```
**Request bodies (3 branches, evaluated in this order server-side):**
1. `{ "roomId": "<coachId>" }` — public join; coach must have `isPublic: true` → else **422** `{"error":"SALA NO DISPONIBLE O NO PÚBLICA"}`.
2. `{ "code": "<JOINCODE>" }` — private join; server trims + uppercases, `prisma.coach.findFirst({ where: { joinCode: { equals: CODE } } })` → no match **422** `{"error":"CÓDIGO NO COINCIDE CON NINGÚN RADAR"}`.
3. `{}` — pure hydration: returns current link + notices, mutates nothing.
**Mutation (branches 1–2):** `prisma.student.update({ data: { coachId } })` — **DESTRUCTIVE, unconditionally replaces any prior room** (1-room-at-a-time invariant; no server confirmation step — the UI owns the warning).
**200 JSON:** `{ "ok": true, "coachId": "…", "coachName": "…", "notices": [{ "id", "senderName", "role", "content", "createdAt" }] }` — notices = last 20 `role:"COACH"` messages, newest first. `Cache-Control: no-store`.

## 1.3 `POST /api/student/leave-room`
**Caller:** root `handleCommunityLeave` (passed as `onLeave`): `await fetch("/api/student/leave-room", { method: "POST" })` (errors logged `[portal] leave-room failed:`), then `setStudent(s => ({ ...s, coachId: undefined }))`. Child `handleLeave` wraps it with `isLeaving` and finally `setHasTeam(false)` → gate re-renders → public-rooms refetch.
**Server:** CLIENT+studentId → `prisma.student.update({ data: { coachId: null } })`. **200** `{ ok: true }`. History is never deleted.

## 1.4 `GET /api/community/messages?coachId=<id>` — Avisos stream
**Caller:** `TabComunidad` effect — fires **only** when `currentRoomView === "avisos" && coachId`:
```ts
fetch(`/api/community/messages?coachId=${coachId}`)
  .then(r => r.ok ? r.json() : [])
  .then((msgs: ServerNotice[]) => { if (Array.isArray(msgs)) setServerNotices(msgs.filter(m => m.role === "COACH")); })
  .catch(() => {});
```
**Server (any authenticated):** `prisma.groupMessage.findMany({ where: { coachId }, orderBy: { createdAt: "asc" }, take: 100 })`. **200 JSON row:** `{ "id", "coachId", "senderId", "senderName", "role": "COACH"|"CLIENT", "content", "imageUrl": string|null, "createdAt" }`. ⚠ No room-membership check — any authenticated user who knows a coachId can read.
**Write side (coach only):** `POST /api/community/messages { content, imageUrl? }` — `role !== "COACH"` → 403. Sender fields stamped from the session, never from the body. **The client post-composer in the Feed view does NOT call this** — it appends locally.
**Management (coach):** `GET /api/coach/notices` (take 50), `DELETE /api/coach/notices/[id]` (ownership-checked).

## 1.5 `GET /api/student/latest-notice` — the Hoy-tab directive banner
Fetched in `TabHoy` (line 2581, with `AbortController`). CLIENT+studentId, else **`403 { notice: null }`** (non-error-shaped by design). Server: `groupMessage.findFirst({ where: { coachId, role: "COACH" }, orderBy: { createdAt: "desc" } })`. **200:** `{ "notice": { id, senderName, content, createdAt } | null }`.

## 1.6 `PATCH /api/me/wallet` — the betting money rail (the only real part of Retos)
Two root mutations, both optimistic with rollback + error toast:
```ts
// CREDIT — onClaimPrize(amount): prize collection
setWalletBalance(prev => prev + amount);                       // optimistic credit
PATCH /api/me/wallet  body: { delta: amount }
  ok  → setWalletBalance(d.walletBalance)                      // server value wins
  !ok → setWalletBalance(prev => prev - amount); toast "⚠️ Error al procesar el premio. Contacta a soporte."
  net → rollback; toast "⚠️ Sin conexión — premio no registrado."

// DEBIT — onLaunchDebit(amount): stake escrow, returns Promise<boolean>
if (amount > walletBalance) return false;                      // client solvency pre-check
setWalletBalance(prev => prev - amount);                       // optimistic debit
PATCH /api/me/wallet  body: { delta: -amount }
  ok  → setWalletBalance(d.walletBalance); return true
  !ok → refund; toast "⚠️ Saldo insuficiente — desafío no lanzado."; return false
  net → refund; toast "⚠️ Sin conexión — apuesta no debitada."; return false
```
**Server:** CLIENT+studentId; `{ delta ≠ 0 }`; blocks below-zero (`400 {"error":"Saldo insuficiente"}`); `prisma.student.update({ data: { walletBalance } })`. **200:** `{ "walletBalance": number }`.
**Hydration:** `walletBalance` initializes 0 and is set from the boot `GET /api/me` response (`d.student.walletBalance ?? 0`, line 8098). It also renders in Perfil (`$ {walletBalance.toLocaleString()}`).

## 1.7 Mobile parity endpoint
`GET /api/mobile/community/notices` (Bearer JWT direct): non-CLIENT → `200 []`; no room → `200 []`; else last 20 `role:"COACH"` messages `[{ id, senderName, role, content, createdAt }]`.

## 1.8 Endpoints that do NOT exist (do not invent them in mobile)
No endpoints exist for: feed posts/likes/comments, leaderboard, roster/member profiles, challenges/stakes (create/accept/resolve), reactions (🔥/💪), broadcast-ticker persistence, or room metrics. The `GroupMessage` table is the only community persistence.

---

# 2. STATE & WINDOW TRANSITION MODELS

## 2.1 Root-lifted navigation state (portal root, lines 7887–7896 — survives tab switches)
```ts
const [currentRoomView, setCurrentRoomView] = useState<"feed" | "leaderboard" | "retos" | "members" | "avisos">("feed");
const [selectedActiveChallenge, setSelectedActiveChallenge] = useState<LiveStake | null>(null);
const [searchQuery,      setSearchQuery]      = useState("");
const [showRosterFilter, setShowRosterFilter] = useState(false);
const [filterRank,       setFilterRank]       = useState<string | null>(null);
const [filterOnline,     setFilterOnline]     = useState(false);
const [filterStreakMin,  setFilterStreakMin]  = useState(0);
const [showBriefingDrawer, setShowBriefingDrawer] = useState(false);   // Intel Feed terminal (portal-level)
const [broadcastMessages, setBroadcastMessages] = useState<string[]>([ /* 4 seed strings, §4.8 */ ]);
```
Deliberate design: the whole sub-navigation lives in the **root**, so leaving Salas for Workout and returning restores the exact view, overlay, search text, and filters. `TabComunidad` is invoked with `isCoach={false}` and `coachId={student.coachId ?? null}` (the coach-side broadcast configurator UI exists behind `isCoach` but the portal always passes `false`).

## 2.2 The Gate state machine ("RADAR DE SALAS", early-return before the shell)
```ts
const [hasTeam,    setHasTeam]    = useState(() => coachId !== null);  // returning users skip the gate
const [codeInput,  setCodeInput]  = useState("");
const [codeError,  setCodeError]  = useState(false);   // local validation (empty code)
const [codeSuccess,setCodeSuccess]= useState(false);   // verified state (volt input/button)
const [isJoining,  setIsJoining]  = useState(false);   // in-flight lock (wait cursor, spinners)
const [joinError,  setJoinError]  = useState<string | null>(null);  // API error banner
const [isLeaving,  setIsLeaving]  = useState(false);
```
**`executeJoin(payload)` transition script:** `isJoining=true; joinError=null; codeError=false; codeSuccess=false` → `await onJoin(payload)` → `isJoining=false` → success: hydrate `serverNotices` from `result.notices` (COACH-filtered), `codeSuccess=true`, clear input, **`setTimeout(() => setHasTeam(true), 800)`** (800 ms so the "⚡ VERIFICADO · ACCESO CONCEDIDO" state is visible); failure: `joinError = result.error ?? "ERROR_DESCONOCIDO"`, `codeError=true`.
**Code input behaviors:** `onChange` auto-uppercases + strips leading whitespace and clears all error/success flags; `Enter` submits (guarded by `isJoining`); empty trimmed code → `codeError=true` locally without a network call; `maxLength={24}`; input+button disable during `isJoining || codeSuccess`. Border/text color trichotomy: success `#CEFF00` / error `#f87171` / idle `rgba(255,255,255,0.1)` + white; `caretColor: #CEFF00`.
**Leave:** `handleLeave` → `isLeaving=true` → `await onLeave()` (errors logged `[TabComunidad] leave failed:`) → `isLeaving=false; hasTeam=false` → gate re-renders and the public-rooms effect refetches.
**Rooms list sub-states:** `roomsLoading` (spinner cell) → `roomsFetchErr: "AUTH" | "NET" | null` → empty (`publicRooms.length === 0`) → list. Exact copies in §4.1.

## 2.3 Shell layout & tab strip
- **Mobile (`md:hidden`):** sticky top track (`sticky top-0 z-40`, bg `rgba(7,7,8,0.97)` + `blur(20px)`, bottom border `rgba(39,39,42,1)`) containing the room banner (diamond-F SVG logo — polygon `31,3 59,31 31,59 3,31` stroked `#CEFF00`, italic 900 "F") + `SALIR ✕` button, then a flat scrollable console strip of the 5 tabs. Active tab: `text-lime-400 border-lime-400 bg-lime-400/10 shadow-[0_0_15px_rgba(163,230,53,0.1)]` on a `border-b-2`; inactive: `text-zinc-500 border-transparent hover:text-zinc-300 hover:bg-zinc-900/40`.
- **Desktop (`hidden md:flex`):** 256px (`md:w-64`) left sidebar, `rgba(26,26,26,0.96)` + `blur(20px)`, sticky full-height; logo block with double-diamond SVG + `drop-shadow(0 0 14px rgba(206,255,0,0.25))`; nav items — active = **solid `#CEFF00` pill, black icon/text**, radius 10, padding `9px 12px`; `SALIR DEL EQUIPO` (LogOut icon) pinned bottom, swaps to `DESVINCULANDO...` while leaving.
- **Tab registry:** `ROOM_TABS = [{feed,FEED,LayoutGrid},{leaderboard,RANKING,Trophy},{retos,RETOS,Zap},{members,ROSTER,Users},{avisos,AVISOS,Bell}]`.
- Main content `flex-1 overflow-y-auto pb-[90px]`; every view mounts with `animate-mc-room-view-in`.
- **Scroll locks:** body overflow hidden while `showModalityPicker || showPostModal || showClaimModal` (TabComunidad effect) and while `showBriefingDrawer` (root effect).

## 2.4 Per-view child state & transitions

### FEED (`currentRoomView === "feed"`)
State: `likedActivity: Set<number>` · `activityFeed` (init `SALA_ACTIVITY_FEED`) · `commentOpen: Set<number>` · `showPostModal` · `newPostText`.
- Metrics ribbon (4 `SALA_METRICS` tiles, 132px, horizontal scroll) → header "STREAM DE ACTIVIDAD" with pulsing red `LIVE` dot.
- Like tap: toggles membership in `likedActivity` **and** increments/decrements `likes` in `activityFeed` (heart fills `#CEFF00`). Comment tap: toggles a cyan sub-panel per card ("COMENTARIOS" / "Sé el primero en comentar este logro.").
- FAB (`fixed bottom-24 right-6`, 56px solid-Volt circle, Plus 22/3) → **NEW POST modal** (centered `max-w-md w-[92%]` card over `bg-[#070708]/90 backdrop-blur-sm`): avatar + 3-row textarea (bottom-border only), dashed media slot ("AÑADIR FOTO / REPORTE DE PROGRESO", hover `border-[#CEFF00]/40`), `PUBLICAR POST` (disabled until non-empty). Submit **prepends a local card**: `{ id: Date.now(), handle: student.name.toUpperCase().replace(/\s+/g,"_"), time: "Ahora", exercise: "Nuevo Post", badge: "NEW", img: <fixed unsplash>, likes: 0, comments: 0, comment: text }` — never touches the network.

### RANKING (`leaderboard`)
Stateless render of `SALA_LEADERBOARD`. Podium order `[1, 0, 2]` (2nd–1st–3rd): heights **176 / 138 / 116 px**; #1 card `rgba(206,255,0,0.04)` bg + `rgba(206,255,0,0.25)` border + `0 0 24px rgba(206,255,0,0.08)` glow, avatar ring `0 0 0 2.5px #CEFF00, 0 0 20px rgba(206,255,0,0.4)`; rank number colors #1 `#CEFF00`, #2 `#00F0FF`, #3 `#808080`. Ranks 4+ list with 40 ms staggered `mc-overlay-in`; the `isMe` row gets `1.5px solid #CEFF00` border, a floating `TU POSICIÓN` chip (`-top-3 left-4`, solid Volt), kcal/sets subline and a 5-segment weekly pip row (`[1,1,1,1,0]` filled Volt).

### RETOS (`retos`) — builder + Monitor + full-screen Detail
State: `selectedAthlete: string` (rival name) · `challengeModality: string` (id or custom text) · `stakeAmount: number` (init **50**) · `liveStakes: LiveStake[]` (2 seed duels) · `showModalityPicker` · `useCustomChallenge` · `customChallengeText` · `challengeToast/Msg` · `claimInFlight: useRef(false)` · `rivalAcceptTimers: useRef<Record<number,timeout>>`.
- **Builder steps:** `01 · SELECCIONAR RIVAL` — horizontal avatar rail from `rosterMembers.filter(m => !m.isMe)`, selected ring `0 0 0 2.5px #CEFF00, 0 0 16px rgba(206,255,0,0.5)`, toggle-off on re-tap; `02 · MODALIDAD DE COMBATE` — trigger button opens the centered picker modal; `03 · MONTO DE APUESTA` — display `$ {stakeAmount.toFixed(2)} USD` (52px italic Volt) + `POOL TOTAL: $ {(stake×2).toFixed(2)} USD`; quick-adds `+10`, `+50` (clamped `Math.min(1000, s+delta)`), `MAX` (=1000), `✕` (=0); range slider `min 0 max 1000 step 10`, `accentColor #CEFF00`.
- **Launch gate:** `canLaunch = selectedAthlete !== "" && stakeAmount <= walletBalance && (useCustomChallenge ? customChallengeText.trim().length > 0 : challengeModality !== "")`. When false, an amber-triangle hint shows `!selectedAthlete ? "Selecciona un rival" : "Define la modalidad del reto"`.
- **`launchChallenge()`:** resolve `finalModality` (custom → trimmed UPPERCASE) → `await onLaunchDebit(stakeAmount)` (real wallet debit; abort on false) → prepend `LiveStake { id: Date.now(), pool: stake×2, myScore: 0, rivalScore: 0, myMax: stake×2, rivalMax: stake×2, status: "PENDIENTE" }` → reset builder (stake back to 50) → cyan toast `DESAFÍO TÁCTICO LANZADO • ESPERANDO APROBACIÓN` (2200 ms).
- **Rival acceptance simulator:** effect arms one 3500 ms timer per `PENDIENTE` stake → flips it to `EN COMBATE TÁCTICO` + toast `⚔️ ¡EL RIVAL ACEPTÓ TU DESAFÍO — COMBATE INICIADO!` (3000 ms); timers cleaned on status change/removal.
- **Scores-tick binding (live data → stakes):** for `EN COMBATE TÁCTICO` stakes: `"KCAL GOAL"` → `myScore = nutritionTotal`; `"CONSISTENCY"` → `myScore = streakCompletedDays`; any other (custom) → `myScore = totalWorkoutExercises` (= Σ `workoutHistory[d].length`). `rivalScore` never updates (seed values only).
- **Monitor cards:** `myPct = myMax>0 ? min(100, round(myScore/myMax×100)) : 0` (same for rival); status tokens `EN COMBATE` (pulsing volt pill) vs `AGUARDANDO` (⏳ amber pill); Volt vs cyan progress bars (8px, `minWidth 4` when >0), VS emblem with rotated `-8deg` volt line, pool chip `$ {pool.toFixed(2)} USD`; footer `TAP PARA DETALLE →`; empty state `⚔️ [ SYSTEM INTEL // ARENA VACÍA ]` + `[ INICIAR DESAFÍO EN ROSTER → ]` (navigates `setCurrentRoomView("members")`).
- **Detail overlay** (`selectedActiveChallenge !== null`, `fixed inset-0 z-[55]` fullscreen over `#070708`, sticky blurred header): pool card ("POOL TOTAL EN ESCROW", `$ {pool.toFixed(2)}`, "USD · BLOQUEADO"), 64px face-off with 26px scores, 10px progress tracks (labels `TÚ`/`RVL`), rules table `⚖️ REGLAS DE ENGANCHE` — rows `MODALIDAD / POOL ESCROW / ESTADO / CONDICIÓN DE VICTORIA: "MAYOR MARCA AL VENCIMIENTO"`.
- **Claim flow:** `iWinning = myScore > rivalScore` gates `RECLAMAR PREMIO` (disabled otherwise + caption "Disponible solo cuando tu marca supera al rival"); click → `claimInFlight` re-entry lock → `setClaimedPool(pool)` → `onClaimPrize(pool)` (real wallet credit) → remove stake → close overlay → `showClaimModal=true` (celebration, §4.7).
- **Abandon flow:** `window.confirm("¿Seguro que quieres abandonar este reto? Perderás la apuesta.")` → remove stake + close. ⚠ The escrowed debit is **not refunded** — the stake was already deducted at launch.
- **Modality picker modal** (centered `w-[92%] max-w-sm z-[61]` over `bg-[#070708]/85 backdrop-blur-sm z-[60]`): 3 predefined `CHALLENGE_MODALITIES` rows (selected = volt border + dot) + dashed `CREAR RETO PERSONALIZADO` → custom pane: `VOLVER` back link, label `🎯 DEFINE TU MÉTRICA`, auto-uppercasing input (placeholder `EJ: MÁXIMAS DOMINADAS, INGESTA AGUA...`, `autoFocus`), `CONFIRMAR RETO PERSONALIZADO` (sets `challengeModality` to the raw text).

### ROSTER (`members`)
State: `rosterMembers` (init `SALA_ROSTER`) · `selectedRosterProfile: RosterMember | null` + the root-lifted search/filter set.
- **Filter pipeline (exact):**
```ts
activeFilterCount = (filterRank!==null?1:0) + (filterOnline?1:0) + (filterStreakMin>0?1:0);
filteredRoster = rosterMembers
  .filter(m => searchQuery === "" || m.name.toLowerCase().includes(q) || m.rankBadgeTitle.toLowerCase().includes(q))
  .filter(m => !filterOnline || m.isOnline)
  .filter(m => filterRank === null || m.rankBadgeTitle.toUpperCase().includes(filterRank))
  .filter(m => m.rachaActiveDays >= filterStreakMin);
```
- Search bar (`#1A1A1A`, placeholder `Buscar atleta o rango...`) with a `SlidersHorizontal` toggle carrying a Volt count badge; collapsible strip: `RANGO` chips `["ATLETA","GUERRERO","BESTIA","LEYENDA"]` (toggle; active = solid Volt/black), `EN LÍNEA` toggle (green dot when off, black when active), streak chips `+7D +14D +30D` (0 hidden; re-tap clears), `✕ LIMPIAR FILTROS` (red, shown when any active).
- **2-col grid cards** (`min-h-[340px] bg-zinc-950 border-zinc-900 rounded-sm`, hover `border-zinc-800`): metallic tier badge via `getRosterBadgeClasses` (§3.5), 64px gradient avatar with 12px online dot (`#CEFF00` glow / `#52525b`), name `replace(/_/g," ")` uppercase, `"{RANK-first-word} · RNK #{rnk 2-padded}"`, RACHA `{n}D` | PTS strip, bottom `VER PERFIL` trigger (full-width, top border, Zap turns lime + `drop-shadow(0 0 8px rgba(163,230,53,0.6))` on hover).
- Empty state: `🚫 [ NO ATHLETES MATCH RADAR REQUIREMENTS ]` + `✕ RESET RADAR FILTERS` (clears all four).
- **Profile overlay** (`fixed inset-0 z-50`, `bg-[#070708]/95 backdrop-blur-md`): header `PERFIL DE ATLETA DE ÉLITE` + volt `CERRAR` pill; 96px avatar (`0 0 0 3px rgba(206,255,0,0.3)` ring) + 20px status dot; rank pill + `RNK #NN`; 2×2 telemetry tiles `RACHA ACTIVA {n} DÍAS / ESTADO EN LÍNEA|OFFLINE / PTS TOTALES / KCAL ACUMULADAS`; `🏆 PRs REGISTRADOS` rows `MAX DEADLIFT · MAX SQUAT · BENCH PRESS · {kg} KG` + `KCAL RECORD {n} KCAL`; action `ENVIAR RETO` → **cross-view transition:** close profile, `setSelectedAthlete(mp.name)`, `setCurrentRoomView("retos")` (builder pre-loaded with the rival).

### AVISOS (`avisos`)
State: `serverNotices` (fetched, §1.4) · `newBroadcastMsg` (coach composer).
- Header `CANAL DE INSTRUCCIÓN / AVISOS` + pulsing red `EN DIRECTO • {rosterMembers.length} ACTIVOS`.
- Pinned card (hardcoded): red-tinted `#1A1A1A` card (`border rgba(239,68,68,0.35)`, glow), red-gradient `CL` avatar, `FIJADO` pin chip, the alert text, reaction pill `🔥 128 | 💪 94`.
- `HISTORIAL DE INSTRUCCIONES`: with a room (`coachId`) → `serverNotices` cards (cyan-gradient initials avatar, `senderName.toUpperCase()`, timestamp `toLocaleDateString("es-MX",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}).toUpperCase()`); empty → `// SIN INSTRUCCIONES DEL COACH`. Without a room → the 2 unpinned `SALA_AVISOS` seeds with 🔥/💪 counts.
- Performance micro-grid (hardcoded): `RENDIMIENTO +12%` (Volt) | `CONSISTENCIA 98%` (cyan).
- **⚡ GESTIÓN DE EMISIÓN** (renders only when `isCoach` — portal passes `false`, so client users never see it): numbered message list (first index Volt) with ✕ removers, HUD input (placeholder `NUEVO MENSAJE DE EMISIÓN...`, Enter or button appends `.trim().toUpperCase()`), monolithic `EMITIR BROADCAST` button (solid Volt, Zap). Local state only.

### Coach Briefing Drawer (portal-level, outside TabComunidad — `showBriefingDrawer`)
Fullscreen z-[80] terminal over `rgba(7,7,8,0.95)+blur(24px)`: header `◈ SECURE CHANNEL · {n} ACTIVE TRANSMISSIONS` over `COACH BROADCAST / INTEL FEED` (Volt second line), `[ CLOSE TERMINAL ✕ ]` bordered button; transmission log — numbered bento cells, index 0 highlighted (volt border + `EN EMISIÓN ACTIVA` pulsing tag), empty state `// NO ACTIVE TRANSMISSIONS` under a ghost Bell; footer `// CONFIGURA EN SALAS › AVISOS › GESTIÓN DE EMISIÓN`.

---

# 3. DATA SCHEMAS & TYPE SPECS (verbatim TypeScript + backend JSON)

## 3.1 Client types (module scope of `portal/page.tsx`)

```ts
type RosterMember = {
  id: number;
  name: string;               // handle convention: UPPER_SNAKE, e.g. "MARCUS_ELITE"
  avatarInitials: string;
  avatarBgColor: string;      // full CSS gradient string
  rankBadgeTitle: string;     // e.g. "BESTIA ELITE", "COMANDANTE", "PREDADORA", "TITÁN", "GUERRERA PRO", "ATLETA INIT", "BESTIA INIT"
  rnk: number;
  rachaActiveDays: number;
  isOnline: boolean;
  isMe: boolean;
  pts: number;
  kcal: number;
  sets: number;
  prs: { maxDeadlift: number; maxSquat: number; benchPress: number; kcalRecord: number };
};

type LiveStake = {
  id: number;                 // Date.now()
  opponent: string;
  opponentColor: string;
  modality: string;           // "KCAL GOAL" | "CONSISTENCY" | modality id | custom uppercase text
  pool: number;               // stakeAmount × 2
  myScore: number;
  rivalScore: number;
  myMax: number;              // denominator for myPct (stake×2 for launched; seed values differ)
  rivalMax: number;
  status: "PENDIENTE" | "EN COMBATE TÁCTICO";
};

const CHALLENGE_MODALITIES = [
  { id: "DEADLIFT",    label: "MAX DEADLIFT",  sub: "1RM MÁXIMO KG", emoji: "🏋️" },
  { id: "CONSISTENCY", label: "CONSISTENCIA",  sub: "% SESIONES",    emoji: "📊" },
  { id: "KCAL",        label: "KCAL GOAL",     sub: "CAL TOTALES",   emoji: "🔥" },
] as const;

type SalaMetric = { icon: React.ReactNode; label: string; value: string; sub: string; accent: string };

// Inside TabComunidad:
type ServerNotice = { id: string; senderName: string; role: string; content: string; createdAt: string };
type PublicRoom   = { id: string; name: string; memberCount: number };
type CurrentRoom  = { id: string; name: string } | null;

// Root:
type CommunityJoinResult = {
  ok: boolean;
  coachId?: string | null;
  notices?: { id: string; senderName: string; role: string; content: string; createdAt: string }[];
  error?: string;
};

const ROOM_TABS = [
  { id: "feed",        label: "FEED",    Icon: LayoutGrid },
  { id: "leaderboard", label: "RANKING", Icon: Trophy     },
  { id: "retos",       label: "RETOS",   Icon: Zap        },
  { id: "members",     label: "ROSTER",  Icon: Users      },
  { id: "avisos",      label: "AVISOS",  Icon: Bell       },
];
```

## 3.2 Rank derivation (real student → rank title)
```ts
function getRank(streak: number, stage: string): string {
  if (streak >= 60) return "LEYENDA ELITE";
  if (streak >= 30) return "BESTIA ELITE";
  if (stage === "Volumen") return "BERSERKER";
  if (streak >= 14) return "GUERRERO PRO";
  return "ATLETA INIT";
}
```

## 3.3 Seed datasets (complete, verbatim values)

**`SALA_ROSTER` (8 members):**
| id | name | initials | avatarBgColor | rankBadgeTitle | rnk | racha | online | isMe | pts | kcal | sets | prs (DL/SQ/BP/kcalRec) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | MARCUS_ELITE | ME | `linear-gradient(135deg,#CEFF00,#00F0FF)` | BESTIA ELITE | 1 | 42 | ✅ | — | 4820 | 4210 | 52 | 220/185/150/6200 |
| 2 | COACH_FELLS | CF | `linear-gradient(135deg,#CEFF00,#a3e635)` | COMANDANTE | 2 | 38 | ✅ | — | 4650 | 3980 | 48 | 210/175/140/5900 |
| 3 | ANA_BERSERKER | AB | `linear-gradient(135deg,#f472b6,#a78bfa)` | PREDADORA | 3 | 31 | ❌ | — | 4100 | 3650 | 44 | 165/140/95/4800 |
| 4 | ALBERTO_Z | AZ | `linear-gradient(135deg,#60a5fa,#a78bfa)` | TITÁN | 4 | 28 | ✅ | **✅** | 3105 | 3105 | 38 | 180/155/120/5840 |
| 5 | DIANA_FORCE | DF | `linear-gradient(135deg,#f87171,#fbbf24)` | GUERRERA PRO | 5 | 21 | ❌ | — | 2890 | 2780 | 32 | 145/125/85/4200 |
| 6 | CARLOS_POWER | CP | `linear-gradient(135deg,#34d399,#06b6d4)` | ATLETA INIT | 6 | 14 | ✅ | — | 2540 | 2410 | 28 | 130/110/80/3900 |
| 7 | JORGE_REX | JR | `linear-gradient(135deg,#fb923c,#f43f5e)` | GUERRERO PRO | 7 | 19 | ❌ | — | 2200 | 2100 | 24 | 155/130/100/4100 |
| 8 | SARA_APEX | SA | `linear-gradient(135deg,#c084fc,#60a5fa)` | BESTIA INIT | 8 | 11 | ✅ | — | 1980 | 1850 | 20 | 120/100/72/3600 |

**`SALA_LEADERBOARD` (ranks 1–6):** same first six identities/pts/kcal/sets/avatarColors as the roster, `isMe: true` on rank 4 (ALBERTO_Z).

**`SALA_ACTIVITY_FEED` (3 posts):**
1. `{ id: 101, handle: "MARCUS_ELITE", time: "Hace 12 min", exercise: "Deadlift PR", badge: "240KG", likes: 24, comments: 8, comment: "Por fin superando los 240kg. La programación de Fells Team está dando frutos. ¡Vamos equipo!" }` (+ unsplash img `photo-1534438327276-14e5300c3a48`)
2. `{ id: 102, handle: "ANA_BERSERKER", time: "Hace 35 min", exercise: "Sentadilla 5×5", badge: "120KG", likes: 17, comments: 5, comment: "Semana 8 del programa. PR en sentadilla. La constancia está marcando la diferencia." }` (img `photo-1571019614242-c5c5dee9f50b`)
3. `{ id: 103, handle: "COACH_FELLS", time: "Hace 1h", exercise: "Press Banca", badge: "180KG", likes: 41, comments: 12, comment: "El equipo está en otro nivel este mes. Números récord en 6 de 8 ejercicios clave. Sigan así." }` (img `photo-1581009146145-b5ef050c2e1e`)

**`SALA_METRICS` (ribbon):** `MIEMBROS ACTIVOS 42 / +3 ESTA SEMANA (#CEFF00)` · `STREAK GRUPAL 18 / DÍAS (#CEFF00)` · `ESFUERZO PROM. 92% / INTENSIDAD (#00F0FF)` · `KMs TOTALES 1.2K / ESTE MES (#00F0FF)`.

**`SALA_AVISOS` (3, id 1 pinned):**
1. `COACH LUIS YÁÑEZ · HACE 2 HORAS · pinned · "¡ALERTA DE DESAFÍO! Mañana iniciamos el protocolo de superación de fuerza en Sentadilla. Aseguren sus macronutrientes esta noche. No hay espacio para debilidad." · 🔥128 💪94`
2. `COACH ANA SILVA · HACE 6 HORAS · "Tutorial de Deadlift con carga máxima disponible en la biblioteca. Revisar técnica antes de la sesión del jueves." · 🔥47 💪33`
3. `COACH LUIS YÁÑEZ · HACE 1 DÍA · "Récord colectivo roto esta semana: 312 sesiones completadas. El equipo está operando al máximo rendimiento." · 🔥89 💪61`

**Seed `liveStakes` (2 duels):**
```ts
{ id: 1, opponent: "MARCUS_ELITE",  opponentColor: "linear-gradient(135deg,#CEFF00,#00F0FF)", modality: "KCAL GOAL",   pool: 1000, myScore: 0, rivalScore: 4210, myMax: 5000, rivalMax: 5000, status: "EN COMBATE TÁCTICO" }
{ id: 2, opponent: "ANA_BERSERKER", opponentColor: "linear-gradient(135deg,#f472b6,#a78bfa)", modality: "CONSISTENCY", pool: 200,  myScore: 0, rivalScore: 31,   myMax: 7,    rivalMax: 7,    status: "PENDIENTE"        }
```

## 3.4 Live-score derivations (root, real data)
```ts
nutritionTotal      = Σ diet.meals[i].calories where checkedMeals.has(i);           // kcal of checked meals today
streakCompletedDays = [1..7].filter(d => nutritionHistory[d].size > 0 || workoutHistory[d].length > 0).length;
totalWorkoutExercises = Object.values(workoutHistory).reduce((s, arr) => s + arr.length, 0);
initials(name)      = name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase();
myPct               = myMax > 0 ? Math.min(100, Math.round(myScore/myMax*100)) : 0; // same for rivalPct
```

## 3.5 Tier badge & shield style registries
`getRosterBadgeClasses(rankTitle)` — keyword match on the uppercased title, returns a full Tailwind class string (all share `absolute top-3 left-3 … font-mono text-[9px] font-black tracking-widest px-2 py-0.5 uppercase rounded-sm z-10`):
- `BESTIA` → `bg-lime-950/50 border border-lime-400 text-lime-400 shadow-[0_0_12px_rgba(163,230,53,0.15)]`
- `COMANDANTE` → `bg-yellow-950/40 border-yellow-500/40 text-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.1)]`
- `PREDADOR` → `bg-zinc-900 border-zinc-600/50 text-zinc-200`
- `TITÁN|TITAN` → `bg-slate-900 border-slate-400/40 text-slate-200 shadow-[0_0_8px_rgba(226,232,240,0.05)]`
- `GUERRER` → `bg-zinc-900 border-zinc-700/50 text-zinc-300`
- default (ATLETA INIT, bronze) → `bg-amber-950/30 border-amber-800/40 text-amber-500`

`RANK_SHIELD_CFG: Record<number, ShieldCfg>` (Power Rank modal, keys 1–6): 1 bronze `rgba(120,53,15,0.25)` / `1.5px rgba(217,119,6,0.65)` / glow / `#d97706`; 2 zinc `#71717a`; 3 slate `#94a3b8`; 4 gold `rgba(66,32,6,0.3)` / `rgba(234,179,8,0.5)` / `#eab308`; 5 zinc; 6 lime `rgba(26,46,5,0.5)` / `1.5px #a3e635` / `0 0 15px rgba(163,230,53,0.2)` / `#a3e635`.

## 3.6 Backend JSON contracts (Prisma-backed)
```jsonc
// POST /api/community/join → 200
{ "ok": true, "coachId": "ckx…", "coachName": "COACH", "notices": [
  { "id": "ckx…", "senderName": "Luis Yáñez", "role": "COACH", "content": "…", "createdAt": "2026-07-07T…Z" } ] }
// → 422 { "error": "SALA NO DISPONIBLE O NO PÚBLICA" } | { "error": "CÓDIGO NO COINCIDE CON NINGÚN RADAR" }
// → 403 { "error": "No autorizado" }

// GET /api/community/public-rooms → 200
{ "rooms": [{ "id": "ckx…", "name": "Luis Yáñez", "memberCount": 12 }], "currentRoom": { "id": "ckx…", "name": "…" } }

// GET /api/community/messages?coachId= → 200 (array, asc, take 100)
[{ "id", "coachId", "senderId", "senderName", "role": "COACH", "content", "imageUrl": null, "createdAt" }]

// GET /api/student/latest-notice → 200 { "notice": { "id", "senderName", "content", "createdAt" } | null }
// PATCH /api/me/wallet { "delta": 100 } → 200 { "walletBalance": 350 }  |  400 { "error": "Saldo insuficiente" }
// POST /api/student/leave-room → 200 { "ok": true }
// GET /api/mobile/community/notices → 200 [{ "id", "senderName", "role", "content", "createdAt" }]  (or [] )
```
Underlying Prisma model (`GroupMessage`): `id, coachId (indexed, plain column), senderId, senderName, role @default("CLIENT"), content, imageUrl?, createdAt` + `@@index([coachId, createdAt])`. Room membership = `Student.coachId`; private key = `Coach.joinCode` (@unique, 4–24 chars uppercase); visibility = `Coach.isPublic`.

---

# 4. EXACT COPY & SEMANTICS (every string literal, verbatim)

## 4.1 Gate / Lobby ("RADAR DE SALAS")
- Eyebrow: `COMUNIDAD · ACCESO TÁCTICO`
- Title: `RADAR DE SALAS`
- API error banner: `⚠️ [ ERROR // TOKEN INVÁLIDO - VERIFIQUE CON SU ENTRENADOR ]` *(shown for ANY join error — the server's 422 text is captured in `joinError` but this fixed banner renders instead)*
- Section label: `SALAS PÚBLICAS`
- Loading: `ESCANEANDO RED...`
- Auth error cell: `[ AUTH ERROR // SESIÓN NO VERIFICADA — RECARGA LA PÁGINA ]`
- Net error cell: `[ SERVER ERROR // ERROR AL CARGAR SALAS — INTÉNTALO DE NUEVO ]`
- Empty directory: `[ SISTEMA // TODAVÍA NO HAY SALAS PÚBLICAS DISPONIBLES ]`
- Room row sub: `{memberCount} ACTIVOS` · join button: `⚡ DESTRABAR ACCESO PÚBLICO`
- Divider: `CÓDIGO PRIVADO`
- Input placeholder: `CÓDIGO TÁCTICO` (maxLength 24, auto-uppercase)
- Local validation: `✕ INGRESA UN CÓDIGO VÁLIDO`
- Success line: `⚡ VERIFICADO · ACCESO CONCEDIDO`
- Button states: `🔑 INYECTAR CÓDIGO PRIVADO` → `VERIFICANDO...` (spinner) → `⚡ ACCESO CONCEDIDO`
- Client-side error codes: `ERROR_DESCONOCIDO` (non-OK without body error), `SIN_CONEXIÓN` (network throw)
- Server 422 strings: `SALA NO DISPONIBLE O NO PÚBLICA` · `CÓDIGO NO COINCIDE CON NINGÚN RADAR`

## 4.2 Shell
- Room banner: `FELLS TEAM PRO` / `HIGH PERFORMANCE UNIT` (hardcoded)
- Leave: mobile `SALIR ✕` (`...` while leaving) · desktop `SALIR DEL EQUIPO` / `DESVINCULANDO...`
- Tabs: `FEED · RANKING · RETOS · ROSTER · AVISOS`

## 4.3 Feed
- Ribbon labels: `MIEMBROS ACTIVOS / +3 ESTA SEMANA` · `STREAK GRUPAL / DÍAS` · `ESFUERZO PROM. / INTENSIDAD` · `KMs TOTALES / ESTE MES`
- Header: `STREAM DE ACTIVIDAD` · sub (English, intentional): `Real-time performance telemetry from the field` · live tag: `LIVE`
- Image overlay chip: `BEAST MODE`
- Comments panel: `COMENTARIOS` / `Sé el primero en comentar este logro.`
- Post modal: `NUEVO POST` · textarea placeholder `Comparte tu PR, entrenamiento o motivación...` · media slot `AÑADIR FOTO / REPORTE DE PROGRESO` · submit `PUBLICAR POST` · local post defaults `time: "Ahora"`, `exercise: "Nuevo Post"`, `badge: "NEW"`

## 4.4 Ranking
- Title: `RANKING DE SINDICATO` · sub: `SALA: TITANS_ELITE_04` (hardcoded)
- Self chip: `TU POSICIÓN` · self subline: `{kcal} KCAL · {sets} SETS` · others: `{pts} PTS`

## 4.5 Retos
- Title: `⚡ RETOS TÁCTICOS` · sub: `ARENA 1V1 · APUESTA TÁCTICA`
- Builder card header: `⚡ CONFIGURAR DESAFÍO` / `TÁCTICA 1v1`
- Steps: `01 · SELECCIONAR RIVAL` · `02 · MODALIDAD DE COMBATE` · `03 · MONTO DE APUESTA`
- Modality trigger idle: `SELECCIONAR MODALIDAD` (⚡ emoji); custom fallback emoji 🎯
- Stake display: `$ {n.toFixed(2)} USD` · `POOL TOTAL: $ {n×2 .toFixed(2)} USD` · slider bounds `$ 0` / `$ 1000 MAX` · quick buttons `+10 +50 MAX ✕`
- Gate hints: `Selecciona un rival` · `Define la modalidad del reto`
- CTA: `LANZAR RETO [ ⚡ ]`
- Launch toast: `DESAFÍO TÁCTICO LANZADO • ESPERANDO APROBACIÓN` · acceptance toast: `⚔️ ¡EL RIVAL ACEPTÓ TU DESAFÍO — COMBATE INICIADO!`
- Monitor: `⚔️ MONITOR DE COMBATE` · `{n} RETOS ACTIVOS` · status tokens `EN COMBATE` / `AGUARDANDO` (⏳) · score labels `MI MARCA` / `RIVAL` · `{n}% completado` (×2) · `TAP PARA DETALLE →`
- Empty arena: `⚔️ [ SYSTEM INTEL // ARENA VACÍA ]` + `[ INICIAR DESAFÍO EN ROSTER → ]`
- Detail: `DETALLE DE RETO` · `POOL TOTAL EN ESCROW` · `USD · BLOQUEADO` · `TÚ` / `RVL` · rules `⚖️ REGLAS DE ENGANCHE`: `MODALIDAD / POOL ESCROW / ESTADO / CONDICIÓN DE VICTORIA → MAYOR MARCA AL VENCIMIENTO`
- Claim button: `RECLAMAR PREMIO` · locked caption: `Disponible solo cuando tu marca supera al rival`
- Abandon: `ABANDONAR RETO` · confirm dialog: `¿Seguro que quieres abandonar este reto? Perderás la apuesta.`
- Modality picker: `⚡ MODALIDAD DE COMBATE` · options `MAX DEADLIFT / 1RM MÁXIMO KG` 🏋️ · `CONSISTENCIA / % SESIONES` 📊 · `KCAL GOAL / CAL TOTALES` 🔥 · `CREAR RETO PERSONALIZADO` · custom pane: `VOLVER` · `🎯 DEFINE TU MÉTRICA` · placeholder `EJ: MÁXIMAS DOMINADAS, INGESTA AGUA...` · `CONFIRMAR RETO PERSONALIZADO`
- Wallet toasts (root): `⚠️ Error al procesar el premio. Contacta a soporte.` · `⚠️ Sin conexión — premio no registrado.` · `⚠️ Saldo insuficiente — desafío no lanzado.` · `⚠️ Sin conexión — apuesta no debitada.`

## 4.6 Roster
- Title: `ROSTER DE ATLETAS` · sub: `{n} REGISTRADOS`
- Search placeholder: `Buscar atleta o rango...`
- Filter labels: `RANGO` · chips `ATLETA GUERRERO BESTIA LEYENDA` · `EN LÍNEA` · `+7D +14D +30D` · `✕ LIMPIAR FILTROS`
- Card: `{RANK} · RNK #{NN}` · `RACHA {n}D` · `PTS` · `VER PERFIL`
- Empty: `🚫 [ NO ATHLETES MATCH RADAR REQUIREMENTS ]` + `✕ RESET RADAR FILTERS`
- Profile overlay: `PERFIL DE ATLETA DE ÉLITE` · `CERRAR` · tiles `RACHA ACTIVA {n} DÍAS / ESTADO EN LÍNEA|OFFLINE / PTS TOTALES / KCAL ACUMULADAS` · `🏆 PRs REGISTRADOS` rows `MAX DEADLIFT / MAX SQUAT / BENCH PRESS ({n} KG)` + `KCAL RECORD ({n} KCAL)` · CTA `ENVIAR RETO`

## 4.7 Claim celebration modal
`⚡ VICTORIA CONFIRMADA` → `PREMIO RECLAMADO` → `$ {pool.toFixed(2)}` → `USD · TRANSFERIDO CON ÉXITO A TU BILLETERA` → `SALDO ACTUAL: ${walletBalance.toLocaleString()} USD` → buttons `CONTINUAR` / `VER MIS RETOS`. (Trophy in a 112px volt ring, `0 0 60px rgba(206,255,0,0.25)` glow.)

## 4.8 Avisos + broadcast
- Header: `CANAL DE INSTRUCCIÓN / AVISOS` · `EN DIRECTO • {n} ACTIVOS`
- Pin chip: `FIJADO` · history label: `HISTORIAL DE INSTRUCCIONES` · empty: `// SIN INSTRUCCIONES DEL COACH`
- Micro-grid: `RENDIMIENTO +12%` · `CONSISTENCIA 98%`
- Coach configurator: `⚡ GESTIÓN DE EMISIÓN` · `{n} ACTIVOS` · empty `// SIN MENSAJES ACTIVOS` · input placeholder `NUEVO MENSAJE DE EMISIÓN...` · button `EMITIR BROADCAST`
- Broadcast seed strings (root state):
  1. `⚡ PROTOCOLO EN EJECUCIÓN • PLAN ACTIVO › DÍA 1`
  2. `🔥 EL ÚNICO MAL ENTRENAMIENTO ES EL QUE NO HICISTE • DISCIPLINA ABSOLUTA`
  3. `🦾 ALINEACIÓN DE MACROS: CERO MARGEN DE ERROR EN TU RECOMPOSICIÓN`
  4. `⚔️ FELLS INTEL: MIEMBROS TIENEN UN STREAK GRUPAL DEL 92% HOY`
- Briefing drawer: `◈ SECURE CHANNEL · {n} ACTIVE TRANSMISSIONS` · `COACH BROADCAST / INTEL FEED` · `[ CLOSE TERMINAL ✕ ]` · `EN EMISIÓN ACTIVA` · `// NO ACTIVE TRANSMISSIONS` · footer `// CONFIGURA EN SALAS › AVISOS › GESTIÓN DE EMISIÓN`
- Bottom-nav label for this tab (global `TABS`): **`Salas`** (icon `MessageSquare`, id `"community"`). ⚠ Note the id/label mismatch elsewhere: tab id `"squads"` is the **Workout** tab.

---

# 5. VERIFIED SHARP EDGES (port deliberately, don't inherit blindly)
1. **Join error UX mismatch:** the gate stores the server's specific 422 message in `joinError` but always renders the fixed `TOKEN INVÁLIDO` banner — the distinct "sala no pública" vs "código no coincide" semantics are lost visually.
2. **Meal-index `itemKey`, stake non-persistence, abandoned-stake non-refund:** launched challenges exist only in memory; reloading loses them while the wallet debit remains in Postgres (net money loss for the user). Abandoning likewise never refunds.
3. **Claim is client-authoritative:** `iWinning` is computed client-side and `PATCH /api/me/wallet` accepts any positive delta — there is no server-side challenge settlement or validation. A real mobile build needs a challenges table + server resolution.
4. **`GET /api/community/messages` lacks room-membership checks** (any authenticated user + coachId reads the feed) and CLIENT can never post (403) — the feed composer is local theater.
5. **Room identity is hardcoded** (`FELLS TEAM PRO`, `SALA: TITANS_ELITE_04`) even though the join response carries the real `coachName` — mobile should render the real name.
6. **Rank filter chips vs seed titles:** the `LEYENDA` chip can never match the seed roster (no seed member carries LEYENDA), and `filterStreakMin` chip `+30` excludes everyone except MARCUS_ELITE (42) and COACH_FELLS (38).
7. **`isCoach` is always `false`** from the portal — the GESTIÓN DE EMISIÓN configurator is dead UI for clients; the briefing drawer still reads the same local `broadcastMessages`, so its "coach" content is really the 4 seed strings.
8. **Joining is destructive** (replaces `coachId` unconditionally, server-side) — the gate never warns when a student with an existing room joins another; mobile should add the confirmation.

---
*Saved for the mobile rebuild. Web repo companions: `MYCOACH_GLOBAL_MASTER_SPEC.md` · `MYCOACH_RETINA_UI_MASTER_BLUEPRINT.md` · `MYCOACH_WORKOUT_MASTER_BLUEPRINT.md`.*
