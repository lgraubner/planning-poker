export type Identity = { id: string; name: string; spectator: boolean };

type Key = 'id' | 'name' | 'spectator';

const participantId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function read(key: Key) {
  try {
    return localStorage.getItem(`poker.${key}`) || '';
  } catch {
    return '';
  }
}

export function remembered(key: Exclude<Key, 'id'>) {
  return read(key);
}

export function rememberedId() {
  const id = read('id');

  return participantId.test(id) ? id : '';
}

export function rememberedSpectator() {
  return read('spectator') === 'true';
}

export function remember(key: Exclude<Key, 'id'>, value: string) {
  try {
    localStorage.setItem(`poker.${key}`, value);
  } catch {}
}

export function identity(name: string, spectator: boolean): Identity {
  const id = rememberedId() || crypto.randomUUID();
  localStorage.setItem('poker.id', id);
  localStorage.setItem('poker.name', name);
  localStorage.setItem('poker.spectator', String(spectator));

  return { id, name, spectator };
}
