import { createFileRoute } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import confetti from 'canvas-confetti';
import clsx from 'clsx';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { ErrorPage } from '../components/ErrorPage';
import { HomeLink } from '../components/HomeLink';
import { EstimateCard } from '../components/EstimateCard';
import { Form } from '../components/Form';
import { PageIntro } from '../components/PageIntro';
import { TextField } from '../components/TextField';
import { consensus } from '../consensus';
import {
  identity,
  rememberedID,
  rememberedName,
  rememberName,
  useRoom,
  type Identity,
  type Participant,
} from '../room-connection';

export const Route = createFileRoute('/$code')({ component: RoomPage });

function RoomPage() {
  const { code } = Route.useParams();
  return <RoomEntry key={code} code={code} />;
}

function RoomEntry({ code }: { code: string }) {
  const [info, setInfo] = useState<{
    title: string;
    available: boolean;
    reason?: string;
  } | null>(null);
  const [error, setError] = useState('');
  // Only a room that does not exist makes a new one the way on.
  const [missing, setMissing] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [participant, setParticipant] = useState<Identity | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    let retry: ReturnType<typeof setTimeout>;
    const id = rememberedID();

    async function lookup(attempt = 0) {
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          signal: abort.signal,
          headers: { 'X-Participant-ID': id },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setMissing(response.status === 404);
          throw new Error(data.error || 'Could not load room.');
        }
        // A reload can arrive before the old tab's socket has finished closing.
        if (!data.available && id && attempt < 3) {
          retry = setTimeout(() => void lookup(attempt + 1), 500);
          return;
        }
        if (abort.signal.aborted) return;
        setInfo(data);
        const savedName = rememberedName().trim();
        if (data.available && savedName) join(savedName);
      } catch (cause) {
        if (!abort.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Could not load room.');
      }
    }

    void lookup();
    return () => {
      abort.abort();
      clearTimeout(retry);
    };
  }, [code]);

  function join(name: string) {
    if (!name.trim() || [...name.trim()].length > 40 || /\p{Cc}/u.test(name)) {
      setJoinError('Use 1–40 characters without control characters.');
      return;
    }
    try {
      setParticipant(identity(name.trim()));
    } catch {
      setJoinError('Allow browser storage to remember your participant, then try again.');
    }
  }

  if (participant) return <Room code={code} participant={participant} />;
  if (error || info?.available === false)
    return (
      <UnavailableRoom
        message={error || info?.reason || 'You cannot join this room right now.'}
        missing={missing}
      />
    );
  if (!info) return <RoomLoading>Loading room…</RoomLoading>;
  return <JoinRoom title={info.title} error={joinError} onJoin={join} />;
}

function UnavailableRoom({ message, missing }: { message: string; missing: boolean }) {
  // The server's messages are sentences: the first heads the page, the rest explain it.
  const [headline, ...rest] = message.split(/(?<=\.)\s+/);
  return (
    <ErrorPage
      title={headline}
      description={rest.join(' ')}
      home={missing ? 'Start a new room' : undefined}
      failed={!missing}
    />
  );
}

function RoomLoading({ children }: { children: ReactNode }) {
  const shown = useDelayed(true);
  return (
    <p role="status" className="leading-relaxed text-zinc-400">
      {shown && children}
    </p>
  );
}

/** True once `active` has held for `ms`, so a state that clears quickly never flashes. */
function useDelayed(active: boolean, ms = 300) {
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

function JoinRoom({
  title,
  error,
  onJoin,
}: {
  title: string;
  error: string;
  onJoin: (name: string) => void;
}) {
  const form = useForm({
    defaultValues: { name: rememberedName() },
    onSubmit: ({ value }) => onJoin(value.name),
  });

  return (
    <CenteredSection>
      <title>{`${title} | Planning Poker`}</title>
      <PageIntro
        eyebrow="You're invited"
        title={title}
        description="Choose a name so your team knows it's you."
      />
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => (value.trim() ? undefined : 'Enter your name.'),
          }}
        >
          {(field) => (
            <TextField
              id="name"
              label="Your name"
              name={field.name}
              error={field.state.meta.errors[0]}
              autoComplete="given-name"
              autoFocus
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(event) => field.handleChange(event.target.value)}
            />
          )}
        </form.Field>
        <Button>Join room</Button>
        <ErrorMessage>{error}</ErrorMessage>
      </Form>
    </CenteredSection>
  );
}

