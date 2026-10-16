import { card, createRoom, expect, join, test } from '../../../../web/e2e/fixtures';
import { recordFrames, saveFrames, shot, snapshots } from './evidence';

test('round: estimate privately, reveal, reset, discuss', async ({ page, newParticipant }) => {
  const url = await createRoom(page, 'Verify round');
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const bobFrames = recordFrames(bob);
  await join(bob, url, 'Bob');
  await shot(bob, '01-joined');

  await page.getByRole('button', { name: '5', exact: true }).click();
  await expect(card(bob, 'Alice')).toHaveAccessibleName('Alice: selected');
  await bob.getByRole('button', { name: '5', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');
  await shot(bob, '02-both-selected-hidden');

  const leaked = snapshots(bobFrames).filter(
    (s) =>
      !s.revealed &&
      (s.participants as { id: string; estimate?: string }[]).some(
        (p) => p.id !== s.self && p.estimate,
      ),
  );
  expect(leaked).toEqual([]);

  await bob.getByRole('button', { name: 'Reveal cards' }).click();
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: 5');
    await expect(viewer.getByRole('status').filter({ hasText: 'Proposed estimate' })).toHaveText(
      'Proposed estimate 5 Agreement 100%',
    );
  }

  await shot(bob, '03-revealed-agreement');
  const revealed = snapshots(bobFrames).findLast((s) => s.revealed);
  expect(revealed?.participants).toEqual(
    expect.arrayContaining([expect.objectContaining({ name: 'Alice', estimate: '5' })]),
  );

  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.getByRole('button', { name: 'Reset round' }).click();
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: not selected');
    await expect(viewer.getByRole('list', { name: 'Results' })).toBeHidden();
  }

  await expect
    .poll(() => snapshots(bobFrames).at(-1))
    .toEqual(expect.objectContaining({ revealed: false, round: (revealed?.round as number) + 1 }));

  await page.getByRole('button', { name: '3', exact: true }).click();
  await bob.getByRole('button', { name: '13', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');
  await page.getByRole('button', { name: 'Reveal cards' }).click();
  await expect(bob.getByRole('status').filter({ hasText: 'Discuss!' })).toHaveText('Discuss!');
  await shot(bob, '04-discuss');

  await saveFrames('bob', bobFrames);
});
