# 🚀 AUTONOMOUS MASTER DIRECTIVE & PRODUCTION ROADMAP: MYCOACH-MOBILE

> **AGENT EXECUTION DIRECTIVE:**
> You are acting as the Lead Mobile Engineer & System Architect for `mycoach-mobile`.
> 
> **AUTO-COMMAND & TERMINAL EXECUTION PERMISSION:**
> You are hereby granted FULL EXPLICIT AUTHORIZATION to run all necessary terminal commands (e.g., `npx expo install`, `npx tsc --noEmit`, file creation, refactoring, package installs) automatically at your discretion. DO NOT pause or prompt the user for manual confirmation to execute terminal commands or write code. Execute directly, evaluate results, and proceed autonomously.
> 
> **MANDATORY SELF-HEALING & VERIFICATION LOOP:**
> 1. After completing EACH sub-step or installing packages, run `npx tsc --noEmit` in the integrated terminal.
> 2. If TypeScript or compilation errors occur, resolve them immediately before moving to the next task.
> 3. Do not introduce `any` types; maintain strict TypeScript type safety across the entire codebase.

---

## 🎯 OBJECTIVE
Implement the final 4 production-grade modules (Background Rest Timer & Notifications, Coach Prospect Inbox, Apple/Google Health Integration, RevenueCat Monetization Paywall) and execute full UI/UX/Performance optimization.

---

## 📦 PHASE 1: BACKGROUND REST TIMER, NOTIFICATIONS & HAPTICS

### 1.1 Package Installation & Config
- Run automatically: `npx expo install expo-notifications expo-av expo-haptics`
- In `app.json`, ensure iOS background modes and permissions are configured:
  - Add `UIBackgroundModes`: `["audio", "remote-notification"]`
  - Configure Notification permissions plugin.

### 1.2 Local Notification Service (`lib/notifications.ts`)
- Create `lib/notifications.ts` with helpers:
  - `requestNotificationPermissions()`: Asks for permissions natively.
  - `scheduleRestTimerNotification(seconds: number, exerciseName: string)`: Schedules a local notification to trigger in $T + \text{seconds}$ with title `"⏱️ ¡Tiempo de descanso completado!"` and body `"Siguiente set: ${exerciseName}"`.
  - `cancelScheduledRestNotifications()`: Clears active timers when the user returns to the app early.

### 1.3 Quick Workout Integration (`app/(portal)/quick-workout.tsx`)
- On set completion check (`[ ✓ ]`):
  - Trigger heavy haptic feedback (`Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)`).
  - Fire local audio chime if available (`expo-av`).
  - Schedule background notification via `scheduleRestTimerNotification`.
  - Display active `<RestTimerBanner />` on screen.

---

## 📥 PHASE 2: COACH PROSPECT REQUEST INBOX & LEAD MANAGEMENT

### 2.1 Data Models & Types (`types/coachRequest.ts`)
- Define `CoachRequest` interface:
  ```ts
  export interface CoachRequest {
    id: string;
    studentId: string;
    studentName: string;
    studentAvatar?: string;
    coachId: string;
    goal: string;
    monthlyBudget?: string;
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
    createdAt: string;
  }
  ```

### 2.2 Client-Side Link Request (`app/(portal)/coaches/index.tsx`)

* Update `<CoachProfileModal />`:
* When clicking `[ 📩 SOLICITAR VINCULACIÓN ]`, trigger `createCoachRequest(coachId)`.
* Show immediate tactile toast: `"Solicitud enviada al Coach. Te notificaremos cuando acepte tu perfil."`

### 2.3 Coach Request Inbox Screen (`app/(coach)/solicitudes/index.tsx`)

* Create the Coach Inbox tab/view:
* Header with pending request counter badge (`[ 📥 Solicitudes Pendientes (3) ]`).
* Cards displaying student info: Avatar, Name, Age, Goal, Calculated Macros from onboarding.
* Action buttons:
* `[ ✅ Aceptar Alumno ]`: Updates `student.coachId = currentCoachId`, sets `status = ACCEPTED`, and assigns the default Base Plan.
* `[ ❌ Rechazar ]`: Updates request `status = REJECTED`.

---

## 🍎 PHASE 3: APPLE HEALTH & GOOGLE HEALTH CONNECT BIOMETRICS

### 3.1 Package Installation & Config

* Run automatically: `npx expo install react-native-health` (or Expo HealthKit wrapper).
* In `app.json`, append permission descriptions:
* `NSHealthShareUsageDescription`: `"MyCouch utiliza Apple Health para sincronizar tus pasos diarios, ritmo cardíaco y calorías quemadas."`
* `NSHealthUpdateUsageDescription`: `"MyCouch guarda tus entrenamientos completados en Apple Health."`

### 3.2 Health Data Integration Service (`lib/healthKit.ts`)

* Build module with async functions:
* `initHealthKit()`: Requests read permissions for Steps, Active Energy, and Heart Rate.
* `fetchDailyBiometrics()`: Returns `{ steps: number, activeCalories: number, avgHeartRate: number }`.

### 3.3 Progress Biometrics UI (`components/BiometricsCard.tsx`)

* Replace mock values in `Progreso` tab with real sync hook `useHealthData()`.
* Provide manual pull-to-refresh and a discrete button: `[ 🔄 Sincronizar Apple Health ]`.

---

## 💳 PHASE 4: REVENUECAT MONETIZATION & PAYWALL FRAMEWORK

### 4.1 Package Installation & Service (`lib/revenueCat.ts`)

* Run automatically: `npx expo install react-native-purchases`
* Create `lib/revenueCat.ts`:
* Initialize RevenueCat SDK with API Keys.
* Synchronize user identity with current App User ID.
* Export `checkEntitlementStatus()` returning subscription tier (`FREE_SOLO`, `PRO_SOLO`, `COACHED`).

### 4.2 Paywall Modal Component (`components/PaywallModal.tsx`)

* Design a high-converting dark-tactile paywall modal:
* Headline: `"Desbloquea MyCouch PRO ⚡"`.
* Feature Checklist:
* ✔️ Sugerencia de Sobrecarga Progresiva Automática.
* ✔️ Plantillas Personalizadas Ilimitadas.
* ✔️ Reportes de Progreso en PDF exportables.
* ✔️ Descuentos exclusivos en contratación de Coaches.
* Call To Action: `[ ⚡ Suscribirme por $5.99 / mes ]` with 7-day free trial tag.
* Link with `subscriptionPermissions.ts` to trigger modal when hitting free limits.

---

## ⚡ PHASE 5: SYSTEM-WIDE PERFORMANCE, UX & MOTIVATIONAL ALERTS

### 5.1 Performance Tuning & FPS

* Audit all `ScrollView` and `FlatList` elements in `portal.tsx`, `workout.tsx`, `quick-workout.tsx`, and `student-detail`:
* Enforce `removeClippedSubviews={true}`, `maxToRenderPerBatch={8}`, `windowSize={5}`.
* Wrap list item components in `React.memo` and callbacks in `useCallback`.

### 5.2 Motivational Alerts Engine (`lib/motivationalAlerts.ts`)

* Create context-aware motivational trigger system:
* On PR detection: Flash custom Volt banner (`🏆 ¡NUEVO RÉCORD PERSONAL REGISTRADO!`).
* On workout completion: Trigger random high-energy tactical quote.
* On 3+ days inactivity: Show subtle portal card encouraging a quick session.

---

## 🛠️ VERIFICATION COMMAND

Execute `npx tsc --noEmit` upon completion of each phase to ensure zero compilation or type errors. Log progress in `walkthrough.md`.
