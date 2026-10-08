import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** In dev, /noelops/ opens NoelOps' page (public/noelops/index.html), as Firebase Hosting does live. */
const noelops = {
  name: 'noelops-index',
  configureServer(server: { middlewares: { use: (fn: (req: { url?: string }, res: unknown, next: () => void) => void) => void } }) {
    server.middlewares.use((req, _res, next) => {
      if (req.url === '/noelops' || req.url === '/noelops/' || req.url?.startsWith('/noelops/?')) req.url = '/noelops/index.html';
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss(), noelops],
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
