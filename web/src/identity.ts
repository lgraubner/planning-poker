export type Identity = { id: string; name: string; spectator: boolean };

type Key = 'id' | 'name' | 'spectator';

export function remembered(key: Key) {
  try {
    return localStorage.getItem(`poker.${key}`) || '';
  } catch {
    return '';
  }
}

export function remember(key: Key, value: string) {
  try {
    localStorage.setItem(`poker.${key}`, value);
  } catch {
    /* The room has the change; only the next visit misses it. */
  }
}

export function identity(name: string, spectator: boolean): Identity {
  // Identity must survive refreshes. Surface blocked storage instead of silently
  // creating duplicate cards that cannot reconnect.
  const id = localStorage.getItem('poker.id') || crypto.randomUUID();
  localStorage.setItem('poker.id', id);
  localStorage.setItem('poker.name', name);
  localStorage.setItem('poker.spectator', String(spectator));

  return { id, name, spectator };
}
