import { card, createRoom, expect, join, test } from './fixtures';

test('participants estimate privately, reveal together, and vote again', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page, 'Friday sprint planning');
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  // The UI hides unrevealed estimates anyway, so check what actually reaches Bob.
  const leaked: string[] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type !== 'snapshot' || message.revealed) return;
      for (const other of message.participants) {
        if (other.id !== message.self && other.estimate) leaked.push(other.name);
      }
    }),
  );
  await join(bob, url, 'Bob');
  await expect(bob.getByRole('heading', { name: 'Friday sprint planning' })).toBeVisible();

  await page.getByRole('button', { name: '8', exact: true }).click();
  await expect(page.getByRole('button', { name: '8', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(card(bob, 'Alice')).toHaveAccessibleName('Alice: selected');
  await expect(card(bob, 'Alice')).not.toContainText('8');
  expect(leaked).toEqual([]);

  await bob.getByRole('button', { name: 'Reveal cards' }).click();
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: 8');
    await expect(card(viewer, 'Bob')).toHaveAccessibleName('Bob: no estimate');
    await expect(viewer.getByRole('group', { name: 'Choose your card' })).toBeHidden();
  }

  await page.getByRole('button', { name: 'Vote again' }).click();
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: not selected');
  }
  await expect(page.getByRole('button', { name: '8', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('a saved name rejoins automatically and tabs share one card', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');

  const secondTab = await page.context().newPage();
  await secondTab.goto(url);
  await expect(secondTab.getByRole('group', { name: 'Choose your card' })).toBeVisible();
  await expect(secondTab.getByLabel('Your name')).toBeHidden();
  await secondTab.getByRole('button', { name: '5', exact: true }).click();
  await expect(page.getByRole('button', { name: '5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('article')).toHaveCount(1);

  const visitor = await newParticipant();
  await visitor.goto(url);
  await expect(visitor.getByLabel('Your name')).toBeVisible();
});

test('invalid names are rejected before joining', async ({ page }) => {
  const url = await createRoom(page);
  await page.goto(url);
  await page.getByLabel('Your name').fill('x'.repeat(41));
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Use 1–40 characters without control characters.',
  );
});

test('a closed tab leaves the room', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  await join(bob, url, 'Bob');
  await expect(card(page, 'Bob')).toBeVisible();

  await bob.close();
  await expect(card(page, 'Bob')).toBeHidden();
});

test('a dropped connection reconnects and keeps the estimate', async ({ page }) => {
  const url = await createRoom(page);
  const sockets: { close: () => Promise<void> }[] = [];
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    sockets.push({ close: () => Promise.all([socket.close(), server.close()]).then(() => {}) });
  });
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(card(page, 'Alice')).toHaveAccessibleName('Alice: selected');

  await sockets[0].close();
  await expect(page.getByText('Reconnecting…')).toBeVisible();
  await expect(page.getByText('Reconnecting…')).toBeHidden();
  expect(sockets).toHaveLength(2);
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a missing room says so', async ({ page }) => {
  await page.goto('/abcdefgh');
  await expect(page.getByRole('heading', { name: 'Room not found.' })).toBeVisible();
});

test('the room link can be copied', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-specific.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: 'Copy room link' }).first().click();
  await expect(page.getByText('Link copied')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
});
