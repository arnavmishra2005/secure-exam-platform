// Owner: Person A

import { QueryClient } from '@tanstack/react-query';
import { getErrorStatus } from './errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      // Don't retry what retrying can't fix.
      retry: (failureCount, error) => {
        const status = getErrorStatus(error);
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: true,
    },
  },
});
