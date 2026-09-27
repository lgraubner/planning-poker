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

  const tableBefore = await card(bob, 'Alice').boundingBox();
  await bob.getByRole('button', { name: 'Reveal cards' }).click();
  await expect(card(bob, 'Alice')).toHaveAccessibleName('Alice: 8');
  // The deck and "Vote again" differ in height, which must not move the table.
  expect(await card(bob, 'Alice').boundingBox()).toEqual(tableBefore);
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: 8');
    await expect(card(viewer, 'Bob')).toHaveAccessibleName('Bob: no estimate');
    await expect(card(viewer, 'Bob').getByText('×')).toBeVisible();
    await expect(viewer.getByRole('group', { name: 'Choose your card' })).toBeHidden();
  }

  // Reset after the flip has settled, as people do, not while it is still turning.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.getByRole('button', { name: 'Vote again' }).click();
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: not selected');
    // The card keeps its face only while it turns back.
    await expect(card(viewer, 'Alice')).not.toContainText('8');
    await expect(card(viewer, 'Bob').getByText('×')).toBeHidden();
  }
  await expect(page.getByRole('button', { name: '8', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('joining a revealed room shows the cards without replaying the flip', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page, 'Friday sprint planning');
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: '8', exact: true }).click();
  await page.getByRole('button', { name: 'Reveal cards' }).click();

  const bob = await newParticipant();
  // Not join(): it waits for the card picker, which a revealed room hides.
  await bob.goto(url);
  await bob.getByLabel('Your name').fill('Bob');
  await bob.getByRole('button', { name: 'Join room' }).click();
  await expect(card(bob, 'Alice')).toContainText('8');
  // A replayed flip would still be turning for another 600ms.
  const flips = await bob.evaluate(
    () =>
      document
        .getAnimations()
        .filter((animation) => (animation as CSSAnimation).animationName === 'card-flip').length,
  );
  expect(flips).toBe(0);
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
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter your name.');
  await expect(page.getByLabel('Your name')).toHaveAttribute('aria-invalid', 'true');
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
  // The reconnect's snapshot waits, or it lands before the banner's delay runs out.
  let release = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    const reconnect = sockets.length > 0;
    server.onMessage((message) =>
      reconnect ? void held.then(() => socket.send(message)) : socket.send(message),
    );
    sockets.push({ close: () => Promise.all([socket.close(), server.close()]).then(() => {}) });
  });
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: '3', exact: true }).click();
  await expect(card(page, 'Alice')).toHaveAccessibleName('Alice: selected');

  await sockets[0].close();
  await expect(page.getByText('Reconnecting…')).toBeVisible();
  release();
  await expect(page.getByText('Reconnecting…')).toBeHidden();
  expect(sockets).toHaveLength(2);
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('a rename shows at once, before the server confirms it', async ({ page }) => {
  const url = await createRoom(page, 'Sprint planning');
  let hold = false;
  const held: string[] = [];
  await page.routeWebSocket(/\/ws$/, (socket) => {
    const server = socket.connectToServer();
    server.onMessage((message) => (hold ? held.push(String(message)) : socket.send(message)));
  });
  await join(page, url, 'Alice');

  hold = true;
  await page.getByRole('button', { name: 'Sprint planning', exact: true }).click();
  await page.getByRole('textbox', { name: 'Room title' }).fill('Retro');
  await page.getByRole('textbox', { name: 'Room title' }).press('Enter');
  await expect.poll(() => held.map((frame) => JSON.parse(frame).title)).toContain('Retro');
  await expect(page.getByRole('button', { name: 'Retro', exact: true })).toBeVisible();
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
  await expect(page.getByLabel('Your name')).toBeVisible();
});

test('buttons give way when pressed and centre their content', async ({ page }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const scale = (name: string) =>
    page.getByRole('button', { name, exact: true }).evaluate((b) => getComputedStyle(b).scale);
  const press = async (name: string) => {
    await page.getByRole('button', { name, exact: true }).hover();
    await page.mouse.down();
    await expect.poll(() => scale(name)).toBe('0.97');
    await page.mouse.up();
  };
  await press('3');
  await expect.poll(() => scale('3')).toBe('none');
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveCSS(
    'user-select',
    'none',
  );
  // Releasing clicks, so this one reveals the cards.
  await press('Reveal cards');

  const button = await page.getByRole('button', { name: 'Vote again' }).boundingBox();
  const icon = await page.getByRole('button', { name: 'Vote again' }).locator('svg').boundingBox();
  const above = icon!.y - button!.y;
  const below = button!.y + button!.height - (icon!.y + icon!.height);
  expect(Math.abs(above - below)).toBeLessThanOrEqual(0.5);
});

test('a missing room says so', async ({ page }) => {
  await page.goto('/abcdefgh');
  await expect(page.getByRole('heading', { name: 'Room not found.' })).toBeVisible();
});

test('a proxy error page reads as a plain message', async ({ page }) => {
  await page.route('**/api/rooms**', (route) =>
    route.fulfill({ status: 502, contentType: 'text/html', body: '<h1>Bad Gateway</h1>' }),
  );
  await page.goto('/');
  await page.getByLabel('Room title').fill('Sprint planning');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not create room.');

  await page.goto('/abcdefgh');
  await expect(page.getByRole('heading', { name: 'Could not load room.' })).toBeVisible();
});

