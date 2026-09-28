import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import confetti from 'canvas-confetti';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { EstimateCard } from '../components/EstimateCard';
import { Form } from '../components/Form';
import { PageIntro } from '../components/PageIntro';
import { TextField } from '../components/TextField';
import { consensus } from '../consensus';
import {
  deck,
  identity,
  rememberedID,
  rememberedName,
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
        if (!response.ok) throw new Error(data.error || 'Could not load room.');
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
      <UnavailableRoom message={error || info?.reason || 'You cannot join this room right now.'} />
    );
  if (!info) return <RoomLoading>Loading room…</RoomLoading>;
  return <JoinRoom title={info.title} error={joinError} onJoin={join} />;
}

function UnavailableRoom({ message }: { message: string }) {
  return (
    <CenteredSection>
      <h1 className={roomTitle}>{message}</h1>
      <p>
        <a href={location.pathname}>Check again</a>
      </p>
      <p>
        <Link to="/">Back home</Link>
      </p>
    </CenteredSection>
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

  if (fatal) return <UnableToJoin error={error} />;
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
      {reconnecting && (
        <p role="status" className="my-4 rounded-lg border px-4 py-3">
          Reconnecting… Controls will return when you're connected.
        </p>
      )}
      <ErrorMessage>{error}</ErrorMessage>
      <PokerTable
        participants={snapshot.participants}
        self={snapshot.self}
        connected={connected}
        revealed={snapshot.revealed}
        onReveal={() => send('reveal')}
      />
      {/* Both bars share one cell, so the footer keeps its height and the table stays put.
          The results sit inside the sticky footer, so a scrolled table passes under them. */}
      <div className={controls}>
        <section
          aria-label="Round controls"
          className={`${swap} flex w-full max-w-xl min-w-0 flex-col items-center justify-self-center self-end ${snapshot.revealed ? '' : swapOut}`}
        >
          {/* Holds the results' height before the reveal, so the table stays put. */}
          <div className="flex min-h-26 max-w-full items-end pb-4">
            {results.current.length > 0 && <Results participants={results.current} />}
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
          connected={connected}
          estimate={own?.estimate}
          hidden={snapshot.revealed}
          send={send}
        />
      </div>
      <footer className="pb-2 text-xs text-zinc-500 sm:fixed sm:bottom-2 sm:left-4 sm:z-20">
        <a
          href="https://github.com/lgraubner/planning-poker"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 no-underline transition-colors hover:text-zinc-200"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" className="size-4">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Source code
        </a>
      </footer>
    </section>
  );
}

