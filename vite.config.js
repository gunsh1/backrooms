import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    open: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
  },
});
