/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Root router. Defines the four top-level routes and wraps the
 * exam-taking route in ProtectedRoute so only authenticated students
 * with an active attempt can reach it.
 *
 * Route flow:
 *   /login           → LoginPage (public)
 *   /instructions    → InstructionsPage (protected — auth required)
 *   /exam            → ExamPage (protected — auth + active attempt required)
 *   /submitted       → SubmittedPage (protected — auth required)
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { AttemptProvider } from './contexts/AttemptContext';
import LoginPage from './routes/login/LoginPage';
import InstructionsPage from './routes/instructions/InstructionsPage';
import SubmittedPage from './routes/submitted/SubmittedPage';

// Person B owns ExamPage — lazy-loaded for code splitting.
import { lazy, Suspense } from 'react';
const ExamPage = lazy(() => import('./routes/exam/ExamPage'));

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Auth-protected routes */}
        <Route element={<ProtectedRoute />}>
          {/* AttemptProvider lives here — wraps every route that needs exam context */}
          <Route element={<AttemptProvider />}>
            <Route path="/instructions" element={<InstructionsPage />} />
            <Route
              path="/exam"
              element={
                <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-500">Loading exam…</div>}>
                  <ExamPage />
                </Suspense>
              }
            />
            <Route path="/submitted" element={<SubmittedPage />} />
          </Route>
        </Route>

        {/* Default redirect */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
