import { writeFileSync } from 'node:fs';
import type { Page } from '../../../../web/node_modules/@playwright/test/index.js';
import { test } from '../../../../web/e2e/fixtures';

export type Frame = { dir: 'sent' | 'received'; message: Record<string, unknown> };

export function recordFrames(page: Page) {
  const frames: Frame[] = [];
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) =>
      frames.push({ dir: 'sent', message: JSON.parse(String(payload)) }),
    );
    socket.on('framereceived', ({ payload }) =>
      frames.push({ dir: 'received', message: JSON.parse(String(payload)) }),
    );
  });

  return frames;
}

export const snapshots = (frames: Frame[]) =>
  frames.filter((f) => f.dir === 'received' && f.message.type === 'snapshot').map((f) => f.message);

export async function shot(page: Page, name: string) {
  const path = test.info().outputPath(`${name}.png`);
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  await page.screenshot({ path });
  await test.info().attach(name, { path, contentType: 'image/png' });
}

export async function saveFrames(name: string, frames: Frame[]) {
  const path = test.info().outputPath(`${name}.frames.json`);
  writeFileSync(path, JSON.stringify(frames, null, 2));
  await test.info().attach(`${name}.frames.json`, { path, contentType: 'application/json' });
}
