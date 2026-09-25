import { useEffect, useRef, useState } from 'react';

export const deck = ['0', '1', '2', '3', '5', '8', '13', '21', '?', '☕'];
export type Identity = { id: string; name: string };
export type Participant = {
  id: string;
  name: string;
  connected: boolean;
  selected: boolean;
  estimate?: string;
};
export type Snapshot = {
  type: 'snapshot';
  title: string;
  round: number;
  revealed: boolean;
  self: string;
  participants: Participant[];
};
type Message = Snapshot | { type: 'error'; message: string; fatal: boolean };

export function rememberedName() {
  try {
    return localStorage.getItem('poker.name') || '';
  } catch {
    return '';
  }
}

export function rememberedID() {
  try {
    return localStorage.getItem('poker.id') || '';
  } catch {
    return '';
  }
}

export function identity(name: string): Identity {
  // Identity must survive refreshes. Surface blocked storage instead of silently
  // creating duplicate cards that cannot reconnect.
  const id = localStorage.getItem('poker.id') || crypto.randomUUID();
  localStorage.setItem('poker.id', id);
  localStorage.setItem('poker.name', name);
  return { id, name };
}

export function useRoom(code: string, participant: Identity) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let terminal = false;
    let delay = 500;
    let timer: ReturnType<typeof setTimeout>;
    const abort = new AbortController();
    setSnapshot(null);
    setFatal(false);
    setError('');
    setConnected(false);

    function scheduleReconnect() {
      if (disposed || terminal) return;
      timer = setTimeout(reconnect, delay);
      delay = Math.min(delay * 2, 10000);
    }

    async function reconnect() {
      if (disposed || terminal) return;
      try {
        const response = await fetch(`/api/rooms/${encodeURIComponent(code)}`, {
          signal: abort.signal,
          headers: { 'X-Participant-ID': participant.id },
        });
        if (response.status === 404) {
          terminal = true;
          setFatal(true);
          setError('Room not found. It may have expired or the server restarted.');
          return;
        }
        if (response.ok && !(await response.json()).available) {
          setError('Waiting for space in this room or your open-tab allowance. Retrying…');
          scheduleReconnect();
          return;
        }
      } catch {
        /* Network failure: keep retrying until the connection returns. */
      }
      if (disposed) return;
      connect();
    }

    function connect() {
      const url = new URL(`/api/rooms/${encodeURIComponent(code)}/ws`, location.href);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      socket.current = ws;
      ws.onopen = () => ws.send(JSON.stringify({ type: 'join', ...participant }));
      ws.onmessage = (event) => {
        if (disposed) return;
        try {
          const message: Message = JSON.parse(event.data);
          if (message.type === 'snapshot') {
            setSnapshot(message);
            setConnected(true);
            setError('');
            delay = 500;
          } else if (message.type === 'error') {
            setError(message.message);
            if (message.fatal) {
              terminal = true;
              setFatal(true);
              setConnected(false);
              ws.close();
            }
          }
        } catch {
          terminal = true;
          setFatal(true);
          setConnected(false);
          setError('Invalid server response. Reload to rejoin.');
          ws.close();
        }
      };
      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
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
      disposed = true;
      window.removeEventListener('pagehide', leave);
      clearTimeout(timer);
      abort.abort();
      socket.current?.close();
      socket.current = null;
    };
  }, [code, participant]);

  function send(type: 'select' | 'reveal' | 'reset', value?: string) {
    if (!connected || !snapshot || socket.current?.readyState !== WebSocket.OPEN) return;
    setError('');
    socket.current.send(JSON.stringify({ type, value, round: snapshot.round }));
  }

  return { snapshot, connected, error, fatal, send };
}
