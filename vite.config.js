import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/orbit-gesture-globe/' : '/',
  plugins: [react()],
  resolve: { dedupe: ['three'] },
  build: { chunkSizeWarningLimit: 1600 },
});
