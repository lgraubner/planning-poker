import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { RoomStatusSchema } from '../api';
import type { Identity } from '../identity';

const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  connected: z.boolean(),
  selected: z.boolean(),
  spectator: z.boolean(),
  estimate: z.string().optional(),
});
const SnapshotSchema = z.object({
  type: z.literal('snapshot'),
  title: z.string(),
  round: z.number(),
  deck: z.array(z.string()),
  revealed: z.boolean(),
  self: z.string(),
  participants: z.array(ParticipantSchema),
});
const MessageSchema = z.discriminatedUnion('type', [
  SnapshotSchema,
  z.object({ type: z.literal('error'), message: z.string(), fatal: z.boolean() }),
]);

export type Participant = z.infer<typeof ParticipantSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;

type Command =
  | [type: 'reveal' | 'reset']
  | [type: 'select' | 'rename' | 'name', value: string]
  | [type: 'role', value: 'spectator' | 'voter'];

export function useRoom(code: string, participant: Identity) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [error, setError] = useState('');
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let stopped = false;
    let delay = 500;
    let timer: ReturnType<typeof setTimeout>;
    let self: Identity = participant;
    const abort = new AbortController();

    function fail(message: string) {
      stopped = true;
      setStatus('failed');
      setError(message);
    }

    function scheduleReconnect() {
      if (stopped) {
        return;
      }

      timer = setTimeout(reconnect, delay);
      delay = Math.min(delay * 2, 10000);
    }

    async function reconnect() {
      if (stopped) {
        return;
      }

      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          signal: abort.signal,
          headers: { 'X-Participant-ID': participant.id },
        });
        if (response.status === 404) {
          fail('Room not found. It may have expired or the server restarted');
          return;
        }

        const status = response.ok
          ? RoomStatusSchema.safeParse(await response.json()).data
          : undefined;
        if (status && !status.available) {
          setError(`${status.reason}. Retrying…`);
          scheduleReconnect();
          return;
        }
      } catch {}

      if (stopped) {
        return;
      }

      connect();
    }

    function connect() {
      const url = new URL(`/api/rooms/${encodeURIComponent(code)}/ws`, location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', ...self }));
      ws.onmessage = (event) => {
        if (stopped) {
          return;
        }

        try {
          const message = MessageSchema.parse(JSON.parse(event.data));
          if (message.type === 'snapshot') {
            const own = message.participants.find((p) => p.id === message.self);
            if (own) {
              self = { ...self, name: own.name, spectator: own.spectator };
            }

            setSnapshot(message);
            setStatus('connected');
            setError('');
            delay = 500;
          } else if (message.fatal) {
            fail(message.message);
            ws.close();
          } else {
            setError(message.message);
          }
        } catch {
          fail('Invalid server response. Reload to rejoin');
          ws.close();
        }
      };
      ws.onclose = () => {
        if (stopped) {
          return;
        }

        setStatus('connecting');
        scheduleReconnect();
      };
    }

    function leave() {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({ type: 'leave' }));
      }
    }

    window.addEventListener('pagehide', leave);
    connect();

    return () => {
      stopped = true;
      window.removeEventListener('pagehide', leave);
      clearTimeout(timer);
      abort.abort();
      leave();
      socket.current?.close();
      socket.current = null;
    };
  }, [code, participant]);

  function send(...[type, value]: Command) {
    if (status !== 'connected' || !snapshot || socket.current?.readyState !== WebSocket.OPEN) {
      return;
    }

    setError('');
    socket.current.send(JSON.stringify({ type, value, round: snapshot.round }));
  }

  return { snapshot, status, error, send };
}
