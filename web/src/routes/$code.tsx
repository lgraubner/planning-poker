import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import clsx from 'clsx';
import { ErrorMessage } from '../components/ErrorMessage';
import { ErrorPage } from '../components/ErrorPage';
import { JoinRoom } from '../components/JoinRoom';
import { PokerTable } from '../components/PokerTable';
import { RoomFooter } from '../components/RoomFooter';
import { RoomHeader } from '../components/RoomHeader';
import { SpectatorList } from '../components/SpectatorList';
import { useDelayed } from '../hooks/useDelayed';
import { identity, remember, remembered, type Identity } from '../identity';
import { useRoom, type Participant } from '../hooks/useRoom';

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
    const id = remembered('id');

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
        const savedName = remembered('name').trim();
        if (data.available && savedName) {
          join(savedName, remembered('spectator') === 'true');
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
    remember('name', name);
  }

  function spectate(spectator: boolean) {
    send('role', spectator ? 'spectator' : 'voter');
    remember('spectator', String(spectator));
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
      <RoomFooter
        deck={snapshot.deck}
        results={results.current}
        revealed={snapshot.revealed}
        spectating={spectating}
        estimate={own?.estimate}
        connected={connected}
        send={send}
      />
    </section>
  );
}
