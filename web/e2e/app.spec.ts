import { createRoom, expect, join, test } from './fixtures';

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

  await page.getByRole('button', { name: 'Alice', exact: true }).hover();
  await page.mouse.down();
  await page.waitForTimeout(200);
  expect(await scale('Alice')).toBe('none');
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await press('3');
  await expect.poll(() => scale('3')).toBe('none');
  await expect(page.getByRole('button', { name: '3', exact: true })).toHaveCSS(
    'user-select',
    'none',
  );

  await press('Reveal cards');
  await expect
    .poll(() =>
      page
        .getByRole('region', { name: 'Round controls' })
        .evaluate((element) => element.getAnimations().length),
    )
    .toBe(0);

  const button = await page.getByRole('button', { name: 'Reset round' }).boundingBox();
  const icon = await page.getByRole('button', { name: 'Reset round' }).locator('svg').boundingBox();
  const above = icon!.y - button!.y;
  const below = button!.y + button!.height - (icon!.y + icon!.height);
  expect(Math.abs(above - below)).toBeLessThanOrEqual(0.5);
});

test('an unknown page leads back home', async ({ page }) => {
  await page.goto('/no/such/page');
  await expect(page.getByRole('heading', { name: 'Page not found', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to home' }).click();
  await expect(page.getByLabel('Room title')).toBeVisible();
});

test('a proxy error page reads as a plain message', async ({ page }) => {
  await page.route('**/api/rooms**', (route) =>
    route.fulfill({
      status: 502,
      contentType: 'text/html',
      body: '<h1>Bad Gateway</h1>',
    }),
  );
  await page.goto('/');
  await page.getByLabel('Room title').fill('Sprint planning');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Could not create room');

  await page.goto('/abcdefgh');
  await expect(
    page.getByRole('heading', { name: 'Could not load room', exact: true }),
  ).toBeVisible();
});

test('the room link can be copied', async ({ page, context, browserName, isMobile }) => {
  test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-specific.');
  test.skip(isMobile, 'Phones copy from the menu.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  const header = page.locator('header');
  const invite = page.getByText('Invite your team').locator('..');

  await header.getByRole('button', { name: 'Copy room link' }).click();
  await expect(header.getByRole('button', { name: 'Link copied' })).toBeVisible();
  await expect(header.getByRole('status')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(invite.getByRole('button', { name: 'Copy room link' })).toBeVisible();
  await expect(invite.getByRole('status')).toBeEmpty();

  await page.evaluate(() => navigator.clipboard.writeText(''));
  await invite.getByRole('button', { name: 'Copy room link' }).click();
  await expect(invite.getByRole('button', { name: 'Link copied' })).toBeVisible();
  await expect(invite.getByRole('status')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await expect(page.getByRole('button', { name: 'Copy room link' })).toHaveCount(2);
});

test('phones copy the room link from the menu', async ({ page, context, isMobile }) => {
  test.skip(!isMobile, 'Desktops copy from the header.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  await expect(page.locator('header').getByRole('button', { name: 'Copy room link' })).toBeHidden();

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.getByRole('menuitem', { name: 'Copy room link' }).click();
  await expect(page.getByRole('menuitem', { name: 'Link copied' })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
});

test("the server's errors show without a full stop", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    expect((await page.request.post('/api/rooms', { data: { title: 'Sprint' } })).status()).toBe(
      201,
    );
  }

  await page.goto('/');
  await page.getByLabel('Room title').fill('Sprint planning');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Too many rooms created. Try again shortly');
});

test('a room needs a title before it is created', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a room title');
  await expect(page.getByLabel('Room title')).toHaveAttribute('aria-invalid', 'true');
  await expect(page).toHaveURL('/');

  await page.getByLabel('Room title').fill('Retro');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('a room title is checked for length and control characters before it is sent', async ({
  page,
}) => {
  const posts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/rooms') {
      posts.push(request.url());
    }
  });

  await page.goto('/');
  const title = page.getByLabel('Room title');
  const create = page.getByRole('button', { name: 'Create room' });

  for (const invalid of ['界'.repeat(101), `  ${'😀'.repeat(101)}  `, 'Retro\u0007']) {
    await title.fill(invalid);
    await create.click();
    await expect(page.getByRole('alert')).toHaveText(
      'Use 1–100 characters without control characters',
    );
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL('/');
  }

  expect(posts).toHaveLength(0);

  await title.fill(`  ${'界'.repeat(100)}  `);
  await create.click();
  await expect(page).toHaveURL(/\/[a-z0-9]{8}$/);
  expect(posts).toHaveLength(1);
});

test('only prose, what someone types and errors can be selected', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create room' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('user-select', 'text');
  await expect(page.getByText('Estimation deck')).toHaveCSS('user-select', 'none');
  await expect(page.getByLabel('Room title')).toHaveCSS('user-select', 'text');
  await expect(page.getByRole('alert')).toHaveCSS('user-select', 'text');
});

test('the legal pages the server names are linked from every page but the room', async ({
  page,
}) => {
  const linked = async () => {
    await expect(page.getByRole('link', { name: 'Legal notice' })).toHaveAttribute(
      'href',
      'https://example.com/legal-notice',
    );

    await expect(page.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute(
      'href',
      'https://example.com/privacy?lang=en&v=2',
    );
  };

  await page.goto('/');
  await linked();
  const first = (await page.getByRole('link', { name: 'Legal notice' }).boundingBox())!;
  const last = (await page.getByRole('link', { name: 'Privacy policy' }).boundingBox())!;
  expect((first.x + last.x + last.width) / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
  const url = await createRoom(page);
  await page.goto(url);
  await linked();
  await join(page, url, 'Alice');
  await expect(page.getByRole('link', { name: 'Legal notice' })).toHaveCount(0);
  await page.goto('/missing/page');
  await linked();
});

test('the room menu links to the project, its issues and the legal pages', async ({
  page,
  isMobile,
}) => {
  const url = await createRoom(page);
  await join(page, url, 'Alice');
  await page.getByRole('button', { name: 'Menu' }).click();
  const links = {
    'Report a problem': 'https://github.com/lgraubner/planning-poker/issues/new',
    'Source on GitHub': 'https://github.com/lgraubner/planning-poker',
    'Legal notice': 'https://example.com/legal-notice',
    'Privacy policy': 'https://example.com/privacy?lang=en&v=2',
  };
  await expect(page.getByRole('menuitem')).toHaveText([
    ...(isMobile ? ['Copy room link'] : []),
    ...Object.keys(links),
  ]);

  for (const [name, href] of Object.entries(links)) {
    const item = page.getByRole('menuitem', { name });
    await expect(item).toHaveAttribute('href', href);
    await expect(item).toHaveAttribute('target', '_blank');
  }
});
