import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: false,
    proxy: {
      // Proxy DoltHub API to avoid CORS in dev
      '/dolthub': {
        target: 'https://www.dolthub.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/dolthub/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
