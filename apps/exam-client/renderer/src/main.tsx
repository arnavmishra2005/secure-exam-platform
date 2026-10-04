import React from 'react';
import ReactDOM from 'react-dom/client';
import { setAccessToken } from '@secure-exam/api-client';
import App from './App';
import './index.css';

// Configure the shared api-client to point at the correct backend.
// In Vite, env vars are exposed via import.meta.env.
// The api-client defaults to http://localhost:3000 when NEXT_PUBLIC_API_URL is absent.
// We just leave it at default since the Vite proxy routes /api → 3000.

// Restore token from localStorage if present (so page refresh doesn't log out)
const storedToken = localStorage.getItem('access_token');
if (storedToken) {
  setAccessToken(storedToken);
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