function Room({ code, participant }: { code: string; participant: Identity }) {
  const { snapshot, connected, error, fatal, send } = useRoom(code, participant);
  const reconnecting = useDelayed(!connected);
  // The last revealed round, so the results can fade out after the votes are cleared.
  const results = useRef<Participant[]>([]);

  if (fatal) return <ErrorPage title="Unable to join" description={error} failed />;
  if (!snapshot) return <RoomLoading>Connecting to room…{error}</RoomLoading>;

  const own = snapshot.participants.find((participant) => participant.id === snapshot.self);
  if (snapshot.revealed) results.current = snapshot.participants;
  return (
    <section className="flex grow flex-col">
      <title>{`${snapshot.title} | Planning Poker`}</title>
      <RoomHeader
        title={snapshot.title}
        connected={connected}
        onRename={(title) => send('rename', title)}
      />
      {/* Stays mounted so it can fade out; `visibility` hides it from everyone once it has. */}
      <p
        role="status"
        className={clsx(
          'fixed top-4 left-1/2 z-30 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/40 bg-zinc-900 px-4 py-2 text-sm text-zinc-100 shadow-lg shadow-black/40 transition-[opacity,filter,scale,translate,visibility] duration-300',
          // Enters with a slide and scale but leaves with only a fade: scale and translate wait
          // out the fade (delays follow the property order above), then reset unseen.
          // The fade eases in and out; a strong ease-out would spend it in the first frames.
          reconnecting
            ? 'ease-[cubic-bezier(0.23,1,0.32,1)]'
            : 'invisible opacity-0 blur-xs ease-in-out [transition-delay:0s,0s,300ms,300ms,0s] motion-safe:-translate-y-3 motion-safe:scale-95',
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
      <ErrorMessage>{error}</ErrorMessage>
      <PokerTable
        participants={snapshot.participants}
        deck={snapshot.deck}
        self={snapshot.self}
        connected={connected}
        revealed={snapshot.revealed}
        onReveal={() => send('reveal')}
        onRenameSelf={(name) => {
          send('name', name);
          rememberName(name);
        }}
      />
      {/* Both bars share one cell, so the footer keeps its height and the table stays put.
          The results sit inside the sticky footer, so a scrolled table passes under them. */}
      <div className="sticky bottom-0 z-10 grid w-full max-w-7xl grid-cols-1 self-center bg-background text-center">
        <section
          aria-label="Round controls"
          className={clsx(
            'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] flex w-full max-w-xl min-w-0 flex-col items-center justify-self-center self-end',
            !snapshot.revealed && 'invisible opacity-0 blur-xs motion-safe:scale-95',
          )}
        >
          {/* Holds the results' height before the reveal, so the table stays put. */}
          <div className="flex min-h-26 max-w-full items-end pb-4">
            {results.current.length > 0 && (
              <Results participants={results.current} deck={snapshot.deck} />
            )}
          </div>
          <div className="w-full border-t border-zinc-700 py-4">
            <Button compact disabled={!connected} onClick={() => send('reset')}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
              >
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              Vote again
            </Button>
          </div>
        </section>
        <EstimateControls
          deck={snapshot.deck}
          connected={connected}
          estimate={own?.estimate}
          hidden={snapshot.revealed}
          send={send}
        />
      </div>
    </section>
  );
}

function RoomHeader({
  title,
  connected,
  onRename,
}: {
  title: string;
  connected: boolean;
  onRename: (title: string) => void;
}) {
  return (
    <header className="mb-2 grid min-h-11 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3">
      <HomeLink />
      <h1 className="min-w-0 text-center text-lg leading-tight font-semibold tracking-tight">
        {/* Button and field share one box, so the text stays put when editing starts. */}
        <InlineEdit
          value={title}
          label="Room title"
          maxLength={100}
          disabled={!connected}
          onCommit={onRename}
          className="inline-block max-w-full border border-transparent px-[7px] py-1 active:scale-none"
          inputClassName="field-sizing-content max-w-full min-w-16 px-[7px] py-1"
        />
      </h1>
      <CopyLinkButton
        className="justify-self-end"
        buttonClassName="rounded-md border border-indigo-400 px-2.5 text-sm hover:bg-indigo-400/10"
        statusClassName="right-0 text-right"
      />
    </header>
  );
}

/** Text that turns into a field when clicked, for a value anyone may change at any time. */
function InlineEdit({
  value,
  label,
  maxLength,
  disabled,
  onCommit,
  className,
  inputClassName,
}: {
  value: string;
  label: string;
  maxLength: number;
  disabled: boolean;
  onCommit: (value: string) => void;
  className: string;
  inputClassName: string;
}) {
  // Only an open editor holds a draft, so changes by others show until you click.
  const [draft, setDraft] = useState<string | null>(null);
  // Shows a sent change until the server's value moves off the one it replaced.
  // ponytail: a change lost to a dropped socket shows until the value next changes.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const shown = pending?.from === value ? pending.to : value;

  function commit() {
    const next = draft?.trim();
    if (next && next !== shown && !/\p{Cc}/u.test(next)) {
      onCommit(next);
      setPending({ from: value, to: next });
    }
    setDraft(null);
  }

  return draft === null ? (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setDraft(shown)}
      className={clsx('group', className)}
    >
      {/* Hugs the text, so the pencil sits the same distance from it whatever the button's padding. */}
      <span className="relative block">
        <span className="block truncate">{shown}</span>
        {/* Muted, so it reads as a hint beside the text rather than part of it. It shares the
            text's line, so it sits on the same baseline at any line height; sized in em to match
            each font, and centred on the capitals (about 0.7em tall). */}
        <span
          aria-hidden="true"
          className="absolute top-0 left-full ml-[0.3em] text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <svg
            viewBox="0 0 24 24"
            className="inline size-[0.85em] align-[-0.075em] fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]"
          >
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            <path d="m15 5 4 4" />
          </svg>
        </span>
      </span>
    </button>
  ) : (
    <input
      aria-label={label}
      // A label to change in place, not a form to fill.
      autoComplete="off"
      autoFocus
      enterKeyHint="done"
      value={draft}
      maxLength={maxLength}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') setDraft(null);
      }}
      className={clsx(
        'rounded-md border border-zinc-700 bg-zinc-900 text-center outline-none focus:border-indigo-400',
        inputClassName,
      )}
    />
  );
}

