import { useState, type CSSProperties } from 'react';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { consensus } from '../consensus';
import type { Participant } from '../hooks/useRoom';
import { Button } from './Button';
import { CopyLinkButton } from './CopyLinkButton';
import { ParticipantCard } from './ParticipantCard';

export function PokerTable({
  participants,
  estimates,
  deck,
  self,
  connected,
  revealed,
  spectating,
  onReveal,
  onRenameSelf,
}: {
  participants: Participant[];
  estimates: string[];
  deck: string[];
  self: string;
  connected: boolean;
  revealed: boolean;
  spectating: boolean;
  onReveal: () => void;
  onRenameSelf: (name: string) => void;
}) {
  const hasVotes = participants.some((participant) => participant.selected);
  const allVoted =
    participants.length > 0 && participants.every((participant) => participant.selected);

  const current = participants.find((participant) => participant.id === self);
  const result = revealed ? consensus(estimates, deck) : null;
  // A reveal that happened before you arrived is already over: no confetti for it
  const [arrivedRevealed, setArrivedRevealed] = useState(revealed);
  if (arrivedRevealed && !revealed) {
    setArrivedRevealed(false);
  }

  const others = participants.filter((participant) => participant.id !== self);
  // One seat a side from four others, two from nine: a full table of 12 sits 4, 2, 4, 2.
  // Past 12, long rows would reach the side seats, so everyone sits above or below.
  const sideCount = others.length >= 12 ? 0 : others.length >= 9 ? 4 : others.length >= 4 ? 2 : 0;
  const sides = others.slice(0, sideCount);
  const remaining = others.slice(sideCount);
  // The rows split evenly with you below, and the spare seat goes on top
  const bottomCount = Math.max(Math.floor((remaining.length + 1) / 2) - 1, 0);
  const top = remaining.slice(0, remaining.length - bottomCount);
  const bottomOthers = remaining.slice(top.length);
  const bottomMiddle = bottomOthers.length / 2;
  const bottom = current
    ? [...bottomOthers.slice(0, bottomMiddle), current, ...bottomOthers.slice(bottomMiddle)]
    : bottomOthers;

  return (
    <div
      // A crowded room stretches the table under its longest row: 90px a seat, less the sides
      style={
        {
          '--table': `${Math.max(320, Math.max(top.length, bottom.length) * 90 - 180)}px`,
        } as CSSProperties
      }
      className="grid min-h-96 w-full max-w-7xl grow grid-cols-[56px_minmax(0,1fr)_56px] grid-rows-[minmax(96px,auto)_132px_minmax(96px,auto)] content-center items-center justify-center gap-x-1.5 gap-y-6 self-center pt-4 sm:grid-cols-[84px_minmax(200px,var(--table))_84px] sm:grid-rows-[minmax(96px,auto)_140px_minmax(96px,auto)] sm:gap-x-4"
    >
      {others.length === 0 ? (
        <div className="col-2 row-1 self-end text-center text-sm">
          {/* Pulled into the button's padding, so label and link read as one. */}
          <p className="-mb-0.5 text-zinc-400">Invite your team</p>
          <CopyLinkButton statusClassName="left-1/2 -translate-x-1/2" />
        </div>
      ) : (
        <ParticipantRow participants={top} self={self} revealed={revealed} top />
      )}
      <SideSeats
        participants={sides.filter((_, i) => i % 2 === 0)}
        self={self}
        revealed={revealed}
      />
      <div
        className={clsx(
          'col-2 row-2 flex w-full flex-col items-center justify-center gap-3 self-stretch rounded-3xl bg-surface p-3 inset-ring transition-shadow duration-200 motion-reduce:transition-none sm:p-5',
          !revealed && allVoted ? 'inset-ring-indigo-400/50' : 'inset-ring-surface-raised',
        )}
      >
        {!revealed && hasVotes ? (
          <Button disabled={!connected} onClick={onReveal}>
            Reveal cards
          </Button>
        ) : result ? (
          <p role="status" className="text-center">
            {!result.discuss && <span className="sr-only">Proposed estimate </span>}
            <span
              className={clsx(
                'relative block leading-none font-bold text-white',
                result.discuss ? 'text-3xl' : 'text-5xl',
              )}
            >
              {result.agreement === 1 && !arrivedRevealed && <Confetti />}
              {/* The text fades in, not its parent: an animated filter or scale there would
                  trap the fixed confetti canvas in its box. */}
              <span
                className={clsx(
                  'relative inline-block',
                  !arrivedRevealed && 'motion-safe:animate-result-in',
                )}
              >
                {result.discuss ? 'Discuss!' : result.value}
              </span>
            </span>
            {!result.discuss && result.agreement !== null && (
              <>
                {' '}
                <span
                  className={clsx(
                    'mt-2 block text-sm text-zinc-400',
                    !arrivedRevealed && 'motion-safe:animate-result-in',
                  )}
                >
                  Agreement {Math.round(result.agreement * 100)}%
                </span>
              </>
            )}
          </p>
        ) : (
          <p role="status" className="text-center text-base font-bold text-zinc-200">
            {revealed ? 'Cards revealed' : spectating ? 'Waiting for votes' : 'Pick your card'}
          </p>
        )}
      </div>
      <SideSeats
        participants={sides.filter((_, i) => i % 2 === 1)}
        self={self}
        revealed={revealed}
        right
      />
      <ParticipantRow
        participants={bottom}
        self={self}
        revealed={revealed}
        connected={connected}
        onRenameSelf={onRenameSelf}
      />
    </div>
  );
}

