import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);

/** @type {import('next').NextConfig} */
export default {
  agentRules: false,
  turbopack: {
    root: resolve(import.meta.dirname, '../..'),
    resolveAlias: {
      'node:module': { browser: '@react-cordis/vite/node-module-stub' },
    },
    rules: {
      '*': {
        condition: { all: ['browser', { path: /@deepseek-ai\/cordis-plugin-loader\/lib\/index\.js$/ }] },
        loaders: [require.resolve('./scripts/loader-browser.cjs')],
      },
    },
  },
};
