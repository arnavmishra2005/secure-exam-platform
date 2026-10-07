/**
 * Owner: Person A — App Shell, Auth, Session & Timer
 *
 * Application entry point. Mounts the React tree with global providers:
 *   - QueryClientProvider  (React Query — server data fetching/caching)
 *   - AuthProvider         (JWT storage + useAuth())
 *   - App (router)
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setBaseURL } from '@secure-exam/api-client';
import { AuthProvider, handleUnauthorized } from './contexts/AuthContext';
import { configurePersistence } from './persistence';
import App from './App';
import './index.css';

// Configure the API client's base URL from Vite's VITE_API_BASE_URL env var.
// Must run before any API call can be made.
setBaseURL(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000');

// Must run before the persistence layer is first used.
configurePersistence({ onUnauthorized: handleUnauthorized });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry once on failure; exam data rarely changes mid-session.
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
