import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@line-crm/line-sdk': path.resolve(__dirname, '../../packages/line-sdk/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
