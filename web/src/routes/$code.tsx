import { createFileRoute } from '@tanstack/react-router';
import { useForm } from '@tanstack/react-form';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { Button } from '../components/Button';
import { CenteredSection } from '../components/CenteredSection';
import { ErrorMessage } from '../components/ErrorMessage';
import { ErrorPage } from '../components/ErrorPage';
import { HomeLink } from '../components/HomeLink';
import { Icon } from '../components/Icon';
import { EstimateCard } from '../components/EstimateCard';
import { Form } from '../components/Form';
import { PokerTable } from '../components/PokerTable';
import { RoomHeader, SpectatorList } from '../components/RoomHeader';
import { TextField } from '../components/TextField';
import {
  identity,
  rememberedID,
  rememberedName,
  rememberedSpectator,
  rememberName,
  rememberSpectator,
  useRoom,
  type Identity,
  type Participant,
} from '../room-connection';
import { useDelayed } from '../hooks/useDelayed';

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
  // Only a room that does not exist makes a new one the way on
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

        // A reload can arrive before the old tab's socket has finished closing
        if (!data.available && id && attempt < 3) {
          retry = setTimeout(() => void lookup(attempt + 1), 500);
          return;
        }

        if (abort.signal.aborted) {
          return;
        }

        setInfo(data);
        const savedName = rememberedName().trim();
        if (data.available && savedName) {
          join(savedName, rememberedSpectator());
        }
      } catch (cause) {
        if (!abort.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Could not load room.');
        }
      }
    }

    void lookup();
    return () => {
      abort.abort();
      clearTimeout(retry);
    };
  }, [code]);

  function join(name: string, spectator: boolean) {
    if (!name.trim() || [...name.trim()].length > 40 || /\p{Cc}/u.test(name)) {
      setJoinError('Use 1–40 characters without control characters');
      return;
    }

    try {
      setParticipant(identity(name.trim(), spectator));
    } catch {
      setJoinError('Allow browser storage to remember your participant, then try again');
    }
  }

  if (participant) {
    return <Room code={code} participant={participant} />;
  }

  if (error || info?.available === false) {
    return (
      <UnavailableRoom
        message={error || info?.reason || 'You cannot join this room right now.'}
        missing={missing}
      />
    );
  }

  if (!info) {
    return <RoomLoading>Loading room…</RoomLoading>;
  }

  return <JoinRoom title={info.title} error={joinError} onJoin={join} />;
}

function UnavailableRoom({ message, missing }: { message: string; missing: boolean }) {
  // The server's messages are sentences: the first heads the page, the rest explain it
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

function JoinRoom({
  title,
  error,
  onJoin,
}: {
  title: string;
  error: string;
  onJoin: (name: string, spectator: boolean) => void;
}) {
  const form = useForm({
    defaultValues: { name: rememberedName() },
    onSubmitMeta: { spectator: false },
    onSubmit: ({ value, meta }) => onJoin(value.name, meta.spectator),
  });

  return (
    <CenteredSection header={<HomeLink />}>
      <title>{`${title} | Planning Poker`}</title>
      <h1 className="text-3xl font-semibold tracking-tight wrap-anywhere select-text">
        Join {title}
      </h1>
      <p className="mt-2 leading-relaxed text-zinc-400 select-text">
        Choose a name so your team knows it's you.
      </p>
      <Form
        onSubmit={(event) => {
          event.preventDefault();
          // Enter submits with the first button, so it joins to vote
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          void form.handleSubmit({
            spectator: submitter?.getAttribute('value') === 'spectator',
          });
        }}
      >
        <form.Field
          name="name"
          validators={{
            onSubmit: ({ value }) => (value.trim() ? undefined : 'Enter your name'),
          }}
        >
          {(field) => (
            <TextField
              id="name"
              label="Name"
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
        <div className="flex flex-col gap-3">
          <Button>Join</Button>
          <p className="text-center text-sm text-zinc-400">
            or{' '}
            <button
              value="spectator"
              className="py-1 font-semibold text-indigo-400 hover:text-indigo-300"
            >
              watch as spectator
            </button>
          </p>
        </div>
        <ErrorMessage>{error}</ErrorMessage>
      </Form>
    </CenteredSection>
  );
}

function Room({ code, participant }: { code: string; participant: Identity }) {
  const { snapshot, connected, error, fatal, send } = useRoom(code, participant);
  const reconnecting = useDelayed(!connected);
  // The last revealed round, so the results can fade out after the votes are cleared
  const results = useRef<Participant[]>([]);

  if (fatal) {
    return <ErrorPage title="Unable to join" description={error} failed />;
  }

  if (!snapshot) {
    return <RoomLoading>Connecting to room…{error}</RoomLoading>;
  }

  const own = snapshot.participants.find((participant) => participant.id === snapshot.self);
  const spectating = !!own?.spectator;
  const spectators = snapshot.participants.filter((participant) => participant.spectator);

  if (snapshot.revealed) {
    results.current = snapshot.participants;
  }

  function renameSelf(name: string) {
    send('name', name);
    rememberName(name);
  }

  function spectate(spectator: boolean) {
    send('role', spectator ? 'spectator' : 'voter');
    rememberSpectator(spectator);
  }

  return (
    <section className="flex grow flex-col">
      <title>{`${snapshot.title} | Planning Poker`}</title>
      <RoomHeader
        title={snapshot.title}
        connected={connected}
        onRename={(title) => send('rename', title)}
        spectators={
          <SpectatorList
            spectators={spectators}
            self={snapshot.self}
            connected={connected}
            onRenameSelf={renameSelf}
            onSpectate={spectate}
          />
        }
      />
      {/* Stays mounted so it can fade out; `visibility` hides it from everyone once it has. */}
      <p
        role="status"
        className={clsx(
          'fixed top-4 left-1/2 z-30 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-amber-400/40 bg-surface px-4 py-2 text-sm text-zinc-100 shadow-lg shadow-black/40 transition-[opacity,filter,scale,translate,visibility] duration-300',
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
        participants={snapshot.participants.filter((participant) => !participant.spectator)}
        // A voter who turns spectator after the reveal still counts until the next round
        estimates={snapshot.participants.flatMap((participant) => participant.estimate ?? [])}
        deck={snapshot.deck}
        self={snapshot.self}
        connected={connected}
        revealed={snapshot.revealed}
        spectating={spectating}
        onReveal={() => send('reveal')}
        onRenameSelf={renameSelf}
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
          deck={snapshot.deck}
          connected={connected}
          estimate={own?.estimate}
          hidden={snapshot.revealed || spectating}
          send={send}
        />
      </div>
    </section>
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
