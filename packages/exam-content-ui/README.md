# @secure-exam/exam-content-ui

Person B's UI, built as a package so it doesn't depend on any one app:

| Export | Who uses it | Where it goes in `apps/web` |
|---|---|---|
| `QuestionBankPage`, `QuestionForm`, `ImportDialog` | Admin | `features/question-bank/` routes |
| `PickForExamDialog` | Admin, from the exam editor (Person A) | exam detail page, "Add from bank" button |
| `CodingProblemEditor` | Admin (inside `QuestionForm`) | — |
| `CodingQuestionView`, `desktopLocalRunner` | Student, inside the exam page | exam page's question renderer registry: `CODING → CodingQuestionView` |
| `QuestionsTab` | Admin, results page | results tab registry (Person A) |

```bash
npm run content-ui:dev        # playground on http://localhost:3005 (Fake API, or Real API via /api → :3000)
npm run content-ui:test       # Vitest + Testing Library
npm run content-ui:typecheck
```

## Mounting in a host app

1. **Dependency:** `"@secure-exam/exam-content-ui": "*"`. It is consumed as TypeScript source (no build step).
2. **Vite aliases** (shared packages' `dist/` is CommonJS), as in `apps/exam-client/renderer/vite.config.ts`:
   ```ts
   '@secure-exam/types': resolve(__dirname, '<root>/packages/types/src/index.ts'),
   '@secure-exam/api-client': resolve(__dirname, '<root>/packages/api-client/src/index.ts'),
   ```
3. **Tailwind:** add `'<root>/packages/exam-content-ui/src/**/*.{ts,tsx}'` to `content`.
4. **Providers:** a React Query `QueryClientProvider` above these components. The real API is used by default through `@secure-exam/api-client` (same token as the rest of the app); `ExamContentApiProvider` is only for swapping it.
5. **Lazy-load** routes that render editors: Monaco is ~875 KB gzipped. It is bundled locally (no CDN); under a CSP the page needs `worker-src 'self' blob:` and `font-src 'self' data:`.
6. **UI kit:** `src/ui/index.tsx` holds stand-ins (Button, Input, Dialog…). When Person A's kit exists, re-export it from that one file.

### Routes (example)

```tsx
const QuestionBank = lazy(() => import('./QuestionBankRoutes'));

// QuestionBankRoutes.tsx
function BankList() {
  const nav = useNavigate();
  return <QuestionBankPage onCreate={() => nav('new')} onEdit={(id) => nav(id)} courses={courses} />;
}
function BankEdit() {
  const { id } = useParams();
  const nav = useNavigate();
  return (
    <QuestionForm
      questionId={id === 'new' ? undefined : id}
      courses={courses}
      onSaved={() => nav('..')}
      onCancel={() => nav('..')}
      onDuplicated={(copy) => nav(`../${copy.id}`)}
    />
  );
}
```

`courses` is optional (`{ id, name }[]` from Person A's courses API); without it the course pickers are hidden.

### In the exam page

```tsx
import { CodingQuestionView, desktopLocalRunner } from '@secure-exam/exam-content-ui';

<CodingQuestionView
  attemptId={attemptId}
  question={question}                 // PublicQuestion from GET /attempts/:id/questions (has .coding)
  savedCode={answer?.textResponse}    // saved draft
  onSaveDraft={(code) => saveAnswer(question.id, { textResponse: code })}  // the exam's offline-safe save
  localRunner={desktopLocalRunner()}  // Run / Run samples on this PC (Person C's window.desktop.runCode)
  online={isOnline}                   // from useNetworkStatus
  hardened                            // block external paste + context menu (default true)
  onBlockedPaste={() => logSecurityEvent('CLIPBOARD_BLOCKED')}
/>
```

- **Run / Run samples** use `localRunner` (contract: `docs/local-code-runner.md`). Without one — or if it fails — they use the server only when `GET /coding/config` says `serverRunEnabled` (development by default).
- **Submit** saves the code as the final answer; the server grades it on all tests after the attempt ends (`CODING_GRADING_MODE=DEFERRED`). In `LIVE` mode the score appears immediately.
- Drafts go through the exam's own `saveAnswer()`, so they sync offline like any answer, and the server grades the latest draft if the student never pressed Submit.

See the decision log in `person_b_plan.md` (§13) for why, and how to switch modes.
