import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ExamContentApiProvider, type ExamContentApi } from '../api/ExamContentApi';

export function renderWithApi(ui: ReactElement, api: ExamContentApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExamContentApiProvider api={api}>{ui}</ExamContentApiProvider>
    </QueryClientProvider>,
  );
}
