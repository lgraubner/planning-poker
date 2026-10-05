import { type Locator, type Page } from '@playwright/test';
import { card, createRoom, expect, join, test } from './fixtures';

// First names of every length, and one full name as the rare long one
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
  'Priya',
  'Tomasz',
  'Ngozi',
  'Sven',
  'Yuki',
  'Mateo',
  'Fatima',
  'Oskar',
  'Leilani',
  'Dmitri',
  'Ines',
  'Kwame',
  'Hana',
  'Rafael',
  'Zoë',
  'Aleksandra',
  'Finn',
  'Mei',
];

// Everyone but you joins over a bare WebSocket: a browser context each would be slow
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
      // Node's WebSocket takes headers, the browser one does not
      const socket = new WebSocket(url, { headers: { 'X-Forwarded-For': ip } } as never);
      return new Promise<WebSocket>((resolve, reject) => {
        socket.onopen = () =>
          socket.send(JSON.stringify({ type: 'join', id: crypto.randomUUID(), name: names[i] }));
        socket.onmessage = (event) => {
          const message = JSON.parse(String(event.data));
          if (message.type !== 'snapshot') {
            return reject(new Error(message.message));
          }

          socket.onmessage = null;
          // Every other one picks a card, so the table shows both states
          if (i % 2 === 0) {
            socket.send(
              JSON.stringify({
                type: 'select',
                value: ['3', '5', '8'][i % 3],
                round: message.round,
              }),
            );
          }

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
  // Crowded rows wrap, never widening the page.
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
          // Your own name is a button, so you can change it
          const label = element.querySelector('p, button')!;
          const range = document.createRange();
          range.selectNodeContents(label);
          // A cut-off name's text runs past its label, so clip it to what shows
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
      if (a.seat === b.seat) {
        continue;
      }

      const apart =
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y;
      expect(apart, `${a.seat} overlaps ${b.seat}`).toBe(true);
    }
  }

  for (const seat of seats) {
    // Others' names show in full on hover; your own is yours to know
    for (const name of await seat.getByRole('paragraph').all()) {
      await expect(name).toHaveAttribute('title', /.+/);
    }

    expect(await lines(seat.locator('p, button'))).toBe(1);
    await seat.scrollIntoViewIfNeeded();
    await expect(seat).toBeInViewport();
  }

  // Back to where people start, for the next screenshot
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) {
      element.scrollLeft = 0;
    }

    scrollTo(0, 0);
  });
}

// A full-page shot leaves the sticky deck over a tall room: grow the window to the page instead
async function wholePage(page: Page) {
  const size = page.viewportSize()!;
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ ...size, height });
  const shot = await page.screenshot();
  await page.setViewportSize(size);

  return shot;
}

test('a full room turns the thirty-first person away', async ({ page, newParticipant }, info) => {
  const url = await createRoom(page);
  await join(page, url, you);
  const others = await joinOthers(page, 29);

  try {
    await expect(joinOthers(page, 1)).rejects.toThrow('This room is full');
    // In the browser, they learn why before they get to the name form
    const latecomer = await newParticipant();
    await latecomer.goto(url);
    await expect(
      latecomer.getByRole('heading', { name: 'This room is full', exact: true }),
    ).toBeVisible();

    await expect(latecomer.getByLabel('Name', { exact: true })).toBeHidden();
    // A new room is no answer to a full one
    await expect(latecomer.getByRole('link', { name: 'Start a new room' })).toBeHidden();
    await info.attach('full room', {
      body: await latecomer.screenshot(),
      contentType: 'image/png',
    });
  } finally {
    for (const socket of others) {
      socket.close();
    }
  }
});

// Waits out every running animation. One cut short, like a hover lift the click retargets,
// has nothing left to wait for.
function settled(page: Page) {
  return page.evaluate(() =>
    Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {}))),
  );
}

// Top, left, right and bottom seats: your row is the bottom one, the other wide row the top
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
      if (group === mine.parentElement) {
        counts[3]++;
      } else if (group.getBoundingClientRect().width > 200) {
        counts[0]++;
      } else {
        counts[centre(group) < centre(mine) ? 1 : 2]++;
      }
    }

    return counts;
  }, you);
}

// The seats for rooms of 1 to 30: rows split evenly, the spare seat going on top.
// From 13, long rows would reach the side seats, so everyone sits above or below.
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
  ...Array.from({ length: 18 }, (_, i) => [
    Math.ceil((i + 13) / 2),
    0,
    0,
    Math.floor((i + 13) / 2),
  ]),
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
      await settled(page);
      await info.attach('voting', {
        body: await wholePage(page),
        contentType: 'image/png',
      });

      await expectSound(page);

      await page.getByRole('button', { name: 'Reveal cards' }).click();
      await expect(page.getByRole('list', { name: 'Results' })).toBeVisible();
      await settled(page);
      await info.attach('revealed', {
        body: await wholePage(page),
        contentType: 'image/png',
      });

      await expectSound(page);
    } finally {
      for (const socket of others) {
        socket.close();
      }
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
  // The longest title the server accepts
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

test('phones give the room title a line of its own', async ({ page, isMobile }) => {
  const url = await createRoom(page, 'Friday sprint planning session');
  await join(page, url, you);
  const title = (await page.getByRole('heading', { level: 1 }).boundingBox())!;
  const menu = (await page.getByRole('button', { name: 'Menu' }).boundingBox())!;
  if (isMobile) {
    expect(title.y).toBeGreaterThanOrEqual(menu.y + menu.height);
  } else {
    expect(title.y).toBeLessThan(menu.y + menu.height);
  }

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Friday sprint planning session',
  );

  // Not cut short with an ellipsis
  const text = page.getByRole('heading', { level: 1 }).getByText('Friday sprint planning session');
  expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
});

test('a small room fits the window without scrolling', async ({ page }) => {
  const url = await createRoom(page);
  await join(page, url, you);
  await joinOthers(page, 1);
  await expect(page.getByRole('article')).toHaveCount(2);
  const overflow = () => page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  expect(await overflow()).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: 'Reveal cards' }).click();
  await expect(page.getByRole('list', { name: 'Results' })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test('the card deck sits at the bottom of the window', async ({ page }) => {
  const url = await createRoom(page);
  await join(page, url, you);
  // The deck shares its cell with the taller round controls, so it must hug the cell's bottom
  const gap = await page.getByRole('group', { name: 'Choose your card' }).evaluate((element) => {
    const cell = element.closest('section')!.parentElement!.getBoundingClientRect();
    return cell.bottom - element.getBoundingClientRect().bottom;
  });
  expect(gap).toBeLessThan(16);
});
