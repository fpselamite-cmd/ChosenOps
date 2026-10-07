import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Admin "view as" previews must never write: these shims wrap the SDK's write calls.
    alias: process.env.VITEST ? [] : [
      { find: /^firebase\/firestore$/, replacement: here('./src/lib/guard/firestore.ts') },
      { find: /^firebase\/database$/, replacement: here('./src/lib/guard/database.ts') },
    ],
  },
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 20000 },
} as never);
