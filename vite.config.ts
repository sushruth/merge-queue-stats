import preact from '@preact/preset-vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/',
  plugins: [preact()],
  test: {
    environment: 'node',
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
  },
});
