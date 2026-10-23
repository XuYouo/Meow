import { fileURLToPath, URL } from 'url';
import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { tmpdir } from 'os';
import { devLogger } from '@meituan-nocode/vite-plugin-dev-logger';
import {
  devHtmlTransformer,
  prodHtmlTransformer,
} from '@meituan-nocode/vite-plugin-nocode-html-transformer';
import react from '@vitejs/plugin-react';

const CHAT_VARIABLE = process.env.CHAT_VARIABLE || '';
const PUBLIC_PATH = process.env.PUBLIC_PATH || '';

const isProdEnv = process.env.NODE_ENV === 'production';
const publicPath = (isProdEnv && CHAT_VARIABLE)
  ? PUBLIC_PATH + '/' + CHAT_VARIABLE
  : PUBLIC_PATH + '/';
const outDir = (isProdEnv && CHAT_VARIABLE) ? 'build/' + CHAT_VARIABLE : 'build';
const plugins = isProdEnv
  ? CHAT_VARIABLE
    ? [react(), prodHtmlTransformer(CHAT_VARIABLE)]
    : [react()]
  : [
      devLogger({
        dirname: resolve(tmpdir(), '.nocode-dev-logs'),
        maxFiles: '3d',
      }),
      react(),
      devHtmlTransformer(CHAT_VARIABLE),
    ];

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxy = {
    '/api': {
      target: `http://127.0.0.1:${env.PORT || 3000}`,
      changeOrigin: true,
    },
  };

  return {
    server: {
      host: '::',
      port: '8080',
      proxy,
      hmr: {
        overlay: false,
      },
    },
    preview: {
      proxy,
    },
    plugins,
    base: publicPath,
    build: {
      outDir,
    },
    optimizeDeps: {
      include: ['sql.js'],
    },
    assetsInclude: ['**/*.wasm'],
    resolve: {
      alias: [
        {
          find: '@',
          replacement: fileURLToPath(new URL('./src', import.meta.url)),
        },
        {
          find: 'lib',
          replacement: resolve(__dirname, 'lib'),
        },
      ],
    },
  };
});
