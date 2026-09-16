import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // packages/shared is tested from here rather than getting its own runner:
    // apps/mobile must NOT gain a `test` script, because package.json's scripts
    // block is an EAS fingerprint input and adding one silently breaks OTA
    // delivery (see project-ota-fingerprint-inputs). Web already has vitest, so
    // the shared package tests run where a runner already exists.
    include: ['src/**/*.test.ts', '../packages/shared/src/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, 'src')}/`,
      '@shared/': `${path.resolve(__dirname, '../packages/shared/src')}/`,
    },
  },
});
