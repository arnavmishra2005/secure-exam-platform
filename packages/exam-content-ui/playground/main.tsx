/**
 * Owner: Person B. Dev playground for this package (npm run content-ui:dev).
 * Not shipped. "Fake" mode runs entirely in memory; "Real API" mode goes
 * through Vite's /api proxy to a local API on :3000.
 */
import './index.css';
import { StrictMode, useMemo, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as client from '@secure-exam/api-client';
import { QuestionType, type PublicQuestion } from '@secure-exam/types';
import {
  CodingQuestionView,
  ExamContentApiProvider,
  PickForExamDialog,
  QuestionBankPage,
  QuestionForm,
  QuestionsTab,
  defaultExamContentApi,
  type ExamContentApi,
} from '../src';
import { errorMessage } from '../src/api/ExamContentApi';
import { Alert, Button, Field, Input } from '../src/ui';
import { desktopLocalRunner } from '../src/coding/localRunner';
import { createFakeApi, createFakeLocalRunner, publicCodingQuestion, seedState } from '../src/testing/fakeApi';

type Mode = 'fake' | 'real';
type Tab = 'bank' | 'picker' | 'student' | 'results';

function BankTab() {
  const [editing, setEditing] = useState<string | 'new' | null>(() =>
    new URLSearchParams(window.location.search).get('edit'),
  );
  if (editing) {
    return (
      <div className="rounded-lg bg-white p-5 shadow-sm">
        <h1 className="mb-4 text-xl font-semibold">{editing === 'new' ? 'New question' : 'Edit question'}</h1>
        <QuestionForm
          key={editing}
          questionId={editing === 'new' ? undefined : editing}
          onSaved={() => setEditing(null)}
          onCancel={() => setEditing(null)}
          onDuplicated={(copy) => setEditing(copy.id)}
        />
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <QuestionBankPage onCreate={() => setEditing('new')} onEdit={setEditing} />
    </div>
  );
}

function PickerTab({ mode }: { mode: Mode }) {
  const [examId, setExamId] = useState(mode === 'fake' ? 'exam-demo' : '');
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3 rounded-lg bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-600">
        The dialog Person A's exam editor will open. Only READY questions not already in the exam are listed; the exam
        must be DRAFT or SCHEDULED.
      </p>
      <div className="flex items-end gap-2">
        <Field label="Exam ID" className="flex-1">
          {(id) => <Input id={id} value={examId} onChange={(e) => setExamId(e.target.value.trim())} />}
        </Field>
        <Button variant="primary" disabled={!examId} onClick={() => setOpen(true)}>
          Add questions…
        </Button>
      </div>
      <PickForExamDialog examId={examId} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function StudentTab({ mode, fakeQuestion }: { mode: Mode; fakeQuestion: PublicQuestion }) {
  const [session, setSession] = useState<{ attemptId: string; question: PublicQuestion; saved: string | null } | null>(
    mode === 'fake' ? { attemptId: 'attempt-demo', question: fakeQuestion, saved: null } : null,
  );
  const [examId, setExamId] = useState('11111111-1111-4111-8111-111111111111');
  const [error, setError] = useState<string | null>(null);
  const [online, setOnline] = useState(true);
  const [useLocal, setUseLocal] = useState(true);
  const fakeRunner = useMemo(() => createFakeLocalRunner(), []);
  // Real mode: the Electron app's runner if present; in a browser there is none, so the
  // server runs the code (allowed in development, see the decision log).
  const localRunner = mode === 'fake' ? (useLocal ? fakeRunner : undefined) : desktopLocalRunner();

  const open = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const attempt = await client.startAttempt({ examId }).catch(() => client.getMyAttemptForExam(examId));
      const questions = await client.getAttemptQuestions(attempt.id);
      const coding = questions.find((q) => q.type === QuestionType.CODING);
      if (!coding) throw new Error('This exam has no coding question.');
      const answers = await client.listAnswers(attempt.id);
      setSession({
        attemptId: attempt.id,
        question: coding,
        saved: answers.find((a) => a.questionId === coding.id)?.textResponse ?? null,
      });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  if (!session) {
    return (
      <form onSubmit={open} className="space-y-3 rounded-lg bg-white p-5 shadow-sm">
        <p className="text-sm text-slate-600">
          Log in as a student, then open (or resume) an attempt. The exam must contain a coding question.
        </p>
        <Field label="Exam ID">{(id) => <Input id={id} value={examId} onChange={(e) => setExamId(e.target.value.trim())} />}</Field>
        {error && <Alert>{error}</Alert>}
        <Button type="submit" variant="primary">
          Open attempt
        </Button>
      </form>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-4 text-sm text-slate-600">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={!online} onChange={(e) => setOnline(!e.target.checked)} />
          Simulate offline
        </label>
        {mode === 'fake' ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={useLocal} onChange={(e) => setUseLocal(e.target.checked)} />
            Run on this PC (fake local runner; "crash-runner" in the code makes it fail)
          </label>
        ) : (
          <span>{localRunner ? 'Running on this PC (exam app)' : 'No local runner in a browser: Run uses the server (development only)'}</span>
        )}
      </div>
      <CodingQuestionView
        key={session.question.id}
        attemptId={session.attemptId}
        question={session.question}
        savedCode={session.saved}
        online={online}
        localRunner={localRunner}
        onSaveDraft={(code) =>
          mode === 'real'
            ? client.saveAnswer(session.attemptId, session.question.id, { textResponse: code }).then(() => undefined)
            : console.info('[fake] draft saved', code.length, 'chars')
        }
        onBlockedPaste={() => console.warn('[playground] external paste blocked')}
      />
    </div>
  );
}

function ResultsTab({ mode }: { mode: Mode }) {
  const [examId, setExamId] = useState(mode === 'fake' ? 'exam-demo' : '11111111-1111-4111-8111-111111111111');
  const [shown, setShown] = useState(examId);
  return (
    <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setShown(examId);
        }}
      >
        <Field label="Exam ID" className="flex-1">
          {(id) => <Input id={id} value={examId} onChange={(e) => setExamId(e.target.value.trim())} />}
        </Field>
        <Button type="submit">Show</Button>
      </form>
      <QuestionsTab key={shown} examId={shown} />
    </div>
  );
}

function LoginBar({ onLoggedIn }: { onLoggedIn: (who: string) => void }) {
  const [email, setEmail] = useState('admin@secure-exam.dev');
  const [password, setPassword] = useState('Admin@1234');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await client.login({ email, password });
      client.setAccessToken(res.accessToken);
      onLoggedIn(email);
    } catch (err) {
      setError(errorMessage(err));
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Field label="Email">{(id) => <Input id={id} value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
      <Field label="Password">
        {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />}
      </Field>
      <Button type="submit" variant="primary">
        Log in
      </Button>
      <span className="text-xs text-slate-500">Seed users: admin@ / Admin@1234, alice@ / Student@1234</span>
      {error && <Alert>{error}</Alert>}
    </form>
  );
}

function App() {
  const [mode, setMode] = useState<Mode>('fake');
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return t === 'picker' || t === 'student' || t === 'results' ? t : 'bank';
  });
  const [who, setWho] = useState<string | null>(null);
  const fakeState = useMemo(() => seedState(), []);
  const fakeApi = useMemo(() => createFakeApi(fakeState, { latencyMs: 250 }), [fakeState]);
  const api: ExamContentApi = mode === 'fake' ? fakeApi : defaultExamContentApi;
  const queryClient = useMemo(() => new QueryClient(), [mode]); // fresh cache per mode

  const switchMode = (m: Mode) => {
    if (m === 'real') client.setApiBaseUrl('/api');
    setMode(m);
    setWho(null);
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ExamContentApiProvider api={api}>
        <div className="mx-auto max-w-7xl space-y-4 p-4">
          <header className="flex flex-wrap items-center gap-3 rounded-lg bg-white p-3 shadow-sm">
            <strong className="text-slate-900">Exam content playground</strong>
            <span className="flex rounded-md border border-slate-300 text-sm">
              {(['fake', 'real'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`px-3 py-1 ${mode === m ? 'bg-slate-900 text-white' : 'text-slate-700'}`}
                  onClick={() => switchMode(m)}
                >
                  {m === 'fake' ? 'Fake API' : 'Real API (:3000)'}
                </button>
              ))}
            </span>
            <nav className="flex gap-1 text-sm">
              {(
                [
                  ['bank', 'Question bank'],
                  ['picker', 'Add to exam'],
                  ['student', 'Student coding view'],
                  ['results', 'Question results'],
                ] as [Tab, string][]
              ).map(([t, label]) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded px-3 py-1 ${tab === t ? 'bg-emerald-700 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
                  onClick={() => setTab(t)}
                >
                  {label}
                </button>
              ))}
            </nav>
            {mode === 'fake' && (
              <span className="text-xs text-slate-500">In-memory data. The fake runner doesn't execute code (code using sum( "passes").</span>
            )}
          </header>

          {mode === 'real' && !who ? (
            <div className="rounded-lg bg-white p-4 shadow-sm">
              <LoginBar onLoggedIn={setWho} />
            </div>
          ) : (
            <main key={`${mode}-${who ?? ''}`}>
              {mode === 'real' && (
                <p className="mb-2 flex items-center gap-2 text-xs text-slate-500">
                  Logged in as {who}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => {
                      client.setAccessToken(null);
                      setWho(null);
                    }}
                  >
                    Log out
                  </button>
                </p>
              )}
              {tab === 'bank' && <BankTab />}
              {tab === 'picker' && <PickerTab mode={mode} />}
              {tab === 'student' && <StudentTab mode={mode} fakeQuestion={publicCodingQuestion(fakeState)} />}
              {tab === 'results' && <ResultsTab mode={mode} />}
            </main>
          )}
        </div>
      </ExamContentApiProvider>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
