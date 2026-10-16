import { card, createRoom, expect, join, test } from './fixtures';

test('participants estimate privately, reveal together, and reset', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page, 'Friday sprint planning');
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const leaked: string[] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type !== 'snapshot' || message.revealed) {
        return;
      }

      for (const other of message.participants) {
        if (other.id !== message.self && other.estimate) {
          leaked.push(other.name);
        }
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
  expect(await card(bob, 'Alice').boundingBox()).toEqual(tableBefore);

  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: 8');
    await expect(card(viewer, 'Bob')).toHaveAccessibleName('Bob: no estimate');
    await expect(card(viewer, 'Bob').getByText('×')).toBeVisible();
    await expect(viewer.getByRole('group', { name: 'Choose your card' })).toBeHidden();
  }

  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  await page.getByRole('button', { name: 'Reset round' }).click();
  for (const viewer of [page, bob]) {
    await expect(card(viewer, 'Alice')).toHaveAccessibleName('Alice: not selected');
    await expect(card(viewer, 'Alice')).not.toContainText('8');
    await expect(card(viewer, 'Bob').getByText('×')).toBeHidden();
  }

  await expect(page.getByRole('button', { name: '8', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});

test('a room estimates with the deck it was created with', async ({ page, newParticipant }) => {
  const url = await createRoom(page, 'Roadmap sizing', 'T-shirt sizes');
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const snapshots: {
    deck: string[];
    revealed: boolean;
    participants: { estimate?: string }[];
  }[] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'snapshot') {
        snapshots.push(message);
      }
    }),
  );
  await join(bob, url, 'Bob');
  await expect(bob.getByRole('group', { name: 'Choose your card' }).getByRole('button')).toHaveText(
    ['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕'],
  );

  await page.getByRole('button', { name: 'M', exact: true }).click();
  await bob.getByRole('button', { name: 'Reveal cards' }).click();
  await expect(card(bob, 'Alice')).toHaveAccessibleName('Alice: M');
  await expect(bob.getByRole('status').filter({ hasText: 'Proposed estimate' })).toHaveText(
    'Proposed estimate M',
  );

  const revealed = snapshots.filter((snapshot) => snapshot.revealed).at(-1);
  expect(revealed?.deck).toEqual(['XS', 'S', 'M', 'L', 'XL', 'XXL', '?', '☕']);
  expect(revealed?.participants[0]?.estimate).toBe('M');
});

test('a room estimates with modified Fibonacci unless told otherwise', async ({
  page,
  newParticipant,
}) => {
  const fibonacci = ['0', '1', '2', '3', '5', '8', '13', '20', '40', '100', '?', '☕'];
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const decks: string[][] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'snapshot') {
        decks.push(message.deck);
      }
    }),
  );
  await join(bob, url, 'Bob');
  await expect(bob.getByRole('group', { name: 'Choose your card' }).getByRole('button')).toHaveText(
    fibonacci,
  );

  expect(decks.at(-1)).toEqual(fibonacci);
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
  await bob.goto(url);
  await bob.getByLabel('Name', { exact: true }).fill('Bob');
  await bob.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(card(bob, 'Alice')).toContainText('8');
  const flips = await bob.evaluate(
    () =>
      document
        .getAnimations()
        .filter(
          (animation) =>
            animation instanceof CSSAnimation && animation.animationName === 'card-flip',
        ).length,
  );
  expect(flips).toBe(0);
});

