import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'MEOW_');
  const proxy = { '/api': { target: `http://127.0.0.1:${env.MEOW_PORT || '3000'}`, changeOrigin: false } };
  return {
    plugins: [react()],
    server: { host: '127.0.0.1', port: 8080, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
    build: { outDir: 'build', emptyOutDir: true },
  };
});
