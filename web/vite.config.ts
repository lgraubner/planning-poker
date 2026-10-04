/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    tailwindcss(),
    react(),
    // The Go server puts the operator's legal pages in the head. Vite serves the page in
    // development, so it shows example ones.
    {
      name: 'example-legal-links',
      apply: 'serve',
      transformIndexHtml: () =>
        [
          ['legal-notice', 'https://example.com/legal-notice'],
          ['privacy-policy', 'https://example.com/privacy-policy'],
        ].map(([name, content]) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' })),
    },
  ],
  build: { outDir: '../internal/webui/dist', emptyOutDir: true },
  // Unit tests live next to the code; Playwright owns e2e/.
  test: { include: ['src/**/*.test.{ts,tsx}'] },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:8080', ws: true },
      '/healthz': 'http://localhost:8080',
    },
  },
});
