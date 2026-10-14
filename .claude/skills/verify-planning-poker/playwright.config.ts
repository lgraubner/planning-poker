// Imported by path: this file sits outside web/, where Node would not find the package
import { defineConfig, devices } from '../../../web/node_modules/@playwright/test/index.js';

const out = process.env.VERIFY_OUT!;

// Drives the instance verify.sh launched; never starts a server of its own
export default defineConfig({
  testDir: process.env.VERIFY_TESTDIR,
  testMatch: '*.spec.ts',
  outputDir: `${out}/results`,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: `${out}/report` }]],
  use: { baseURL: process.env.VERIFY_URL, trace: 'on', screenshot: 'on' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
