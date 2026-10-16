import { card, createRoom, expect, join, test } from './fixtures';

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

test('the title field opens exactly over the title', async ({ page }) => {
  const url = await createRoom(page, 'Sprint planning');
  await join(page, url, 'Alice');
  const title = page.getByRole('button', {
    name: 'Sprint planning',
    exact: true,
  });
  const before = (await title.boundingBox())!;
  await title.click();
  const after = (await page.getByRole('textbox', { name: 'Room title' }).boundingBox())!;
  for (const side of ['x', 'y', 'width', 'height'] as const) {
    expect(after[side], side).toBeCloseTo(before[side], 0);
  }
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

  await page.getByRole('link', { name: 'Planning Poker' }).click();
  await page.getByRole('button', { name: 'Leave room' }).click();
  await expect(page).toHaveURL('/');
  await expect(page).toHaveTitle('Planning Poker');
});

test('a long name stays on one line and shows in full on hover', async ({
  page,
  newParticipant,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const name = 'Maximiliane Oberhuber-Schwarzenegger';
  const max = await newParticipant();
  await join(max, url, name);

  const label = card(page, name).getByText(name);
  await expect(label).toHaveAttribute('title', name);
  const lineHeight = await card(page, 'Alice')
    .getByText('Alice')
    .evaluate((e) => e.clientHeight);
  expect(await label.evaluate((e) => e.clientHeight)).toBe(lineHeight);
});

test('your own name stands out from the others', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  await join(bob, url, 'Bob');

  const look = (viewer: typeof page, name: string) =>
    card(viewer, name)
      .getByText(name, { exact: true })
      .evaluate((element) => {
        const { color, fontWeight } = getComputedStyle(element);
        return { color, fontWeight };
      });
  for (const [viewer, own, other] of [
    [page, 'Alice', 'Bob'],
    [bob, 'Bob', 'Alice'],
  ] as const) {
    const mine = await look(viewer, own);
    const theirs = await look(viewer, other);
    expect(mine.color).not.toBe(theirs.color);
    expect(Number(mine.fontWeight)).toBeGreaterThan(Number(theirs.fontWeight));
  }
});

test('a name edits in its own type, large enough that phones do not zoom', async ({
  page,
  hasTouch,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const font = (element: Element) => {
    const style = getComputedStyle(element);
    return { size: style.fontSize, weight: style.fontWeight, color: style.color };
  };
  const name = await page.getByRole('button', { name: 'Alice', exact: true }).evaluate(font);
  await page.getByRole('button', { name: 'Alice', exact: true }).click();
  const field = await page.getByRole('textbox', { name: 'Your name' }).evaluate(font);
  // Phones zoom in on a field under 16px, so touch screens get that much
  expect(field).toEqual({ ...name, size: hasTouch ? '16px' : name.size });
});

test('you can change your name for everyone and keep it', async ({ page, newParticipant }) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const bob = await newParticipant();
  const names: string[][] = [];
  bob.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) =>
      names.push(JSON.parse(String(payload)).participants?.map((p: { name: string }) => p.name)),
    ),
  );
  await join(bob, url, 'Bob');

  await page.getByRole('button', { name: 'Alice', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('  ');
  await page.getByRole('textbox', { name: 'Your name' }).press('Enter');
  await page.getByRole('button', { name: 'Alice', exact: true }).click();
  await page.getByRole('textbox', { name: 'Your name' }).fill('Alicia');
  await page.getByRole('textbox', { name: 'Your name' }).press('Enter');
  await expect(card(bob, 'Alicia')).toBeVisible();
  expect(names).toContainEqual(['Alicia', 'Bob']);
  await expect(bob.getByRole('button', { name: 'Alicia', exact: true })).toHaveCount(0);

  await createRoom(page, 'Retro');
  await expect(card(page, 'Alicia')).toBeVisible();
});
