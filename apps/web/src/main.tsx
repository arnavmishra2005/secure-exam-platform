import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import { installAuthInterceptor } from './auth/session';
import { setupExamTaking } from './features/exam-taking/setup';
import { configureApi } from './lib/api';
import './index.css';

// Order matters: the API base URL and auth interceptor must exist before any
// request, and the exam client's persistence must be configured before first use.
configureApi();
installAuthInterceptor();
setupExamTaking();

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
