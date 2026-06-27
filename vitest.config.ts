import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      include: [
        'src/lib/geo.ts',
        'src/lib/overlay.ts',
        'src/lib/refLayers.ts',
        'src/lib/refLayers.demo.ts',
        'src/lib/credito.ts',
        'src/lib/app.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 90,
      },
    },
  },
});
