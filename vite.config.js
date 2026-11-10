import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createBobHandler } from './server/bobProxy.js';

// Dev/preview use the same Bob proxy as the production server (server/index.js).
// BOB_API_URL comes from the shell env or an untracked .env.local.
function bobProxy(env) {
  const handler = createBobHandler(env);
  return {
    name: 'bob-api-proxy',
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'BOB_'), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('BOB_'))) };
  return {
    plugins: [react(), bobProxy(env)],
    server: { port: 5173 },
    build: { outDir: 'dist' },
    test: { environment: 'jsdom', globals: true, setupFiles: ['./src/setupTests.js'] },
  };
});
