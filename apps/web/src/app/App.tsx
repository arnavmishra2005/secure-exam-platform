// [SHARED] Providers, then the router.

import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { Toaster } from '@/components/ui/toast';
import { queryClient } from '@/lib/query-client';
import { router } from './router';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
        <Toaster />
      </AuthProvider>
    </QueryClientProvider>
  );
}
