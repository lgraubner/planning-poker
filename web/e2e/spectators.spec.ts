import { card, createRoom, expect, join, test } from './fixtures';

test('spectators watch from beside the table and can switch to voting', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  let bobFrame: { name: string; spectator: boolean } | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'snapshot') {
        bobFrame = message.participants.find((p: { name: string }) => p.name !== 'Alice');
      }
    }),
  );
  await page.reload();
  await expect(page.getByRole('group', { name: 'Choose your card' })).toBeVisible();
  // A cancelled animation, like a menu closing early, rejects; it has settled all the same
  const settled = (viewer: typeof page) =>
    viewer.evaluate(() =>
      Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
    );

  const aliceBefore = await card(page, 'Alice').boundingBox();

  const bob = await newParticipant();
  await bob.goto(url);
  await bob.getByLabel('Name', { exact: true }).fill('Bob');
  await bob.getByRole('button', { name: 'Watch as spectator' }).click();
  await expect(bob.getByRole('group', { name: 'Choose your card' })).toBeHidden();
  await expect(bob.getByRole('status').filter({ hasText: 'Waiting for estimates' })).toBeVisible();
  for (const viewer of [page, bob]) {
    await viewer.getByRole('button', { name: '1 spectator' }).click();
    await expect(
      viewer.getByRole('dialog', { name: 'Spectators' }).getByRole('listitem'),
    ).toHaveText(['Bob']);

    await viewer.keyboard.press('Escape');
    await expect(card(viewer, 'Bob')).toBeHidden();
  }

  await expect.poll(() => bobFrame).toEqual(expect.objectContaining({ spectator: true }));
  await expect(bob.getByRole('button', { name: '1 spectator, including you' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1 spectator', exact: true })).toBeVisible();
  expect(await card(page, 'Alice').boundingBox()).toEqual(aliceBefore);

  await page.getByRole('button', { name: '8', exact: true }).click();
  await bob.getByRole('button', { name: 'Reveal cards' }).click();
  await expect(card(bob, 'Alice')).toHaveAccessibleName('Alice: 8');
  await settled(bob);
  await bob.getByRole('button', { name: 'Reset round' }).click();

  await bob.getByRole('button', { name: '1 spectator' }).click();
  const list = bob.getByRole('dialog', { name: 'Spectators' });
  await settled(bob);
  const listBefore = await list.boundingBox();
  await list.getByRole('button', { name: 'Bob' }).click();
  expect((await list.boundingBox())?.height).toBe(listBefore?.height);
  await bob.getByLabel('Your name').fill('Robert');
  await bob.getByLabel('Your name').press('Enter');
  await bob.keyboard.press('Escape');
  await page.getByRole('button', { name: '1 spectator' }).click();
  await expect(page.getByRole('dialog', { name: 'Spectators' }).getByRole('list')).toHaveText(
    'Robert',
  );

  await page.keyboard.press('Escape');
  await expect.poll(() => bobFrame?.name).toBe('Robert');

  await page.getByRole('button', { name: '1 spectator' }).click();
  await expect(page.getByRole('button', { name: 'Take a seat' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Watch as spectator' })).toBeVisible();
  await page.keyboard.press('Escape');
  await settled(bob);
  const aliceSeat = await card(bob, 'Alice').boundingBox();
  await bob.getByRole('button', { name: '1 spectator, including you' }).click();
  await bob.getByRole('button', { name: 'Take a seat' }).click();
  await expect(bob.getByRole('group', { name: 'Choose your card' })).toBeVisible();
  await expect(card(page, 'Robert')).toHaveAccessibleName('Robert: not selected');
  await page.getByRole('button', { name: 'Spectators', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Spectators' })).toContainText('No spectators yet');
  await page.keyboard.press('Escape');
  await expect.poll(() => bobFrame).toEqual(expect.objectContaining({ spectator: false }));
  await settled(bob);
  expect(await card(bob, 'Alice').boundingBox()).toEqual(aliceSeat);
});

test('watching after the reveal keeps your estimate in the results', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  let bobFrame: { estimate?: string; spectator: boolean } | undefined;
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'snapshot') {
        bobFrame = message.participants.find((p: { name: string }) => p.name === 'Bob');
      }
    }),
  );
  await page.reload();
  const bob = await newParticipant();
  await join(bob, url, 'Bob');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await bob.getByRole('button', { name: '5', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal cards' }).click();
  const proposal = page.getByRole('status').filter({ hasText: 'Proposed estimate' });
  await expect(proposal).toHaveText('Proposed estimate 5 Agreement 50%');

  await bob.getByRole('button', { name: 'Spectators', exact: true }).click();
  await bob.getByRole('button', { name: 'Watch as spectator' }).click();
  await expect
    .poll(() => bobFrame)
    .toEqual(expect.objectContaining({ spectator: true, estimate: '5' }));

  await expect(card(page, 'Bob')).toBeHidden();
  await expect(
    page.getByRole('list', { name: 'Results' }).getByRole('listitem', { name: /^5:/ }),
  ).toHaveAccessibleName('5: 1 estimate');

  await expect(proposal).toHaveText('Proposed estimate 5 Agreement 50%');

  await page.getByRole('button', { name: 'Reset round' }).click();
  await expect.poll(() => bobFrame?.estimate).toBeUndefined();
});