test('the room link can be copied', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-specific.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const header = page.locator('header');
  const invite = page.getByText('Feeling lonely?').locator('..');

  await header.getByRole('button', { name: 'Copy room link' }).click();
  await expect(header.getByRole('button', { name: 'Link copied' })).toBeVisible();
  await expect(header.getByRole('status')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  // Only the clicked button confirms.
  await expect(invite.getByRole('button', { name: 'Copy room link' })).toBeVisible();
  await expect(invite.getByRole('status')).toBeEmpty();

  await page.evaluate(() => navigator.clipboard.writeText(''));
  await invite.getByRole('button', { name: 'Copy room link' }).click();
  await expect(invite.getByRole('button', { name: 'Link copied' })).toBeVisible();
  await expect(invite.getByRole('status')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  // The labels return, so the buttons can be used again.
  await expect(page.getByRole('button', { name: 'Copy room link' })).toHaveCount(2);
});

test('a room needs a title before it is created', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a room title.');
  await expect(page.getByLabel('Room title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL('/');

  await page.getByLabel('Room title').fill('Retro');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('anyone can rename the room for everyone', async ({ page, newParticipant }) => {
  const url = await createRoom(page, 'Sprint planning');
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const titles: string[] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => titles.push(JSON.parse(String(payload)).title)),
  );
  await join(bob, url, 'Bob');

  const rename = async (viewer: typeof page, from: string, to: string) => {
    await expect(viewer.getByRole('textbox', { name: 'Room title' })).toBeHidden();
    await viewer.getByRole('button', { name: from, exact: true }).click();
    await viewer.getByRole('textbox', { name: 'Room title' }).fill(to);
  };
  await rename(page, 'Sprint planning', 'Retro');
  await page.getByRole('textbox', { name: 'Room title' }).press('Enter');
  await expect(bob.getByRole('heading', { name: 'Retro' })).toBeVisible();
  await expect(bob).toHaveTitle('Retro | Planning Poker');
  expect(titles).toContain('Retro');

  await rename(bob, 'Retro', '  ');
  await bob.getByRole('textbox', { name: 'Room title' }).blur();
  await expect(bob.getByRole('heading', { name: 'Retro' })).toBeVisible();
  await rename(bob, 'Retro', 'Daily');
  await bob.getByRole('textbox', { name: 'Room title' }).press('Escape');
  await expect(bob.getByRole('heading', { name: 'Retro' })).toBeVisible();
  await rename(bob, 'Retro', 'Daily');
  await bob.getByRole('textbox', { name: 'Room title' }).blur();
  await expect(page.getByRole('heading', { name: 'Daily' })).toBeVisible();

  await expect(page.getByRole('link', { name: 'Report a problem' })).toHaveAttribute(
    'href',
    'https://github.com/lgraubner/planning-poker/issues',
  );
  await expect(page.getByText(/^v\d+\.\d+\.\d+/)).toBeVisible();
  await page.getByRole('link', { name: 'Planning Poker' }).click();
  await expect(page).toHaveURL('/');
  await expect(page).toHaveTitle('Planning Poker');
});

test('revealed cards show how many voted for each value', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  await join(bob, url, 'Bob');
  const carol = await newParticipant();
  await join(carol, url, 'Carol');

  await page.getByRole('button', { name: '5', exact: true }).click();
  await bob.getByRole('button', { name: '8', exact: true }).click();
  await carol.getByRole('button', { name: '5', exact: true }).click();
  await expect(card(page, 'Carol')).toHaveAccessibleName('Carol: selected');
  await expect(page.getByRole('list', { name: 'Results' })).toBeHidden();

  await page.getByRole('button', { name: 'Reveal cards' }).click();
  for (const viewer of [page, bob, carol]) {
    // In deck order, with only the values someone chose.
    const results = viewer.getByRole('list', { name: 'Results' }).getByRole('listitem');
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toHaveAccessibleName('5: 2 votes, most votes');
    await expect(results.nth(1)).toHaveAccessibleName('8: 1 vote');
    // The median card, with pairs on neighbouring cards counting half.
    await expect(viewer.getByRole('status').filter({ hasText: 'Proposed estimate' })).toHaveText(
      'Proposed estimate 5 Agreement 67%',
    );
    await expect(viewer.getByTestId('confetti')).toHaveCount(0);
  }

  await bob.getByRole('button', { name: 'Vote again' }).click();
  for (const viewer of [page, bob, carol]) {
    await expect(viewer.getByRole('list', { name: 'Results' })).toBeHidden();
  }

  // Estimates more than a card apart need talking through, not a number.
  await page.getByRole('button', { name: '3', exact: true }).click();
  await bob.getByRole('button', { name: '13', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');
  await page.getByRole('button', { name: 'Reveal cards' }).click();
  for (const viewer of [page, bob, carol]) {
    await expect(viewer.getByRole('status').filter({ hasText: 'Discuss!' })).toHaveText('Discuss!');
  }
});

test('full agreement throws confetti for everyone', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  await join(bob, url, 'Bob');

  await page.getByRole('button', { name: '5', exact: true }).click();
  await bob.getByRole('button', { name: '5', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');
  await page.getByRole('button', { name: 'Reveal cards' }).click();
  for (const viewer of [page, bob]) {
    await expect(viewer.getByRole('status').filter({ hasText: 'Proposed estimate' })).toHaveText(
      'Proposed estimate 5 Agreement 100%',
    );
    await expect(viewer.getByTestId('confetti')).toBeAttached();
  }

  // Someone arriving after the reveal missed the moment.
  const carol = await newParticipant();
  await carol.goto(url);
  await carol.getByLabel('Your name').fill('Carol');
  await carol.getByRole('button', { name: 'Join room' }).click();
  await expect(card(carol, 'Alice')).toHaveAccessibleName('Alice: 5');
  await expect(carol.getByTestId('confetti')).toHaveCount(0);
});