function CopyLinkButton({
  className = '',
  buttonClassName = '',
  statusClassName,
}: {
  className?: string;
  buttonClassName?: string;
  statusClassName: string;
}) {
  const [result, setResult] = useState<'copied' | 'failed' | null>(null);
  const copied = result === 'copied';

  useEffect(() => {
    if (!result) return;
    const timer = setTimeout(() => setResult(null), 3000);
    return () => clearTimeout(timer);
  }, [result]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(location.href);
      setResult('copied');
    } catch {
      setResult('failed');
    }
  }

  return (
    <div className={clsx('relative whitespace-nowrap', className)}>
      <button
        type="button"
        onClick={copy}
        className={clsx(
          'min-h-8 font-semibold text-indigo-400 hover:text-indigo-300',
          buttonClassName,
        )}
      >
        {/* Both labels share one cell, so the button keeps the wider one's width. */}
        <span className="grid justify-items-center">
          <span
            className={clsx(
              'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]',
              copied && 'invisible opacity-0 blur-xs motion-safe:scale-95',
            )}
          >
            Copy room link
          </span>
          <span
            className={clsx(
              'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] inline-flex items-center gap-1',
              !copied && 'invisible opacity-0 blur-xs motion-safe:scale-95',
            )}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              {/* Draws itself in once the label has faded in. */}
              <path
                d="M4 12.5l5 5L20 6.5"
                pathLength={1}
                className={clsx(
                  '[stroke-dasharray:1] transition-[stroke-dashoffset] motion-reduce:transition-none',
                  copied
                    ? 'delay-75 duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] [stroke-dashoffset:0]'
                    : '[stroke-dashoffset:1]',
                )}
              />
            </svg>
            Link copied
          </span>
        </span>
      </button>
      <span
        role="status"
        className={clsx(
          'absolute top-full mt-1 w-max max-w-60 text-sm text-zinc-400',
          statusClassName,
          copied && 'sr-only',
        )}
      >
        {copied && 'Link copied'}
        {result === 'failed' && 'Copy the link from your address bar.'}
      </span>
    </div>
  );
}

