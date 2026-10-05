import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState, type ReactNode } from 'react';
import { ErrorMessage } from '../components/ErrorMessage';
import { ErrorPage } from '../components/ErrorPage';
import { JoinRoom } from '../components/JoinRoom';
import { PokerTable } from '../components/PokerTable';
import { ReconnectingToast } from '../components/ReconnectingToast';
import { RoomFooter } from '../components/RoomFooter';
import { RoomHeader } from '../components/RoomHeader';
import { SpectatorList } from '../components/SpectatorList';
import { useDelayed } from '../hooks/useDelayed';
import { identity, remember, remembered, type Identity } from '../identity';
import { useRoom, type Participant } from '../hooks/useRoom';

type RoomInfo = { title: string; available: boolean; reason?: string; missing?: boolean };

export const Route = createFileRoute('/$code')({
  loader: ({ params, abortController }) => lookup(params.code, abortController.signal),
  // A room left and entered again asks the server anew rather than showing a cached answer
  gcTime: 0,
  // RoomLoading holds back its text itself, so the router shows it at once and for no longer
  pendingMs: 0,
  pendingMinMs: 0,
  pendingComponent: () => <RoomLoading>Loading room…</RoomLoading>,
  component: RoomPage,
});

async function lookup(code: string, signal: AbortSignal): Promise<RoomInfo> {
  const id = remembered('id');

  for (let attempt = 0; ; attempt++) {
    // A network failure reads like any other failed response
    const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
      signal,
      headers: { 'X-Participant-ID': id },
    }).catch(() => Response.error());
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Only a room that does not exist makes a new one the way on
      return {
        title: '',
        available: false,
        reason: data.error || 'Could not load room',
        missing: response.status === 404,
      };
    }

    // A reload can arrive before the old tab's socket has finished closing
    if (data.available || !id || attempt === 3) {
      return data;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

function RoomPage() {
  const { code } = Route.useParams();
  return <RoomEntry key={code} code={code} />;
}

// The participant who entered, or why they could not
function enter(name: string, spectator: boolean): Identity | string {
  if (!name.trim() || [...name.trim()].length > 40 || /\p{Cc}/u.test(name)) {
    return 'Use 1–40 characters without control characters';
  }

  try {
    return identity(name.trim(), spectator);
  } catch {
    return 'Allow browser storage to remember your participant, then try again';
  }
}

function RoomEntry({ code }: { code: string }) {
  const info = Route.useLoaderData();
  const [entry, setEntry] = useState(() => {
    const savedName = remembered('name').trim();
    return info.available && savedName ? enter(savedName, remembered('spectator') === 'true') : '';
  });

  if (typeof entry === 'object') {
    return <Room code={code} participant={entry} />;
  }

  if (!info.available) {
    return (
      <UnavailableRoom
        message={info.reason || 'You cannot join this room right now'}
        missing={!!info.missing}
      />
    );
  }

  return (
    <JoinRoom
      title={info.title}
      error={entry}
      onJoin={(name, spectator) => setEntry(enter(name, spectator))}
    />
  );
}

function UnavailableRoom({ message, missing }: { message: string; missing: boolean }) {
  // The server's messages are sentences: the first heads the page, the rest explain it
  const [headline, ...rest] = message.split(/\.\s+/);
  return (
    <ErrorPage
      title={headline}
      description={rest.join('. ')}
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
      <ReconnectingToast connected={connected} />
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
