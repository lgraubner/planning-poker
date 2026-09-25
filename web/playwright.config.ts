import { defineConfig, devices } from '@playwright/test';

const port = 8182;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI keeps an HTML report (with traces of failures) as the run's artifact.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  // Test the real binary: embedded build, Go routes, and WebSockets.
  webServer: {
    command: 'vite build && go run ../cmd/server',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: String(port), CLIENT_IP_HEADER: 'X-Forwarded-For' },
  },
});
