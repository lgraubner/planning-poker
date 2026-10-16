import { clsx } from 'clsx';
import type { Participant } from '../hooks/useRoom';
import { maxNameLength } from '../labels';
import { Icon } from './Icon';
import { InlineEdit } from './InlineEdit';
import { Popover } from './Popover';

interface Props {
  spectators: Participant[];
  self: string;
  connected: boolean;
  onRenameSelf: (name: string) => void;
  onSpectate: (spectator: boolean) => void;
}

export function SpectatorList({ spectators, self, connected, onRenameSelf, onSpectate }: Props) {
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
          'flex h-8 items-center gap-1.5 rounded-md px-2 text-sm tabular-nums hover:bg-surface-raised data-popup-open:bg-surface-raised',
          watching
            ? 'font-semibold text-indigo-300'
            : 'text-zinc-400 hover:text-zinc-200 data-popup-open:text-zinc-200',
        )}
      >
        <Icon name="eye" />
        {count > 0 && count}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align="end" sideOffset={4} className="z-30">
          <Popover.Popup className="w-48">
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
                        maxLength={maxNameLength}
                        disabled={!connected}
                        onCommit={onRenameSelf}
                        className="block min-w-0 pr-4 text-left font-bold text-indigo-300"
                        // Touch screens get 16px, or phones zoom in on focus
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
              className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm outline-none hover:bg-surface-raised focus-visible:bg-surface-raised disabled:opacity-50 data-highlighted:bg-surface-raised [&>svg]:text-zinc-400"
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
