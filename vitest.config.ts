import { defineConfig } from 'vitest/config';
import { techniqueImagesPlugin } from './scripts/techniqueImagesPlugin.mjs';

export default defineConfig({
  plugins: [techniqueImagesPlugin()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
