import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

// diagram-js & its dependency tree are externalized (peer/external),
// so they don't end up duplicated in the consumer bundle.
const EXTERNAL = [
  'diagram-js',
  /^diagram-js\//,
  'tiny-svg',
  'min-dom',
  'min-dash',
  'didi',
  'object-refs',
  'inherits-browser',
  'path-intersection',
  'clsx',
  '@miragon/event-storming-schema-model',
  '@miragon/event-storming-dsl',
];

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
      cssFileName: 'event-storming',
    },
    rollupOptions: {
      external: EXTERNAL,
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts'],
      rollupTypes: true,
    }),
  ],
});
