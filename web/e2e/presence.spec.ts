import { card, createRoom, expect, join, test } from './fixtures';

test('a saved name rejoins automatically and tabs share one card', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');

  const secondTab = await page.context().newPage();
  await secondTab.goto(url);
  await expect(secondTab.getByRole('group', { name: 'Choose your card' })).toBeVisible();
  await expect(secondTab.getByLabel('Name', { exact: true })).toBeHidden();
  await secondTab.getByRole('button', { name: '5', exact: true }).click();
  await expect(page.getByRole('button', { name: '5', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await expect(page.getByRole('article')).toHaveCount(1);

  const visitor = await newParticipant();
  await visitor.goto(url);
  await expect(visitor.getByRole('heading', { name: 'Join Sprint planning' })).toBeVisible();
  await expect(visitor.getByRole('link', { name: 'Planning Poker' })).toHaveAttribute('href', '/');
  await expect(visitor.getByLabel('Name', { exact: true })).toBeVisible();
});

test('invalid names are rejected before joining', async ({ page }) => {
  const url = await createRoom(page);
  await page.goto(url);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your name');
  await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  const red = await page.getByRole('alert').evaluate((alert) => getComputedStyle(alert).color);
  await expect(page.getByLabel('Name', { exact: true })).toHaveCSS('border-top-color', red);
  await page.getByLabel('Name', { exact: true }).fill('x'.repeat(41));
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Use 1–40 characters without control characters',
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
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    const reconnect = sockets.length > 0;
    server.onMessage((message) =>
      reconnect ? void held.then(() => socket.send(message)) : socket.send(message),
    );
    sockets.push({
      close: () => Promise.all([socket.close(), server.close()]).then(() => {}),
    });
  });
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(card(page, 'Alice')).toHaveAccessibleName('Alice: selected');

  await sockets[0]!.close();
  await expect(page.getByText('Reconnecting…')).toBeVisible();
  release();
  await expect(page.getByText('Reconnecting…')).toBeHidden();
  expect(sockets).toHaveLength(2);
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a reconnect rejoins with your current name and role', async ({ page }) => {
  const url = await createRoom(page);
  const joins: { name: string; spectator?: boolean }[] = [];
  let confirmed: { name: string; spectator: boolean } | undefined;
  const sockets: { close: () => Promise<void> }[] = [];
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => {
      const parsed = JSON.parse(String(message));
      if (parsed.type === 'snapshot') {
        confirmed = parsed.participants.find((p: { id: string }) => p.id === parsed.self);
      }

      socket.send(message);
    });
    socket.onMessage((message) => {
      const parsed = JSON.parse(String(message));
      if (parsed.type === 'join') {
        joins.push(parsed);
      }

      server.send(message);
    });
    sockets.push({
      close: () => Promise.all([socket.close(), server.close()]).then(() => {}),
    });
  });
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: 'Spectators', exact: true }).click();
  await page.getByRole('button', { name: 'Watch as spectator' }).click();
  await page.getByRole('button', { name: '1 spectator' }).click();
  await page
    .getByRole('dialog', { name: 'Spectators' })
    .getByRole('button', { name: 'Alice' })
    .click();

  await page.getByLabel('Your name').fill('Alicia');
  await page.getByLabel('Your name').press('Enter');
  await expect
    .poll(() => confirmed)
    .toEqual(expect.objectContaining({ name: 'Alicia', spectator: true }));

  await sockets[0]!.close();
  await expect.poll(() => joins.length).toBe(2);
  expect(joins[1]).toEqual(expect.objectContaining({ name: 'Alicia', spectator: true }));
});

test('a server message of the wrong shape stops the room', async ({ page }) => {
  const url = await createRoom(page);
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) =>
      socket.send(JSON.stringify({ ...JSON.parse(String(message)), deck: '0, 1, 2' })),
    );
  });
  await page.goto(url);
  await page.getByLabel('Name', { exact: true }).fill('Alice');
  await page.getByRole('button', { name: 'Join', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Unable to join' })).toBeVisible();
  await expect(page.getByText('Invalid server response. Reload to rejoin')).toBeVisible();
});

test('a quick load never flashes the loader', async ({ page }) => {
  const url = await createRoom(page);
  await page.clock.install();
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.route('**/api/rooms/*', async (route) => {
    await held;
    await route.continue();
  });
  await page.goto(url);
  const status = page.getByRole('status');
  await expect(status).toBeAttached();
  await expect(status).toBeEmpty();

  await page.clock.runFor(300);
  await expect(status).toHaveText('Loading room…');
  release();
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
});

test('a missing room says so', async ({ page }) => {
  await page.goto('/abcdefgh');
  await expect(page.getByRole('heading', { name: 'Room not found', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Start a new room' }).click();
  await expect(page.getByLabel('Room title')).toBeVisible();
});

test('leaving a room by link or back button asks first', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const seen: string[][] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'snapshot') {
        seen.push(message.participants.map((p: { name: string }) => p.name));
      }
    }),
  );
  await join(bob, url, 'Bob');

  await page.getByRole('link', { name: 'Planning Poker' }).click();
  const dialog = page.getByRole('alertdialog', { name: 'Leave the room?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(url);
  await page.getByRole('button', { name: '5', exact: true }).click();
  await expect(card(bob, 'Alice')).toHaveAccessibleName('Alice: selected');
  expect(seen.at(-1)).toContain('Alice');

  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Stay' }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(url);
  await page.goBack();
  await dialog.getByRole('button', { name: 'Leave room' }).click();
  await expect(page).toHaveURL('/');
  await expect(card(bob, 'Alice')).toBeHidden();
  expect(seen.at(-1)).not.toContain('Alice');
});