function UnableToJoin({ error }: { error: string }) {
  return (
    <CenteredSection>
      <h1 className={roomTitle}>Unable to join</h1>
      <ErrorMessage>{error}</ErrorMessage>
      <Link to="/">Back home</Link>
      <p>
        <a href={location.pathname}>Try joining again</a>
      </p>
    </CenteredSection>
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
  // Only an open editor holds a draft, so renames by others show until you click.
  const [draft, setDraft] = useState<string | null>(null);
  // Shows a sent rename until the server's title moves off the one it replaced.
  // ponytail: a rename lost to a dropped socket shows until the title next changes.
  const [pending, setPending] = useState<{ from: string; to: string } | null>(null);
  const shown = pending?.from === title ? pending.to : title;

  function commit() {
    const next = draft?.trim();
    if (next && next !== shown && !/\p{Cc}/u.test(next)) {
      onRename(next);
      setPending({ from: title, to: next });
    }
    setDraft(null);
  }

  return (
    <header className="mb-2 grid min-h-11 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3">
      <Link
        to="/"
        className="w-fit text-base font-semibold whitespace-nowrap text-zinc-400 no-underline tracking-wide"
      >
        Planning Poker
      </Link>
      <h1 className="min-w-0 text-center text-lg leading-tight font-semibold tracking-tight">
        {draft === null ? (
          <button
            type="button"
            title="Rename room"
            disabled={!connected}
            onClick={() => setDraft(shown)}
            className="max-w-full truncate border border-transparent px-[7px] active:scale-none"
          >
            {shown}
          </button>
        ) : (
          <input
            aria-label="Room title"
            autoFocus
            enterKeyHint="done"
            value={draft}
            maxLength={100}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') setDraft(null);
            }}
            className="field-sizing-content max-w-full min-w-16 rounded-md text-center border border-zinc-700 bg-zinc-900 px-3 py-1 outline-none focus:border-indigo-400"
          />
        )}
      </h1>
      <CopyLinkButton
        className="justify-self-end"
        buttonClassName="rounded-md border border-indigo-400 px-2.5 text-sm"
        statusClassName="right-0 text-right"
      />
    </header>
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
    <div className={`relative whitespace-nowrap ${className}`}>
      <button
        type="button"
        onClick={copy}
        className={`min-h-8 font-semibold text-indigo-400 ${buttonClassName}`}
      >
        {/* Both labels share one cell, so the button keeps the wider one's width. */}
        <span className="grid justify-items-center">
          <span className={`${swap} ${copied ? swapOut : ''}`}>Copy room link</span>
          <span className={`${swap} inline-flex items-center gap-1 ${copied ? '' : swapOut}`}>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-4 fill-none stroke-current stroke-[2.5] [stroke-linecap:round] [stroke-linejoin:round]"
            >
              {/* Draws itself in once the label has faded in. */}
              <path
                d="M4 12.5l5 5L20 6.5"
                pathLength={1}
                className={`[stroke-dasharray:1] transition-[stroke-dashoffset] motion-reduce:transition-none ${
                  copied
                    ? 'delay-75 duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] [stroke-dashoffset:0]'
                    : '[stroke-dashoffset:1]'
                }`}
              />
            </svg>
            Link copied
          </span>
        </span>
      </button>
      <span
        role="status"
        className={`${small} absolute top-full mt-1 w-max max-w-60 ${statusClassName} ${
          copied ? 'sr-only' : ''
        }`}
      >
        {copied && 'Link copied'}
        {result === 'failed' && 'Copy the link from your address bar.'}
      </span>
    </div>
  );
}

