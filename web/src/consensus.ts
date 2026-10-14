export function consensus(estimates: string[], deck: string[]) {
  const numbers = deck.filter((value) => value !== '?' && value !== '☕');
  const positions = estimates
    .filter((estimate) => estimate !== '☕')
    .map((vote) => numbers.indexOf(vote));
  if (positions.length === 0) {
    return null;
  }

  const sorted = positions.filter((position) => position >= 0).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const value = median === undefined ? null : (numbers[median] ?? null);
  const discuss = sorted.length < positions.length || Math.max(...sorted) - Math.min(...sorted) > 1;
  if (positions.length < 2) {
    return { value, agreement: null, discuss };
  }

  let total = 0;
  let pairs = 0;
  for (const [i, a] of positions.entries()) {
    for (const b of positions.slice(i + 1)) {
      if (a >= 0 && b >= 0) {
        total += Math.max(0, 1 - Math.abs(a - b) / 2);
      }

      pairs++;
    }
  }

  return { value, agreement: total / pairs, discuss };
}
