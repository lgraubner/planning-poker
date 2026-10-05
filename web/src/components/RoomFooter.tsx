import clsx from 'clsx';
import type { Participant, useRoom } from '../hooks/useRoom';
import { Button } from './Button';
import { EstimateCard } from './EstimateCard';
import { Icon } from './Icon';

export function RoomFooter({
  deck,
  results,
  revealed,
  spectating,
  estimate,
  connected,
  send,
}: {
  deck: string[];
  results: Participant[];
  revealed: boolean;
  spectating: boolean;
  estimate?: string;
  connected: boolean;
  send: ReturnType<typeof useRoom>['send'];
}) {
  // Both bars share one cell, so the footer keeps its height and the table stays put.
  // The results sit inside the sticky footer, so a scrolled table passes under them.
  return (
    <div className="sticky bottom-0 z-10 grid w-full max-w-7xl grid-cols-1 self-center bg-background text-center">
      <section
        aria-label="Round controls"
        className={clsx(
          'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] flex w-full max-w-xl min-w-0 flex-col items-center justify-self-center self-end',
          !revealed && 'invisible opacity-0 blur-xs motion-safe:scale-95',
        )}
      >
        {/* Holds the results' height before the reveal, so the table stays put. */}
        <div className="flex min-h-26 max-w-full items-end pb-4">
          {results.length > 0 && <Results participants={results} deck={deck} />}
        </div>
        <div className="w-full border-t border-zinc-700 py-4">
          <Button disabled={!connected} onClick={() => send('reset')}>
            <Icon>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </Icon>
            Vote again
          </Button>
        </div>
      </section>
      <EstimateControls
        deck={deck}
        connected={connected}
        estimate={estimate}
        hidden={revealed || spectating}
        send={send}
      />
    </div>
  );
}

function Results({ participants, deck }: { participants: Participant[]; deck: string[] }) {
  const counts = deck
    .map((value) => ({
      value,
      count: participants.filter((participant) => participant.estimate === value).length,
    }))
    .filter(({ count }) => count > 0);
  const max = Math.max(...counts.map(({ count }) => count));
  // A tie has no leader to point out
  const lead = counts.filter(({ count }) => count === max).length === 1 ? max : null;

  return (
    <ul
      aria-label="Results"
      className="flex max-w-full min-w-0 items-end gap-1.5 overflow-x-auto px-1"
    >
      {counts.map(({ value, count }) => (
        <li
          key={value}
          aria-label={`${value}: ${count} ${count === 1 ? 'vote' : 'votes'}${count === lead ? ', most votes' : ''}`}
          className="flex w-8 flex-none flex-col items-center"
        >
          <span className="text-xs text-zinc-400 tabular-nums">{count}</span>
          <div
            className={clsx(
              'mt-1 w-6 rounded-t-md',
              count === lead ? 'bg-indigo-400' : 'bg-indigo-400/30',
            )}
            style={{ height: `${(count / max) * 40}px` }}
          />
          <span className="mt-1.5 text-sm font-semibold text-zinc-100">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function EstimateControls({
  deck,
  connected,
  estimate,
  hidden,
  send,
}: {
  deck: string[];
  connected: boolean;
  estimate?: string;
  hidden: boolean;
  send: ReturnType<typeof useRoom>['send'];
}) {
  return (
    <section
      aria-label="Estimate controls"
      className={clsx(
        'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] self-end pt-3.5 pb-2.5',
        hidden && 'invisible opacity-0 blur-xs motion-safe:scale-95',
      )}
    >
      <div
        role="group"
        aria-label="Choose your card"
        className="flex justify-center-safe gap-2.5 overflow-x-auto px-1 pt-4 pb-2"
      >
        {deck.map((value) => (
          <EstimateCard
            key={value}
            value={value}
            selected={estimate === value}
            disabled={!connected}
            onClick={() => send('select', value)}
          />
        ))}
      </div>
    </section>
  );
}