function PokerTable({
  participants,
  self,
  connected,
  revealed,
  onReveal,
}: {
  participants: Participant[];
  self: string;
  connected: boolean;
  revealed: boolean;
  onReveal: () => void;
}) {
  const hasVotes = participants.some((participant) => participant.selected);
  const allVoted =
    participants.length > 0 && participants.every((participant) => participant.selected);
  const current = participants.find((participant) => participant.id === self);
  const result = revealed
    ? consensus(participants.flatMap((participant) => participant.estimate ?? []))
    : null;
  // A reveal that happened before you arrived is already over: no confetti for it.
  const [arrivedRevealed, setArrivedRevealed] = useState(revealed);
  if (arrivedRevealed && !revealed) setArrivedRevealed(false);
  const others = participants.filter((participant) => participant.id !== self);
  // One seat a side from four others, two from nine: a full room of 12 sits 4, 2, 4, 2.
  const sideCount = others.length >= 9 ? 4 : others.length >= 4 ? 2 : 0;
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
    <div className="grid min-h-96 w-full max-w-7xl grow grid-cols-[56px_minmax(0,1fr)_56px] grid-rows-[96px_132px_96px] content-center items-center justify-center gap-x-1.5 gap-y-6 self-center pt-4 sm:grid-cols-[84px_minmax(200px,320px)_84px] sm:grid-rows-[96px_140px_96px] sm:gap-x-4">
      {others.length === 0 ? (
        <div className="col-2 row-1 self-end text-center text-sm">
          <p className="mb-0.5">Feeling lonely?</p>
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
        className={`col-2 row-2 flex w-full flex-col items-center justify-center gap-3 self-stretch rounded-3xl bg-surface p-3 inset-ring transition-shadow duration-200 motion-reduce:transition-none sm:p-5 ${
          !revealed && allVoted ? 'inset-ring-indigo-400/50' : 'inset-ring-surface-raised'
        }`}
      >
        {!revealed && hasVotes ? (
          <Button compact disabled={!connected} onClick={onReveal}>
            Reveal cards
          </Button>
        ) : result ? (
          <p role="status" className="text-center">
            {!result.discuss && <span className="sr-only">Proposed estimate </span>}
            <span
              className={`relative block leading-none font-bold text-white ${result.discuss ? 'text-3xl' : 'text-5xl'}`}
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
      <ParticipantRow participants={bottom} self={self} revealed={revealed} />
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
    <div className={`row-span-3 row-start-1 flex flex-col gap-6 ${right ? 'col-3' : 'col-1'}`}>
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
}: {
  participants: Participant[];
  self: string;
  revealed: boolean;
  top?: boolean;
}) {
  return (
    <div
      className={`col-span-full flex w-full items-start justify-center-safe gap-1.5 overflow-x-auto px-2 py-1 ${top ? 'row-1' : 'row-3'}`}
    >
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

function ParticipantCard({
  participant,
  own,
  revealed,
}: {
  participant: Participant;
  own: boolean;
  revealed: boolean;
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
          className={`relative size-full transform-3d motion-reduce:[animation-duration:1ms] ${
            face
              ? `${arrivedRevealed ? '' : 'animate-card-flip'} -rotate-y-180`
              : unflipping
                ? 'animate-card-unflip'
                : ''
          }`}
        >
          <div
            className={`${cardFace} transition-colors duration-150 motion-reduce:transition-none ${
              participant.selected
                ? 'border-indigo-400 bg-indigo-400'
                : 'border-surface-raised bg-surface-raised text-zinc-500'
            }`}
          >
            {/* Stays mounted so it fades out on "Vote again"; visibility flips once the fade ends. */}
            <span
              className={`transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                revealed && !participant.selected
                  ? ''
                  : 'invisible opacity-0 blur-xs motion-safe:scale-90'
              }`}
            >
              ×
            </span>
          </div>
          {(face || shown) && (
            <div className={`${cardFace} rotate-y-180 border-indigo-400 bg-surface`}>
              {face || shown}
            </div>
          )}
        </div>
      </div>
      <p
        title={participant.name}
        className={`mt-2 mb-0.5 truncate text-sm ${own ? 'font-bold text-indigo-300' : 'font-semibold'}`}
      >
        {participant.name}
      </p>
      {reconnecting && <span className={small}>Reconnecting</span>}
    </article>
  );
}

function Results({ participants }: { participants: Participant[] }) {
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
            className={`mt-1 w-6 rounded-t-md ${count === lead ? 'bg-indigo-400' : 'bg-indigo-400/30'}`}
            style={{ height: `${(count / max) * 40}px` }}
          />
          <span className="mt-1.5 text-sm font-semibold text-zinc-100">{value}</span>
        </li>
      ))}
    </ul>
  );
}

function EstimateControls({
  connected,
  estimate,
  hidden,
  send,
}: {
  connected: boolean;
  estimate?: string;
  hidden: boolean;
  send: ReturnType<typeof useRoom>['send'];
}) {
  return (
    <section
      aria-label="Estimate controls"
      className={`${swap} ${controlsPanel} ${hidden ? swapOut : ''}`}
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

const roomTitle = 'text-2xl font-bold tracking-tight wrap-anywhere';
const small = 'text-sm text-zinc-400';
// Swaps a button label in place: the leaving one blurs out as the arriving one sharpens.
const swap =
  'col-start-1 row-start-1 transition-[opacity,filter,scale,visibility] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]';
const swapOut = 'invisible opacity-0 blur-xs motion-safe:scale-95';
const cardFace =
  'absolute inset-0 flex items-center justify-center rounded-lg border-2 text-xl font-semibold text-indigo-400 select-none backface-hidden';
const controls =
  'sticky bottom-0 z-10 grid w-full grid-cols-1 max-w-7xl self-center bg-background text-center';
const controlsPanel = 'self-end pt-3.5 pb-2.5';
