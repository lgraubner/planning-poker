import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

function clientIP() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `10.${part()}.${part()}.${part()}`;
}

export const test = base.extend<{ newParticipant: () => Promise<Page> }>({
  // Playwright requires the object pattern even when a fixture uses no others
  // oxlint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => use({ 'X-Forwarded-For': clientIP() }),
  newParticipant: async (
    { browser, contextOptions, baseURL, viewport, isMobile, hasTouch, userAgent },
    use,
  ) => {
    const contexts: BrowserContext[] = [];
    await use(async () => {
      const context = await browser.newContext({
        ...contextOptions,
        baseURL,
        viewport,
        isMobile,
        hasTouch,
        userAgent,
        extraHTTPHeaders: { 'X-Forwarded-For': clientIP() },
      });
      contexts.push(context);

      return context.newPage();
    });

    await Promise.all(contexts.map((context) => context.close()));
  },
});
export { expect };

export async function createRoom(page: Page, title = 'Sprint planning', deck?: string) {
  await page.goto('/');
  await page.getByLabel('Room title').fill(title);
  if (deck) {
    const select = page.getByRole('combobox', { name: 'Estimation deck' });
    await select.click();
    await page.getByRole('option', { name: deck }).click();
    await expect(select).toContainText(deck);
  }

  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page).toHaveURL(/\/[a-z0-9]{8}$/);

  return page.url();
}

export async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Choose your card' })).toBeVisible();
}

export interface SnapshotFrame {
  title: string;
  round: number;
  deck: string[];
  revealed: boolean;
  self: string;
  participants: {
    id: string;
    name: string;
    connected: boolean;
    selected: boolean;
    spectator: boolean;
    estimate?: string;
  }[];
}

export function snapshotFrames(page: Page) {
  const frames: SnapshotFrame[] = [];
  page.on('websocket', (socket) =>
    socket.on('framereceived', ({ payload }) => {
      const message = JSON.parse(String(payload));
      if (message.type === 'snapshot') {
        frames.push(message);
      }
    }),
  );

  return frames;
}

export const card = (page: Page, name: string) =>
  page.getByRole('article', { name: new RegExp(`^${name}:`) });
