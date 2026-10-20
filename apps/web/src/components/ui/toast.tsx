// Owner: Person A — UI kit
// Toasts via sonner (the shadcn/ui default). Mount <Toaster /> once; call toast.* anywhere.

import { Toaster as Sonner } from 'sonner';

export { toast } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'font-sans text-sm' } }}
    />
  );
}
