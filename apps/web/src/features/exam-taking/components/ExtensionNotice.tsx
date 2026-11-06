import { useEffect, useState } from 'react';

/** Announce each updated total briefly, without changing the server's expiry. */
export function ExtensionNotice({ minutes }: { minutes: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(minutes > 0);
    if (minutes <= 0) return;
    const timeout = window.setTimeout(() => setVisible(false), 30_000);
    return () => window.clearTimeout(timeout);
  }, [minutes]);
  return visible ? <span role="status" className="text-xs text-success">+{minutes} min added</span> : null;
}
