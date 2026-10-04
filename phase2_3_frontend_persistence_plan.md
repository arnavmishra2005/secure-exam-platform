# Phase 2 + 3 — Frontend (React Exam UI) + Persistence
### Implementation Plan, Task Breakdown & File Structure for 3 People

This phase builds the **exam-taking UI** and its **offline-resilient persistence layer** together, since they're tightly coupled (every answer save has to go through the persistence layer). It plugs directly into the Phase 1 backend/admin portal — no backend changes required, only additive ones noted below.

---

## 1. Key Design Decision: Persistence Abstraction (so Phase 4/Electron doesn't break this work)

The README's long-term plan is SQLite-backed persistence inside Electron. Since Electron isn't built yet (Phase 4), this phase builds against a **storage interface**, not a specific database:

```ts
interface IOfflineStore {
  saveAnswer(attemptId, questionId, answer): Promise<void>;
  getAnswer(attemptId, questionId): Promise<Answer | null>;
  getPendingAnswers(attemptId): Promise<Answer[]>;
  markSynced(answerId): Promise<void>;
}
```

- **Now (Phase 2/3):** implemented with **IndexedDB** (via the `idb` library) — works in a plain browser tab, no Electron needed.
- **Later (Phase 4):** implemented with **SQLite** inside Electron's main process — same interface, different implementation, swapped in one file (`persistence/index.ts`).
- Nobody writing UI code talks to IndexedDB directly — they call the interface. This is what makes Phase 4 a swap, not a rewrite.

---

## 2. Day 0 — Shared Foundation (All 3, together, ~half a day)

- Scaffold `apps/exam-client/renderer` with **Vite + React + TypeScript**.
- Agree on: **React Router** (routing), **Zustand** (local UI state), **React Query** (server data fetching/caching), **idb** (IndexedDB wrapper for persistence).
- Confirm reuse of **Phase 1's shared packages** — `packages/types`, `packages/validation`, `packages/api-client` — no entity/DTO shapes are redefined here.
- Add `VITE_API_BASE_URL` to the shared `.env.example`, pointed at the Phase 1 backend.
- Flag to Person A-from-Phase-1 (backend): the new renderer's dev origin needs adding to the backend's CORS whitelist — a one-line config change, not new backend logic.
- Agree on the `IOfflineStore` interface shape (above) together — this is the one contract all three code against.

---

## 3. Person A — App Shell, Auth, Session & Timer

**Owns the foundation the other two import — ships the routing/auth/session scaffold first.**