// A fixed canvas painted before the number, so the burst starts behind it
function Confetti() {
  return (
    <canvas
      ref={burst}
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none fixed inset-0 size-full"
    />
  );
}

// Lives outside Confetti, so a re-render keeps the same ref and does not burst again
function burst(canvas: HTMLCanvasElement) {
  const fire = confetti.create(canvas, { resize: true, disableForReducedMotion: true });
  // Bursts with the number, once the 600ms card flip is over
  const timer = setTimeout(() => {
    const number = canvas.parentElement!.getBoundingClientRect();
    void fire({
      particleCount: 60,
      spread: 360,
      startVelocity: 25,
      origin: {
        x: (number.left + number.width / 2) / innerWidth,
        y: (number.top + number.height / 2) / innerHeight,
      },
    });
  }, 600);

  return () => {
    clearTimeout(timer);
    fire.reset();
  };
}

// Two stacked seats outgrow the table's height, so a side spans all three rows
function SideSeats({
  participants,
  self,
  revealed,
  right = false,
}: {
  participants: Participant[];
  self: string;
  revealed: boolean;
  right?: boolean;
}) {
  if (participants.length === 0) {
    return null;
  }

  return (
    <div className={clsx('row-span-3 row-start-1 flex flex-col gap-6', right ? 'col-3' : 'col-1')}>
      {participants.map((participant) => (
        <ParticipantCard
          key={participant.id}
          participant={participant}
          own={participant.id === self}
          revealed={revealed}
        />
      ))}
    </div>
  );
}

function ParticipantRow({
  participants,
  self,
  revealed,
  top = false,
  connected = false,
  onRenameSelf,
}: {
  participants: Participant[];
  self: string;
  revealed: boolean;
  top?: boolean;
  connected?: boolean;
  onRenameSelf?: (name: string) => void;
}) {
  return (
    <div
      className={clsx(
        // Seats flow as inline blocks so a crowded row wraps into lines of even length
        'col-span-full w-full px-2 py-1 text-center text-balance *:mx-[3px] *:my-1.5 *:inline-block *:align-top',
        top ? 'row-1 self-end' : 'row-3 self-start',
      )}
    >
      {participants.map((participant) => (
        <ParticipantCard
          key={participant.id}
          participant={participant}
          own={participant.id === self}
          revealed={revealed}
          connected={connected}
          onRename={onRenameSelf}
        />
      ))}
      {/* A spectator's row stays a seat high, so taking a seat does not move the table. */}
      {participants.length === 0 && (
        <div className="invisible">
          <ParticipantCard
            participant={{
              id: '',
              name: 'Seat',
              connected: true,
              selected: false,
              spectator: false,
            }}
            own={false}
            revealed={false}
          />
        </div>
      )}
    </div>
  );
}
