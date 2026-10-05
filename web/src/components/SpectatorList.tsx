import { Popover } from '@base-ui/react/popover';
import clsx from 'clsx';
import type { Participant } from '../hooks/useRoom';
import { Icon } from './Icon';
import { InlineEdit } from './InlineEdit';

/**
 * Spectators watch without a seat at the table. Usually there are none or one, so the bar
 * shows only how many, and opens their names. It turns your colour while you watch too.
 */
export function SpectatorList({
  spectators,
  self,
  connected,
  onRenameSelf,
  onSpectate,
}: {
  spectators: Participant[];
  self: string;
  connected: boolean;
  onRenameSelf: (name: string) => void;
  onSpectate: (spectator: boolean) => void;
}) {
  const count = spectators.length;
  const watching = spectators.some((spectator) => spectator.id === self);
  const label =
    count === 0
      ? 'Spectators'
      : `${count} ${count === 1 ? 'spectator' : 'spectators'}${watching ? ', including you' : ''}`;

  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={label}
        title={label}
        className={clsx(
          // A ghost button: quieter than the bar's outlined buttons, as it only informs
          'flex h-8 items-center gap-1.5 rounded-md px-2 text-sm tabular-nums hover:bg-surface-raised data-popup-open:bg-surface-raised',
          watching
            ? 'font-semibold text-indigo-300'
            : 'text-zinc-400 hover:text-zinc-200 data-popup-open:text-zinc-200',
        )}
      >
        <Icon name="eye" />
        {/* A zero reads like a broken counter, so an empty room shows the eye alone. */}
        {count > 0 && count}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={4} className="z-30">
          <Popover.Popup className="min-w-44 origin-(--transform-origin) rounded-lg border border-border bg-surface p-1 shadow-lg shadow-black/40 outline-none transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] data-ending-style:opacity-0 data-starting-style:opacity-0 motion-safe:data-ending-style:scale-95 motion-safe:data-starting-style:scale-95 w-48">
            <Popover.Title className="px-3 pt-2 pb-1 text-xs font-semibold text-zinc-400">
              Spectators
            </Popover.Title>
            {count === 0 ? (
              <p className="px-3 py-2 text-sm text-zinc-400">No spectators yet</p>
            ) : (
              <ul className="text-sm">
                {spectators.map((spectator) => (
                  <li
                    key={spectator.id}
                    title={spectator.name}
                    className={clsx(
                      'flex items-center gap-2.5 px-3 py-2 [&>svg]:text-zinc-400',
                      !spectator.connected && 'opacity-50',
                    )}
                  >
                    <Icon name="user" />
                    {spectator.id === self ? (
                      <InlineEdit
                        value={spectator.name}
                        label="Your name"
                        maxLength={40}
                        disabled={!connected}
                        onCommit={onRenameSelf}
                        // The padding holds the pencil, which hangs past a name cut short
                        className="block min-w-0 pr-4 text-left font-bold text-indigo-300"
                        // Looks like the name it edits, in its 20px line so the list keeps its height.
                        // Touch screens get 16px, or phones zoom in on focus. Pulled left by its
                        // padding and border, so the text starts where the name did.
                        inputClassName="-ml-[7px] h-5 field-sizing-content max-w-full min-w-16 px-1.5 leading-none font-bold text-indigo-300 pointer-coarse:text-base"
                      />
                    ) : (
                      <span className="min-w-0 truncate">{spectator.name}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="mx-1 my-1 border-t border-border" />
            <Popover.Close
              disabled={!connected}
              onClick={() => onSpectate(!watching)}
              className={clsx(
                'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-surface-raised [&>svg]:text-zinc-400',
                'w-full hover:bg-surface-raised focus-visible:bg-surface-raised disabled:opacity-50',
              )}
            >
              <Icon name={watching ? 'armchair' : 'eye'} />
              {watching ? 'Take a seat' : 'Watch as spectator'}
            </Popover.Close>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
