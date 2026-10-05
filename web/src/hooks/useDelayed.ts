import { useEffect, useState } from 'react';

/** True once `active` has held for `ms`, so a state that clears quickly never flashes. */
export function useDelayed(active: boolean, ms = 300) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), ms);
    return () => {
      clearTimeout(timer);
      setElapsed(false);
    };
  }, [active, ms]);
  return active && elapsed;
}
