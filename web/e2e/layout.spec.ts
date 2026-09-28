import { type Locator, type Page } from '@playwright/test';
import { card, createRoom, expect, join, test } from './fixtures';

// First names of every length, and one full name as the rare long one.
const [you, ...names] = [
  'Maximiliane',
  'Bo',
  'Siobhán',
  'Kim',
  'Christopher',
  'Jo',
  'Bartholomew',
  'Anh',
  'Guðrún',
  'Li',
  'Alexandra Konstantinopoulou-Richardson',
  'Eve',
];

// Everyone but you joins over a bare WebSocket: a browser context each would be slow.
async function joinOthers(page: Page, count: number) {
  const url = new URL(
    `${page
      .url()
      .replace(/^http/, 'ws')
      .replace(/\/([a-z0-9]{8})$/, '/api/rooms/$1/ws')}`,
  );
  const ip = `10.${Math.floor(Math.random() * 254) + 1}.0.1`;
  return Promise.all(
    Array.from({ length: count }, (_, i) => {
      // Node's WebSocket takes headers, the browser one does not.
      const socket = new WebSocket(url, { headers: { 'X-Forwarded-For': ip } } as never);
      return new Promise<WebSocket>((resolve, reject) => {
        socket.onopen = () =>
          socket.send(JSON.stringify({ type: 'join', id: crypto.randomUUID(), name: names[i] }));
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type !== 'snapshot') return reject(new Error(message.message));
          socket.onmessage = null;
          // Every other one picks a card, so the table shows both states.
          if (i % 2 === 0)
            socket.send(
              JSON.stringify({
                type: 'select',
                value: ['3', '5', '8'][i % 3],
                round: message.round,
              }),
            );
          resolve(socket);
        };
        socket.onerror = () => reject(new Error(`${names[i]} could not connect`));
      });
    }),
  );
}

async function lines(locator: Locator) {
  return locator.evaluate((element) =>
    Math.round(element.clientHeight / parseFloat(getComputedStyle(element).lineHeight)),
  );
}

async function expectSound(page: Page) {
  // Crowded rows scroll inside themselves, never the page.
  // Against the device width: a phone zooms out to fit, which would widen innerWidth too.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(await lines(page.getByRole('heading', { level: 1 }).getByRole('button'))).toBe(1);

  // Positions first: scrolling a row to reach a seat would shift its neighbours.
  // Only what is drawn counts: a card, and its name's text rather than the seat's full width.
  const seats = await page.getByRole('article').all();
  const parts = (
    await Promise.all(
      seats.map((seat) =>
        seat.evaluate((element) => {
          const label = element.querySelector('p')!;
          const range = document.createRange();
          range.selectNodeContents(label);
          // A cut-off name's text runs past its label, so clip it to what shows.
          const box = label.getBoundingClientRect();
          const text = range.getBoundingClientRect();
          const left = Math.max(text.left, box.left);
          const right = Math.min(text.right, box.right);
          const card = element.firstElementChild!.getBoundingClientRect();
          return [
            { x: card.x, y: card.y, width: card.width, height: card.height },
            { x: left, y: text.y, width: right - left, height: text.height },
          ].map((part) => ({ seat: element.getAttribute('aria-label'), ...part }));
        }),
      ),
    )
  ).flat();
  for (const [i, a] of parts.entries()) {
    for (const b of parts.slice(i + 1)) {
      if (a.seat === b.seat) continue;
      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      expect(apart, `${a.seat} overlaps ${b.seat}`).toBe(true);
    }
  }
  for (const seat of seats) {
    await expect(seat.getByRole('paragraph')).toHaveAttribute('title', /.+/);
    expect(await lines(seat.getByRole('paragraph'))).toBe(1);
    // Every seat can be scrolled into view, however full its row.
    await seat.scrollIntoViewIfNeeded();
    await expect(seat).toBeInViewport();
  }
  // Back to where people start, for the next screenshot.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) element.scrollLeft = 0;
    scrollTo(0, 0);
  });
}

test('a full room turns the thirteenth person away', async ({ page, newParticipant }, info) => {
  const url = await createRoom(page);
  await join(page, url, you);
  const others = await joinOthers(page, 11);
  try {
    // Over the socket, the server refuses a thirteenth seat.
    await expect(joinOthers(page, 1)).rejects.toThrow('This room is full.');
    // In the browser, they learn why before they get to the name form.
    const latecomer = await newParticipant();
    await latecomer.goto(url);
    await expect(latecomer.getByRole('heading', { name: 'This room is full.' })).toBeVisible();
    await expect(latecomer.getByLabel('Your name')).toBeHidden();
    await info.attach('full room', {
      body: await latecomer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    for (const socket of others) socket.close();
  }
});

// Top, left, right and bottom seats: your row is the bottom one, the other wide row the top.
function seating(page: Page) {
  return page.getByRole('article').evaluateAll((articles, you) => {
    const mine = articles.find((article) =>
      article.getAttribute('aria-label')!.startsWith(`${you}:`),
    )!;
    const centre = (element: Element) => {
      const { left, width } = element.getBoundingClientRect();
      return left + width / 2;
    };
    const counts = [0, 0, 0, 0];
    for (const article of articles) {
      const group = article.parentElement!;
      if (group === mine.parentElement) counts[3]++;
      else if (group.getBoundingClientRect().width > 200) counts[0]++;
      else counts[centre(group) < centre(mine) ? 1 : 2]++;
    }
    return counts;
  }, you);
}

// The seats for rooms of 1 to 12: rows split evenly, the spare seat going on top.
const expectedSeating = [
  [0, 0, 0, 1],
  [1, 0, 0, 1],
  [2, 0, 0, 1],
  [2, 0, 0, 2],
  [2, 1, 1, 1],
  [2, 1, 1, 2],
  [3, 1, 1, 2],
  [3, 1, 1, 3],
  [4, 1, 1, 3],
  [3, 2, 2, 3],
  [4, 2, 2, 3],
  [4, 2, 2, 4],
];

for (const [index, expected] of expectedSeating.entries()) {
  const total = index + 1;
  test(`a room of ${total} seats evenly and keeps its layout`, async ({ page }, info) => {
    const url = await createRoom(page);
    await join(page, url, you);
    const others = await joinOthers(page, total - 1);
    try {
      await expect(page.getByRole('article')).toHaveCount(total);
      expect(await seating(page)).toEqual(expected);
      await page.getByRole('button', { name: '5', exact: true }).click();
      await expect(card(page, you)).toHaveAccessibleName(/selected$/);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
      await info.attach('voting', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      await expectSound(page);

      await page.getByRole('button', { name: 'Reveal cards' }).click();
      await expect(page.getByRole('list', { name: 'Results' })).toBeVisible();
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
      await info.attach('revealed', {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      });
      await expectSound(page);
    } finally {
      for (const socket of others) socket.close();
    }
  });
}

test('a common name shows in full on a desktop', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Phones keep narrow seats so a full room fits.');
  const url = await createRoom(page);
  await join(page, url, 'Christopher');
  const label = card(page, 'Christopher').getByText('Christopher', { exact: true });
  expect(await label.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('the longest room title stays on one line', async ({ page }, info) => {
  // The longest title the server accepts.
  const title =
    'Quarterly refinement of the payments platform roadmap, including the checkout migration epic 2026-Q4';
  const url = await createRoom(page, title);
  await join(page, url, you);
  const heading = page.getByRole('heading', { level: 1 }).getByRole('button');
  await expect(heading).toHaveText(title);
  expect(await lines(heading)).toBe(1);
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await info.attach('room', { body: await page.screenshot(), contentType: 'image/png' });
});
