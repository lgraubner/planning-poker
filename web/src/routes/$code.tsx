import { createFileRoute, Link } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { EstimateCard } from '../components/EstimateCard';
import { Form } from '../components/Form';
import { PageIntro } from '../components/PageIntro';
import { TextField } from '../components/TextField';
import { version } from '../../package.json';
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
        const data = await response.json();
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
    return <UnavailableRoom message={error || 'This room or your open-tab allowance is full.'} />;
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
  return (
    <p role="status" className="leading-relaxed text-zinc-400">
      {children}
    </p>
  );
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
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    if (!copyMessage) return;
    const timer = setTimeout(() => setCopyMessage(''), 3000);
    return () => clearTimeout(timer);
  }, [copyMessage]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopyMessage('Link copied');
    } catch {
      setCopyMessage('Copy the link from your address bar.');
    }
  }

  if (fatal) return <UnableToJoin error={error} />;
  if (!snapshot) return <RoomLoading>Connecting to room…{error}</RoomLoading>;

  const own = snapshot.participants.find((participant) => participant.id === snapshot.self);
  return (
    <section className="flex grow flex-col">
      <RoomHeader
        title={snapshot.title}
        connected={connected}
        copyMessage={copyMessage}
        onCopy={copyLink}
        onRename={(title) => send('rename', title)}
      />
      {!connected && (
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
        onInvite={copyLink}
      />
      {/* Both bars share one cell, so the footer keeps its height and the table stays put. */}
      <div className={controls}>
        <section
          aria-label="Round controls"
          className={`${controlsPanel} flex items-center justify-center border-t border-zinc-700 ${snapshot.revealed ? '' : 'invisible'}`}
        >
          <Button compact disabled={!connected} onClick={() => send('reset')}>
            Vote again
          </Button>
        </section>
        <EstimateControls
          connected={connected}
          estimate={own?.estimate}
          hidden={snapshot.revealed}
          send={send}
        />
      </div>
      <footer className="pb-2 text-xs text-zinc-500 sm:fixed sm:bottom-2 sm:left-4 sm:z-20">
        v{version} ·{' '}
        <a
          href="https://github.com/lgraubner/planning-poker/issues"
          target="_blank"
          rel="noreferrer"
          className="no-underline hover:underline"
        >
          Report a problem
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
  copyMessage,
  onCopy,
  onRename,
}: {
  title: string;
  connected: boolean;
  copyMessage: string;
  onCopy: () => void;
  onRename: (title: string) => void;
}) {
  // Only an open editor holds a draft, so renames by others show until you click.
  const [draft, setDraft] = useState<string | null>(null);

  function commit() {
    const next = draft?.trim();
    if (next && next !== title && !/\p{Cc}/u.test(next)) onRename(next);
    setDraft(null);
  }

  return (
    <header className="mb-2 grid min-h-11 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-3">
      <Link
        to="/"
        className="w-fit text-base font-medium whitespace-nowrap text-zinc-400 no-underline"
      >
        Planning Poker
      </Link>
      <h1 className="min-w-0 text-center text-lg leading-tight font-semibold tracking-tight">
        {draft === null ? (
          <button
            type="button"
            title="Rename room"
            disabled={!connected}
            onClick={() => setDraft(title)}
            className="max-w-full truncate border border-transparent px-[7px]"
          >
            {title}
          </button>
        ) : (
          <input
            aria-label="Room title"
            autoFocus
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
      <div className="relative justify-self-end whitespace-nowrap">
        <button
          type="button"
          onClick={onCopy}
          className="min-h-8 rounded-md border border-indigo-400 px-2.5 text-sm font-semibold text-indigo-400"
        >
          Copy room link
        </button>
        <span
          role="status"
          className={`${small} absolute top-full right-0 mt-1 w-max max-w-60 text-right`}
        >
          {copyMessage}
        </span>
      </div>
    </header>
  );
}

function PokerTable({
  participants,
  self,
  connected,
  revealed,
  onReveal,
  onInvite,
}: {
  participants: Participant[];
  self: string;
  connected: boolean;
  revealed: boolean;
  onReveal: () => void;
  onInvite: () => void;
}) {
  const hasVotes = participants.some((participant) => participant.selected);
  const allVoted =
    participants.length > 0 && participants.every((participant) => participant.selected);
  const current = participants.find((participant) => participant.id === self);
  const others = participants.filter((participant) => participant.id !== self);
  const sideCount = others.length >= 4 ? 2 : 0;
  const sides = others.slice(0, sideCount);
  const remaining = others.slice(sideCount);
  const bottomCount = Math.floor(Math.floor(remaining.length / 2) / 2) * 2;
  const top = remaining.slice(0, remaining.length - bottomCount);
  const bottomOthers = remaining.slice(top.length);
  const bottomMiddle = bottomOthers.length / 2;
  const bottom = current
    ? [...bottomOthers.slice(0, bottomMiddle), current, ...bottomOthers.slice(bottomMiddle)]
    : bottomOthers;

  return (
    <div className="grid min-h-96 w-full max-w-7xl grow grid-cols-[56px_minmax(0,1fr)_56px] grid-rows-[96px_132px_96px] content-center items-center justify-center gap-x-1.5 gap-y-6 self-center py-4 sm:grid-cols-[64px_minmax(200px,420px)_64px] sm:gap-x-3">
      {others.length === 0 ? (
        <div className="col-2 row-1 self-end text-center text-sm">
          <p className="mb-2">Feeling lonely?</p>
          <button
            type="button"
            onClick={onInvite}
            className="min-h-8 font-semibold text-indigo-400"
          >
            Copy room link
          </button>
        </div>
      ) : (
        <ParticipantRow participants={top} revealed={revealed} top />
      )}
      {sides[0] && (
        <div className="col-1 row-2">
          <ParticipantCard participant={sides[0]} revealed={revealed} />
        </div>
      )}
      <div
        className={`col-2 row-2 flex w-full flex-col items-center justify-center gap-3 self-stretch rounded-3xl bg-surface p-3 inset-ring transition-shadow duration-200 motion-reduce:transition-none sm:p-5 ${
          !revealed && allVoted ? 'inset-ring-indigo-400/50' : 'inset-ring-surface-raised'
        }`}
      >
        {!revealed && hasVotes ? (
          <Button compact disabled={!connected} onClick={onReveal}>
            Reveal cards
          </Button>
        ) : (
          <p role="status" className="text-center text-base font-bold text-zinc-200">
            {revealed ? 'Cards revealed' : 'Pick your card'}
          </p>
        )}
      </div>
      {sides[1] && (
        <div className="col-3 row-2">
          <ParticipantCard participant={sides[1]} revealed={revealed} />
        </div>
      )}
      <ParticipantRow participants={bottom} revealed={revealed} />
    </div>
  );
}

function ParticipantRow({
  participants,
  revealed,
  top = false,
}: {
  participants: Participant[];
  revealed: boolean;
  top?: boolean;
}) {
  return (
    <div
      className={`col-span-full flex w-full items-start justify-center-safe gap-2.5 overflow-x-auto px-2 py-1 ${top ? 'row-1' : 'row-3'}`}
    >
      {participants.map((participant) => (
        <ParticipantCard key={participant.id} participant={participant} revealed={revealed} />
      ))}
    </div>
  );
}

function ParticipantCard({
  participant,
  revealed,
}: {
  participant: Participant;
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

  return (
    <article
      aria-label={`${participant.name}: ${revealed ? participant.estimate || 'no estimate' : participant.selected ? 'selected' : 'not selected'}`}
      className="w-14 flex-none text-center sm:w-16"
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
      <p className="mt-2 mb-0.5 text-sm font-semibold wrap-anywhere">{participant.name}</p>
      {!participant.connected && <span className={small}>Reconnecting</span>}
    </article>
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
      className={`${controlsPanel} ${hidden ? 'invisible' : ''}`}
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
const cardFace =
  'absolute inset-0 flex items-center justify-center rounded-lg border-2 text-xl font-semibold text-indigo-400 select-none backface-hidden';
const controls = 'sticky bottom-0 z-10 grid w-full max-w-7xl self-center bg-background text-center';
const controlsPanel = 'col-start-1 row-start-1 pt-3.5 pb-2.5';
