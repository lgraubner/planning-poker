import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';

// Room creation is rate limited per client IP. A distinct forwarded address per
// browser context keeps parallel tests from sharing one limit.
function clientIP() {
  const part = () => Math.floor(Math.random() * 254) + 1;
  return `10.${part()}.${part()}.${part()}`;
}

export const test = base.extend<{ newParticipant: () => Promise<Page> }>({
  // Playwright requires the object pattern even when a fixture uses no others.
  // oxlint-disable-next-line no-empty-pattern
  extraHTTPHeaders: async ({}, use) => use({ 'X-Forwarded-For': clientIP() }),
  // Each participant needs their own browser context: tabs in one context share an identity.
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

export async function createRoom(page: Page, title = 'Sprint planning') {
  await page.goto('/');
  await page.getByLabel('Room title').fill(title);
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page).toHaveURL(/\/[a-z0-9]{8}$/);
  return page.url();
}

export async function join(page: Page, url: string, name: string) {
  await page.goto(url);
  await page.getByLabel('Your name').fill(name);
  await page.getByRole('button', { name: 'Join room' }).click();
  await expect(page.getByRole('group', { name: 'Choose your card' })).toBeVisible();
}

export const card = (page: Page, name: string) =>
  page.getByRole('article', { name: new RegExp(`^${name}:`) });