function PokerTable({
  participants,
  deck,
  self,
  connected,
  revealed,
  onReveal,
  onRenameSelf,
}: {
  participants: Participant[];
  deck: string[];
  self: string;
  connected: boolean;
  revealed: boolean;
  onReveal: () => void;
  onRenameSelf: (name: string) => void;
}) {
  const hasVotes = participants.some((participant) => participant.selected);
  const allVoted =
    participants.length > 0 && participants.every((participant) => participant.selected);
  const current = participants.find((participant) => participant.id === self);
  const result = revealed
    ? consensus(
        participants.flatMap((participant) => participant.estimate ?? []),
        deck,
      )
    : null;
  // A reveal that happened before you arrived is already over: no confetti for it.
  const [arrivedRevealed, setArrivedRevealed] = useState(revealed);
  if (arrivedRevealed && !revealed) setArrivedRevealed(false);
  const others = participants.filter((participant) => participant.id !== self);
  // One seat a side from four others, two from nine: a full table of 12 sits 4, 2, 4, 2.
  // Past 12, long rows would reach the side seats, so everyone sits above or below.
  const sideCount = others.length >= 12 ? 0 : others.length >= 9 ? 4 : others.length >= 4 ? 2 : 0;
  const sides = others.slice(0, sideCount);
  const remaining = others.slice(sideCount);
  // The rows split evenly with you below, and the spare seat goes on top.
  const bottomCount = Math.max(Math.floor((remaining.length + 1) / 2) - 1, 0);
  const top = remaining.slice(0, remaining.length - bottomCount);
  const bottomOthers = remaining.slice(top.length);
  const bottomMiddle = bottomOthers.length / 2;
  const bottom = current
    ? [...bottomOthers.slice(0, bottomMiddle), current, ...bottomOthers.slice(bottomMiddle)]
    : bottomOthers;

  return (
    <div
      // A crowded room stretches the table under its longest row: 90px a seat, less the sides.
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
          <Button compact disabled={!connected} onClick={onReveal}>
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
              <span className="relative">{result.discuss ? 'Discuss!' : result.value}</span>
            </span>
            {!result.discuss && result.agreement !== null && (
              <>
                {' '}
                <span className="mt-2 block text-sm text-zinc-400">
                  Agreement {Math.round(result.agreement * 100)}%
                </span>
              </>
            )}
          </p>
        ) : (
          <p role="status" className="text-center text-base font-bold text-zinc-200">
            {revealed ? 'Cards revealed' : 'Pick your card'}
          </p>
        )}
      </div>
      <SideSeats
        participants={sides.filter((_, i) => i % 2 === 1)}
        self={self}
        revealed={revealed}
        right
      />
      {/* You always sit in the bottom row, so only it offers your name for editing. */}
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

// A fixed canvas painted before the number, so the burst starts behind it.
function Confetti() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const burst = confetti.create(canvas.current!, { resize: true, disableForReducedMotion: true });
    const number = canvas.current!.parentElement!.getBoundingClientRect();
    void burst({
      particleCount: 60,
      spread: 360,
      startVelocity: 25,
      origin: {
        x: (number.left + number.width / 2) / innerWidth,
        y: (number.top + number.height / 2) / innerHeight,
      },
    });
    return () => burst.reset();
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      data-testid="confetti"
      className="pointer-events-none fixed inset-0 size-full"
    />
  );
}

// Two stacked seats outgrow the table's height, so a side spans all three rows.
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
  if (participants.length === 0) return null;
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
        // Seats flow as inline blocks so a crowded row wraps into lines of even length.
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
    </div>
  );
}

function ParticipantCard({
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
  // "Vote again" clears the estimate at once, so keep the face until the card has turned back.
  const face = revealed && participant.selected ? participant.estimate || '' : '';
  const [shown, setShown] = useState(face);
  if (face && face !== shown) setShown(face);
  const unflipping = !face && !!shown;
  // A reveal that happened before you arrived is already over: show the face without turning it.
  const [arrivedRevealed, setArrivedRevealed] = useState(!!face);
  if (arrivedRevealed && !face) setArrivedRevealed(false);
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
            {/* Stays mounted so it fades out on "Vote again"; visibility flips once the fade ends. */}
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
                // "XXL" fills the card edge to edge at full size.
                (face || shown).length > 2 ? 'text-base' : 'text-xl',
              )}
            >
              {face || shown}
            </div>
          )}
        </div>
      </div>
      {own && onRename ? (
        // Holds the name's line while the field floats over it, so the seats stay put.
        <div className="relative mt-2 mb-0.5 h-5 text-sm">
          <InlineEdit
            value={participant.name}
            label="Your name"
            maxLength={40}
            disabled={!connected}
            onCommit={onRename}
            className="mx-auto block max-w-full font-bold text-indigo-300"
            // Grows with the name past the seat's width, and 16px so phones do not zoom in on focus.
            inputClassName="absolute top-1/2 left-1/2 z-10 field-sizing-content max-w-72 min-w-16 -translate-1/2 px-2 py-0.5 text-base"
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

function Results({ participants, deck }: { participants: Participant[]; deck: string[] }) {
  const counts = deck
    .map((value) => ({
      value,
      count: participants.filter((participant) => participant.estimate === value).length,
    }))
    .filter(({ count }) => count > 0);
  const max = Math.max(...counts.map(({ count }) => count));
  // A tie has no leader to point out.
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
