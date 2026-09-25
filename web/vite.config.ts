/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), tailwindcss(), react()],
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