test('revealed cards show how many chose each value', async ({ page, newParticipant }) => {
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
    const results = viewer.getByRole('list', { name: 'Results' }).getByRole('listitem');
    await expect(results).toHaveCount(2);
    await expect(results.nth(0)).toHaveAccessibleName('5: 2 estimates, most estimates');
    await expect(results.nth(1)).toHaveAccessibleName('8: 1 estimate');
    await expect(viewer.getByRole('status').filter({ hasText: 'Proposed estimate' })).toHaveText(
      'Proposed estimate 5 Agreement 67%',
    );

    await expect(viewer.getByTestId('confetti')).toHaveCount(0);
  }

  await bob.getByRole('button', { name: 'Reset round' }).click();

  for (const viewer of [page, bob, carol]) {
    await expect(viewer.getByRole('list', { name: 'Results' })).toBeHidden();
  }

  await page.getByRole('button', { name: '3', exact: true }).click();
  await bob.getByRole('button', { name: '13', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');
  await page.getByRole('button', { name: 'Reveal cards' }).click();

  for (const viewer of [page, bob, carol]) {
    await expect(viewer.getByRole('status').filter({ hasText: 'Discuss!' })).toHaveText('Discuss!');
    const results = viewer.getByRole('list', { name: 'Results' }).getByRole('listitem');
    await expect(results.nth(0)).toHaveAccessibleName('3: 1 estimate');
    await expect(results.nth(1)).toHaveAccessibleName('13: 1 estimate');
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

  // An animated filter or scale on an ancestor would trap the burst in its box
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Proposed estimate' })
      .getByText('5', { exact: true }),
  ).toHaveCSS('opacity', '1');
  expect(await page.getByTestId('confetti').boundingBox()).toEqual({
    x: 0,
    y: 0,
    ...page.viewportSize(),
  });

  const carol = await newParticipant();
  await carol.goto(url);
  await carol.getByLabel('Name', { exact: true }).fill('Carol');
  await carol.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(card(carol, 'Alice')).toHaveAccessibleName('Alice: 5');
  await expect(carol.getByTestId('confetti')).toHaveCount(0);
});

test('the result lands as the cards finish turning', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  await join(bob, url, 'Bob');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await bob.getByRole('button', { name: '5', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');

  const frames = bob.evaluate(async () => {
    const frames: { flipping: boolean; result: number }[] = [];
    const end = performance.now() + 1500;
    while (performance.now() < end) {
      await new Promise(requestAnimationFrame);
      const result = [...document.querySelectorAll('[role="status"] span')]
        .filter((span) => span.textContent === '5')
        .at(-1);
      frames.push({
        flipping: document
          .getAnimations()
          .some(
            (animation) =>
              animation instanceof CSSAnimation &&
              animation.animationName === 'card-flip' &&
              animation.playState === 'running',
          ),
        result: result ? +getComputedStyle(result).opacity : 0,
      });
    }

    return frames;
  });
  await page.getByRole('button', { name: 'Reveal cards' }).click();
  const sampled = await frames;

  const flipped = sampled.findIndex(({ flipping }, i) => !flipping && sampled[i - 1]?.flipping);
  expect(flipped).toBeGreaterThan(0);
  expect(sampled.some(({ flipping, result }) => flipping && result === 0)).toBe(true);
  expect(sampled[flipped]?.result).toBe(1);
});

test('results stay clear of the table on a short screen', async ({ page, newParticipant }) => {
  await page.setViewportSize({ width: 390, height: 560 });
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  await join(bob, url, 'Bob');
  await page.getByRole('button', { name: '5', exact: true }).click();
  await bob.getByRole('button', { name: '8', exact: true }).click();
  await expect(card(page, 'Bob')).toHaveAccessibleName('Bob: selected');
  const before = await card(page, 'Alice').boundingBox();

  await page.getByRole('button', { name: 'Reveal cards' }).click();
  const results = page.getByRole('list', { name: 'Results' });
  await expect(results).toBeVisible();
  expect(await card(page, 'Alice').boundingBox()).toEqual(before);
  const list = (await results.boundingBox())!;
  const footer = (await page.getByRole('region', { name: 'Round controls' }).boundingBox())!;
  expect(list.y).toBeGreaterThanOrEqual(footer.y);
  expect(list.y + list.height).toBeLessThanOrEqual(footer.y + footer.height);
});

test('the deck and the results fade into each other', async ({ page }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: '5', exact: true }).click();

  const fade = async (button: string) => {
    const frames = page.evaluate(async () => {
      const region = (name: string) =>
        document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;

      const frames: { deck: number; round: number; bars: number }[] = [];
      const end = performance.now() + 1000;
      while (performance.now() < end) {
        await new Promise(requestAnimationFrame);
        frames.push({
          deck: +getComputedStyle(region('Estimate controls')).opacity,
          round: +getComputedStyle(region('Round controls')).opacity,
          bars: region('Round controls').querySelectorAll('li').length,
        });
      }

      return frames;
    });

    await page.getByRole('button', { name: button }).click();
    return frames;
  };

  const between = (value: number) => value > 0 && value < 1;

  const reveal = await fade('Reveal cards');
  expect(reveal.some(({ deck }) => between(deck))).toBe(true);
  expect(reveal.some(({ round }) => between(round))).toBe(true);

  const again = await fade('Reset round');
  expect(again.some(({ deck }) => between(deck))).toBe(true);
  expect(again.filter(({ round }) => between(round)).every(({ bars }) => bars === 1)).toBe(true);
  expect(again.some(({ round }) => between(round))).toBe(true);
});