### Scope
- Student login flow — reuses the **same `/auth/login` endpoint** built in Phase 1 (Person A there), via `packages/api-client`'s `auth.api`. Just a different role in the JWT.
- Routing: Login → Instructions → Exam → Submitted, with route guards.
- `AttemptContext`: bootstraps the current attempt on load — fetches exam metadata + `expires_at` from the Phase 1 `attempt.api` (built by Person C in Phase 1).
- Timer display: client-side ticking clock seeded from server's `expires_at`, **re-synced on every reconnect/refetch** so client clock drift never matters — this is a UI concern layered on top of Phase 1's server-side timer authority, not a replacement for it.
- Header/layout shell, including a network-status badge (visual only — consumes Person C's hook).
- Global network-status **detection hook** lives with Person C; Person A just renders it.

### Files
```
apps/exam-client/renderer/src/
├── main.tsx                                [A]
├── App.tsx                                  [A]  — router setup
├── routes/
│   ├── login/LoginPage.tsx                  [A]
│   ├── instructions/InstructionsPage.tsx    [A]
│   └── submitted/SubmittedPage.tsx          [A]
├── contexts/
│   ├── AuthContext.tsx                      [A]  — JWT storage, useAuth()
│   └── AttemptContext.tsx                   [A]  — current attempt/exam bootstrap
├── components/
│   ├── layout/Header.tsx                    [A]  — includes TimerDisplay + NetworkStatusBadge
│   ├── layout/ProtectedRoute.tsx            [A]
│   ├── timer/TimerDisplay.tsx               [A]  — server-seeded countdown
│   └── common/NetworkStatusBadge.tsx        [A]  — renders Person C's useNetworkStatus()
└── hooks/
    ├── useAuth.ts                           [A]
    └── useAttempt.ts                        [A]  — wraps attempt.api via React Query
```

---

## 4. Person B — Exam-Taking UI

**Owns the main visual surface — the actual exam screen.**

### Scope
- `ExamPage`: the container screen, consumes Person A's `AttemptContext` for exam/timer data and Person C's offline-aware save hook for writes — doesn't talk to IndexedDB or the API directly itself.
- Question renderer (supports question types from `packages/types`'s `QuestionType` enum — e.g. MCQ, multi-select).
- Options list component.
- Question palette: color-coded per `QuestionState` enum (`NOT_VISITED`, `VISITED`, `ANSWERED`, `MARKED_REVIEW`, `ANSWERED_AND_MARKED_REVIEW`) — enum reused from Phase 1's `packages/types`, not redefined.
- Navigation controls: Save & Next / Previous / Mark for Review / Clear Answer.
- Submit confirmation modal (shows answered/unanswered counts).
- Local navigation state (current question index, visited/answered map) — kept in a Zustand store, separate from persistence/sync state (Person C's concern).

### Files
```
apps/exam-client/renderer/src/
├── routes/
│   └── exam/ExamPage.tsx                     [B]  — screen container
├── components/exam/
│   ├── QuestionRenderer.tsx                  [B]
│   ├── OptionList.tsx                        [B]
│   ├── QuestionPalette.tsx                   [B]
│   ├── NavigationControls.tsx                [B]  — Save&Next/Prev/Mark/Clear
│   └── SubmitConfirmationModal.tsx           [B]
├── store/
│   └── examStore.ts                          [B]  — Zustand: currentIndex, questionStates
├── hooks/
│   ├── useExamQuestions.ts                   [B]  — fetches exam questions via api-client
│   └── useAnswer.ts                          [B]  — thin wrapper calling Person C's saveAnswer()
└── types/
    └── ui.types.ts                           [B]  — local-only UI types (not shared package)
```

### Key integration rule
`useAnswer.ts` (B) **never** writes directly to IndexedDB or calls the backend answer API directly — it calls a single function exposed by Person C's persistence layer. This is the seam that keeps B's and C's work independently testable and mergeable.

---

## 5. Person C — Persistence & Sync Layer

**Owns the offline-resilience layer — the Phase 3 scope, built in parallel with B's UI.**

### Scope
- `IOfflineStore` interface + IndexedDB implementation (today) — the abstraction described in section 1.
- Sync engine: background loop that reads pending (unsynced) answers, pushes them to the Phase 1 **Answer API** (built by Person C in Phase 1 — same domain, same person, strong continuity), retries with backoff on failure.
- Network status detection hook (`useNetworkStatus`) — `navigator.onLine` + periodic backend ping, since `navigator.onLine` alone is unreliable.
- Sync status store (Zustand) — exposes "Saved locally" / "Synced" / "Pending" per answer, for Person A's badge and Person B's palette to optionally reflect.
- Submission handling: submission is **not** offline-first like answers — it requires a live backend confirmation, but if offline, C's layer queues the submit intent and retries automatically once back online, surfacing a "submission pending — reconnect to finish" state to B's confirmation modal.
- Conflict handling: on reconnect, local answers always overwrite server state for that attempt (server stays authoritative only for attempt validity/expiry, not for answer content) — documented explicitly so B doesn't need to reason about conflicts in the UI.

### Files
```
apps/exam-client/renderer/src/
├── persistence/
│   ├── offlineStore.interface.ts             [C]  — IOfflineStore contract
│   ├── indexedDbStore.ts                     [C]  — IndexedDB impl (via `idb`)
│   ├── syncEngine.ts                         [C]  — retry/backoff push loop
│   ├── syncQueue.ts                          [C]  — pending-item queue helper
│   └── index.ts                              [C]  — getOfflineStore() factory (swap point for Phase 4)
├── store/
│   └── syncStore.ts                          [C]  — Zustand: per-answer sync status
└── hooks/
    ├── useNetworkStatus.ts                   [C]
    └── useSyncStatus.ts                      [C]
```

### Key integration rule
Everything in `persistence/` is **framework-agnostic plain TypeScript** — no React imports inside `offlineStore.interface.ts`, `indexedDbStore.ts`, or `syncEngine.ts`. This matters because in Phase 4, Electron's main process (not a React component) will host the SQLite implementation — keeping this layer React-free now means it ports cleanly later.

---

## 6. Dependency Map

```
Person A (AttemptContext, Auth, Routing)
        |
        v
   published Day 0-1 (can stub AttemptContext with fixture data)
        |
   +----+----+
   |         |
   v         v
Person B   Person C
(Exam UI,  (Persistence,
 navigation) sync engine)
   |             ^
   +--useAnswer--+
   (B calls C's saveAnswer();
    C has no dependency on B)
```

- **Person C has zero dependency on A or B** — the persistence layer only needs `attemptId`/`questionId`/answer payloads, which can be hand-fed via test fixtures. C can start immediately and in full isolation.
- **Person B depends on A's `AttemptContext`** for exam metadata — mitigated by A shipping a stubbed context (hardcoded fixture exam/questions) on Day 0-1, same pattern as Phase 1.
- **Person B depends on C's `saveAnswer()`** — mitigated by C publishing the `IOfflineStore` interface and a trivial in-memory stub implementation first; B codes against the interface, C's real IndexedDB version swaps in later with no change to B's code.

---

## 7. How This Connects Back to Phase 1

| Connection point | How it's ensured |
|---|---|
| **No duplicate types** | `Exam`, `Question`, `Attempt`, `Answer`, enums — all imported from Phase 1's `packages/types`, never redefined locally. |
| **Same API contracts** | All network calls go through Phase 1's `packages/api-client` (`auth.api`, `attempt.api`, `answer.api`) — the exact functions the admin portal already uses, just called from a different app. |
| **Same auth mechanism** | Student login uses the identical `/auth/login` endpoint and JWT shape as admin login (Phase 1, Person A) — only the role differs. |
| **Server stays timer-authoritative** | The client-side `TimerDisplay` (Person A) is cosmetic countdown only; actual expiry enforcement remains server-side (Phase 1, Person C's `isAttemptValid()`) — the UI re-fetches `expires_at` on reconnect so it can never drift ahead of the server. |
| **Backend config change needed** | One line: add the renderer's dev/prod origin to Phase 1's CORS whitelist (Person A's `main.ts` from Phase 1). Nothing else in the backend changes. |
| **Audit trail continuity** | Answer saves and submissions still flow through Phase 1's Answer/Submission APIs, which already call `AuditService.logEvent()` — Phase 2/3 doesn't need its own audit logic. |
| **Forward compatibility with Phase 4** | `IOfflineStore` interface + framework-agnostic `persistence/` folder means Electron's SQLite implementation can replace IndexedDB later by swapping one factory function, not rewriting B's or A's code. |

---

## 8. Exit Checklist

- [ ] Student can log in (same backend auth as admin) and see exam instructions.
- [ ] Exam screen renders questions from Phase 1's seeded data, with working palette/navigation (B).
- [ ] Answers save locally first and sync to the Phase 1 Answer API in the background (C).
- [ ] Disconnecting network mid-exam doesn't block answering; reconnecting flushes pending answers (C).
- [ ] Timer counts down from server's `expires_at` and re-syncs on reconnect (A).
- [ ] Submission works online, and queues/retries correctly if attempted while offline (C).
- [ ] No type or DTO is duplicated between this phase and Phase 1's shared packages.
