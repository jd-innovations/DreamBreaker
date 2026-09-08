import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Deliberately narrow: mobile has no test runner set up at all yet, so this
// only needs to resolve the aliases used by pure, react-native-free modules
// like src/lib/shareContent.ts. Anything importing react-native itself is out
// of scope here — see share.ts's thin wrapper around shareContent.ts, kept
// separate specifically so the message-building logic stays testable without
// an RN test environment (jest-expo, native mocks, etc.).
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@/': `${path.resolve(__dirname, 'src')}/`,
      '@shared/': `${path.resolve(__dirname, '../../packages/shared/src')}/`,
    },
  },
});
