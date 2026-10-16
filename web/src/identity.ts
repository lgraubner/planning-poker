export type Identity = { id: string; name: string; spectator: boolean };

type Key = 'id' | 'name' | 'spectator';

export function remembered(key: Key) {
  try {
    return localStorage.getItem(`poker.${key}`) || '';
  } catch {
    return '';
  }
}

export function rememberedSpectator() {
  return remembered('spectator') === 'true';
}

export function remember(key: Key, value: string) {
  try {
    localStorage.setItem(`poker.${key}`, value);
  } catch {}
}

export function identity(name: string, spectator: boolean): Identity {
  const id = localStorage.getItem('poker.id') || crypto.randomUUID();
  localStorage.setItem('poker.id', id);
  localStorage.setItem('poker.name', name);
  localStorage.setItem('poker.spectator', String(spectator));

  return { id, name, spectator };
}
