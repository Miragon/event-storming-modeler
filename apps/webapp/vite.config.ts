import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const r = (p: string): string => resolve(__dirname, p);
const portlessUrl = process.env.PORTLESS_URL || undefined;

const portlessBanner = (url: string): Plugin => ({
  name: 'portless-url-banner',
  configureServer(server) {
    const printUrls = server.printUrls.bind(server);
    server.printUrls = () => {
      printUrls();
      server.config.logger.info(
        `  \x1b[32m➜\x1b[0m  \x1b[1mPortless\x1b[0m: \x1b[36m${url}\x1b[0m`,
      );
    };
  },
});

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@miragon/event-storming-renderer/assets/event-storming.css',
        replacement: r('../../packages/renderer/src/assets/event-storming.css'),
      },
      {
        find: '@miragon/event-storming-renderer',
        replacement: r('../../packages/renderer/src/index.ts'),
      },
      {
        find: '@miragon/event-storming-schema-model',
        replacement: r('../../packages/schema-model/src/index.ts'),
      },
      { find: '@miragon/event-storming-dsl', replacement: r('../../packages/dsl/src/index.ts') },
      {
        find: '@miragon/event-storming-transforms',
        replacement: r('../../packages/transforms/src/index.ts'),
      },
    ],
  },
  plugins: portlessUrl ? [portlessBanner(portlessUrl)] : [],
  server: {
    port: 5180,
    strictPort: true,
    open: portlessUrl ?? false,
    allowedHosts: ['.localhost'],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
