import clsx from 'clsx';
import { useDelayed } from '../hooks/useDelayed';

export function ReconnectingToast({ connected }: { connected: boolean }) {
  const reconnecting = useDelayed(!connected);

  return (
    <p
      role="status"
      className={clsx(
        'fixed top-4 left-1/2 z-30 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/40 bg-surface px-4 py-2 text-sm text-zinc-100 shadow-lg shadow-black/40 transition-[opacity,filter,scale,translate,visibility] duration-300',
        // The delays follow the property order above, so scale and translate wait out the fade
        reconnecting
          ? 'ease-[cubic-bezier(0.23,1,0.32,1)]'
          : 'invisible opacity-0 blur-xs ease-in-out delay-[0s,0s,300ms,300ms,0s] motion-safe:-translate-y-3 motion-safe:scale-95',
      )}
    >
      {/* Spins only while shown: an endless animation on a hidden toast never settles. */}
      <span
        aria-hidden="true"
        className={clsx(
          'size-4 shrink-0 rounded-full border-2 border-amber-400 border-t-transparent',
          reconnecting && 'motion-safe:animate-spin',
        )}
      />
      Reconnecting…
    </p>
  );
}
