import { useState } from 'react';
import clsx from 'clsx';
import type { Participant } from '../hooks/useRoom';
import { useDelayed } from '../hooks/useDelayed';
import { InlineEdit } from './InlineEdit';

export function ParticipantCard({
  participant,
  own,
  revealed,
  connected = false,
  onRename,
}: {
  participant: Participant;
  own: boolean;
  revealed: boolean;
  connected?: boolean;
  onRename?: (name: string) => void;
}) {
  // "Vote again" clears the estimate at once, so keep the face until the card has turned back
  const face = revealed && participant.selected ? participant.estimate || '' : '';
  const [shown, setShown] = useState(face);
  if (face && face !== shown) {
    setShown(face);
  }

  const unflipping = !face && !!shown;
  // A reveal that happened before you arrived is already over: show the face without turning it
  const [arrivedRevealed, setArrivedRevealed] = useState(!!face);
  if (arrivedRevealed && !face) {
    setArrivedRevealed(false);
  }

  const reconnecting = useDelayed(!participant.connected);

  return (
    <article
      aria-label={`${participant.name}: ${revealed ? participant.estimate || 'no estimate' : participant.selected ? 'selected' : 'not selected'}`}
      className="w-14 flex-none text-center sm:w-21"
    >
      <div aria-hidden="true" className="mx-auto h-18 w-12 perspective-midrange">
        <div
          onAnimationEnd={() => !face && setShown('')}
          className={clsx(
            'relative size-full transform-3d motion-reduce:[animation-duration:1ms]',
            face && '-rotate-y-180',
            face && !arrivedRevealed && 'animate-card-flip',
            !face && unflipping && 'animate-card-unflip',
          )}
        >
          <div
            className={clsx(
              'absolute inset-0 flex items-center justify-center rounded-lg border-2 text-xl font-semibold text-indigo-400 backface-hidden transition-colors duration-150 motion-reduce:transition-none',
              participant.selected
                ? 'border-indigo-400 bg-indigo-400'
                : 'border-surface-raised bg-surface-raised text-zinc-500',
            )}
          >
            <span
              className={clsx(
                'transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
                !(revealed && !participant.selected) &&
                  'invisible opacity-0 blur-xs motion-safe:scale-90',
              )}
            >
              ×
            </span>
          </div>
          {(face || shown) && (
            <div
              className={clsx(
                'absolute inset-0 flex items-center justify-center rounded-lg border-2 font-semibold text-indigo-400 backface-hidden rotate-y-180 border-indigo-400 bg-surface',
                // "XXL" fills the card edge to edge at full size
                (face || shown).length > 2 ? 'text-base' : 'text-xl',
              )}
            >
              {face || shown}
            </div>
          )}
        </div>
      </div>
      {own && onRename ? (
        // Holds the name's line while the field floats over it, so the seats stay put
        <div className="relative mt-2 mb-0.5 h-5 text-sm">
          <InlineEdit
            value={participant.name}
            label="Your name"
            maxLength={40}
            disabled={!connected}
            onCommit={onRename}
            className="mx-auto block max-w-full font-bold text-indigo-300"
            // Looks like the name it edits and grows with it past the seat's width. Touch screens
            // get 16px, or phones zoom in on focus.
            inputClassName="absolute top-1/2 left-1/2 z-10 field-sizing-content max-w-72 min-w-16 -translate-1/2 px-2 py-0.5 text-center font-bold text-indigo-300 pointer-coarse:text-base"
          />
        </div>
      ) : (
        <p
          title={participant.name}
          className={clsx(
            'mt-2 mb-0.5 truncate text-sm',
            own ? 'font-bold text-indigo-300' : 'font-semibold',
          )}
        >
          {participant.name}
        </p>
      )}
      {reconnecting && <span className="text-sm text-zinc-400">Reconnecting</span>}
    </article>
  );
}
