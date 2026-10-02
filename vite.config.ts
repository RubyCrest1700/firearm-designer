import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
