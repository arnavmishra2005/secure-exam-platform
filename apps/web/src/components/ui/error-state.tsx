// Owner: Person A — UI kit

import { RefreshCw } from 'lucide-react';
import { Alert } from './alert';
import { Button } from './button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert variant="destructive" title="Something went wrong">
      <p>{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw /> Try again
        </Button>
      )}
    </Alert>
  );
}
