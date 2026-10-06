import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 20000 },
} as never);
